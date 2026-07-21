/**
 * Centralised error surface for non-component code (sync layer, stores,
 * background polling, fire-and-forget actions).
 *
 * The codebase is full of `.catch(() => undefined)` patterns that silently
 * swallow failures of user-initiated actions, producing the "buttons that do
 * nothing" UX the RCA called out (RC-2, RC-10, RC-12, RC-16). This helper:
 *
 * - logs every failure to the console with a stable prefix for grep'ing
 * - surfaces a single toast per (action, scope) within the dedupe window so a
 *   flapping endpoint doesn't spam the user
 * - is import-safe in test/SSR/non-DOM contexts (toast is loaded lazily and
 *   any failure to load it is itself swallowed quietly)
 *
 * Use this **only** for failures the user would care about. Genuinely
 * best-effort cleanup work (telemetry, prefetch, idle cache warm-up) should
 * stay silent.
 */

import { toast } from "@/components/ui"

export type ReportErrorOptions = {
    /**
     * Short label describing the action that failed (e.g. "Rename session",
     * "Save sidebar layout"). Shown to the user.
     */
    action: string
    /**
     * Optional scope key for deduping. Defaults to `action`. Pass a more
     * specific value (e.g. `"rename:${sessionId}"`) when the same action is
     * invoked many times concurrently and you want one toast per target.
     */
    scope?: string
    /**
     * Suppress the toast and only log. Use for cosmetic auto-save errors that
     * have already been retried.
     */
    silent?: boolean
}

const DEDUPE_WINDOW_MS = 5_000
const recent = new Map<string, number>()

function shouldToast(scope: string, now: number): boolean {
    const last = recent.get(scope)
    if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return false
    recent.set(scope, now)
    // Opportunistic cleanup so the map can't grow without bound.
    if (recent.size > 64) {
        for (const [key, value] of recent) {
            if (now - value > DEDUPE_WINDOW_MS) recent.delete(key)
        }
    }
    return true
}

function describeError(error: unknown): string {
    if (!error) return "Unknown error"
    if (error instanceof Error) return error.message || error.name
    if (typeof error === "string") return error
    try {
        return JSON.stringify(error)
    } catch {
        return String(error)
    }
}

export function reportError(error: unknown, options: ReportErrorOptions): void {
    const { action, scope = action, silent = false } = options
    const message = describeError(error)
    console.warn(`[reportError] ${action}: ${message}`, error)
    if (silent) return
    if (!shouldToast(scope, Date.now())) return
    try {
        toast.error(action, { description: message })
    } catch {
        // toast may be unavailable in non-browser contexts (tests, SSR) — swallow.
    }
}

/**
 * Convenience wrapper for the common `.catch(reportError({...}))` pattern
 * on fire-and-forget actions.
 *
 * Usage:
 *   void doThing().catch(asReporter({ action: "Save layout" }))
 */
export function asReporter(options: ReportErrorOptions) {
    return (error: unknown) => reportError(error, options)
}
