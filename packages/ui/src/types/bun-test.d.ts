// Minimal type declarations for bun:test to satisfy tsc.
// Only the subset used by our test files is declared.

declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;

  type MatcherContext = {
    toEqual(expected: unknown): void;
    toBe(expected: unknown): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toThrow(expected?: string | RegExp): void;
    toContain(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toHaveLength(expected: number): void;
    toHaveBeenCalledWith(...args: unknown[]): void;
    not: {
      toEqual(expected: unknown): void;
      toBe(expected: unknown): void;
      toContain(expected: unknown): void;
      toHaveBeenCalledWith(...args: unknown[]): void;
    };
  };

  export function expect(value: unknown): MatcherContext;

  export function expect(received: unknown): MatcherContext;
  export namespace expect {
    function objectContaining(expected: Record<string, unknown>): unknown;
  }

  type MockFn = {
    (...args: unknown[]): unknown;
    mockImplementation(fn: (...args: unknown[]) => unknown): MockFn;
    mockRestore(): void;
  };

  export const vi: {
    spyOn<T extends Record<string, unknown>, K extends keyof T>(
      object: T,
      method: K,
    ): MockFn;
  };
}
