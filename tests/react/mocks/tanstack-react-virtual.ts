/**
 * Mock for @tanstack/react-virtual.
 *
 * This file replaces the real useVirtualizer hook in the test environment.
 * All mock handles are exported so tests can control virtualizer behaviour.
 *
 * The mock types are intentionally permissive (broad `any` shapes) so that
 * production code that imports @tanstack/react-virtual through this alias
 * (ChangesSection.tsx, VirtualizedMessageList.tsx, useChatScrollManager.ts,
 * etc.) type-checks correctly via tests/tsconfig.json without needing to
 * mirror the entire real module's API surface here.
 */

import { vi } from "vitest"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockGetTotalSize = vi.fn<() => number>(() => 0)
export const mockGetVirtualItems = vi.fn<() => any[]>(() => [])
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockScrollToIndex = vi.fn<(index: number, options?: any) => void>()
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockMeasureElement = vi.fn<(el: any) => void>()
export const mockMeasure = vi.fn<() => void>()

// Permissive virtualizer instance — exposes every field production code reads
// (scrollElement, range, measure, measureElement, scrollToIndex, scrollToOffset,
// getVirtualItems, getTotalSize, etc.) as optional `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Virtualizer<TScrollElement = any, TItemElement = any> = {
  getTotalSize: () => number
  getVirtualItems: () => any[]
  measure: () => void
  measureElement: (el: TItemElement | null) => void
  scrollToIndex: (index: number, options?: any) => void
  scrollToOffset: (offset: number, options?: any) => void
  scrollElement: TScrollElement | null
  range: { startIndex: number; endIndex: number; overscan: number } | null
  options: any
  [key: string]: any
}

export const useVirtualizer = vi.fn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (_options: any): Virtualizer => ({
    getTotalSize: mockGetTotalSize,
    getVirtualItems: mockGetVirtualItems,
    measure: mockMeasure,
    measureElement: mockMeasureElement,
    scrollToIndex: mockScrollToIndex,
    scrollToOffset: vi.fn(),
    scrollElement: null,
    range: null,
    options: _options,
  }),
)