# Gemini Theme + Theming Engine Extension

**Date:** 2026-05-05
**Status:** Draft

## Summary

Extend OpenChamber's theme system to support structural properties beyond colors
(border-radius, component-level typography) and ship a Gemini-inspired dark theme
that uses these new capabilities.

## Motivation

The current theme system only controls colors and font families. Component shapes
(border-radius on inputs, buttons) and per-component font sizing are hardcoded in
component code. This prevents themes from achieving distinct visual identities —
for example, Google Gemini's very rounded input box (`border-radius: 28px`) and
pill-shaped buttons.

## Design

### 1. Theme Shape Tokens

Add `config.shape` to the Theme type. Each key emits `--shape-*` CSS variables.
Components use CSS `var()` with fallbacks to their current hardcoded values, so
existing themes are unaffected.

**Type addition (theme.ts):**

```typescript
interface ThemeConfig {
  shape?: {
    inputRadius?: string;     // CSS var(--shape-input-radius)
    buttonRadius?: string;    // CSS var(--shape-button-radius)
  };
}
```

**CSS generator method (cssGenerator.ts):**

```typescript
private generateShapeVariables(shape: Theme['config']['shape']): string[] {
  const vars: string[] = [];
  if (shape?.inputRadius) vars.push(`  --shape-input-radius: ${shape.inputRadius};`);
  if (shape?.buttonRadius) vars.push(`  --shape-button-radius: ${shape.buttonRadius};`);
  return vars;
}
```

**Component changes:**

| Component | Current | New |
|---|---|---|
| `ChatInput.tsx` | JS const `chatInputRadius = 'var(--radius-xl)'` applied via inline `style={{ borderRadius }}` at 6 sites | Change to `chatInputRadius = 'var(--shape-input-radius, var(--radius-xl))'` |
| `button.tsx` | `rounded-[10px]` in base CVA class (size variants sm=9px, xs=7px, lg=12px keep their values) | `rounded-[var(--shape-button-radius,10px)]` — size variants unchanged, base token sets default |

**Note on buttons:** The existing CVA already has
`supports-[corner-shape:squircle]:rounded-[50px]` which makes buttons pill-shaped
on supported browsers. Setting `buttonRadius: 9999px` is redundant on those
browsers but harmless; it provides the same effect on unsupported browsers.

**Note on textarea:** The shared `textarea.tsx` component is NOT changed. The chat
input's textarea is styled via the parent `ChatInput.tsx` wrapper — that's the
only site that changes.

### 2. Sidebar Typography Override

Add `config.typography.sidebar` for per-theme sidebar font control. Only sidebar
is in scope — extending to other areas is future work.

**Type addition (theme.ts):**

```typescript
interface ThemeConfig {
  typography?: {
    sidebar?: {
      fontSize?: string;      // --sidebar-font-size
      fontWeight?: string;    // --sidebar-font-weight
    };
  };
}
```

**CSS generator:**

```typescript
if (typography?.sidebar?.fontSize)  vars.push(`  --sidebar-font-size: ${typography.sidebar.fontSize};`);
if (typography?.sidebar?.fontWeight) vars.push(`  --sidebar-font-weight: ${typography.sidebar.fontWeight};`);
```

**Component change:** `SessionSidebar.tsx` — apply `var(--sidebar-font-size, ...)` and `var(--sidebar-font-weight, ...)` on sidebar item text.

### 3. Dead Field Cleanup

| Field | Status | Reason |
|---|---|---|
| `colors.shadows` | Keep in type, mark `@deprecated` | Exists in many theme JSON files. Removing would require cleaning 20+ files. Type stays, CSS generator skips it. |
| `colors.animation` | Keep in type, mark `@deprecated` | Same situation. |
| `config.spacing` | Keep type (unused, not wired) | No clear mapping to `--padding-scale`. Remove if cleanup is desired, but out of scope for this change. |

### 4. Gemini Dark Theme

Update `gemini-dark.json` with the new config:

```json
{
  "config": {
    "shape": {
      "inputRadius": "1.75rem",
      "buttonRadius": "9999px"
    },
    "typography": {
      "sidebar": {
        "fontSize": "0.8125rem",
        "fontWeight": "400"
      }
    }
  }
}
```

Sidebar foreground color already set to `#9aa0a6` (lighter gray as requested) in
the existing theme. No color changes needed.

**Note:** Already registered in `presets.ts` from prior work.

## Files Changed

| File | Change |
|---|---|
| `packages/ui/src/types/theme.ts` | Add `config.shape` and `config.typography.sidebar`; deprecate `shadows`/`animation` |
| `packages/ui/src/lib/theme/cssGenerator.ts` | Add `generateShapeVariables()`, generate sidebar typography vars, skip deprecated fields |
| `packages/ui/src/components/chat/ChatInput.tsx` | Update `chatInputRadius` to read `--shape-input-radius` |
| `packages/ui/src/components/ui/button.tsx` | Update base radius to read `--shape-button-radius` |
| `packages/ui/src/components/session/SessionSidebar.tsx` | Apply sidebar typography tokens |
| `packages/ui/src/lib/theme/themes/gemini-dark.json` | Add shape + typography config |
| `~/.config/openchamber/themes/gemini-dark.json` | Sync copy |

## Non-Goals

- No chat bubble components
- No sidebar structure changes (Gems/Chats sections)
- No greeting text or suggestion chips
- No font file bundling (Google Sans must be installed locally)
- No changes to existing themes — they continue working identically
- No shared `textarea.tsx` changes — only the chat input wrapper radius changes

## Verification

1. `bun run --filter '@openchamber/ui' type-check` — passes
2. `bun run --filter '@openchamber/ui' lint` — passes
3. Load app, select Gemini theme — input box has 28px border-radius, buttons are
   pill-shaped, sidebar text is lighter gray and 13px
4. Switch to Flexoki Dark — everything returns to normal (no shape/typography
   tokens set in that theme)
5. Quick-scan other preset themes for type errors (none expected since all
   additions are optional)
