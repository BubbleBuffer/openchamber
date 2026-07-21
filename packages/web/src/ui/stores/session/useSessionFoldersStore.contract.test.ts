import { describe, expect, it } from 'vitest';
import { parseSessionFoldersResponse } from '@contracts/opencode';

describe('session folders store contract', () => {
  it('does not admit malformed remote folder state into hydration', () => {
    expect(parseSessionFoldersResponse({ version: 1, foldersMap: { scope: [{ id: 'folder', name: 1, sessionIds: [], createdAt: 0 }] }, collapsedFolderIds: [] }).ok).toBe(false);
  });
});
