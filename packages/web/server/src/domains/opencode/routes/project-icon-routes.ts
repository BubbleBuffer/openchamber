import type { Express, Request, Response } from "express";

interface ProjectIconRoutesDeps {
  fsPromises: typeof import("fs/promises");
  path: typeof import("path");
  crypto: typeof import("crypto");
  openchamberDataDir: string;
  sanitizeProjects: (input: unknown) => Array<Record<string, unknown>> | undefined;
  readSettingsFromDiskMigrated: () => Promise<any>;
  persistSettings: (changes: object) => Promise<any>;
  createFsSearchRuntime: (deps: {
    fsPromises: typeof import("fs/promises");
    path: typeof import("path");
    spawn: typeof import("child_process").spawn;
    resolveGitBinaryForSpawn: () => string;
  }) => any;
  spawn: typeof import("child_process").spawn;
  resolveGitBinaryForSpawn: () => string;
}

interface FindProjectResult {
  projects: Array<Record<string, unknown>>;
  index: number;
  project: Record<string, unknown> | null;
}

interface ParsedDataUrl {
  ok: true;
  mime: string;
  bytes: Buffer;
}

interface ParseDataUrlError {
  ok: false;
  error: string;
}

type ParseDataUrlResult = ParsedDataUrl | ParseDataUrlError;

export function registerProjectIconRoutes(
  app: Express,
  dependencies: ProjectIconRoutesDeps
): void {
  const {
    fsPromises,
    path: pathModule,
    crypto,
    openchamberDataDir,
    sanitizeProjects,
    readSettingsFromDiskMigrated,
    persistSettings,
    createFsSearchRuntime,
    spawn,
    resolveGitBinaryForSpawn,
  } = dependencies;

  const projectIconsDirPath = pathModule.join(openchamberDataDir, "project-icons");
  const projectIconMimeToExtension: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "image/x-icon": "ico",
  };
  const projectIconExtensionToMime = Object.fromEntries(
    Object.entries(projectIconMimeToExtension).map(([mime, ext]) => [ext, mime])
  );
  const projectIconSupportedMimes = new Set(Object.keys(projectIconMimeToExtension));
  const projectIconMaxBytes = 5 * 1024 * 1024;
  const projectIconThemeColors: Record<string, string> = {
    light: "#111111",
    dark: "#f5f5f5",
  };
  const projectIconHexColorPattern = /^#(?:[\da-fA-F]{3}|[\da-fA-F]{4}|[\da-fA-F]{6}|[\da-fA-F]{8})$/;

  const normalizeProjectIconMime = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "image/jpg") {
      return "image/jpeg";
    }
    if (projectIconSupportedMimes.has(normalized)) {
      return normalized;
    }
    return null;
  };

  const projectIconBaseName = (projectId: string): string => {
    const hash = crypto.createHash("sha1").update(projectId).digest("hex");
    return `project-${hash}`;
  };

  const projectIconPathForMime = (projectId: string, mime: string): string | null => {
    const normalizedMime = normalizeProjectIconMime(mime);
    if (!normalizedMime) {
      return null;
    }
    const ext = projectIconMimeToExtension[normalizedMime];
    return pathModule.join(projectIconsDirPath, `${projectIconBaseName(projectId)}.${ext}`);
  };

  const projectIconPathCandidates = (projectId: string): string[] => {
    const base = projectIconBaseName(projectId);
    return Object.values(projectIconMimeToExtension).map((ext) =>
      pathModule.join(projectIconsDirPath, `${base}.${ext}`)
    );
  };

  const removeProjectIconFiles = async (projectId: string, keepPath?: string): Promise<void> => {
    const candidates = projectIconPathCandidates(projectId);
    await Promise.all(
      candidates.map(async (candidatePath) => {
        if (keepPath && candidatePath === keepPath) {
          return;
        }
        try {
          await fsPromises.unlink(candidatePath);
        } catch (error) {
          const err = error as { code?: string } | null;
          if (!err || typeof err !== "object" || err.code !== "ENOENT") {
            throw error;
          }
        }
      })
    );
  };

  const parseProjectIconDataUrl = (value: unknown): ParseDataUrlResult => {
    if (typeof value !== "string") {
      return { ok: false, error: "dataUrl is required" };
    }

    const trimmed = value.trim();
    const match = trimmed.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (!match) {
      return { ok: false, error: "Invalid dataUrl format" };
    }

    const mime = normalizeProjectIconMime(match[1]);
    if (!mime || !["image/png", "image/jpeg", "image/svg+xml"].includes(mime)) {
      return { ok: false, error: "Icon must be PNG, JPEG, or SVG" };
    }

    try {
      const base64 = match[2].replace(/\s+/g, "");
      const bytes = Buffer.from(base64, "base64");
      if (bytes.length === 0) {
        return { ok: false, error: "Icon content is empty" };
      }
      if (bytes.length > projectIconMaxBytes) {
        return { ok: false, error: "Icon exceeds size limit (5 MB)" };
      }
      return { ok: true, mime, bytes };
    } catch {
      return { ok: false, error: "Failed to decode icon data" };
    }
  };

  const normalizeProjectIconThemeVariant = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim().toLowerCase();
    if (normalized === "light" || normalized === "dark") {
      return normalized;
    }
    return null;
  };

  const normalizeProjectIconColor = (value: unknown): string | null => {
    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    if (!projectIconHexColorPattern.test(normalized)) {
      return null;
    }
    return normalized;
  };

  const applyProjectIconSvgTheme = (
    svgMarkup: string,
    themeVariant: string | null,
    iconColor: string | null
  ): string => {
    if (typeof svgMarkup !== "string") {
      return svgMarkup;
    }

    const color = iconColor || (themeVariant ? projectIconThemeColors[themeVariant] : null);
    if (!color) {
      return svgMarkup;
    }

    const svgTagIndex = svgMarkup.search(/<svg\b/i);
    if (svgTagIndex === -1) {
      return svgMarkup;
    }

    const svgOpenTagEndIndex = svgMarkup.indexOf(">", svgTagIndex);
    if (svgOpenTagEndIndex === -1) {
      return svgMarkup;
    }

    const overrideStyle = `<style data-openchamber-theme-icon="1">:root{color:${color}!important;}</style>`;
    return `${svgMarkup.slice(0, svgOpenTagEndIndex + 1)}${overrideStyle}${svgMarkup.slice(svgOpenTagEndIndex + 1)}`;
  };

  const findProjectById = (
    settings: any,
    projectId: string
  ): FindProjectResult => {
    const projects = sanitizeProjects(settings?.projects) || [];
    const index = projects.findIndex((project) => (project as any).id === projectId);
    if (index === -1) {
      return { projects, index: -1, project: null };
    }
    return { projects, index, project: projects[index] };
  };

  const fsSearchRuntime = createFsSearchRuntime({
    fsPromises,
    path: pathModule,
    spawn,
    resolveGitBinaryForSpawn,
  });

  app.get("/api/projects/:projectId/icon", async (req: Request, res: Response) => {
    const projectId =
      typeof req.params.projectId === "string" ? req.params.projectId.trim() : "";
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      const { project } = findProjectById(settings, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const metadataMime = normalizeProjectIconMime((project as any).iconImage?.mime);
      const preferredPath = metadataMime ? projectIconPathForMime(projectId, metadataMime) : null;
      const candidates = preferredPath
        ? [preferredPath, ...projectIconPathCandidates(projectId).filter((c) => c !== preferredPath)]
        : projectIconPathCandidates(projectId);

      const themeQuery = Array.isArray(req.query?.theme)
        ? req.query.theme[0]
        : req.query?.theme;
      const requestedThemeVariant = normalizeProjectIconThemeVariant(themeQuery);
      const iconColorQuery = Array.isArray(req.query?.iconColor)
        ? req.query.iconColor[0]
        : req.query?.iconColor;
      const requestedIconColor = normalizeProjectIconColor(iconColorQuery);

      for (const iconPath of candidates) {
        try {
          const data = await fsPromises.readFile(iconPath);
          const ext = pathModule.extname(iconPath).slice(1).toLowerCase();
          const resolvedMime =
            metadataMime || projectIconExtensionToMime[ext] || "application/octet-stream";
          const contentType =
            resolvedMime === "image/svg+xml" ? "image/svg+xml; charset=utf-8" : resolvedMime;

          if (resolvedMime === "image/svg+xml" && requestedThemeVariant) {
            const svgMarkup = data.toString("utf8");
            const themedSvgMarkup = applyProjectIconSvgTheme(
              svgMarkup,
              requestedThemeVariant,
              requestedIconColor
            );
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.send(themedSvgMarkup);
            return;
          }

          if (resolvedMime === "image/svg+xml" && requestedIconColor) {
            const svgMarkup = data.toString("utf8");
            const themedSvgMarkup = applyProjectIconSvgTheme(
              svgMarkup,
              requestedThemeVariant,
              requestedIconColor
            );
            res.setHeader("Content-Type", contentType);
            res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
            res.send(themedSvgMarkup);
            return;
          }

          res.setHeader("Content-Type", contentType);
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          res.send(data);
          return;
        } catch (error) {
          const err = error as { code?: string } | null;
          if (!err || typeof err !== "object" || err.code !== "ENOENT") {
            console.warn("Failed to read project icon:", error);
            res.status(500).json({ error: "Failed to read project icon" });
            return;
          }
        }
      }

      res.status(404).json({ error: "Project icon not found" });
    } catch (error) {
      console.warn("Failed to load project icon:", error);
      res.status(500).json({ error: "Failed to load project icon" });
    }
  });

  app.put("/api/projects/:projectId/icon", async (req: Request, res: Response) => {
    const projectId =
      typeof req.params.projectId === "string" ? req.params.projectId.trim() : "";
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    const parsed = parseProjectIconDataUrl(req.body?.dataUrl);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      const { projects, project } = findProjectById(settings, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const iconPath = projectIconPathForMime(projectId, parsed.mime);
      if (!iconPath) {
        res.status(400).json({ error: "Unsupported icon format" });
        return;
      }

      await fsPromises.mkdir(projectIconsDirPath, { recursive: true });
      await fsPromises.writeFile(iconPath, parsed.bytes);
      await removeProjectIconFiles(projectId, iconPath);

      const updatedAt = Date.now();
      const nextProjects = projects.map((entry) =>
        (entry as any).id === projectId
          ? { ...entry, iconImage: { mime: parsed.mime, updatedAt, source: "custom" } }
          : entry
      );
      const updatedSettings = await persistSettings({ projects: nextProjects });
      const updatedProject =
        (updatedSettings.projects || []).find((entry: any) => entry.id === projectId) || null;

      res.json({ project: updatedProject, settings: updatedSettings });
    } catch (error) {
      console.warn("Failed to upload project icon:", error);
      res.status(500).json({ error: "Failed to upload project icon" });
    }
  });

  app.delete("/api/projects/:projectId/icon", async (req: Request, res: Response) => {
    const projectId =
      typeof req.params.projectId === "string" ? req.params.projectId.trim() : "";
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      const { projects, project } = findProjectById(settings, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      await removeProjectIconFiles(projectId);

      const nextProjects = projects.map((entry) =>
        (entry as any).id === projectId ? { ...entry, iconImage: null } : entry
      );
      const updatedSettings = await persistSettings({ projects: nextProjects });
      const updatedProject =
        (updatedSettings.projects || []).find((entry: any) => entry.id === projectId) || null;

      res.json({ project: updatedProject, settings: updatedSettings });
    } catch (error) {
      console.warn("Failed to remove project icon:", error);
      res.status(500).json({ error: "Failed to remove project icon" });
    }
  });

  app.post("/api/projects/:projectId/icon/discover", async (req: Request, res: Response) => {
    const projectId =
      typeof req.params.projectId === "string" ? req.params.projectId.trim() : "";
    if (!projectId) {
      res.status(400).json({ error: "projectId is required" });
      return;
    }

    try {
      const settings = await readSettingsFromDiskMigrated();
      const { projects, project } = findProjectById(settings, projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }

      const force = req.body?.force === true;
      if ((project as any).iconImage?.source === "custom" && !force) {
        res.json({
          project,
          skipped: true,
          reason: "custom-icon-present",
        });
        return;
      }

      const faviconCandidates = await fsSearchRuntime.searchFilesystemFiles(project.path, {
        limit: 200,
        query: "favicon",
        includeHidden: true,
        respectGitignore: false,
      });

      const filtered = faviconCandidates
        .filter((entry: any) => /(^|\/)favicon\.(ico|png|svg|jpg|jpeg|webp)$/i.test(entry.path))
        .sort((a: any, b: any) => a.path.length - b.path.length);

      const selected = filtered[0];
      if (!selected) {
        res.status(404).json({ error: "No favicon found in project" });
        return;
      }

      const ext = pathModule.extname(selected.path).slice(1).toLowerCase();
      const mime = projectIconExtensionToMime[ext] || null;
      if (!mime) {
        res.status(415).json({ error: "Unsupported favicon format" });
        return;
      }

      const bytes = await fsPromises.readFile(selected.path);
      if (bytes.length === 0) {
        res.status(400).json({ error: "Discovered icon is empty" });
        return;
      }
      if (bytes.length > projectIconMaxBytes) {
        res.status(400).json({ error: "Discovered icon exceeds size limit (5 MB)" });
        return;
      }

      const iconPath = projectIconPathForMime(projectId, mime);
      if (!iconPath) {
        res.status(415).json({ error: "Unsupported favicon format" });
        return;
      }

      await fsPromises.mkdir(projectIconsDirPath, { recursive: true });
      await fsPromises.writeFile(iconPath, bytes);
      await removeProjectIconFiles(projectId, iconPath);

      const updatedAt = Date.now();
      const nextProjects = projects.map((entry) =>
        (entry as any).id === projectId
          ? { ...entry, iconImage: { mime, updatedAt, source: "auto" } }
          : entry
      );
      const updatedSettings = await persistSettings({ projects: nextProjects });
      const updatedProject =
        (updatedSettings.projects || []).find((entry: any) => entry.id === projectId) || null;

      res.json({
        project: updatedProject,
        settings: updatedSettings,
        discoveredPath: selected.path,
      });
    } catch (error) {
      console.warn("Failed to discover project icon:", error);
      res.status(500).json({ error: "Failed to discover project icon" });
    }
  });
}