import { render, type RenderOptions, type RenderResult } from "@testing-library/react"
import type { ReactElement } from "react"
import { resetTopLevelStores } from "./stores"

type RenderWithAppOptions = RenderOptions & {
  resetStores?: boolean
}

export function renderWithApp(ui: ReactElement, options: RenderWithAppOptions = {}): RenderResult {
  if (options.resetStores !== false) {
    resetTopLevelStores()
  }

  const { resetStores: _resetStores, ...renderOptions } = options
  return render(ui, renderOptions)
}
