import { describe, test, expect } from 'bun:test'
import { deprecationWarning, __resetDeprecationWarningsForTest, _isDevOrTestEnv } from './deprecation'

describe('deprecation utility', () => {
  describe('dev/test detection', () => {
    test('exposes dev/test detection', () => {
      // _isDevOrTestEnv is a testable view of the internal detection
      const result = _isDevOrTestEnv()
      // Result reflects the actual runtime environment
      expect(typeof result).toBe('boolean')
    })
  })

  describe('deprecationWarning', () => {
    test('warns in development/test environment', () => {
      __resetDeprecationWarningsForTest()
      // Capture console.warn output
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '))
      }

      try {
        deprecationWarning('useOldThing', 'useNewThing instead')

        // Should have warned since we're in test environment
        if (_isDevOrTestEnv()) {
          expect(warnings.length).toBe(1)
          expect(warnings[0]).toContain('[deprecated]')
          expect(warnings[0]).toContain('useOldThing')
          expect(warnings[0]).toContain('useNewThing instead')
        } else {
          // In production, no warning
          expect(warnings.length).toBe(0)
        }
      } finally {
        console.warn = originalWarn
      }
    })

    test('warns only once per unique (deprecatedApi, replacement) pair', () => {
      __resetDeprecationWarningsForTest()
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '))
      }

      try {
        // Call same warning twice
        deprecationWarning('useOldThing', 'useNewThing')
        deprecationWarning('useOldThing', 'useNewThing')

        if (_isDevOrTestEnv()) {
          // Only one warning despite two calls
          expect(warnings.length).toBe(1)
        }
      } finally {
        console.warn = originalWarn
      }
    })

    test('different deprecated APIs get separate warnings', () => {
      __resetDeprecationWarningsForTest()
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '))
      }

      try {
        deprecationWarning('useOldThing1', 'useNewThing1')
        deprecationWarning('useOldThing2', 'useNewThing2')

        if (_isDevOrTestEnv()) {
          expect(warnings.length).toBe(2)
          expect(warnings[0]).toContain('useOldThing1')
          expect(warnings[1]).toContain('useOldThing2')
        }
      } finally {
        console.warn = originalWarn
      }
    })

    test('reset clears warning state', () => {
      const warnings: string[] = []
      const originalWarn = console.warn
      console.warn = (...args: unknown[]) => {
        warnings.push(args.join(' '))
      }

      try {
        deprecationWarning('useOldThing', 'useNewThing')
        if (_isDevOrTestEnv()) {
          expect(warnings.length).toBe(1)
        }

        __resetDeprecationWarningsForTest()

        deprecationWarning('useOldThing', 'useNewThing')
        if (_isDevOrTestEnv()) {
          // Second warning fires after reset
          expect(warnings.length).toBe(2)
        }
      } finally {
        console.warn = originalWarn
      }
    })
  })
})
