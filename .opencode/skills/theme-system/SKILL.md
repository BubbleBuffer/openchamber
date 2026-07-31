---
name: theme-system
description: Use when creating or modifying UI components, styling, or visual elements. All UI colors must use theme tokens — never hardcoded hex or Tailwind color classes.
license: MIT
compatibility: opencode
---

## Core principle

UI colors must use theme tokens. Never hardcoded hex colors or Tailwind color classes (e.g. `bg-blue-500`, `bg-white`).

Themes live in `packages/web/src/ui/lib/theme/themes/`. Users can add custom themes via `~/.config/openchamber/themes/`.

## Quick decision tree

1. **Code display?** → `syntax.*`
2. **Feedback/status?** → `status.*`
3. **Primary CTA?** → `primary.*`
4. **Interactive/clickable?** → `interactive.*`
5. **Background layer?** → `surface.*`
6. **Text?** → `surface.foreground` or `surface.mutedForeground`

## Critical rules

- `surface.elevated` = inputs, cards, panels
- `interactive.hover` = **only on clickable elements**
- `interactive.selection` = active/selected states (not primary!)
- Status colors = **only for actual feedback** (errors, warnings, success)
- Input footers = `bg-transparent` on elevated background

## Color tokens

### Surface

| Token | Usage |
|-------|-------|
| `surface.background` | Main app background |
| `surface.elevated` | Inputs, cards, panels, popovers |
| `surface.muted` | Secondary backgrounds, sidebars |
| `surface.foreground` | Primary text |
| `surface.mutedForeground` | Secondary text, hints |
| `surface.subtle` | Subtle dividers |

### Interactive

| Token | Usage |
|-------|-------|
| `interactive.border` | Default borders |
| `interactive.hover` | Hover on clickable elements only |
| `interactive.selection` | Active/selected items |
| `interactive.selectionForeground` | Text on selection |
| `interactive.focusRing` | Focus indicators |

### Status

| Token | Usage |
|-------|-------|
| `status.error` | Errors, validation failures |
| `status.warning` | Warnings, cautions |
| `status.success` | Success messages |
| `status.info` | Informational messages |

Each has variants: `*`, `*Foreground`, `*Background`, `*Border`.

### Primary

| Token | Usage |
|-------|-------|
| `primary.base` | Primary CTA buttons |
| `primary.hover` | Hover on primary elements |
| `primary.foreground` | Text on primary background |

**Primary vs Selection:** Primary = "click me" (CTA), Selection = "currently active" (state).

### Syntax (code display only)

| Token | Usage |
|-------|-------|
| `syntax.base.background` | Code block background |
| `syntax.base.foreground` | Default code text |
| `syntax.base.keyword` | Keywords |
| `syntax.base.string` | Strings |
| `syntax.highlights.diffAdded` | Added lines |
| `syntax.highlights.diffRemoved` | Removed lines |

## Usage

Via hook:
```ts
import { useThemeSystem } from '@/contexts/useThemeSystem';
const { currentTheme } = useThemeSystem();
```

Via CSS variables:
```tsx
<div className="bg-[var(--surface-elevated)] hover:bg-[var(--interactive-hover)]">
```

## Key files

- Theme types: `packages/web/src/ui/types/theme.ts`
- Theme hook: `packages/web/src/ui/contexts/useThemeSystem.ts`
- CSS generator: `packages/web/src/ui/lib/theme/cssGenerator.ts`
- Built-in themes: `packages/web/src/ui/lib/theme/themes/`
- Adding themes: [references/adding-themes.md](references/adding-themes.md)
