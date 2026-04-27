# Store Refactoring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. REQUIRED SUB-SKILL: Use superpawers:test-driven-development before writing each new store file.

**Goal:** Split 4 monolith stores (~6,000 combined lines) into 10 focused stores/modules with clear boundaries, fixing circular dependencies, and migrating all 200+ consumer files.

**Architecture:** Extract self-contained domains (voice settings, dialog state) first using the facade pattern (old store re-exports from new). Then split the config monolith into provider-config and agent-config stores. Extract message sending and session CRUD into standalone modules. Fix circular deps by parameterizing directory access. Move DOM side-effects into React hooks. Each extraction preserves backward compatibility until consumers are migrated.

**Tech Stack:** TypeScript, Zustand, React, Bun

---

## File Changes

| File | Change |
|------|--------|
| `packages/ui/src/stores/useVoiceSettingsStore.ts` | **Create** — voice/TTS/STT store (new) |
| `packages/ui/src/stores/useConfigStore.ts` | **Modify** — remove voice fields, add facade re-exports |
| `packages/ui/src/stores/useDialogStore.ts` | **Create** — dialog booleans store (new) |
| `packages/ui/src/stores/useUIStore.ts` | **Modify** — remove dialog fields, add facade re-exports |
| `packages/ui/src/stores/useProviderConfigStore.ts` | **Create** — provider-only config store (new) |
| `packages/ui/src/stores/useAgentConfigStore.ts` | **Create** — agent-only config store (new) |
| `packages/ui/src/sync/send-message.ts` | **Create** — sendMessage standalone module (new) |
| `packages/ui/src/sync/session-ops.ts` | **Create** — session CRUD standalone module (new) |
| `packages/ui/src/sync/session-ui-store.ts` | **Modify** — thin down to UI state only |
| `packages/ui/src/stores/useAgentsStore.ts` | **Modify** — parameterize `loadAgents`, fix circular dep |
| `packages/ui/src/hooks/useThemeEffects.ts` | **Create** — DOM side-effects hook (new) |
| Various consumer files (~53+86+64+10) | **Modify** — update imports |

---

### Task 1: Extract useVoiceSettingsStore from useConfigStore

**Files:**
- Create: `packages/ui/src/stores/useVoiceSettingsStore.ts`
- Modify: `packages/ui/src/stores/useConfigStore.ts`

**Rationale:** Self-contained: 23 fields, 17 setters, 5 consumer files. Voice/TTS/STT settings change at human speed (button clicks), not streaming speed. No dependencies on other stores. Uses manual localStorage (not zustand persist middleware) for voice fields — keep that pattern.

- [ ] **Step 1: Create useVoiceSettingsStore.ts**

Complete new store file:

```typescript
// packages/ui/src/stores/useVoiceSettingsStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

const getLS = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

const setLS = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
};

interface VoiceSettingsStore {
  // Voice provider preference
  voiceProvider: 'browser' | 'openai' | 'openai-compatible' | 'say';
  setVoiceProvider: (provider: 'browser' | 'openai' | 'openai-compatible' | 'say') => void;

  // TTS settings
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
  sayVoice: string;
  browserVoice: string;
  openaiVoice: string;
  openaiApiKey: string;
  openaiCompatibleUrl: string;
  openaiCompatibleVoice: string;
  openaiCompatibleTtsModel: string;

  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSpeechVolume: (volume: number) => void;
  setSayVoice: (voice: string) => void;
  setBrowserVoice: (voice: string) => void;
  setOpenaiVoice: (voice: string) => void;
  setOpenaiApiKey: (apiKey: string) => void;
  setOpenaiCompatibleUrl: (url: string) => void;
  setOpenaiCompatibleVoice: (voice: string) => void;
  setOpenaiCompatibleTtsModel: (model: string) => void;

  // STT settings
  sttProvider: 'browser' | 'server';
  sttServerUrl: string;
  sttModel: string;
  sttLanguage: string;
  sttSilenceThresholdDb: number;
  sttSilenceHoldMs: number;

  setSttProvider: (provider: 'browser' | 'server') => void;
  setSttServerUrl: (url: string) => void;
  setSttModel: (model: string) => void;
  setSttLanguage: (lang: string) => void;
  setSttSilenceThresholdDb: (db: number) => void;
  setSttSilenceHoldMs: (ms: number) => void;

  // UI toggles
  showMessageTTSButtons: boolean;
  voiceModeEnabled: boolean;

  setShowMessageTTSButtons: (show: boolean) => void;
  setVoiceModeEnabled: (enabled: boolean) => void;

  // Summarization settings
  summarizeMessageTTS: boolean;
  summarizeVoiceConversation: boolean;
  summarizeCharacterThreshold: number;
  summarizeMaxLength: number;

  setSummarizeMessageTTS: (enabled: boolean) => void;
  setSummarizeVoiceConversation: (enabled: boolean) => void;
  setSummarizeCharacterThreshold: (threshold: number) => void;
  setSummarizeMaxLength: (maxLength: number) => void;
}

export const useVoiceSettingsStore = create<VoiceSettingsStore>()(
  devtools(
    (set) => ({
      // Voice provider
      voiceProvider: (() => {
        const saved = getLS('voiceProvider');
        if (saved === 'openai' || saved === 'browser' || saved === 'say' || saved === 'openai-compatible') return saved;
        return 'browser';
      })(),

      setVoiceProvider: (provider) => {
        set({ voiceProvider: provider });
        setLS('voiceProvider', provider);
      },

      // TTS
      speechRate: (() => {
        const saved = getLS('speechRate');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0.5 && p <= 2) return p; }
        return 1;
      })(),

      speechPitch: (() => {
        const saved = getLS('speechPitch');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0.5 && p <= 2) return p; }
        return 1;
      })(),

      speechVolume: (() => {
        const saved = getLS('speechVolume');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0 && p <= 1) return p; }
        return 1;
      })(),

      sayVoice: (() => getLS('sayVoice') ?? 'Samantha')(),
      browserVoice: (() => getLS('browserVoice') ?? '')(),
      openaiVoice: (() => getLS('openaiVoice') ?? 'nova')(),
      openaiApiKey: (() => getLS('openaiApiKey') ?? '')(),
      openaiCompatibleUrl: (() => getLS('openaiCompatibleUrl') ?? '')(),
      openaiCompatibleVoice: (() => getLS('openaiCompatibleVoice') ?? 'af_sky')(),
      openaiCompatibleTtsModel: (() => {
        const saved = getLS('openaiCompatibleTtsModel');
        if (saved && saved !== 'speaches-ai/Kokoro-82M-v1.0-ONNX') return saved;
        return 'kokoro';
      })(),

      setSpeechRate: (rate) => { const c = Math.max(0.5, Math.min(2, rate)); set({ speechRate: c }); setLS('speechRate', String(c)); },
      setSpeechPitch: (pitch) => { const c = Math.max(0.5, Math.min(2, pitch)); set({ speechPitch: c }); setLS('speechPitch', String(c)); },
      setSpeechVolume: (volume) => { const c = Math.max(0, Math.min(1, volume)); set({ speechVolume: c }); setLS('speechVolume', String(c)); },
      setSayVoice: (voice) => { set({ sayVoice: voice }); setLS('sayVoice', voice); },
      setBrowserVoice: (voice) => { set({ browserVoice: voice }); setLS('browserVoice', voice); },
      setOpenaiVoice: (voice) => { set({ openaiVoice: voice }); setLS('openaiVoice', voice); },
      setOpenaiApiKey: (apiKey) => { set({ openaiApiKey: apiKey }); setLS('openaiApiKey', apiKey); },
      setOpenaiCompatibleUrl: (url) => { set({ openaiCompatibleUrl: url }); setLS('openaiCompatibleUrl', url); },
      setOpenaiCompatibleVoice: (voice) => { set({ openaiCompatibleVoice: voice }); setLS('openaiCompatibleVoice', voice); },
      setOpenaiCompatibleTtsModel: (model) => { set({ openaiCompatibleTtsModel: model }); setLS('openaiCompatibleTtsModel', model); },

      // STT
      sttProvider: (() => {
        const saved = getLS('sttProvider');
        if (saved === 'browser' || saved === 'server') return saved;
        return 'browser';
      })(),

      sttServerUrl: (() => getLS('sttServerUrl') ?? 'http://localhost:8001/v1')(),
      sttModel: (() => getLS('sttModel') ?? 'deepdml/faster-whisper-large-v3-turbo-ct2')(),
      sttLanguage: (() => { const saved = getLS('sttLanguage'); return saved !== null ? saved : ''; })(),

      sttSilenceThresholdDb: (() => {
        const saved = getLS('sttSilenceThresholdDb');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p)) return p; }
        return -45;
      })(),

      sttSilenceHoldMs: (() => {
        const saved = getLS('sttSilenceHoldMs');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p)) return p; }
        return 1500;
      })(),

      setSttProvider: (provider) => { set({ sttProvider: provider }); setLS('sttProvider', provider); },
      setSttServerUrl: (url) => { set({ sttServerUrl: url }); setLS('sttServerUrl', url); },
      setSttModel: (model) => { set({ sttModel: model }); setLS('sttModel', model); },
      setSttLanguage: (lang) => { set({ sttLanguage: lang }); setLS('sttLanguage', lang); },
      setSttSilenceThresholdDb: (db) => { set({ sttSilenceThresholdDb: db }); setLS('sttSilenceThresholdDb', String(db)); },
      setSttSilenceHoldMs: (ms) => { set({ sttSilenceHoldMs: ms }); setLS('sttSilenceHoldMs', String(ms)); },

      // UI toggles
      showMessageTTSButtons: (() => {
        const saved = getLS('showMessageTTSButtons');
        return saved === 'true';
      })(),

      voiceModeEnabled: (() => {
        const saved = getLS('voiceModeEnabled');
        return saved === 'true';
      })(),

      setShowMessageTTSButtons: (show) => { set({ showMessageTTSButtons: show }); setLS('showMessageTTSButtons', String(show)); },
      setVoiceModeEnabled: (enabled) => { set({ voiceModeEnabled: enabled }); setLS('voiceModeEnabled', String(enabled)); },

      // Summarization
      summarizeMessageTTS: (() => {
        const saved = getLS('summarizeMessageTTS');
        return saved === 'true';
      })(),

      summarizeVoiceConversation: (() => {
        const saved = getLS('summarizeVoiceConversation');
        return saved === 'true';
      })(),

      summarizeCharacterThreshold: (() => {
        const saved = getLS('summarizeCharacterThreshold');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p) && p >= 50 && p <= 2000) return p; }
        return 200;
      })(),

      summarizeMaxLength: (() => {
        const saved = getLS('summarizeMaxLength');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p) && p >= 50 && p <= 2000) return p; }
        return 500;
      })(),

      setSummarizeMessageTTS: (enabled) => { set({ summarizeMessageTTS: enabled }); setLS('summarizeMessageTTS', String(enabled)); },
      setSummarizeVoiceConversation: (enabled) => { set({ summarizeVoiceConversation: enabled }); setLS('summarizeVoiceConversation', String(enabled)); },
      setSummarizeCharacterThreshold: (threshold) => { const c = Math.max(50, Math.min(2000, threshold)); set({ summarizeCharacterThreshold: c }); setLS('summarizeCharacterThreshold', String(c)); },
      setSummarizeMaxLength: (maxLength) => { const c = Math.max(50, Math.min(2000, maxLength)); set({ summarizeMaxLength: c }); setLS('summarizeMaxLength', String(c)); },
    }),
    { name: "voice-settings-store" },
  ),
);
```

- [ ] **Step 2: Remove voice fields from useConfigStore.ts state interface**

In `ConfigStore` interface (lines 467-581):
- Remove lines 497-523 (voiceProvider through summarizeMaxLength state fields)
- Remove lines 524-545 (all voice/tts/stt setter method signatures)

The remaining interface should have: activeDirectoryKey, directoryScoped, providers, agents, currentProviderId, currentModelId, currentVariant, currentAgentName, selectedProviderId, agentModelSelections, defaultProviders, isConnected, hasEverConnected, connectionPhase, lastDisconnectReason, isInitialized, modelsMetadata, settingsDefaultModel through settingsMessageStreamTransport, isAutoModel, activateDirectory through getVisibleAgents.

- [ ] **Step 3: Remove voice initial state from useConfigStore.ts create() call**

Remove lines 625-819 (all voice IIFE initial values: voiceProvider through summarizeMaxLength).

- [ ] **Step 4: Remove voice setters from useConfigStore.ts**

Remove lines 1745-1909 (setVoiceProvider through setSummarizeMaxLength).

- [ ] **Step 5: Remove voice fields from persist partialize**

In the persist partialize (lines 2070-2096), remove lines 2092-2094:
```typescript
// REMOVE these three lines:
speechRate: state.speechRate,
speechPitch: state.speechPitch,
speechVolume: state.speechVolume,
```

- [ ] **Step 6: Add facade re-export in useConfigStore.ts**

At the bottom of useConfigStore.ts (after line 2139), add:
```typescript
// Facade re-export for backward compatibility during migration
// TODO: Remove once all consumers are migrated to useVoiceSettingsStore
export { useVoiceSettingsStore } from "./useVoiceSettingsStore";
```

- [ ] **Step 7: Verify with type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS (no consumers changed yet; they still work through the old store)

---

### Task 2: Extract useDialogStore from useUIStore

**Files:**
- Create: `packages/ui/src/stores/useDialogStore.ts`
- Modify: `packages/ui/src/stores/useUIStore.ts`

**Rationale:** 14 dialog booleans, clean cut, 11 consumer files (QuickOpenDialog, HelpDialog, CommandPalette, SettingsView, AboutDialog, OpenCodeStatusDialog, ScheduledTasksDialog, MainLayout, ModelControls, etc.). Dialogs change at human interaction speed, not streaming speed.

- [ ] **Step 1: Create useDialogStore.ts**

```typescript
// packages/ui/src/stores/useDialogStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

interface DialogStore {
  isQuickOpenOpen: boolean;
  isCommandPaletteOpen: boolean;
  isHelpDialogOpen: boolean;
  isAboutDialogOpen: boolean;
  isOpenCodeStatusDialogOpen: boolean;
  openCodeStatusText: string;
  isSessionCreateDialogOpen: boolean;
  isScheduledTasksDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isModelSelectorOpen: boolean;
  isTimelineDialogOpen: boolean;
  isImagePreviewOpen: boolean;
  isMultiRunLauncherOpen: boolean;
  multiRunLauncherPrefillPrompt: string;

  setQuickOpenOpen: (open: boolean) => void;
  toggleQuickOpen: () => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleHelpDialog: () => void;
  setHelpDialogOpen: (open: boolean) => void;
  setAboutDialogOpen: (open: boolean) => void;
  setOpenCodeStatusDialogOpen: (open: boolean) => void;
  setOpenCodeStatusText: (text: string) => void;
  setSessionCreateDialogOpen: (open: boolean) => void;
  setScheduledTasksDialogOpen: (open: boolean) => void;
  setSettingsDialogOpen: (open: boolean) => void;
  setModelSelectorOpen: (open: boolean) => void;
  setTimelineDialogOpen: (open: boolean) => void;
  setImagePreviewOpen: (open: boolean) => void;
  setMultiRunLauncherOpen: (open: boolean) => void;
  openMultiRunLauncher: () => void;
  openMultiRunLauncherWithPrompt: (prompt: string) => void;
}

export const useDialogStore = create<DialogStore>()(
  devtools(
    (set, get) => ({
      isQuickOpenOpen: false,
      isCommandPaletteOpen: false,
      isHelpDialogOpen: false,
      isAboutDialogOpen: false,
      isOpenCodeStatusDialogOpen: false,
      openCodeStatusText: '',
      isSessionCreateDialogOpen: false,
      isScheduledTasksDialogOpen: false,
      isSettingsDialogOpen: false,
      isModelSelectorOpen: false,
      isTimelineDialogOpen: false,
      isImagePreviewOpen: false,
      isMultiRunLauncherOpen: false,
      multiRunLauncherPrefillPrompt: '',

      setQuickOpenOpen: (open) => set({ isQuickOpenOpen: open }),
      toggleQuickOpen: () => set((s) => ({ isQuickOpenOpen: !s.isQuickOpenOpen })),
      toggleCommandPalette: () => set((s) => ({ isCommandPaletteOpen: !s.isCommandPaletteOpen })),
      setCommandPaletteOpen: (open) => set({ isCommandPaletteOpen: open }),
      toggleHelpDialog: () => set((s) => ({ isHelpDialogOpen: !s.isHelpDialogOpen })),
      setHelpDialogOpen: (open) => set({ isHelpDialogOpen: open }),
      setAboutDialogOpen: (open) => set({ isAboutDialogOpen: open }),
      setOpenCodeStatusDialogOpen: (open) => set({ isOpenCodeStatusDialogOpen: open }),
      setOpenCodeStatusText: (text) => set({ openCodeStatusText: text }),
      setSessionCreateDialogOpen: (open) => set({ isSessionCreateDialogOpen: open }),
      setScheduledTasksDialogOpen: (open) => set({ isScheduledTasksDialogOpen: open }),
      setSettingsDialogOpen: (open) => set((s) => {
        if (!open) return { isSettingsDialogOpen: false };
        // settingsHasOpenedOnce tracking stays in useUIStore
        return { isSettingsDialogOpen: true };
      }),
      setModelSelectorOpen: (open) => set({ isModelSelectorOpen: open }),
      setTimelineDialogOpen: (open) => set({ isTimelineDialogOpen: open }),
      setImagePreviewOpen: (open) => set({ isImagePreviewOpen: open }),
      setMultiRunLauncherOpen: (open) => set((s) => ({
        isMultiRunLauncherOpen: open,
        multiRunLauncherPrefillPrompt: open ? s.multiRunLauncherPrefillPrompt : '',
      })),
      openMultiRunLauncher: () => set({
        isMultiRunLauncherOpen: true,
        multiRunLauncherPrefillPrompt: '',
      }),
      openMultiRunLauncherWithPrompt: (prompt) => set({
        isMultiRunLauncherOpen: true,
        multiRunLauncherPrefillPrompt: prompt,
      }),
    }),
    { name: "dialog-store" },
  ),
);
```

- [ ] **Step 2: Remove dialog fields from useUIStore.ts interface**

In `UIStore` interface (lines 460-696), REMOVE:
- Line 463: `isMultiRunLauncherOpen: boolean;`
- Line 464: `multiRunLauncherPrefillPrompt: string;`
- Lines 486-496: `isQuickOpenOpen` through `sidebarSection` (the dialog booleans, NOT sidebarSection)
- Lines 532-533: `isTimelineDialogOpen: boolean;` and `isImagePreviewOpen: boolean;`

Also remove these method signatures:
- Line 607: `setQuickOpenOpen: (open: boolean) => void;`
- Line 608: `toggleQuickOpen: () => void;`
- Line 609: `toggleCommandPalette: () => void;`
- Line 610: `setCommandPaletteOpen: (open: boolean) => void;`
- Line 611: `toggleHelpDialog: () => void;`
- Line 612: `setHelpDialogOpen: (open: boolean) => void;`
- Line 613: `setAboutDialogOpen: (open: boolean) => void;`
- Line 614: `setOpenCodeStatusDialogOpen: (open: boolean) => void;`
- Line 615: `setOpenCodeStatusText: (text: string) => void;`
- Line 616: `setSessionCreateDialogOpen: (open: boolean) => void;`
- Line 617: `setScheduledTasksDialogOpen: (open: boolean) => void;`
- Line 618: `setSettingsDialogOpen: (open: boolean) => void;`
- Line 619: `setModelSelectorOpen: (open: boolean) => void;`
- Line 659: `setMultiRunLauncherOpen: (open: boolean) => void;`
- Line 660: `setTimelineDialogOpen: (open: boolean) => void;`
- Line 661: `setImagePreviewOpen: (open: boolean) => void;`
- Lines 691-692: `openMultiRunLauncher: () => void;` and `openMultiRunLauncherWithPrompt: (prompt: string) => void;`

- [ ] **Step 3: Remove dialog initial state from useUIStore create() call**

Remove lines 705-706 (isMultiRunLauncherOpen, multiRunLauncherPrefillPrompt),
lines 728-737 (isQuickOpenOpen through isModelSelectorOpen),
lines 770-771 (isTimelineDialogOpen, isImagePreviewOpen).

- [ ] **Step 4: Remove dialog actions from useUIStore create() call**

Remove:
- `setQuickOpenOpen` (lines 1242-1244)
- `toggleQuickOpen` (lines 1246-1248)
- `toggleCommandPalette` (lines 1250-1252)
- `setCommandPaletteOpen` (lines 1254-1256)
- `toggleHelpDialog` (lines 1258-1260)
- `setHelpDialogOpen` (lines 1262-1264)
- `setAboutDialogOpen` (lines 1266-1268)
- `setOpenCodeStatusDialogOpen` (lines 1270-1272)
- `setOpenCodeStatusText` (lines 1274-1276)
- `setSessionCreateDialogOpen` (lines 1278-1280)
- `setScheduledTasksDialogOpen` (lines 1282-1284)
- `setSettingsDialogOpen` (lines 1286-1296)
- `setModelSelectorOpen` (lines 1298-1300)
- `setMultiRunLauncherOpen` (lines 1651-1656)
- `openMultiRunLauncher` (lines 1658-1663)
- `openMultiRunLauncherWithPrompt` (lines 1666-1672)
- `setTimelineDialogOpen` (lines 1674-1676)
- `setImagePreviewOpen` (lines 1678-1680)

- [ ] **Step 5: Remove dialog fields from useUIStore persist partialize**

In `partialize` (lines 1871-1939), remove:
- `isSessionCreateDialogOpen: state.isSessionCreateDialogOpen` (line 1889)
- Note: settingsHasOpenedOnce tracking stays in UIStore — it's not a dialog state per se, it's a lifecycle marker

- [ ] **Step 6: Remove isSessionCreateDialogOpen from persist migration**

The migration code (line 1889) references it — the reference is removed in step 5.

- [ ] **Step 7: Add facade re-export in useUIStore.ts**

After the useUIStore export, add:
```typescript
// Facade re-export for backward compatibility during migration
// TODO: Remove once all consumers are migrated to useDialogStore
export { useDialogStore } from "./useDialogStore";
```

- [ ] **Step 8: Verify with type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 9: Create the settingsHasOpenedOnce handling in useUIStore**

The `setSettingsDialogOpen` action in useUIStore had a `settingsHasOpenedOnce` tracking side effect. This needs to stay in useUIStore. The `setSettingsDialogOpen` in useDialogStore just sets the boolean. The App-level code that opens settings should also set `settingsHasOpenedOnce`.

In useUIStore, keep `settingsHasOpenedOnce: boolean` as state and expose a `markSettingsOpenedOnce: () => void` action.

Add to useUIStore interface:
```typescript
markSettingsOpenedOnce: () => void;
```

Add to useUIStore implementation:
```typescript
markSettingsOpenedOnce: () => set({ settingsHasOpenedOnce: true }),
```

---

### Task 3: Split useConfigStore into useProviderConfigStore + useAgentConfigStore

**Files:**
- Create: `packages/ui/src/stores/useProviderConfigStore.ts`
- Create: `packages/ui/src/stores/useAgentConfigStore.ts`
- Modify: `packages/ui/src/stores/useConfigStore.ts` (facade re-exports)

**Goal:** Split the 2,139-line config monolith into two stores at ~400 lines each.

**Which fields go where:**

**useProviderConfigStore (providers + connection + model metadata):**
- State: `providers`, `currentProviderId`, `currentModelId`, `currentVariant`, `isAutoModel`, `selectedProviderId`, `agentModelSelections`, `defaultProviders`, `modelsMetadata`, `isConnected`, `hasEverConnected`, `connectionPhase`, `lastDisconnectReason`, `isInitialized`, `activeDirectoryKey`, `directoryScoped`
- Actions: `activateDirectory`, `loadProviders`, `setProvider`, `setModel`, `setAutoModel`, `setCurrentVariant`, `cycleCurrentVariant`, `getCurrentModelVariants`, `setSelectedProvider`, `saveAgentModelSelection`, `getAgentModelSelection`, `probeConnection`, `checkConnection`, `getCurrentProvider`, `getCurrentModel`, `getEffectiveModel`, `getModelMetadata`, `getResolvedGitGenerationModel`

Note: `getResolvedGitGenerationModel` and `resolveGitGenerationModelSelection` are provider-related (they pick a model for git). Move them to useProviderConfigStore.

**useAgentConfigStore (agents + OpenChamber settings defaults):**
- State: `agents`, `currentAgentName`, `settingsDefaultModel`, `settingsDefaultVariant`, `settingsDefaultAgent`, `settingsAutoCreateWorktree`, `settingsGitmojiEnabled`, `settingsDefaultFileViewerPreview`, `settingsZenModel`, `settingsMessageStreamTransport`
- Actions: `loadAgents`, `setAgent`, `setSettingsDefaultModel`, `setSettingsDefaultVariant`, `setSettingsDefaultAgent`, `setSettingsAutoCreateWorktree`, `setSettingsGitmojiEnabled`, `setSettingsDefaultFileViewerPreview`, `setSettingsZenModel`, `setSettingsMessageStreamTransport`, `getCurrentAgent`, `getVisibleAgents`

**Where `initializeApp` splits:**
- `initializeApp` becomes `initializeProviders` in useProviderConfigStore (connection check + loadProviders)
- The `loadAgents` call from `initializeApp` is called separately by callers, or kept as an orchestration function at App bootstrap

**How `setAgent` resolves its model dependency:**
`setAgent` (150 lines) reads `providers` and `settingsDefaultModel`/`settingsDefaultVariant` from useProviderConfigStore. After the split, `setAgent` in useAgentConfigStore calls `useProviderConfigStore.getState()` for cross-store reads.

- [ ] **Step 1: Create useProviderConfigStore.ts**

This is the most complex extraction. Copy from useConfigStore.ts:
- All top-level type definitions: `ProviderWithModelList`, `ProviderModel`, `GitModelSelection`, `DirectoryScopedConfig` (provider-only fields), `ModelsDevModelEntry`, `ModelsDevProviderEntry`, `ModelMetadata` types
- Helper functions: `resolveGitGenerationModelSelection`, `normalizeProviderId`, `parseModelString`, `hasProviderModel`, `buildModelMetadataKey`, `deriveModelMetadata`, `transformModelsDevResponse`, `fetchModelsDevMetadata`, `ensureModelsMetadataFetch`, `probeOpenCodeHealth`, `sleep`, `toDirectoryKey`, `fromDirectoryKey`, `resolveInitialDirectoryKey`
- Store state: provider, connection, model metadata fields
- All actions except `loadAgents`, `setAgent`, `setSettings*`, `getCurrentAgent`, `getVisibleAgents`
- Persist middleware: partialize provider/connection fields
- The `subscribeToConfigChanges` for providers scope
- The `useDirectoryStore.subscribe` for `activateDirectory`

**State interface:**
```typescript
interface ProviderConfigStore {
  activeDirectoryKey: string;
  directoryScoped: Record<string, DirectoryScopedConfig>;

  providers: ProviderWithModelList[];
  currentProviderId: string;
  currentModelId: string;
  currentVariant: string | undefined;
  isAutoModel: boolean;
  selectedProviderId: string;
  agentModelSelections: { [agentName: string]: { providerId: string; modelId: string } };
  defaultProviders: { [key: string]: string };

  modelsMetadata: Map<string, ModelMetadata>;

  isConnected: boolean;
  hasEverConnected: boolean;
  connectionPhase: "connecting" | "connected" | "reconnecting";
  lastDisconnectReason: string | null;
  isInitialized: boolean;

  activateDirectory: (directory: string | null | undefined) => Promise<void>;
  loadProviders: (options?: { directory?: string | null }) => Promise<void>;
  setProvider: (providerId: string) => void;
  setModel: (modelId: string) => void;
  setAutoModel: (isAuto: boolean) => void;
  setCurrentVariant: (variant: string | undefined) => void;
  cycleCurrentVariant: () => void;
  getCurrentModelVariants: () => string[];
  setSelectedProvider: (providerId: string) => void;
  saveAgentModelSelection: (agentName: string, providerId: string, modelId: string) => void;
  getAgentModelSelection: (agentName: string) => { providerId: string; modelId: string } | null;
  probeConnection: (options?: { timeoutMs?: number }) => Promise<boolean>;
  checkConnection: () => Promise<boolean>;
  initializeApp: () => Promise<void>;
  getCurrentProvider: () => ProviderWithModelList | undefined;
  getCurrentModel: () => ProviderModel | undefined;
  getEffectiveModel: () => { providerId: string; modelId: string };
  getModelMetadata: (providerId: string, modelId: string) => ModelMetadata | undefined;
  getResolvedGitGenerationModel: () => { providerId: string; modelId: string } | null;
}
```

**Persist partialize for useProviderConfigStore:**
```typescript
partialize: (state) => ({
  activeDirectoryKey: state.activeDirectoryKey,
  directoryScoped: state.directoryScoped,
  currentProviderId: state.currentProviderId,
  currentModelId: state.currentModelId,
  currentVariant: state.currentVariant,
  isAutoModel: state.isAutoModel,
  selectedProviderId: state.selectedProviderId,
  agentModelSelections: state.agentModelSelections,
  defaultProviders: state.defaultProviders,
}),
```

- [ ] **Step 2: Create useAgentConfigStore.ts**

Extract from useConfigStore.ts:
- State: `agents`, `currentAgentName`, settings defaults (`settingsDefaultModel` through `settingsMessageStreamTransport`)
- Actions: `loadAgents`, `setAgent`, settings setters, `getCurrentAgent`, `getVisibleAgents`
- Helper: `fetchOpenChamberDefaults`, `isPrimaryMode`, `resolveGitGenerationModelSelection`

**State interface:**
```typescript
interface AgentConfigStore {
  agents: Agent[];
  currentAgentName: string | undefined;

  settingsDefaultModel: string | undefined;
  settingsDefaultVariant: string | undefined;
  settingsDefaultAgent: string | undefined;
  settingsAutoCreateWorktree: boolean;
  settingsGitmojiEnabled: boolean;
  settingsDefaultFileViewerPreview: boolean;
  settingsZenModel: string | undefined;
  settingsMessageStreamTransport: 'auto' | 'ws' | 'sse';

  loadAgents: (options?: { directory?: string | null }) => Promise<boolean>;
  setAgent: (agentName: string | undefined) => void;
  setSettingsDefaultModel: (model: string | undefined) => void;
  setSettingsDefaultVariant: (variant: string | undefined) => void;
  setSettingsDefaultAgent: (agent: string | undefined) => void;
  setSettingsAutoCreateWorktree: (enabled: boolean) => void;
  setSettingsGitmojiEnabled: (enabled: boolean) => void;
  setSettingsDefaultFileViewerPreview: (enabled: boolean) => void;
  setSettingsZenModel: (model: string | undefined) => void;
  setSettingsMessageStreamTransport: (transport: 'auto' | 'ws' | 'sse') => void;
  getCurrentAgent: () => Agent | undefined;
  getVisibleAgents: () => Agent[];
}
```

**Key change in setAgent:** Replace `const { agents, providers, settingsDefaultModel, settingsDefaultVariant } = get();` with:
```typescript
const { agents } = get();
const { settingsDefaultModel, settingsDefaultVariant } = get();
const providers = useProviderConfigStore.getState().providers;
```

**Persist partialize for useAgentConfigStore:**
```typescript
partialize: (state) => ({
  currentAgentName: state.currentAgentName,
  settingsDefaultModel: state.settingsDefaultModel,
  settingsDefaultVariant: state.settingsDefaultVariant,
  settingsDefaultAgent: state.settingsDefaultAgent,
  settingsAutoCreateWorktree: state.settingsAutoCreateWorktree,
  settingsGitmojiEnabled: state.settingsGitmojiEnabled,
  settingsDefaultFileViewerPreview: state.settingsDefaultFileViewerPreview,
  settingsZenModel: state.settingsZenModel,
  settingsMessageStreamTransport: state.settingsMessageStreamTransport,
}),
```

**Store name for persist:** `"agent-config-store"`

- [ ] **Step 3: Convert useConfigStore to a facade**

In useConfigStore.ts, replace the entire store creation with re-exports:
```typescript
export { useProviderConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "./useAgentConfigStore";

// Facade: old consumers import from useConfigStore but receive the new stores
import { useProviderConfigStore } from "./useProviderConfigStore";
import { useAgentConfigStore } from "./useAgentConfigStore";

// Re-export both stores under the old name using a proxy
// During migration, consumers can import from either path
export const useConfigStore = new Proxy({} as ReturnType<typeof useProviderConfigStore> & ReturnType<typeof useAgentConfigStore>, {
  get(_, prop) {
    const providerStore = useProviderConfigStore;
    const agentStore = useAgentConfigStore;
    // Check provider store first, then agent store
    if (prop in providerStore.getState()) return providerStore[prop as keyof typeof providerStore];
    if (prop in agentStore.getState()) return agentStore[prop as keyof typeof agentStore];
    // Handle methods that exist on the store object
    const providerVal = (providerStore as any)[prop];
    if (providerVal !== undefined) return providerVal;
    const agentVal = (agentStore as any)[prop];
    if (agentVal !== undefined) return agentVal;
    return undefined;
  },
}) as any;
```

**Alternative simpler facade (recommended):** Use a proxy that delegates to both stores:

```typescript
// packages/ui/src/stores/useConfigStore.ts
// Facade — delegates to useProviderConfigStore and useAgentConfigStore
// TODO: Remove once all consumers are migrated

export { useProviderConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "./useAgentConfigStore";

import { useProviderConfigStore } from "./useProviderConfigStore";
import { useAgentConfigStore } from "./useAgentConfigStore";
import { create } from "zustand";

// Facade hook that reads from both stores
export function useConfigStore(selector: (state: any) => any) {
  const providerState = useProviderConfigStore(selector);
  const agentState = useAgentConfigStore(selector);

  // If selector returns undefined from both, return undefined
  if (providerState === undefined && agentState === undefined) return undefined;
  // Prefer defined value
  return providerState !== undefined ? providerState : agentState;
}

// Attach selector for direct store access
(useConfigStore as any).getState = () => ({
  ...useProviderConfigStore.getState(),
  ...useAgentConfigStore.getState(),
});

// Use a Proxy for `.subscribe`, `.destroy`, etc.
```

Actually, the cleanest migration approach: just delete old file content, export both new stores, and use codemod to update imports.

**Simplest approach:** Replace useConfigStore.ts content with:
```typescript
export { useProviderConfigStore as useConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "./useAgentConfigStore";
```
This makes `useConfigStore` resolve to the provider store. Then batch-import the agent store separately for consumers that need agent fields. But this breaks `const config = useConfigStore()` calls that access agent fields.

**Recommended actual approach:**
```typescript
// Re-export both individual stores
export { useProviderConfigStore } from "./useProviderConfigStore";
export { useAgentConfigStore } from "./useAgentConfigStore";

// Facade: a combined hook that delegates to both stores
import { useProviderConfigStore } from "./useProviderConfigStore";
import { useAgentConfigStore } from "./useAgentConfigStore";
import type { StoreApi, UseBoundStore } from "zustand";

type CombinedState = ReturnType<typeof useProviderConfigStore.getState> & ReturnType<typeof useAgentConfigStore.getState>;

// Proxy the hook to read from both stores
const combinedHook = ((selector?: ((state: CombinedState) => any)) => {
  const providerState = useProviderConfigStore();
  const agentState = useAgentConfigStore();
  const combined = { ...providerState, ...agentState } as CombinedState;
  return selector ? selector(combined) : combined;
}) as unknown as UseBoundStore<StoreApi<CombinedState>>;

combinedHook.getState = () => ({
  ...useProviderConfigStore.getState(),
  ...useAgentConfigStore.getState(),
});

combinedHook.subscribe = (selector: any, callback?: any) => {
  // Simplified: just subscribe to both
  const unsub1 = useProviderConfigStore.subscribe(selector, callback);
  const unsub2 = useAgentConfigStore.subscribe(selector, callback as any);
  return () => { unsub1(); unsub2(); };
};

(combinedHook as any).setState = (partial: any) => {
  const providerKeys = Object.keys(useProviderConfigStore.getState());
  const agentKeys = Object.keys(useAgentConfigStore.getState());
  const providerPart: any = {};
  const agentPart: any = {};
  for (const [k, v] of Object.entries(partial)) {
    if (providerKeys.includes(k)) providerPart[k] = v;
    if (agentKeys.includes(k)) agentPart[k] = v;
  }
  if (Object.keys(providerPart).length) useProviderConfigStore.setState(providerPart);
  if (Object.keys(agentPart).length) useAgentConfigStore.setState(agentPart);
};

combinedHook.destroy = () => { useProviderConfigStore.destroy?.(); useAgentConfigStore.destroy?.(); };

export const useConfigStore = combinedHook;
```

This is the most complex facade. The implementing agent should test it carefully.

- [ ] **Step 4: Update subscribeToConfigChanges handlers**

The bottom of useConfigStore.ts has two subscriptions (lines 2105-2139):
1. `subscribeToConfigChanges` — calls `loadAgents` / `loadProviders` from the old store
2. `useDirectoryStore.subscribe` — calls `activateDirectory`

These need to update to use the new stores. Move the subscriptions to the new store files.

In useProviderConfigStore.ts, add:
```typescript
// Module-level subscription (same pattern as old useConfigStore.ts)
let unsubscribeProvidersConfigChanges: (() => void) | null = null;
if (!unsubscribeProvidersConfigChanges) {
  unsubscribeProvidersConfigChanges = subscribeToConfigChanges(async (event) => {
    if (scopeMatches(event, "providers")) {
      const { loadProviders } = useProviderConfigStore.getState();
      await loadProviders();
    }
  });
}

let unsubscribeProviderDirectoryChanges: (() => void) | null = null;
if (typeof window !== "undefined" && !unsubscribeProviderDirectoryChanges) {
  unsubscribeProviderDirectoryChanges = useDirectoryStore.subscribe((state, prevState) => {
    const nextKey = toDirectoryKey(state.currentDirectory);
    const prevKey = toDirectoryKey(prevState.currentDirectory);
    if (nextKey === prevKey) return;
    void useProviderConfigStore.getState().activateDirectory(state.currentDirectory);
  });
}
```

In useAgentConfigStore.ts, add:
```typescript
let unsubscribeAgentsConfigChanges: (() => void) | null = null;
if (!unsubscribeAgentsConfigChanges) {
  unsubscribeAgentsConfigChanges = subscribeToConfigChanges(async (event) => {
    if (scopeMatches(event, "agents")) {
      const { loadAgents } = useAgentConfigStore.getState();
      await loadAgents();
    }
  });
}
```

---

### Task 4: Extract sendMessage module from session-ui-store

**Files:**
- Create: `packages/ui/src/sync/send-message.ts`
- Modify: `packages/ui/src/sync/session-ui-store.ts`

- [ ] **Step 1: Create send-message.ts**

Extract `sendMessage` (lines 671-857) and `routeMessage` (lines 62-133) as standalone functions.

```typescript
// packages/ui/src/sync/send-message.ts
import type { AttachedFile } from "@/stores/types/sessionTypes";
import { useConfigStore } from "@/stores/useConfigStore";
import { useSelectionStore } from "@/sync/selection-store";
import { useViewportStore } from "@/sync/viewport-store";
import { useSessionFoldersStore } from "@/stores/useSessionFoldersStore";
import { useInputStore } from "@/sync/input-store";
import { useSessionUIStore } from "@/sync/session-ui-store";
import { useDirectoryStore } from "@/stores/useDirectoryStore";
import { opencodeClient } from "@/lib/opencode/client";
import { normalizePath } from "@/sync/session-ui-store"; // or extract to shared utils
import { markPendingUserSendAnimation } from "@/lib/userSendAnimation";
import { waitForWorktreeBootstrap } from "@/lib/worktrees/worktreeBootstrap";
import { waitForPendingDraftWorktreeRequest } from "@/lib/worktrees/pendingDraftWorktree";
import { resolveProjectForSessionDirectory } from "@/lib/projectResolution";
import { getSyncMessages, getSyncSessions } from "./sync-refs";

// --- routeMessage (same as lines 62-133) ---

export function routeMessage(params: {
  sessionId: string;
  content: string;
  providerID: string;
  modelID: string;
  agent?: string;
  variant?: string;
  inputMode?: "normal" | "shell";
  files?: Array<{ type: "file"; mime: string; url: string; filename: string }>;
  additionalParts?: Array<{
    text: string;
    synthetic?: boolean;
    files?: Array<{ type: "file"; mime: string; url: string; filename: string }>;
  }>;
}): Promise<void> {
  const sdk = opencodeClient.getSdkClient();

  if (params.inputMode === "shell") {
    const dir = opencodeClient.getDirectory() || undefined;
    return sdk.session
      .shell({
        sessionID: params.sessionId,
        directory: dir,
        agent: params.agent,
        model: { providerID: params.providerID, modelID: params.modelID },
        command: params.content,
      })
      .then(() => {});
  }

  if (params.content.startsWith("/")) {
    const [head, ...tail] = params.content.split(" ");
    const cmdName = head.slice(1);
    // ... rest of slash command handling (same as lines 87-111)
    const dir = opencodeClient.getDirectory() || undefined;
    return sdk.session
      .command({
        sessionID: params.sessionId,
        directory: dir,
        command: cmdName,
        arguments: tail.join(" "),
        agent: params.agent,
        model: `${params.providerID}/${params.modelID}`,
        variant: params.variant,
        parts: params.files,
      })
      .then(() => {});
  }

  const { optimisticSend } = await import("./session-actions");
  return optimisticSend({
    sessionId: params.sessionId,
    content: params.content,
    providerID: params.providerID,
    modelID: params.modelID,
    agent: params.agent,
    files: params.files,
    send: (messageID) =>
      opencodeClient.sendMessage({
        id: params.sessionId,
        providerID: params.providerID,
        modelID: params.modelID,
        text: params.content,
        agent: params.agent,
        variant: params.variant,
        files: params.files,
        additionalParts: params.additionalParts,
        messageId: messageID,
      }).then(() => {}),
  });
}

// --- sendMessage (same as lines 671-857, reading from stores via getState) ---

export async function sendMessage(
  content: string,
  providerID: string,
  modelID: string,
  agent?: string,
  attachments?: AttachedFile[],
  agentMentionName?: string,
  additionalParts?: Array<{ text: string; attachments?: AttachedFile[]; synthetic?: boolean }>,
  variant?: string,
  inputMode?: "normal" | "shell",
): Promise<void> {
  const sessionUI = useSessionUIStore.getState();
  // ... rest of the sendMessage logic (lines 682-857) using .getState() across stores
  // Full code from lines 682-857 goes here, reading from stores via .getState()
  // instead of (get) and (set) closure variables.
}
```

- [ ] **Step 2: Thin down session-ui-store.ts sendMessage**

Replace `sendMessage` (lines 671-857) with:
```typescript
sendMessage: async (content, providerID, modelID, agent, attachments, agentMentionName, additionalParts, variant, inputMode) => {
  const { sendMessage: send } = await import("@/sync/send-message");
  await send(content, providerID, modelID, agent, attachments, agentMentionName, additionalParts, variant, inputMode);
},
```

Replace `routeMessage` (lines 62-133) with:
```typescript
// routeMessage is now imported from send-message.ts
// Remove the inline definition
```

- [ ] **Step 3: Update imports in session-ui-store.ts**

Remove imports that are only used by sendMessage/routeMessage:
- `flatternAssistantTextParts` — only used in `createSessionFromAssistantMessage`
- Keep: `useConfigStore`, `useSelectionStore`, `useViewportStore`, `useDirectoryStore`, `useSessionFoldersStore`, `useInputStore` — these are still used by other actions

---

### Task 5: Extract session-ops module from session-ui-store

**Files:**
- Create: `packages/ui/src/sync/session-ops.ts`
- Modify: `packages/ui/src/sync/session-ui-store.ts`

**Note:** There's already a `packages/ui/src/sync/session-actions.ts`. The session-ops module here refers to the thin wrappers in session-ui-store that call session-actions. Some are already thin (like `deleteSession`). The extraction here is about moving the remaining session UI logic (like `createSession`, `createSessionFromAssistantMessage`) into focused modules.

- [ ] **Step 1: Create session-ops.ts**

Move the following from session-ui-store:
- `createSession` (lines 862-884) — but it references `draft`, `targetFolderId` from session-ui-store state
- `createSessionFromAssistantMessage` (lines 1031-1078) — uses `getSyncMessages`, `getSyncSessions`, references config store
- `handleSlashUndo` (lines 941-970)
- `handleSlashRedo` (lines 975-1005)
- `forkFromMessage` (lines 1010-1026)

These are independent enough to be standalone functions that receive session ID as parameter.

```typescript
// packages/ui/src/sync/session-ops.ts
// Standalone session operations that read from stores via getState

export async function createSession(
  title?: string,
  directoryOverride?: string | null,
  parentID?: string | null,
): Promise<Session | null> {
  const sessionUI = useSessionUIStore.getState();
  const draft = sessionUI.newSessionDraft;
  const targetFolderId = draft.targetFolderId;

  sessionUI.closeNewSessionDraft();

  try {
    const dir = directoryOverride ?? opencodeClient.getDirectory();
    const { createSession: createSessionAction } = await import("./session-actions");
    const session = await createSessionAction(title, dir, parentID ?? null);
    if (!session) return null;

    if (targetFolderId) {
      const scopeKey = directoryOverride || sessionUI.lastLoadedDirectory || session.directory;
      if (scopeKey) {
        useSessionFoldersStore.getState().addSessionToFolder(scopeKey, targetFolderId, session.id);
      }
    }

    return session;
  } catch (e) {
    console.error("[session-ops] createSession failed", e);
    return null;
  }
}

export async function createSessionFromAssistantMessage(
  sourceMessageId: string,
): Promise<void> {
  // ... same as lines 1031-1078 but using store.getState() patterns
}

export async function handleSlashUndo(sessionId: string): Promise<void> {
  // ... same as lines 941-970
}

export async function handleSlashRedo(sessionId: string): Promise<void> {
  // ... same as lines 975-1005
}

export async function forkFromMessage(sessionId: string, messageId: string): Promise<void> {
  // ... same as lines 1010-1026
}
```

- [ ] **Step 2: Wire up in session-ui-store.ts**

Replace the corresponding methods:
```typescript
createSession: async (title, directoryOverride, parentID) => {
  const { createSession } = await import("@/sync/session-ops");
  return createSession(title, directoryOverride, parentID);
},

createSessionFromAssistantMessage: async (sourceMessageId) => {
  const { createSessionFromAssistantMessage } = await import("@/sync/session-ops");
  return createSessionFromAssistantMessage(sourceMessageId);
},

handleSlashUndo: async (sessionId) => {
  const { handleSlashUndo } = await import("@/sync/session-ops");
  return handleSlashUndo(sessionId);
},

handleSlashRedo: async (sessionId) => {
  const { handleSlashRedo } = await import("@/sync/session-ops");
  return handleSlashRedo(sessionId);
},

forkFromMessage: async (sessionId, messageId) => {
  const { forkFromMessage } = await import("@/sync/session-ops");
  return forkFromMessage(sessionId, messageId);
},
```

- [ ] **Step 3: Verify with type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 6: Break circular dependency in useAgentsStore

**Files:**
- Modify: `packages/ui/src/stores/useAgentsStore.ts`

**Problem:** `useAgentsStore` cannot import `useDirectoryStore` at top level because `useDirectoryStore` would create a cycle (directory store → agents store via `refreshAfterOpenCodeRestart`). The workaround uses `window.__zustand_directory_store__`.

**Fix:** Parameterize the directory in `loadAgents` and `getConfigDirectory`. The callers already have the directory available.

- [ ] **Step 1: Add directory parameter to loadAgents**

Change `loadAgents` signature (line 177):
```typescript
loadAgents: (directory?: string | null) => Promise<boolean>;
```

Change implementation (line 210):
```typescript
loadAgents: async (directory?: string | null) => {
  const configDirectory = directory ?? getConfigDirectory();
  // ... rest of loadAgents uses configDirectory directly instead of getConfigDirectory()
```

- [ ] **Step 2: Remove getCurrentDirectory workaround**

Remove the `getCurrentDirectory` function (lines 22-39) and the `window.__zustand_directory_store__` access.

Replace at line 602 (`performConfigRefresh`):
```typescript
// Before:
const currentDirectory = getCurrentDirectory();
// After:
import { useDirectoryStore } from "@/stores/useDirectoryStore";
const currentDirectory = useDirectoryStore.getState().currentDirectory;
```

- [ ] **Step 3: Update all callers of useAgentsStore.loadAgents**

Files that call `useAgentsStore.getState().loadAgents()` (no arguments currently):

1. `packages/ui/src/stores/useAgentsStore.ts` (lines 358, 419, 465, 712) — internal calls from createAgent, updateAgent, deleteAgent, and the config change subscription
2. Find external callers with grep:
```bash
cd /home/breadcat/Projects/openchamber/packages/ui/src
rg "loadAgents\(\)" --include "*.ts" --include "*.tsx"
```

For each caller, determine the current directory and pass it:
```typescript
const directory = useDirectoryStore.getState().currentDirectory;
// or const directory = opencodeClient.getDirectory();
store.loadAgents(directory);
```

- [ ] **Step 4: Update refreshAfterOpenCodeRestart**

In `performConfigRefresh` (line 602), change:
```typescript
// Before:
const currentDirectory = getCurrentDirectory();
// After (safe because useAgentsStore no longer creates cycle):
import { useDirectoryStore } from "@/stores/useDirectoryStore";
const currentDirectory = useDirectoryStore.getState().currentDirectory;
```

- [ ] **Step 5: Verify with type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 7: Move DOM side-effects from useUIStore to React effects

**Files:**
- Create: `packages/ui/src/hooks/useThemeEffects.ts`
- Modify: `packages/ui/src/stores/useUIStore.ts`
- Modify: `packages/ui/src/App.tsx`

**Problem:** `applyTheme`, `applyTypography`, `applyPadding` manipulate `document.documentElement` directly in store actions. These are DOM side-effects that belong in React hooks.

- [ ] **Step 1: Create useThemeEffects.ts**

```typescript
// packages/ui/src/hooks/useThemeEffects.ts
import { useEffect, useRef } from "react";
import { useUIStore } from "@/stores/useUIStore";
import { SEMANTIC_TYPOGRAPHY, getTypographyVariable, type SemanticTypographyKey } from "@/lib/typography";

export function useThemeEffects() {
  const theme = useUIStore((s) => s.theme);
  const fontSize = useUIStore((s) => s.fontSize);
  const padding = useUIStore((s) => s.padding);

  // Track previous values to avoid unnecessary DOM operations
  const prevTheme = useRef(theme);
  const prevFontSize = useRef(fontSize);
  const prevPadding = useRef(padding);

  // Theme effect
  useEffect(() => {
    if (prevTheme.current === theme) return;
    prevTheme.current = theme;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // Typography effect
  useEffect(() => {
    if (prevFontSize.current === fontSize) return;
    prevFontSize.current = fontSize;
    const root = document.documentElement;
    const scale = fontSize / 100;
    const entries = Object.entries(SEMANTIC_TYPOGRAPHY) as Array<[SemanticTypographyKey, string]>;
    if (scale === 1) {
      for (const [key] of entries) {
        root.style.removeProperty(getTypographyVariable(key));
      }
      return;
    }
    for (const [key, baseValue] of entries) {
      const numericValue = parseFloat(baseValue);
      if (!Number.isFinite(numericValue)) continue;
      root.style.setProperty(getTypographyVariable(key), `${numericValue * scale}rem`);
    }
  }, [fontSize]);

  // Padding effect
  useEffect(() => {
    if (prevPadding.current === padding) return;
    prevPadding.current = padding;
    const root = document.documentElement;
    const scale = padding / 100;
    if (scale === 1) {
      root.style.removeProperty("--padding-scale");
      root.style.removeProperty("--line-height-tight");
      root.style.removeProperty("--line-height-normal");
      root.style.removeProperty("--line-height-relaxed");
      root.style.removeProperty("--line-height-loose");
      return;
    }
    const adjustedScale = Math.sqrt(scale);
    root.style.setProperty("--padding-scale", adjustedScale.toString());
    const lineHeightScale = 1 + (scale - 1) * 0.15;
    root.style.setProperty("--line-height-tight", (1.25 * lineHeightScale).toFixed(3));
    root.style.setProperty("--line-height-normal", (1.5 * lineHeightScale).toFixed(3));
    root.style.setProperty("--line-height-relaxed", (1.625 * lineHeightScale).toFixed(3));
    root.style.setProperty("--line-height-loose", (2 * lineHeightScale).toFixed(3));
  }, [padding]);
}
```

- [ ] **Step 2: Install the hook in App.tsx**

In `packages/ui/src/App.tsx`, add:
```typescript
import { useThemeEffects } from "@/hooks/useThemeEffects";

function App() {
  useThemeEffects();
  // ... rest of App component
}
```

- [ ] **Step 3: Remove DOM side-effects from useUIStore actions**

In useUIStore.ts:
- `setTheme` (lines 810-813): Remove the `get().applyTheme()` call. Keep `set({ theme })`.
- `setFontSize` (lines 1363-1368): Remove the `get().applyTypography()` call.
- `setPadding` (lines 1376-1381): Remove the `get().applyPadding()` call.

- [ ] **Step 4: Remove applyTheme, applyTypography, applyPadding, updateProportionalSidebarWidths from useUIStore**

Remove from interface (lines 620, 641-643):
```typescript
// Remove:
applyTheme: () => void;
applyTypography: () => void;
applyPadding: () => void;
updateProportionalSidebarWidths: () => void;
```

Remove from implementation:
- `applyTheme` (lines 1637-1649)
- `applyTypography` (lines 1387-1411)
- `applyPadding` (lines 1413-1442)
- `updateProportionalSidebarWidths` (lines 1621-1635)

- [ ] **Step 5: Verify with type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

## Consumer Migration Plan

### Batch A: Voice store consumers (5 files)

After Task 1, migrate these files to use `useVoiceSettingsStore` directly:

| File | Change |
|------|--------|
| `packages/ui/src/hooks/useBrowserVoice.ts` | Change `useConfigStore` to `useVoiceSettingsStore` for voice fields |
| `packages/ui/src/hooks/useMessageTTS.ts` | Same |
| `packages/ui/src/hooks/useServerTTS.ts` | Same |
| `packages/ui/src/components/sections/openchamber/VoiceSettings.tsx` | Same |
| `packages/ui/src/components/chat/message/MessageBody.tsx` | Same (line 728) |
| `packages/ui/src/components/voice/VoiceProvider.tsx` | Same |
| `packages/ui/src/components/voice/BrowserVoiceButton.tsx` | Same |
| `packages/ui/src/lib/voice/summarize.ts` | Same |
| `packages/ui/src/lib/voice/realtimeClientTools.ts` | Same |

### Batch B: Dialog store consumers (11 files)

After Task 2, migrate these files:

| File | Change |
|------|--------|
| `packages/ui/src/components/ui/QuickOpenDialog.tsx` | Change `useUIStore` to `useDialogStore` |
| `packages/ui/src/components/ui/HelpDialog.tsx` | Same |
| `packages/ui/src/components/ui/OpenCodeStatusDialog.tsx` | Same |
| `packages/ui/src/components/ui/CommandPalette.tsx` | Same |
| `packages/ui/src/components/views/SettingsView.tsx` | Same (for isSettingsDialogOpen) |
| `packages/ui/src/components/session/ScheduledTasksDialog.tsx` | Same (for isScheduledTasksDialogOpen) |
| `packages/ui/src/components/layout/MainLayout.tsx` | Same (for isSettingsDialogOpen at line 78) |
| `packages/ui/src/hooks/useRouter.ts` | Same (for isSettingsDialogOpen at lines 76, 185, 287) |
| `packages/ui/src/components/chat/ModelControls.tsx` | Same (for isModelSelectorOpen at line 364) |
| `packages/ui/src/App.tsx` | Same (for isAboutDialogOpen at line 66) |
| `packages/ui/src/components/sections/openchamber/OpenChamberVisualSettings.tsx` | Same (for isSettingsDialogOpen at line 279) |

### Batch C: Provider store consumers (~40 files)

After Task 3, files that only use provider/connection/model fields from useConfigStore should be updated to import from `useProviderConfigStore` instead. Files that use both provider and agent fields keep using `useConfigStore` (the facade).

**Provider-only consumers** (no agent/settings fields):
- `packages/ui/src/hooks/useModelLists.ts` — only uses `providers`
- `packages/ui/src/components/sections/providers/ProvidersSidebar.tsx` — only providers
- `packages/ui/src/components/sections/providers/ProvidersPage.tsx` — only providers
- `packages/ui/src/components/sections/openchamber/GitSettings.tsx` — `${useConfigStore.getState().settingsZenModel}` — agent store field
- `packages/ui/src/components/views/git/PullRequestSection.tsx` — providers
- `packages/ui/src/components/views/GitView.tsx` — providers
- `packages/ui/src/stores/useAgentsStore.ts` — uses both
- `packages/ui/src/sync/session-ui-store.ts` — uses both
- `packages/ui/src/sync/sync-context.tsx` — uses connection fields
- `packages/ui/src/sync/session-actions.ts` — uses agent fields

### Batch D: Agent store consumers (~30 files)

Files that only access `currentAgentName`, `agents`, `getCurrentAgent()`, or `settings*` fields:

- `packages/ui/src/components/sections/openchamber/DefaultsSettings.tsx` — settings fields
- `packages/ui/src/components/chat/UnifiedControlsDrawer.tsx` — currentAgentName
- `packages/ui/src/components/sections/commands/AgentSelector.tsx` — agents, currentAgentName
- Various chat/agent selector components

### Batch E: Dialog store removal

After all Batch B consumers are migrated:
- Remove dialog facade re-exports from useUIStore.ts
- Remove dialog type re-exports from UIStore interface

### Batch F: Voice store removal

After all Batch A consumers are migrated:
- Remove voice facade re-exports from useConfigStore.ts

### Batch G: Config store removal

After all consumers are migrated to useProviderConfigStore + useAgentConfigStore:
- Delete useConfigStore.ts facade
- Update any remaining imports

---

## Verification Steps

After each task:
```bash
bun run --cwd packages/ui type-check
```

After all tasks + consumer migration:
```bash
bun run type-check  # full repo
bun run lint        # check for leftover imports
```

**Expected:** No type errors, no regressions in stream functionality.

---

## Summary

| # | Task | New Files | Modified Files | Lines Removed |
|---|------|-----------|----------------|---------------|
| 1 | Voice Settings Store | 1 | 1 | ~200 |
| 2 | Dialog Store | 1 | 1 | ~100 |
| 3 | Config Store Split | 2 | 1 | ~1,000 |
| 4 | sendMessage Module | 1 | 1 | ~200 |
| 5 | session-ops Module | 1 | 1 | ~200 |
| 6 | Circular Dependency Fix | 0 | 1 | ~20 |
| 7 | Theme Effects Hook | 1 | 2 | ~80 |
| **Total** | **7 tasks** | **7 new** | **8 modified** | **~1,800** |

**Total task count: 7 main tasks, ~40 individual steps, ~51 consumer files to migrate.**
