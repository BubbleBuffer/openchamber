import { useDialogStore } from "@/stores/useDialogStore"
import { useUIStore, type MainTab } from "@/stores/useUIStore"

type UIStatePatch = Partial<ReturnType<typeof useUIStore.getState>>
type DialogStatePatch = Partial<ReturnType<typeof useDialogStore.getState>>

export function resetTopLevelStores(): void {
  useUIStore.setState(
    {
      isSidebarOpen: true,
      sidebarWidth: 300,
      isRightSidebarOpen: false,
      rightSidebarWidth: 400,
      isBottomTerminalOpen: false,
      activeMainTab: "chat" as MainTab,
      isSessionSwitcherOpen: false,
      settingsPage: "home",
      isMobile: false,
      contextPanelByDirectory: {},
    },
    false,
  )
  useDialogStore.setState(
    {
      isSettingsDialogOpen: false,
      isCommandPaletteOpen: false,
      isHelpDialogOpen: false,
      isOpenCodeStatusDialogOpen: false,
      isMultiRunLauncherOpen: false,
      multiRunLauncherPrefillPrompt: "",
    },
    false,
  )
}

export function seedUIStore(patch: UIStatePatch): void {
  useUIStore.setState(patch, false)
}

export function seedDialogStore(patch: DialogStatePatch): void {
  useDialogStore.setState(patch, false)
}
