import 'happy-dom';
import { ensureDom } from './utils/setupDom';
ensureDom();

import { beforeEach, describe, expect, it } from 'bun:test';

const { useLayoutStore } = await import('./useLayoutStore');

const resetStore = () => {
  // Stub window.innerHeight so proportional height calculations are deterministic.
  if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'innerHeight', { value: 1000, writable: true, configurable: true });
  }
  useLayoutStore.setState({
    isSidebarOpen: true,
    sidebarWidth: 300,
    isRightSidebarOpen: false,
    rightSidebarWidth: 400,
    rightSidebarTab: 'git',
    isBottomTerminalOpen: false,
    isBottomTerminalExpanded: false,
    bottomTerminalHeight: 300,
    hasManuallyResizedBottomTerminal: false,
  }, false);
};

describe('useLayoutStore', () => {
  beforeEach(resetStore);

  // toggleSidebar flips isSidebarOpen
  it('toggleSidebar flips isSidebarOpen', () => {
    const before = useLayoutStore.getState().isSidebarOpen;
    useLayoutStore.getState().toggleSidebar();
    expect(useLayoutStore.getState().isSidebarOpen).toBe(!before);
  });

  // setSidebarOpen: closed→open preserves width; already-open resets non-min width to min
  it('setSidebarOpen opens and preserves width when transitioning from closed', () => {
    useLayoutStore.setState({ isSidebarOpen: false, sidebarWidth: 500 }, false);
    useLayoutStore.getState().setSidebarOpen(true);
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(500);
  });

  it('setSidebarOpen resets width to min when already open and width differs', () => {
    useLayoutStore.setState({ isSidebarOpen: true, sidebarWidth: 500 }, false);
    useLayoutStore.getState().setSidebarOpen(true);
    expect(useLayoutStore.getState().isSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().sidebarWidth).toBe(300);
  });

  // setSidebarWidth: direct set
  it('setSidebarWidth sets width directly', () => {
    useLayoutStore.getState().setSidebarWidth(450);
    expect(useLayoutStore.getState().sidebarWidth).toBe(450);
  });

  // toggleRightSidebar mirrors sidebar pattern
  it('toggleRightSidebar flips isRightSidebarOpen', () => {
    const before = useLayoutStore.getState().isRightSidebarOpen;
    useLayoutStore.getState().toggleRightSidebar();
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(!before);
  });

  // setRightSidebarOpen mirrors setSidebarOpen
  it('setRightSidebarOpen opens and preserves width when transitioning from closed', () => {
    useLayoutStore.setState({ isRightSidebarOpen: false, rightSidebarWidth: 600 }, false);
    useLayoutStore.getState().setRightSidebarOpen(true);
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(600);
  });

  it('setRightSidebarOpen resets width to min when already open and width differs', () => {
    useLayoutStore.setState({ isRightSidebarOpen: true, rightSidebarWidth: 600 }, false);
    useLayoutStore.getState().setRightSidebarOpen(true);
    expect(useLayoutStore.getState().isRightSidebarOpen).toBe(true);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(400);
  });

  // setRightSidebarWidth: direct set
  it('setRightSidebarWidth sets width directly', () => {
    useLayoutStore.getState().setRightSidebarWidth(500);
    expect(useLayoutStore.getState().rightSidebarWidth).toBe(500);
  });

  // setRightSidebarTab: direct set
  it('setRightSidebarTab sets tab directly', () => {
    useLayoutStore.getState().setRightSidebarTab('context');
    expect(useLayoutStore.getState().rightSidebarTab).toBe('context');
  });

  // toggleBottomTerminal flips isBottomTerminalOpen; when opening, sets height + hasManuallyResizedBottomTerminal: false
  it('toggleBottomTerminal opens and recalculates height', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: false, hasManuallyResizedBottomTerminal: true, bottomTerminalHeight: 500 }, false);
    useLayoutStore.getState().toggleBottomTerminal();
    expect(useLayoutStore.getState().isBottomTerminalOpen).toBe(true);
    expect(useLayoutStore.getState().hasManuallyResizedBottomTerminal).toBe(false);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(Math.floor(1000 * 0.32));
  });

  // setBottomTerminalOpen: early-return if same; when opening, recalculates proportional height if not manually resized
  it('setBottomTerminalOpen is no-op when already open and manually resized', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: true, hasManuallyResizedBottomTerminal: true, bottomTerminalHeight: 300 }, false);
    useLayoutStore.getState().setBottomTerminalOpen(true);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(300);
  });

  it('setBottomTerminalOpen recalculates height when opening if not manually resized', () => {
    useLayoutStore.setState({ isBottomTerminalOpen: false, hasManuallyResizedBottomTerminal: false, bottomTerminalHeight: 100 }, false);
    useLayoutStore.getState().setBottomTerminalOpen(true);
    expect(useLayoutStore.getState().isBottomTerminalOpen).toBe(true);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(Math.floor(1000 * 0.32));
  });

  // setBottomTerminalExpanded: direct set
  it('setBottomTerminalExpanded sets expanded directly', () => {
    useLayoutStore.getState().setBottomTerminalExpanded(true);
    expect(useLayoutStore.getState().isBottomTerminalExpanded).toBe(true);
  });

  // setBottomTerminalHeight: sets height + hasManuallyResizedBottomTerminal: true
  it('setBottomTerminalHeight sets height and marks manually resized', () => {
    useLayoutStore.getState().setBottomTerminalHeight(400);
    expect(useLayoutStore.getState().bottomTerminalHeight).toBe(400);
    expect(useLayoutStore.getState().hasManuallyResizedBottomTerminal).toBe(true);
  });
});
