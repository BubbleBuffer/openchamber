import { describe, expect, test } from 'vitest';
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
