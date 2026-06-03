export interface SayTtsCapability {
  available: boolean;
  voices: { name: string; locale: string }[];
  reason: string;
}

export interface SayTtsDeps {
  processLike: { platform: string };
}

export interface TtsSpeechOptions {
  text: string;
  voice?: string;
  model?: string;
  speed?: number;
  instructions?: string;
  apiKey?: string;
  baseURL?: string;
}

export interface TtsSpeechResult {
  buffer: Buffer;
  contentType: string;
}

export interface TtsSummarizeOptions {
  text: string;
  threshold?: number;
  maxLength?: number;
  zenModel?: string;
  mode?: "tts" | "notification" | "note";
}

export interface TtsSummarizeResult {
  summary: string;
  summarized: boolean;
  reason?: string;
  originalLength?: number;
  summaryLength?: number;
}

export interface TranscribeAudioOptions {
  audioBuffer: Buffer;
  mimeType: string;
  model: string;
  baseURL: string;
  language?: string;
}

export interface TtsModule {
  ttsService: {
    isAvailable(): boolean;
    generateSpeechStream(options: TtsSpeechOptions): Promise<TtsSpeechResult>;
  };
}

export interface TtsRoutesDeps {
  resolveZenModel(model?: string): Promise<string>;
  sayTTSCapability: SayTtsCapability;
}
