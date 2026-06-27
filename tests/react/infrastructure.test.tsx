import { screen } from "@testing-library/react"
import { describe, expect, test } from "vitest"
import { renderWithApp } from "./helpers/render"

describe("react test infrastructure", () => {
  test("renders JSX in happy-dom", () => {
    renderWithApp(<button type="button">React works</button>)

    expect(screen.getByRole("button", { name: "React works" })).toBeTruthy()
  })
})
