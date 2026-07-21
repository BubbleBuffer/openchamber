/**
 * Development/test-only deprecation warning utility.
 *
 * Warns once per callsite (identified by function reference) when running
 * in development or test environments. Never fires in production.
 *
 * Usage:
 *   deprecationWarning('useOldThing', 'useNewThing instead')
 */

const _warnedSites = new Set<string>()

// Detect dev/test environment.
// In Vite UI packages: import.meta.env.DEV is true in dev builds, false in prod/test.
// In Bun test runner: process.env.NODE_ENV is 'test'.
const _isDevOrTest =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (import.meta as any).env?.DEV === true ||
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (typeof process !== 'undefined' && (process as any).env?.NODE_ENV === 'test')

export function deprecationWarning(
  deprecatedApi: string,
  replacement: string,
): void {
  if (!_isDevOrTest) return

  const key = `${deprecatedApi}:${replacement}`
  if (_warnedSites.has(key)) return
  _warnedSites.add(key)

  console.warn(
    `[deprecated] ${deprecatedApi} is deprecated. Use ${replacement}. ` +
    `(This warning only appears in development/test builds)`,
  )
}

/** Resets warning state — for testing only */
export function __resetDeprecationWarningsForTest(): void {
  _warnedSites.clear()
}

/** Returns whether we're in dev/test mode — exposed for test assertions */
export function _isDevOrTestEnv(): boolean {
  return _isDevOrTest
}
