import "happy-dom";
import { ensureDom } from "./utils/setupDom";
ensureDom();

import { describe, it, expect, beforeEach } from "bun:test";

const { useLayoutStore } = await import("./useLayoutStore");

describe("useUIStore (smoke — layout fields moved to useLayoutStore)", () => {
  beforeEach(() => {
    useLayoutStore.setState(
      {
        isSidebarOpen: true,
        sidebarWidth: 300,
      },
      false,
    );
  });

  it("toggleSidebar flips isSidebarOpen", () => {
    const before = useLayoutStore.getState().isSidebarOpen;
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().isSidebarOpen).toBe(!before);
  });

});
