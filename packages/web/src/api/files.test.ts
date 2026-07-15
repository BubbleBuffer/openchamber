import { afterEach, describe, expect, test, vi } from 'vitest';
import { createWebFilesAPI } from './files';

describe('web files API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { document?: unknown }).document;
  });

  test('downloads through a browser anchor and has no reveal capability', async () => {
    const click = vi.fn();
    const append = vi.fn();
    const remove = vi.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        body: { appendChild: append, removeChild: remove },
        createElement: () => ({ href: '', download: '', click }),
      },
    });

    const files = createWebFilesAPI();
    await files.downloadFile?.('docs/readme.md');

    expect(click).toHaveBeenCalledOnce();
    expect(append).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(Reflect.has(files, ['reveal', 'Path'].join(''))).toBe(false);
  });
});
