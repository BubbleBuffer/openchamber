---
name: mobile-first-ui
description: Use when creating or modifying any UI component, layout, or interaction that may run on mobile/PWA. OpenChamber is mobile-first — every layout has a mobile variant.
license: MIT
compatibility: opencode
---

## Core rule

When you build or change a UI surface, decide explicitly what it does on mobile. If you don't, you've shipped half a feature.

## Viewport detection

`isMobile` lives in `useRuntimeStore`. Read it the right way:

- **Components that depend on layout switching:** subscribe with a leaf selector.
  ```ts
  const isMobile = useRuntimeStore((s) => s.isMobile);
  ```
- **Effect/handler bodies (no re-render needed):** read imperatively.
  ```ts
  const { isMobile } = useRuntimeStore.getState();
  ```
  See `packages/ui/src/hooks/useKeyboardShortcuts.ts` for the canonical pattern.

Do **not** plumb `isMobile` through props — it creates extra re-render paths. Do **not** use `window.innerWidth` checks; `useRuntimeStore.isMobile` is the single source of truth.

## The mobile shell

Mobile uses a different top-level shell from desktop:

- `packages/ui/src/components/layout/MobileShell.tsx` — full-height column with header, content, and `MobileBottomTabs` pinned at bottom.
- `packages/ui/src/components/layout/MobileBottomTabs.tsx` — primary navigation. The "more" slot opens settings as overflow.
- `packages/ui/src/components/layout/MobileDrawerPanel.tsx` — slide-over drawer for secondary panels.
- `packages/ui/src/components/layout/MobileOverlayPanel.tsx` — full-screen overlay for modal content.

Desktop sidebars do **not** appear on mobile. Sidebar controls go into bottom tabs, the drawer, or the "more" overflow.

## Safe-area + keyboard

- Bottom-pinned chrome uses `pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]` (see `MobileShell`). Don't pin to `bottom: 0` raw.
- Chat input must remain visible when the keyboard opens. Coordinate with `viewport-store` (`packages/ui/src/sync/viewport-store.ts`).
- Use `100dvh` / `min-h-dvh` over `100vh` where height fights with keyboard.

## Touch targets

- Minimum 44×44 CSS px for any tappable control on mobile.
- Hover-only affordances do not exist on mobile. Reachable via tap, not hover.
- Long-press, swipe, and drag must have keyboard/click equivalents on desktop.

## Mobile-dedicated components

When a control needs different behaviour on mobile, create a paired component (`MobileAgentButton`, `MobileModelButton`, etc.) and render based on `isMobile`. Do **not** use CSS-only `display: none` — it still pays the React render cost.

## Memoization on the chat hot path

`ChatInput.tsx` keystrokes re-render the input on every character. Mobile chrome (model picker, agent picker, status bars) **must not** re-render on each keystroke.

Wrap mobile chrome in `React.memo` with stable props (callbacks via `useCallback`, values from leaf selectors). If a prop changes every keystroke, fix the prop — don't drop the memo.

## Don'ts

- **Don't add mobile-only state to broadly subscribed stores.** Per-mobile-feature state belongs in narrow stores.
- **Don't branch on platform** (Electron vs Tauri vs web). Branch on `isMobile`. The desktop shells expose a `__TAURI__` IPC shim.
- **Don't skip the desktop variant.** Every mobile component needs a defined desktop counterpart.
