# Model Picker Auto Option — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add "Auto" model mode that uses the agent's configured model, default new sessions to Auto, and fix mobile panel close-on-select.

**Architecture:** A new `isAutoModel` boolean in `useConfigStore` (persisted via zustand persist) controls display. When true, the chat input shows "Auto" instead of a model name. The underlying `currentProviderId`/`currentModelId` are still set to the agent's resolved model for API calls — only the display layer changes. The `handleProviderAndModelChange` close logic is moved to fire before the result check so the mobile panel always closes.

**Key design decisions:**
- `isAutoModel` lives in `useConfigStore` (NOT `useSelectionStore`) because SelectionStore is in-memory only.
- "Clearing" current selection on Auto means the *displayed* model name becomes "Auto"; the underlying resolved IDs remain populated from the agent config so the API call pipeline works unchanged.
- Selecting any specific model sets `isAutoModel = false`.
- Auto item is NOT part of keyboard navigation (it's a static top item, distinct from model items).

**Tech Stack:** TypeScript, React 19, Zustand, Remix Icon (`@remixicon/react`), Tailwind 4

---

## File Changes

| File | Change |
|------|--------|
| `packages/ui/src/stores/useConfigStore.ts` | Add `isAutoModel`/`setAutoModel`; remove big-pickle fallback; add to `partialize`; default to `true` |
| `packages/ui/src/components/chat/ModelControls.tsx` | Auto UI (desktop+mobile), display logic, close fix, import RiSparklingLine |

---

### Task 1: Fix Mobile Panel Auto-Close

**Files:**
- Modify: `packages/ui/src/components/chat/ModelControls.tsx:1020-1052`

All mobile model selection paths (favorites at line 1458, recents at line 1504, provider model lists at line 1591) go through `handleProviderAndModelChange`. Only the variant selection handler (line 1666) has its own close path and already calls `closeMobilePanel()` directly.

- [ ] **Step 1: Move close calls before result check**

Replace lines 1020–1052 with:

```typescript
const handleProviderAndModelChange = (providerId: string, modelId: string) => {
    try {
        setAgentMenuOpen(false);
        if (isCompact) {
            closeMobilePanel();
        }

        const result = tryApplyModelSelection(providerId, modelId, currentAgentName || undefined);
        if (result !== 'applied') {
            if (result === 'provider-missing') {
                console.error('[ModelControls] Provider not available for selection:', providerId);
            } else if (result === 'model-missing') {
                console.error('[ModelControls] Model not available for selection:', { providerId, modelId });
            }
            return;
        }
        addRecentModel(providerId, modelId);

        if (isCompact) {
            if (onMobilePanelSelection) {
                requestAnimationFrame(() => {
                    onMobilePanelSelection();
                });
            }
        }
        if (!isCompact || !onMobilePanelSelection) {
            requestAnimationFrame(() => {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea[data-chat-input="true"]');
                textarea?.focus();
            });
        }
    } catch (error) {
        console.error('[ModelControls] Handle model change error:', error);
    }
};
```

- [ ] **Step 2: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS (no new errors)

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/ModelControls.tsx
git commit -m "fix: close mobile model panel unconditionally on selection"
```

---

### Task 2: Add `isAutoModel` to Config Store

**Files:**
- Modify: `packages/ui/src/stores/useConfigStore.ts`

- [ ] **Step 1: Add to ConfigStore interface**

Find the `ConfigStore` interface (area around line 530–580, the type that `create<ConfigStore>()` uses). Add:

```typescript
isAutoModel: boolean;
setAutoModel: (isAuto: boolean) => void;
```

- [ ] **Step 2: Add to initial state**

In the `create()` call, inside the object returned by `(set, get) => ({...})`, after the existing `currentModelId: ""` line (~603), add:

```typescript
isAutoModel: true,
```

- [ ] **Step 3: Add `setAutoModel` action**

After `setModel` (around line 1093), add:

```typescript
setAutoModel: (isAuto: boolean) => {
    set({ isAutoModel: isAuto });
},
```

- [ ] **Step 4: Add `isAutoModel` to `partialize`**

In the persist config `partialize` (lines 2057–2078), add after `currentVariant: state.currentVariant` (line 2062):

```typescript
isAutoModel: state.isAutoModel,
```

- [ ] **Step 5: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/stores/useConfigStore.ts
git commit -m "feat: add isAutoModel state to config store"
```

---

### Task 3: Remove "big-pickle" Fallback

**Files:**
- Modify: `packages/ui/src/stores/useConfigStore.ts`

**Spec:** "Remove any hardcoded fallback to 'big pickle' or any other specific model. If no settings default and no agent model exist, fall straight to first available provider/model."

- [ ] **Step 1: Remove step 3 of fallback chain (the opencode/big-pickle level)**

Replace lines 1430–1444:
```typescript
                            // 3. Fall back to opencode/big-pickle
                            if (!resolvedProviderId) {
                                if (validateModel(FALLBACK_PROVIDER_ID, FALLBACK_MODEL_ID)) {
                                    resolvedProviderId = FALLBACK_PROVIDER_ID;
                                    resolvedModelId = FALLBACK_MODEL_ID;
                                } else {
                                    // Last resort: first provider's first model
                                    const firstProvider = providers[0];
                                    const firstModel = firstProvider?.models[0];
                                    if (firstProvider && firstModel) {
                                        resolvedProviderId = firstProvider.id;
                                        resolvedModelId = firstModel.id;
                                    }
                                }
                            }
```

With:
```typescript
                            // 3. Last resort: first provider's first model
                            if (!resolvedProviderId) {
                                const firstProvider = providers[0];
                                const firstModel = firstProvider?.models[0];
                                if (firstProvider && firstModel) {
                                    resolvedProviderId = firstProvider.id;
                                    resolvedModelId = firstModel.id;
                                }
                            }
```

- [ ] **Step 2: Remove unused fallback constants**

Remove lines 20–21:
```typescript
const FALLBACK_PROVIDER_ID = "opencode";
const FALLBACK_MODEL_ID = "big-pickle";
```

- [ ] **Step 3: Verify no other references to the constants**

```bash
grep -n 'FALLBACK_PROVIDER_ID\|FALLBACK_MODEL_ID' packages/ui/src/stores/useConfigStore.ts
```
Expected: No matches (the constants were only used by the removed block)

- [ ] **Step 4: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/stores/useConfigStore.ts
git commit -m "fix: remove hardcoded big-pickle model fallback"
```

---

### Task 4: Add "Auto" UI to Desktop Dropdown

**Files:**
- Modify: `packages/ui/src/components/chat/ModelControls.tsx`

- [ ] **Step 1: Add `RiSparklingLine` import**

In the imports block (~line 3–25), add `RiSparklingLine` after `RiSearchLine` on line 19. Change:
```typescript
    RiSearchLine,
    RiStarFill,
```
to:
```typescript
    RiSearchLine,
    RiSparklingLine,
    RiStarFill,
```

- [ ] **Step 2: Read `isAutoModel` / `setAutoModel` from store**

Find the existing `useConfigStore` destructure block (around line 310–370). Add after any existing config destructures:

```typescript
const isAutoModel = useConfigStore((s) => s.isAutoModel);
const setAutoModel = useConfigStore((s) => s.setAutoModel);
```

- [ ] **Step 3: Add `handleAutoSelect` callback**

After `handleProviderAndModelChange` (around line 1052), add:

```typescript
const handleAutoSelect = () => {
    setAgentMenuOpen(false);
    if (isCompact) {
        closeMobilePanel();
        if (onMobilePanelSelection) {
            requestAnimationFrame(() => {
                onMobilePanelSelection();
            });
        }
    }
    setAutoModel(true);
};
```

- [ ] **Step 4: Insert "Auto" item in desktop dropdown**

In the `DropdownMenuContent` (line 2225), after the search input div (closes around line 2241) and the `<ScrollableOverlay>` opening (line 2243), and before the "Add new provider" button (line 2248), insert:

```tsx
{!desktopModelQuery && (
    <div
        role="button"
        tabIndex={0}
        onClick={handleAutoSelect}
        onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleAutoSelect();
            }
        }}
        className={cn(
            'typography-meta group flex items-center gap-1.5 rounded-md px-2 py-1.5 cursor-pointer',
            isAutoModel
                ? 'bg-primary/10 hover:bg-primary/10'
                : 'hover:bg-interactive-hover/50',
        )}
    >
        <span className="flex h-4 w-4 items-center justify-center text-muted-foreground">
            <RiSparklingLine className="h-4 w-4" />
        </span>
        <span className="flex-1 font-medium text-foreground">Auto</span>
        <span className="text-[10px] text-muted-foreground font-normal">use agent default</span>
        {isAutoModel && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
    </div>
)}
```

Place it after `</div>` (closing the search input container div near line 2241) and before `<div role="button" ... onClick={openAddProviderSettings}...>` (line 2248).

- [ ] **Step 5: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/chat/ModelControls.tsx
git commit -m "feat: add Auto option to desktop model dropdown"
```

---

### Task 5: Add "Auto" UI to Mobile Panel

**Files:**
- Modify: `packages/ui/src/components/chat/ModelControls.tsx`

- [ ] **Step 1: Insert "Auto" item in mobile panel**

In the mobile `renderMobileModelPanel` (starting at line 1407), after the search input and "no results" message block (around line 1439 where `filteredProviders.length === 0` check ends), and before the Favorites section (`!mobileModelQuery && favoriteModelsList.length > 0` at line 1443), insert:

```tsx
{!mobileModelQuery && (
    <button
        type="button"
        onClick={handleAutoSelect}
        className={cn(
            'flex items-center gap-2 w-full rounded-xl px-3 py-2.5 border transition-colors text-left',
            isAutoModel
                ? 'border-primary/40 bg-primary/5'
                : 'border-border/40 bg-[var(--surface-elevated)] hover:bg-interactive-hover/50',
        )}
    >
        <RiSparklingLine className="h-4 w-4 text-primary/70 flex-shrink-0" />
        <span className="flex-1 typography-body font-medium text-foreground">Auto</span>
        <span className="text-xs text-muted-foreground">use agent default</span>
        {isAutoModel && <RiCheckLine className="h-4 w-4 text-primary flex-shrink-0" />}
    </button>
)}
```

- [ ] **Step 2: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/chat/ModelControls.tsx
git commit -m "feat: add Auto option to mobile model panel"
```

---

### Task 6: Update Display Logic for Auto Mode

**Files:**
- Modify: `packages/ui/src/components/chat/ModelControls.tsx`

- [ ] **Step 1: `getCurrentModelDisplayName` returns "Auto" when mode is active**

Replace lines 1067–1074:

Current:
```typescript
const getCurrentModelDisplayName = () => {
    if (!currentProviderId || !currentModelId) return 'Not selected';
    if (models.length === 0) return 'Not selected';
    const currentModel = models.find((m: ProviderModel) => m.id === currentModelId);
    return getModelDisplayName(currentModel);
};
```

With:
```typescript
const getCurrentModelDisplayName = () => {
    if (isAutoModel) return 'Auto';
    if (!currentProviderId || !currentModelId) return 'Not selected';
    if (models.length === 0) return 'Not selected';
    const currentModel = models.find((m: ProviderModel) => m.id === currentModelId);
    return getModelDisplayName(currentModel);
};
```

- [ ] **Step 2: Show Auto icon in desktop trigger**

Replace lines 2197–2207:

Current:
```tsx
{currentProviderId ? (
    <>
        <ProviderLogo
            providerId={currentProviderId}
            className={cn(controlIconSize, 'flex-shrink-0')}
        />
        <RiPencilAiLine className={cn(controlIconSize, 'text-primary/60 hidden')} />
    </>
) : (
    <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
)}
```

With:
```tsx
{isAutoModel ? (
    <RiSparklingLine className={cn(controlIconSize, 'text-primary/70 flex-shrink-0')} />
) : currentProviderId ? (
    <>
        <ProviderLogo
            providerId={currentProviderId}
            className={cn(controlIconSize, 'flex-shrink-0')}
        />
        <RiPencilAiLine className={cn(controlIconSize, 'text-primary/60 hidden')} />
    </>
) : (
    <RiPencilAiLine className={cn(controlIconSize, 'text-muted-foreground')} />
)}
```

- [ ] **Step 3: Set Auto to false on manual model pick**

In `handleProviderAndModelChange`, after `addRecentModel(providerId, modelId)` (now at the updated position from Task 1), add:

```typescript
setAutoModel(false);
```

- [ ] **Step 4: Type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/chat/ModelControls.tsx
git commit -m "feat: show Auto in chat input, disable on manual model pick"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run type-check on all packages**

```bash
bun run type-check
```
Expected: PASS or pre-existing errors only

- [ ] **Step 2: Run lint**

```bash
bun run lint:ui
```
Expected: PASS or pre-existing issues only

- [ ] **Step 3: Run tests**

```bash
bun test
```
Workdir: `packages/ui`
Expected: Same 7 pre-existing failures (desktop boot injection), no new failures.

- [ ] **Step 4: Build check**

```bash
bun run build:ui
```
Expected: PASS (no build errors)

---

## Review

**Status: PASS** | Reviewer: SuperPawers subagent (revised) | Date: 2026-04-26

### Changes Since Initial Review

All findings from the initial review are resolved:
- **C1 (wrong store):** Updated spec + plan — `isAutoModel` is now correctly in `useConfigStore` (persisted), not `useSelectionStore` (in-memory). Spec persistence section rewritten.
- **M1 (missing big-pickle removal):** Added Task 3 to remove FALLBACK constants and the opencode/big-pickle fallback level.
- **M2 (vague partialize step):** Task 2 Step 4 now gives exact code to add to `partialize` at line 2062.
- **M3 (keyboard nav):** Removed keyboard nav complexity. Auto item is a static clickable element at the top, not part of the `flatModelList` wrapping. This is stated as a design decision.
- **M4 (clear selection):** Clarified in the spec and plan architecture that "cleared" means the display changes to "Auto". Underlying resolved model IDs remain populated for API calls.
- **m1 (audit not shown):** Task 1 now notes that all mobile paths (favorites, recents, provider lists) go through `handleProviderAndModelChange`.
- **m2 (import location):** Task 4 Step 1 specifies exact line 19 for `RiSparklingLine` insertion.
- **m3 (design decision undocumented):** Added as explicit design decision in plan header.
