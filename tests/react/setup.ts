import { cleanup } from "@testing-library/react"
import { afterEach, beforeAll } from "vitest"
import { installBrowserMocks, installMatchMedia, setViewport } from "./helpers/browser"

beforeAll(() => {
  installBrowserMocks()
  installMatchMedia(false)
  setViewport(1280)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
  setViewport(1280)
})
