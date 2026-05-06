import { describe, expect, test } from "bun:test"
import { ChatErrorBoundary } from "./ChatErrorBoundary"

describe("ChatErrorBoundary", () => {
  test("captures errors without crashing", () => {
    const boundary = new ChatErrorBoundary({ children: null, sessionId: "test-session" })
    const error = new Error("test chat error")
    const nextState = (ChatErrorBoundary as unknown as { getDerivedStateFromError: (e: Error) => unknown }).getDerivedStateFromError(error)
    expect(nextState).toEqual({ hasError: true, error })
    // componentDidCatch logs the error; verify it doesn't throw
    boundary.componentDidCatch(error, { componentStack: "\n    at ChatMessage\n    at div" } as React.ErrorInfo)
  })
})
