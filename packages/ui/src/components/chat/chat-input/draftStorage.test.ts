import { describe, expect, test } from 'bun:test';
import {
  getConfirmedMentionsKey,
  getDraftKey,
  getStoredDraft,
  loadConfirmedMentions,
  saveConfirmedMentions,
  saveStoredDraft,
} from './draftStorage';

const installLocalStorage = () => {
  const data = new Map<string, string>();

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      clear: () => data.clear(),
      getItem: (key: string) => data.get(key) ?? null,
      removeItem: (key: string) => {
        data.delete(key);
      },
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
    },
  });
};

describe('draftStorage', () => {
  test('builds stable keys for session-scoped draft state', () => {
    expect(getDraftKey('session-1')).toBe('openchamber_chat_input_draft_session-1');
    expect(getConfirmedMentionsKey('session-1')).toBe('openchamber_chat_confirmed_mentions_session-1');
  });

  test('persists and reads draft text', () => {
    installLocalStorage();
    saveStoredDraft('session-1', 'hello world');
    expect(getStoredDraft('session-1')).toBe('hello world');
  });

  test('removes empty draft text', () => {
    installLocalStorage();
    saveStoredDraft('session-1', 'hello world');
    saveStoredDraft('session-1', '');
    expect(getStoredDraft('session-1')).toBe('');
  });

  test('persists confirmed mentions', () => {
    installLocalStorage();
    saveConfirmedMentions('session-1', new Set(['/src/App.tsx', '/src/main.tsx']));
    expect(loadConfirmedMentions('session-1')).toEqual(new Set(['/src/App.tsx', '/src/main.tsx']));
  });

  test('ignores malformed confirmed mention storage', () => {
    installLocalStorage();
    localStorage.setItem(getConfirmedMentionsKey('session-1'), '{not-json');
    expect(loadConfirmedMentions('session-1')).toEqual(new Set());
  });
});
