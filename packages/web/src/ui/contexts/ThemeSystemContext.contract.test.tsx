import { describe, expect, it } from 'vitest';
import { parseThemesListResponse } from '@contracts/themes';

describe('ThemeSystemContext custom theme transport contract', () => {
  it('rejects malformed successful theme responses before they reach theme selection', () => {
    expect(parseThemesListResponse({ themes: [{ metadata: { id: 'bad' } }] }).ok).toBe(false);
  });
});
