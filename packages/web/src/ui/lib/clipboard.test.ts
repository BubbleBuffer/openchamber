import 'happy-dom';
import { ensureDom } from '@/stores/utils/setupDom';
ensureDom();

import { afterEach, describe, expect, test } from 'bun:test';
import { copyTextToClipboard } from './clipboard';

const originalClipboard = navigator.clipboard;
const originalExecCommand = document.execCommand;

afterEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: originalClipboard });
  document.execCommand = originalExecCommand;
});

describe('browser clipboard', () => {
  test('uses the Clipboard API when available', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => copied.push(text) },
    });

    await expect(copyTextToClipboard('hello')).resolves.toEqual({ ok: true, method: 'clipboard' });
    expect(copied).toEqual(['hello']);
  });

  test('falls back to execCommand when the Clipboard API fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async () => { throw new Error('denied'); } },
    });
    document.execCommand = (() => true) as typeof document.execCommand;

    await expect(copyTextToClipboard('fallback')).resolves.toEqual({ ok: true, method: 'execCommand' });
  });
});
