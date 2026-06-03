import type { Express } from "express";

const MAX_BODY_BYTES = 4 * 1024 * 1024;

export interface SessionFoldersRoutesDeps {
  fsPromises: { mkdir(path: string, opts?: { recursive?: boolean }): Promise<unknown>; readFile(path: string, encoding: string): Promise<string>; writeFile(path: string, data: string, encoding: string): Promise<void>; rename(oldPath: string, newPath: string): Promise<void> };
  path: { join(...paths: string[]): string; dirname(p: string): string };
  openchamberDataDir: string;
}

export function registerSessionFoldersRoutes(app: Express, dependencies: SessionFoldersRoutesDeps): void {
  const { fsPromises, path, openchamberDataDir } = dependencies;

  const filePath = path.join(openchamberDataDir, "sessions-directories.json");

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
        return res.json({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 });
      }
      try {
        const parsed = JSON.parse(raw);
        return res.json(parsed);
      } catch {
        return res.json({ version: 1, foldersMap: {}, collapsedFolderIds: [], updatedAt: 0 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read session folders";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/session-folders", async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return res.status(400).json({ error: "Body must be an object" });
    }
    const serialized = JSON.stringify(body, null, 2);
    if (Buffer.byteLength(serialized, "utf8") > MAX_BODY_BYTES) {
      return res.status(413).json({ error: "Payload too large" });
    }
    try {
      await ensureDir();
      const tmp = `${filePath}.tmp`;
      await fsPromises.writeFile(tmp, serialized, "utf8");
      await fsPromises.rename(tmp, filePath);
      return res.json({ success: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to write session folders";
      return res.status(500).json({ error: message });
    }
  });
}
