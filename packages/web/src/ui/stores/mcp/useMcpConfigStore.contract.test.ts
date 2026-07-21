import { beforeEach, describe, expect, it, vi } from "vitest";

const { refreshAfterOpenCodeRestart, startConfigUpdate, finishConfigUpdate, fetchMock } = vi.hoisted(() => ({ refreshAfterOpenCodeRestart: vi.fn(), startConfigUpdate: vi.fn(), finishConfigUpdate: vi.fn(), fetchMock: vi.fn() }));
vi.mock('@/stores/agents/useAgentsStore', () => ({ refreshAfterOpenCodeRestart }));
vi.mock('@/lib/config/configUpdate', () => ({ startConfigUpdate, finishConfigUpdate }));
vi.mock('@/stores/projects/useProjectsStore', () => ({ useProjectsStore: { getState: () => ({ getActiveProject: () => null }) } }));
vi.mock('@/lib/opencode/client', () => ({ opencodeClient: { getDirectory: () => null } }));

import { useMcpConfigStore } from './useMcpConfigStore';

describe("MCP config store contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    refreshAfterOpenCodeRestart.mockReset();
    startConfigUpdate.mockReset();
    finishConfigUpdate.mockReset();
    fetchMock.mockReset();
    useMcpConfigStore.setState({ mcpServers: [], selectedMcpName: 'selected', isLoading: false, mcpDraft: null });
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ success: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
  });

  it("does not treat success:false create, update, or delete responses as successful mutations", async () => {
    const store = useMcpConfigStore.getState();
    const create = await store.createMcp({ name: 'server', scope: 'user', type: 'remote', command: [], url: 'https://example.test', environment: [], headers: [], oauthEnabled: false, oauthClientId: '', oauthClientSecret: '', oauthScope: '', oauthRedirectUri: '', timeout: '', enabled: true });
    expect(create).toEqual({ ok: false });
    await expect(store.updateMcp('server', { enabled: false })).rejects.toThrow('Invalid MCP mutation response');
    const deleted = await store.deleteMcp('server');
    expect(deleted).toEqual({ ok: false });
    expect(refreshAfterOpenCodeRestart).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls).toHaveLength(3);
  });
});
