import { describe, expect, it, vi } from "vitest";
import { registerConfigEntityRoutes } from "./config-entity-routes.js";

type Handler = (req: unknown, res: unknown) => Promise<void> | void;

const registry = () => {
  const handlers = new Map<string, Handler>();
  const app = ["get", "post", "patch", "delete"].reduce((result, method) => ({
    ...result,
    [method]: (path: string, handler: Handler) => handlers.set(`${method.toUpperCase()} ${path}`, handler),
  }), {} as Record<string, (path: string, handler: Handler) => void>);
  return { app: app as never, get: (method: string, path: string) => handlers.get(`${method} ${path}`)! };
};
const response = () => ({ statusCode: 200, body: undefined as unknown, status(code: number) { this.statusCode = code; return this; }, json(value: unknown) { this.body = value; return this; } });

describe("config entity route contracts", () => {
  it("rejects encoded agent and command traversal at every registered entity seam", async () => {
    const routes = registry();
    const createAgent = vi.fn();
    registerConfigEntityRoutes(routes.app, {
      resolveProjectDirectory: async () => ({ directory: "/repo" }), resolveOptionalProjectDirectory: async () => ({ directory: "/repo" }), refreshOpenCodeAfterConfigChange: async () => {}, clientReloadDelayMs: 1,
      getAgentSources: () => ({}), getAgentConfig: () => ({}), createAgent, updateAgent: () => {}, deleteAgent: () => {}, getCommandSources: () => ({}), createCommand: () => {}, updateCommand: () => {}, deleteCommand: () => {}, listMcpConfigs: () => [], getMcpConfig: () => null, createMcpConfig: () => {}, updateMcpConfig: () => {}, deleteMcpConfig: () => {},
    });
    for (const [method, path] of [
      ["GET", "/api/config/agents/:name"], ["GET", "/api/config/agents/:name/config"], ["POST", "/api/config/agents/:name"], ["PATCH", "/api/config/agents/:name"], ["DELETE", "/api/config/agents/:name"],
      ["GET", "/api/config/commands/:name"], ["POST", "/api/config/commands/:name"], ["PATCH", "/api/config/commands/:name"], ["DELETE", "/api/config/commands/:name"],
    ]) {
      const res = response();
      await routes.get(method, path)({ params: { name: "%2e%2e%2fsecret" }, body: { description: "x" } }, res);
      expect(res.statusCode).toBe(400);
    }
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("preserves path-safe legacy names including leading punctuation, spaces, and Unicode", async () => {
    const routes = registry();
    const createAgent = vi.fn(); const createCommand = vi.fn();
    registerConfigEntityRoutes(routes.app, {
      resolveProjectDirectory: async () => ({ directory: "/repo" }), resolveOptionalProjectDirectory: async () => ({ directory: "/repo" }), refreshOpenCodeAfterConfigChange: async () => {}, clientReloadDelayMs: 1,
      getAgentSources: () => ({}), getAgentConfig: () => ({}), createAgent, updateAgent: () => {}, deleteAgent: () => {}, getCommandSources: () => ({}), createCommand, updateCommand: () => {}, deleteCommand: () => {}, listMcpConfigs: () => [], getMcpConfig: () => null, createMcpConfig: () => {}, updateMcpConfig: () => {}, deleteMcpConfig: () => {},
    });
    for (const [path, name] of [["/api/config/agents/:name", ".review agent"], ["/api/config/commands/:name", "日本語 command"]]) {
      const res = response(); await routes.get("POST", path)({ params: { name }, body: {} }, res); expect(res.statusCode).toBe(200);
    }
    expect(createAgent).toHaveBeenCalledWith('.review agent', {}, '/repo', undefined);
    expect(createCommand).toHaveBeenCalledWith('日本語 command', {}, '/repo', undefined);
  });

  it("rejects explicit null bodies before all agent and command mutation services", async () => {
    const routes = registry(); const createAgent = vi.fn(); const updateAgent = vi.fn(); const createCommand = vi.fn(); const updateCommand = vi.fn();
    registerConfigEntityRoutes(routes.app, {
      resolveProjectDirectory: async () => ({ directory: "/repo" }), resolveOptionalProjectDirectory: async () => ({ directory: "/repo" }), refreshOpenCodeAfterConfigChange: async () => {}, clientReloadDelayMs: 1,
      getAgentSources: () => ({}), getAgentConfig: () => ({}), createAgent, updateAgent, deleteAgent: () => {}, getCommandSources: () => ({}), createCommand, updateCommand, deleteCommand: () => {}, listMcpConfigs: () => [], getMcpConfig: () => null, createMcpConfig: () => {}, updateMcpConfig: () => {}, deleteMcpConfig: () => {},
    });
    for (const [method, path] of [["POST", "/api/config/agents/:name"], ["PATCH", "/api/config/agents/:name"], ["POST", "/api/config/commands/:name"], ["PATCH", "/api/config/commands/:name"]]) {
      const res = response(); await routes.get(method, path)({ params: { name: 'safe' }, body: null }, res); expect(res.statusCode).toBe(400);
    }
    expect(createAgent).not.toHaveBeenCalled(); expect(updateAgent).not.toHaveBeenCalled(); expect(createCommand).not.toHaveBeenCalled(); expect(updateCommand).not.toHaveBeenCalled();
  });

  it("rejects explicit null MCP create and update bodies before mutation services", async () => {
    const routes = registry(); const createMcpConfig = vi.fn(); const updateMcpConfig = vi.fn();
    registerConfigEntityRoutes(routes.app, {
      resolveProjectDirectory: async () => ({ directory: "/repo" }), resolveOptionalProjectDirectory: async () => ({ directory: "/repo" }), refreshOpenCodeAfterConfigChange: async () => {}, clientReloadDelayMs: 1,
      getAgentSources: () => ({}), getAgentConfig: () => ({}), createAgent: () => {}, updateAgent: () => {}, deleteAgent: () => {}, getCommandSources: () => ({}), createCommand: () => {}, updateCommand: () => {}, deleteCommand: () => {}, listMcpConfigs: () => [], getMcpConfig: () => null, createMcpConfig, updateMcpConfig, deleteMcpConfig: () => {},
    });
    for (const [method, path] of [["POST", "/api/config/mcp/:name"], ["PATCH", "/api/config/mcp/:name"]]) {
      const res = response(); await routes.get(method, path)({ params: { name: 'safe' }, body: null }, res);
      expect(res.statusCode).toBe(400); expect(res.body).toEqual({ error: 'Invalid MCP configuration', code: 'opencode_invalid_request' });
    }
    expect(createMcpConfig).not.toHaveBeenCalled(); expect(updateMcpConfig).not.toHaveBeenCalled();
  });
});
