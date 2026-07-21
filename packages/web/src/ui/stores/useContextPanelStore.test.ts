import { beforeEach, describe, expect, it } from 'bun:test';
import { useContextPanelStore } from './useContextPanelStore';

const resetStore = () => {
  useContextPanelStore.setState({
    contextPanelByDirectory: {},
    pendingDiffFile: null,
    pendingFileNavigation: null,
    pendingFileFocusPath: null,
  }, false);
};

describe('useContextPanelStore', () => {
  beforeEach(resetStore);

  it('opens a context diff tab and sets pendingDiffFile', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/file.ts');
    const state = useContextPanelStore.getState();
    expect(state.pendingDiffFile).toBe('/workspace/file.ts');
    const panel = state.contextPanelByDirectory['/workspace'];
    expect(panel).toBeDefined();
    expect(panel.isOpen).toBe(true);
    expect(panel.tabs.length).toBe(1);
    expect(panel.tabs[0].mode).toBe('diff');
  });

  it('opens a context file tab and sets focus path', () => {
    useContextPanelStore.getState().openContextFile('/workspace', '/workspace/file.ts');
    const state = useContextPanelStore.getState();
    expect(state.pendingFileFocusPath).toBe('/workspace/file.ts');
    const panel = state.contextPanelByDirectory['/workspace'];
    expect(panel.tabs[0].mode).toBe('file');
  });

  it('opens a context file at line with navigation', () => {
    useContextPanelStore.getState().openContextFileAtLine('/workspace', '/workspace/file.ts', 42, 5);
    const state = useContextPanelStore.getState();
    expect(state.pendingFileNavigation).toEqual({ path: '/workspace/file.ts', line: 42, column: 5 });
  });

  it('closes a panel tab and selects next active', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().openContextFile('/workspace', '/workspace/b.ts');
    const panel = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    const firstTabId = panel.tabs[1].id; // diff tab is older
    useContextPanelStore.getState().closeContextPanelTab('/workspace', firstTabId);
    const updated = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    expect(updated.tabs.find(t => t.id === firstTabId)).toBeUndefined();
  });

  it('closes panel entirely when no tabs remain', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    const panel = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    useContextPanelStore.getState().closeContextPanelTab('/workspace', panel.tabs[0].id);
    const updated = useContextPanelStore.getState().contextPanelByDirectory['/workspace'];
    expect(updated.isOpen).toBe(false);
  });

  it('toggles panel expanded', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().toggleContextPanelExpanded('/workspace');
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].expanded).toBe(true);
  });

  it('sets panel width with clamping', () => {
    useContextPanelStore.getState().openContextDiff('/workspace', '/workspace/a.ts');
    useContextPanelStore.getState().setContextPanelWidth('/workspace', 100);
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].width).toBe(360); // MIN_WIDTH
    useContextPanelStore.getState().setContextPanelWidth('/workspace', 2000);
    expect(useContextPanelStore.getState().contextPanelByDirectory['/workspace'].width).toBe(1400); // MAX_WIDTH
  });

  it('navigateToDiff sets pendingDiffFile first then switches tab', () => {
    // Mock useNavigationStore to capture setActiveMainTab call
    const pendingBefore = useContextPanelStore.getState().pendingDiffFile;
    expect(pendingBefore).toBeNull();

    const { useNavigationStore } = require('@/stores/useNavigationStore');
    const origGetState = useNavigationStore.getState;
    let tabSet = false;
    useNavigationStore.getState = () => ({
      ...origGetState(),
      mainTabGuard: null,
      setActiveMainTab: () => { tabSet = true; },
    });

    useContextPanelStore.getState().navigateToDiff('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBe('/workspace/file.ts');
    expect(tabSet).toBe(true);

    useNavigationStore.getState = origGetState;
  });

  it('navigateToDiff respects mainTabGuard and skips when guard rejects', () => {
    const { useNavigationStore } = require('@/stores/useNavigationStore');
    const origGetState = useNavigationStore.getState;
    let tabSet = false;
    useNavigationStore.getState = () => ({
      ...origGetState(),
      mainTabGuard: () => false,
      setActiveMainTab: () => { tabSet = true; },
    });

    useContextPanelStore.getState().navigateToDiff('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBeNull(); // not set
    expect(tabSet).toBe(false);

    useNavigationStore.getState = origGetState;
  });

  it('consumePendingDiffFile returns and clears the value', () => {
    useContextPanelStore.getState().setPendingDiffFile('/workspace/file.ts');
    const consumed = useContextPanelStore.getState().consumePendingDiffFile();
    expect(consumed).toBe('/workspace/file.ts');
    expect(useContextPanelStore.getState().pendingDiffFile).toBeNull();
  });
});
