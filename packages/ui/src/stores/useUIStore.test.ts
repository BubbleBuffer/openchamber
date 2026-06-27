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

  it("setFontSize clamps to [50, 200]", () => {
    useUIStore.getState().setFontSize(500);
    expect(useUIStore.getState().fontSize).toBe(200);
    useUIStore.getState().setFontSize(10);
    expect(useUIStore.getState().fontSize).toBe(50);
  });
});
