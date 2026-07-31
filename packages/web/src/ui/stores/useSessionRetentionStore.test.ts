import { beforeEach, describe, expect, it } from 'bun:test';
import { useSessionRetentionStore } from './useSessionRetentionStore';

const resetStore = () => {
  useSessionRetentionStore.setState({
    autoDeleteEnabled: false,
    autoDeleteAfterDays: 30,
    sessionRetentionAction: 'archive',
    autoDeleteLastRunAt: null,
  }, false);
};

describe('useSessionRetentionStore', () => {
  beforeEach(resetStore);

  it('enables auto-delete', () => {
    useSessionRetentionStore.getState().setAutoDeleteEnabled(true);
    expect(useSessionRetentionStore.getState().autoDeleteEnabled).toBe(true);
  });

  it('clamps autoDeleteAfterDays to [1, 365]', () => {
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(0);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(1);
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(500);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(365);
    useSessionRetentionStore.getState().setAutoDeleteAfterDays(60);
    expect(useSessionRetentionStore.getState().autoDeleteAfterDays).toBe(60);
  });

  it('sets session retention action', () => {
    useSessionRetentionStore.getState().setSessionRetentionAction('delete');
    expect(useSessionRetentionStore.getState().sessionRetentionAction).toBe('delete');
  });

  it('sets autoDeleteLastRunAt', () => {
    const now = Date.now();
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(now);
    expect(useSessionRetentionStore.getState().autoDeleteLastRunAt).toBe(now);
  });

  it('clears autoDeleteLastRunAt with null', () => {
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(Date.now());
    useSessionRetentionStore.getState().setAutoDeleteLastRunAt(null);
    expect(useSessionRetentionStore.getState().autoDeleteLastRunAt).toBeNull();
  });
});
