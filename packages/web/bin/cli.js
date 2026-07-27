#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isModuleCliExecution } from './cli-entry.js';
import {
  EXIT_CODE,
  TunnelCliError,
  parseArgs,
  splitOptionToken,
} from './cli/arguments.js';
import { generateCompletionScript, showHelp } from './cli/help.js';
import { createProcessState, installProcessHandlers } from './cli/process-handlers.js';
import { createPaths } from './cli/paths.js';
import { createInstanceStore } from './cli/instance-store.js';
import { createProcessRuntime } from './cli/process-runtime.js';
import { createLogFiles } from './cli/log-files.js';
import { productionOutput } from './cli-output.js';
import { createCommands } from './cli/create-commands.js';
import { createDispatcher, formatTopLevelError as formatDispatchError } from './cli/dispatch.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));

const paths = createPaths({ env: process.env, packageRoot });
const timers = { setTimeout, clearTimeout, setInterval, clearInterval };
const processRuntime = createProcessRuntime({
  processLike: process,
  fsLike: fs,
  fetchImpl: globalThis.fetch,
  timers,
  clock: () => Date.now(),
  env: process.env,
});
const instanceStore = createInstanceStore({
  paths,
  fsLike: fs,
  processRuntime,
  clock: () => Date.now(),
});
const logFiles = createLogFiles({ paths, fsLike: fs, timers });
const processState = createProcessState();
const commands = createCommands({
  paths,
  instanceStore,
  processRuntime,
  logFiles,
  output: productionOutput,
  processLike: process,
  fsLike: fs,
  processState,
  serverEntries: paths.getCompiledServerEntries(),
});

const dispatcher = createDispatcher({
  parseArgs,
  commandRegistry: commands,
  output: productionOutput,
  packageVersion: packageJson.version,
  showHelp,
  processState,
  exit: (code) => process.exit(code),
});

async function runCli(argv = process.argv.slice(2), commandRegistry = commands) {
  return dispatcher(argv, commandRegistry);
}

async function main(argv = process.argv.slice(2), commandRegistry = commands) {
  return runCli(argv, commandRegistry);
}

function formatTopLevelError(error, options = {}) {
  return formatDispatchError(error, {
    output: productionOutput,
    options: options.options || processState.getActiveCommandOptions() || {},
    stdoutIsTTY: options.stdoutIsTTY ?? process.stdout?.isTTY,
    plain: options.plain ?? Boolean(options.options?.plain || process.argv.includes('--plain')),
    exit: options.exit || ((code) => process.exit(code)),
  });
}

const isCliExecution = isModuleCliExecution(process.argv[1], import.meta.url, fs.realpathSync, 'openchamber');

if (isCliExecution) {
  installProcessHandlers({ processLike: process, state: processState, output: productionOutput });
  runCli().catch((error) => formatTopLevelError(error));
}

export {
  EXIT_CODE,
  TunnelCliError,
  generateCompletionScript,
  main,
  formatTopLevelError,
  parseArgs,
  runCli,
  splitOptionToken,
};
