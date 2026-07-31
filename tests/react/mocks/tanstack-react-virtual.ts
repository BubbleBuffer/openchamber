/**
 * Mock for @tanstack/react-virtual.
 *
 * This file replaces the real useVirtualizer hook in the test environment.
 * All mock handles are exported so tests can control virtualizer behaviour.
 *
 * The mock types intentionally cover the small shared surface that
 * production code that imports @tanstack/react-virtual through this alias
 * (ChangesSection.tsx, VirtualizedMessageList.tsx, useChatScrollManager.ts,
 * etc.) type-checks correctly via tests/tsconfig.json without needing to
 * mirror the entire real module's API surface here.
 */

import { vi } from "vitest"

export const mockGetTotalSize = vi.fn<() => number>(() => 0)
export const mockGetVirtualItems = vi.fn<() => VirtualItem[]>(() => [])
export const mockScrollToIndex = vi.fn<(index: number, options?: ScrollOptions) => void>()
export const mockMeasureElement = vi.fn<(element: Element | null) => void>()
export const mockMeasure = vi.fn<() => void>()

export type VirtualItem = {
  index: number
  key: string | number
  start: number
  size: number
}

type ScrollOptions = {
  align?: "auto" | "start" | "center" | "end"
  behavior?: ScrollBehavior
}

type VirtualizerOptions<TScrollElement extends Element> = Record<string, unknown> & {
  getScrollElement?: () => TScrollElement | null
}

// Focused virtualizer instance — exposes every field production code reads
// (scrollElement, range, measure, measureElement, scrollToIndex, scrollToOffset,
// getVirtualItems, getTotalSize, etc.).
export type Virtualizer<TScrollElement extends Element = Element, TItemElement extends Element = Element> = {
  getTotalSize: () => number
  getVirtualItems: () => VirtualItem[]
  measure: () => void
  measureElement: (el: TItemElement | null) => void
  scrollToIndex: (index: number, options?: ScrollOptions) => void
  scrollToOffset: (offset: number, options?: ScrollOptions) => void
  scrollElement: TScrollElement | null
  range: { startIndex: number; endIndex: number; overscan: number } | null
  options: VirtualizerOptions<TScrollElement>
}

const useVirtualizerImplementation = <
  TScrollElement extends Element = Element,
  TItemElement extends Element = Element,
>(
  options: VirtualizerOptions<TScrollElement>,
): Virtualizer<TScrollElement, TItemElement> => ({
    getTotalSize: mockGetTotalSize,
    getVirtualItems: mockGetVirtualItems,
    measure: mockMeasure,
    measureElement: mockMeasureElement as (element: TItemElement | null) => void,
    scrollToIndex: mockScrollToIndex,
    scrollToOffset: vi.fn(),
    scrollElement: null,
    range: null,
    options,
  })

export const useVirtualizer = vi.fn(
  useVirtualizerImplementation,
) as typeof useVirtualizerImplementation
