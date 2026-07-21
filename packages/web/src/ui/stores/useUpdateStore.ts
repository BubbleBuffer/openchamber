import { create } from 'zustand';
import type { UpdateInfo } from '@/lib/config/updateTypes';
import { getDeviceInfo } from '@/lib/device';
import { useUIStore } from './useUIStore';
import { parseUpdateCheckResult } from '@contracts/system';

export type UpdateState = {
  checking: boolean;
  available: boolean;
  info: UpdateInfo | null;
  error: string | null;
  lastChecked: number | null;
  nextCheckInSec: number | null;
};

interface UpdateStore extends UpdateState {
  checkForUpdates: () => Promise<number | null>;
  dismiss: () => void;
  reset: () => void;
}

function detectDeviceClass(): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown';
  try {
    return getDeviceInfo().deviceType;
  } catch {
    return 'unknown';
  }
}

function detectArch(): 'arm64' | 'x64' | 'unknown' {
  const nav = typeof navigator !== 'undefined'
    ? (navigator as Navigator & { userAgentData?: { architecture?: string } }).userAgentData
    : undefined;
  const architecture = nav?.architecture?.toLowerCase?.();
  if (architecture === 'arm' || architecture === 'arm64' || architecture === 'aarch64') return 'arm64';
  if (architecture === 'x86' || architecture === 'x64' || architecture === 'amd64') return 'x64';
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent.toLowerCase() : '';
  if (ua.includes('aarch64') || ua.includes('arm64') || ua.includes('armv')) return 'arm64';
  if (ua.includes('x86_64') || ua.includes('x64') || ua.includes('amd64') || ua.includes('win64')) return 'x64';
  return 'unknown';
}

function detectPlatform(): 'macos' | 'windows' | 'linux' | 'web' {
  if (typeof navigator === 'undefined') return 'web';
  const platform = (navigator.platform || '').toLowerCase();
  if (platform.includes('mac')) return 'macos';
  if (platform.includes('win')) return 'windows';
  if (platform.includes('linux')) return 'linux';
  return 'web';
}

function mapUpdateParams(): URLSearchParams {
  const params = new URLSearchParams({ reportUsage: useUIStore.getState().reportUsage ? 'true' : 'false' });
  params.set('deviceClass', detectDeviceClass());
  params.set('arch', detectArch());
  params.set('platform', detectPlatform());
  params.set('appType', 'web');
  return params;
}

async function checkForWebUpdates(currentVersion?: string): Promise<UpdateInfo | null> {
  try {
    const params = mapUpdateParams();
    if (currentVersion) params.set('currentVersion', currentVersion);
    const response = await fetch(`/api/openchamber/update-check?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Server responded with ${response.status}`);
    const parsed = parseUpdateCheckResult(await response.json());
    if (!parsed.ok) throw new Error(parsed.error);
    const data = parsed.value;
    return {
      available: data.available ?? false,
      version: data.version,
      currentVersion: data.currentVersion ?? 'unknown',
      body: data.body,
      nextSuggestedCheckInSec: typeof data.nextSuggestedCheckInSec === 'number' && Number.isFinite(data.nextSuggestedCheckInSec)
        ? data.nextSuggestedCheckInSec
        : undefined,
      packageManager: data.packageManager,
      updateCommand: data.updateCommand,
    };
  } catch (error) {
    console.warn('Failed to check for updates:', error);
    return null;
  }
}

const initialState: UpdateState = {
  checking: false,
  available: false,
  info: null,
  error: null,
  lastChecked: null,
  nextCheckInSec: null,
};

export const useUpdateStore = create<UpdateStore>()((set) => ({
  ...initialState,

  checkForUpdates: async () => {
    set({ checking: true, error: null });
    const info = await checkForWebUpdates();
    const suggestedSec = info?.nextSuggestedCheckInSec ?? null;
    set({
      checking: false,
      available: info?.available ?? false,
      info,
      lastChecked: Date.now(),
      nextCheckInSec: suggestedSec,
    });
    return suggestedSec;
  },

  dismiss: () => set({ available: false, info: null }),
  reset: () => set(initialState),
}));
