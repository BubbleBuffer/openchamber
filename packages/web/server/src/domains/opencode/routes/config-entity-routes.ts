/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express, Request, Response } from "express";
import { parseConfigEntityBody, parseConfigEntityName, parseConfigEntityResponse, parseMcpConfigListResponse, parseMcpConfigRequest, parseMcpMutationResponse } from "../../../contracts/opencode.js";

interface ConfigEntityRoutesDeps {
  resolveProjectDirectory: (req: Request) => Promise<{ directory?: string; error?: string }>;
  resolveOptionalProjectDirectory: (req: Request) => Promise<{ directory?: string; error?: string }>;
  refreshOpenCodeAfterConfigChange: (reason: string, options?: any) => Promise<void>;
  clientReloadDelayMs: number;
  getAgentSources: (name: any, directory: any) => any;
  getAgentConfig: (name: any, directory: any) => any;
  createAgent: (name: any, config: any, directory: any, scope?: any) => void;
  updateAgent: (name: any, updates: any, directory: any) => void;
  deleteAgent: (name: any, directory: any) => void;
  getCommandSources: (name: any, directory: any) => any;
  createCommand: (name: any, config: any, directory: any, scope?: any) => void;
  updateCommand: (name: any, updates: any, directory: any) => void;
  deleteCommand: (name: any, directory: any) => void;
  listMcpConfigs: (directory: any) => any[];
  getMcpConfig: (name: any, directory: any) => any;
  createMcpConfig: (name: any, config: any, directory: any, scope?: any) => void;
  updateMcpConfig: (name: any, updates: any, directory: any) => void;
  deleteMcpConfig: (name: any, directory: any) => void;
}

export function registerConfigEntityRoutes(
  app: Express,
  dependencies: ConfigEntityRoutesDeps
): void {
  const {
    resolveProjectDirectory,
    resolveOptionalProjectDirectory,
    refreshOpenCodeAfterConfigChange,
    clientReloadDelayMs,
    getAgentSources,
    getAgentConfig,
    createAgent,
    updateAgent,
    deleteAgent,
    getCommandSources,
    createCommand,
    updateCommand,
    deleteCommand,
    listMcpConfigs,
    getMcpConfig,
    createMcpConfig,
    updateMcpConfig,
    deleteMcpConfig,
  } = dependencies;
  const invalidRequest = (res: Response): void => { res.status(400).json({ error: "Request failed", code: "opencode_invalid_request" }); };
  const internalError = (res: Response): void => { res.status(500).json({ error: "Internal server error", code: "opencode_internal_error" }); };

  const completeMcpMutation = async (
    res: Response,
    action: string,
    name: string,
    applyChange: () => void
  ): Promise<void> => {
    applyChange();

    try {
      await refreshOpenCodeAfterConfigChange(`mcp ${action}`);
        const response = {
          success: true,
        requiresReload: true,
        message: `MCP server "${name}" ${action}d. Reloading interface…`,
          reloadDelayMs: clientReloadDelayMs,
        };
        if (!parseMcpMutationResponse(response).ok) throw new Error("invalid MCP mutation response");
        res.json(response);
    } catch (error) {
      console.error(`[API:MCP ${action}] Reload failed after config write:`, error);
        const response = {
        success: true,
        requiresReload: false,
        reloadFailed: true,
        message: `MCP server "${name}" ${action}d, but OpenCode reload failed.`,
          warning: "OpenCode reload failed after the MCP configuration changed",
        };
        res.json(response);
    }
  };

  app.get("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const agentName = parsedName.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }
      const sources = getAgentSources(agentName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : sources.json.exists
          ? sources.json.scope
          : null;

      const response = {
        name: agentName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists,
      };
      if (!parseConfigEntityResponse(response).ok) return internalError(res);
      res.json(response);
    } catch (error) {
      console.error("Failed to get agent sources:", error);
      internalError(res);
    }
  });

  app.get("/api/config/agents/:name/config", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const agentName = parsedName.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      const configInfo = getAgentConfig(agentName, directory);
      if (!parseConfigEntityResponse(configInfo).ok) return internalError(res);
      res.json(configInfo);
    } catch (error) {
      console.error("Failed to get agent config:", error);
      internalError(res);
    }
  });

  app.post("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const agentName = parsedName.value;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parsedBody = parseConfigEntityBody(req.body ?? {}); if (!parsedBody.ok) return invalidRequest(res);
      const { scope, ...config } = parsedBody.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      console.log("[Server] Creating agent:", agentName);
      console.log("[Server] Config received:", JSON.stringify(config, null, 2));
      console.log("[Server] Scope:", scope, "Working directory:", directory);

      createAgent(agentName, config, directory, scope);
      await refreshOpenCodeAfterConfigChange("agent creation", {
        agentName,
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} created successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("Failed to create agent:", error);
      internalError(res);
    }
  });

  app.patch("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const agentName = parsedName.value;
      const parsedBody = parseConfigEntityBody(req.body ?? {}); if (!parsedBody.ok) return invalidRequest(res); const updates = parsedBody.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      console.log(`[Server] Updating agent: ${agentName}`);
      console.log("[Server] Updates:", JSON.stringify(updates, null, 2));
      console.log("[Server] Working directory:", directory);

      updateAgent(agentName, updates, directory);
      await refreshOpenCodeAfterConfigChange("agent update");

      console.log(`[Server] Agent ${agentName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} updated successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("[Server] Failed to update agent:", error);
      console.error("[Server] Error stack:", (error as Error)?.stack);
      internalError(res);
    }
  });

  app.delete("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const agentName = parsedName.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      deleteAgent(agentName, directory);
      await refreshOpenCodeAfterConfigChange("agent deletion");

      res.json({
        success: true,
        requiresReload: true,
        message: `Agent ${agentName} deleted successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("Failed to delete agent:", error);
      internalError(res);
    }
  });

  app.get("/api/config/mcp", async (req: Request, res: Response) => {
    try {
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      const configs = listMcpConfigs(directory);
      const parsed = parseMcpConfigListResponse(configs);
      if (!parsed.ok) return res.status(500).json({ error: "Failed to list MCP configs", code: "opencode_invalid_response" });
      res.json(parsed.value);
    } catch (error) {
      console.error("[API:GET /api/config/mcp] Failed:", error);
      res.status(500).json({ error: "Failed to list MCP configs", code: "opencode_internal_error" });
    }
  });

  app.get("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      const config = getMcpConfig(name, directory);
      if (!config) {
        res.status(404).json({ error: `MCP server "${name}" not found` });
        return;
      }
      res.json(config);
    } catch (error) {
      console.error("[API:GET /api/config/mcp/:name] Failed:", error);
      res.status(500).json({ error: "Failed to get MCP config", code: "opencode_internal_error" });
    }
  });

  app.post("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parsed = parseMcpConfigRequest(req.body ?? {});
      if (!parsed.ok) return res.status(400).json({ error: "Invalid MCP configuration", code: "opencode_invalid_request" });
      const { scope, ...config } = parsed.value as { scope?: string; [key: string]: any };
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      console.log(`[API:POST /api/config/mcp] Creating MCP server: ${name}`);

      await completeMcpMutation(res, "create", String(name), () => {
        createMcpConfig(name, config, directory as any, scope as any);
      });
    } catch (error) {
      console.error("[API:POST /api/config/mcp/:name] Failed:", error);
      res.status(500).json({ error: "Failed to create MCP server", code: "opencode_internal_error" });
    }
  });

  app.patch("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const parsed = parseMcpConfigRequest(req.body ?? {});
      if (!parsed.ok) return res.status(400).json({ error: "Invalid MCP configuration", code: "opencode_invalid_request" });
      const updates = parsed.value;
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      console.log(`[API:PATCH /api/config/mcp] Updating MCP server: ${name}`);

      await completeMcpMutation(res, "update", String(name), () => {
        updateMcpConfig(name, updates, directory as any);
      });
    } catch (error) {
      console.error("[API:PATCH /api/config/mcp/:name] Failed:", error);
      res.status(500).json({ error: "Failed to update MCP server", code: "opencode_internal_error" });
    }
  });

  app.delete("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const { directory, error } = await resolveOptionalProjectDirectory(req);
      if (error) {
        res.status(400).json({ error });
        return;
      }
      console.log(`[API:DELETE /api/config/mcp] Deleting MCP server: ${name}`);

      await completeMcpMutation(res, "delete", String(name), () => {
        deleteMcpConfig(name, directory as any);
      });
    } catch (error) {
      console.error("[API:DELETE /api/config/mcp/:name] Failed:", error);
      res.status(500).json({ error: "Failed to delete MCP server", code: "opencode_internal_error" });
    }
  });

  app.get("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const commandName = parsedName.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }
      const sources = getCommandSources(commandName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : sources.json.exists
          ? sources.json.scope
          : null;

      const response = {
        name: commandName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists,
      };
      if (!parseConfigEntityResponse(response).ok) return internalError(res);
      res.json(response);
    } catch (error) {
      console.error("Failed to get command sources:", error);
      internalError(res);
    }
  });

  app.post("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const commandName = parsedName.value;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const parsedBody = parseConfigEntityBody(req.body ?? {}); if (!parsedBody.ok) return invalidRequest(res);
      const { scope, ...config } = parsedBody.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      console.log("[Server] Creating command:", commandName);
      console.log("[Server] Config received:", JSON.stringify(config, null, 2));
      console.log("[Server] Scope:", scope, "Working directory:", directory);

      createCommand(commandName, config, directory, scope);
      await refreshOpenCodeAfterConfigChange("command creation", {
        commandName,
      });

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} created successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("Failed to create command:", error);
      internalError(res);
    }
  });

  app.patch("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const commandName = parsedName.value;
      const parsedBody = parseConfigEntityBody(req.body ?? {}); if (!parsedBody.ok) return invalidRequest(res); const updates = parsedBody.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      console.log(`[Server] Updating command: ${commandName}`);
      console.log("[Server] Updates:", JSON.stringify(updates, null, 2));
      console.log("[Server] Working directory:", directory);

      updateCommand(commandName, updates, directory);
      await refreshOpenCodeAfterConfigChange("command update");

      console.log(`[Server] Command ${commandName} updated successfully`);

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} updated successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("[Server] Failed to update command:", error);
      console.error("[Server] Error stack:", (error as Error)?.stack);
      internalError(res);
    }
  });

  app.delete("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const parsedName = parseConfigEntityName(req.params.name); if (!parsedName.ok) return invalidRequest(res); const commandName = parsedName.value;
      const { directory } = await resolveProjectDirectory(req);
      if (!directory) {
        return invalidRequest(res);
      }

      deleteCommand(commandName, directory);
      await refreshOpenCodeAfterConfigChange("command deletion");

      res.json({
        success: true,
        requiresReload: true,
        message: `Command ${commandName} deleted successfully. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error("Failed to delete command:", error);
      internalError(res);
    }
  });
}
