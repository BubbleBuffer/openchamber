import type { Express, Request, Response } from "express";
import { createProjectIdFromPath } from "../../projects/index.js";

interface OpenCodeRoutesDeps {
  crypto: typeof import("crypto");
  clientReloadDelayMs: number;
  getOpenCodeResolutionSnapshot: (settings: object) => Promise<object>;
  formatSettingsResponse: (settings: object) => object;
  readSettingsFromDisk: () => Promise<any>;
  readSettingsFromDiskMigrated: () => Promise<any>;
  persistSettings: (changes: object) => Promise<any>;
  sanitizeProjects: (input: unknown) => Array<Record<string, unknown>> | undefined;
  validateDirectoryPath: (candidate: any) => Promise<{ ok: boolean; directory?: string; error?: string }>;
  resolveProjectDirectory: (req: Request) => Promise<{ directory?: any; error?: string }>;
  getProviderSources: (providerId: any, directory: any) => any;
  removeProviderConfig: (providerId: any, directory: any, scope: any) => boolean;
  refreshOpenCodeAfterConfigChange: (reason: string, options?: any) => Promise<void>;
}

interface PendingMcpAuthContext {
  name: string | null;
  directory: string | null;
  expiresAt: number;
}

export function registerOpenCodeRoutes(
  app: Express,
  dependencies: OpenCodeRoutesDeps
): void {
  const {
    crypto,
    clientReloadDelayMs,
    getOpenCodeResolutionSnapshot,
    formatSettingsResponse,
    readSettingsFromDisk,
    readSettingsFromDiskMigrated,
    persistSettings,
    sanitizeProjects,
    validateDirectoryPath,
    resolveProjectDirectory,
    getProviderSources,
    removeProviderConfig,
    refreshOpenCodeAfterConfigChange,
  } = dependencies;

  let authLibrary: any = null;
  const pendingMcpAuthContextByState = new Map<string, PendingMcpAuthContext | undefined>();
  const PENDING_MCP_AUTH_TTL_MS = 30 * 60 * 1000;

  const getAuthLibrary = async (): Promise<any> => {
    if (!authLibrary) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      authLibrary = await import("../auth/auth.js" as any);
    }
    return authLibrary;
  };

  const normalizePendingString = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const trimmed = value.trim();
    return trimmed || null;
  };

  const pruneExpiredPendingMcpAuthContexts = (): void => {
    const now = Date.now();
    for (const [state, entry] of pendingMcpAuthContextByState.entries()) {
      if (!entry || typeof entry.expiresAt !== "number" || entry.expiresAt <= now) {
        pendingMcpAuthContextByState.delete(state);
      }
    }
  };

  app.get("/api/config/settings", async (_req: Request, res: Response) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      res.json(formatSettingsResponse(settings));
    } catch (error) {
      console.error("Failed to read settings:", error);
      res.status(500).json({ error: "Failed to read settings" });
    }
  });

  app.get("/api/config/opencode-resolution", async (_req: Request, res: Response) => {
    try {
      const settings = await readSettingsFromDiskMigrated();
      const resolution = await getOpenCodeResolutionSnapshot(settings);
      res.json(resolution);
    } catch (error) {
      console.error("Failed to resolve OpenCode binary:", error);
      res.status(500).json({ error: "Failed to resolve OpenCode binary" });
    }
  });

  app.put("/api/config/settings", async (req: Request, res: Response) => {
    console.log("[API:PUT /api/config/settings] Received request");
    try {
      const updated = await persistSettings(req.body ?? {});
      console.log(`[API:PUT /api/config/settings] Success, returning ${updated.projects?.length || 0} projects`);
      res.json(updated);
    } catch (error) {
      console.error("[API:PUT /api/config/settings] Failed to save settings:", error);
      console.error("[API:PUT /api/config/settings] Error stack:", (error as Error)?.stack);
      res.status(500).json({ error: "Failed to save settings" });
    }
  });

  app.post("/api/mcp/auth/pending", async (req: Request, res: Response) => {
    try {
      pruneExpiredPendingMcpAuthContexts();

      const state = normalizePendingString(req.body?.state);
      if (!state) {
        res.json({ success: true, context: null });
        return;
      }

      const name = normalizePendingString(req.body?.name);
      if (!name) {
        res.status(400).json({ error: "MCP server name is required" });
        return;
      }

      const entry: PendingMcpAuthContext = {
        name,
        directory: normalizePendingString(req.body?.directory),
        expiresAt: Date.now() + PENDING_MCP_AUTH_TTL_MS,
      };
      pendingMcpAuthContextByState.set(state, entry);

      res.json({
        success: true,
        context: {
          name: entry.name,
          directory: entry.directory,
        },
      });
    } catch (error) {
      console.error("Failed to store pending MCP auth context:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to store pending MCP auth context" });
    }
  });

  app.get("/api/mcp/auth/pending", async (req: Request, res: Response) => {
    try {
      pruneExpiredPendingMcpAuthContexts();

      const state = normalizePendingString(
        Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state
      );
      if (!state) {
        res.json(null);
        return;
      }

      const pendingMcpAuthContext = pendingMcpAuthContextByState.get(state) ?? null;
      if (!pendingMcpAuthContext) {
        res.status(404).json({ error: "No pending MCP auth context" });
        return;
      }

      res.json(pendingMcpAuthContext);
    } catch (error) {
      console.error("Failed to read pending MCP auth context:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to read pending MCP auth context" });
    }
  });

  app.delete("/api/mcp/auth/pending", async (req: Request, res: Response) => {
    try {
      const state = normalizePendingString(
        Array.isArray(req.query?.state) ? req.query.state[0] : req.query?.state
      );
      if (!state) {
        res.json({ success: true });
        return;
      }

      pendingMcpAuthContextByState.delete(state);
      res.json({ success: true });
    } catch (error) {
      console.error("Failed to clear pending MCP auth context:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to clear pending MCP auth context" });
    }
  });

  app.get("/api/provider/:providerId/source", async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        res.status(400).json({ error: "Provider ID is required" });
        return;
      }

      const headerDirectory = typeof req.get === "function" ? req.get("x-opencode-directory") : null;
      const queryDirectory = Array.isArray(req.query?.directory)
        ? req.query.directory[0]
        : req.query?.directory;
      const requestedDirectory = headerDirectory || queryDirectory || null;

      let directory: string | null = null;
      const resolved = await resolveProjectDirectory(req);
      if (resolved.directory) {
        directory = resolved.directory;
      } else if (requestedDirectory) {
        res.status(400).json({ error: resolved.error });
        return;
      }

      const sources = getProviderSources(providerId, directory);
      const authLib = await getAuthLibrary();
      const { getProviderAuth } = authLib;
      const auth = getProviderAuth(providerId);
      (sources.sources as any).auth.exists = Boolean(auth);

      res.json({
        providerId,
        sources: sources.sources,
      });
    } catch (error) {
      console.error("Failed to get provider sources:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to get provider sources" });
    }
  });

  app.delete("/api/provider/:providerId/auth", async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      if (!providerId) {
        res.status(400).json({ error: "Provider ID is required" });
        return;
      }

      const scope =
        typeof req.query?.scope === "string" ? req.query.scope : "auth";
      const headerDirectory = typeof req.get === "function" ? req.get("x-opencode-directory") : null;
      const queryDirectory = Array.isArray(req.query?.directory)
        ? req.query.directory[0]
        : req.query?.directory;
      const requestedDirectory = headerDirectory || queryDirectory || null;
      let directory: string | null = null;

      if (scope === "project" || requestedDirectory) {
        const resolved = await resolveProjectDirectory(req);
        if (!resolved.directory) {
          res.status(400).json({ error: resolved.error });
          return;
        }
        directory = resolved.directory;
      } else {
        const resolved = await resolveProjectDirectory(req);
        if (resolved.directory) {
          directory = resolved.directory;
        }
      }

      let removed = false;
      if (scope === "auth") {
        const authLib = await getAuthLibrary();
        const { removeProviderAuth } = authLib;
        removed = removeProviderAuth(providerId);
      } else if (scope === "user" || scope === "project" || scope === "custom") {
        removed = removeProviderConfig(providerId, directory, scope);
      } else if (scope === "all") {
        const authLib = await getAuthLibrary();
        const { removeProviderAuth } = authLib;
        const authRemoved = removeProviderAuth(providerId);
        const userRemoved = removeProviderConfig(providerId, directory, "user");
        const projectRemoved = directory ? removeProviderConfig(providerId, directory, "project") : false;
        const customRemoved = removeProviderConfig(providerId, directory, "custom");
        removed = authRemoved || userRemoved || projectRemoved || customRemoved;
      } else {
        res.status(400).json({ error: "Invalid scope" });
        return;
      }

      if (removed) {
        await refreshOpenCodeAfterConfigChange(`provider ${providerId} disconnected (${scope})`);
      }

      res.json({
        success: true,
        removed,
        requiresReload: removed,
        message: removed ? "Provider disconnected successfully" : "Provider was not connected",
        reloadDelayMs: removed ? clientReloadDelayMs : undefined,
      });
    } catch (error) {
      console.error("Failed to disconnect provider:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to disconnect provider" });
    }
  });

  app.post("/api/opencode/directory", async (req: Request, res: Response) => {
    try {
      const requestedPath =
        typeof req.body?.path === "string" ? req.body.path.trim() : "";
      if (!requestedPath) {
        res.status(400).json({ error: "Path is required" });
        return;
      }

      const validated = await validateDirectoryPath(requestedPath);
      if (!validated.ok) {
        res.status(400).json({ error: validated.error });
        return;
      }

      const resolvedPath = validated.directory!;
      const currentSettings = await readSettingsFromDisk();
      const existingProjects = sanitizeProjects(currentSettings.projects) || [];
      const existing = existingProjects.find((project) => project.path === resolvedPath) || null;

      const nextProjects = existing
        ? existingProjects
        : [
            ...existingProjects,
            {
              id: createProjectIdFromPath(resolvedPath),
              path: resolvedPath,
              addedAt: Date.now(),
              lastOpenedAt: Date.now(),
            },
          ];

      const activeProjectId = existing ? existing.id : nextProjects[nextProjects.length - 1].id;

      const updated = await persistSettings({
        projects: nextProjects,
        activeProjectId,
        lastDirectory: resolvedPath,
      });

      res.json({
        success: true,
        restarted: false,
        path: resolvedPath,
        settings: updated,
      });
    } catch (error) {
      console.error("Failed to update OpenCode working directory:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to update working directory" });
    }
  });
}