import { describe, expect, test, vi } from "bun:test"
import * as Sentry from "@sentry/react"
import { ChatErrorBoundary } from "./ChatErrorBoundary"

describe("ChatErrorBoundary", () => {
  test("captures errors without crashing", () => {
    const boundary = new ChatErrorBoundary({ children: null, sessionId: "test-session" })
    const error = new Error("test chat error")
    const nextState = (ChatErrorBoundary as unknown as { getDerivedStateFromError: (e: Error) => unknown }).getDerivedStateFromError(error)
    expect(nextState).toEqual({ hasError: true, error })
    const captureSpy = vi.spyOn(Sentry, "captureException").mockImplementation(() => undefined)
    boundary.componentDidCatch(error, { componentStack: "\n    at ChatMessage\n    at div" } as React.ErrorInfo)
    expect(captureSpy).toHaveBeenCalledWith(error, expect.objectContaining({
      extra: expect.objectContaining({ source: 'ChatErrorBoundary', sessionId: 'test-session' }),
    }))
    captureSpy.mockRestore()
  })
})
