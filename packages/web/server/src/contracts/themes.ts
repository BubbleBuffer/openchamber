import { parseJsonObject, type ParseResult } from "./common.js";

/** Runtime-neutral transport contract for custom theme discovery. */
export const THEMES_ERROR_CODES = ["themes_invalid_response", "themes_internal_error"] as const;
export type ThemesErrorCode = (typeof THEMES_ERROR_CODES)[number];
export type CustomTheme = Record<string, unknown>;
export type ThemesListResponse = { themes: CustomTheme[] };
export type ThemesErrorResponse = { error: string; code: ThemesErrorCode };

const invalid = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });
const object = (value: unknown) => { const parsed = parseJsonObject(value); return parsed.ok ? parsed.value : null; };
const nonEmpty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const at = (value: unknown, path: string[]) => path.reduce<unknown>((current, key) => object(current)?.[key], value);
const REQUIRED_PATHS = [
  ["metadata", "id"], ["metadata", "name"], ["colors", "primary", "base"], ["colors", "primary", "foreground"],
  ["colors", "surface", "background"], ["colors", "surface", "foreground"], ["colors", "surface", "muted"], ["colors", "surface", "mutedForeground"], ["colors", "surface", "elevated"], ["colors", "surface", "elevatedForeground"], ["colors", "surface", "subtle"],
  ["colors", "interactive", "border"], ["colors", "interactive", "selection"], ["colors", "interactive", "selectionForeground"], ["colors", "interactive", "focusRing"], ["colors", "interactive", "hover"],
  ...["error", "warning", "success", "info"].flatMap((name) => ["", "Foreground", "Background", "Border"].map((suffix) => ["colors", "status", `${name}${suffix}`])),
  ...["background", "foreground", "keyword", "string", "number", "function", "variable", "type", "comment", "operator"].map((name) => ["colors", "syntax", "base", name]),
  ...["diffAdded", "diffRemoved", "lineNumber"].map((name) => ["colors", "syntax", "highlights", name]),
] as const;

export function parseCustomTheme(value: unknown): ParseResult<CustomTheme> {
  const input = object(value);
  const metadata = object(input?.metadata);
  return input && metadata && (metadata.variant === "light" || metadata.variant === "dark") && REQUIRED_PATHS.every((path) => nonEmpty(at(input, [...path])))
    ? { ok: true, value: input }
    : invalid("invalid custom theme");
}

export function parseThemesListResponse(value: unknown): ParseResult<ThemesListResponse> {
  const input = object(value);
  const themes = input?.themes;
  return input && Array.isArray(themes) && themes.every((theme) => parseCustomTheme(theme).ok)
    ? { ok: true, value: { themes: themes as CustomTheme[] } }
    : invalid("invalid themes list response");
}

export function parseThemesErrorResponse(value: unknown): ParseResult<ThemesErrorResponse> {
  const input = object(value);
  return input && nonEmpty(input.error) && typeof input.code === "string" && (THEMES_ERROR_CODES as readonly string[]).includes(input.code)
    ? { ok: true, value: input as ThemesErrorResponse }
    : invalid("invalid themes error response");
}

export const themesError = (code: ThemesErrorCode, error = "Theme request failed"): ThemesErrorResponse => ({ error, code });
