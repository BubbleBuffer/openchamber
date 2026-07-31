import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  canPrompt,
  createOutputAdapter,
  createProgress,
  createSpinner,
  isJsonMode,
  isQuietMode,
  log,
  logStatus,
  printJson,
  shouldRenderHumanOutput,
} from './cli-output.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CLI output modes', () => {
  it('writes JSON through an injected output stream', () => {
    const writes = [];
    const adapter = createOutputAdapter({
      stdout: { isTTY: false, write: (value) => writes.push(value) },
      stdin: { isTTY: false },
    });

    adapter.printJson({ state: 'stopped' });

    expect(writes).toEqual(['{\n  "status": "ok",\n  "state": "stopped"\n}\n']);
  });

  it('selects JSON, quiet, and human output modes without changing options', () => {
    expect(isJsonMode({ json: true })).toBe(true);
    expect(isQuietMode({ quiet: true })).toBe(true);
    expect(shouldRenderHumanOutput({})).toBe(true);
    expect(shouldRenderHumanOutput({ plain: true })).toBe(true);
    expect(shouldRenderHumanOutput({ json: true })).toBe(false);
    expect(shouldRenderHumanOutput({ quiet: true })).toBe(false);
  });

  it('requires both TTY streams for prompting and suppresses prompts for JSON/quiet', async () => {
    const ttyStreams = { stdout: { isTTY: true }, stdin: { isTTY: true } };
    const pipedStreams = { stdout: { isTTY: false }, stdin: { isTTY: true } };

    expect(canPrompt({}, ttyStreams)).toBe(true);
    expect(canPrompt({}, pipedStreams)).toBe(false);
    expect(canPrompt({ json: true }, ttyStreams)).toBe(false);
    expect(canPrompt({ quiet: true }, ttyStreams)).toBe(false);
    expect(createSpinner({}, ttyStreams)).not.toBeNull();
    expect(createSpinner({ json: true }, ttyStreams)).toBeNull();
    await expect(createProgress({ quiet: true }, {}, ttyStreams)).resolves.toBeNull();
  });

  it('normalizes JSON status envelopes and writes one bounded document', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printJson({ messages: [{ level: 'warning', code: 'NOTICE', message: 'careful' }] });
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      status: 'warning',
      messages: [{ level: 'warning', code: 'NOTICE', message: 'careful' }],
    });
  });

  it('wraps scalar JSON payloads and preserves explicit error status', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    printJson('value');
    printJson({ status: 'error', message: 'failed' });

    expect(JSON.parse(write.mock.calls[0][0])).toEqual({ status: 'ok', data: 'value' });
    expect(JSON.parse(write.mock.calls[1][0])).toEqual({ status: 'error', message: 'failed' });
  });

  it('dispatches warning and error statuses to the bounded clack log methods', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
    const error = vi.spyOn(log, 'error').mockImplementation(() => undefined);

    logStatus('warning', 'warning line', 'warning detail');
    logStatus('error', 'error line');

    expect(warn).toHaveBeenCalledWith('warning line\nwarning detail');
    expect(error).toHaveBeenCalledWith('error line');
  });
});
