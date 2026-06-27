import { screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { setViewport } from "./helpers/browser"
import { renderWithApp } from "./helpers/render"
import { seedDialogStore, seedUIStore } from "./helpers/stores"

let deviceIsMobile = false

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: deviceIsMobile, isTablet: false, deviceType: deviceIsMobile ? "mobile" : "desktop" }),
  getDeviceInfo: () => ({ isMobile: deviceIsMobile, isTablet: false, deviceType: deviceIsMobile ? "mobile" : "desktop" }),
}))

vi.mock("motion/react", async () => {
  const React = await import("react")
  const makeMotion = (tag: string) =>
    React.forwardRef<HTMLElement, Record<string, unknown> & { children?: ReactNode }>(function MotionMock(
      { children, ...props },
      ref,
    ) {
      return React.createElement(tag, { ...props, ref }, children)
    })

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    animate: vi.fn(() => ({ stop: vi.fn() })),
    motion: {
      aside: makeMotion("aside"),
      button: makeMotion("button"),
      div: makeMotion("div"),
      main: makeMotion("main"),
    },
    useMotionValue: (initial: number) => ({ get: () => initial, set: vi.fn() }),
    useTransform: () => 0,
  }
})

vi.mock("@/hooks/useEffectiveDirectory", () => ({ useEffectiveDirectory: () => "/workspace/openchamber" }))
vi.mock("@/contexts/DiffWorkerProvider", () => ({ DiffWorkerProvider: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock("@/components/layout/Header", () => ({ Header: () => <header><button type="button">Open left drawer</button><div role="tablist" aria-label="Main tabs"><button type="button">Chat</button></div></header> }))
vi.mock("@/components/session/SessionSidebar", () => ({ SessionSidebar: ({ mobileVariant = false }: { mobileVariant?: boolean }) => <nav aria-label={mobileVariant ? "Mobile sessions" : "Sessions"}><button type="button">Build component tests</button></nav> }))
vi.mock("@/components/session/SessionDialogs", () => ({ SessionDialogs: () => <div data-testid="session-dialogs" /> }))
vi.mock("@/components/views/ChatView", () => ({ ChatView: () => <main aria-label="Chat content">Chat content</main> }))
vi.mock("@/components/views/GitView", () => ({ GitView: () => <section aria-label="Git view">Git view</section> }))
vi.mock("@/components/views/DiffView", () => ({ DiffView: () => <section aria-label="Diff view">Diff view</section> }))
vi.mock("@/components/views/TerminalView", () => ({ TerminalView: () => <section aria-label="Terminal view">Terminal view</section> }))
vi.mock("@/components/views/FilesView", () => ({ FilesView: () => <section aria-label="Files view">Files view</section> }))
vi.mock("@/components/views/SettingsWindow", () => ({ SettingsWindow: ({ open }: { open: boolean }) => (open ? <section aria-label="Settings window">Settings window</section> : null) }))
vi.mock("@/components/views/MultiRunWindow", () => ({ MultiRunWindow: ({ open }: { open: boolean }) => (open ? <section aria-label="Multi run window">Multi run window</section> : null) }))
vi.mock("@/components/ui/CommandPalette", () => ({ CommandPalette: () => <div data-testid="command-palette" /> }))
vi.mock("@/components/ui/HelpDialog", () => ({ HelpDialog: () => <div data-testid="help-dialog" /> }))
vi.mock("@/components/ui/OpenCodeStatusDialog", () => ({ OpenCodeStatusDialog: () => <div data-testid="opencode-status-dialog" /> }))
vi.mock("@/components/ui/OfflineIndicator", () => ({ OfflineIndicator: () => <div data-testid="offline-indicator" /> }))
vi.mock("@/components/multirun", () => ({ MultiRunLauncher: () => null }))
vi.mock("@/components/layout/RightSidebarTabs", () => ({ RightSidebarTabs: () => <section aria-label="Right sidebar tabs">Right sidebar tabs</section> }))
vi.mock("@/components/layout/ContextPanel", () => ({ ContextPanel: () => <section aria-label="Context panel">Context panel</section> }))
vi.mock("@/stores/files/useDirectoryStore", () => ({ useDirectoryStore: { getState: () => ({ currentDirectory: "/workspace/openchamber" }), subscribe: () => () => {}, setState: () => {} } }))
vi.mock("@/stores/useUpdateStore", () => ({ useUpdateStore: (selector: (state: { checkForUpdates: () => Promise<null> }) => unknown) => selector({ checkForUpdates: async () => null }) }))

import { MainLayout } from "@/components/layout/MainLayout"
import { Sidebar } from "@/components/layout/Sidebar"
import { useUIStore } from "@/stores/useUIStore"

describe("Sidebar", () => {
  beforeEach(() => {
    deviceIsMobile = false
    seedUIStore({ isSidebarOpen: true, sidebarWidth: 300 })
  })

  test("renders desktop children and resize handle when open", () => {
    renderWithApp(<Sidebar isOpen isMobile={false}><nav aria-label="Sessions">Sessions content</nav></Sidebar>, { resetStores: false })

    expect(screen.getByLabelText("Sessions")).toBeTruthy()
    expect(screen.getByRole("separator", { name: "Resize left panel" })).toBeTruthy()
  })

  test("returns null on mobile", () => {
    renderWithApp(<Sidebar isOpen isMobile><nav aria-label="Sessions">Sessions content</nav></Sidebar>, { resetStores: false })

    expect(screen.queryByLabelText("Sessions")).toBeNull()
  })
})

describe("MainLayout", () => {
  beforeEach(() => {
    deviceIsMobile = false
    setViewport(1280)
    seedUIStore({
      isSidebarOpen: true,
      sidebarWidth: 300,
      isRightSidebarOpen: true,
      rightSidebarWidth: 400,
      activeMainTab: "chat",
      isBottomTerminalOpen: false,
      isSessionSwitcherOpen: false,
      contextPanelByDirectory: {},
    })
    seedDialogStore({ isSettingsDialogOpen: false, isMultiRunLauncherOpen: false })
  })

  test("renders desktop shell with sessions navigation, chat content, and right sidebar", async () => {
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Sessions")).toBeTruthy()
    expect(screen.getByLabelText("Chat content")).toBeTruthy()
    expect(screen.getByLabelText("Right sidebar tabs")).toBeTruthy()
    expect(screen.getByRole("separator", { name: "Resize left panel" })).toBeTruthy()
  })

  test("hides the desktop sidebar when isSidebarOpen is false", async () => {
    seedUIStore({ isSidebarOpen: false })
    const { container } = renderWithApp(<MainLayout />, { resetStores: false })

    await screen.findByLabelText("Chat content")
    const aside = container.querySelector('aside[aria-hidden="true"]')

    expect(aside).toBeTruthy()
    expect(screen.queryByRole("separator", { name: "Resize left panel" })).toBeNull()
  })

  test("renders mobile shell with mobile sessions when device is mobile", async () => {
    deviceIsMobile = true
    setViewport(390, 844)
    seedUIStore({ isSessionSwitcherOpen: true, isRightSidebarOpen: false })
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Mobile sessions")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Close drawer" })).toBeTruthy()
  })

  test("syncs mobile detection into useUIStore", async () => {
    deviceIsMobile = true
    setViewport(390, 844)
    renderWithApp(<MainLayout />, { resetStores: false })

    await screen.findByLabelText("Chat content")

    expect(useUIStore.getState().isMobile).toBe(true)
  })

  test("renders settings window when the settings dialog store is open", async () => {
    seedDialogStore({ isSettingsDialogOpen: true })
    renderWithApp(<MainLayout />, { resetStores: false })

    expect(await screen.findByLabelText("Settings window")).toBeTruthy()
  })
})
