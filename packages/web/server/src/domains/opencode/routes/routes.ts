import type { Express, Request, Response } from "express";
import { createProjectIdFromPath } from "../../projects/index.js";
import { parseSettingsUpdateRequest } from "../../../contracts/settings.js";
import {
  parseDirectorySwitchRequest,
  parsePendingMcpAuthRequest,
  parseOpenCodeResolutionResponse,
  parseProviderDisconnectResponse,
  parseProviderId,
  parseProviderSourceResponse,
  type OpenCodeErrorCode,
} from "../../../contracts/opencode.js";

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
  const safeError = (res: Response, status: number, code: OpenCodeErrorCode): void => {
    res.status(status).json({ error: "Request failed", code });
  };

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
      const parsed = parseOpenCodeResolutionResponse(resolution);
      if (!parsed.ok) return safeError(res, 500, "opencode_invalid_response");
      res.json(parsed.value);
    } catch (error) {
      console.error("Failed to resolve OpenCode binary:", error);
      safeError(res, 500, "opencode_internal_error");
    }
  });

  app.put("/api/config/settings", async (req: Request, res: Response) => {
    console.log("[API:PUT /api/config/settings] Received request");
    try {
      const request = parseSettingsUpdateRequest(req.body ?? {});
      if (!request.ok) return res.status(400).json({ error: "Invalid settings request", code: "settings_invalid_request" });
      const updated = await persistSettings(request.value);
      console.log(`[API:PUT /api/config/settings] Success, returning ${updated.projects?.length || 0} projects`);
      res.json(updated);
    } catch (error) {
      console.error("[API:PUT /api/config/settings] Failed to save settings:", error);
      console.error("[API:PUT /api/config/settings] Error stack:", (error as Error)?.stack);
      res.status(500).json({ error: "Failed to save settings", code: "settings_write_failed" });
    }
  });

  app.post("/api/mcp/auth/pending", async (req: Request, res: Response) => {
    try {
      pruneExpiredPendingMcpAuthContexts();
      const parsed = parsePendingMcpAuthRequest(req.body ?? {});
      if (!parsed.ok) return safeError(res, 400, "opencode_invalid_request");
      const { state, name, directory } = parsed.value;
      if (!state) {
        res.json({ success: true, context: null });
        return;
      }
      if (!name) {
        return safeError(res, 400, "opencode_invalid_request");
      }

      const entry: PendingMcpAuthContext = {
        name,
        directory,
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
      safeError(res, 500, "opencode_internal_error");
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
      safeError(res, 500, "opencode_internal_error");
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
      safeError(res, 500, "opencode_internal_error");
    }
  });

  app.get("/api/provider/:providerId/source", async (req: Request, res: Response) => {
    try {
      const { providerId } = req.params;
      if (!normalizePendingString(providerId)) return safeError(res, 400, "opencode_invalid_request");

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
        return safeError(res, 400, "opencode_invalid_request");
      }

      const sources = getProviderSources(providerId, directory);
      const authLib = await getAuthLibrary();
      const { getProviderAuth } = authLib;
      const auth = getProviderAuth(providerId);
      (sources.sources as any).auth.exists = Boolean(auth);

      const response = {
        providerId,
        sources: sources.sources,
      };
      if (!parseProviderSourceResponse(response).ok) return safeError(res, 500, "opencode_invalid_response");
      res.json(response);
    } catch (error) {
      console.error("Failed to get provider sources:", error);
      safeError(res, 500, "opencode_internal_error");
    }
  });

  app.delete("/api/provider/:providerId/auth", async (req: Request, res: Response) => {
    try {
      const parsedProviderId = parseProviderId(req.params.providerId);
      if (!parsedProviderId.ok) return safeError(res, 400, "opencode_invalid_request");
      const providerId = parsedProviderId.value;

      const scope = typeof req.query?.scope === "string" ? req.query.scope : "auth";
      if (!(["auth", "user", "project", "custom", "all"] as const).includes(scope as "auth" | "user" | "project" | "custom" | "all")) return safeError(res, 400, "opencode_invalid_request");
      const headerDirectory = typeof req.get === "function" ? req.get("x-opencode-directory") : null;
      const queryDirectory = Array.isArray(req.query?.directory)
        ? req.query.directory[0]
        : req.query?.directory;
      const requestedDirectory = headerDirectory || queryDirectory || null;
      let directory: string | null = null;

      if (scope === "project" || requestedDirectory) {
        const resolved = await resolveProjectDirectory(req);
        if (!resolved.directory) {
          return safeError(res, 400, "opencode_invalid_request");
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
      }

      if (removed) {
        await refreshOpenCodeAfterConfigChange(`provider ${providerId} disconnected (${scope})`);
      }

      const response = {
        success: true,
        removed,
        requiresReload: removed,
        message: removed ? "Provider disconnected successfully" : "Provider was not connected",
        reloadDelayMs: removed ? clientReloadDelayMs : undefined,
      };
      if (!parseProviderDisconnectResponse(response).ok) return safeError(res, 500, "opencode_invalid_response");
      res.json(response);
    } catch (error) {
      console.error("Failed to disconnect provider:", error);
      safeError(res, 500, "opencode_internal_error");
    }
  });

  app.post("/api/opencode/directory", async (req: Request, res: Response) => {
    try {
      const parsed = parseDirectorySwitchRequest(req.body ?? {});
      if (!parsed.ok) return safeError(res, 400, "opencode_invalid_request");
      const requestedPath = parsed.value.path;

      const validated = await validateDirectoryPath(requestedPath);
      if (!validated.ok) {
        return safeError(res, 400, "opencode_invalid_request");
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
      safeError(res, 500, "opencode_internal_error");
    }
  });
}
