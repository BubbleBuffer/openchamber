import type { SettingsNormalizationDeps, SettingsNormalizationRuntime } from "./types.js";

export function createSettingsNormalizationRuntime(
  deps: SettingsNormalizationDeps,
): SettingsNormalizationRuntime {
  const {
    os,
    path,
    processLike,
  } = deps;

  const normalizeDirectoryPath = (value: unknown): string | unknown => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (trimmed === "~") {
      return os.homedir();
    }

    if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
      return path.join(os.homedir(), trimmed.slice(2));
    }

    return trimmed;
  };

  const normalizePathForPersistence = (value: unknown): string | unknown => {
    if (typeof value !== "string") {
      return value;
    }

    const normalized = normalizeDirectoryPath(value);
    if (typeof normalized !== "string") {
      return normalized;
    }

    const trimmed = normalized.trim();
    if (!trimmed) {
      return trimmed;
    }

    if (processLike.platform !== "win32") {
      return trimmed;
    }

    return trimmed.replace(/\//g, "\\");
  };

  const areStringArraysEqual = (a: unknown[], b: unknown[]): boolean => {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      return false;
    }
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  };

  const normalizeStringArray = (input: unknown): string[] => {
    if (!Array.isArray(input)) {
      return [];
    }
    return Array.from(
      new Set(
        input.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
      ),
    );
  };

  const sanitizeProjects = (input: unknown): Array<Record<string, unknown>> | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const hexColorPattern = /^#(?:[\da-fA-F]{3}|[\da-fA-F]{6})$/;
    const normalizeIconBackground = (value: unknown): string | null => {
      if (typeof value !== "string") {
        return null;
      }
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      return hexColorPattern.test(trimmed) ? trimmed.toLowerCase() : null;
    };

    const result: Array<Record<string, unknown>> = [];
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();

    for (const entry of input) {
      if (!entry || typeof entry !== "object") continue;

      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const rawPath = typeof candidate.path === "string" ? candidate.path.trim() : "";
      const resolvedPath = rawPath ? path.resolve(normalizeDirectoryPath(rawPath) as string) : "";
      const normalizedPath = resolvedPath ? (normalizePathForPersistence(resolvedPath) as string) : "";
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const icon = typeof candidate.icon === "string" ? candidate.icon.trim() : "";
      const iconImage =
        candidate.iconImage && typeof candidate.iconImage === "object"
          ? (candidate.iconImage as Record<string, unknown>)
          : null;
      const iconBackground = normalizeIconBackground(candidate.iconBackground);
      const color = typeof candidate.color === "string" ? candidate.color.trim() : "";
      const addedAt = Number.isFinite(candidate.addedAt as number) ? Number(candidate.addedAt) : null;
      const lastOpenedAt = Number.isFinite(candidate.lastOpenedAt as number)
        ? Number(candidate.lastOpenedAt)
        : null;

      if (!id || !normalizedPath) continue;
      if (seenIds.has(id)) continue;
      if (seenPaths.has(normalizedPath)) continue;

      seenIds.add(id);
      seenPaths.add(normalizedPath);

      const project: Record<string, unknown> = {
        id,
        path: normalizedPath,
      };
      if (label) project.label = label;
      if (icon) project.icon = icon;
      if (iconBackground) project.iconBackground = iconBackground;
      if (color) project.color = color;
      if (Number.isFinite(addedAt) && (addedAt as number) >= 0) project.addedAt = addedAt;
      if (Number.isFinite(lastOpenedAt) && (lastOpenedAt as number) >= 0) project.lastOpenedAt = lastOpenedAt;

      if (candidate.iconImage === null) {
        project.iconImage = null;
      } else if (iconImage) {
        const mime = typeof iconImage.mime === "string" ? iconImage.mime.trim() : "";
        const updatedAt =
          typeof iconImage.updatedAt === "number" && Number.isFinite(iconImage.updatedAt)
            ? Math.max(0, Math.round(iconImage.updatedAt))
            : 0;
        const source = iconImage.source === "custom" || iconImage.source === "auto"
          ? iconImage.source
          : null;
        if (mime && updatedAt > 0 && source) {
          project.iconImage = { mime, updatedAt, source };
        }
      }

      if (candidate.iconBackground === null) {
        project.iconBackground = null;
      }

      if (typeof candidate.sidebarCollapsed === "boolean") {
        project.sidebarCollapsed = candidate.sidebarCollapsed;
      }

      result.push(project);
    }

    return result;
  };

  const normalizeSettingsPaths = (input: object): { settings: object; changed: boolean } => {
    const settings = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
    let next = settings;
    let changed = false;

    const ensureNext = (): void => {
      if (next === settings) {
        next = { ...settings };
      }
    };

    const normalizePathField = (key: string): void => {
      if (typeof settings[key] !== "string" || (settings[key] as string).length === 0) {
        return;
      }
      const normalized = normalizePathForPersistence(settings[key]);
      if (normalized !== settings[key]) {
        ensureNext();
        next[key] = normalized;
        changed = true;
      }
    };

    const normalizePathArrayField = (key: string): void => {
      if (!Array.isArray(settings[key])) {
        return;
      }

      const normalized = normalizeStringArray(
        (settings[key] as unknown[])
          .map((entry) => (typeof entry === "string" ? normalizePathForPersistence(entry) : entry))
          .filter((entry) => typeof entry === "string" && entry.length > 0),
      );

      if (!areStringArraysEqual(normalized, settings[key] as unknown[])) {
        ensureNext();
        next[key] = normalized;
        changed = true;
      }
    };

    normalizePathField("lastDirectory");
    normalizePathField("homeDirectory");
    normalizePathArrayField("pinnedDirectories");

    if (Array.isArray(settings.projects)) {
      const normalizedProjects = sanitizeProjects(settings.projects) || [];
      if (JSON.stringify(normalizedProjects) !== JSON.stringify(settings.projects)) {
        ensureNext();
        next.projects = normalizedProjects;
        changed = true;
      }
    }

    return { settings: next, changed };
  };

  const isUnsafeSkillRelativePath = (value: unknown): boolean => {
    if (typeof value !== "string" || value.length === 0) {
      return true;
    }

    const normalized = value.replace(/\\/g, "/");
    if (path.posix.isAbsolute(normalized)) {
      return true;
    }

    return normalized.split("/").some((segment) => segment === "..");
  };

  const sanitizeTypographySizesPartial = (input: unknown): Record<string, string> | undefined => {
    if (!input || typeof input !== "object") {
      return undefined;
    }
    const candidate = input as Record<string, unknown>;
    const result: Record<string, string> = {};
    let populated = false;

    const assign = (key: string): void => {
      if (typeof candidate[key] === "string" && (candidate[key] as string).length > 0) {
        result[key] = candidate[key] as string;
        populated = true;
      }
    };

    assign("markdown");
    assign("code");
    assign("uiHeader");
    assign("uiLabel");
    assign("meta");
    assign("micro");

    return populated ? result : undefined;
  };

  const sanitizeModelRefs = (
    input: unknown,
    limit: number,
  ): Array<{ providerID: string; modelID: string }> | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result: Array<{ providerID: string; modelID: string }> = [];
    const seen = new Set<string>();

    for (const entry of input) {
      if (!entry || typeof entry !== "object") continue;
      const candidate = entry as Record<string, unknown>;
      const providerID = typeof candidate.providerID === "string" ? candidate.providerID.trim() : "";
      const modelID = typeof candidate.modelID === "string" ? candidate.modelID.trim() : "";
      if (!providerID || !modelID) continue;
      const key = `${providerID}/${modelID}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ providerID, modelID });
      if (result.length >= limit) break;
    }

    return result;
  };

  const sanitizeSkillCatalogs = (
    input: unknown,
  ): Array<{ id: string; label: string; source: string; subpath?: string; gitIdentityId?: string }> | undefined => {
    if (!Array.isArray(input)) {
      return undefined;
    }

    const result: Array<{ id: string; label: string; source: string; subpath?: string; gitIdentityId?: string }> = [];
    const seen = new Set<string>();

    for (const entry of input) {
      if (!entry || typeof entry !== "object") continue;

      const candidate = entry as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const label = typeof candidate.label === "string" ? candidate.label.trim() : "";
      const source = typeof candidate.source === "string" ? candidate.source.trim() : "";
      const subpath = typeof candidate.subpath === "string" ? candidate.subpath.trim() : "";
      const gitIdentityId = typeof candidate.gitIdentityId === "string" ? candidate.gitIdentityId.trim() : "";

      if (!id || !label || !source) continue;
      if (seen.has(id)) continue;
      seen.add(id);

      const item: { id: string; label: string; source: string; subpath?: string; gitIdentityId?: string } = {
        id,
        label,
        source,
      };
      if (subpath) item.subpath = subpath;
      if (gitIdentityId) item.gitIdentityId = gitIdentityId;
      result.push(item);
    }

    return result;
  };

  return {
    normalizeDirectoryPath,
    normalizePathForPersistence,
    normalizeSettingsPaths,
    isUnsafeSkillRelativePath,
    sanitizeTypographySizesPartial,
    normalizeStringArray,
    sanitizeModelRefs,
    sanitizeSkillCatalogs,
    sanitizeProjects,
  };
}
