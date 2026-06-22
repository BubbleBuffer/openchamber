import {
  ANTIGRAVITY_ACCOUNTS_PATHS,
  readJsonFile,
  getAuthEntry,
  normalizeAuthEntry,
} from "../../auth-utils.js";
import { readAuthFile } from "../../../auth/provider-auth.js";
import { asObject, asNonEmptyString, toTimestamp } from "../../transformers.js";
import { parseGoogleRefreshToken } from "./transforms.js";
import type { GoogleAuthSource } from "../../types.js";

const ANTIGRAVITY_GOOGLE_CLIENT_ID =
  "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
const ANTIGRAVITY_GOOGLE_CLIENT_SECRET = "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";
const GEMINI_GOOGLE_CLIENT_ID =
  "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
const GEMINI_GOOGLE_CLIENT_SECRET = "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";
export const DEFAULT_PROJECT_ID = "rising-fact-p41fc";

export function resolveGoogleOAuthClient(sourceId: string): {
  clientId: string;
  clientSecret: string;
} {
  if (sourceId === "gemini") {
    return {
      clientId: GEMINI_GOOGLE_CLIENT_ID,
      clientSecret: GEMINI_GOOGLE_CLIENT_SECRET,
    };
  }

  return {
    clientId: ANTIGRAVITY_GOOGLE_CLIENT_ID,
    clientSecret: ANTIGRAVITY_GOOGLE_CLIENT_SECRET,
  };
}

export function resolveGeminiCliAuth(
  auth: Record<string, unknown>
): GoogleAuthSource | null {
  const entry = normalizeAuthEntry(getAuthEntry(auth, ["google", "google.oauth"]));
  const entryObject = asObject(entry);
  if (!entryObject) {
    return null;
  }

  const oauthObject = asObject(entryObject["oauth"]) ?? entryObject;
  const accessToken =
    asNonEmptyString(oauthObject["access"]) ??
    asNonEmptyString(oauthObject["token"]);
  const refreshParts = parseGoogleRefreshToken(oauthObject["refresh"]);

  if (!accessToken && !refreshParts.refreshToken) {
    return null;
  }

  return {
    sourceId: "gemini",
    sourceLabel: "Gemini",
    accessToken,
    refreshToken: refreshParts.refreshToken,
    projectId: refreshParts.projectId ?? refreshParts.managedProjectId,
    expires: toTimestamp(oauthObject["expires"]),
  };
}

export function resolveAntigravityAuth(): GoogleAuthSource | null {
  for (const filePath of ANTIGRAVITY_ACCOUNTS_PATHS) {
    const data = readJsonFile(filePath);
    const accounts = data?.accounts as Record<string, unknown>[] | undefined;
    if (Array.isArray(accounts) && accounts.length > 0) {
      const index =
        typeof data?.activeIndex === "number" ? data.activeIndex : 0;
      const account = accounts[index] ?? accounts[0];
      if (account?.refreshToken) {
        const refreshParts = parseGoogleRefreshToken(asNonEmptyString(account["refreshToken"]));
        return {
          sourceId: "antigravity",
          sourceLabel: "Antigravity",
          refreshToken: refreshParts.refreshToken,
          projectId:
            asNonEmptyString(account["projectId"]) ??
            asNonEmptyString(account["managedProjectId"]) ??
            refreshParts.projectId ??
            refreshParts.managedProjectId ?? undefined,
          email: asNonEmptyString(account["email"]) ?? undefined,
        };
      }
    }
  }

  return null;
}

export function resolveGoogleAuthSources(): GoogleAuthSource[] {
  const auth = readAuthFile();
  const sources: GoogleAuthSource[] = [];

  const geminiAuth = resolveGeminiCliAuth(auth);
  if (geminiAuth) {
    sources.push(geminiAuth);
  }

  const antigravityAuth = resolveAntigravityAuth();
  if (antigravityAuth) {
    sources.push(antigravityAuth);
  }

  return sources;
}