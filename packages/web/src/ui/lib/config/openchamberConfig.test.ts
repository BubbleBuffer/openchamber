import { afterEach, describe, expect, it } from 'bun:test';
import {
  readOpenChamberConfig,
  saveWorktreeSetupCommands,
  updateOpenChamberConfig,
  writeOpenChamberConfig,
  type OpenChamberConfig,
} from './openchamberConfig';
import { createProjectIdFromPath } from '../project/projectId';

const project = { id: 'project-1', path: '/workspace/project\\' };
const configPath = `/home/test/.config/openchamber/projects/${createProjectIdFromPath('/workspace/project')}.json`;
const obsoleteConfigKey = ['scheduled', 'Tasks'].join('');
const existingConfig = {
  version: 'server-version',
  [obsoleteConfigKey]: [{ id: 'obsolete-task' }],
  projectNotes: 'live notes',
  'setup-worktree': ['existing setup'],
};

const createFetchHarness = () => {
  const files = new Map<string, string>();

  const fetchMock = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    if (url.pathname === '/api/fs/home') {
      return { ok: true, json: async () => ({ home: '/home/test' }) } as Response;
    }

    if (url.pathname === '/api/fs/mkdir') {
      return { ok: true, json: async () => ({ success: true }) } as Response;
    }

    if (url.pathname === '/api/fs/read') {
      const content = files.get(url.searchParams.get('path') ?? '');
      return content === undefined
        ? { ok: false, text: async () => '' } as Response
        : { ok: true, text: async () => content } as Response;
    }

    if (url.pathname === '/api/fs/write') {
      const body = JSON.parse(String(init?.body)) as { path: string; content: string };
      files.set(body.path, body.content);
      return { ok: true, json: async () => ({ success: true }) } as Response;
    }

    return { ok: false, json: async () => null } as Response;
  }) as typeof fetch;

  return { files, fetchMock };
};

const setExistingConfig = (files: Map<string, string>) => {
  files.set(configPath, JSON.stringify(existingConfig));
};

const readStoredConfig = async (files: Map<string, string>) => {
  return JSON.parse(files.get(configPath) ?? '{}') as Record<string, unknown>;
};

describe('openchamber config obsolete field removal', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('removes the obsolete field from a direct write while preserving server and live fields', async () => {
    const { files, fetchMock } = createFetchHarness();
    setExistingConfig(files);
    globalThis.fetch = fetchMock;

    await writeOpenChamberConfig(project, {
      version: 'client-version',
      [obsoleteConfigKey]: [{ id: 'incoming-task' }],
      projectNotes: 'updated notes',
    } as unknown as OpenChamberConfig);

    const saved = await readStoredConfig(files);
    expect(saved[obsoleteConfigKey]).toBeUndefined();
    expect(saved).toEqual({
      version: 'server-version',
      projectNotes: 'updated notes',
      'setup-worktree': ['existing setup'],
      projectPath: '/workspace/project',
    });
  });

  it('removes the obsolete field from updates while preserving existing values', async () => {
    const { files, fetchMock } = createFetchHarness();
    setExistingConfig(files);
    globalThis.fetch = fetchMock;

    await updateOpenChamberConfig(project, {
      [obsoleteConfigKey]: [{ id: 'incoming-task' }],
      projectNotes: 'updated notes',
    } as unknown as Partial<OpenChamberConfig>);

    const saved = await readStoredConfig(files);
    expect(saved[obsoleteConfigKey]).toBeUndefined();
    expect(saved).toEqual({
      version: 'server-version',
      projectNotes: 'updated notes',
      'setup-worktree': ['existing setup'],
      projectPath: '/workspace/project',
    });
  });

  it('removes the obsolete field while saving worktree setup commands', async () => {
    const { files, fetchMock } = createFetchHarness();
    setExistingConfig(files);
    globalThis.fetch = fetchMock;

    await saveWorktreeSetupCommands(project, ['  bun install  ', '']);

    const saved = await readStoredConfig(files);
    expect(saved[obsoleteConfigKey]).toBeUndefined();
    expect(saved).toEqual({
      version: 'server-version',
      projectNotes: 'live notes',
      'setup-worktree': ['  bun install  '],
      projectPath: '/workspace/project',
    });

    await expect(readOpenChamberConfig(project)).resolves.toEqual(saved);
  });
});
