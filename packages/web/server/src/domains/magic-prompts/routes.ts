import type { Express, Request, Response } from "express";
import { opencodeError, parseMagicPromptId, parseMagicPromptStateResponse, parseMagicPromptUpdateRequest } from "../../contracts/opencode.js";
import { createMagicPromptRuntime } from "./runtime.js";

export interface MagicPromptRoutesDeps {
  fsPromises: { mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<unknown>; readFile: (path: string, encoding: string) => Promise<string>; writeFile: (path: string, data: string, encoding: string) => Promise<void> };
  path: { join(...paths: string[]): string };
  openchamberDataDir: string;
}

export function registerMagicPromptRoutes(app: Express, dependencies: MagicPromptRoutesDeps): void {
  const { fsPromises, path, openchamberDataDir } = dependencies;

  const runtime = createMagicPromptRuntime({
    fsPromises: fsPromises as unknown as Parameters<typeof createMagicPromptRuntime>[0]["fsPromises"],
    path: path as unknown as Parameters<typeof createMagicPromptRuntime>[0]["path"],
    filePath: path.join(openchamberDataDir, "magic-prompts.json"),
  });

  app.get("/api/magic-prompts", async (_req: Request, res: Response) => {
    try {
      const state = await runtime.readPromptState();
      const parsed = parseMagicPromptStateResponse(state);
      return parsed.ok ? res.json(parsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
    } catch {
      return res.status(500).json(opencodeError("opencode_internal_error"));
    }
  });

  app.put("/api/magic-prompts/:id", async (req: Request, res: Response) => {
    const id = parseMagicPromptId(req.params?.id);
    const body = parseMagicPromptUpdateRequest(req.body);
    if (!id.ok || !body.ok) return res.status(400).json(opencodeError("opencode_invalid_request"));

    try {
      const state = await runtime.setOverride(id.value, body.value.text);
      const parsed = parseMagicPromptStateResponse(state);
      return parsed.ok ? res.json(parsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid prompt id") || message.includes("too long") || message.includes("cannot be empty") ? 400 : 500;
      return res.status(status).json(opencodeError(status === 400 ? "opencode_invalid_request" : "opencode_internal_error"));
    }
  });

  app.delete("/api/magic-prompts/:id", async (req: Request, res: Response) => {
    const id = parseMagicPromptId(req.params?.id);
    if (!id.ok) return res.status(400).json(opencodeError("opencode_invalid_request"));
    try {
      const state = await runtime.resetOverride(id.value);
      const parsed = parseMagicPromptStateResponse(state);
      return parsed.ok ? res.json(parsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid prompt id") ? 400 : 500;
      return res.status(status).json(opencodeError(status === 400 ? "opencode_invalid_request" : "opencode_internal_error"));
    }
  });

  app.delete("/api/magic-prompts", async (_req: Request, res: Response) => {
    try {
      const state = await runtime.resetAllOverrides();
      const parsed = parseMagicPromptStateResponse(state);
      return parsed.ok ? res.json(parsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
    } catch {
      return res.status(500).json(opencodeError("opencode_internal_error"));
    }
  });
}
