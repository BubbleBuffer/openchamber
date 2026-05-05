# Gemini Theme + Theming Engine Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the theme system with shape and typography tokens, then ship a Gemini-inspired dark theme.

**Architecture:** Add optional `config.shape` and `config.typography.sidebar` to the theme type, wire them through the CSS generator into CSS custom properties, update ChatInput/button/SessionSidebar to consume the new variables.

**Tech Stack:** TypeScript, React, Tailwind v4, Bun monorepo

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/ui/src/types/theme.ts` | Theme type definitions — add `config.shape`, `config.typography.sidebar`, deprecate `shadows`/`animation` |
| `packages/ui/src/lib/theme/cssGenerator.ts` | CSS variable generator — emit `--shape-*` and `--sidebar-*` vars |
| `packages/ui/src/lib/theme/cssGenerator.test.ts` | Unit test for new generator methods |
| `packages/ui/src/components/chat/ChatInput.tsx` | Chat input wrapper — read `--shape-input-radius` via CSS var fallback |
| `packages/ui/src/components/ui/button.tsx` | Button CVA base class — read `--shape-button-radius` via CSS var fallback |
| `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` | Sidebar session item text — read `--sidebar-font-size` and `--sidebar-font-weight` |
| `packages/ui/src/lib/theme/themes/gemini-dark.json` | Gemini theme data — add shape + typography config values |
| `packages/ui/src/lib/theme/themes/presets.ts` | Preset registry — import and register `gemini-dark.json` |

---

## Task 1: Extend Theme Type

**Files:**
- Modify: `packages/ui/src/types/theme.ts:241-242` (add `@deprecated` to shadows/animation)
- Modify: `packages/ui/src/types/theme.ts:245-263` (add shape + typography to config)

- [ ] **Step 1: Add `@deprecated` JSDoc to dead fields**

In `packages/ui/src/types/theme.ts`, add JSDoc comments above `shadows` and `animation`:

```typescript
    /** @deprecated No longer generated. Kept for backward compatibility with existing theme JSON files. */
    shadows?: Record<string, string>;
    /** @deprecated No longer generated. Kept for backward compatibility with existing theme JSON files. */
    animation?: Record<string, string>;
```

- [ ] **Step 2: Add `shape` and `typography.sidebar` to Theme config**

Replace the `config` block (lines 245–263) with:

```typescript
  config?: {
    fonts?: {
      sans?: string;
      mono?: string;
      heading?: string;
    };
    spacing?: {
      xs?: string;
      sm?: string;
      md?: string;
      lg?: string;
      xl?: string;
    };
    transitions?: {
      fast?: string;
      normal?: string;
      slow?: string;
    };
    shape?: {
      inputRadius?: string;
      buttonRadius?: string;
    };
    typography?: {
      sidebar?: {
        fontSize?: string;
        fontWeight?: string;
      };
    };
  };
```

- [ ] **Step 3: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/types/theme.ts
git commit -m "feat(theme): add shape and sidebar typography tokens to Theme type"
```

---

## Task 2: Extend CSS Generator

**Files:**
- Modify: `packages/ui/src/lib/theme/cssGenerator.ts:43-65` (call new shape method)
- Modify: `packages/ui/src/lib/theme/cssGenerator.ts:500-524` (add sidebar typography to config vars)
- Create: `packages/ui/src/lib/theme/cssGenerator.test.ts`

- [ ] **Step 1: Add `generateShapeVariables()` method**

Insert the following private method into `CSSVariableGenerator` in `packages/ui/src/lib/theme/cssGenerator.ts`, immediately after `generateConfigVariables()` (after line 524):

```typescript
  private generateShapeVariables(shape: Theme['config']['shape']): string[] {
    const vars: string[] = [];
    if (shape?.inputRadius) vars.push(`  --shape-input-radius: ${shape.inputRadius};`);
    if (shape?.buttonRadius) vars.push(`  --shape-button-radius: ${shape.buttonRadius};`);
    return vars;
  }
```

- [ ] **Step 2: Wire `generateShapeVariables()` into `generate()`**

In the `generate()` method, replace:

```typescript
    if (theme.config) {
      cssVars.push(...this.generateConfigVariables(theme.config));
    }
```

with:

```typescript
    if (theme.config) {
      cssVars.push(...this.generateConfigVariables(theme.config));
      cssVars.push(...this.generateShapeVariables(theme.config.shape));
    }
```

- [ ] **Step 3: Add sidebar typography to `generateConfigVariables()`**

Inside `generateConfigVariables()`, after the `transitions` block (before `return vars;`), add:

```typescript
    if (config.typography?.sidebar) {
      if (config.typography.sidebar.fontSize) {
        vars.push(`  --sidebar-font-size: ${config.typography.sidebar.fontSize};`);
      }
      if (config.typography.sidebar.fontWeight) {
        vars.push(`  --sidebar-font-weight: ${config.typography.sidebar.fontWeight};`);
      }
    }
```

- [ ] **Step 4: Write generator test**

Create `packages/ui/src/lib/theme/cssGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { CSSVariableGenerator } from './cssGenerator';
import type { Theme } from '@/types/theme';

const minimalTheme: Theme = {
  metadata: {
    id: 'test',
    name: 'Test',
    description: 'Test theme',
    version: '1.0.0',
    variant: 'dark',
    tags: ['test'],
  },
  colors: {
    primary: { base: '#000000' },
    surface: {
      background: '#000000',
      foreground: '#ffffff',
      muted: '#111111',
      mutedForeground: '#888888',
      elevated: '#222222',
      elevatedForeground: '#ffffff',
      overlay: '#00000080',
      subtle: '#333333',
    },
    interactive: {
      border: '#444444',
      borderHover: '#555555',
      borderFocus: '#666666',
      selection: '#777777',
      selectionForeground: '#ffffff',
      focus: '#888888',
      focusRing: '#88888840',
      cursor: '#ffffff',
      hover: '#333333',
      active: '#222222',
    },
    status: {
      error: '#ff0000',
      errorForeground: '#ffffff',
      errorBackground: '#ff000020',
      errorBorder: '#ff000050',
      warning: '#ffaa00',
      warningForeground: '#000000',
      warningBackground: '#ffaa0020',
      warningBorder: '#ffaa0050',
      success: '#00ff00',
      successForeground: '#000000',
      successBackground: '#00ff0020',
      successBorder: '#00ff0050',
      info: '#0088ff',
      infoForeground: '#ffffff',
      infoBackground: '#0088ff20',
      infoBorder: '#0088ff50',
    },
    syntax: {
      base: {
        background: '#000000',
        foreground: '#ffffff',
        comment: '#888888',
        keyword: '#ff0000',
        string: '#00ff00',
        number: '#0000ff',
        function: '#ffff00',
        variable: '#ffffff',
        type: '#ff00ff',
        operator: '#00ffff',
      },
    },
  },
};

describe('CSSVariableGenerator', () => {
  it('emits --shape-input-radius when config.shape.inputRadius is set', () => {
    const generator = new CSSVariableGenerator();
    const theme: Theme = {
      ...minimalTheme,
      config: { shape: { inputRadius: '1.75rem' } },
    };
    const css = generator.generate(theme);
    expect(css).toContain('--shape-input-radius: 1.75rem;');
  });

  it('emits --shape-button-radius when config.shape.buttonRadius is set', () => {
    const generator = new CSSVariableGenerator();
    const theme: Theme = {
      ...minimalTheme,
      config: { shape: { buttonRadius: '9999px' } },
    };
    const css = generator.generate(theme);
    expect(css).toContain('--shape-button-radius: 9999px;');
  });

  it('emits --sidebar-font-size when config.typography.sidebar.fontSize is set', () => {
    const generator = new CSSVariableGenerator();
    const theme: Theme = {
      ...minimalTheme,
      config: { typography: { sidebar: { fontSize: '0.8125rem' } } },
    };
    const css = generator.generate(theme);
    expect(css).toContain('--sidebar-font-size: 0.8125rem;');
  });

  it('emits --sidebar-font-weight when config.typography.sidebar.fontWeight is set', () => {
    const generator = new CSSVariableGenerator();
    const theme: Theme = {
      ...minimalTheme,
      config: { typography: { sidebar: { fontWeight: '400' } } },
    };
    const css = generator.generate(theme);
    expect(css).toContain('--sidebar-font-weight: 400;');
  });

  it('does not emit shape or sidebar vars when config is absent', () => {
    const generator = new CSSVariableGenerator();
    const css = generator.generate(minimalTheme);
    expect(css).not.toContain('--shape-input-radius');
    expect(css).not.toContain('--shape-button-radius');
    expect(css).not.toContain('--sidebar-font-size');
    expect(css).not.toContain('--sidebar-font-weight');
  });
});
```

- [ ] **Step 5: Run tests**

Run: `bun run --filter '@openchamber/ui' test packages/ui/src/lib/theme/cssGenerator.test.ts`
Expected: all 5 tests PASS

- [ ] **Step 6: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 7: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/lib/theme/cssGenerator.ts packages/ui/src/lib/theme/cssGenerator.test.ts
git commit -m "feat(theme): generate --shape-* and --sidebar-* CSS variables"
```

---

## Task 3: Update ChatInput Radius

**Files:**
- Modify: `packages/ui/src/components/chat/ChatInput.tsx:807`

- [ ] **Step 1: Update `chatInputRadius` constant**

Change line 807 from:

```typescript
    const chatInputRadius = 'var(--radius-xl)';
```

to:

```typescript
    const chatInputRadius = 'var(--shape-input-radius, var(--radius-xl))';
```

This constant is consumed at 5 sites (lines 3517, 3695, 3696, 3708, 3709) and all will automatically pick up the new fallback behavior.

- [ ] **Step 2: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/chat/ChatInput.tsx
git commit -m "feat(theme): consume --shape-input-radius in ChatInput"
```

---

## Task 4: Update Button Base Radius

**Files:**
- Modify: `packages/ui/src/components/ui/button.tsx:37`

- [ ] **Step 1: Update base CVA radius**

Change the base class string on line 37 from:

```typescript
    "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[50px] typography-ui-label font-medium lowercase tracking-[0.01em] shrink-0",
```

to:

```typescript
    "group relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--shape-button-radius,10px)] [corner-shape:squircle] supports-[corner-shape:squircle]:rounded-[50px] typography-ui-label font-medium lowercase tracking-[0.01em] shrink-0",
```

Size variant radii (`rounded-[9px]`, `rounded-[7px]`, `rounded-[12px]`) remain unchanged — they override via CVA specificity when those sizes are active.

- [ ] **Step 2: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/ui/button.tsx
git commit -m "feat(theme): consume --shape-button-radius in Button base class"
```

---

## Task 5: Update Sidebar Item Text

**Files:**
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx:673`
- Modify: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx:739`

- [ ] **Step 1: Add sidebar typography CSS variables to session title (mobile/tooltip path)**

At line 673, change:

```tsx
                      <div className={cn('block min-w-0 flex-1 truncate typography-ui-label font-normal', isActive ? 'text-primary' : 'text-foreground')}>{renderHighlightedText(sessionTitle, normalizedSessionSearchQuery)}</div>
```

to:

```tsx
                      <div className={cn('block min-w-0 flex-1 truncate typography-ui-label font-normal', isActive ? 'text-primary' : 'text-foreground')} style={{ fontSize: 'var(--sidebar-font-size)', fontWeight: 'var(--sidebar-font-weight)' }}>{renderHighlightedText(sessionTitle, normalizedSessionSearchQuery)}</div>
```

- [ ] **Step 2: Add sidebar typography CSS variables to session title (desktop path)**

At line 739, change:

```tsx
                    <div className={cn('block min-w-0 flex-1 truncate typography-ui-label font-normal', isActive ? 'text-primary' : 'text-foreground')}>{renderHighlightedText(sessionTitle, normalizedSessionSearchQuery)}</div>
```

to:

```tsx
                    <div className={cn('block min-w-0 flex-1 truncate typography-ui-label font-normal', isActive ? 'text-primary' : 'text-foreground')} style={{ fontSize: 'var(--sidebar-font-size)', fontWeight: 'var(--sidebar-font-weight)' }}>{renderHighlightedText(sessionTitle, normalizedSessionSearchQuery)}</div>
```

When the variables are unset, the declaration is invalid at computed-value time and the existing `typography-ui-label` / `font-normal` classes continue to apply.

- [ ] **Step 3: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/components/session/sidebar/SessionNodeItem.tsx
git commit -m "feat(theme): consume --sidebar-font-size and --sidebar-font-weight in sidebar items"
```

---

## Task 6: Update Gemini Theme JSON

**Files:**
- Modify: `packages/ui/src/lib/theme/themes/gemini-dark.json`

- [ ] **Step 1: Add shape and typography config to gemini-dark.json**

Replace the existing `config` block (lines 179–185):

```json
  "config": {
    "transitions": {
      "fast": "150ms ease",
      "normal": "250ms ease",
      "slow": "350ms ease"
    }
  }
```

with:

```json
  "config": {
    "transitions": {
      "fast": "150ms ease",
      "normal": "250ms ease",
      "slow": "350ms ease"
    },
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
```

- [ ] **Step 2: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 3: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/lib/theme/themes/gemini-dark.json
git commit -m "feat(theme): add shape and sidebar typography to Gemini dark theme"
```

---

## Task 7: Register Gemini Theme in Presets

**Files:**
- Modify: `packages/ui/src/lib/theme/themes/presets.ts`

- [ ] **Step 1: Import gemini-dark.json**

Add the import after line 20 (after `carbonfox_light_Raw`):

```typescript
import gemini_dark_Raw from './gemini-dark.json';
```

- [ ] **Step 2: Add to presetThemes array**

Insert into the `presetThemes` array after `carbonfox_light_Raw as Theme,` (line 71):

```typescript
  gemini_dark_Raw as Theme,
```

- [ ] **Step 3: Run type-check**

Run: `bun run --filter '@openchamber/ui' type-check`
Expected: PASS

- [ ] **Step 4: Run lint**

Run: `bun run --filter '@openchamber/ui' lint`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/theme/themes/presets.ts
git commit -m "feat(theme): register Gemini dark theme in preset themes"
```

---

## Verification Checklist

After all tasks are complete, run the full verification suite:

```bash
bun run --filter '@openchamber/ui' type-check
bun run --filter '@openchamber/ui' lint
```

Both must pass with zero errors.

Manual verification steps (performed by a human):
1. Load app, select **Gemini** theme — input box has 28px border-radius, buttons are pill-shaped, sidebar text is lighter gray and 13px
2. Switch to **Flexoki Dark** — everything returns to normal (no shape/typography tokens set in that theme)
3. Quick-scan other preset themes for type errors (none expected since all additions are optional)
