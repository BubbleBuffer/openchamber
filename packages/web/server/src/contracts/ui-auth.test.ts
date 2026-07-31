import { describe, expect, it } from "vitest";
import {
  parsePasskeyAuthenticationVerifyRequest,
  parsePasskeyListResponse,
  parsePasskeyOptionsResponse,
  parsePasskeyRegistrationOptionsRequest,
  parsePasskeyRevokeRequest,
  parsePasskeyStatusResponse,
  parseOwnerSessionResponse,
  parsePasswordSessionRequest,
} from "./ui-auth.js";

describe("ui auth contract", () => {
  it("validates owner session bodies and authorization responses", () => {
    expect(parsePasswordSessionRequest({ password: "secret", trustDevice: true })).toEqual({ ok: true, value: { password: "secret", trustDevice: true } });
    expect(parsePasswordSessionRequest({ password: ["secret"] }).ok).toBe(false);
    expect(parsePasswordSessionRequest({ password: "secret", trustDevice: "true" }).ok).toBe(false);
    expect(parseOwnerSessionResponse({ authenticated: false, locked: true })).toEqual({ ok: true, value: { authenticated: false, locked: true } });
    expect(parseOwnerSessionResponse({ authenticated: "false" }).ok).toBe(false);
  });

  it("validates opaque passkey wrappers without defining WebAuthn payloads", () => {
    expect(parsePasskeyRegistrationOptionsRequest({ label: "Laptop" })).toEqual({ ok: true, value: { label: "Laptop" } });
    expect(parsePasskeyRegistrationOptionsRequest({ label: 3 }).ok).toBe(false);
    expect(parsePasskeyAuthenticationVerifyRequest({ requestId: "challenge", response: { id: "opaque" }, trustDevice: true })).toEqual({ ok: true, value: { requestId: "challenge", response: { id: "opaque" }, trustDevice: true } });
    expect(parsePasskeyAuthenticationVerifyRequest({ requestId: "challenge", trustDevice: true }).ok).toBe(false);
    expect(parsePasskeyRevokeRequest({ id: "passkey-id" }).ok).toBe(true);
    expect(parsePasskeyRevokeRequest({ id: " " }).ok).toBe(false);
    expect(parsePasskeyOptionsResponse({ requestId: "challenge", optionsJSON: { publicKey: "opaque" } }).ok).toBe(true);
    expect(parsePasskeyOptionsResponse({ requestId: "challenge" }).ok).toBe(false);
    expect(parsePasskeyOptionsResponse({ requestId: "challenge", optionsJSON: null }).ok).toBe(false);
    expect(parsePasskeyStatusResponse({ enabled: true, hasPasskeys: true, passkeyCount: 1, rpID: "localhost" }).ok).toBe(true);
    expect(parsePasskeyStatusResponse({ enabled: true, hasPasskeys: true, passkeyCount: -1, rpID: "localhost" }).ok).toBe(false);
    expect(parsePasskeyListResponse({ passkeys: [{ id: "id", label: "Laptop", createdAt: 1, lastUsedAt: null, deviceType: "singleDevice", backedUp: false }] }).ok).toBe(true);
    expect(parsePasskeyListResponse({ passkeys: [{ id: "id" }] }).ok).toBe(false);
  });
});
