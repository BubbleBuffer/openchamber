/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Express, Request, Response } from "express";

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

  const completeMcpMutation = async (
    res: Response,
    action: string,
    name: string,
    applyChange: () => void
  ): Promise<void> => {
    applyChange();

    try {
      await refreshOpenCodeAfterConfigChange(`mcp ${action}`);
      res.json({
        success: true,
        requiresReload: true,
        message: `MCP server "${name}" ${action}d. Reloading interface…`,
        reloadDelayMs: clientReloadDelayMs,
      });
    } catch (error) {
      console.error(`[API:MCP ${action}] Reload failed after config write:`, error);
      res.json({
        success: true,
        requiresReload: false,
        reloadFailed: true,
        message: `MCP server "${name}" ${action}d, but OpenCode reload failed.`,
        warning:
          (error as Error)?.message || "OpenCode reload failed after the MCP configuration changed",
      });
    }
  };

  app.get("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }
      const sources = getAgentSources(agentName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : sources.json.exists
          ? sources.json.scope
          : null;

      res.json({
        name: agentName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists,
      });
    } catch (error) {
      console.error("Failed to get agent sources:", error);
      res.status(500).json({ error: "Failed to get agent configuration metadata" });
    }
  });

  app.get("/api/config/agents/:name/config", async (req: Request, res: Response) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }

      const configInfo = getAgentConfig(agentName, directory);
      res.json(configInfo);
    } catch (error) {
      console.error("Failed to get agent config:", error);
      res.status(500).json({ error: "Failed to get agent configuration" });
    }
  });

  app.post("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const agentName = req.params.name;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { scope, ...config } = req.body as { scope?: string; [key: string]: any };
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to create agent" });
    }
  });

  app.patch("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const agentName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to update agent" });
    }
  });

  app.delete("/api/config/agents/:name", async (req: Request, res: Response) => {
    try {
      const agentName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to delete agent" });
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
      res.json(configs);
    } catch (error) {
      console.error("[API:GET /api/config/mcp] Failed:", error);
      res.status(500).json({ error: (error as Error)?.message || "Failed to list MCP configs" });
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to get MCP config" });
    }
  });

  app.post("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { scope, ...config } = (req.body as { scope?: string; [key: string]: any }) || {};
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to create MCP server" });
    }
  });

  app.patch("/api/config/mcp/:name", async (req: Request, res: Response) => {
    try {
      const name = req.params.name;
      const updates = req.body;
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
      const err = error as { message?: string };
      if (err?.message === `MCP server "${req.params.name}" not found`) {
        res.status(404).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: err?.message || "Failed to update MCP server" });
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to delete MCP server" });
    }
  });

  app.get("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const commandName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
      }
      const sources = getCommandSources(commandName, directory);

      const scope = sources.md.exists
        ? sources.md.scope
        : sources.json.exists
          ? sources.json.scope
          : null;

      res.json({
        name: commandName,
        sources: sources,
        scope,
        isBuiltIn: !sources.md.exists && !sources.json.exists,
      });
    } catch (error) {
      console.error("Failed to get command sources:", error);
      res.status(500).json({ error: "Failed to get command configuration metadata" });
    }
  });

  app.post("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const commandName = req.params.name;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { scope, ...config } = req.body as { scope?: string; [key: string]: any };
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to create command" });
    }
  });

  app.patch("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const commandName = req.params.name;
      const updates = req.body;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to update command" });
    }
  });

  app.delete("/api/config/commands/:name", async (req: Request, res: Response) => {
    try {
      const commandName = req.params.name;
      const { directory, error } = await resolveProjectDirectory(req);
      if (!directory) {
        res.status(400).json({ error });
        return;
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
      res.status(500).json({ error: (error as Error)?.message || "Failed to delete command" });
    }
  });
}