import { describe, expect, it } from 'vitest';
import os from 'os';
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { isModuleCliExecution, normalizeCliEntryPath, resolveCompiledServerEntries } from './cli-entry.js';
import { COMMAND_NAMES } from './cli/arguments.js';
import { renderHelp } from './cli/help.js';

describe('cli entry detection', () => {
  const modulePath = '/tmp/openchamber/bin/cli.js';
  const moduleUrl = pathToFileURL(modulePath).href;

  it('resolves symlinked entry paths before comparing', () => {
    const symlinkPath = '/usr/local/bin/openchamber';
    const realpath = (filePath) => {
      if (filePath === path.resolve(symlinkPath)) {
        return modulePath;
      }
      return filePath;
    };

    expect(isModuleCliExecution(symlinkPath, moduleUrl, realpath)).toBe(true);
  });

  it('falls back to resolved paths when realpath fails', () => {
    const realpath = () => {
      throw new Error('realpath unavailable');
    };

    expect(isModuleCliExecution(modulePath, moduleUrl, realpath)).toBe(true);
  });

  it('returns false for non-matching entry path', () => {
    expect(isModuleCliExecution('/tmp/other-cli.js', moduleUrl)).toBe(false);
  });

  it('returns false for empty entry path', () => {
    expect(isModuleCliExecution('', moduleUrl)).toBe(false);
  });

  it('returns false when module url is not provided', () => {
    expect(isModuleCliExecution(modulePath)).toBe(false);
  });

  it('accepts wrapper binary name fallback when requested', () => {
    const wrapperPath = '/home/user/.local/bin/openchamber';
    expect(isModuleCliExecution(wrapperPath, moduleUrl, undefined, 'openchamber')).toBe(true);
  });

  it('normalizes direct paths when realpath fails', () => {
    const unresolvedPath = './packages/web/bin/cli.js';
    const realpath = () => {
      throw new Error('no symlink resolution');
    };

    expect(normalizeCliEntryPath(unresolvedPath, realpath)).toBe(path.resolve(unresolvedPath));
  });
});

describe('compiled server entries', () => {
  it('uses separate daemon and foreground compiled entrypoints', () => {
    expect(resolveCompiledServerEntries('/tmp/openchamber/packages/web')).toEqual({
      daemon: '/tmp/openchamber/packages/web/server/dist/main.js',
      foreground: '/tmp/openchamber/packages/web/server/dist/index.js',
    });
  });

  it('exports the foreground server entry without starting it after a build', async () => {
    const entries = resolveCompiledServerEntries(path.resolve(import.meta.dirname, '..'));

    expect(fs.existsSync(entries.daemon)).toBe(true);
    expect(fs.existsSync(entries.foreground)).toBe(true);

    const server = await import(pathToFileURL(entries.foreground).href);
    expect(server.startWebUiServer).toEqual(expect.any(Function));
  });
});

describe('CLI help authority', () => {
  it('renders supported commands from the shared command authority', () => {
    const help = renderHelp();

    expect(help).toContain('serve          Start the web server');
    for (const command of COMMAND_NAMES) {
      expect(help).toContain(`  ${command}`);
    }
  });
});

describe('packaged CLI subprocess contract', () => {
  const cliPath = path.resolve(import.meta.dirname, 'cli.js');
  const packageJson = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'package.json'), 'utf8'));

  function runCli(args) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-cli-test-'));
    try {
      const env = {
        ...process.env,
        OPENCHAMBER_DATA_DIR: dataDir,
        CI: '1',
        NO_COLOR: '1',
      };
      for (const key of ['OPENCHAMBER_UI_PASSWORD', 'OPENCHAMBER_HOST', 'OPENCODE_HOST', 'OPENCODE_PORT', 'OPENCODE_SKIP_START', 'OPENCODE_BINARY']) {
        delete env[key];
      }
      return spawnSync(process.execPath, [cliPath, ...args], {
        env,
        encoding: 'utf8',
        timeout: 15_000,
      });
    } finally {
      fs.rmSync(dataDir, { recursive: true, force: true });
    }
  }

  it('prints help and exits successfully without starting a server', () => {
    const result = runCli(['--help']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toContain('USAGE:');
    expect(result.stdout).toContain('serve          Start the web server');
  });

  it('prints the package version and exits successfully', () => {
    const result = runCli(['--version']);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it('reports unknown commands and closest-command suggestions with usage exit code', () => {
    const result = runCli(['statu']);

    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe(
      "Error: Unknown command 'statu'. Did you mean 'status'?\nUse --help to see available commands\n",
    );
  });

  it('reports stopped status in human, quiet, and JSON modes for an empty data directory', () => {
    const human = runCli(['status']);
    const plain = runCli(['status', '--plain']);
    const quiet = runCli(['status', '--quiet']);
    const json = runCli(['status', '--json']);

    expect(human.status).toBe(0);
    expect(human.stdout).toContain('stopped');
    expect(human.stderr).toBe('');
    expect(plain.status).toBe(0);
    expect(plain.stdout).toContain('stopped');
    expect(plain.stderr).toBe('');
    expect(quiet).toMatchObject({ status: 0, stdout: 'stopped\n', stderr: '' });
    expect(JSON.parse(json.stdout)).toEqual({
      status: 'ok',
      state: 'stopped',
      runningCount: 0,
      instances: [],
    });
    expect(json.status).toBe(0);
    expect(json.stderr).toBe('');
  });

  it('keeps removed tunnel command and flag diagnostics explicit', () => {
    const tunnel = runCli(['tunnel']);
    const flag = runCli(['--tunnel-provider=cloudflare']);
    const jsonFlag = runCli(['--tunnel-qr', '--json']);

    expect(tunnel).toMatchObject({
      status: 0,
      stdout: 'The tunnel command is no longer available.\n',
      stderr: '',
    });
    expect(flag).toMatchObject({
      status: 1,
      stdout: '',
      stderr: 'Error: `--tunnel-provider` is no longer available.\n',
    });
    expect(JSON.parse(jsonFlag.stdout)).toEqual({
      status: 'error',
      error: {
        message: '`--tunnel-qr` is no longer available.',
        details: ['`--tunnel-qr` is no longer available.'],
      },
    });
    expect(jsonFlag.status).toBe(1);
    expect(jsonFlag.stderr).toBe('');
  });
});
