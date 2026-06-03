import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { Request } from "express";
import type {
  PasskeyStore,
  StoredPasskey,
  ChallengeRecord,
  PasskeyControllerDeps,
  PasskeyController,
} from "./types.js";

const DEFAULT_STORE_VERSION = 1;
const DEFAULT_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const DEFAULT_RP_NAME = "OpenChamber";

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber");

const PASSKEY_STORE_FILE = path.join(
  OPENCHAMBER_DATA_DIR,
  "ui-passkeys.json",
);

function createUserId(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function decodeUserId(value: string): Uint8Array | null {
  if (typeof value !== "string" || !value) {
    return null;
  }

  try {
    return Uint8Array.from(Buffer.from(value, "base64url"));
  } catch {
    return null;
  }
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 120) : fallback;
}

function normalizeHost(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.startsWith("[")) {
    const end = trimmed.indexOf("]");
    return end >= 0
      ? trimmed.slice(1, end).toLowerCase()
      : trimmed.toLowerCase();
  }

  const colonIndex = trimmed.indexOf(":");
  return (colonIndex >= 0 ? trimmed.slice(0, colonIndex) : trimmed).toLowerCase();
}

function getCurrentRequestOrigin(req: Request): string {
  const forwardedProto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0].trim().toLowerCase()
      : "";
  const protocol =
    forwardedProto || ((req as any).socket?.encrypted ? "https" : "http");
  const forwardedHost =
    typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")[0].trim()
      : "";
  const host =
    forwardedHost ||
    (typeof req.headers.host === "string" ? req.headers.host.trim() : "");

  if (!host) {
    return "";
  }

  return `${protocol}://${host}`;
}

function getCurrentRpId(req: Request): string {
  const forwardedHost =
    typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")[0].trim()
      : "";
  const host =
    forwardedHost ||
    (typeof req.headers.host === "string" ? req.headers.host.trim() : "");
  return normalizeHost(host || (req as any).hostname || "");
}

function parseStoredPasskey(record: unknown): StoredPasskey | null {
  if (!record || typeof record !== "object") {
    return null;
  }

  const r = record as Record<string, unknown>;

  if (
    typeof r.id !== "string" ||
    typeof r.publicKey !== "string" ||
    typeof r.rpID !== "string"
  ) {
    return null;
  }

  return {
    id: r.id,
    publicKey: r.publicKey,
    counter:
      typeof r.counter === "number" && Number.isFinite(r.counter)
        ? r.counter
        : 0,
    transports: Array.isArray(r.transports)
      ? (r.transports as string[]).filter(
          (value: unknown) => typeof value === "string",
        )
      : [],
    deviceType:
      typeof r.deviceType === "string" ? r.deviceType : "singleDevice",
    backedUp: r.backedUp === true,
    createdAt:
      typeof r.createdAt === "number" ? r.createdAt : Date.now(),
    lastUsedAt:
      typeof r.lastUsedAt === "number" ? r.lastUsedAt : null,
    label: normalizeLabel(r.label, "Unnamed device"),
    rpID: r.rpID,
  };
}

export function createUiPasskeys({
  passwordBinding,
  readSettingsFromDiskMigrated,
  storeFile = PASSKEY_STORE_FILE,
  rpName = DEFAULT_RP_NAME,
  challengeTtlMs = DEFAULT_CHALLENGE_TTL_MS,
}: PasskeyControllerDeps = {} as PasskeyControllerDeps): PasskeyController {
  const binding = passwordBinding || "";
  const registrationChallenges = new Map<string, ChallengeRecord>();
  const authenticationChallenges = new Map<string, ChallengeRecord>();

  function ensureStoreDirectory(): void {
    fs.mkdirSync(path.dirname(storeFile), { recursive: true });
  }

  function persistStore(store: PasskeyStore): void {
    ensureStoreDirectory();
    fs.writeFileSync(storeFile, JSON.stringify(store, null, 2));
  }

  function createEmptyStore(): PasskeyStore {
    return {
      version: DEFAULT_STORE_VERSION,
      userID: createUserId(),
      passwordBinding: binding,
      passkeys: [] as StoredPasskey[],
    };
  }

  function loadStore(): PasskeyStore {
    let store = createEmptyStore();

    try {
      if (fs.existsSync(storeFile)) {
        const raw = fs.readFileSync(storeFile, "utf8");
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        store = {
          version: DEFAULT_STORE_VERSION,
          userID: decodeUserId(parsed?.userID as string)
            ? (parsed.userID as string)
            : store.userID,
          passwordBinding:
            typeof parsed?.passwordBinding === "string"
              ? parsed.passwordBinding
              : "",
          passkeys: Array.isArray(parsed?.passkeys)
            ? (parsed.passkeys as unknown[])
                .map((p) => parseStoredPasskey(p))
                .filter(Boolean) as StoredPasskey[]
            : [],
        };
      }
    } catch (error) {
      console.warn(
        "[UI Passkeys] Failed to read passkey store:",
        (error as Error)?.message || error,
      );
    }

    if (!binding) {
      if (store.passkeys.length > 0 || store.passwordBinding) {
        store = { ...store, passkeys: [], passwordBinding: "" };
        persistStore(store);
      }
      return store;
    }

    if (store.passwordBinding !== binding) {
      store = {
        version: DEFAULT_STORE_VERSION,
        userID: store.userID || createUserId(),
        passwordBinding: binding,
        passkeys: [],
      };
      persistStore(store);
      return store;
    }

    if (!fs.existsSync(storeFile)) {
      persistStore(store);
    }

    return store;
  }

  function cleanupChallengeMap(
    map: Map<string, ChallengeRecord>,
  ): void {
    const now = Date.now();
    for (const [requestId, record] of map.entries()) {
      if (!record || now >= record.expiresAt) {
        map.delete(requestId);
      }
    }
  }

  async function buildOriginCandidates(
    req: Request,
  ): Promise<string[]> {
    const origins = new Set<string>();
    const currentOrigin = getCurrentRequestOrigin(req);
    if (currentOrigin) {
      origins.add(currentOrigin);
    }

    try {
      const settings = await readSettingsFromDiskMigrated?.();
      if (
        typeof (settings as any)?.publicOrigin === "string" &&
        (settings as any).publicOrigin.trim().length > 0
      ) {
        origins.add(
          new URL((settings as any).publicOrigin.trim()).origin,
        );
      }
    } catch {
      // ignore
    }

    return Array.from(origins);
  }

  function assertEnabled(): void {
    if (!binding) {
      const error = new Error(
        "Passkeys require UI password protection to be enabled",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }
  }

  function getPasskeysForRpId(
    store: PasskeyStore,
    rpID: string,
  ): StoredPasskey[] {
    return store.passkeys.filter((passkey) => passkey.rpID === rpID);
  }

  function getStatus(req: Request) {
    const store = loadStore();
    const rpID = getCurrentRpId(req);
    return {
      enabled: Boolean(binding),
      hasPasskeys:
        Boolean(rpID) &&
        getPasskeysForRpId(store, rpID).length > 0,
      passkeyCount: Boolean(rpID)
        ? getPasskeysForRpId(store, rpID).length
        : 0,
      rpID,
    };
  }

  function listPasskeys(req: Request) {
    assertEnabled();

    const store = loadStore();
    const rpID = getCurrentRpId(req);
    if (!rpID) {
      return [];
    }

    return getPasskeysForRpId(store, rpID).map((passkey) => ({
      id: passkey.id,
      label: passkey.label,
      createdAt: passkey.createdAt,
      lastUsedAt: passkey.lastUsedAt,
      deviceType: passkey.deviceType,
      backedUp: passkey.backedUp,
    }));
  }

  function revokePasskey(req: Request, passkeyId: string) {
    assertEnabled();

    const normalizedPasskeyId =
      typeof passkeyId === "string" ? passkeyId.trim() : "";
    if (!normalizedPasskeyId) {
      const error = new Error(
        "Passkey ID is required",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const store = loadStore();
    const rpID = getCurrentRpId(req);
    const existingPasskey = store.passkeys.find(
      (passkey) =>
        passkey.id === normalizedPasskeyId && passkey.rpID === rpID,
    );

    if (!existingPasskey) {
      const error = new Error(
        "Passkey not found for this host",
      ) as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    const nextPasskeys = store.passkeys.filter(
      (passkey) =>
        !(
          passkey.id === normalizedPasskeyId &&
          passkey.rpID === rpID
        ),
    );
    persistStore({
      ...store,
      passwordBinding: binding,
      passkeys: nextPasskeys,
    });

    return {
      revoked: true,
      passkeyCount: nextPasskeys.filter(
        (passkey) => passkey.rpID === rpID,
      ).length,
    };
  }

  function clearAllPasskeys() {
    assertEnabled();

    const store = loadStore();
    const clearedCount = store.passkeys.length;
    persistStore({
      ...store,
      userID: crypto.randomBytes(32).toString("base64url"),
      passwordBinding: binding,
      passkeys: [],
    });

    return {
      cleared: true,
      clearedCount,
    };
  }

  async function beginRegistration(
    req: Request,
    { label }: { label?: string } = {},
  ) {
    assertEnabled();
    cleanupChallengeMap(registrationChallenges);

    const rpID = getCurrentRpId(req);
    if (!rpID) {
      const error = new Error(
        "Unable to resolve a valid passkey host for this request",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const currentOrigin = getCurrentRequestOrigin(req);
    if (!currentOrigin) {
      const error = new Error(
        "Unable to resolve a valid passkey origin for this request",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const store = loadStore();
    const userID = decodeUserId(store.userID);
    if (!userID) {
      const error = new Error(
        "Passkey storage is invalid. Please try again.",
      ) as Error & { statusCode: number };
      error.statusCode = 500;
      throw error;
    }

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID,
      userName: "openchamber-ui",
      userDisplayName: "OpenChamber UI",
      attestationType: "none",
      excludeCredentials: getPasskeysForRpId(store, rpID).map(
        (passkey) => ({
          id: passkey.id,
          transports: passkey.transports as any,
        }),
      ),
      authenticatorSelection: {
        residentKey: "required",
        userVerification: "required",
      },
    });

    const requestId = crypto
      .randomBytes(16)
      .toString("base64url");
    registrationChallenges.set(requestId, {
      challenge: options.challenge,
      expectedOrigins: await buildOriginCandidates(req),
      expectedRPIDs: [rpID],
      rpID,
      label: normalizeLabel(label, "This device"),
      createdAt: Date.now(),
      expiresAt: Date.now() + challengeTtlMs,
    });

    return {
      requestId,
      optionsJSON: options,
    };
  }

  async function finishRegistration(payload: any) {
    assertEnabled();
    cleanupChallengeMap(registrationChallenges);

    const store = loadStore();
    const requestId =
      typeof payload?.requestId === "string"
        ? payload.requestId
        : "";
    const response = payload?.response;

    const matchingRecord = requestId
      ? registrationChallenges.get(requestId)
      : null;
    if (!matchingRecord) {
      const error = new Error(
        "Passkey setup has expired. Please try again.",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    registrationChallenges.delete(requestId);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: matchingRecord.challenge,
      expectedOrigin: matchingRecord.expectedOrigins,
      expectedRPID: matchingRecord.expectedRPIDs,
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      const error = new Error(
        "Passkey registration could not be verified",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const {
      credential,
      credentialDeviceType,
      credentialBackedUp,
    } = verification.registrationInfo;

    const nextPasskeys = store.passkeys.filter(
      (passkey) => passkey.id !== credential.id,
    );
    nextPasskeys.push({
      id: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString(
        "base64url",
      ),
      counter: credential.counter,
      transports: Array.isArray(credential.transports)
        ? credential.transports.filter(
            (value: unknown) => typeof value === "string",
          )
        : [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp as boolean,
      createdAt: Date.now(),
      lastUsedAt: null,
      label: matchingRecord.label || "Unnamed device",
      rpID: matchingRecord.rpID || "",
    });

    persistStore({
      ...store,
      passwordBinding: binding,
      passkeys: nextPasskeys,
    });

    return {
      verified: true,
      passkeyCount: nextPasskeys.filter(
        (passkey) => passkey.rpID === matchingRecord.rpID,
      ).length,
    };
  }

  async function beginAuthentication(req: Request) {
    assertEnabled();
    cleanupChallengeMap(authenticationChallenges);

    const store = loadStore();
    const rpID = getCurrentRpId(req);
    const passkeys = getPasskeysForRpId(store, rpID);

    if (!rpID || passkeys.length === 0) {
      const error = new Error(
        "No passkeys are registered for this host yet",
      ) as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "required",
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.id,
        transports: passkey.transports as any,
      })),
    });

    const requestId = crypto
      .randomBytes(16)
      .toString("base64url");
    authenticationChallenges.set(requestId, {
      challenge: options.challenge,
      expectedOrigins: await buildOriginCandidates(req),
      expectedRPIDs: [rpID],
      createdAt: Date.now(),
      expiresAt: Date.now() + challengeTtlMs,
    });

    return {
      requestId,
      optionsJSON: options,
    };
  }

  async function finishAuthentication(payload: any) {
    assertEnabled();
    cleanupChallengeMap(authenticationChallenges);

    const requestId =
      typeof payload?.requestId === "string"
        ? payload.requestId
        : "";
    const response = payload?.response;
    const store = loadStore();
    const passkey = store.passkeys.find(
      (item) => item.id === response?.id,
    );

    if (!passkey) {
      const error = new Error(
        "That passkey is not registered for this OpenChamber instance",
      ) as Error & { statusCode: number };
      error.statusCode = 404;
      throw error;
    }

    const matchingRecord = requestId
      ? authenticationChallenges.get(requestId)
      : null;
    if (!matchingRecord) {
      const error = new Error(
        "Passkey sign-in has expired. Please try again.",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    authenticationChallenges.delete(requestId);

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: matchingRecord.challenge,
      expectedOrigin: matchingRecord.expectedOrigins,
      expectedRPID: matchingRecord.expectedRPIDs,
      credential: {
        id: passkey.id,
        publicKey: Buffer.from(passkey.publicKey, "base64url"),
        counter: passkey.counter,
        transports: passkey.transports as any,
      },
      requireUserVerification: true,
    });

    if (
      !verification.verified ||
      !verification.authenticationInfo
    ) {
      const error = new Error(
        "Passkey sign-in could not be verified",
      ) as Error & { statusCode: number };
      error.statusCode = 400;
      throw error;
    }

    const nextPasskeys = store.passkeys.map((item) =>
      item.id === passkey.id
        ? {
            ...item,
            counter: verification.authenticationInfo!.newCounter,
            lastUsedAt: Date.now(),
          }
        : item,
    );

    persistStore({
      ...store,
      passwordBinding: binding,
      passkeys: nextPasskeys,
    });

    return { verified: true };
  }

  function dispose(): void {
    registrationChallenges.clear();
    authenticationChallenges.clear();
  }

  return {
    enabled: Boolean(binding),
    getStatus,
    listPasskeys,
    revokePasskey,
    clearAllPasskeys,
    beginRegistration,
    finishRegistration,
    beginAuthentication,
    finishAuthentication,
    dispose,
    isLocalRpId: (rpID: string) =>
      rpID === "localhost" ||
      rpID === "127.0.0.1" ||
      rpID === "::1",
  };
}
