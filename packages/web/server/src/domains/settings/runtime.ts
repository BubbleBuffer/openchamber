/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SettingsRuntimeDeps, SettingsRuntime } from "./types.js";
import { createProjectIdFromPath } from "../projects/index.js";

const DEFAULT_NOTIFICATION_TEMPLATES = {
  completion: { title: "{agent_name} is ready", message: "{model_name} completed the task" },
  error: { title: "Tool error", message: "{last_message}" },
  question: { title: "Input needed", message: "{last_message}" },
  subtask: { title: "{agent_name} is ready", message: "{model_name} completed the task" },
};

const ensureNotificationTemplateShape = (templates: any): { templates: any; changed: boolean } => {
  const input = templates && typeof templates === "object" ? templates : {};
  let changed = false;
  const next: Record<string, { title: string; message: string }> = {};

  for (const event of Object.keys(DEFAULT_NOTIFICATION_TEMPLATES)) {
    const currentEntry = input[event];
    const base = (DEFAULT_NOTIFICATION_TEMPLATES as any)[event];
    const currentTitle = typeof currentEntry?.title === "string" ? currentEntry.title : base.title;
    const currentMessage = typeof currentEntry?.message === "string" ? currentEntry.message : base.message;
    if (!currentEntry || typeof currentEntry.title !== "string" || typeof currentEntry.message !== "string") {
      changed = true;
    }
    next[event] = { title: currentTitle, message: currentMessage };
  }

  return { templates: next, changed };
};

export function createSettingsRuntime(deps: SettingsRuntimeDeps): SettingsRuntime {
  const {
    fsPromises,
    path,
    crypto,
    SETTINGS_FILE_PATH,
    sanitizeProjects,
    sanitizeSettingsUpdate,
    mergePersistedSettings,
    normalizeSettingsPaths,
    normalizeStringArray,
    formatSettingsResponse,
    resolveDirectoryCandidate,
  } = deps;

  let persistSettingsLock: Promise<any> = Promise.resolve();

  // Orphan recovery is a one-shot best-effort scan: when orphans can't be
  // matched on first pass they stay on disk and every subsequent settings
  // read would re-scan them. In-process (Electron) this runs in the main
  // event loop, so hitting it 3+ times/second from fs/list, path, etc.
  // turns into perceptible UI jank for ~10-15 seconds after launch.
  // Cache the outcome for this process lifetime.
  let orphanRecoveryDone = false;

  const PROJECTS_ROOT_DIR = path.join(path.dirname(SETTINGS_FILE_PATH), "projects");
  const PROJECT_ICONS_DIR = path.join(path.dirname(SETTINGS_FILE_PATH), "project-icons");

  const sha1Hex = (value: string): string => crypto.createHash("sha1").update(value).digest("hex");
  const projectIconBaseName = (projectId: string): string => `project-${sha1Hex(projectId)}`;
  const PROJECT_ICON_EXTENSIONS = ["png", "jpg", "svg", "webp", "ico"];

  const readJsonFile = async (filePath: string): Promise<any | null> => {
    try {
      const raw = await fsPromises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (error) {
      if (error && typeof error === "object" && (error as any).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  };

  const writeJsonFile = async (filePath: string, value: any): Promise<void> => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  };

  const uniqueStrings = (values: unknown[]): string[] =>
    Array.from(new Set(values.filter((value): value is string => typeof value === "string" && value.trim().length > 0)));

  const mergeByKey = (
    oldItems: any[],
    newItems: any[],
    getKey: (item: any) => string | null | undefined,
  ): any[] => {
    const result: any[] = [];
    const seen = new Set<string>();
    for (const item of [...(Array.isArray(newItems) ? newItems : []), ...(Array.isArray(oldItems) ? oldItems : [])]) {
      if (!item || typeof item !== "object") continue;
      const key = getKey(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(item);
    }
    return result;
  };

  const remapPlanPaths = (entries: any[], fromDir: string, toDir: string): any[] => {
    if (!Array.isArray(entries) || !fromDir || !toDir || fromDir === toDir) {
      return Array.isArray(entries) ? entries : [];
    }
    return entries.map((entry: any) => {
      if (!entry || typeof entry !== "object" || typeof entry.path !== "string") {
        return entry;
      }
      const trimmedPath = entry.path.trim();
      if (!trimmedPath.startsWith(fromDir)) {
        return entry;
      }
      return {
        ...entry,
        path: `${toDir}${trimmedPath.slice(fromDir.length)}`,
      };
    });
  };

  const mergeProjectConfigData = ({
    oldConfig,
    newConfig,
    oldStorageDir,
    newStorageDir,
    projectPath,
  }: {
    oldConfig: any;
    newConfig: any;
    oldStorageDir: string;
    newStorageDir: string;
    projectPath: string;
  }): any => {
    const oldValue = oldConfig && typeof oldConfig === "object" ? { ...oldConfig } : {};
    const newValue = newConfig && typeof newConfig === "object" ? { ...newConfig } : {};
    delete oldValue["scheduled" + "Tasks"];
    delete newValue["scheduled" + "Tasks"];
    const oldPlanFiles = remapPlanPaths(oldValue.projectPlanFiles, oldStorageDir, newStorageDir);
    const newPlanFiles = remapPlanPaths(newValue.projectPlanFiles, oldStorageDir, newStorageDir);
    const oldNotes = typeof oldValue.projectNotes === "string" ? oldValue.projectNotes : "";
    const newNotes = typeof newValue.projectNotes === "string" ? newValue.projectNotes : "";

    return {
      ...oldValue,
      ...newValue,
      ...(typeof projectPath === "string" && projectPath.trim().length > 0 ? { projectPath } : {}),
      ...(uniqueStrings([
        ...(Array.isArray(oldValue["setup-worktree"]) ? oldValue["setup-worktree"] : []),
        ...(Array.isArray(newValue["setup-worktree"]) ? newValue["setup-worktree"] : []),
      ]).length > 0
        ? {
            "setup-worktree": uniqueStrings([
              ...(Array.isArray(oldValue["setup-worktree"]) ? oldValue["setup-worktree"] : []),
              ...(Array.isArray(newValue["setup-worktree"]) ? newValue["setup-worktree"] : []),
            ]),
          }
        : {}),
      ...(oldNotes || newNotes ? { projectNotes: newNotes || oldNotes } : {}),
      ...(mergeByKey(oldValue.projectTodos, newValue.projectTodos, (item: any) => item.id).length > 0
        ? { projectTodos: mergeByKey(oldValue.projectTodos, newValue.projectTodos, (item: any) => item.id) }
        : {}),
      ...(mergeByKey(oldValue.projectActions, newValue.projectActions, (item: any) => item.id).length > 0
        ? { projectActions: mergeByKey(oldValue.projectActions, newValue.projectActions, (item: any) => item.id) }
        : {}),
      ...(mergeByKey(oldPlanFiles, newPlanFiles, (item: any) => item.id || item.path).length > 0
        ? { projectPlanFiles: mergeByKey(oldPlanFiles, newPlanFiles, (item: any) => item.id || item.path) }
        : {}),
      ...(typeof newValue.projectActionsPrimaryId === "string" && newValue.projectActionsPrimaryId.trim().length > 0
        ? { projectActionsPrimaryId: newValue.projectActionsPrimaryId }
        : typeof oldValue.projectActionsPrimaryId === "string" && oldValue.projectActionsPrimaryId.trim().length > 0
          ? { projectActionsPrimaryId: oldValue.projectActionsPrimaryId }
          : {}),
    };
  };

  const moveDirectoryContents = async (fromDir: string, toDir: string): Promise<void> => {
    try {
      const entries = await fsPromises.readdir(fromDir, { withFileTypes: true });
      await fsPromises.mkdir(toDir, { recursive: true });

      for (const entry of entries) {
        const fromPath = path.join(fromDir, entry.name);
        const toPath = path.join(toDir, entry.name);
        if (entry.isDirectory()) {
          await moveDirectoryContents(fromPath, toPath);
          continue;
        }
        try {
          await fsPromises.access(toPath);
        } catch {
          await fsPromises.rename(fromPath, toPath);
        }
      }

      await fsPromises.rm(fromDir, { recursive: true, force: true });
    } catch (error) {
      if (!(error && typeof error === "object" && (error as any).code === "ENOENT")) {
        throw error;
      }
    }
  };

  const migrateProjectIconFiles = async ({ oldId, newId }: { oldId: string; newId: string }): Promise<void> => {
    if (!oldId || !newId || oldId === newId) {
      return;
    }

    const oldBase = projectIconBaseName(oldId);
    const newBase = projectIconBaseName(newId);

    await fsPromises.mkdir(PROJECT_ICONS_DIR, { recursive: true });

    for (const ext of PROJECT_ICON_EXTENSIONS) {
      const oldPath = path.join(PROJECT_ICONS_DIR, `${oldBase}.${ext}`);
      const newPath = path.join(PROJECT_ICONS_DIR, `${newBase}.${ext}`);
      try {
        await fsPromises.access(oldPath);
      } catch (error) {
        if (error && typeof error === "object" && (error as any).code === "ENOENT") {
          continue;
        }
        throw error;
      }

      try {
        await fsPromises.access(newPath);
      } catch {
        await fsPromises.rename(oldPath, newPath);
        continue;
      }

      await fsPromises.rm(oldPath, { force: true });
    }
  };

  const migrateProjectScopedStorage = async ({
    oldId,
    newId,
    projectPath,
  }: {
    oldId: string;
    newId: string;
    projectPath: string;
  }): Promise<void> => {
    if (!oldId || !newId || oldId === newId) {
      return;
    }

    const oldConfigPath = path.join(PROJECTS_ROOT_DIR, `${oldId}.json`);
    const newConfigPath = path.join(PROJECTS_ROOT_DIR, `${newId}.json`);
    const oldStorageDir = path.join(PROJECTS_ROOT_DIR, oldId);
    const newStorageDir = path.join(PROJECTS_ROOT_DIR, newId);

    const [oldConfig, newConfig] = await Promise.all([readJsonFile(oldConfigPath), readJsonFile(newConfigPath)]);

    if (oldConfig || newConfig) {
      const merged = mergeProjectConfigData({
        oldConfig,
        newConfig,
        oldStorageDir,
        newStorageDir,
        projectPath,
      });
      await writeJsonFile(newConfigPath, merged);
    }

    await moveDirectoryContents(oldStorageDir, newStorageDir);
    await fsPromises.rm(oldConfigPath, { force: true });
  };

  const migrateSettingsToDeterministicProjectIds = async (
    current: any,
  ): Promise<{ settings: any; changed: boolean }> => {
    const settings = current && typeof current === "object" ? current : {};
    const projects = sanitizeProjects(settings.projects) || [];
    if (projects.length === 0) {
      return { settings, changed: false };
    }

    let changed = false;
    const projectIdMap = new Map<string, string>();
    const nextProjects: any[] = [];

    for (const project of projects as any[]) {
      const canonicalId = createProjectIdFromPath(project.path as string);
      const nextId = (canonicalId as string) || project.id;
      projectIdMap.set(project.id as string, nextId as string);
      if (nextId !== project.id) {
        changed = true;
        await migrateProjectScopedStorage({ oldId: project.id as string, newId: nextId as string, projectPath: project.path as string });
        await migrateProjectIconFiles({ oldId: project.id as string, newId: nextId as string });
      }
      nextProjects.push({ ...project, id: nextId });
    }

    if (!orphanRecoveryDone) {
      orphanRecoveryDone = true; // set before await to close races under concurrent settings reads
      try {
        await recoverOrphanProjectFiles(nextProjects);
      } catch (error) {
        console.warn("[projects] Orphan recovery failed, continuing startup:", error);
      }
    }

    if (!changed) {
      return { settings, changed: false };
    }

    const currentActiveId = typeof settings.activeProjectId === "string" ? settings.activeProjectId : "";
    const nextActiveProjectId =
      projectIdMap.get(currentActiveId) || currentActiveId || nextProjects[0]?.id;

    return {
      settings: {
        ...settings,
        projects: nextProjects,
        ...(nextActiveProjectId ? { activeProjectId: nextActiveProjectId } : {}),
      },
      changed: true,
    };
  };

  // Orphan files are project jsons left behind from earlier random-UUID project
  // ids (they have no projectPath field and are not referenced by settings).
  // For each canonical project whose current config is empty (lost during the
  // earlier id churn), try to find a single orphan whose setup-worktree command
  // patterns uniquely match the project's basename and merge it in.
  const recoverOrphanProjectFiles = async (canonicalProjects: any[]): Promise<void> => {
    let entries: any[];
    try {
      entries = await fsPromises.readdir(PROJECTS_ROOT_DIR, { withFileTypes: true });
    } catch (error) {
      if (error && typeof error === "object" && (error as any).code === "ENOENT") return;
      throw error;
    }

    const canonicalIds = new Set(canonicalProjects.map((project: any) => project.id));
    const orphanFiles = entries
      .filter((entry: any) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry: any) => entry.name.replace(/\.json$/, ""))
      .filter((id: string) => id && !id.startsWith("path_") && !canonicalIds.has(id));

    if (orphanFiles.length === 0) return;

    console.warn(`[projects] Found ${orphanFiles.length} orphan project config(s) without projectPath.`);

    const orphans: Array<{ orphanId: string; filePath: string; content: any }> = [];
    for (const orphanId of orphanFiles) {
      const filePath = path.join(PROJECTS_ROOT_DIR, `${orphanId}.json`);
      const content = await readJsonFile(filePath);
      if (!content) continue;
      const hasContent = [
        typeof content.projectNotes === "string" && content.projectNotes.trim().length > 0,
        Array.isArray(content.projectTodos) && content.projectTodos.length > 0,
        Array.isArray(content.projectActions) && content.projectActions.length > 0,
        Array.isArray(content["setup-worktree"]) && content["setup-worktree"].length > 0,
        Array.isArray(content.projectPlanFiles) && content.projectPlanFiles.length > 0,
      ].some(Boolean);
      if (!hasContent) continue;
      orphans.push({ orphanId, filePath, content });
    }

    if (orphans.length === 0) return;

    const basenameOf = (projectPath: string): string => {
      if (typeof projectPath !== "string") return "";
      const normalized = projectPath.replace(/\\/g, "/").replace(/\/+$/g, "");
      const idx = normalized.lastIndexOf("/");
      return (idx >= 0 ? normalized.slice(idx + 1) : normalized).toLowerCase();
    };

    const extractRootRelPaths = (orphan: { content: any }): string[] => {
      const commands = [
        ...(Array.isArray(orphan.content["setup-worktree"]) ? orphan.content["setup-worktree"] : []),
        ...(Array.isArray(orphan.content.projectActions)
          ? orphan.content.projectActions.map((a: any) => (typeof a?.command === "string" ? a.command : ""))
          : []),
      ].filter((s) => typeof s === "string");
      const results = new Set<string>();
      const re = /\$(?:\{)?ROOT_(?:PROJECT|WORKTREE)_PATH\}?\/([A-Za-z0-9._/-]+)/g;
      for (const cmd of commands) {
        let match;
        while ((match = re.exec(cmd)) !== null) {
          results.add(match[1]);
        }
      }
      return Array.from(results);
    };

    const fileExistsInProject = async (projectPath: string, relPath: string): Promise<boolean> => {
      try {
        await fsPromises.access(path.join(projectPath, relPath));
        return true;
      } catch {
        return false;
      }
    };

    const orphanMatchesProject = async (orphan: { content: any }, project: any): Promise<boolean> => {
      if (typeof project.path !== "string" || !project.path.trim()) return false;
      const rels = extractRootRelPaths(orphan);
      for (const rel of rels) {
        if (await fileExistsInProject(project.path, rel)) {
          return true;
        }
      }
      const name = basenameOf(project.path);
      if (!name) return false;
      const haystacks = [
        ...(Array.isArray(orphan.content["setup-worktree"]) ? orphan.content["setup-worktree"] : []),
        ...(Array.isArray(orphan.content.projectActions)
          ? orphan.content.projectActions.map((a: any) => `${a?.name || ""} ${a?.command || ""}`)
          : []),
      ]
        .join(" ")
        .toLowerCase();
      return haystacks.includes(name);
    };

    const matches = new Map<string, typeof orphans>();
    for (const orphan of orphans) {
      const matchedProjects: any[] = [];
      for (const project of canonicalProjects) {
        if (await orphanMatchesProject(orphan, project)) {
          matchedProjects.push(project);
        }
      }
      if (matchedProjects.length === 1) {
        const project = matchedProjects[0];
        const list = matches.get(project.id) || [];
        list.push(orphan);
        matches.set(project.id, list);
      }
    }

    const orphansConsumed = new Set<string>();
    for (const [projectId, orphansForProject] of matches.entries()) {
      const project = canonicalProjects.find((p: any) => p.id === projectId);
      if (!project) continue;
      const targetPath = path.join(PROJECTS_ROOT_DIR, `${project.id}.json`);

      for (const orphan of orphansForProject) {
        const targetExisting = (await readJsonFile(targetPath)) || {};
        const merged = mergeProjectConfigData({
          oldConfig: orphan.content,
          newConfig: targetExisting,
          oldStorageDir: path.join(PROJECTS_ROOT_DIR, orphan.orphanId),
          newStorageDir: path.join(PROJECTS_ROOT_DIR, project.id),
          projectPath: project.path,
        });
        await writeJsonFile(targetPath, merged);
        await moveDirectoryContents(
          path.join(PROJECTS_ROOT_DIR, orphan.orphanId),
          path.join(PROJECTS_ROOT_DIR, project.id),
        );
        await fsPromises.rm(orphan.filePath, { force: true });
        orphansConsumed.add(orphan.orphanId);
        console.log(`[projects] Recovered orphan ${orphan.orphanId} -> ${project.id} (${project.path})`);
      }
    }

    const remaining = orphans.filter((orphan) => !orphansConsumed.has(orphan.orphanId));
    if (remaining.length > 0) {
      console.warn(
        `[projects] ${remaining.length} orphan project file(s) could not be auto-matched: ${remaining
          .map((o) => o.orphanId)
          .join(", ")}`,
      );
    }
  };

  const readSettingsFromDisk = async (): Promise<any> => {
    try {
      const raw = await fsPromises.readFile(SETTINGS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
      return {};
    } catch (error) {
      if (error && typeof error === "object" && (error as any).code === "ENOENT") {
        return {};
      }
      console.warn("Failed to read settings file:", error);
      return {};
    }
  };

  const writeSettingsToDisk = async (settings: any): Promise<void> => {
    try {
      await fsPromises.mkdir(path.dirname(SETTINGS_FILE_PATH), { recursive: true });
      // Atomic write: Electron main and ssh-manager read this file via plain
      // readFile + JSON.parse and silently coerce parse errors to {}. A
      // partial read during a non-atomic writeFile would make their next
      // read-modify-write wipe the settings file.
      const tmp = `${SETTINGS_FILE_PATH}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await fsPromises.writeFile(tmp, JSON.stringify(settings, null, 2), "utf8");
      await fsPromises.rename(tmp, SETTINGS_FILE_PATH);
    } catch (error) {
      console.warn("Failed to write settings file:", error);
      throw error;
    }
  };

  const validateProjectEntries = async (projects: any[]): Promise<any[]> => {
    console.log(`[validateProjectEntries] Starting validation for ${projects.length} projects`);

    if (!Array.isArray(projects)) {
      console.warn("[validateProjectEntries] Input is not an array, returning empty");
      return [];
    }

    const validations = projects.map(async (project: any) => {
      if (!project || typeof project.path !== "string" || project.path.length === 0) {
        console.error("[validateProjectEntries] Invalid project entry: missing or empty path", project);
        return null;
      }
      try {
        const stats = await fsPromises.stat(project.path);
        if (!stats.isDirectory()) {
          console.error(`[validateProjectEntries] Project path is not a directory: ${project.path}`);
          return null;
        }
        return project;
      } catch (error) {
        const err = error as any;
        console.error(
          `[validateProjectEntries] Failed to validate project "${project.path}": ${err.code || err.message || err}`,
        );
        if (err && typeof err === "object" && err.code === "ENOENT") {
          console.log(`[validateProjectEntries] Removing project with ENOENT: ${project.path}`);
          return null;
        }
        console.log(`[validateProjectEntries] Keeping project despite non-ENOENT error: ${project.path}`);
        return project;
      }
    });

    const results = (await Promise.all(validations)).filter((p) => p !== null);

    console.log(`[validateProjectEntries] Validation complete: ${results.length}/${projects.length} projects valid`);
    return results;
  };

  const migrateSettingsFromLegacyLastDirectory = async (
    current: any,
  ): Promise<{ settings: any; changed: boolean }> => {
    const settings = current && typeof current === "object" ? current : {};
    const now = Date.now();

    const sanitizedProjects = sanitizeProjects(settings.projects) || [];
    let nextProjects = sanitizedProjects;
    let nextActiveProjectId =
      typeof settings.activeProjectId === "string" ? settings.activeProjectId : undefined;

    let changed = false;

    if (nextProjects.length === 0) {
      const legacy = typeof settings.lastDirectory === "string" ? settings.lastDirectory.trim() : "";
      const candidate = legacy ? resolveDirectoryCandidate(legacy) : null;

      if (candidate) {
        try {
          const stats = await fsPromises.stat(candidate);
          if (stats.isDirectory()) {
            const id = createProjectIdFromPath(candidate);
            nextProjects = [
              {
                id,
                path: candidate,
                addedAt: now,
                lastOpenedAt: now,
              },
            ];
            nextActiveProjectId = id;
            changed = true;
          }
        } catch {
          // ignore invalid lastDirectory
        }
      }
    }

    if (nextProjects.length > 0) {
      const active = nextProjects.find((project: any) => project.id === nextActiveProjectId) || null;
      if (!active) {
        nextActiveProjectId = nextProjects[0].id;
        changed = true;
      }
    } else if (nextActiveProjectId) {
      nextActiveProjectId = undefined;
      changed = true;
    }

    if (!changed) {
      return { settings, changed: false };
    }

    const merged = mergePersistedSettings(settings, {
      ...settings,
      projects: nextProjects,
      ...(nextActiveProjectId ? { activeProjectId: nextActiveProjectId } : { activeProjectId: undefined }),
    });

    return { settings: merged, changed: true };
  };

  const migrateSettingsFromLegacyThemePreferences = async (
    current: any,
  ): Promise<{ settings: any; changed: boolean }> => {
    const settings = current && typeof current === "object" ? current : {};

    const themeId = typeof settings.themeId === "string" ? settings.themeId.trim() : "";
    const themeVariant = typeof settings.themeVariant === "string" ? settings.themeVariant.trim() : "";

    const hasLight = typeof settings.lightThemeId === "string" && settings.lightThemeId.trim().length > 0;
    const hasDark = typeof settings.darkThemeId === "string" && settings.darkThemeId.trim().length > 0;

    if (hasLight && hasDark) {
      return { settings, changed: false };
    }

    const defaultLight = "flexoki-light";
    const defaultDark = "flexoki-dark";

    let nextLightThemeId = hasLight ? settings.lightThemeId : undefined;
    let nextDarkThemeId = hasDark ? settings.darkThemeId : undefined;

    if (!hasLight) {
      if (themeId && themeVariant === "light") {
        nextLightThemeId = themeId;
      } else {
        nextLightThemeId = defaultLight;
      }
    }

    if (!hasDark) {
      if (themeId && themeVariant === "dark") {
        nextDarkThemeId = themeId;
      } else {
        nextDarkThemeId = defaultDark;
      }
    }

    const merged = mergePersistedSettings(settings, {
      ...settings,
      ...(nextLightThemeId ? { lightThemeId: nextLightThemeId } : {}),
      ...(nextDarkThemeId ? { darkThemeId: nextDarkThemeId } : {}),
    });

    return { settings: merged, changed: true };
  };

  const migrateSettingsFromLegacyCollapsedProjects = async (
    current: any,
  ): Promise<{ settings: any; changed: boolean }> => {
    const settings = current && typeof current === "object" ? current : {};
    const collapsed = Array.isArray(settings.collapsedProjects)
      ? normalizeStringArray(settings.collapsedProjects)
      : [];

    if (collapsed.length === 0 || !Array.isArray(settings.projects)) {
      if (collapsed.length === 0) {
        return { settings, changed: false };
      }
      const next = { ...settings };
      delete next.collapsedProjects;
      return { settings: next, changed: true };
    }

    const set = new Set(collapsed);
    const projects = sanitizeProjects(settings.projects) || [];
    let changed = false;

    const nextProjects = projects.map((project: any) => {
      const shouldCollapse = set.has(project.id);
      if (project.sidebarCollapsed !== shouldCollapse) {
        changed = true;
        return { ...project, sidebarCollapsed: shouldCollapse };
      }
      return project;
    });

    if (!changed) {
      if (Object.prototype.hasOwnProperty.call(settings, "collapsedProjects")) {
        const next = { ...settings };
        delete next.collapsedProjects;
        return { settings: next, changed: true };
      }
      return { settings, changed: false };
    }

    const next = { ...settings, projects: nextProjects };
    delete next.collapsedProjects;
    return { settings: next, changed: true };
  };

  const migrateSettingsNotificationDefaults = async (
    current: any,
  ): Promise<{ settings: any; changed: boolean }> => {
    const settings = current && typeof current === "object" ? current : {};
    let changed = false;
    const next = { ...settings };

    if (typeof settings.notifyOnSubtasks !== "boolean") {
      next.notifyOnSubtasks = true;
      changed = true;
    }
    if (typeof settings.notifyOnCompletion !== "boolean") {
      next.notifyOnCompletion = true;
      changed = true;
    }
    if (typeof settings.notifyOnError !== "boolean") {
      next.notifyOnError = true;
      changed = true;
    }
    if (typeof settings.notifyOnQuestion !== "boolean") {
      next.notifyOnQuestion = true;
      changed = true;
    }

    const { templates, changed: templatesChanged } = ensureNotificationTemplateShape(settings.notificationTemplates);
    if (templatesChanged || !settings.notificationTemplates || typeof settings.notificationTemplates !== "object") {
      next.notificationTemplates = templates;
      changed = true;
    }

    return { settings: changed ? next : settings, changed };
  };

  const readSettingsFromDiskMigrated = async (): Promise<any> => {
    const current = await readSettingsFromDisk();
    const migration1 = await migrateSettingsFromLegacyLastDirectory(current);
    const migration2 = await migrateSettingsFromLegacyThemePreferences(migration1.settings);
    const migration3 = await migrateSettingsFromLegacyCollapsedProjects(migration2.settings);
    const migration4 = await migrateSettingsNotificationDefaults(migration3.settings);
    const migration5 = normalizeSettingsPaths(migration4.settings);
    const migration6 = await migrateSettingsToDeterministicProjectIds(migration5.settings);
    if (
      migration1.changed ||
      migration2.changed ||
      migration3.changed ||
      migration4.changed ||
      migration5.changed ||
      migration6.changed
    ) {
      await writeSettingsToDisk(migration6.settings);
    }
    return migration6.settings;
  };

  const persistSettings = async (changes: any): Promise<any> => {
    const write = persistSettingsLock.then(async () => {
      const current = await readSettingsFromDisk();
      console.log("[persistSettings] Current projects count:", Array.isArray(current.projects) ? current.projects.length : "N/A");
      const sanitized = sanitizeSettingsUpdate(changes);
      console.log("[persistSettings] Persisting with changes count:", Object.keys(changes).length);
      let next: any = mergePersistedSettings(current, sanitized);

      const normalizedState = normalizeSettingsPaths(next);
      if (normalizedState.changed) {
        next = normalizedState.settings;
      }

      const deterministicProjectIdMigration = await migrateSettingsToDeterministicProjectIds(next);
      if (deterministicProjectIdMigration.changed) {
        next = deterministicProjectIdMigration.settings;
      }

      if (Array.isArray(next.projects)) {
        console.log(`[persistSettings] Validating ${next.projects.length} projects...`);
        const validated = await validateProjectEntries(next.projects);
        console.log(`[persistSettings] After validation: ${validated.length} projects remain`);
        next = { ...next, projects: validated };
      }

      if (Array.isArray(next.projects) && next.projects.length > 0) {
        const activeId = typeof next.activeProjectId === "string" ? next.activeProjectId : "";
        const active = next.projects.find((project: any) => project.id === activeId) || null;
        if (!active) {
          console.log(`[persistSettings] Active project ID ${activeId} not found, switching to ${next.projects[0].id}`);
          next = { ...next, activeProjectId: next.projects[0].id };
        }
      } else if (next.activeProjectId) {
        console.log(`[persistSettings] No projects found, clearing activeProjectId ${next.activeProjectId}`);
        next = { ...next, activeProjectId: undefined };
      }

      await writeSettingsToDisk(next);
      console.log(`[persistSettings] Successfully saved ${next.projects?.length || 0} projects to disk`);
      return formatSettingsResponse(next);
    });

    // Keep this caller's failure observable while recovering the serial queue
    // for a later independent save.
    persistSettingsLock = write.catch(() => undefined);
    return write;
  };

  return {
    readSettingsFromDisk,
    readSettingsFromDiskMigrated,
    writeSettingsToDisk,
    persistSettings,
  };
}
