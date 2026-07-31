import { describe, expect, test } from 'bun:test';
import { LEGACY_VOICE_STORAGE_KEYS, purgeLegacyVoiceStorage } from './legacyCleanup';

describe('purgeLegacyVoiceStorage', () => {
  test('removes every retired voice key and leaves unrelated keys alone', () => {
    const values = new Map<string, string>([
      ['openaiApiKey', 'secret'],
      ['voiceModeEnabled', 'true'],
      ['theme', 'dark'],
    ]);
    const storage = {
      removeItem(key: string) {
        values.delete(key);
      },
    };

    purgeLegacyVoiceStorage(storage);
    purgeLegacyVoiceStorage(storage);

    expect(values).toEqual(new Map([['theme', 'dark']]));
    expect(LEGACY_VOICE_STORAGE_KEYS).toContain('openaiApiKey');
  });

  test('continues when a storage implementation rejects a key', () => {
    const removed: string[] = [];
    purgeLegacyVoiceStorage({
      removeItem(key: string) {
        if (key === 'openaiApiKey') throw new Error('blocked');
        removed.push(key);
      },
    });

    expect(removed).toContain('voiceModeEnabled');
  });

  test('does not fail boot when access to localStorage is blocked', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'window');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: Object.defineProperty({}, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        },
      }),
    });

    expect(() => purgeLegacyVoiceStorage()).not.toThrow();

    if (descriptor) {
      Object.defineProperty(globalThis, 'window', descriptor);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });
});
