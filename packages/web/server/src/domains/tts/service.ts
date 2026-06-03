import OpenAI from "openai";
import { readAuthFile } from "../auth/index.js";
import { normalizeCustomOpenAIBaseURL } from "./base-url.js";
import type { TtsSpeechOptions, TtsSpeechResult } from "./types.js";

export const TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
] as const;

function getOpenAIApiKey(): string | null {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return envKey;
  }

  try {
    const auth = readAuthFile();
    const openaiAuth = (auth as Record<string, unknown>).openai ||
      (auth as Record<string, unknown>).codex ||
      (auth as Record<string, unknown>).chatgpt;
    if (openaiAuth) {
      if (typeof openaiAuth === "string") {
        return openaiAuth;
      }
      const oa = openaiAuth as Record<string, unknown>;
      if (oa.access) {
        return oa.access as string;
      }
      if (oa.token) {
        return oa.token as string;
      }
    }
  } catch (error) {
    console.warn(
      "[TTSService] Failed to read auth file:",
      (error as Error).message,
    );
  }

  return null;
}

export class TTSService {
  private _client: OpenAI | null = null;
  private _lastApiKey: string | null = null;

  _getClient(): OpenAI | null {
    const apiKey = getOpenAIApiKey();

    if (apiKey && (!this._client || this._lastApiKey !== apiKey)) {
      this._client = new OpenAI({ apiKey });
      this._lastApiKey = apiKey;
    }

    return this._client;
  }

  isAvailable(): boolean {
    return this._getClient() !== null;
  }

  async generateSpeechStream(
    options: TtsSpeechOptions,
  ): Promise<TtsSpeechResult> {
    const {
      text,
      voice = "coral",
      model = "gpt-4o-mini-tts",
      speed = 1.0,
      instructions,
      apiKey,
      baseURL,
    } = options;

    const normalizedBaseURLResult = normalizeCustomOpenAIBaseURL(baseURL);
    if (normalizedBaseURLResult.error) {
      throw new Error(normalizedBaseURLResult.error);
    }
    const normalizedBaseURL = normalizedBaseURLResult.value;

    let client: OpenAI;
    if (normalizedBaseURL || apiKey) {
      const clientOpts: Record<string, string> = {};
      if (apiKey) clientOpts.apiKey = apiKey;
      if (!apiKey) clientOpts.apiKey = "not-required";
      if (normalizedBaseURL) clientOpts.baseURL = normalizedBaseURL;
      client = new OpenAI(clientOpts);
    } else {
      client = this._getClient()!;
    }

    if (!client) {
      throw new Error(
        "TTS service not available. Configure OpenAI in OpenCode, provide an API key, or set a custom server URL in settings.",
      );
    }

    if (!text.trim()) {
      throw new Error("Text is required for TTS");
    }

    try {
      const speechParams: Record<string, unknown> = normalizedBaseURL
        ? { model, voice, input: text, speed }
        : {
            model,
            voice,
            input: text,
            speed,
            ...(instructions && { instructions }),
            response_format: "mp3",
          };

      console.log(
        "[TTSService] Generating speech — model:",
        model,
        "voice:",
        voice,
        "baseURL:",
        normalizedBaseURL ?? "(openai)",
      );
      const response = await (client.audio.speech.create as any)(speechParams);

      const arrayBuffer = await response.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType: "audio/mpeg",
      };
    } catch (error) {
      console.error("[TTSService] Error generating speech:", error);
      throw new Error(
        `Failed to generate speech: ${(error as Error).message || "Unknown error"}`,
      );
    }
  }

  async generateSpeechBuffer(options: TtsSpeechOptions): Promise<Buffer> {
    const client = this._getClient();
    if (!client) {
      throw new Error(
        "OpenAI API key not configured. Set OPENAI_API_KEY environment variable or configure OpenAI in OpenCode.",
      );
    }

    const {
      text,
      voice = "coral",
      model = "gpt-4o-mini-tts",
      speed = 1.0,
      instructions,
    } = options;

    try {
      const response = await client.audio.speech.create({
        model,
        voice,
        input: text,
        speed,
        ...(instructions && { instructions }),
        response_format: "mp3",
      });

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(
        "[TTSService] Error generating speech buffer:",
        error,
      );
      throw error;
    }
  }
}

export const ttsService = new TTSService();
