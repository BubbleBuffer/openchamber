import type { Express, Request, Response } from "express";
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
      res.json(state);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : "Failed to read magic prompts" });
    }
  });

  app.put("/api/magic-prompts/:id", async (req: Request, res: Response) => {
    const id = typeof req.params?.id === "string" ? req.params.id : "";
    const text = typeof req.body?.text === "string" ? req.body.text : null;
    if (text === null) {
      return res.status(400).json({ error: "text is required" });
    }

    try {
      const state = await runtime.setOverride(id, text);
      return res.json(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid prompt id") || message.includes("too long") || message.includes("cannot be empty") ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  });

  app.delete("/api/magic-prompts/:id", async (req: Request, res: Response) => {
    const id = typeof req.params?.id === "string" ? req.params.id : "";
    try {
      const state = await runtime.resetOverride(id);
      return res.json(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = message.includes("Invalid prompt id") ? 400 : 500;
      return res.status(status).json({ error: message });
    }
  });

  app.delete("/api/magic-prompts", async (_req: Request, res: Response) => {
    try {
      const state = await runtime.resetAllOverrides();
      return res.json(state);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ error: message || "Failed to reset magic prompts" });
    }
  });
}
