import crypto from "crypto";
import { SignJWT, jwtVerify } from "jose";
import fs from "fs";
import path from "path";
import os from "os";
import type { Request, Response } from "express";
import { createUiPasskeys } from "./ui-passkeys.js";
import {
  parsePasswordSessionRequest,
  UI_AUTH_RETRY_AFTER_HEADER,
  type OwnerSessionResponse,
  type UiAuthErrorResponse,
} from "../../contracts/ui-auth.js";
import type {
  UiAuthDeps,
  UiAuthController,
  RateLimitResult,
  RateLimitRecord,
  PasskeyController,
} from "./types.js";

const SESSION_COOKIE_NAME = "oc_ui_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TRUSTED_DEVICE_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS =
  Number(process.env.OPENCHAMBER_RATE_LIMIT_MAX_ATTEMPTS) || 10;
const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000;
const RATE_LIMIT_CLEANUP_MS = 60 * 60 * 1000;
const RATE_LIMIT_NO_IP_MAX_ATTEMPTS =
  Number(process.env.OPENCHAMBER_RATE_LIMIT_NO_IP_MAX_ATTEMPTS) || 3;

const loginRateLimiter = new Map<string, RateLimitRecord>();
let rateLimitCleanupTimer: ReturnType<typeof setInterval> | null = null;

const rateLimitLocks = new Map<string, Promise<void>>();

function getClientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const ip = forwarded.split(",")[0].trim();
    if (ip.startsWith("::ffff:")) {
      return ip.substring(7);
    }
    return ip;
  }

  const ip = req.ip || (req as any).connection?.remoteAddress;
  if (ip) {
    if (ip.startsWith("::ffff:")) {
      return (ip as string).substring(7);
    }
    return ip as string;
  }
  return null;
}

function getRateLimitKey(req: Request): string {
  const ip = getClientIp(req);
  if (ip) return ip;
  return "rate-limit:no-ip";
}

function getRateLimitConfig(key: string): {
  maxAttempts: number;
  windowMs: number;
} {
  if (key === "rate-limit:no-ip") {
    return {
      maxAttempts: RATE_LIMIT_NO_IP_MAX_ATTEMPTS,
      windowMs: RATE_LIMIT_WINDOW_MS,
    };
  }
  return {
    maxAttempts: RATE_LIMIT_MAX_ATTEMPTS,
    windowMs: RATE_LIMIT_WINDOW_MS,
  };
}

async function acquireRateLimitLock(key: string): Promise<void> {
  const prev = rateLimitLocks.get(key) || Promise.resolve();
  const curr = prev.then(() => {
    rateLimitLocks.delete(key);
  });
  rateLimitLocks.set(key, curr);
  await curr;
}

async function checkRateLimit(
  req: Request,
): Promise<RateLimitResult> {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  const now = Date.now();
  const { maxAttempts } = getRateLimitConfig(key);

  let record: RateLimitRecord | undefined;
  try {
    record = loginRateLimiter.get(key);
  } catch (err) {
    console.error("[RateLimit] Failed to get record", {
      key,
      error: (err as Error).message,
    });
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil(
        (now + RATE_LIMIT_WINDOW_MS) / 1000,
      ),
    };
  }

  if (record?.lockedUntil && now < record.lockedUntil) {
    return {
      allowed: false,
      retryAfter: Math.ceil(
        (record.lockedUntil - now) / 1000,
      ),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(record.lockedUntil / 1000),
    };
  }

  if (record?.lockedUntil && now >= record.lockedUntil) {
    try {
      loginRateLimiter.delete(key);
    } catch (err) {
      console.error(
        "[RateLimit] Failed to delete expired record",
        { key, error: (err as Error).message },
      );
    }
  }

  if (
    !record ||
    now - record.lastAttempt > RATE_LIMIT_WINDOW_MS
  ) {
    return {
      allowed: true,
      limit: maxAttempts,
      remaining: maxAttempts,
      reset: Math.ceil(
        (now + RATE_LIMIT_WINDOW_MS) / 1000,
      ),
    };
  }

  if (record.count >= maxAttempts) {
    const lockedUntil = now + RATE_LIMIT_LOCKOUT_MS;
    try {
      loginRateLimiter.set(key, {
        count: record.count + 1,
        lastAttempt: now,
        lockedUntil,
      });
    } catch (err) {
      console.error("[RateLimit] Failed to set lockout", {
        key,
        error: (err as Error).message,
      });
    }
    return {
      allowed: false,
      retryAfter: Math.ceil(
        RATE_LIMIT_LOCKOUT_MS / 1000,
      ),
      locked: true,
      limit: maxAttempts,
      remaining: 0,
      reset: Math.ceil(lockedUntil / 1000),
    };
  }

  const remaining = maxAttempts - record.count;
  const reset = Math.ceil(
    (record.lastAttempt + RATE_LIMIT_WINDOW_MS) / 1000,
  );
  return {
    allowed: true,
    limit: maxAttempts,
    remaining,
    reset,
  };
}

async function recordFailedAttempt(req: Request): Promise<void> {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  const now = Date.now();
  const record = loginRateLimiter.get(key);

  if (
    !record ||
    now - record.lastAttempt > RATE_LIMIT_WINDOW_MS
  ) {
    try {
      loginRateLimiter.set(key, { count: 1, lastAttempt: now });
    } catch (err) {
      console.error(
        "[RateLimit] Failed to record attempt",
        { key, error: (err as Error).message },
      );
    }
  } else {
    const newCount = record.count + 1;
    try {
      loginRateLimiter.set(key, {
        count: newCount,
        lastAttempt: now,
      });
    } catch (err) {
      console.error(
        "[RateLimit] Failed to record attempt",
        { key, error: (err as Error).message },
      );
    }
  }
}

async function clearRateLimit(req: Request): Promise<void> {
  const key = getRateLimitKey(req);
  await acquireRateLimitLock(key);

  try {
    loginRateLimiter.delete(key);
  } catch (err) {
    console.error("[RateLimit] Failed to clear", {
      key,
      error: (err as Error).message,
    });
  }
}

function cleanupRateLimitRecords(): void {
  const now = Date.now();
  for (const [key, record] of loginRateLimiter.entries()) {
    const isExpired =
      record.lockedUntil && now >= record.lockedUntil;
    const isStale =
      now - record.lastAttempt > RATE_LIMIT_CLEANUP_MS;
    if (isExpired || isStale) {
      try {
        loginRateLimiter.delete(key);
      } catch (err) {
        console.error(
          "[RateLimit] Cleanup failed",
          { key, error: (err as Error).message },
        );
      }
    }
  }
}

function startRateLimitCleanup(): void {
  if (!rateLimitCleanupTimer) {
    rateLimitCleanupTimer = setInterval(
      cleanupRateLimitRecords,
      RATE_LIMIT_CLEANUP_MS,
    );
    if (
      rateLimitCleanupTimer &&
      typeof rateLimitCleanupTimer.unref === "function"
    ) {
      rateLimitCleanupTimer.unref();
    }
  }
}

function stopRateLimitCleanup(): void {
  if (rateLimitCleanupTimer) {
    clearInterval(rateLimitCleanupTimer);
    rateLimitCleanupTimer = null;
  }
}

function isSecureRequest(req: Request): boolean {
  if ((req as any).secure) {
    return true;
  }
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (typeof forwardedProto === "string") {
    const firstProto = forwardedProto
      .split(",")[0]
      ?.trim()
      .toLowerCase();
    return firstProto === "https";
  }
  return false;
}

function parseCookies(
  cookieHeader: string,
): Record<string, string> {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  return cookieHeader.split(";").reduce(
    (acc, segment) => {
      const [name, ...rest] = segment.split("=");
      if (!name) {
        return acc;
      }
      const key = name.trim();
      if (!key) {
        return acc;
      }
      const value = rest.join("=").trim();
      try {
        acc[key] = decodeURIComponent(value || "");
      } catch {
        acc[key] = value || "";
      }
      return acc;
    },
    {} as Record<string, string>,
  );
}

function buildCookie({
  name,
  value,
  maxAge,
  secure,
}: {
  name: string;
  value: string;
  maxAge: number;
  secure: boolean;
}): string {
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Strict",
  ];

  if (typeof maxAge === "number") {
    attributes.push(
      `Max-Age=${Math.max(0, Math.floor(maxAge))}`,
    );
  }

  const expires =
    maxAge === 0
      ? "Thu, 01 Jan 1970 00:00:00 GMT"
      : new Date(Date.now() + maxAge * 1000).toUTCString();

  attributes.push(`Expires=${expires}`);

  if (secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

function normalizePassword(candidate: unknown): string {
  if (typeof candidate !== "string") {
    return "";
  }
  return candidate.normalize().trim();
}

function isTrustedDeviceRequest(value: unknown): boolean {
  return value === true;
}

const OPENCHAMBER_DATA_DIR = process.env.OPENCHAMBER_DATA_DIR
  ? path.resolve(process.env.OPENCHAMBER_DATA_DIR)
  : path.join(os.homedir(), ".config", "openchamber");
const JWT_SECRET_FILE = path.join(
  OPENCHAMBER_DATA_DIR,
  "jwt-secret",
);

function getOrCreateJwtSecret(): Uint8Array {
  const envSecret = process.env.OPENCODE_JWT_SECRET;
  if (envSecret) {
    return new TextEncoder().encode(envSecret);
  }

  try {
    if (fs.existsSync(JWT_SECRET_FILE)) {
      return new TextEncoder().encode(
        fs.readFileSync(JWT_SECRET_FILE, "utf8").trim(),
      );
    }
  } catch (e) {
    console.warn(
      "[JWT] Failed to read secret file:",
      (e as Error).message,
    );
  }

  const secret = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(OPENCHAMBER_DATA_DIR, { recursive: true });
    fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 });
    console.log(
      "[JWT] Generated and persisted new secret to",
      JWT_SECRET_FILE,
    );
  } catch (e) {
    console.warn(
      "[JWT] Failed to persist secret:",
      (e as Error).message,
    );
  }

  return new TextEncoder().encode(secret);
}

function persistJwtSecret(secret: string): Uint8Array {
  if (process.env.OPENCODE_JWT_SECRET) {
    const error = new Error(
      "Global sign-out is unavailable while OPENCODE_JWT_SECRET is set",
    ) as Error & { statusCode: number };
    error.statusCode = 400;
    throw error;
  }

  fs.mkdirSync(OPENCHAMBER_DATA_DIR, { recursive: true });
  fs.writeFileSync(JWT_SECRET_FILE, secret, { mode: 0o600 });
  return new TextEncoder().encode(secret);
}

export function createUiAuth({
  password,
  cookieName = SESSION_COOKIE_NAME,
  sessionTtlMs = SESSION_TTL_MS,
  readSettingsFromDiskMigrated,
}: UiAuthDeps = {} as UiAuthDeps): UiAuthController {
  const normalizedPassword = normalizePassword(password);

  if (!normalizedPassword) {
    const setSessionCookie = (
      req: Request,
      res: Response,
      token: string,
      ttlMs: number = sessionTtlMs,
    ) => {
      const secure = isSecureRequest(req);
      const maxAgeSeconds = Math.floor(ttlMs / 1000);
      const header = buildCookie({
        name: cookieName,
        value: encodeURIComponent(token),
        maxAge: maxAgeSeconds,
        secure,
      });
      res.setHeader("Set-Cookie", header);
    };

    const ensureSessionToken = async (
      req: Request,
      res: Response,
    ): Promise<string> => {
      const cookies = parseCookies(
        req.headers.cookie as string,
      );
      if (cookies[cookieName]) {
        return cookies[cookieName];
      }
      const token = crypto
        .randomBytes(32)
        .toString("base64url");
      setSessionCookie(req, res, token, sessionTtlMs);
      return token;
    };

    return {
      enabled: false,
      requireAuth: async (
        _req: Request,
        _res: Response,
        next: () => void,
      ) => next(),
      handleSessionStatus: async (
        _req: Request,
        res: Response,
      ) => {
        const response: OwnerSessionResponse = { authenticated: true, disabled: true };
        res.json(response);
      },
      handleSessionCreate: async (
        _req: Request,
        res: Response,
      ) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handlePasskeyStatus: (_req, res) => {
        res.json({
          enabled: false,
          hasPasskeys: false,
          passkeyCount: 0,
          rpID: null,
        });
      },
      handlePasskeyRegistrationOptions: async (
        _req,
        res,
      ) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handlePasskeyRegistrationVerify: async (_req, res) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handlePasskeyAuthenticationOptions: async (
        _req,
        res,
      ) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handlePasskeyAuthenticationVerify: async (
        _req,
        res,
      ) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handlePasskeyList: (_req, res) => {
        res.json({ passkeys: [] });
      },
      handlePasskeyRevoke: (_req, res) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      handleResetAuth: (_req, res) => {
        res
          .status(400)
          .json({ error: "UI password not configured", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      },
      ensureSessionToken,
      dispose: () => {
        // noop
      },
    };
  }

  const salt = crypto.randomBytes(16);
  const expectedHash = crypto.scryptSync(
    normalizedPassword,
    salt,
    64,
  );
  let jwtSecret = getOrCreateJwtSecret();
  let passwordBinding = crypto
    .createHmac("sha256", jwtSecret)
    .update(normalizedPassword)
    .digest("hex");

  const resolveSessionTtlMs = (trustDevice: boolean) =>
    trustDevice ? TRUSTED_DEVICE_SESSION_TTL_MS : sessionTtlMs;

  let passkeyController: PasskeyController = createUiPasskeys({
    passwordBinding,
    readSettingsFromDiskMigrated,
  });

  function rebuildPasskeyController(): void {
    passkeyController.dispose();
    passwordBinding = crypto
      .createHmac("sha256", jwtSecret)
      .update(normalizedPassword)
      .digest("hex");
    passkeyController = createUiPasskeys({
      passwordBinding,
      readSettingsFromDiskMigrated,
    });
  }

  function rotateJwtSecret(): void {
    const nextSecret = crypto
      .randomBytes(32)
      .toString("hex");
    jwtSecret = persistJwtSecret(nextSecret);
    rebuildPasskeyController();
  }

  function getTokenFromRequest(req: Request): string | null {
    const cookies = parseCookies(
      req.headers.cookie as string,
    );
    if (cookies[cookieName]) {
      return cookies[cookieName];
    }
    return null;
  }

  function setSessionCookie(
    req: Request,
    res: Response,
    token: string,
    ttlMs: number,
  ): void {
    const secure = isSecureRequest(req);
    const maxAgeSeconds = Math.floor(ttlMs / 1000);
    const header = buildCookie({
      name: cookieName,
      value: encodeURIComponent(token),
      maxAge: maxAgeSeconds,
      secure,
    });
    res.setHeader("Set-Cookie", header);
  }

  function clearSessionCookie(
    req: Request,
    res: Response,
  ): void {
    const secure = isSecureRequest(req);
    const header = buildCookie({
      name: cookieName,
      value: "",
      maxAge: 0,
      secure,
    });
    res.setHeader("Set-Cookie", header);
  }

  function verifyPassword(candidate: string): boolean {
    if (!candidate) {
      return false;
    }
    const normalizedCandidate = normalizePassword(candidate);
    if (!normalizedCandidate) {
      return false;
    }
    try {
      const candidateHash = crypto.scryptSync(
        normalizedCandidate,
        salt,
        64,
      );
      return crypto.timingSafeEqual(
        candidateHash,
        expectedHash,
      );
    } catch {
      return false;
    }
  }

  async function isSessionValid(
    token: string,
  ): Promise<boolean> {
    if (!token) {
      return false;
    }
    try {
      await jwtVerify(token, jwtSecret);
      return true;
    } catch {
      return false;
    }
  }

  async function issueSession(
    req: Request,
    res: Response,
    { trustDevice = false }: { trustDevice?: boolean } = {},
  ): Promise<string> {
    const ttlMs = resolveSessionTtlMs(trustDevice);
    const token = await new SignJWT({ type: "ui-session" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(ttlMs / 1000 + "s")
      .sign(jwtSecret);
    setSessionCookie(req, res, token, ttlMs);
    return token;
  }

  startRateLimitCleanup();

  function respondUnauthorized(req: Request, res: Response): void {
    res.status(401);
    const acceptsJson =
      req.headers.accept?.includes("application/json");
    if (
      acceptsJson ||
      (req as any).path?.startsWith("/api")
    ) {
      res.json({
        error: "UI authentication required",
        locked: true,
        code: "ui_auth_unauthorized",
      } satisfies UiAuthErrorResponse);
    } else {
      res.type("text/plain").send("Authentication required");
    }
  }

  const requireAuth = async (
    req: Request,
    res: Response,
    next: () => void,
  ) => {
    if (req.method === "OPTIONS") {
      return next();
    }
    const token = getTokenFromRequest(req);
    if (await isSessionValid(token as string)) {
      return next();
    }
    clearSessionCookie(req, res);
    return respondUnauthorized(req, res);
  };

  const handleSessionStatus = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const token = getTokenFromRequest(req);
      if (await isSessionValid(token as string)) {
        const response: OwnerSessionResponse = { authenticated: true };
        res.json(response);
        return;
      }
      clearSessionCookie(req, res);
      const response: OwnerSessionResponse = { authenticated: false, locked: true, code: "ui_auth_unauthorized" };
      res.status(401).json(response);
    } catch (error) {
      console.error("[UiAuth] Failed to read session status", error);
      res.status(500).json({ error: "Internal server error", code: "internal_error" } satisfies UiAuthErrorResponse);
    }
  };

  const handleSessionCreate = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const rateLimitResult = await checkRateLimit(req);

      res.setHeader(
      "X-RateLimit-Limit",
      rateLimitResult.limit,
    );
      res.setHeader(
      "X-RateLimit-Remaining",
      rateLimitResult.remaining,
    );
      res.setHeader(
      "X-RateLimit-Reset",
      rateLimitResult.reset,
    );

      if (!rateLimitResult.allowed) {
        res.setHeader(
        UI_AUTH_RETRY_AFTER_HEADER,
        rateLimitResult.retryAfter as number,
      );
        res.status(429).json({
        error:
          "Too many login attempts, please try again later",
        retryAfter: rateLimitResult.retryAfter,
        code: "ui_auth_rate_limited",
      });
        return;
      }

      const request = parsePasswordSessionRequest(req.body);
      const candidate = request.ok ? request.value.password : "";
      const trustDevice = request.ok && request.value.trustDevice === true;
      if (!verifyPassword(candidate)) {
        await recordFailedAttempt(req);
        clearSessionCookie(req, res);
        res
          .status(401)
          .json({ error: "Invalid credentials", code: "ui_auth_unauthorized" } satisfies UiAuthErrorResponse);
        return;
      }

      await clearRateLimit(req);

      await issueSession(req, res, { trustDevice });
      const response: OwnerSessionResponse = { authenticated: true };
      res.json(response);
    } catch (error) {
      console.error("[UiAuth] Failed to create session", error);
      res.status(500).json({ error: "Internal server error", code: "internal_error" } satisfies UiAuthErrorResponse);
    }
  };

  function respondPasskeyError(
    res: Response,
    error: any,
  ): void {
    const statusCode =
      typeof error?.statusCode === "number"
        ? error.statusCode
        : 500;
    if (statusCode === 400) {
      res.status(400).json({ error: "Invalid passkey request", code: "ui_auth_invalid_request" } satisfies UiAuthErrorResponse);
      return;
    }
    if (statusCode === 401) {
      res.status(401).json({ error: "Authentication failed", code: "ui_auth_unauthorized" } satisfies UiAuthErrorResponse);
      return;
    }
    if (statusCode === 403) {
      res.status(403).json({ error: "Request forbidden", code: "ui_auth_forbidden" } satisfies UiAuthErrorResponse);
      return;
    }
    console.error("[UiAuth] Passkey request failed", error);
    res.status(500).json({ error: "Internal server error", code: "internal_error" } satisfies UiAuthErrorResponse);
  }

  const handlePasskeyStatus = (req: Request, res: Response) => {
    try {
      res.json(passkeyController.getStatus(req));
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyRegistrationOptions = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const label =
        typeof req.body?.label === "string"
          ? req.body.label
          : "";
      const options = await passkeyController.beginRegistration(
        req,
        { label },
      );
      res.json(options);
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyRegistrationVerify = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const result =
        await passkeyController.finishRegistration(
          req.body,
        );
      res.json(result);
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyAuthenticationOptions = async (
    req: Request,
    res: Response,
  ) => {
    try {
      const options =
        await passkeyController.beginAuthentication(req);
      res.json(options);
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyAuthenticationVerify = async (
    req: Request,
    res: Response,
  ) => {
    try {
      await passkeyController.finishAuthentication(
        req.body,
      );
      await issueSession(req, res, {
        trustDevice: isTrustedDeviceRequest(
          req.body?.trustDevice,
        ),
      });
      res.json({ authenticated: true });
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyList = (req: Request, res: Response) => {
    try {
      res.json({
        passkeys: passkeyController.listPasskeys(req),
      });
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handlePasskeyRevoke = (
    req: Request,
    res: Response,
  ) => {
    try {
      const result = passkeyController.revokePasskey(
        req,
        req.params?.id as string,
      );
      res.json(result);
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const handleResetAuth = (req: Request, res: Response) => {
    try {
      const passkeyResult =
        passkeyController.clearAllPasskeys();
      rotateJwtSecret();
      clearSessionCookie(req, res);
      res.json({
        cleared: true,
        clearedPasskeys: passkeyResult.clearedCount,
        signedOutEverywhere: true,
      });
    } catch (error) {
      respondPasskeyError(res, error);
    }
  };

  const dispose = () => {
    loginRateLimiter.clear();
    if (rateLimitCleanupTimer) {
      clearInterval(rateLimitCleanupTimer);
      rateLimitCleanupTimer = null;
    }
    passkeyController.dispose();
  };

  return {
    enabled: true,
    requireAuth,
    handleSessionStatus,
    handleSessionCreate,
    handlePasskeyStatus,
    handlePasskeyRegistrationOptions,
    handlePasskeyRegistrationVerify,
    handlePasskeyAuthenticationOptions,
    handlePasskeyAuthenticationVerify,
    handlePasskeyList,
    handlePasskeyRevoke,
    handleResetAuth,
    ensureSessionToken: async (
      req: Request,
      _res: Response,
    ): Promise<string | null> => {
      const token = getTokenFromRequest(req);
      return (await isSessionValid(token as string))
        ? token
        : null;
    },
    dispose,
  };
}
