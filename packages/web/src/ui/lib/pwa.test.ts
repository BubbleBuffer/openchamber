import 'happy-dom';
import { ensureDom } from '@/stores/utils/setupDom';
ensureDom();

import { afterEach, describe, expect, test } from 'bun:test';
import { getPWADisplayMode, isInstalledPWARuntime } from './pwa';

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(document, 'referrer', { configurable: true, value: '' });
  Object.defineProperty(window.navigator, 'standalone', { configurable: true, value: false });
});

describe('PWA display mode', () => {
  test('detects browser display mode', () => {
    window.matchMedia = (() => ({ matches: false })) as unknown as typeof window.matchMedia;
    expect(getPWADisplayMode()).toBe('browser');
    expect(isInstalledPWARuntime()).toBe(false);
  });

  test('detects standalone display mode', () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(display-mode: standalone)' })) as unknown as typeof window.matchMedia;
    expect(getPWADisplayMode()).toBe('standalone');
    expect(isInstalledPWARuntime()).toBe(true);
  });

  test('detects Window Controls Overlay display mode', () => {
    window.matchMedia = ((query: string) => ({ matches: query === '(display-mode: window-controls-overlay)' })) as unknown as typeof window.matchMedia;
    expect(getPWADisplayMode()).toBe('window-controls-overlay');
  });
});
