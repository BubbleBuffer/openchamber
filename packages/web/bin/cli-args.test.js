import { describe, expect, it } from 'vitest';

import { assertSafeBrowserPort, EXIT_CODE, parseArgs, splitOptionToken, TunnelCliError } from './cli/arguments.js';

describe('CLI argument tokenization', () => {
  it('rejects browser-unsafe ports with a typed usage error', () => {
    expect(() => assertSafeBrowserPort(22, { context: 'OpenChamber serve' })).toThrow(
      new TunnelCliError(
        'OpenChamber serve cannot use port 22. Port 22 is browser-unsafe (ERR_UNSAFE_PORT) and is not supported for OpenChamber UI at http://127.0.0.1:22/. Use a safe port such as 3000, 5173, 8080, or a high ephemeral port.',
        EXIT_CODE.USAGE_ERROR,
      ),
    );
  });

  it('splits long options with inline values', () => {
    expect(splitOptionToken('--port=8080')).toEqual({
      name: 'port',
      inlineValue: '8080',
      long: true,
    });
  });

  it('splits short options without treating the next argument as inline', () => {
    expect(splitOptionToken('-p')).toEqual({ name: 'p', inlineValue: undefined, long: false });
    expect(splitOptionToken('serve')).toBeNull();
  });

  it('provides the current defaults and serve command', () => {
    const parsed = parseArgs([]);

    expect(parsed.command).toBe('serve');
    expect(parsed.options).toMatchObject({
      port: 3000,
      json: false,
      all: false,
      follow: true,
      lines: 200,
      plain: false,
      quiet: false,
      foreground: false,
    });
    expect(parsed.removedFlagErrors).toEqual([]);
    expect(parsed.helpRequested).toBe(false);
    expect(parsed.versionRequested).toBe(false);
  });

  it('accepts aliases, inline values, and a fully flagged invocation', () => {
    const parsed = parseArgs([
      'status',
      '-p', '8080',
      '--host=0.0.0.0',
      '--ui-password', 'secret',
      '--json', '--all', '--no-follow', '--lines=42',
      '--provider', 'cloudflare', '--mode=managed-remote', '--profile', 'prod',
      '--name', 'display', '--config', '/tmp/config.yml', '--token', 'token',
      '--token-file', '/tmp/token', '--token-stdin', '--hostname', 'example.test',
      '--connect-ttl', '30m', '--session-ttl=8h', '--qr', '--no-qr', '--force',
      '--show-secrets', '--dry-run', '--plain', '--quiet', '--foreground',
    ]);

    expect(parsed.command).toBe('status');
    expect(parsed.removedFlagErrors).toEqual([
      '`--provider` is no longer available.',
      '`--mode` is no longer available.',
      '`--profile` is no longer available.',
      '`--name` is no longer available.',
      '`--config` is no longer available.',
      '`--token` is no longer available.',
      '`--token-file` is no longer available.',
      '`--token-stdin` is no longer available.',
      '`--hostname` is no longer available.',
      '`--connect-ttl` is no longer available.',
      '`--session-ttl` is no longer available.',
      '`--qr` is no longer available.',
      '`--no-qr` is no longer available.',
      '`--force` is no longer available.',
      '`--show-secrets` is no longer available.',
      '`--dry-run` is no longer available.',
    ]);
    expect(parsed.options).toMatchObject({
      port: 8080,
      host: '0.0.0.0',
      uiPassword: 'secret',
      json: true,
      all: true,
      follow: false,
      lines: 42,
      plain: true,
      quiet: true,
      foreground: true,
      explicitPort: true,
      explicitUiPassword: true,
    });
  });

  it('recognizes help, version, removed flags, and unknown options', () => {
    expect(parseArgs(['--help', '-v'])).toMatchObject({ helpRequested: true, versionRequested: true });
    expect(parseArgs(['--daemon', '-d', '--try-cf-tunnel', '--tunnel-qr', '--tunnel-provider', 'cloudflare', '--mystery']))
      .toMatchObject({
        removedFlagErrors: [
          '`--daemon` was removed. OpenChamber now always runs in daemon mode.',
          '`--daemon` was removed. OpenChamber now always runs in daemon mode.',
          '`--try-cf-tunnel` is no longer available.',
          '`--tunnel-qr` is no longer available.',
          '`--tunnel-provider` is no longer available.',
          'Unknown option: --mystery',
        ],
      });
  });

  it('rejects removed tunnel/profile options instead of silently retaining them', () => {
    const parsed = parseArgs(['status', '--provider', 'cloudflare', '--qr', '--token', 'secret']);

    expect(parsed.removedFlagErrors).toEqual([
      '`--provider` is no longer available.',
      '`--qr` is no longer available.',
      '`--token` is no longer available.',
    ]);
    expect(parsed.options).not.toHaveProperty('provider');
    expect(parsed.options).not.toHaveProperty('token');
  });

  it.each([
    ['missing value', ['--port'], 'Missing value for --port.'],
    ['non-numeric', ['--port', 'abc'], 'Invalid port value: abc'],
    ['below range', ['--port', '0'], 'Invalid port value: 0'],
    ['above range', ['--port', '65536'], 'Invalid port value: 65536'],
    ['negative range', ['--port', '-1'], 'Invalid port value: -1'],
  ])('rejects %s with a usage error', (_label, argv, message) => {
    expect(() => parseArgs(argv)).toThrow(new TunnelCliError(message, EXIT_CODE.USAGE_ERROR));
  });
});
