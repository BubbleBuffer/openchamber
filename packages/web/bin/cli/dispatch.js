import {
  COMMAND_NAMES,
  EXIT_CODE,
  TunnelCliError,
} from './arguments.js';

function levenshteinDistance(a, b) {
  const rows = Array.from({ length: a.length + 1 }, (_, index) => [index]);
  for (let column = 0; column <= b.length; column += 1) rows[0][column] = column;
  for (let row = 1; row <= a.length; row += 1) {
    for (let column = 1; column <= b.length; column += 1) {
      rows[row][column] = a[row - 1] === b[column - 1]
        ? rows[row - 1][column - 1]
        : 1 + Math.min(rows[row - 1][column], rows[row][column - 1], rows[row - 1][column - 1]);
    }
  }
  return rows[a.length][b.length];
}

function findClosestMatch(input, candidates, maxDistance = 3) {
  if (typeof input !== 'string' || !input || !Array.isArray(candidates)) return null;
  const normalized = input.toLowerCase();
  let closest = null;
  let distance = maxDistance + 1;
  for (const candidate of candidates) {
    const candidateDistance = levenshteinDistance(normalized, candidate.toLowerCase());
    if (candidateDistance < distance) {
      closest = candidate;
      distance = candidateDistance;
    }
  }
  return distance <= maxDistance ? closest : null;
}

function formatTopLevelError(error, {
  output,
  options = {},
  stdoutIsTTY = output?.stdout?.isTTY ?? process.stdout?.isTTY,
  plain = Boolean(options?.plain),
  exit = () => {},
} = {}) {
  const message = error instanceof Error ? error.message : String(error);
  if (output?.isJsonMode?.(options)) {
    output.printJson({ status: 'error', error: { message } });
  } else if (stdoutIsTTY && !plain) {
    output.intro?.('Error');
    output.logStatus?.('error', message);
    output.outro?.('failed');
  } else {
    console.error(`Error: ${message}`);
  }

  const exitCode = error instanceof TunnelCliError && Number.isInteger(error.exitCode)
    ? error.exitCode
    : EXIT_CODE.GENERAL_ERROR;
  exit(exitCode);
}

function createDispatcher({
  parseArgs,
  commandRegistry,
  output,
  packageVersion,
  showHelp,
  processState,
  exit = () => {},
} = {}) {
  if (typeof parseArgs !== 'function') throw new TypeError('createDispatcher requires parseArgs');
  if (!commandRegistry || typeof commandRegistry !== 'object') throw new TypeError('createDispatcher requires commandRegistry');

  const writeError = (message, prefix = true) => {
    const line = `${prefix ? 'Error: ' : ''}${message}`;
    if (output?.error) output.error(line);
    else if (output?.stderr?.write) output.stderr.write(`${line}\n`);
    else console.error(line);
  };
  const write = (value) => output?.stdout?.write?.(value);

  return async function runCli(argv = process.argv.slice(2), registry = commandRegistry) {
    const parsed = parseArgs(argv);
    const { command, options, removedFlagErrors, helpRequested, versionRequested } = parsed;
    processState?.setActiveCommandOptions?.(options);

    if (versionRequested) {
      if (output.isJsonMode(options)) output.printJson({ version: packageVersion });
      else write(`${packageVersion}\n`);
      return;
    }

    if (removedFlagErrors.length > 0) {
      if (output.isJsonMode(options)) {
        output.printJson({
          status: 'error',
          error: { message: removedFlagErrors[0], details: removedFlagErrors },
        });
      } else {
        for (const message of removedFlagErrors) writeError(message);
      }
      exit(EXIT_CODE.GENERAL_ERROR);
      return;
    }

    if (helpRequested) {
      showHelp?.({ stdout: output.stdout });
      return;
    }

    if (command === 'tunnel') {
      write('The tunnel command is no longer available.\n');
      return;
    }

    const handler = registry[command];
    if (typeof handler !== 'function') {
      const suggestion = findClosestMatch(command, COMMAND_NAMES);
      const hint = suggestion ? ` Did you mean '${suggestion}'?` : '';
      if (output.isJsonMode(options)) {
        output.printJson({
          status: 'error',
          error: { message: `Unknown command '${command}'.${hint}` },
          messages: [{ level: 'info', code: 'USAGE_HELP', message: 'Use --help to see available commands' }],
        });
      } else {
        writeError(`Unknown command '${command}'.${hint}`);
        writeError('Use --help to see available commands', false);
      }
      exit(EXIT_CODE.USAGE_ERROR);
      return;
    }

    await handler(options);
  };
}

export {
  createDispatcher,
  findClosestMatch,
  formatTopLevelError,
};
