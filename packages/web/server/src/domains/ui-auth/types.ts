import type { Request, Response } from "express";

export interface UiAuthDeps {
  password?: string | null;
  cookieName?: string;
  sessionTtlMs?: number;
  readSettingsFromDiskMigrated: () => Promise<object>;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  locked?: boolean;
  limit: number;
  remaining: number;
  reset: number;
}

export interface PasskeyStatus {
  enabled: boolean;
  hasPasskeys: boolean;
  passkeyCount: number;
  rpID: string | null;
}

export interface PasskeyRevokeResult {
  revoked: boolean;
  passkeyCount: number;
}

export interface PasskeyClearResult {
  cleared: boolean;
  clearedCount: number;
}

export interface SessionStatusResponse {
  authenticated: boolean;
  disabled?: boolean;
  locked?: boolean;
}

export interface SessionCreateResponse {
  authenticated: boolean;
  error?: string;
}

export interface ResetAuthResponse {
  cleared: boolean;
  clearedPasskeys: number;
  signedOutEverywhere: boolean;
}

export interface UiAuthController {
  enabled: boolean;
  requireAuth: (req: Request, res: Response, next: () => void) => Promise<void>;
  handleSessionStatus: (req: Request, res: Response) => Promise<void>;
  handleSessionCreate: (req: Request, res: Response) => Promise<void>;
  handlePasskeyStatus: (req: Request, res: Response) => void;
  handlePasskeyRegistrationOptions: (req: Request, res: Response) => Promise<void>;
  handlePasskeyRegistrationVerify: (req: Request, res: Response) => Promise<void>;
  handlePasskeyAuthenticationOptions: (req: Request, res: Response) => Promise<void>;
  handlePasskeyAuthenticationVerify: (req: Request, res: Response) => Promise<void>;
  handlePasskeyList: (req: Request, res: Response) => void;
  handlePasskeyRevoke: (req: Request, res: Response) => void;
  handleResetAuth: (req: Request, res: Response) => void;
  ensureSessionToken: (req: Request, res: Response) => Promise<string | null>;
  dispose: () => void;
}

export interface StoredPasskey {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  createdAt: number;
  lastUsedAt: number | null;
  label: string;
  rpID: string;
}

export interface PasskeyStore {
  version: number;
  userID: string;
  passwordBinding: string;
  passkeys: StoredPasskey[];
}

export interface ChallengeRecord {
  challenge: string;
  expectedOrigins: string[];
  expectedRPIDs: string[];
  rpID?: string;
  label?: string;
  createdAt: number;
  expiresAt: number;
}

export interface PasskeyControllerDeps {
  passwordBinding?: string;
  readSettingsFromDiskMigrated?: () => Promise<object>;
  storeFile?: string;
  rpName?: string;
  challengeTtlMs?: number;
}

export interface PasskeyController {
  enabled: boolean;
  getStatus(req: Request): PasskeyStatus;
  listPasskeys(req: Request): Array<{
    id: string;
    label: string;
    createdAt: number;
    lastUsedAt: number | null;
    deviceType: string;
    backedUp: boolean;
  }>;
  revokePasskey(req: Request, passkeyId: string): PasskeyRevokeResult;
  clearAllPasskeys(): PasskeyClearResult;
  beginRegistration(req: Request, opts?: { label?: string }): Promise<{
    requestId: string;
    optionsJSON: unknown;
  }>;
  finishRegistration(payload: unknown): Promise<{
    verified: boolean;
    passkeyCount: number;
  }>;
  beginAuthentication(req: Request): Promise<{
    requestId: string;
    optionsJSON: unknown;
  }>;
  finishAuthentication(payload: unknown): Promise<{ verified: boolean }>;
  dispose(): void;
  isLocalRpId(rpID: string): boolean;
}

export interface RateLimitRecord {
  count: number;
  lastAttempt: number;
  lockedUntil?: number;
}
