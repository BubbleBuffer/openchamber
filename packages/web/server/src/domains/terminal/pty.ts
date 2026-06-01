import type { PtyProvider, PtySpawnOptions } from "./types.js";

interface PtyModule {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  spawn: (...args: any[]) => any;
}

let ptyProviderPromise: Promise<PtyProvider> | null = null;

export const getPtyProvider = async (
  isBunRuntime: boolean,
): Promise<PtyProvider> => {
  if (ptyProviderPromise) {
    return ptyProviderPromise;
  }

  ptyProviderPromise = (async () => {
    if (isBunRuntime) {
      try {
        const bunPty = (await import("bun-pty")) as PtyModule;
        console.log("Using bun-pty for terminal sessions");
        return {
          spawn: bunPty.spawn as PtyProvider["spawn"],
          backend: "bun-pty",
        };
      } catch {
        console.warn("bun-pty unavailable, falling back to node-pty");
      }
    }

    try {
      const nodePty = (await import("node-pty")) as PtyModule;
      console.log("Using node-pty for terminal sessions");
      return {
        spawn: nodePty.spawn as PtyProvider["spawn"],
        backend: "node-pty",
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error("Failed to load node-pty:", message);
      if (isBunRuntime) {
        throw new Error(
          "No PTY backend available. Install bun-pty or node-pty.",
        );
      }
      throw new Error(
        "node-pty is not available. Run: npm rebuild node-pty (or install Bun for bun-pty)",
      );
    }
  })();

  return ptyProviderPromise;
};

export const getTerminalShellCandidates = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  searchPathFor: (name: string) => string | null,
  isExecutable: (path: string) => boolean,
): string[] => {
  if (platform === "win32") {
    const windowsCandidates = [
      env.OPENCHAMBER_TERMINAL_SHELL,
      env.SHELL,
      env.ComSpec,
      `${env.SystemRoot ?? "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`,
      "pwsh.exe",
      "powershell.exe",
      "cmd.exe",
    ].filter(Boolean) as string[];

    return deduplicateShells(windowsCandidates, searchPathFor, isExecutable);
  }

  const unixCandidates = [
    env.OPENCHAMBER_TERMINAL_SHELL,
    env.SHELL,
    "/bin/zsh",
    "/bin/bash",
    "/bin/sh",
    "zsh",
    "bash",
    "sh",
  ].filter(Boolean) as string[];

  return deduplicateShells(unixCandidates, searchPathFor, isExecutable);
};

const deduplicateShells = (
  candidates: string[],
  searchPathFor: (name: string) => string | null,
  isExecutable: (path: string) => boolean,
): string[] => {
  const resolved: string[] = [];
  const seen = new Set<string>();

  for (const candidateRaw of candidates) {
    const candidate = String(candidateRaw).trim();
    if (!candidate) continue;

    const lookedUp =
      candidate.includes("\\") || candidate.includes("/")
        ? candidate
        : searchPathFor(candidate);
    const executable =
      lookedUp && isExecutable(lookedUp)
        ? lookedUp
        : isExecutable(candidate)
          ? candidate
          : null;
    if (!executable || seen.has(executable)) continue;
    seen.add(executable);
    resolved.push(executable);
  }

  return resolved;
};

export const spawnTerminalPtyWithFallback = (
  pty: PtyProvider,
  options: PtySpawnOptions,
  shellCandidates: string[],
// eslint-disable-next-line @typescript-eslint/no-explicit-any
): { ptyProcess: any; shell: string } => {
  if (shellCandidates.length === 0) {
    throw new Error("No executable shell found for terminal session");
  }

  let lastError: Error | null = null;
  for (const shell of shellCandidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ptyOptions: any = {
        name: "xterm-256color",
        cols: options.cols || 80,
        rows: options.rows || 24,
        cwd: options.cwd,
        env: {
          ...options.env,
          TERM: "xterm-256color",
          COLORTERM: "truecolor",
        },
      };

      if (process.platform === "win32") {
        ptyOptions.useConpty = true;
      }

      const ptyProcess = pty.spawn(shell, [], ptyOptions);

      return { ptyProcess, shell };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.warn(
        `Failed to spawn PTY using shell ${shell}:`,
        lastError.message,
      );
    }
  }

  const baseMessage =
    lastError?.message ?? "PTY spawn failed";
  throw new Error(
    `Failed to spawn terminal PTY with available shells (${shellCandidates.join(", ")}): ${baseMessage}`,
  );
};

export const sanitizeTerminalEnv = (
  env: Record<string, string | undefined>,
): Record<string, string | undefined> => {
  const next = { ...env };
  delete next.BASH_XTRACEFD;
  delete next.BASH_ENV;
  delete next.ENV;
  return next;
};