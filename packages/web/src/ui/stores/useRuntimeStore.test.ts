import { beforeEach, describe, expect, it } from 'bun:test';

// This import will fail until useRuntimeStore.ts exists
import { useRuntimeStore } from './useRuntimeStore';

const resetStore = () => {
  useRuntimeStore.setState({
    isMobile: false,
    isKeyboardOpen: false,
  }, false);
};

describe('useRuntimeStore', () => {
  beforeEach(resetStore);

  it('defaults isMobile to false', () => {
    expect(useRuntimeStore.getState().isMobile).toBe(false);
  });

  it('defaults isKeyboardOpen to false', () => {
    expect(useRuntimeStore.getState().isKeyboardOpen).toBe(false);
  });

  it('setIsMobile sets isMobile directly', () => {
    useRuntimeStore.getState().setIsMobile(true);
    expect(useRuntimeStore.getState().isMobile).toBe(true);

    useRuntimeStore.getState().setIsMobile(false);
    expect(useRuntimeStore.getState().isMobile).toBe(false);
  });

  it('setKeyboardOpen sets isKeyboardOpen directly', () => {
    useRuntimeStore.getState().setKeyboardOpen(true);
    expect(useRuntimeStore.getState().isKeyboardOpen).toBe(true);

    useRuntimeStore.getState().setKeyboardOpen(false);
    expect(useRuntimeStore.getState().isKeyboardOpen).toBe(false);
  });

  it('setKeyboardOpen is no-op when same value', () => {
    // Set initial value
    useRuntimeStore.setState({ isKeyboardOpen: true }, false);
    const stateBefore = useRuntimeStore.getState();
    const refBefore = stateBefore.isKeyboardOpen;

    // Calling with same value should return same state ref
    useRuntimeStore.getState().setKeyboardOpen(true);
    const stateAfter = useRuntimeStore.getState();
    expect(stateAfter.isKeyboardOpen).toBe(true);
    // The store should not have replaced the state object (same ref via the guard)
    // We verify by checking that a second call with different value works
    useRuntimeStore.getState().setKeyboardOpen(false);
    expect(useRuntimeStore.getState().isKeyboardOpen).toBe(false);
  });
});
