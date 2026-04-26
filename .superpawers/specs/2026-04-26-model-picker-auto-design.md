# Model Picker Improvements

Date: 2026-04-26

## Overview

Three changes to the model picker in `ModelControls.tsx`:

1. Add an "Auto" option at the top of the model list
2. Default new sessions to "Auto" instead of a hardcoded model
3. Fix the mobile model panel not closing after model selection

## 1. "Auto" Model Option

### Behavior

- An "Auto" entry appears at the very top of **both** the desktop dropdown and the mobile panel, above Favorites/Recent/provider sections.
- When "Auto" is selected, the current selection is cleared. The system uses the **active agent's configured model** (`agent.model.providerID` / `agent.model.modelID`) for LLM calls.
- When switching agents while in "Auto" mode, the model automatically follows the new agent's configuration.
- "Auto" is always available and always appears first.

### Selection State

A new piece of state in `useConfigStore` tracks whether "Auto" is active:

```typescript
isAutoModel: boolean  // true when the user has selected "Auto"
```

When `isAutoModel` is `true`, `currentProviderId` and `currentModelId` are irrelevant for display purposes, but under the hood the resolved agent model is used.

### Display

- **Chat input row**: Shows `Auto` instead of a model name. Example: `Auto · my-agent`
- **Desktop dropdown**: "Auto" appears as the first item, styled distinctly (e.g., with an auto/robot icon).
- **Mobile panel**: Same treatment.
- **Favorites/Recent**: "Auto" does NOT appear in favorites or recent lists — it's a mode toggle, not a model.

### Persistence

`isAutoModel` is stored in `useConfigStore` (which uses zustand persist middleware), so it survives page reloads. It's a session-scoped display mode flag — the underlying `currentProviderId`/`currentModelId` are still set to the agent's resolved model for API calls.

When "Auto" is selected, the visible selection is "cleared" (display says "Auto"). The resolved model IDs remain populated from the agent's config for actual LLM calls. This way the API call pipeline works without changes.

## 2. Default to "Auto"

### Current Behavior

On fresh start or new session, `currentProviderId`/`currentModelId` default to a specific model (identified as "big pickle" by the user).

### Desired Behavior

- New sessions start with `isAutoModel: true`, no pre-selected model.
- The agent's configured model is used from the start.
- The user can still pick a specific model after creation.

### Implementation

- Set `isAutoModel: true` in the config store's initial state.
- In `loadProviders` initialization (lines ~1430-1444), skip the `opencode/big-pickle` fallback level. If no settings default and no agent model exist, fall straight to "first available provider/model."
- Remove the `FALLBACK_PROVIDER_ID` / `FALLBACK_MODEL_ID` constants if they are unused after the change.

## 3. Mobile Panel Auto-Close Fix

### Problem

The mobile model panel does not close after selecting a model. The user has to tap outside to dismiss it.

### Root Cause Analysis

In `handleProviderAndModelChange` (line ~1020), `closeMobilePanel()` is called at line ~1035, but only after `tryApplyModelSelection` returns `'applied'`. If `tryApplyModelSelection` returns anything else (e.g., `'provider-missing'`, `'model-missing'`), the handler returns early at line ~1029 without closing the panel.

Additionally, there may be missing `closeMobilePanel()` calls on other code paths that change the model (e.g., selecting a favorite or recent model).

### Fix

1. Move `closeMobilePanel()` to execute **before** the result check, so the panel always closes when a selection is attempted.
2. Audit all model selection code paths in the mobile panel for missing close calls.

## Out of Scope

- Sidebar UX improvements
- Project-related improvements
- Model favoriting behavior changes
- Desktop dropdown (already closes correctly)
