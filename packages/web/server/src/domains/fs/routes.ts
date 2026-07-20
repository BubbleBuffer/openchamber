import type { Express, Request, Response } from "express";
import type { SpawnOptions } from "child_process";
import { apiError } from "../../contracts/common.js";
import { parseFsListQuery, parseFsPathQuery, parseFsPathRequest, parseFsRawQuery, parseFsRenameRequest, parseFsWriteRequest } from "../../contracts/files.js";

const EXEC_JOB_TTL_MS = 30 * 60 * 1000;

interface CommandResult {
  command: string;
  success: boolean;
  exitCode: number | undefined;
  stdout: string;
  stderr: string;
  error?: string;
}

interface ExecJob {
  jobId: string;
  status: "queued" | "running" | "done";
  success: boolean | null;
  commands: string[];
  resolvedCwd: string;
  shell: string;
  shellFlag: string;
  results: CommandResult[];
  startedAt: number;
  finishedAt: number | null;
  updatedAt: number;
}

type NormalizeDirectoryPathFn = (targetPath: string) => string | null;
type ResolveProjectDirectoryFn = (req: Request) => Promise<{ directory?: string; error?: string }>;
type BuildAugmentedPathFn = () => string;
type ResolveGitBinaryForSpawnFn = () => string;

export interface FsRoutesDeps {
  os: typeof import("os");
  path: typeof import("path");
  fsPromises: typeof import("fs/promises");
  spawn: typeof import("child_process").spawn;
  crypto: typeof import("crypto");
  normalizeDirectoryPath: NormalizeDirectoryPathFn;
  resolveProjectDirectory: ResolveProjectDirectoryFn;
  buildAugmentedPath: BuildAugmentedPathFn;
  resolveGitBinaryForSpawn: ResolveGitBinaryForSpawnFn;
  openchamberUserConfigRoot: string;
}

interface ResolvedPath {
  ok: true;
  base: string;
  resolved: string;
}

interface PathError {
  ok: false;
  error: string;
}

type ResolveResult = ResolvedPath | PathError;

const createCommandTimeoutMs = (): number => {
  const raw = Number(process.env.OPENCHAMBER_FS_EXEC_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return 5 * 60 * 1000;
};

const isPathWithinRoot = (
  resolvedPath: string,
  rootPath: string,
  pathModule: typeof import("path")
): boolean => {
  const resolvedRoot = pathModule.resolve(rootPath);
  const relative = pathModule.relative(resolvedRoot, resolvedPath);
  if (relative.startsWith("..") || pathModule.isAbsolute(relative)) {
    return false;
  }
  return true;
};

const resolveWorkspacePath = ({
  targetPath,
  baseDirectory,
  path: pathModule,
  os,
  normalizeDirectoryPath,
  openchamberUserConfigRoot,
}: {
  targetPath: string;
  baseDirectory: string | undefined;
  path: typeof import("path");
  os: typeof import("os");
  normalizeDirectoryPath: NormalizeDirectoryPathFn;
  openchamberUserConfigRoot: string;
}): ResolveResult => {
  const normalized = normalizeDirectoryPath(targetPath);
  if (!normalized || typeof normalized !== "string") {
    return { ok: false, error: "Path is required" };
  }

  const resolved = pathModule.resolve(normalized);
  const resolvedBase = pathModule.resolve(baseDirectory || os.homedir());

  if (isPathWithinRoot(resolved, resolvedBase, pathModule)) {
    return { ok: true, base: resolvedBase, resolved };
  }

  if (isPathWithinRoot(resolved, openchamberUserConfigRoot, pathModule)) {
    return { ok: true, base: pathModule.resolve(openchamberUserConfigRoot), resolved };
  }

  return { ok: false, error: "Path is outside of active workspace" };
};

const resolveWorkspacePathFromWorktrees = async ({
  targetPath,
  baseDirectory,
  path: pathModule,
  os,
  normalizeDirectoryPath,
}: {
  targetPath: string;
  baseDirectory: string | undefined;
  path: typeof import("path");
  os: typeof import("os");
  normalizeDirectoryPath: NormalizeDirectoryPathFn;
}): Promise<ResolveResult> => {
  const normalized = normalizeDirectoryPath(targetPath);
  if (!normalized || typeof normalized !== "string") {
    return { ok: false, error: "Path is required" };
  }

  const resolved = pathModule.resolve(normalized);
  const resolvedBase = pathModule.resolve(baseDirectory || os.homedir());

  try {
    const { getWorktrees } = (await import("../git/index.js")) as { getWorktrees: (dir: string) => Promise<Array<{ path?: string; worktree?: string }>> };
    const worktrees = await getWorktrees(resolvedBase);

    for (const worktree of worktrees) {
      const candidatePath =
        typeof worktree?.path === "string"
          ? worktree.path
          : typeof worktree?.worktree === "string"
            ? worktree.worktree
            : "";
      const candidate = normalizeDirectoryPath(candidatePath);
      if (!candidate) {
        continue;
      }
      const candidateResolved = pathModule.resolve(candidate);
      if (isPathWithinRoot(resolved, candidateResolved, pathModule)) {
        return { ok: true, base: candidateResolved, resolved };
      }
    }
  } catch (error) {
    console.warn("Failed to resolve worktree roots:", error);
  }

  return { ok: false, error: "Path is outside of active workspace" };
};

const resolveWorkspacePathFromContext = async ({
  req,
  targetPath,
  resolveProjectDirectory,
  path: pathModule,
  os,
  normalizeDirectoryPath,
  openchamberUserConfigRoot,
}: {
  req: Request;
  targetPath: string;
  resolveProjectDirectory: ResolveProjectDirectoryFn;
  path: typeof import("path");
  os: typeof import("os");
  normalizeDirectoryPath: NormalizeDirectoryPathFn;
  openchamberUserConfigRoot: string;
}): Promise<ResolveResult> => {
  const resolvedProject = await resolveProjectDirectory(req);
  if (!resolvedProject.directory) {
    return { ok: false, error: resolvedProject.error || "Active workspace is required" };
  }

  const resolved = resolveWorkspacePath({
    targetPath,
    baseDirectory: resolvedProject.directory,
    path: pathModule,
    os,
    normalizeDirectoryPath,
    openchamberUserConfigRoot,
  });
  if (resolved.ok || resolved.error !== "Path is outside of active workspace") {
    return resolved;
  }

  return resolveWorkspacePathFromWorktrees({
    targetPath,
    baseDirectory: resolvedProject.directory,
    path: pathModule,
    os,
    normalizeDirectoryPath,
  });
};

const runCommandInDirectory = ({
  shell,
  shellFlag,
  command,
  resolvedCwd,
  spawn: spawnFn,
  buildAugmentedPath,
  commandTimeoutMs,
}: {
  shell: string;
  shellFlag: string;
  command: string;
  resolvedCwd: string;
  spawn: typeof import("child_process").spawn;
  buildAugmentedPath: BuildAugmentedPathFn;
  commandTimeoutMs: number;
}): Promise<CommandResult> => {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const envPath = buildAugmentedPath();
    const execEnv = { ...process.env, PATH: envPath };

    const child = spawnFn(shell, [shellFlag, command], {
      cwd: resolvedCwd,
      env: execEnv,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    } as SpawnOptions);

    const timeout = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }, commandTimeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on("error", (error: Error) => {
      clearTimeout(timeout);
      resolve({
        command,
        success: false,
        exitCode: undefined,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: (error && error.message) || "Command execution failed",
      });
    });

    child.on("close", (code: number | null, signal: string | null) => {
      clearTimeout(timeout);
      const exitCode = typeof code === "number" ? code : undefined;
      const base = {
        command,
        success: exitCode === 0 && !timedOut,
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      if (timedOut) {
        resolve({
          ...base,
          success: false,
          error:
            `Command timed out after ${commandTimeoutMs}ms` + (signal ? ` (${signal})` : ""),
        });
        return;
      }

      resolve(base);
    });
  });
};

export function registerFsRoutes(app: Express, dependencies: FsRoutesDeps): void {
  const {
    os,
    path: pathModule,
    fsPromises,
    spawn: spawnFn,
    crypto,
    normalizeDirectoryPath,
    resolveProjectDirectory,
    buildAugmentedPath,
    resolveGitBinaryForSpawn,
    openchamberUserConfigRoot,
  } = dependencies;

  const execJobs = new Map<string, ExecJob>();
  const commandTimeoutMs = createCommandTimeoutMs();

  const pruneExecJobs = (): void => {
    const now = Date.now();
    for (const [jobId, job] of execJobs.entries()) {
      if (!job || typeof job !== "object") {
        execJobs.delete(jobId);
        continue;
      }
      const updatedAt = typeof job.updatedAt === "number" ? job.updatedAt : 0;
      if (updatedAt && now - updatedAt > EXEC_JOB_TTL_MS) {
        execJobs.delete(jobId);
      }
    }
  };

  const runExecJob = async (job: ExecJob): Promise<void> => {
    job.status = "running";
    job.updatedAt = Date.now();

    const results: CommandResult[] = [];
    for (const command of job.commands) {
      if (typeof command !== "string" || !command.trim()) {
        results.push({ command, success: false, exitCode: undefined, stdout: "", stderr: "", error: "Invalid command" });
        continue;
      }

      try {
        const result = await runCommandInDirectory({
          shell: job.shell,
          shellFlag: job.shellFlag,
          command,
          resolvedCwd: job.resolvedCwd,
          spawn: spawnFn,
          buildAugmentedPath,
          commandTimeoutMs,
        });
        results.push(result);
      } catch (error) {
        results.push({
          command,
          success: false,
          exitCode: undefined,
          stdout: "",
          stderr: "",
          error: (error as Error)?.message || "Command execution failed",
        });
      }

      job.results = results;
      job.updatedAt = Date.now();
    }

    job.results = results;
    job.success = results.every((r) => r.success);
    job.status = "done";
    job.finishedAt = Date.now();
    job.updatedAt = Date.now();
  };

  app.get("/api/fs/home", (_req: Request, res: Response) => {
    try {
      const home = os.homedir();
      if (!home || typeof home !== "string" || home.length === 0) {
        return res.status(500).json({ error: "Failed to resolve home directory" });
      }
      return res.json({ home });
    } catch (error) {
      console.error("Failed to resolve home directory:", error);
      return res
        .status(500)
        .json(apiError("internal_error"));
    }
  });

  app.post("/api/fs/mkdir", async (req: Request, res: Response) => {
    try {
      const body = parseFsPathRequest(req.body);
      if (!body.ok) {
        return res.status(400).json({ error: "Path is required", code: "fs_invalid_path" });
      }
      const dirPath = body.value.path;
      const allowOutsideWorkspace = (req.body as Record<string, unknown>).allowOutsideWorkspace === true;

      let resolvedPath = "";
      if (allowOutsideWorkspace) {
        resolvedPath = pathModule.resolve(normalizeDirectoryPath(dirPath) || dirPath);
      } else {
        const resolved = await resolveWorkspacePathFromContext({
          req,
          targetPath: dirPath,
          resolveProjectDirectory,
          path: pathModule,
          os,
          normalizeDirectoryPath,
          openchamberUserConfigRoot,
        });
        if (!resolved.ok) {
          return res.status(400).json({ error: resolved.error });
        }
        resolvedPath = resolved.resolved;
      }

      await fsPromises.mkdir(resolvedPath, { recursive: true });
      return res.json({ success: true, path: resolvedPath });
    } catch (error) {
      console.error("Failed to create directory:", error);
      return res
        .status(500)
        .json(apiError("internal_error"));
    }
  });

  app.get("/api/fs/stat", async (req: Request, res: Response) => {
    const query = parseFsPathQuery(req.query);
    if (!query.ok) return res.status(400).json({ error: "Path is required", code: "fs_invalid_path" });
    const filePath = query.value.path;

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const [canonicalPath, canonicalBase] = await Promise.all([
        fsPromises.realpath(resolved.resolved),
        fsPromises.realpath(resolved.base).catch(() => pathModule.resolve(resolved.base)),
      ]);

      if (!isPathWithinRoot(canonicalPath, canonicalBase, pathModule)) {
        return res.status(403).json({ error: "Access to file denied" });
      }

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: "Specified path is not a file" });
      }

      return res.json({
        path: canonicalPath,
        isFile: true,
        size: stats.size,
        mtimeMs: stats.mtimeMs,
      });
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access to file denied" });
      }
      console.error("Failed to stat file:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.get("/api/fs/read", async (req: Request, res: Response) => {
    const query = parseFsPathQuery(req.query);
    if (!query.ok) return res.status(400).json({ error: "Path is required", code: "fs_invalid_path" });
    const filePath = query.value.path;

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const [canonicalPath, canonicalBase] = await Promise.all([
        fsPromises.realpath(resolved.resolved),
        fsPromises.realpath(resolved.base).catch(() => pathModule.resolve(resolved.base)),
      ]);

      if (!isPathWithinRoot(canonicalPath, canonicalBase, pathModule)) {
        return res.status(403).json({ error: "Access to file denied" });
      }

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: "Specified path is not a file" });
      }

      const content = await fsPromises.readFile(canonicalPath, "utf8");
      return res.type("text/plain").send(content);
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access to file denied" });
      }
      console.error("Failed to read file:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.get("/api/fs/raw", async (req: Request, res: Response) => {
    const query = parseFsRawQuery(req.query);
    if (!query.ok) return res.status(400).json({ error: "Path is required", code: "fs_invalid_path" });
    const filePath = query.value.path;

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      const [canonicalPath, canonicalBase] = await Promise.all([
        fsPromises.realpath(resolved.resolved),
        fsPromises.realpath(resolved.base).catch(() => pathModule.resolve(resolved.base)),
      ]);

      if (!isPathWithinRoot(canonicalPath, canonicalBase, pathModule)) {
        return res.status(403).json({ error: "Access to file denied" });
      }

      const stats = await fsPromises.stat(canonicalPath);
      if (!stats.isFile()) {
        return res.status(400).json({ error: "Specified path is not a file" });
      }

      const ext = pathModule.extname(canonicalPath).toLowerCase();
      const mimeMap: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".bmp": "image/bmp",
        ".avif": "image/avif",
      };
      const mimeType = mimeMap[ext] || "application/octet-stream";

      const download = query.value.download;
      if (download) {
        const fileName = pathModule.basename(canonicalPath);
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      }

      const content = await fsPromises.readFile(canonicalPath);
      res.setHeader("Cache-Control", "no-store");
      return res.type(mimeType).send(content);
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return res.status(404).json({ error: "File not found" });
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access to file denied" });
      }
      console.error("Failed to read raw file:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/fs/write", async (req: Request, res: Response) => {
    const body = parseFsWriteRequest(req.body);
    if (!body.ok) return res.status(400).json({ error: "Invalid file write", code: "fs_invalid_content" });
    const { path: filePath, content } = body.value;

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath: filePath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      await fsPromises.mkdir(pathModule.dirname(resolved.resolved), { recursive: true });
      await fsPromises.writeFile(resolved.resolved, content, "utf8");
      return res.json({ success: true, path: resolved.resolved });
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access denied" });
      }
      console.error("Failed to write file:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/fs/delete", async (req: Request, res: Response) => {
    const body = parseFsPathRequest(req.body);
    if (!body.ok) return res.status(400).json({ error: "Path is required", code: "fs_invalid_path" });
    const { path: targetPath } = body.value;

    try {
      const resolved = await resolveWorkspacePathFromContext({
        req,
        targetPath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolved.ok) {
        return res.status(400).json({ error: resolved.error });
      }

      await fsPromises.rm(resolved.resolved, { recursive: true, force: true });
      return res.json({ success: true, path: resolved.resolved });
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return res.status(404).json({ error: "File or directory not found" });
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access denied" });
      }
      console.error("Failed to delete path:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/fs/rename", async (req: Request, res: Response) => {
    const body = parseFsRenameRequest(req.body);
    if (!body.ok) return res.status(400).json({ error: "Invalid rename request", code: "fs_invalid_path" });
    const { oldPath, newPath } = body.value;

    try {
      const resolvedOld = await resolveWorkspacePathFromContext({
        req,
        targetPath: oldPath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolvedOld.ok) {
        return res.status(400).json({ error: resolvedOld.error });
      }

      const resolvedNew = await resolveWorkspacePathFromContext({
        req,
        targetPath: newPath,
        resolveProjectDirectory,
        path: pathModule,
        os,
        normalizeDirectoryPath,
        openchamberUserConfigRoot,
      });
      if (!resolvedNew.ok) {
        return res.status(400).json({ error: resolvedNew.error });
      }

      if (resolvedOld.base !== resolvedNew.base) {
        return res
          .status(400)
          .json({ error: "Source and destination must share the same workspace root" });
      }

      await fsPromises.rename(resolvedOld.resolved, resolvedNew.resolved);
      return res.json({ success: true, path: resolvedNew.resolved });
    } catch (error) {
      const err = error as { code?: string };
      if (err && typeof err === "object" && err.code === "ENOENT") {
        return res.status(404).json({ error: "Source path not found" });
      }
      if (err && typeof err === "object" && err.code === "EACCES") {
        return res.status(403).json({ error: "Access denied" });
      }
      console.error("Failed to rename path:", error);
      return res.status(500).json(apiError("internal_error"));
    }
  });

  app.post("/api/fs/exec", async (req: Request, res: Response) => {
    const { commands, cwd, background } = req.body || {};
    if (!Array.isArray(commands) || commands.length === 0) {
      return res.status(400).json({ error: "Commands array is required" });
    }
    if (!cwd || typeof cwd !== "string") {
      return res.status(400).json({ error: "Working directory (cwd) is required" });
    }

    pruneExecJobs();

    try {
      const resolvedCwd = pathModule.resolve(normalizeDirectoryPath(cwd) || cwd);
      const stats = await fsPromises.stat(resolvedCwd);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: "Specified cwd is not a directory" });
      }

      const shell = process.env.SHELL || (process.platform === "win32" ? "cmd.exe" : "/bin/sh");
      const shellFlag = process.platform === "win32" ? "/c" : "-c";

      const jobId = crypto.randomUUID();
      const job: ExecJob = {
        jobId,
        status: "queued",
        success: null,
        commands,
        resolvedCwd,
        shell,
        shellFlag,
        results: [],
        startedAt: Date.now(),
        finishedAt: null,
        updatedAt: Date.now(),
      };

      execJobs.set(jobId, job);

      const isBackground = background === true;
      if (isBackground) {
        void runExecJob(job).catch((error: Error) => {
          job.status = "done";
          job.success = false;
          job.results = Array.isArray(job.results) ? job.results : [];
          job.results.push({
            command: "",
            success: false,
            exitCode: undefined,
            stdout: "",
            stderr: "",
            error: error?.message || "Command execution failed",
          });
          job.finishedAt = Date.now();
          job.updatedAt = Date.now();
        });

        return res.status(202).json({
          jobId,
          status: "running",
        });
      }

      await runExecJob(job);
      return res.json({
        jobId,
        status: job.status,
        success: job.success === true,
        results: job.results,
      });
    } catch (error) {
      console.error("Failed to execute commands:", error);
      return res
        .status(500)
        .json(apiError("internal_error"));
    }
  });

  app.get("/api/fs/exec/:jobId", (req: Request, res: Response) => {
    const jobId = typeof req.params?.jobId === "string" ? req.params.jobId : "";
    if (!jobId) {
      return res.status(400).json({ error: "Job id is required" });
    }

    pruneExecJobs();

    const job = execJobs.get(jobId);
    if (!job) {
      return res.status(404).json({ error: "Job not found" });
    }

    job.updatedAt = Date.now();
    return res.json({
      jobId: job.jobId,
      status: job.status,
      success: job.success === true,
      results: Array.isArray(job.results) ? job.results : [],
    });
  });

  app.get("/api/fs/list", async (req: Request, res: Response) => {
    const query = parseFsListQuery(req.query);
    if (!query.ok) return res.status(400).json({ error: "Invalid query", code: "fs_invalid_path" });
    const rawPath = query.value.path ?? os.homedir();
    const respectGitignore = query.value.respectGitignore;
    let resolvedPath = "";

    const isPlansDirectory = (value: string): boolean => {
      if (!value || typeof value !== "string") return false;
      const normalized = value.replace(/\\/g, "/").replace(/\/+$/, "");
      return normalized.endsWith("/.opencode/plans") || normalized.endsWith(".opencode/plans");
    };

    try {
      resolvedPath = pathModule.resolve(normalizeDirectoryPath(rawPath) || rawPath);

      const stats = await fsPromises.stat(resolvedPath);
      if (!stats.isDirectory()) {
        return res.status(400).json({ error: "Specified path is not a directory" });
      }

      const dirents = await fsPromises.readdir(resolvedPath, { withFileTypes: true });
      const ignoredPaths = new Set<string>();
      if (respectGitignore) {
        try {
          const pathsToCheck = dirents.map((d) => d.name);
          if (pathsToCheck.length > 0) {
            try {
              const result = await new Promise<string>((resolve) => {
                const child = spawnFn(resolveGitBinaryForSpawn(), [
                  "check-ignore",
                  "--",
                  ...pathsToCheck,
                ], {
                  cwd: resolvedPath,
                  windowsHide: true,
                  stdio: ["ignore", "pipe", "pipe"],
                } as SpawnOptions);

                let stdout = "";
                child.stdout?.on("data", (data: Buffer) => {
                  stdout += data.toString();
                });
                child.on("close", () => resolve(stdout));
                child.on("error", () => resolve(""));
              });

              result.split("\n").filter(Boolean).forEach((name) => {
                const fullPath = pathModule.join(resolvedPath, name.trim());
                ignoredPaths.add(fullPath);
              });
            } catch {
              // ignore
            }
          }
        } catch {
          // ignore
        }
      }

      const entries = await Promise.all(
        dirents.map(async (dirent) => {
          const entryPath = pathModule.join(resolvedPath, dirent.name);
          if (respectGitignore && ignoredPaths.has(entryPath)) {
            return null;
          }

          let isDirectory = dirent.isDirectory();
          const isSymbolicLink = dirent.isSymbolicLink();

          if (!isDirectory && isSymbolicLink) {
            try {
              const linkStats = await fsPromises.stat(entryPath);
              isDirectory = linkStats.isDirectory();
            } catch {
              isDirectory = false;
            }
          }

          return {
            name: dirent.name,
            path: entryPath,
            isDirectory,
            isFile: dirent.isFile(),
            isSymbolicLink,
          };
        })
      );

      return res.json({
        path: resolvedPath,
        entries: entries.filter(Boolean),
      });
    } catch (error) {
      const err = error as { code?: string };
      const code = err && typeof err === "object" && "code" in err ? err.code : undefined;
      const isPlansPath =
        code === "ENOENT" && (isPlansDirectory(resolvedPath) || isPlansDirectory(rawPath));
      if (!isPlansPath) {
        console.error("Failed to list directory:", error);
      }
      if (code === "ENOENT") {
        if (isPlansPath) {
          return res.json({ path: resolvedPath || rawPath, entries: [] });
        }
        return res.status(404).json({ error: "Directory not found" });
      }
      if (code === "EACCES") {
        return res.status(403).json({ error: "Access to directory denied" });
      }
      return res
        .status(500)
        .json(apiError("internal_error"));
    }
  });
}
