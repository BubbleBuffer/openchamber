import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll } from "vitest"
import { installBrowserMocks, installMatchMedia } from "../react/helpers/browser"

beforeAll(() => {
  installBrowserMocks()
  installMatchMedia()
})

afterEach(() => {
  cleanup()
  if (typeof window !== "undefined") {
    try {
      window.localStorage.clear()
      window.sessionStorage.clear()
    } catch {
      // ignore storage errors in bench runs
    }
  }
})
