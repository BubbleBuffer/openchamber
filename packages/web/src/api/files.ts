import {
  parseFileListResponse,
  parseFsMutationResponse,
  parseStatResponse,
} from '@contracts/files';
import type { FsDirectoryEntry, FsListResponse, FsMutationResponse, FsStatResponse } from '@contracts/files';

export type ListDirectoryOptions = { respectGitignore?: boolean };
export type DirectoryListResult = { directory: string; entries: FsDirectoryEntry[] };
export type FileMutationResult = Omit<FsMutationResponse, 'path'> & { path: string };
/** SDK pass-through feature shape; this endpoint returns only file identifiers. */
export type FileSearchQuery = { directory: string; query: string; maxResults?: number; includeHidden?: boolean; respectGitignore?: boolean };
export type FileSearchResult = { path: string; score?: number; preview?: string[] };
export type CommandExecResult = { command: string; success: boolean; exitCode?: number; stdout?: string; stderr?: string; error?: string };
export interface FilesAPI {
  listDirectory(path: string, options?: ListDirectoryOptions): Promise<DirectoryListResult>;
  search(payload: FileSearchQuery): Promise<FileSearchResult[]>;
  createDirectory(path: string): Promise<FileMutationResult>;
  statFile?(path: string): Promise<FsStatResponse>;
  readFile?(path: string): Promise<{ content: string; path: string }>;
  readFileBinary?(path: string): Promise<{ dataUrl: string; path: string }>;
  writeFile?(path: string, content: string): Promise<FileMutationResult>;
  delete?(path: string): Promise<{ success: boolean }>;
  rename?(oldPath: string, newPath: string): Promise<FileMutationResult>;
  execCommands?(commands: string[], cwd: string): Promise<{ success: boolean; results: CommandExecResult[] }>;
  downloadFile?(path: string): Promise<void>;
}

const normalizePath = (path: string): string => path.replace(/\\/g, '/');

/** SDK pass-through endpoint: validate only the string paths this feature uses. */
export const parseFileSearchResults = (value: unknown): string[] | null =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : null;

const toDirectoryListResult = (fallbackDirectory: string, payload: FsListResponse): DirectoryListResult => {
  const directory = normalizePath(payload.directory || fallbackDirectory);
  return {
    directory,
    entries: payload.entries.map((entry) => ({
        name: entry.name,
        path: normalizePath(entry.path),
        isDirectory: entry.isDirectory,
      })),
  };
};

const errorMessage = async (response: Response, fallback: string): Promise<string> => {
  const error = await response.json().catch(() => ({ error: response.statusText }));
  return typeof error?.error === 'string' ? error.error : fallback;
};

export const createWebFilesAPI = (): FilesAPI => ({
  async listDirectory(path: string, options?: ListDirectoryOptions): Promise<DirectoryListResult> {
    const target = normalizePath(path);
    const params = new URLSearchParams();
    if (target) {
      params.set('path', target);
    }
    if (typeof options?.respectGitignore === 'boolean') {
      params.set('respectGitignore', String(options.respectGitignore));
    }

    const response = await fetch(`/api/fs/list${params.toString() ? `?${params.toString()}` : ''}`);

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to list directory'));
    }

    const result = parseFileListResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file list response');
    return toDirectoryListResult(target, result.value);
  },

  async search(payload: FileSearchQuery): Promise<FileSearchResult[]> {
    const params = new URLSearchParams();

    const directory = normalizePath(payload.directory);
    if (directory) {
      params.set('directory', directory);
    }

    params.set('query', payload.query);
    params.set('dirs', 'false');
    params.set('type', 'file');

    if (typeof payload.maxResults === 'number' && Number.isFinite(payload.maxResults)) {
      params.set('limit', String(payload.maxResults));
    }

    const response = await fetch(`/api/find/file?${params.toString()}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to search files');
    }

    const files = parseFileSearchResults(await response.json().catch(() => undefined));
    if (!files) throw new Error('Invalid file search response');

    return files.map((relativePath) => ({
      path: normalizePath(`${directory}/${relativePath}`),
      preview: [normalizePath(relativePath)],
    }));
  },

  async createDirectory(path: string): Promise<FileMutationResult> {
    const target = normalizePath(path);
    const response = await fetch('/api/fs/mkdir', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to create directory'));
    }

    const result = parseFsMutationResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file mutation response');
    return {
      success: result.value.success,
      path: result.value.path ? normalizePath(result.value.path) : target,
    };
  },

  async statFile(path: string): Promise<FsStatResponse> {
    const target = normalizePath(path);
    const response = await fetch(`/api/fs/stat?path=${encodeURIComponent(target)}`);

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to stat file'));
    }

    const result = parseStatResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file stat response');
    return {
      path: normalizePath(result.value.path || target),
      isFile: result.value.isFile,
      size: result.value.size,
      mtimeMs: result.value.mtimeMs,
    };
  },

  async readFile(path: string): Promise<{ content: string; path: string }> {
    const target = normalizePath(path);
    const response = await fetch(`/api/fs/read?path=${encodeURIComponent(target)}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to read file');
    }

    const content = await response.text();
    return { content, path: target };
  },

  async writeFile(path: string, content: string): Promise<FileMutationResult> {
    const target = normalizePath(path);
    const response = await fetch('/api/fs/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target, content }),
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to write file'));
    }

    const result = parseFsMutationResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file mutation response');
    return {
      success: result.value.success,
      path: result.value.path ? normalizePath(result.value.path) : target,
    };
  },

  async delete(path: string): Promise<{ success: boolean }> {
    const target = normalizePath(path);
    const response = await fetch('/api/fs/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: target }),
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to delete file'));
    }

    const result = parseFsMutationResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file mutation response');
    return { success: result.value.success };
  },

  async rename(oldPath: string, newPath: string): Promise<FileMutationResult> {
    const response = await fetch('/api/fs/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath }),
    });

    if (!response.ok) {
      throw new Error(await errorMessage(response, 'Failed to rename file'));
    }

    const result = parseFsMutationResponse(await response.json().catch(() => undefined));
    if (!result.ok) throw new Error('Invalid file mutation response');
    return {
      success: result.value.success,
      path: result.value.path ? normalizePath(result.value.path) : newPath,
    };
  },

  async downloadFile(path: string): Promise<void> {
    const target = normalizePath(path);
    const url = `/api/fs/raw?path=${encodeURIComponent(target)}&download=true`;
    const a = document.createElement('a');
    a.href = url;
    a.download = target.split('/').pop() || 'file';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },
});
