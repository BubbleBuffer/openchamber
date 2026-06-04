import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import type { GitHubAuthEntry, GitHubAuthAccount } from "./types.js";

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber");

const STORAGE_DIR = OPENCHAMBER_DATA_DIR;
const STORAGE_FILE = path.join(STORAGE_DIR, "github-auth.json");
const SETTINGS_FILE = path.join(OPENCHAMBER_DATA_DIR, "settings.json");

const DEFAULT_GITHUB_CLIENT_ID = "Ov23lizomPOC3eFYo56r";
const DEFAULT_GITHUB_SCOPES = "repo read:org workflow read:user user:email";

function ensureStorageDir(): void {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

function readJsonFile(): unknown {
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    console.error("Failed to read GitHub auth file:", error);
    return null;
  }
}

function writeJsonFile(payload: unknown): void {
  ensureStorageDir();

  const tmpFile = `${STORAGE_FILE}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(payload, null, 2), "utf8");
  try {
    fs.chmodSync(tmpFile, 0o600);
  } catch {
    // best-effort
  }

  fs.renameSync(tmpFile, STORAGE_FILE);
  try {
    fs.chmodSync(STORAGE_FILE, 0o600);
  } catch {
    // best-effort
  }
}

function resolveAccountId(entry: {
  user?: GitHubAuthEntry["user"];
  accessToken?: string;
  accountId?: string;
}): string {
  if (typeof entry.accountId === "string" && entry.accountId.trim()) {
    return entry.accountId.trim();
  }
  if (entry.user && typeof entry.user.login === "string" && entry.user.login.trim()) {
    return entry.user.login.trim();
  }
  if (entry.user && typeof entry.user.id === "number") {
    return String(entry.user.id);
  }
  if (typeof entry.accessToken === "string" && entry.accessToken.trim()) {
    return `token:${entry.accessToken.slice(0, 8)}`;
  }
  return "";
}

function normalizeAuthEntry(entry: unknown): GitHubAuthEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const accessToken = typeof e.accessToken === "string" ? e.accessToken : "";
  if (!accessToken) return null;
  const user =
    e.user && typeof e.user === "object"
      ? {
          login: typeof (e.user as Record<string, unknown>).login === "string" ? ((e.user as Record<string, unknown>).login as string) : null,
          avatarUrl: typeof (e.user as Record<string, unknown>).avatarUrl === "string" ? ((e.user as Record<string, unknown>).avatarUrl as string) : null,
          id: typeof (e.user as Record<string, unknown>).id === "number" ? ((e.user as Record<string, unknown>).id as number) : null,
          name: typeof (e.user as Record<string, unknown>).name === "string" ? ((e.user as Record<string, unknown>).name as string) : null,
          email: typeof (e.user as Record<string, unknown>).email === "string" ? ((e.user as Record<string, unknown>).email as string) : null,
        }
      : null;

  const accountId = resolveAccountId({
    user,
    accessToken,
    accountId: typeof e.accountId === "string" ? e.accountId : "",
  });

  return {
    accessToken,
    scope: typeof e.scope === "string" ? e.scope : "",
    tokenType: typeof e.tokenType === "string" ? e.tokenType : "bearer",
    createdAt: typeof e.createdAt === "number" ? e.createdAt : null,
    user,
    current: Boolean(e.current),
    accountId,
  };
}

function normalizeAuthList(raw: unknown): { list: GitHubAuthEntry[]; changed: boolean } {
  const entries = (Array.isArray(raw) ? raw : [raw])
    .map((entry) => normalizeAuthEntry(entry))
    .filter((entry): entry is GitHubAuthEntry => entry !== null);

  if (!entries.length) {
    return { list: [], changed: false };
  }

  let changed = false;
  let currentFound = false;
  entries.forEach((entry) => {
    if (entry.current && !currentFound) {
      currentFound = true;
    } else if (entry.current && currentFound) {
      entry.current = false;
      changed = true;
    }
  });

  if (!currentFound && entries[0]) {
    entries[0].current = true;
    changed = true;
  }

  entries.forEach((entry) => {
    if (!entry.accountId) {
      entry.accountId = resolveAccountId(entry);
      changed = true;
    }
  });

  return { list: entries, changed };
}

function readAuthList(): GitHubAuthEntry[] {
  const data = readJsonFile();
  if (!data) {
    return [];
  }
  const { list, changed } = normalizeAuthList(data);
  if (changed) {
    writeJsonFile(list);
  }
  return list;
}

function writeAuthList(list: GitHubAuthEntry[]): void {
  writeJsonFile(list);
}

export function getGitHubAuth(): GitHubAuthEntry | null {
  const list = readAuthList();
  if (!list.length) {
    return null;
  }
  const current = list.find((entry) => entry.current) || list[0];
  if (!current?.accessToken) {
    return null;
  }
  return current;
}

export function getGitHubAuthAccounts(): GitHubAuthAccount[] {
  const list = readAuthList();
  return list
    .filter((entry) => entry?.user && entry.accountId)
    .map((entry) => ({
      id: entry.accountId,
      user: entry.user!,
      scope: entry.scope || "",
      current: Boolean(entry.current),
    }));
}

export function setGitHubAuth({
  accessToken,
  scope,
  tokenType,
  user,
  accountId,
}: {
  accessToken?: string;
  scope?: string;
  tokenType?: string;
  user?: GitHubAuthEntry["user"];
  accountId?: string;
}): GitHubAuthEntry {
  if (!accessToken || typeof accessToken !== "string") {
    throw new Error("accessToken is required");
  }
  const normalizedUser =
    user && typeof user === "object"
      ? {
          login: typeof user.login === "string" ? user.login : null,
          avatarUrl: typeof user.avatarUrl === "string" ? user.avatarUrl : null,
          id: typeof user.id === "number" ? user.id : null,
          name: typeof user.name === "string" ? user.name : null,
          email: typeof user.email === "string" ? user.email : null,
        }
      : null;

  const resolvedAccountId = resolveAccountId({
    user: normalizedUser,
    accessToken,
    accountId,
  });

  const list = readAuthList();
  const existingIndex = list.findIndex((entry) => entry.accountId === resolvedAccountId);
  const nextEntry: GitHubAuthEntry = {
    accessToken,
    scope: typeof scope === "string" ? scope : "",
    tokenType: typeof tokenType === "string" ? tokenType : "bearer",
    createdAt: Date.now(),
    user: normalizedUser || null,
    current: true,
    accountId: resolvedAccountId,
  };

  if (existingIndex >= 0) {
    list[existingIndex] = nextEntry;
  } else {
    list.push(nextEntry);
  }

  list.forEach((entry, index) => {
    entry.current = index === (existingIndex >= 0 ? existingIndex : list.length - 1);
  });
  writeAuthList(list);
  return nextEntry;
}

export function activateGitHubAuth(accountId: string): boolean {
  if (typeof accountId !== "string" || !accountId.trim()) {
    return false;
  }
  const list = readAuthList();
  const index = list.findIndex((entry) => entry.accountId === accountId.trim());
  if (index === -1) {
    return false;
  }
  list.forEach((entry, idx) => {
    entry.current = idx === index;
  });
  writeAuthList(list);
  return true;
}

export function clearGitHubAuth(): boolean {
  try {
    const list = readAuthList();
    if (!list.length) {
      return true;
    }
    const remaining = list.filter((entry) => !entry.current);
    if (!remaining.length) {
      if (fs.existsSync(STORAGE_FILE)) {
        fs.unlinkSync(STORAGE_FILE);
      }
      return true;
    }
    remaining.forEach((entry, index) => {
      entry.current = index === 0;
    });
    writeAuthList(remaining);
    return true;
  } catch (error) {
    console.error("Failed to clear GitHub auth file:", error);
    return false;
  }
}

export function getGitHubClientId(): string {
  const raw = process.env.OPENCHAMBER_GITHUB_CLIENT_ID;
  const clientId = typeof raw === "string" ? raw.trim() : "";
  if (clientId) return clientId;

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      const stored = typeof parsed?.githubClientId === "string" ? parsed.githubClientId.trim() : "";
      if (stored) return stored;
    }
  } catch {
    // ignore
  }

  return DEFAULT_GITHUB_CLIENT_ID;
}

export function getGitHubScopes(): string {
  const raw = process.env.OPENCHAMBER_GITHUB_SCOPES;
  const fromEnv = typeof raw === "string" ? raw.trim() : "";
  if (fromEnv) return fromEnv;

  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8"));
      const stored = typeof parsed?.githubScopes === "string" ? parsed.githubScopes.trim() : "";
      if (stored) return stored;
    }
  } catch {
    // ignore
  }

  return DEFAULT_GITHUB_SCOPES;
}

export const GITHUB_AUTH_FILE = STORAGE_FILE;
