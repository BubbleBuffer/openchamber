import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

import {
  EXIT_CODE,
  formatTopLevelError,
  main,
  TunnelCliError,
} from './cli.js';
import { installProcessHandlers } from './cli/process-handlers.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function exitByThrowing() {
  return vi.fn((code) => {
    throw new Error(`exit:${code}`);
  });
}

describe('CLI dispatch', () => {
  it('disposes owned process handlers without accumulating listeners', () => {
    const processLike = new EventEmitter();
    processLike.stdout = { isTTY: false, write: vi.fn() };
    processLike.stdin = { isTTY: false };
    processLike.exit = vi.fn();

    const baseline = {
      sigint: processLike.listenerCount('SIGINT'),
      rejection: processLike.listenerCount('unhandledRejection'),
      exception: processLike.listenerCount('uncaughtException'),
    };

    for (let index = 0; index < 3; index += 1) {
      const handlers = installProcessHandlers({ processLike });
      expect(processLike.listenerCount('SIGINT')).toBe(baseline.sigint + 1);
      expect(processLike.listenerCount('unhandledRejection')).toBe(baseline.rejection + 1);
      expect(processLike.listenerCount('uncaughtException')).toBe(baseline.exception + 1);
      handlers.dispose();
      handlers.dispose();
    }

    expect(processLike.listenerCount('SIGINT')).toBe(baseline.sigint);
    expect(processLike.listenerCount('unhandledRejection')).toBe(baseline.rejection);
    expect(processLike.listenerCount('uncaughtException')).toBe(baseline.exception);
  });

  it('dispatches a known command through the supplied registry', async () => {
    const status = vi.fn().mockResolvedValue(undefined);

    await main(['status', '--quiet'], { status });

    expect(status).toHaveBeenCalledWith(expect.objectContaining({ quiet: true }));
  });

  it('returns before dispatching for help and version early exits', async () => {
    const command = vi.fn();

    await main(['--help'], { serve: command });
    await main(['--version'], { serve: command });

    expect(command).not.toHaveBeenCalled();
  });

  it('reports an unknown command with the closest supported suggestion', async () => {
    const exit = exitByThrowing();
    vi.spyOn(process, 'exit').mockImplementation(exit);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(main(['statu'], { status: vi.fn() })).rejects.toThrow('exit:2');

    expect(error).toHaveBeenNthCalledWith(1, "Error: Unknown command 'statu'. Did you mean 'status'?");
    expect(error).toHaveBeenNthCalledWith(2, 'Use --help to see available commands');
    expect(exit).toHaveBeenCalledWith(EXIT_CODE.USAGE_ERROR);
  });

  it('preserves TunnelCliError exit codes at the top-level formatter', () => {
    const exit = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    formatTopLevelError(new TunnelCliError('network failed', EXIT_CODE.NETWORK_RUNTIME_ERROR), {
      options: {},
      stdoutIsTTY: false,
      plain: true,
      exit,
    });

    expect(error).toHaveBeenCalledWith('Error: network failed');
    expect(exit).toHaveBeenCalledWith(EXIT_CODE.NETWORK_RUNTIME_ERROR);
  });

  it('renders rejected commands as a normalized JSON error envelope', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const exit = vi.fn();

    formatTopLevelError(new Error('command failed'), {
      options: { json: true },
      stdoutIsTTY: false,
      plain: true,
      exit,
    });

    expect(JSON.parse(write.mock.calls[0][0])).toEqual({
      status: 'error',
      error: { message: 'command failed' },
    });
    expect(exit).toHaveBeenCalledWith(EXIT_CODE.GENERAL_ERROR);
  });
});
