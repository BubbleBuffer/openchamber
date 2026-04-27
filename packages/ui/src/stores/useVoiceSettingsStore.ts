// packages/ui/src/stores/useVoiceSettingsStore.ts
import { create } from "zustand";
import { devtools } from "zustand/middleware";

const getLS = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(key); } catch { return null; }
};

const setLS = (key: string, value: string): void => {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
};

interface VoiceSettingsStore {
  // Voice provider preference
  voiceProvider: 'browser' | 'openai' | 'openai-compatible' | 'say';
  setVoiceProvider: (provider: 'browser' | 'openai' | 'openai-compatible' | 'say') => void;

  // TTS settings
  speechRate: number;
  speechPitch: number;
  speechVolume: number;
  sayVoice: string;
  browserVoice: string;
  openaiVoice: string;
  openaiApiKey: string;
  openaiCompatibleUrl: string;
  openaiCompatibleVoice: string;
  openaiCompatibleTtsModel: string;

  setSpeechRate: (rate: number) => void;
  setSpeechPitch: (pitch: number) => void;
  setSpeechVolume: (volume: number) => void;
  setSayVoice: (voice: string) => void;
  setBrowserVoice: (voice: string) => void;
  setOpenaiVoice: (voice: string) => void;
  setOpenaiApiKey: (apiKey: string) => void;
  setOpenaiCompatibleUrl: (url: string) => void;
  setOpenaiCompatibleVoice: (voice: string) => void;
  setOpenaiCompatibleTtsModel: (model: string) => void;

  // STT settings
  sttProvider: 'browser' | 'server';
  sttServerUrl: string;
  sttModel: string;
  sttLanguage: string;
  sttSilenceThresholdDb: number;
  sttSilenceHoldMs: number;

  setSttProvider: (provider: 'browser' | 'server') => void;
  setSttServerUrl: (url: string) => void;
  setSttModel: (model: string) => void;
  setSttLanguage: (lang: string) => void;
  setSttSilenceThresholdDb: (db: number) => void;
  setSttSilenceHoldMs: (ms: number) => void;

  // UI toggles
  showMessageTTSButtons: boolean;
  voiceModeEnabled: boolean;

  setShowMessageTTSButtons: (show: boolean) => void;
  setVoiceModeEnabled: (enabled: boolean) => void;

  // Summarization settings
  summarizeMessageTTS: boolean;
  summarizeVoiceConversation: boolean;
  summarizeCharacterThreshold: number;
  summarizeMaxLength: number;

  setSummarizeMessageTTS: (enabled: boolean) => void;
  setSummarizeVoiceConversation: (enabled: boolean) => void;
  setSummarizeCharacterThreshold: (threshold: number) => void;
  setSummarizeMaxLength: (maxLength: number) => void;
}

export const useVoiceSettingsStore = create<VoiceSettingsStore>()(
  devtools(
    (set) => ({
      // Voice provider
      voiceProvider: (() => {
        const saved = getLS('voiceProvider');
        if (saved === 'openai' || saved === 'browser' || saved === 'say' || saved === 'openai-compatible') return saved;
        return 'browser';
      })(),

      setVoiceProvider: (provider) => {
        set({ voiceProvider: provider });
        setLS('voiceProvider', provider);
      },

      // TTS
      speechRate: (() => {
        const saved = getLS('speechRate');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0.5 && p <= 2) return p; }
        return 1;
      })(),

      speechPitch: (() => {
        const saved = getLS('speechPitch');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0.5 && p <= 2) return p; }
        return 1;
      })(),

      speechVolume: (() => {
        const saved = getLS('speechVolume');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p) && p >= 0 && p <= 1) return p; }
        return 1;
      })(),

      sayVoice: (() => getLS('sayVoice') ?? 'Samantha')(),
      browserVoice: (() => getLS('browserVoice') ?? '')(),
      openaiVoice: (() => getLS('openaiVoice') ?? 'nova')(),
      openaiApiKey: (() => getLS('openaiApiKey') ?? '')(),
      openaiCompatibleUrl: (() => getLS('openaiCompatibleUrl') ?? '')(),
      openaiCompatibleVoice: (() => getLS('openaiCompatibleVoice') ?? 'af_sky')(),
      openaiCompatibleTtsModel: (() => {
        const saved = getLS('openaiCompatibleTtsModel');
        if (saved && saved !== 'speaches-ai/Kokoro-82M-v1.0-ONNX') return saved;
        return 'kokoro';
      })(),

      setSpeechRate: (rate) => { const c = Math.max(0.5, Math.min(2, rate)); set({ speechRate: c }); setLS('speechRate', String(c)); },
      setSpeechPitch: (pitch) => { const c = Math.max(0.5, Math.min(2, pitch)); set({ speechPitch: c }); setLS('speechPitch', String(c)); },
      setSpeechVolume: (volume) => { const c = Math.max(0, Math.min(1, volume)); set({ speechVolume: c }); setLS('speechVolume', String(c)); },
      setSayVoice: (voice) => { set({ sayVoice: voice }); setLS('sayVoice', voice); },
      setBrowserVoice: (voice) => { set({ browserVoice: voice }); setLS('browserVoice', voice); },
      setOpenaiVoice: (voice) => { set({ openaiVoice: voice }); setLS('openaiVoice', voice); },
      setOpenaiApiKey: (apiKey) => { set({ openaiApiKey: apiKey }); setLS('openaiApiKey', apiKey); },
      setOpenaiCompatibleUrl: (url) => { set({ openaiCompatibleUrl: url }); setLS('openaiCompatibleUrl', url); },
      setOpenaiCompatibleVoice: (voice) => { set({ openaiCompatibleVoice: voice }); setLS('openaiCompatibleVoice', voice); },
      setOpenaiCompatibleTtsModel: (model) => { set({ openaiCompatibleTtsModel: model }); setLS('openaiCompatibleTtsModel', model); },

      // STT
      sttProvider: (() => {
        const saved = getLS('sttProvider');
        if (saved === 'browser' || saved === 'server') return saved;
        return 'browser';
      })(),

      sttServerUrl: (() => getLS('sttServerUrl') ?? 'http://localhost:8001/v1')(),
      sttModel: (() => getLS('sttModel') ?? 'deepdml/faster-whisper-large-v3-turbo-ct2')(),
      sttLanguage: (() => { const saved = getLS('sttLanguage'); return saved !== null ? saved : ''; })(),

      sttSilenceThresholdDb: (() => {
        const saved = getLS('sttSilenceThresholdDb');
        if (saved) { const p = parseFloat(saved); if (!isNaN(p)) return p; }
        return -45;
      })(),

      sttSilenceHoldMs: (() => {
        const saved = getLS('sttSilenceHoldMs');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p)) return p; }
        return 1500;
      })(),

      setSttProvider: (provider) => { set({ sttProvider: provider }); setLS('sttProvider', provider); },
      setSttServerUrl: (url) => { set({ sttServerUrl: url }); setLS('sttServerUrl', url); },
      setSttModel: (model) => { set({ sttModel: model }); setLS('sttModel', model); },
      setSttLanguage: (lang) => { set({ sttLanguage: lang }); setLS('sttLanguage', lang); },
      setSttSilenceThresholdDb: (db) => { set({ sttSilenceThresholdDb: db }); setLS('sttSilenceThresholdDb', String(db)); },
      setSttSilenceHoldMs: (ms) => { set({ sttSilenceHoldMs: ms }); setLS('sttSilenceHoldMs', String(ms)); },

      // UI toggles
      showMessageTTSButtons: (() => {
        const saved = getLS('showMessageTTSButtons');
        return saved === 'true';
      })(),

      voiceModeEnabled: (() => {
        const saved = getLS('voiceModeEnabled');
        return saved === 'true';
      })(),

      setShowMessageTTSButtons: (show) => { set({ showMessageTTSButtons: show }); setLS('showMessageTTSButtons', String(show)); },
      setVoiceModeEnabled: (enabled) => { set({ voiceModeEnabled: enabled }); setLS('voiceModeEnabled', String(enabled)); },

      // Summarization
      summarizeMessageTTS: (() => {
        const saved = getLS('summarizeMessageTTS');
        return saved === 'true';
      })(),

      summarizeVoiceConversation: (() => {
        const saved = getLS('summarizeVoiceConversation');
        return saved === 'true';
      })(),

      summarizeCharacterThreshold: (() => {
        const saved = getLS('summarizeCharacterThreshold');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p) && p >= 50 && p <= 2000) return p; }
        return 200;
      })(),

      summarizeMaxLength: (() => {
        const saved = getLS('summarizeMaxLength');
        if (saved) { const p = parseInt(saved, 10); if (!isNaN(p) && p >= 50 && p <= 2000) return p; }
        return 500;
      })(),

      setSummarizeMessageTTS: (enabled) => { set({ summarizeMessageTTS: enabled }); setLS('summarizeMessageTTS', String(enabled)); },
      setSummarizeVoiceConversation: (enabled) => { set({ summarizeVoiceConversation: enabled }); setLS('summarizeVoiceConversation', String(enabled)); },
      setSummarizeCharacterThreshold: (threshold) => { const c = Math.max(50, Math.min(2000, threshold)); set({ summarizeCharacterThreshold: c }); setLS('summarizeCharacterThreshold', String(c)); },
      setSummarizeMaxLength: (maxLength) => { const c = Math.max(50, Math.min(2000, maxLength)); set({ summarizeMaxLength: c }); setLS('summarizeMaxLength', String(c)); },
    }),
    { name: "voice-settings-store" },
  ),
);
