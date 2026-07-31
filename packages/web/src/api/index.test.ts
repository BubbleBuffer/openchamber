import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWebAPIs } from './index';

describe('web runtime descriptor', () => {
  test('exposes only the web runtime descriptor and the shared bridge keys', () => {
    const apis = createWebAPIs();

    expect(apis.runtime).toEqual({ platform: 'web', label: 'web' });
    expect(Object.keys(apis).sort()).toEqual([
      'files', 'git', 'github', 'notifications', 'permissions', 'push', 'runtime', 'settings', 'terminal', 'tools',
    ]);
  });
});

describe('runtime API contract ownership', () => {
  test('keeps bridge composition free of an all-domain registry and wire shapes', () => {
    const apiDirectory = resolve(import.meta.dirname, '.');
    const bridgeTypes = readFileSync(resolve(apiDirectory, '../ui/lib/api/types.ts'), 'utf8');

    expect(existsSync(resolve(apiDirectory, 'domain-apis.ts'))).toBe(false);
    expect(bridgeTypes).not.toMatch(/interface\s+(?:Files|Settings|Terminal|Git|GitHub|Push|Notifications|Tools|Permissions)API/);
    expect(bridgeTypes).not.toMatch(/Promise<\s*\{/);
  });
});
