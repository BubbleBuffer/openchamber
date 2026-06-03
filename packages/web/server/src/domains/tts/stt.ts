import OpenAI, { toFile } from "openai";
import { normalizeCustomOpenAIBaseURL } from "./base-url.js";
import type { TranscribeAudioOptions } from "./types.js";

export async function transcribeAudio({
  audioBuffer,
  mimeType,
  model,
  baseURL,
  language,
}: TranscribeAudioOptions): Promise<string> {
  const normalizedBaseURLResult = normalizeCustomOpenAIBaseURL(baseURL);
  if (normalizedBaseURLResult.error) {
    throw new Error(normalizedBaseURLResult.error);
  }

  const normalizedBaseURL = normalizedBaseURLResult.value;
  if (!normalizedBaseURL) {
    throw new Error("Custom server URL is required");
  }

  const clientOpts: Record<string, string> = {
    apiKey: process.env.OPENAI_API_KEY || "not-required",
  };
  clientOpts.baseURL = normalizedBaseURL;

  const client = new OpenAI(clientOpts);

  const ext = mimeTypeToExt(mimeType);
  const filename = `audio.${ext}`;

  const file = await toFile(audioBuffer, filename, { type: mimeType });

  const result = await client.audio.transcriptions.create({
    file,
    model,
    response_format: "json",
    ...(language ? { language } : {}),
  });

  return result.text ?? "";
}

function mimeTypeToExt(mimeType: string): string {
  const type = (mimeType || "").split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/mpeg": "mp3",
    "audio/mp4": "mp4",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
  };
  return map[type] ?? "webm";
}
