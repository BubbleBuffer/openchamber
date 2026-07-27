/**
 * CLI output formatting adapter.
 *
 * Wraps @clack/prompts for structured, beautiful terminal output.
 * Custom formatters (icons, redaction) live here to isolate the
 * formatting dependency from the rest of the CLI.
 */

import {
  intro as clackIntro,
  outro as clackOutro,
  log as clackLog,
  note as clackNote,
  box as clackBox,
  progress as clackProgress,
  spinner as clackSpinner,
  confirm as clackConfirm,
  select as clackSelect,
  text as clackText,
  password as clackPassword,
  cancel as clackCancel,
  isCancel as clackIsCancel,
} from '@clack/prompts';

const defaultPromptApi = {
  intro: clackIntro,
  outro: clackOutro,
  log: clackLog,
  note: clackNote,
  box: clackBox,
  progress: clackProgress,
  spinner: clackSpinner,
  confirm: clackConfirm,
  select: clackSelect,
  text: clackText,
  password: clackPassword,
  cancel: clackCancel,
  isCancel: clackIsCancel,
};

// ── Status-aware log dispatch ───────────────────────────────────

/**
 * Print a status-tagged message using clack log primitives.
 *
 * @param {'success'|'warning'|'error'|'info'|'neutral'} status
 * @param {string} message  Primary line
 * @param {string} [detail] Optional dim secondary line appended after newline
 */
function logStatus(status, message, detail, promptApi = defaultPromptApi) {
  const full = detail ? `${message}\n${detail}` : message;
  switch (status) {
    case 'success':
      promptApi.log.success(full);
      break;
    case 'warning':
      promptApi.log.warn(full);
      break;
    case 'error':
      promptApi.log.error(full);
      break;
    case 'info':
    case 'neutral':
    default:
      promptApi.log.info(full);
      break;
  }
}

// ── TTY detection ───────────────────────────────────────────────

/**
 * Whether both stdout and stdin are interactive TTYs.
 * Prompts must be disabled when stdin is piped (e.g. --token-stdin).
 */
const isTTY = Boolean(process.stdout?.isTTY) && Boolean(process.stdin?.isTTY);

function streamsAreTTY(streams = { stdout: process.stdout, stdin: process.stdin }) {
  return Boolean(streams.stdout?.isTTY) && Boolean(streams.stdin?.isTTY);
}

function isJsonMode(options) {
  return Boolean(options?.json);
}

function isQuietMode(options) {
  return Boolean(options?.quiet);
}

function shouldRenderHumanOutput(options) {
  return !isJsonMode(options) && !isQuietMode(options);
}

function canPrompt(options, streams) {
  const interactive = streams ? streamsAreTTY(streams) : isTTY;
  return shouldRenderHumanOutput(options) && interactive;
}

function createSpinner(options, streams, promptApi = defaultPromptApi) {
  return canPrompt(options, streams) ? promptApi.spinner() : null;
}

async function createProgress(options, config, streams, promptApi = defaultPromptApi) {
  return canPrompt(options, streams) ? promptApi.progress(config) : null;
}

function normalizeJsonPayload(payload) {
  const base = payload && typeof payload === 'object' && !Array.isArray(payload)
    ? { ...payload }
    : { data: payload };

  const messages = Array.isArray(base.messages) ? base.messages : undefined;
  const hasWarning = Boolean(messages?.some((entry) => entry?.level === 'warning'));
  const hasError = Boolean(messages?.some((entry) => entry?.level === 'error'));
  const normalizedStatus = base.status === 'ok' || base.status === 'warning' || base.status === 'error'
    ? base.status
    : (hasError ? 'error' : (hasWarning ? 'warning' : 'ok'));

  return {
    status: normalizedStatus,
    ...base,
  };
}

function printJson(payload, streams = { stdout: process.stdout }) {
  const output = normalizeJsonPayload(payload);

  streams.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

function createOutputAdapter({ stdout = process.stdout, stdin = process.stdin, promptApi = defaultPromptApi } = {}) {
  const streams = { stdout, stdin };
  return {
    stdout,
    stdin,
    error: (...args) => console.error(...args),
    intro: (...args) => promptApi.intro(...args),
    outro: (...args) => promptApi.outro(...args),
    log: promptApi.log,
    note: (...args) => promptApi.note(...args),
    box: (...args) => promptApi.box(...args),
    progress: (...args) => promptApi.progress(...args),
    spinner: (...args) => promptApi.spinner(...args),
    confirm: (...args) => promptApi.confirm(...args),
    select: (...args) => promptApi.select(...args),
    text: (...args) => promptApi.text(...args),
    password: (...args) => promptApi.password(...args),
    cancel: (...args) => promptApi.cancel(...args),
    isCancel: (...args) => promptApi.isCancel(...args),
    isTTY: streamsAreTTY(streams),
    isJsonMode,
    isQuietMode,
    shouldRenderHumanOutput,
    canPrompt: (options) => canPrompt(options, streams),
    createSpinner: (options) => createSpinner(options, streams, promptApi),
    createProgress: (options, config) => createProgress(options, config, streams, promptApi),
    printJson: (payload) => printJson(payload, streams),
    logStatus: (status, message, detail) => logStatus(status, message, detail, promptApi),
  };
}

const productionOutput = createOutputAdapter();

export {
  clackIntro as intro,
  clackOutro as outro,
  clackLog as log,
  clackNote as note,
  clackBox as box,
  clackProgress as progress,
  clackSpinner as spinner,
  clackConfirm as confirm,
  clackSelect as select,
  clackText as text,
  clackPassword as password,
  clackCancel as cancel,
  clackIsCancel as isCancel,
  isTTY,
  isJsonMode,
  isQuietMode,
  shouldRenderHumanOutput,
  canPrompt,
  createSpinner,
  createProgress,
  printJson,
  createOutputAdapter,
  productionOutput,
  logStatus,
};
