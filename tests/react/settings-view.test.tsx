import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { renderWithApp } from "./helpers/render"
import { seedDialogStore, seedUIStore } from "./helpers/stores"

vi.mock("@/lib/device", () => ({
  useDeviceInfo: () => ({ isMobile: false, isTablet: false, deviceType: "desktop" }),
  getDeviceInfo: () => ({ isMobile: false, isTablet: false, deviceType: "desktop" }),
}))

vi.mock("@/lib/desktop/desktop", () => ({
  isDesktopShell: () => false,
  isWebRuntime: () => true,
}))

vi.mock("@/components/sections/projects/ProjectsPage", () => ({ ProjectsPage: () => <section aria-label="Projects page">Projects page</section> }))
vi.mock("@/components/sections/projects/ProjectsSidebar", () => ({ ProjectsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Project item</button> }))
vi.mock("@/components/sections/agents/AgentsPage", () => ({ AgentsPage: () => <section aria-label="Agents page">Agents page</section> }))
vi.mock("@/components/sections/agents/AgentsSidebar", () => ({ AgentsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Agent item</button> }))
vi.mock("@/components/sections/commands/CommandsPage", () => ({ CommandsPage: () => <section aria-label="Commands page">Commands page</section> }))
vi.mock("@/components/sections/commands/CommandsSidebar", () => ({ CommandsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Command item</button> }))
vi.mock("@/components/sections/mcp/McpPage", () => ({ McpPage: () => <section aria-label="MCP page">MCP page</section> }))
vi.mock("@/components/sections/mcp/McpSidebar", () => ({ McpSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>MCP item</button> }))
vi.mock("@/components/sections/skills/SkillsPage", () => ({ SkillsPage: ({ view }: { view?: string }) => <section aria-label="Skills page">Skills page {view}</section> }))
vi.mock("@/components/sections/skills/SkillsSidebar", () => ({ SkillsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Skill item</button> }))
vi.mock("@/components/sections/providers/ProvidersPage", () => ({ ProvidersPage: () => <section aria-label="Providers page">Providers page</section> }))
vi.mock("@/components/sections/providers/ProvidersSidebar", () => ({ ProvidersSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Provider item</button> }))
vi.mock("@/components/sections/usage/UsagePage", () => ({ UsagePage: () => <section aria-label="Usage page">Usage page</section> }))
vi.mock("@/components/sections/usage/UsageSidebar", () => ({ UsageSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Usage item</button> }))
vi.mock("@/components/sections/magic-prompts/MagicPromptsPage", () => ({ MagicPromptsPage: () => <section aria-label="Magic Prompts page">Magic Prompts page</section> }))
vi.mock("@/components/sections/magic-prompts/MagicPromptsSidebar", () => ({ MagicPromptsSidebar: ({ onItemSelect }: { onItemSelect?: () => void }) => <button type="button" onClick={onItemSelect}>Magic prompt item</button> }))
vi.mock("@/components/sections/openchamber/OpenChamberPage", () => ({ OpenChamberPage: ({ section }: { section: string }) => <section aria-label="OpenChamber page">OpenChamber {section}</section> }))
vi.mock("@/components/sections/git-identities/GitPage", () => ({ GitPage: () => <section aria-label="Git page">Git page</section> }))
vi.mock("@/stores/agents/useAgentsStore", () => ({
  reloadOpenCodeConfiguration: vi.fn(),
  useAgentsStore: { getState: () => ({ loadAgents: vi.fn() }) },
}))
vi.mock("@/stores/useCommandsStore", () => ({ useCommandsStore: { getState: () => ({ loadCommands: vi.fn() }) } }))
vi.mock("@/stores/mcp/useMcpConfigStore", () => ({ useMcpConfigStore: { getState: () => ({ loadMcpConfigs: vi.fn() }) } }))
vi.mock("@/stores/skills/useSkillsStore", () => ({ useSkillsStore: { getState: () => ({ loadSkills: vi.fn() }) } }))
vi.mock("@/stores/skills/useSkillsCatalogStore", () => ({ useSkillsCatalogStore: { getState: () => ({ loadCatalog: vi.fn() }) } }))
vi.mock("@/stores/projects/useProjectsStore", () => ({ useProjectsStore: (selector: (state: { activeProjectId: string | null }) => unknown) => selector({ activeProjectId: "project-1" }) }))
vi.mock("@/stores/files/useDirectoryStore", () => ({ useDirectoryStore: { getState: () => ({ currentDirectory: "/workspace/openchamber" }) } }))

import { SettingsView } from "@/components/views/SettingsView"
import { SettingsWindow } from "@/components/views/SettingsWindow"
import { getSettingsPageMeta } from "@/lib/settings/metadata"
import { useUIStore } from "@/stores/useUIStore"

describe("SettingsView", () => {
  beforeEach(() => {
    seedUIStore({ settingsPage: "home" })
    seedDialogStore({ isSettingsDialogOpen: true })
  })

  test("renders the home page and quick links", () => {
    renderWithApp(<SettingsView />, { resetStores: false })

    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
    expect(screen.getByText("Jump to common pages.")).toBeTruthy()
    // Quick links appear in home page content; nav sidebar has items with same labels
    expect(screen.getAllByRole("button", { name: /Providers/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole("button", { name: /Agents/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole("button", { name: /Skills Catalog/i }).length).toBeGreaterThanOrEqual(1)
  })

  test("does not expose remote instance settings", () => {
    expect(getSettingsPageMeta(["remote", "instances"].join("-"))).toBeNull()
  })

  test("clicking a navigation item updates settingsPage and renders that page", async () => {
    const user = userEvent.setup()
    renderWithApp(<SettingsView />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Agents" }))

    expect(useUIStore.getState().settingsPage).toBe("agents")
    expect(await screen.findByLabelText("Agents page")).toBeTruthy()
  })

  test("renders an accessible settings navigation resize handle", () => {
    renderWithApp(<SettingsView />, { resetStores: false })

    expect(screen.getByRole("separator", { name: "Resize settings navigation" })).toBeTruthy()
  })

  test("calls onClose from the close settings button", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderWithApp(<SettingsView onClose={onClose} />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Close settings" }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  test("forceMobile renders mobile navigation and can drill into a section", async () => {
    const user = userEvent.setup()
    renderWithApp(<SettingsView forceMobile />, { resetStores: false })

    await user.click(screen.getByRole("button", { name: "Agents" }))

    expect(screen.getByRole("button", { name: "Back to Settings" })).toBeTruthy()
    expect(await screen.findByRole("button", { name: "Agent item" })).toBeTruthy()
  })
})

describe("SettingsWindow", () => {
  test("renders SettingsView inside a dialog when open", () => {
    renderWithApp(<SettingsWindow open onOpenChange={vi.fn()} />)

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByText("OpenChamber settings window.")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Settings" })).toBeTruthy()
  })

  test("close settings button calls onOpenChange(false)", async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderWithApp(<SettingsWindow open onOpenChange={onOpenChange} />)

    await user.click(screen.getByRole("button", { name: "Close settings" }))

    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
