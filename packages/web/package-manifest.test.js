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
});
