import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const MODULE_DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PACKAGE_ROOT = path.resolve(MODULE_DIRECTORY, '..', '..');

function createPaths({ env = process.env, homedir = os.homedir(), packageRoot = DEFAULT_PACKAGE_ROOT } = {}) {
  const configuredDataDir = typeof env?.OPENCHAMBER_DATA_DIR === 'string'
    ? env.OPENCHAMBER_DATA_DIR.trim()
    : '';
  const dataDirectory = path.resolve(configuredDataDir || path.join(homedir, '.config', 'openchamber'));
  const packageDirectory = path.resolve(packageRoot);

  return {
    getPackageRoot: () => packageDirectory,
    getDataDir: () => dataDirectory,
    getRunDir: () => path.join(dataDirectory, 'run'),
    getLogsDir: () => path.join(dataDirectory, 'logs'),
    getSettingsFilePath: () => path.join(dataDirectory, 'settings.json'),
    getPidFilePath: (port) => path.join(dataDirectory, 'run', `openchamber-${port}.pid`),
    getInstanceFilePath: (port) => path.join(dataDirectory, 'run', `openchamber-${port}.json`),
    getLogFilePath: (port) => path.join(dataDirectory, 'logs', `openchamber-${port}.log`),
    getPackageJsonPath: () => path.join(packageDirectory, 'package.json'),
    getCompiledServerEntries: () => ({
      daemon: path.join(packageDirectory, 'server', 'dist', 'main.js'),
      foreground: path.join(packageDirectory, 'server', 'dist', 'index.js'),
    }),
  };
}

export { createPaths };
