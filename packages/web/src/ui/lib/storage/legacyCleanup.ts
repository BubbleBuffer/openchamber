const LEGACY_VOICE_STORAGE_KEYS = [
  'voiceProvider',
  'speechRate',
  'speechPitch',
  'speechVolume',
  'sayVoice',
  'browserVoice',
  'openaiVoice',
  'openaiApiKey',
  'openaiCompatibleUrl',
  'openaiCompatibleVoice',
  'openaiCompatibleTtsModel',
  'sttProvider',
  'sttServerUrl',
  'sttModel',
  'sttLanguage',
  'sttSilenceThresholdDb',
  'sttSilenceHoldMs',
  'showMessageTTSButtons',
  'voiceModeEnabled',
  'summarizeMessageTTS',
  'summarizeVoiceConversation',
  'summarizeCharacterThreshold',
  'summarizeMaxLength',
  'voiceStatus',
  'voiceMode',
  'voice-settings-store',
] as const;

type RemovableStorage = Pick<Storage, 'removeItem'>;

/**
 * Remove only keys owned by the retired voice feature. This runs before any
 * persisted application stores hydrate so a historical API key cannot be
 * copied into a newer store or support report.
 */
export function purgeLegacyVoiceStorage(
  storage?: RemovableStorage | null,
): void {
  let target = storage;
  if (target === undefined) {
    try {
      target = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      return;
    }
  }
  if (!target) return;

  for (const key of LEGACY_VOICE_STORAGE_KEYS) {
    try {
      target.removeItem(key);
    } catch {
      // A blocked or quota-failed Storage implementation must not prevent boot.
    }
  }
}

export { LEGACY_VOICE_STORAGE_KEYS };
