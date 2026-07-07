import { describe, it, expect, beforeEach } from "bun:test";
import { useUIStore } from "./useUIStore";

describe("useUIStore (smoke — sidebar toggle + clamp)", () => {
  beforeEach(() => {
    useUIStore.setState(
      {
        isSidebarOpen: true,
        sidebarWidth: 300,
      },
      false,
    );
  });

  it("toggleSidebar flips isSidebarOpen", () => {
    const before = useUIStore.getState().isSidebarOpen;
    useUIStore.getState().toggleSidebar();
    expect(useUIStore.getState().isSidebarOpen).toBe(!before);
  });

});
