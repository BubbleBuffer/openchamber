import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { usePwaInstallPrompt } from '@/hooks/usePwaInstallPrompt';
import { usePwaManifestSync } from '@/hooks/usePwaManifestSync';
import { useWindowControlsOverlayLayout } from '@/hooks/useWindowControlsOverlayLayout';

const { toastInfo, toastDismiss, toastSuccess } = vi.hoisted(() => ({
  toastInfo: vi.fn(() => 'install-toast'),
  toastDismiss: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/components/ui', () => ({
  toast: { info: toastInfo, dismiss: toastDismiss, success: toastSuccess },
}));

vi.mock('@/sync/sync-context', () => ({
  useSessions: () => [{ id: 's1', title: 'Older' }, { id: 's2', title: 'Current' }],
}));

vi.mock('@/sync/session-ui-store', () => ({
  useSessionUIStore: (selector: (state: { currentSessionId: string }) => unknown) => selector({ currentSessionId: 's2' }),
}));

describe('PWA runtime contracts', () => {
  afterEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    delete (navigator as Navigator & { windowControlsOverlay?: unknown }).windowControlsOverlay;
  });

  test('captures the install prompt and exposes the install action', async () => {
    renderHook(() => usePwaInstallPrompt());
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    event.prompt = prompt;
    event.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => window.dispatchEvent(event));
    const options = (toastInfo.mock.calls[0] as unknown[] | undefined)?.[1] as { action: { onClick: () => void } };
    await act(async () => options.action.onClick());

    expect(prompt).toHaveBeenCalledOnce();
    expect(toastSuccess).toHaveBeenCalledWith('Install started');
  });

  test('updates Window Controls Overlay insets from manifest display geometry', () => {
    const overlay = {
      visible: true,
      getTitlebarAreaRect: () => ({ x: 24, width: 900, height: 32 }),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(navigator, 'windowControlsOverlay', { configurable: true, value: overlay });
    window.matchMedia = ((query: string) => ({ matches: query.includes('window-controls-overlay') })) as typeof window.matchMedia;

    const { unmount } = renderHook(() => useWindowControlsOverlayLayout());

    expect(document.documentElement.style.getPropertyValue('--oc-wco-left-inset')).toBe('24px');
    expect(document.documentElement.style.getPropertyValue('--oc-wco-titlebar-height')).toBe('32px');
    unmount();
    expect(overlay.removeEventListener).toHaveBeenCalled();
  });

  test('syncs recent sessions to the PWA manifest update hook', () => {
    const updateManifest = vi.fn();
    (window as Window & { __OPENCHAMBER_UPDATE_PWA_MANIFEST__?: () => void }).__OPENCHAMBER_UPDATE_PWA_MANIFEST__ = updateManifest;

    const { unmount } = renderHook(() => usePwaManifestSync());

    expect(JSON.parse(window.localStorage.getItem('openchamber.pwaRecentSessions') ?? '[]')).toEqual([
      { sessionId: 's2', title: 'Current' },
      { sessionId: 's1', title: 'Older' },
    ]);
    expect(updateManifest).toHaveBeenCalledOnce();
    unmount();
  });
});
