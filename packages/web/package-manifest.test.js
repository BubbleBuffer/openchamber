import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));

async function readPackage(relativePath) {
  return JSON.parse(await readFile(path.resolve(packageDirectory, relativePath), 'utf8'));
}

describe('published package versions', () => {
  it('uses the exact session-state version required by the web package', async () => {
    const [rootPackage, sessionStatePackage, webPackage] = await Promise.all([
      readPackage('../../package.json'),
      readPackage('../session-state/package.json'),
      readPackage('package.json'),
    ]);

    expect(sessionStatePackage.private).toBe(false);
    expect(sessionStatePackage.version).toBe(rootPackage.version);
    expect(webPackage.version).toBe(rootPackage.version);
    expect(webPackage.dependencies['@openchamber/session-state']).toBe(sessionStatePackage.version);
    expect(webPackage.dependencies['@openchamber/session-state']).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/);
  });

  it('publishes the thin package bin and its CLI-owned runtime modules', async () => {
    const webPackage = await readPackage('package.json');
    const binPath = path.resolve(packageDirectory, webPackage.bin.openchamber);
    const cli = await import('./bin/cli.js');

    expect(webPackage.bin).toEqual({ openchamber: './bin/cli.js' });
    expect(webPackage.files).toContain('bin');
    expect(binPath).toBe(path.join(packageDirectory, 'bin', 'cli.js'));
    expect(await readFile(path.join(packageDirectory, 'bin', 'cli', 'daemon-entry.js'), 'utf8')).toContain('openchamber:ready');
    expect(cli).toEqual(expect.objectContaining({
      main: expect.any(Function),
      runCli: expect.any(Function),
      parseArgs: expect.any(Function),
      formatTopLevelError: expect.any(Function),
    }));
    expect(cli.commands).toBeUndefined();
  });
});
