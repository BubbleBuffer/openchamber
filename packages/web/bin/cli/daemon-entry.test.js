import { describe, expect, it } from 'vitest';

import { parseDaemonArgs, runDaemonEntry } from './daemon-entry.js';

describe('CLI daemon entry', () => {
  it('imports the server after capturing forwarded environment and reports the actual port', async () => {
    const env = {
      OPENCHAMBER_UI_PASSWORD: 'password',
      OPENCHAMBER_SKIP_OPENCODE_START: '1',
      OPENCODE_SKIP_START: 'true',
      OPENCODE_BINARY: '/bin/opencode',
      OPENCODE_HOST: '127.0.0.1',
      OPENCODE_PORT: '4096',
      OPENCHAMBER_DATA_DIR: '/tmp/openchamber-test-data',
    };
    const messages = [];
    let captured;
    const controller = await runDaemonEntry({
      argv: ['--port', '0', '--host', '0.0.0.0'],
      env,
      packageRoot: '/package',
      importServer: async (entry, inherited) => {
        captured = { entry, inherited };
        return {
          startWebUiServer: async (options) => {
            expect(options).toEqual({ port: 0, host: '0.0.0.0', uiPassword: 'password', attachSignals: true, exitOnShutdown: true });
            return { getPort: () => 4311 };
          },
        };
      },
      send: (message) => messages.push(message),
    });

    expect(controller).toBeDefined();
    expect(captured.entry).toBe('/package/server/dist/index.js');
    expect(captured.inherited).toBe(env);
    expect(messages).toEqual([{ type: 'openchamber:ready', port: 4311 }]);
  });

  it('reports startup failure without sending readiness', async () => {
    const messages = [];
    await expect(runDaemonEntry({
      argv: ['--port', '3000'],
      env: {},
      importServer: async () => ({ startWebUiServer: async () => { throw new Error('bind failed'); } }),
      send: (message) => messages.push(message),
      processLike: { exitCode: 0 },
    })).rejects.toThrow('bind failed');
    expect(messages).toEqual([{ type: 'openchamber:error', message: 'bind failed' }]);
  });

  it('rejects malformed internal arguments', () => {
    expect(() => parseDaemonArgs(['--port', 'not-a-port'])).toThrow('valid --port');
  });
});
