import 'happy-dom';
import { ensureDom } from '@/stores/utils/setupDom';
ensureDom();

import { describe, expect, test } from 'bun:test';
import { openExternalUrl } from './url';

describe('browser URL opening', () => {
  test('rejects unsafe URL schemes without opening them', async () => {
    const open = window.open;
    window.open = (() => {
      throw new Error('unsafe URL was opened');
    }) as typeof window.open;

    await expect(openExternalUrl('javascript:alert(1)')).resolves.toBe(false);
    window.open = open;
  });

  test('opens normalized HTTP(S) URLs through the browser', async () => {
    const opened: string[] = [];
    const open = window.open;
    window.open = ((url: string | URL) => {
      opened.push(String(url));
      return null;
    }) as typeof window.open;

    await expect(openExternalUrl(' https://example.com/path ')).resolves.toBe(true);
    expect(opened).toEqual(['https://example.com/path']);
    window.open = open;
  });

});
