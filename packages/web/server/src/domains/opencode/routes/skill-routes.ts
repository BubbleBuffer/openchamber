import type { Express, Request, Response, NextFunction } from "express";
import {
  parseSkillsInstallRequest,
  parseSkillsInstallResponse,
  parseSkillsListResponse,
  parseSkillsRepoScanRequest,
  parseSkillsScanResponse,
  parseSkillConfigRequest,
  parseSkillDetailResponse,
  parseSkillMutationResponse,
  parseSkillNameRequest,
  parseSkillSupportingFileRequest,
  parseSkillsSupportingFileResponse,
  skillsError,
  type SkillsErrorCode,
} from "../../../contracts/skills.js";

interface SkillRoutesDeps {
  fs: typeof import("fs");
  path: typeof import("path");
  os: typeof import("os");
  resolveProjectDirectory: (req: Request) => Promise<{ directory?: any; error?: string }>;
  resolveOptionalProjectDirectory: (req: Request) => Promise<{ directory?: any; error?: string }>;
  readSettingsFromDisk: () => Promise<any>;
  sanitizeSkillCatalogs: (input: unknown) => any[];
  isUnsafeSkillRelativePath: (filePath: any) => boolean;
  refreshOpenCodeAfterConfigChange: (reason: string, options?: any) => Promise<void>;
  clientReloadDelayMs: number;
  openCodeRuntime: any;
  getOpenCodePort: () => number | null;
  getSkillSources: (name: any, directory: any, discoveredSkill?: any) => any;
  discoverSkills: (directory: any) => any[];
  createSkill: (name: any, config: any, directory: any, scope?: any) => void;
  updateSkill: (name: any, updates: any, directory: any) => void;
  deleteSkill: (name: any, directory: any) => void;
  readSkillSupportingFile: (skillDir: any, relativePath: any) => string | null;
  writeSkillSupportingFile: (skillDir: any, relativePath: any, content: string) => void;
  deleteSkillSupportingFile: (skillDir: any, relativePath: any) => void;
  SKILL_SCOPE: { USER: string; PROJECT: string };
  SKILL_DIR: string;
  getCuratedSkillsSources: () => any[];
  getCacheKey: (opts: { normalizedRepo: string; subpath: string; identityId: string }) => string;
  getCachedScan: (cacheKey: string) => any | null;
  setCachedScan: (cacheKey: string, result: any) => void;
  parseSkillRepoSource: (source: string) => { ok: true; normalizedRepo: string; effectiveSubpath?: string } | { ok: false; error: any };
  scanSkillsRepository: (opts: {
    source: string;
    subpath?: string;
    defaultSubpath?: string;
    identity?: { sshKey: string } | null;
  }) => Promise<{ ok: true; items: any[] } | { ok: false; error: any }>;
  installSkillsFromRepository: (opts: {
    source: string;
    subpath?: string;
    identity?: { sshKey: string } | null;
    scope?: string;
    targetSource?: string;
    workingDirectory?: string | null;
    userSkillDir: string;
    selections?: any[];
    conflictPolicy?: string;
   conflictDecisions?: Record<string, "skip" | "overwrite">;
  }) => Promise<{ ok: true; installed: any[]; skipped: any[] } | { ok: false; error: any }>;
  scanClawdHubPage: (opts: { cursor?: string | null }) => Promise<{ ok: true; items: any[]; nextCursor?: string } | { ok: false; error: any }>;
  installSkillsFromClawdHub: (opts: {
    scope?: string;
    targetSource?: string;
    workingDirectory?: string | null;
    userSkillDir: string;
    selections?: any[];
    conflictPolicy?: string;
   conflictDecisions?: Record<string, "skip" | "overwrite">;
  }) => Promise<{ ok: true; installed: any[]; skipped: any[] } | { ok: false; error: any }>;
  isClawdHubSource: (source: string) => boolean;
  getProfiles: () => Array<{ id: string; name: string }>;
  getProfile: (profileId: string) => { id: string; name: string; sshKey?: string } | null;
}

interface DiscoveredSkill {
  name: string;
  path: string;
  scope: string;
  source: string;
  description: string;
}

export function registerSkillRoutes(
  app: Express,
  dependencies: SkillRoutesDeps
): void {
  const {
    fs,
    path: pathModule,
    os,
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
    readSettingsFromDisk,
    sanitizeSkillCatalogs,
    isUnsafeSkillRelativePath,
    refreshOpenCodeAfterConfigChange,
    clientReloadDelayMs,
    openCodeRuntime,
    getOpenCodePort,
    getSkillSources,
    discoverSkills,
    createSkill,
    updateSkill,
    deleteSkill,
    readSkillSupportingFile,
    writeSkillSupportingFile,
    deleteSkillSupportingFile,
    SKILL_SCOPE,
    SKILL_DIR,
    getCuratedSkillsSources,
    getCacheKey,
    getCachedScan,
    setCachedScan,
    parseSkillRepoSource,
    scanSkillsRepository,
    installSkillsFromRepository,
    scanClawdHubPage,
    installSkillsFromClawdHub,
    isClawdHubSource,
    getProfiles,
    getProfile,
  } = dependencies;

  const catalogFailure = (kind: unknown): SkillsErrorCode => {
    if (kind === "conflicts") return "skills_conflict";
    if (kind === "authRequired") return "skills_auth_required";
    if (kind === "invalidSource") return "skills_invalid_request";
    return "skills_provider_error";
  };
  const safeCatalogError = (kind: unknown, fallback: string) => skillsError(catalogFailure(kind), fallback);
  const parsedSkillName = (name: unknown) => parseSkillNameRequest(name);
  const parsedSupportingFile = (name: unknown, filePath: unknown, content?: unknown) =>
    parseSkillSupportingFileRequest({ name, filePath, ...(content === undefined ? {} : { content }) });

  const findWorktreeRootForSkills = (workingDirectory: string | null): string | null => {
    if (!workingDirectory) return null;
    let current = pathModule.resolve(workingDirectory);
    while (true) {
      if (fs.existsSync(pathModule.join(current, ".git"))) {
        return current;
      }
      const parent = pathModule.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  };

  const getSkillProjectAncestors = (workingDirectory: string | null): string[] => {
    if (!workingDirectory) return [];
    const result: string[] = [];
    let current = pathModule.resolve(workingDirectory);
    const stop = findWorktreeRootForSkills(workingDirectory) || current;
    while (true) {
      result.push(current);
      if (current === stop) break;
      const parent = pathModule.dirname(current);
      if (parent === current) break;
      current = parent;
    }
    return result;
  };

  const isPathInside = (candidatePath: string | null, parentPath: string | null): boolean => {
    if (!candidatePath || !parentPath) return false;
    const normalizedCandidate = pathModule.resolve(candidatePath);
    const normalizedParent = pathModule.resolve(parentPath);
    return (
      normalizedCandidate === normalizedParent ||
      normalizedCandidate.startsWith(`${normalizedParent}${pathModule.sep}`)
    );
  };

  const inferSkillScopeAndSourceFromPath = (
    skillPath: string,
    workingDirectory: string | null
  ): { scope: string; source: string } => {
    const resolvedPath =
      typeof skillPath === "string" ? pathModule.resolve(skillPath) : "";
    const home = os.homedir();
    const source =
      resolvedPath.includes(`${pathModule.sep}.agents${pathModule.sep}skills${pathModule.sep}`)
        ? "agents"
        : resolvedPath.includes(`${pathModule.sep}.claude${pathModule.sep}skills${pathModule.sep}`)
          ? "claude"
          : "opencode";

    const projectAncestors = getSkillProjectAncestors(workingDirectory);
    const isProjectScoped = projectAncestors.some((ancestor) => {
      const candidates = [
        pathModule.join(ancestor, ".opencode"),
        pathModule.join(ancestor, ".claude", "skills"),
        pathModule.join(ancestor, ".agents", "skills"),
      ];
      return candidates.some((candidate) => isPathInside(resolvedPath, candidate));
    });

    if (isProjectScoped) {
      return { scope: SKILL_SCOPE.PROJECT, source };
    }

    const userRoots = [
      pathModule.join(home, ".config", "opencode"),
      pathModule.join(home, ".opencode"),
      pathModule.join(home, ".claude", "skills"),
      pathModule.join(home, ".agents", "skills"),
      process.env.OPENCODE_CONFIG_DIR ? pathModule.resolve(process.env.OPENCODE_CONFIG_DIR) : null,
    ].filter(Boolean) as string[];

    if (userRoots.some((root) => isPathInside(resolvedPath, root))) {
      return { scope: SKILL_SCOPE.USER, source };
    }

    return { scope: SKILL_SCOPE.USER, source };
  };

  const fetchOpenCodeDiscoveredSkills = async (
    workingDirectory: string | null
  ): Promise<DiscoveredSkill[] | null> => {
    if (!getOpenCodePort()) {
      return null;
    }

    try {
      const url = new URL(openCodeRuntime.getUrl("/skill", ""));
      if (workingDirectory) {
        url.searchParams.set("directory", workingDirectory);
      }

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Accept: "application/json",
          ...openCodeRuntime.getAuthHeaders(),
        },
        signal: AbortSignal.timeout(8_000),
      });

      if (!response.ok) {
        return null;
      }

      const payload = await response.json();
      if (!Array.isArray(payload)) {
        return null;
      }

      return payload
        .map((item: any): DiscoveredSkill | null => {
          const name = typeof item?.name === "string" ? item.name.trim() : "";
          const location = typeof item?.location === "string" ? item.location : "";
          const description = typeof item?.description === "string" ? item.description : "";
          if (!name || !location) {
            return null;
          }
          const inferred = inferSkillScopeAndSourceFromPath(location, workingDirectory);
          return {
            name,
            path: location,
            scope: inferred.scope,
            source: inferred.source,
            description,
          };
        })
        .filter(Boolean) as DiscoveredSkill[];
    } catch {
      return null;
    }
  };

  const listGitIdentitiesForResponse = (): Array<{ id: string; name: string }> => {
    try {
      const profiles = getProfiles();
      return profiles.map((p) => ({ id: p.id, name: p.name }));
    } catch {
      return [];
    }
  };

  const resolveGitIdentity = (
    profileId: string | null
  ): { sshKey: string } | null => {
    if (!profileId) {
      return null;
    }
    try {
      const profile = getProfile(profileId);
      const sshKey = profile?.sshKey;
      if (typeof sshKey === "string" && sshKey.trim()) {
        return { sshKey: sshKey.trim() };
      }
    } catch {
      // ignore
    }
    return null;
  };

  app.get("/api/config/skills", async (req: Request, res: Response) => {
    try {
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }
      const skills =
        (await fetchOpenCodeDiscoveredSkills(directory)) || discoverSkills(directory);

      const enrichedSkills = skills.map((skill) => {
        const sources = getSkillSources(skill.name, directory, skill);
        return {
          ...skill,
          sources,
        };
      });

      const response = { skills: enrichedSkills };
      if (!parseSkillsListResponse(response).ok) throw new Error("Invalid skills list response");
      res.json(response);
    } catch (error) {
      console.error("Failed to list skills:", error);
      res.status(500).json({ error: "Failed to list skills" });
    }
  });

  app.get("/api/config/skills/catalog", async (req: Request, res: Response) => {
    try {
      const { error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }

      const curatedSources = getCuratedSkillsSources();
      const settings = await readSettingsFromDisk();
      const customSourcesRaw = sanitizeSkillCatalogs(settings.skillCatalogs) || [];

      const customSources = customSourcesRaw.map((entry: any) => ({
        id: entry.id,
        label: entry.label,
        description: entry.source,
        source: entry.source,
        defaultSubpath: entry.subpath,
        gitIdentityId: entry.gitIdentityId,
      }));

      const sources = [...curatedSources, ...customSources];
      const sourcesForUi = sources.map(
        ({ gitIdentityId, ...rest }: { gitIdentityId?: string; [key: string]: any }) => rest
      );

      res.json({ ok: true, sources: sourcesForUi, itemsBySource: {}, pageInfoBySource: {} });
    } catch (error) {
      console.error("Failed to load skills catalog:", error);
      res.status(500).json({
        ok: false,
        error: { kind: "unknown", message: (error as Error)?.message || "Failed to load catalog" },
      });
    }
  });

  app.get("/api/config/skills/catalog/source", async (req: Request, res: Response) => {
    try {
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ ok: false, error: { kind: "invalidSource", message: error } });
        return;
      }

      const sourceId =
        typeof req.query.sourceId === "string" ? req.query.sourceId : null;
      if (!sourceId) {
        res.status(400).json({ ok: false, error: { kind: "invalidSource", message: "Missing sourceId" } });
        return;
      }

      const refresh = String(req.query.refresh || "").toLowerCase() === "true";
      const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;

      const curatedSources = getCuratedSkillsSources();
      const settings = await readSettingsFromDisk();
      const customSourcesRaw = sanitizeSkillCatalogs(settings.skillCatalogs) || [];

      const customSources = customSourcesRaw.map((entry: any) => ({
        id: entry.id,
        label: entry.label,
        description: entry.source,
        source: entry.source,
        defaultSubpath: entry.subpath,
        gitIdentityId: entry.gitIdentityId,
      }));

      const sources = [...curatedSources, ...customSources];
      const src = sources.find((entry: any) => entry.id === sourceId);

      if (!src) {
        res.status(404).json({ ok: false, error: { kind: "invalidSource", message: "Unknown source" } });
        return;
      }

      const discovered = directory
        ? (await fetchOpenCodeDiscoveredSkills(directory)) || discoverSkills(directory)
        : [];
      const installedByName = new Map(discovered.map((s: DiscoveredSkill) => [s.name, s]));

      if (src.sourceType === "clawdhub" || isClawdHubSource(src.source)) {
        const scanned = await scanClawdHubPage({ cursor: cursor || null });
        if (!scanned.ok) {
          res.status(500).json({ ok: false, error: scanned.error });
          return;
        }

        const items = (scanned.items || []).map((item: any) => {
          const installed = installedByName.get(item.skillName);
          return {
            ...item,
            sourceId: src.id,
            installed: installed
              ? { isInstalled: true, scope: installed.scope, source: installed.source }
              : { isInstalled: false },
          };
        });

        res.json({ ok: true, items, nextCursor: scanned.nextCursor || null });
        return;
      }

      const parsed = parseSkillRepoSource(src.source);
      if (!parsed.ok) {
        res.status(400).json({ ok: false, error: parsed.error });
        return;
      }

      const effectiveSubpath = src.defaultSubpath || parsed.effectiveSubpath || null;
      const cacheKey = getCacheKey({
        normalizedRepo: parsed.normalizedRepo,
        subpath: effectiveSubpath || "",
        identityId: src.gitIdentityId || "",
      });

      let scanResult = !refresh ? getCachedScan(cacheKey) : null;
      if (!scanResult) {
        const scanned = await scanSkillsRepository({
          source: src.source,
          subpath: src.defaultSubpath,
          defaultSubpath: src.defaultSubpath,
          identity: resolveGitIdentity(src.gitIdentityId),
        });

        if (!scanned.ok) {
          res.status(500).json({ ok: false, error: scanned.error });
          return;
        }

        scanResult = scanned;
        setCachedScan(cacheKey, scanResult);
      }

      const items = (scanResult.items || []).map((item: any) => {
        const installed = installedByName.get(item.skillName);
        return {
          sourceId: src.id,
          ...item,
          gitIdentityId: src.gitIdentityId,
          installed: installed
            ? { isInstalled: true, scope: installed.scope, source: installed.source }
            : { isInstalled: false },
        };
      });

      res.json({ ok: true, items });
    } catch (error) {
      console.error("Failed to load catalog source:", error);
      res.status(500).json({
        ok: false,
        error: { kind: "unknown", message: (error as Error)?.message || "Failed to load catalog source" },
      });
    }
  });

  app.post("/api/config/skills/scan", async (req: Request, res: Response) => {
    try {
      const parsedRequest = parseSkillsRepoScanRequest(req.body);
      if (!parsedRequest.ok) {
        res.status(400).json(skillsError("skills_invalid_request", "Invalid scan request"));
        return;
      }
      const { source, subpath, gitIdentityId } = parsedRequest.value;
      const identity = resolveGitIdentity(gitIdentityId as any);

      const result = await scanSkillsRepository({
        source: source as any,
        subpath: subpath as any,
        identity: identity as any,
      });

      if (!result.ok) {
        if (result.error?.kind === "authRequired") {
          res.status(401).json({
            ok: false,
            error: {
              code: "skills_auth_required",
              message: "Skill provider authentication is required",
              identities: listGitIdentitiesForResponse(),
            },
          });
          return;
        }

        res.status(400).json(safeCatalogError(result.error?.kind, "Unable to scan skill provider"));
        return;
      }

      const response = { ok: true as const, items: result.items };
      if (!parseSkillsScanResponse(response).ok) throw new Error("Invalid skill scan response");
      res.json(response);
    } catch (error) {
      console.error("Failed to scan skills repository:", error);
      res.status(500).json(skillsError("skills_internal_error", "Failed to scan repository"));
    }
  });

  app.post("/api/config/skills/install", async (req: Request, res: Response) => {
    try {
      const parsedRequest = parseSkillsInstallRequest(req.body);
      if (!parsedRequest.ok) {
        res.status(400).json(skillsError("skills_invalid_request", "Invalid install request"));
        return;
      }
      const { source, subpath, gitIdentityId, scope, targetSource, selections, conflictPolicy, conflictDecisions } = parsedRequest.value;

      let workingDirectory: string | null = null;
      if (scope === "project") {
        const resolved = await resolveProjectDirectory(req);
        if (!resolved.directory) {
          res.status(400).json(skillsError("skills_invalid_request", "Project installs require a directory parameter"));
          return;
        }
        workingDirectory = resolved.directory;
      }

      if (isClawdHubSource(source || "")) {
        const result = await installSkillsFromClawdHub({
          scope,
          targetSource,
          workingDirectory,
          userSkillDir: SKILL_DIR,
          selections,
          conflictPolicy,
          conflictDecisions,
        });

        if (!result.ok) {
          if (result.error?.kind === "conflicts") {
            res.status(409).json(safeCatalogError(result.error?.kind, "Skill installation conflicts with an existing skill"));
            return;
          }
          res.status(400).json(safeCatalogError(result.error?.kind, "Unable to install skills"));
          return;
        }

        const installed = result.installed || [];
        const skipped = result.skipped || [];
        const requiresReload = installed.length > 0;

        if (requiresReload) {
          await refreshOpenCodeAfterConfigChange("skills install");
        }

        const response = {
          ok: true,
          installed,
          skipped,
          requiresReload,
          message: requiresReload ? "Skills installed successfully. Reloading interface…" : "No skills were installed",
          reloadDelayMs: requiresReload ? clientReloadDelayMs : undefined,
        };
        if (!parseSkillsInstallResponse(response).ok) throw new Error("Invalid skill install response");
        res.json(response);
        return;
      }

      const identity = resolveGitIdentity(gitIdentityId as any);

      const result = await installSkillsFromRepository({
        source: source as any,
        subpath: subpath as any,
        identity: identity as any,
        scope: scope as any,
        targetSource: targetSource as any,
        workingDirectory: workingDirectory as any,
        userSkillDir: SKILL_DIR,
        selections: selections as any,
        conflictPolicy: conflictPolicy as any,
        conflictDecisions,
      });

      if (!result.ok) {
        if (result.error?.kind === "conflicts") {
          res.status(409).json(safeCatalogError(result.error?.kind, "Skill installation conflicts with an existing skill"));
          return;
        }

        if (result.error?.kind === "authRequired") {
          res.status(401).json({
            ok: false,
            error: {
              code: "skills_auth_required",
              message: "Skill provider authentication is required",
              identities: listGitIdentitiesForResponse(),
            },
          });
          return;
        }

        res.status(400).json(safeCatalogError(result.error?.kind, "Unable to install skills"));
        return;
      }

      const installed = result.installed || [];
      const skipped = result.skipped || [];
      const requiresReload = installed.length > 0;

      if (requiresReload) {
        await refreshOpenCodeAfterConfigChange("skills install");
      }

      const response = {
        ok: true,
        installed,
        skipped,
        requiresReload,
        message: requiresReload ? "Skills installed successfully. Reloading interface…" : "No skills were installed",
        reloadDelayMs: requiresReload ? clientReloadDelayMs : undefined,
      };
      if (!parseSkillsInstallResponse(response).ok) throw new Error("Invalid skill install response");
      res.json(response);
    } catch (error) {
      console.error("Failed to install skills:", error);
      res.status(500).json(skillsError("skills_internal_error", "Failed to install skills"));
    }
  });

  app.get("/api/config/skills/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parsedSkillName(req.params.name);
      if (!parsedName.ok) { res.status(400).json(skillsError("skills_invalid_name", "Invalid skill name")); return; }
      const skillName = parsedName.value.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }
      const discoveredSkill =
        ((await fetchOpenCodeDiscoveredSkills(directory)) || []).find(
          (skill) => skill.name === skillName
        ) || null;
      const sources = getSkillSources(skillName, directory, discoveredSkill);

      const response = {
        name: skillName,
        sources: sources,
        scope: sources.md.scope,
        source: sources.md.source,
        exists: sources.md.exists,
      };
      if (!parseSkillDetailResponse(response).ok) throw new Error("Invalid skill detail response");
      res.json(response);
    } catch (error) {
      console.error("Failed to get skill sources:", error);
      res.status(500).json({ error: "Failed to get skill configuration metadata" });
    }
  });

  app.get("/api/config/skills/:name/files/*filePath", async (req: Request, res: Response) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(String(req.params.filePath));
      const parsedFile = parsedSupportingFile(skillName, filePath);
      if (!parsedFile.ok || isUnsafeSkillRelativePath(filePath)) {
        res.status(400).json(skillsError(!parsedFile.ok ? "skills_invalid_name" : "skills_invalid_path", "Invalid skill file path"));
        return;
      }
      const validatedName = parsedFile.value.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      const discoveredSkill =
        ((await fetchOpenCodeDiscoveredSkills(directory)) || []).find(
          (skill) => skill.name === validatedName
        ) || null;
      const sources = getSkillSources(validatedName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }

      const content = readSkillSupportingFile(sources.md.dir, filePath);
      if (content === null) {
        res.status(404).json({ error: "File not found" });
        return;
      }

      const response = { path: filePath, content };
      if (!parseSkillsSupportingFileResponse(response).ok) throw new Error("Invalid skill file response");
      res.json(response);
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && (err.code === "EACCES" || err.code === "EPERM")) {
        res.status(403).json({ error: "Access to file denied" });
        return;
      }
      console.error("Failed to read skill file:", error);
      res.status(500).json({ error: "Failed to read skill file" });
    }
  });

  app.post("/api/config/skills/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parsedSkillName(req.params.name);
      const parsedConfig = parseSkillConfigRequest(req.body);
      if (!parsedName.ok || !parsedConfig.ok) { res.status(400).json(skillsError(!parsedName.ok ? "skills_invalid_name" : "skills_invalid_request", "Invalid skill configuration")); return; }
      const skillName = parsedName.value.name;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { scope, source: skillSource, ...config } = parsedConfig.value as {
        scope?: string;
        source?: string;
        [key: string]: any;
      };
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      console.log("[Server] Creating skill:", skillName);
      console.log("[Server] Scope:", scope, "Working directory:", directory);

      createSkill(skillName, { ...config, source: skillSource }, directory, scope);
      await refreshOpenCodeAfterConfigChange("skill creation");

      const response = {
        success: true,
        requiresReload: true,
        message: `Skill ${skillName} created successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      };
      if (!parseSkillMutationResponse(response).ok) throw new Error("Invalid skill mutation response");
      res.json(response);
    } catch (error) {
      console.error("Failed to create skill:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to create skill" });
    }
  });

  app.patch("/api/config/skills/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parsedSkillName(req.params.name);
      const parsedUpdates = parseSkillConfigRequest(req.body);
      if (!parsedName.ok || !parsedUpdates.ok) { res.status(400).json(skillsError(!parsedName.ok ? "skills_invalid_name" : "skills_invalid_request", "Invalid skill configuration")); return; }
      const skillName = parsedName.value.name;
      const updates = parsedUpdates.value;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      console.log(`[Server] Updating skill: ${skillName}`);
      console.log("[Server] Working directory:", directory);

      updateSkill(skillName, updates, directory);
      await refreshOpenCodeAfterConfigChange("skill update");

      const response = {
        success: true,
        requiresReload: true,
        message: `Skill ${skillName} updated successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      };
      if (!parseSkillMutationResponse(response).ok) throw new Error("Invalid skill mutation response");
      res.json(response);
    } catch (error) {
      console.error("[Server] Failed to update skill:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to update skill" });
    }
  });

  app.put("/api/config/skills/:name/files/*filePath", async (req: Request, res: Response) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(String(req.params.filePath));
      const { content } = (req.body as { content?: unknown }) || {};
      const parsedFile = parsedSupportingFile(skillName, filePath, content);
      if (!parsedFile.ok || isUnsafeSkillRelativePath(filePath)) {
        res.status(400).json(skillsError(!parsedFile.ok ? "skills_invalid_path" : "skills_invalid_path", "Invalid skill file path"));
        return;
      }
      const validatedName = parsedFile.value.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      const discoveredSkill =
        ((await fetchOpenCodeDiscoveredSkills(directory)) || []).find(
          (skill) => skill.name === validatedName
        ) || null;
      const sources = getSkillSources(validatedName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }

      writeSkillSupportingFile(sources.md.dir, filePath, parsedFile.value.content || "");

      const response = {
        success: true,
        message: `File ${filePath} saved successfully`,
      };
      if (!parseSkillMutationResponse(response).ok) throw new Error("Invalid skill file mutation response");
      res.json(response);
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && (err.code === "EACCES" || err.code === "EPERM")) {
        res.status(403).json({ error: "Access to file denied" });
        return;
      }
      console.error("Failed to write skill file:", error);
      res.status(500).json({ error: "Failed to write skill file" });
    }
  });

  app.delete("/api/config/skills/:name/files/*filePath", async (req: Request, res: Response) => {
    try {
      const skillName = req.params.name;
      const filePath = decodeURIComponent(String(req.params.filePath));
      const parsedFile = parsedSupportingFile(skillName, filePath);
      if (!parsedFile.ok || isUnsafeSkillRelativePath(filePath)) {
        res.status(400).json(skillsError(!parsedFile.ok ? "skills_invalid_path" : "skills_invalid_path", "Invalid skill file path"));
        return;
      }
      const validatedName = parsedFile.value.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      const discoveredSkill =
        ((await fetchOpenCodeDiscoveredSkills(directory)) || []).find(
          (skill) => skill.name === validatedName
        ) || null;
      const sources = getSkillSources(validatedName, directory, discoveredSkill);
      if (!sources.md.exists || !sources.md.dir) {
        res.status(404).json({ error: "Skill not found" });
        return;
      }

      deleteSkillSupportingFile(sources.md.dir, filePath);

      const response = {
        success: true,
        message: `File ${filePath} deleted successfully`,
      };
      if (!parseSkillMutationResponse(response).ok) throw new Error("Invalid skill file mutation response");
      res.json(response);
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && (err.code === "EACCES" || err.code === "EPERM")) {
        res.status(403).json({ error: "Access to file denied" });
        return;
      }
      console.error("Failed to delete skill file:", error);
      res.status(500).json({ error: "Failed to delete skill file" });
    }
  });

  app.delete("/api/config/skills/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parsedSkillName(req.params.name);
      if (!parsedName.ok) { res.status(400).json(skillsError("skills_invalid_name", "Invalid skill name")); return; }
      const skillName = parsedName.value.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      deleteSkill(skillName, directory);
      await refreshOpenCodeAfterConfigChange("skill deletion");

      const response = {
        success: true,
        requiresReload: true,
        message: `Skill ${skillName} deleted successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      };
      if (!parseSkillMutationResponse(response).ok) throw new Error("Invalid skill mutation response");
      res.json(response);
    } catch (error) {
      console.error("Failed to delete skill:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to delete skill" });
    }
  });
}
