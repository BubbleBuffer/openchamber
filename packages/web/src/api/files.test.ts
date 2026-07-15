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

  test.each([
    { respectGitignore: true, expectedQueryValue: 'true' },
    { respectGitignore: false, expectedQueryValue: 'false' },
  ])('forwards respectGitignore=$respectGitignore and normalizes the directory path', async ({ respectGitignore, expectedQueryValue }) => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        directory: 'C:\\workspace',
        entries: [{ name: 'src', path: 'C:\\workspace\\src', isDirectory: true }],
      }),
    } as Response);

    const result = await createWebFilesAPI().listDirectory('C:\\workspace', { respectGitignore });

    expect(fetch).toHaveBeenCalledWith(
      `/api/fs/list?path=C%3A%2Fworkspace&respectGitignore=${expectedQueryValue}`,
    );
    expect(result.directory).toBe('C:/workspace');
    expect(result.entries[0]?.path).toBe('C:/workspace/src');
  });
});
