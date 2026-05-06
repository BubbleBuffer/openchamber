---
name: mobile-first-ui
description: Use when creating or modifying any UI component, layout, or interaction that may run on mobile/PWA. OpenChamber is mobile-first — every layout has a mobile variant. This skill covers viewport detection, mobile component conventions, drawer vs sidebar patterns, keyboard-safe layouts, touch targets, and the memoization pattern used to keep mobile controls cheap on the chat hot path.
license: MIT
compatibility: opencode
---

## Overview

OpenChamber's UI is mobile-first by design. Mobile is not a responsive afterthought — it has dedicated components, dedicated CSS (`packages/ui/src/styles/mobile.css`), and a different navigation model (bottom tabs + drawer, not sidebar).

**Core rule:** when you build or change a UI surface, decide explicitly what it does on mobile. If you don't, you've shipped half a feature.

## When to use

- Adding or modifying any layout, panel, dialog, or chrome
- Touching anything in `packages/ui/src/components/layout/`
- Touching anything that uses `isMobile`
- Adding controls to the chat input, header, or sidebar
- Reviewing keyboard / focus / scroll behaviour

## Viewport detection

`isMobile` lives in `useUIStore`. Read it the right way for the situation:

- **In components that depend on layout switching:** subscribe with a leaf selector.
  ```ts
  const isMobile = useUIStore((s) => s.isMobile);
  ```
- **In effect/handler bodies that don't need to re-render on change:** read imperatively.
  ```ts
  const { isMobile } = useUIStore.getState();
  if (isMobile) { /* ... */ }
  ```
  See `packages/ui/src/hooks/useKeyboardShortcuts.ts` for the canonical pattern.

Do **not** plumb `isMobile` through props if a leaf selector will do — it just creates extra re-render paths.

## The mobile shell

Mobile uses a different top-level shell:

- `packages/ui/src/components/layout/MobileShell.tsx` — full-height column with optional header, content area, and `MobileBottomTabs` pinned at the bottom.
- `packages/ui/src/components/layout/MobileBottomTabs.tsx` — primary mobile navigation. Tab changes go through `useUIStore.setActiveMainTab`. The "more" slot opens the settings dialog as the overflow menu.
- `packages/ui/src/components/layout/MobileDrawerPanel.tsx` — slide-over drawer for secondary panels.
- `packages/ui/src/components/layout/MobileOverlayPanel.tsx` — full-screen overlay for modal-like content.

Desktop sidebars do **not** appear on mobile. If you have a sidebar control, decide whether it goes into the bottom tabs, the drawer, or the "more" overflow.

## Safe-area + keyboard

The whole app must respect iOS/Android safe-area insets and the soft keyboard.

- Bottom-pinned chrome uses `pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]` (see `MobileShell`). Match that pattern; don't pin to `bottom: 0` raw.
- The chat input must remain visible when the keyboard opens. Coordinate with `viewport-store` (`packages/ui/src/sync/viewport-store.ts`) for keyboard-aware scroll anchoring; don't reinvent it.
- Use `100dvh` / `min-h-dvh` over `100vh` where height fights with keyboard.

## Touch targets and density

- Minimum 44×44 CSS px for any tappable control on mobile. Lean on the wrappers in `packages/ui/src/components/ui/`; don't shrink padding to match desktop density.
- Hover-only affordances do not exist on mobile. Anything important must be reachable via tap, not hover.
- Long-press, swipe, and drag must have keyboard/click equivalents on desktop — don't ship mobile-only interactions for shared surfaces.

## Mobile-dedicated components

When a control needs different behaviour or layout on mobile, create a paired component:

- `MobileAgentButton`, `MobileModelButton`, `MobileSessionStatusBar`, etc.
- Render the right one based on `isMobile`, not via CSS-only `display: none`. CSS-only hiding still pays the React render cost, which matters on the chat hot path.

## Memoization on the chat hot path

`ChatInput.tsx` keystrokes re-render the input on every character. Mobile chrome (model picker, agent picker, status bars) **must not** re-render on each keystroke.

Pattern:

```tsx
const MemoMobileAgentButton = React.memo(MobileAgentButton);
const MemoMobileModelButton = React.memo(MobileModelButton);
```

Then render the memoized variant with stable props (callbacks via `useCallback`, primitive values from leaf selectors). If a prop changes every keystroke, fix the prop — don't drop the memo.

This rule generalises: any mobile chrome component that renders inside or next to a high-frequency input must be a `React.memo` boundary with stable inputs.

## Don'ts

- **Don't add mobile-only state to broadly subscribed stores.** Mobile vs desktop is one boolean — fine — but per-mobile-feature state belongs in narrow stores.
- **Don't branch shared UI on shell type (Electron vs Tauri vs web).** Branch on `isMobile`, not on platform. The desktop shells expose a `__TAURI__` IPC shim so renderer code stays shell-agnostic.
- **Don't skip the desktop variant.** Every mobile component should have a defined desktop counterpart, even if it's "this control is only on desktop."
- **Don't use `window.innerWidth` checks scattered through components.** `useUIStore.isMobile` is the single source of truth and is already wired to the resize observer.

## Cross-references

- Theming + safe-area + colour tokens: read the `theme-system` skill first.
- Settings UI on mobile uses the drawer/bottom-tabs patterns above, not the desktop settings shell. See the `settings-ui-patterns` skill for the desktop conventions.
- Performance rules (memoization, leaf selectors, hot-path discipline) are in the `performance-rules` skill.
