import { useNavigationStore } from "@/stores/useNavigationStore"
import { useLayoutStore } from "@/stores/useLayoutStore"
import { useDialogStore } from "@/stores/useDialogStore"
import { useUIStore } from "@/stores/useUIStore"
import { useRuntimeStore } from "@/stores/useRuntimeStore"

type UIStatePatch = Partial<ReturnType<typeof useUIStore.getState>>
type DialogStatePatch = Partial<ReturnType<typeof useDialogStore.getState>>

export function resetTopLevelStores(): void {
  useLayoutStore.setState(
    {
      isSidebarOpen: true,
      sidebarWidth: 300,
      isRightSidebarOpen: false,
      rightSidebarWidth: 400,
      isBottomTerminalOpen: false,
    },
    false,
  )
  useNavigationStore.setState(
    {
      activeMainTab: "chat",
      isSessionSwitcherOpen: false,
    },
    false,
  )
  useRuntimeStore.setState(
    {
      isMobile: false,
      isKeyboardOpen: false,
    },
    false,
  )
  useUIStore.setState(
    {
      settingsPage: "home",
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
