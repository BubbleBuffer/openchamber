import { useLayoutEffect } from 'react';
import { useLayoutStore } from '@/stores/useLayoutStore';
import { useUIStore } from '@/stores/useUIStore';
import { useVisualPreferencesStore } from '@/stores/useVisualPreferencesStore';
import { SEMANTIC_TYPOGRAPHY, getTypographyVariable, type SemanticTypographyKey } from '@/lib/theme/typography';

/**
 * Applies theme, typography, padding, and proportional terminal height
 * as CSS custom properties / classes on document.documentElement.
 *
 * These are DOM side-effects that were previously embedded in Zustand store
 * actions. Moving them here keeps the store pure (no DOM coupling, testable,
 * SSR-compatible) and ensures proper React lifecycle timing via useLayoutEffect.
 */
export function useThemeEffects() {
  // --- Theme ---
  const theme = useUIStore((s) => s.theme);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light', 'dark');

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
  }, [theme]);

  // --- Typography ---
  const fontSize = useVisualPreferencesStore((s) => s.fontSize);

  useLayoutEffect(() => {
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
      if (!Number.isFinite(numericValue)) {
        continue;
      }
      root.style.setProperty(getTypographyVariable(key), `${numericValue * scale}rem`);
    }
  }, [fontSize]);

  // --- Padding ---
  const padding = useVisualPreferencesStore((s) => s.padding);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const scale = padding / 100;

    if (scale === 1) {
      root.style.removeProperty('--padding-scale');
      root.style.removeProperty('--line-height-tight');
      root.style.removeProperty('--line-height-normal');
      root.style.removeProperty('--line-height-relaxed');
      root.style.removeProperty('--line-height-loose');
      return;
    }

    // Apply padding as a percentage scale with non-linear scaling
    // Use square root for more natural scaling at extremes
    const adjustedScale = Math.sqrt(scale);

    // Set the CSS custom property that all spacing tokens reference
    root.style.setProperty('--padding-scale', adjustedScale.toString());

    // Dampened line-height scaling at extremes
    const lineHeightScale = 1 + (scale - 1) * 0.15;

    root.style.setProperty('--line-height-tight', (1.25 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-normal', (1.5 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-relaxed', (1.625 * lineHeightScale).toFixed(3));
    root.style.setProperty('--line-height-loose', (2 * lineHeightScale).toFixed(3));
  }, [padding]);

  // --- Proportional bottom terminal height on resize ---
  // (Previously in updateProportionalSidebarWidths, which was misleadingly named)
  useLayoutEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let timeoutId: number | undefined;

    const handleResize = () => {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }

      timeoutId = window.setTimeout(() => {
        const state = useLayoutStore.getState();
        if (state.isBottomTerminalOpen && !state.hasManuallyResizedBottomTerminal) {
          useLayoutStore.setState({ bottomTerminalHeight: Math.floor(window.innerHeight * 0.32) });
        }
      }, 150);
    };

    // Apply on mount as well
    handleResize();

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);
}
