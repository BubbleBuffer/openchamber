import { describe, expect, test, vi } from "bun:test"
import { ChatErrorBoundary } from "./ChatErrorBoundary"

describe("ChatErrorBoundary", () => {
  test("logs errors locally without crashing", () => {
    const boundary = new ChatErrorBoundary({ children: null, sessionId: "test-session" })
    const error = new Error("test chat error")
    const nextState = (ChatErrorBoundary as unknown as { getDerivedStateFromError: (e: Error) => unknown }).getDerivedStateFromError(error)
    expect(nextState).toEqual({ hasError: true, error })
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    boundary.componentDidCatch(error, { componentStack: "\n    at ChatMessage\n    at div" } as React.ErrorInfo)
    expect(consoleSpy).toHaveBeenCalledWith(
      "[ChatErrorBoundary] Render error",
      error,
      { componentStack: "\n    at ChatMessage\n    at div" },
    )
    consoleSpy.mockRestore()
  })
})
