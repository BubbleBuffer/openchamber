/**
 * useMessageTTS Hook
 * 
 * Hook for playing TTS on individual messages.
 * Uses the configured voice provider (browser, OpenAI, or macOS Say).
 */

import { useCallback, useState } from 'react';
import { useVoiceSettingsStore } from '@/stores/useVoiceSettingsStore';
import { useServerTTS } from './useServerTTS';
import { useSayTTS } from './useSayTTS';
import { browserVoiceService } from '@/lib/voice/browserVoiceService';
import { summarizeText, shouldSummarize, sanitizeForTTS } from '@/lib/voice/summarize';

export interface UseMessageTTSReturn {
    /** Whether TTS is currently playing for this message */
    isPlaying: boolean;
    /** Play the message text */
    play: (text: string) => Promise<void>;
    /** Stop playback */
    stop: () => void;
}

export function useMessageTTS(): UseMessageTTSReturn {
    const [isPlaying, setIsPlaying] = useState(false);
    
    const voiceProvider = useVoiceSettingsStore((state) => state.voiceProvider);
    const speechRate = useVoiceSettingsStore((state) => state.speechRate);
    const speechPitch = useVoiceSettingsStore((state) => state.speechPitch);
    const speechVolume = useVoiceSettingsStore((state) => state.speechVolume);
    const sayVoice = useVoiceSettingsStore((state) => state.sayVoice);
    const browserVoice = useVoiceSettingsStore((state) => state.browserVoice);
    const openaiVoice = useVoiceSettingsStore((state) => state.openaiVoice);
    const openaiCompatibleVoice = useVoiceSettingsStore((state) => state.openaiCompatibleVoice);
    const openaiCompatibleUrl = useVoiceSettingsStore((state) => state.openaiCompatibleUrl);
    const openaiCompatibleTtsModel = useVoiceSettingsStore((state) => state.openaiCompatibleTtsModel);
    const summarizeMessageTTS = useVoiceSettingsStore((state) => state.summarizeMessageTTS);
    const summarizeCharacterThreshold = useVoiceSettingsStore((state) => state.summarizeCharacterThreshold);
    const showMessageTTSButtons = useVoiceSettingsStore((state) => state.showMessageTTSButtons);

    const isServerProvider = voiceProvider === 'openai' || voiceProvider === 'openai-compatible';
    const shouldCheckOpenAIAvailability = showMessageTTSButtons && isServerProvider;
    const shouldCheckSayAvailability = showMessageTTSButtons && voiceProvider === 'say';

    const { speak: speakServerTTS, stop: stopServerTTS, isAvailable: isServerTTSAvailable } = useServerTTS({
        enabled: shouldCheckOpenAIAvailability,
        availabilityMode: voiceProvider === 'openai-compatible' ? 'openai-compatible' : 'openai',
    });
    const { speak: speakSayTTS, stop: stopSayTTS, isAvailable: isSayTTSAvailable } = useSayTTS({
        enabled: shouldCheckSayAvailability,
    });
    
    const stop = useCallback(() => {
        setIsPlaying(false);
        stopServerTTS();
        stopSayTTS();
        browserVoiceService.cancelSpeech();
    }, [stopServerTTS, stopSayTTS]);
    
    const play = useCallback(async (text: string) => {
        if (!text.trim()) return;
        
        // Stop any existing playback
        stop();
        
        setIsPlaying(true);
        
        try {
            // Summarize text if enabled and over threshold
            let textToSpeak = text;
            if (summarizeMessageTTS && shouldSummarize(text, 'message')) {
                textToSpeak = await summarizeText(text, {
                    threshold: summarizeCharacterThreshold,
                });
            } else {
                // Still sanitize for TTS even when not summarizing
                textToSpeak = sanitizeForTTS(text);
            }
            
            if (isServerProvider && isServerTTSAvailable) {
                const voice = voiceProvider === 'openai-compatible' ? openaiCompatibleVoice : openaiVoice;
                const baseURL = voiceProvider === 'openai-compatible' ? openaiCompatibleUrl : undefined;
                const model = voiceProvider === 'openai-compatible' ? openaiCompatibleTtsModel : undefined;
                await speakServerTTS(textToSpeak, {
                    voice,
                    model,
                    speed: speechRate,
                    pitch: speechPitch,
                    volume: speechVolume,
                    summarize: false, // We already summarized client-side
                    baseURL,
                    onEnd: () => setIsPlaying(false),
                    onError: () => setIsPlaying(false),
                });
            } else if (voiceProvider === 'say' && isSayTTSAvailable) {
                const wordsPerMinute = Math.round(100 + (speechRate - 0.5) * 200);
                await speakSayTTS(textToSpeak, {
                    voice: sayVoice,
                    rate: wordsPerMinute,
                    onEnd: () => setIsPlaying(false),
                    onError: () => setIsPlaying(false),
                });
            } else {
                // Browser TTS
                await browserVoiceService.waitForVoices();
                await browserVoiceService.resumeAudioContext();
                await browserVoiceService.speakText(
                    textToSpeak,
                    navigator.language || 'en-US',
                    () => setIsPlaying(false),
                    {
                        rate: speechRate,
                        pitch: speechPitch,
                        volume: speechVolume,
                        voiceName: browserVoice || undefined,
                    }
                );
            }
        } catch (err) {
            console.error('[useMessageTTS] Playback error:', err);
            setIsPlaying(false);
        }
    }, [
        voiceProvider,
        isServerProvider,
        speechRate,
        speechPitch,
        speechVolume,
        sayVoice,
        browserVoice,
        openaiVoice,
        openaiCompatibleVoice,
        openaiCompatibleUrl,
        openaiCompatibleTtsModel,
        summarizeMessageTTS,
        summarizeCharacterThreshold,
        isServerTTSAvailable,
        isSayTTSAvailable,
        speakServerTTS,
        speakSayTTS,
        stop,
    ]);
    
    return {
        isPlaying,
        play,
        stop,
    };
}
