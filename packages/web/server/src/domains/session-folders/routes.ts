import type { Express } from "express";
import { opencodeError, parseSessionFoldersMutationResponse, parseSessionFoldersResponse, parseSessionFoldersUpdateRequest } from "../../contracts/opencode.js";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface SessionFoldersRoutesDeps {
  fsPromises: { mkdir(path: string, opts?: { recursive?: boolean }): Promise<unknown>; readFile(path: string, encoding: string): Promise<string>; writeFile(path: string, data: string, encoding: string): Promise<void>; rename(oldPath: string, newPath: string): Promise<void> };
  path: { join(...paths: string[]): string; dirname(p: string): string };
  openchamberDataDir: string;
}

export function registerSessionFoldersRoutes(app: Express, dependencies: SessionFoldersRoutesDeps): void {
  const { fsPromises, path, openchamberDataDir } = dependencies;

  const filePath = path.join(openchamberDataDir, "sessions-directories.json");
  const emptyState = { version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 };
  const sendState = (res: { status(code: number): { json(value: unknown): unknown }; json(value: unknown): unknown }, state: unknown) => {
    const parsed = parseSessionFoldersResponse(state);
    return parsed.ok ? res.json(parsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
  };

  const ensureDir = async (): Promise<void> => {
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
  };

  app.get("/api/session-folders", async (_req, res) => {
    try {
      const raw = await fsPromises.readFile(filePath, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error && error.code === "ENOENT") return null;
        throw error;
      });
      if (!raw) {
        return sendState(res, emptyState);
      }
      try {
        const parsed = JSON.parse(raw);
        return sendState(res, parsed);
      } catch {
        return sendState(res, emptyState);
      }
    } catch {
      return res.status(500).json(opencodeError("opencode_internal_error"));
    }
  });

  app.post("/api/session-folders", async (req, res) => {
    const parsed = parseSessionFoldersUpdateRequest(req.body);
    if (!parsed.ok) return res.status(400).json(opencodeError("opencode_invalid_request"));
    const serialized = JSON.stringify(parsed.value, null, 2);
    if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
      return res.status(413).json(opencodeError("opencode_invalid_request"));
    }
    try {
      await ensureDir();
      const tmp = `${filePath}.tmp`;
      await fsPromises.writeFile(tmp, serialized, "utf8");
      await fsPromises.rename(tmp, filePath);
      const response = { success: true };
      const responseParsed = parseSessionFoldersMutationResponse(response);
      return responseParsed.ok ? res.json(responseParsed.value) : res.status(500).json(opencodeError("opencode_invalid_response"));
    } catch {
      return res.status(500).json(opencodeError("opencode_internal_error"));
    }
  });
}
