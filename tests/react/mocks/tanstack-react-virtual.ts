/**
 * Mock for @tanstack/react-virtual.
 *
 * This file replaces the real useVirtualizer hook in the test environment.
 * All mock handles are exported so tests can control virtualizer behaviour.
 */

import { vi } from "vitest"

export const mockGetTotalSize = vi.fn(() => 0)
export const mockGetVirtualItems = vi.fn(() => [] as Array<{ index: number; key: number; start: number; size: number }>)
export const mockScrollToIndex = vi.fn()
export const mockMeasureElement = vi.fn()

export const useVirtualizer = vi.fn(() => ({
  getTotalSize: mockGetTotalSize,
  getVirtualItems: mockGetVirtualItems,
  measureElement: mockMeasureElement,
  scrollToIndex: mockScrollToIndex,
}))
