import 'happy-dom';
import { ensureDom } from './utils/setupDom';
ensureDom();

import { beforeEach, describe, expect, it } from 'bun:test';

const { useNavigationStore } = await import('./useNavigationStore');

const resetStore = () => {
  useNavigationStore.setState({
    activeMainTab: 'chat',
    mainTabGuard: null,
    isSessionSwitcherOpen: false,
  }, false);
};

describe('useNavigationStore', () => {
  beforeEach(resetStore);

  // Defaults
  it('has correct defaults', () => {
    const state = useNavigationStore.getState();
    expect(state.activeMainTab).toBe('chat');
    expect(state.mainTabGuard).toBeNull();
    expect(state.isSessionSwitcherOpen).toBe(false);
  });

  // setActiveMainTab sets tab directly when no guard
  it('setActiveMainTab sets tab directly when no guard', () => {
    useNavigationStore.getState().setActiveMainTab('diff');
    expect(useNavigationStore.getState().activeMainTab).toBe('diff');
  });

  // setActiveMainTab early-returns when guard rejects
  it('setActiveMainTab early-returns when guard rejects', () => {
    const guard = (tab: string) => tab === 'chat';
    useNavigationStore.setState({ mainTabGuard: guard, activeMainTab: 'chat' }, false);
    useNavigationStore.getState().setActiveMainTab('diff');
    expect(useNavigationStore.getState().activeMainTab).toBe('chat');
  });

  // setActiveMainTab sets tab when guard approves
  it('setActiveMainTab sets tab when guard approves', () => {
    const guard = (tab: string) => tab !== 'chat';
    useNavigationStore.setState({ mainTabGuard: guard, activeMainTab: 'chat' }, false);
    useNavigationStore.getState().setActiveMainTab('diff');
    expect(useNavigationStore.getState().activeMainTab).toBe('diff');
  });

  // setMainTabGuard sets guard
  it('setMainTabGuard sets guard', () => {
    const guard = (tab: string) => tab === 'chat';
    useNavigationStore.getState().setMainTabGuard(guard);
    expect(useNavigationStore.getState().mainTabGuard).toBe(guard);
  });

  // setMainTabGuard is no-op when same guard
  it('setMainTabGuard is no-op when same guard', () => {
    const guard = (tab: string) => tab === 'chat';
    useNavigationStore.setState({ mainTabGuard: guard }, false);
    useNavigationStore.getState().setMainTabGuard(guard);
    expect(useNavigationStore.getState().mainTabGuard).toBe(guard);
  });

  // setSessionSwitcherOpen sets directly
  it('setSessionSwitcherOpen sets directly', () => {
    useNavigationStore.getState().setSessionSwitcherOpen(true);
    expect(useNavigationStore.getState().isSessionSwitcherOpen).toBe(true);
  });
});
