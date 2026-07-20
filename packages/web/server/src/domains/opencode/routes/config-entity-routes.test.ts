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
});
