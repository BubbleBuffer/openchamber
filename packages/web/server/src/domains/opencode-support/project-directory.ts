/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ProjectDirectoryRuntimeDeps, ProjectDirectoryRuntime } from "./types.js";

export function createProjectDirectoryRuntime(deps: ProjectDirectoryRuntimeDeps): ProjectDirectoryRuntime {
  const {
    fsPromises,
    path,
    normalizeDirectoryPath,
    readSettingsFromDiskMigrated,
    getReadSettingsFromDiskMigrated,
    sanitizeProjects,
  } = deps;

  const resolveDirectoryCandidate = (value: string): string | null => {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const normalized = normalizeDirectoryPath(trimmed) as string;
    return path.resolve(normalized);
  };

  const validateDirectoryPath = async (candidate: string): Promise<{ ok: boolean; directory: string | null; error: string | null }> => {
    const resolved = resolveDirectoryCandidate(candidate);
    if (!resolved) {
      return { ok: false, directory: null, error: "Directory parameter is required" };
    }
    try {
      const stats = await fsPromises.stat(resolved);
      if (!stats.isDirectory()) {
        return { ok: false, directory: null, error: "Specified path is not a directory" };
      }
      return { ok: true, directory: resolved, error: null };
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return { ok: false, directory: null, error: "Directory not found" };
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return { ok: false, directory: null, error: "Access to directory denied" };
      }
      return { ok: false, directory: null, error: "Failed to validate directory" };
    }
  };

  const resolveProjectDirectory = async (req: any): Promise<{ directory: string | null; error: string | null }> => {
    const headerDirectory = typeof req.get === "function" ? req.get("x-opencode-directory") : null;
    const queryDirectory = Array.isArray(req.query?.directory)
      ? req.query.directory[0]
      : req.query?.directory;
    const requested = headerDirectory || queryDirectory || null;

    if (requested && typeof requested === "string") {
      const validated = await validateDirectoryPath(requested);
      if (!validated.ok) {
        return { directory: null, error: validated.error };
      }
      return { directory: validated.directory, error: null };
    }

    const readSettings = typeof getReadSettingsFromDiskMigrated === "function"
      ? getReadSettingsFromDiskMigrated()
      : readSettingsFromDiskMigrated;
    const settings = await readSettings() as any;

    if (typeof settings.lastDirectory === "string" && settings.lastDirectory.trim()) {
      const validated = await validateDirectoryPath(settings.lastDirectory);
      if (validated.ok) {
        return { directory: validated.directory, error: null };
      }
    }

    const projects = sanitizeProjects(settings.projects) || [];
    if (projects.length === 0) {
      return { directory: null, error: "Directory parameter or active project is required" };
    }

    const activeId = typeof settings.activeProjectId === "string" ? settings.activeProjectId : "";
    const active = projects.find((project) => project.id === activeId) || projects[0];
    if (!active || typeof active.path !== "string") {
      return { directory: null, error: "Directory parameter or active project is required" };
    }

    const validated = await validateDirectoryPath(active.path as string);
    if (!validated.ok) {
      return { directory: null, error: validated.error };
    }

    return { directory: validated.directory, error: null };
  };

  const resolveOptionalProjectDirectory = async (req: any): Promise<{ directory: string | null; error: string | null }> => {
    const headerDirectory = typeof req.get === "function" ? req.get("x-opencode-directory") : null;
    const queryDirectory = Array.isArray(req.query?.directory)
      ? req.query.directory[0]
      : req.query?.directory;
    const requested = headerDirectory || queryDirectory || null;

    if (!requested || typeof requested !== "string") {
      return { directory: null, error: null };
    }

    const validated = await validateDirectoryPath(requested);
    if (!validated.ok) {
      return { directory: null, error: validated.error };
    }

    return { directory: validated.directory, error: null };
  };

  return {
    resolveDirectoryCandidate,
    validateDirectoryPath,
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
  };
}