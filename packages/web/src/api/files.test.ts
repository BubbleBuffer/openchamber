import { afterEach, describe, expect, test, vi } from 'vitest';
import { createWebFilesAPI, parseFileSearchResults } from './files';

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

  test('rejects a malformed successful directory response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ directory: '/workspace', entries: [{}] }),
    } as Response);

    await expect(createWebFilesAPI().listDirectory('/workspace')).rejects.toThrow('Invalid file list response');
  });

  test('keeps SDK file search pass-through local while rejecting a malformed feature shape', async () => {
    expect(parseFileSearchResults(['src/a.ts'])).toEqual(['src/a.ts']);
    expect(parseFileSearchResults(['src/a.ts', 1])).toBeNull();

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ['src/a.ts', 1],
    } as Response);

    await expect(createWebFilesAPI().search({ directory: '/workspace', query: 'a' })).rejects.toThrow('Invalid file search response');
  });
});
