import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"

vi.mock("@/lib/device", () => ({ useDeviceInfo: () => ({ isMobile: false }) }))
vi.mock("@/lib/config/persistence", () => ({ updateSettings: vi.fn() }))
vi.mock("@/contexts/runtimeAPIRegistry", () => ({ getRegisteredRuntimeAPIs: () => null }))
vi.mock("@/components/ui", () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock("@/components/ui/checkbox", () => ({ Checkbox: () => null }))
vi.mock("@/components/ui/input", () => ({ Input: () => null }))
vi.mock("@/components/ui/number-input", () => ({ NumberInput: () => null }))
vi.mock("@/components/ui/button", () => ({ Button: ({ children }: { children: React.ReactNode }) => <button>{children}</button> }))
vi.mock("@/components/ui/tooltip", () => ({ Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>, TooltipContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock("@/components/ui/select", () => ({ Select: ({ children }: { children: React.ReactNode }) => <>{children}</>, SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>, SelectItem: ({ children }: { children: React.ReactNode }) => <>{children}</>, SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>, SelectValue: () => null }))
vi.mock("@/stores/useNotificationSettingsStore", () => {
  const state = { nativeNotificationsEnabled: true, notificationMode: "hidden-only", notifyOnSubtasks: true, notifyOnCompletion: true, notifyOnError: true, notifyOnQuestion: true, notificationTemplates: { completion: { title: "", message: "" }, error: { title: "", message: "" }, question: { title: "", message: "" }, subtask: { title: "", message: "" } }, summarizeLastMessage: false, summaryThreshold: 200, summaryLength: 100, maxLastMessageLength: 250 }
  return { useNotificationSettingsStore: (selector: (value: typeof state & Record<string, unknown>) => unknown) => selector({ ...state, setNativeNotificationsEnabled: vi.fn(), setNotificationMode: vi.fn(), setNotifyOnSubtasks: vi.fn(), setNotifyOnCompletion: vi.fn(), setNotifyOnError: vi.fn(), setNotifyOnQuestion: vi.fn(), setNotificationTemplates: vi.fn(), setSummarizeLastMessage: vi.fn(), setSummaryThreshold: vi.fn(), setSummaryLength: vi.fn(), setMaxLastMessageLength: vi.fn() }) }
})
vi.mock("@/stores/config/useProviderConfigStore", () => ({ useProviderConfigStore: (selector: (value: { providers: unknown[] }) => unknown) => selector({ providers: [] }) }))
vi.mock("@/stores/agents/useAgentConfigStore", () => ({ useAgentConfigStore: (selector: (value: { settingsZenModel?: string; setSettingsZenModel: () => void }) => unknown) => selector({ setSettingsZenModel: vi.fn() }) }))

import { NotificationSettings } from "@/components/sections/openchamber/NotificationSettings"

describe("NotificationSettings Zen model contract", () => {
  test("renders valid shared Zen models", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("Notification", { permission: "granted" })
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ models: [{ id: "zen-valid" }] }) })
    render(<NotificationSettings />)
    expect(await screen.findByText((_, element) => element?.textContent === "Not selectedzen-valid")).toBeTruthy()
  })

  test("ignores malformed shared Zen model responses", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ models: "invalid" }) })
    vi.stubGlobal("fetch", fetchMock)
    vi.stubGlobal("Notification", { permission: "granted" })
    render(<NotificationSettings />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(screen.queryByText("invalid")).toBeNull()
  })
})
