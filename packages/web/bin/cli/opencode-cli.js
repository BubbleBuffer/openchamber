import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const WINDOWS_EXTENSIONS = ['', '.exe', '.cmd', '.bat'];

function createOpenCodeCli({
  env = process.env,
  fsLike = fs,
  pathLike = path,
  processLike = process,
  spawnSyncLike = spawnSync,
  globalThisLike = globalThis,
  onWarning,
} = {}) {
  const isExecutable = (filePath) => {
    try {
      const stats = fsLike.statSync(filePath);
      if (!stats.isFile()) return false;
      if (processLike.platform === 'win32') return true;
      fsLike.accessSync(filePath, fsLike.constants?.X_OK ?? fs.constants.X_OK);
      return true;
    } catch {
      return false;
    }
  };

  const resolveExplicitBinary = (candidate) => {
    if (typeof candidate !== 'string' || candidate.length === 0) return null;
    if (!candidate.includes(pathLike.sep) && !pathLike.isAbsolute(candidate)) return null;
    const resolved = pathLike.isAbsolute(candidate) ? candidate : pathLike.resolve(candidate);
    return isExecutable(resolved) ? resolved : null;
  };

  const searchPath = (command) => {
    const pathValue = typeof env.PATH === 'string' ? env.PATH : '';
    for (const directory of pathValue.split(pathLike.delimiter).filter(Boolean)) {
      for (const extension of WINDOWS_EXTENSIONS) {
        const candidate = pathLike.join(directory, processLike.platform === 'win32' ? `${command}${extension}` : command);
        if (isExecutable(candidate)) return candidate;
      }
    }
    return null;
  };

  const getBunBinary = () => {
    if (typeof env.BUN_BINARY === 'string' && env.BUN_BINARY.trim().length > 0) return env.BUN_BINARY.trim();
    if (typeof env.BUN_INSTALL === 'string' && env.BUN_INSTALL.trim().length > 0) {
      return pathLike.join(env.BUN_INSTALL.trim(), 'bin', 'bun');
    }
    return 'bun';
  };

  const isBunRuntime = () => typeof globalThisLike.Bun !== 'undefined';
  const isBunInstalled = () => {
    try {
      return spawnSyncLike(getBunBinary(), ['--version'], {
        stdio: 'ignore',
        env,
        windowsHide: true,
      })?.status === 0;
    } catch {
      return false;
    }
  };
  const getPreferredServerRuntime = () => isBunInstalled() ? 'bun' : 'node';
  const getDaemonRuntimeBin = ({ nodeBinary = processLike.execPath } = {}) => (
    getPreferredServerRuntime() === 'bun' ? getBunBinary() : nodeBinary
  );

  const checkOpenCodeCli = async (notice) => {
    const configured = typeof env.OPENCODE_BINARY === 'string' ? env.OPENCODE_BINARY : '';
    if (configured) {
      const explicit = resolveExplicitBinary(configured);
      if (explicit) {
        env.OPENCODE_BINARY = explicit;
        return explicit;
      }
      const message = `OPENCODE_BINARY="${configured}" is not an executable file. Falling back to PATH lookup.`;
      (notice || onWarning)?.({ level: 'warning', code: 'OPENCODE_BINARY_INVALID', message });
    }

    const resolved = searchPath('opencode');
    if (resolved) {
      env.OPENCODE_BINARY = resolved;
      return resolved;
    }

    throw new Error(
      `Unable to locate the opencode CLI on PATH (${env.PATH || '<empty>'}). ` +
      'Ensure the CLI is installed and reachable, or set OPENCODE_BINARY to its full path.'
    );
  };

  return {
    checkOpenCodeCli,
    getBunBinary,
    isBunRuntime,
    isBunInstalled,
    getPreferredServerRuntime,
    getDaemonRuntimeBin,
    isExecutable,
    resolveExplicitBinary,
    searchPath,
  };
}

export { createOpenCodeCli };
