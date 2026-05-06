/**
 * Voice subsystem debug logger.
 *
 * Logs are gated behind a localStorage flag (`openchamber_voice_debug=1`) so
 * production builds stay quiet. Use `voiceLog`/`voiceWarn` everywhere in voice
 * hooks/services instead of raw `console.log`/`console.warn`. Errors should
 * still go through `console.error` directly.
 */
const isVoiceDebugEnabled = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        return window.localStorage.getItem('openchamber_voice_debug') === '1';
    } catch {
        return false;
    }
};

export const voiceLog = (...args: unknown[]): void => {
    if (isVoiceDebugEnabled()) {
        console.log(...args);
    }
};

export const voiceWarn = (...args: unknown[]): void => {
    if (isVoiceDebugEnabled()) {
        console.warn(...args);
    }
};
