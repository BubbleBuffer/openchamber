import type { ThemeRuntimeDeps, ThemeRuntime } from "./types.js";

export function createThemeRuntime(deps: ThemeRuntimeDeps): ThemeRuntime {
  const { fsPromises, path, themesDir, maxThemeJsonBytes, logger } = deps;

  const isNonEmptyString = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;
  const isValidThemeColor = (value: unknown): boolean => isNonEmptyString(value);

  const normalizeThemeJson = (raw: unknown): object | null => {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const r = (raw ?? {}) as Record<string, unknown>;
    const metadata = r.metadata && typeof r.metadata === "object" ? r.metadata as Record<string, unknown> : null;
    const colors = r.colors && typeof r.colors === "object" ? r.colors as Record<string, unknown> : null;
    if (!metadata || !colors) {
      return null;
    }

    const id = metadata.id;
    const name = metadata.name;
    const variant = metadata.variant;
    if (!isNonEmptyString(id) || !isNonEmptyString(name) || (variant !== "light" && variant !== "dark")) {
      return null;
    }

    const primary = colors.primary as Record<string, unknown>;
    const surface = colors.surface as Record<string, unknown>;
    const interactive = colors.interactive as Record<string, unknown>;
    const status = colors.status as Record<string, unknown>;
    const syntax = colors.syntax as Record<string, unknown>;
    const syntaxBase = syntax && typeof syntax === "object" ? syntax.base as Record<string, unknown> : null;
    const syntaxHighlights = syntax && typeof syntax === "object" ? syntax.highlights as Record<string, unknown> : null;

    if (!primary || !surface || !interactive || !status || !syntaxBase || !syntaxHighlights) {
      return null;
    }

    // Minimal fields required by CSSVariableGenerator and diff/syntax rendering.
    const required = [
      primary.base,
      primary.foreground,
      surface.background,
      surface.foreground,
      surface.muted,
      surface.mutedForeground,
      surface.elevated,
      surface.elevatedForeground,
      surface.subtle,
      interactive.border,
      interactive.selection,
      interactive.selectionForeground,
      interactive.focusRing,
      interactive.hover,
      status.error,
      status.errorForeground,
      status.errorBackground,
      status.errorBorder,
      status.warning,
      status.warningForeground,
      status.warningBackground,
      status.warningBorder,
      status.success,
      status.successForeground,
      status.successBackground,
      status.successBorder,
      status.info,
      status.infoForeground,
      status.infoBackground,
      status.infoBorder,
      syntaxBase.background,
      syntaxBase.foreground,
      syntaxBase.keyword,
      syntaxBase.string,
      syntaxBase.number,
      syntaxBase.function,
      syntaxBase.variable,
      syntaxBase.type,
      syntaxBase.comment,
      syntaxBase.operator,
      syntaxHighlights.diffAdded,
      syntaxHighlights.diffRemoved,
      syntaxHighlights.lineNumber,
    ];

    if (!required.every(isValidThemeColor)) {
      return null;
    }

    const tags = Array.isArray(metadata.tags)
      ? (metadata.tags as unknown[]).filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
      : [];

    return {
      ...(raw as object),
      metadata: {
        ...metadata,
        id: (id as string).trim(),
        name: (name as string).trim(),
        description: typeof metadata.description === "string" ? metadata.description : "",
        version:
          typeof metadata.version === "string" && metadata.version.trim().length > 0 ? metadata.version : "1.0.0",
        variant,
        tags,
      },
    };
  };

  const readCustomThemesFromDisk = async (): Promise<object[]> => {
    try {
      const entries = await fsPromises.readdir(themesDir, { withFileTypes: true });
      const themes: object[] = [];
      const seen = new Set<string>();

      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.toLowerCase().endsWith(".json")) continue;

        const filePath = path.join(themesDir, entry.name);
        try {
          const stat = await fsPromises.stat(filePath);
          if (!stat.isFile()) continue;
          if (stat.size > maxThemeJsonBytes) {
            logger.warn(`[themes] Skip ${entry.name}: too large (${stat.size} bytes)`);
            continue;
          }

          const rawText = await fsPromises.readFile(filePath, "utf8");
          const parsed = JSON.parse(rawText);
          const normalized = normalizeThemeJson(parsed);
          if (!normalized) {
            logger.warn(`[themes] Skip ${entry.name}: invalid theme JSON`);
            continue;
          }

          const id = (normalized as { metadata?: { id?: string } }).metadata?.id;
          if (seen.has(id!)) {
            logger.warn(`[themes] Skip ${entry.name}: duplicate theme id "${id!}"`);
            continue;
          }

          seen.add(id!);
          themes.push(normalized);
        } catch (error) {
          logger.warn(`[themes] Failed to read ${entry.name}:`, error);
        }
      }

      return themes;
    } catch (error) {
      // Missing dir is fine.
      if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
        return [];
      }
      logger.warn("[themes] Failed to list custom themes dir:", error);
      return [];
    }
  };

  return {
    normalizeThemeJson,
    readCustomThemesFromDisk,
  };
}