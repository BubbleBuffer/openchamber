import type { ReactElement, ReactNode } from "react"

export function MockPanel({ label }: { label: string }): ReactElement {
  return <div data-testid={`mock-${label.toLowerCase().replace(/\s+/g, "-")}`}>{label}</div>
}

export function MockSessionSidebar({ mobileVariant = false }: { mobileVariant?: boolean }): ReactElement {
  return (
    <nav aria-label={mobileVariant ? "Mobile sessions" : "Sessions"}>
      <button type="button">Build component tests</button>
      <button type="button">Fix layout shell</button>
    </nav>
  )
}

export function passthroughProvider({ children }: { children: ReactNode }): ReactElement {
  return <>{children}</>
}
