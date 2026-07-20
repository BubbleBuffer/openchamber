import { afterEach, describe, expect, it, vi } from "vitest";

import { createUiAuth } from "./ui-auth.js";

function createResponse() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    headers: new Map<string, unknown>(),
    status(code: number) { this.statusCode = code; return this; },
    json(value: unknown) { this.body = value; return this; },
    setHeader(name: string, value: unknown) { this.headers.set(name, value); return this; },
    type() { return this; },
    send(value: unknown) { this.body = value; return this; },
  };
}

function createRequest(body: unknown, cookie?: string, ip = "127.0.0.1") {
  return { body, headers: cookie ? { cookie, accept: "application/json" } : { accept: "application/json" }, ip } as never;
}

describe("UI auth session controller", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns coded failures for missing and wrong credentials", async () => {
    vi.stubEnv("OPENCODE_JWT_SECRET", "test-secret");
    const auth = createUiAuth({ password: "correct password", readSettingsFromDiskMigrated: async () => ({}) });

    for (const body of [{}, { password: "wrong password" }]) {
      const response = createResponse();
      await auth.handleSessionCreate(createRequest(body), response as never);
      expect(response.statusCode).toBe(401);
      expect(response.body).toEqual({ error: "Invalid credentials", code: "ui_auth_unauthorized" });
    }
    auth.dispose();
  });

  it("returns coded invalid-request errors for disabled passkey and reset handlers", async () => {
    const auth = createUiAuth({ password: "", readSettingsFromDiskMigrated: async () => ({}) });
    for (const handler of [auth.handlePasskeyRegistrationOptions, auth.handlePasskeyRegistrationVerify, auth.handlePasskeyAuthenticationOptions, auth.handlePasskeyAuthenticationVerify, auth.handlePasskeyRevoke, auth.handleResetAuth]) {
      const response = createResponse();
      await handler(createRequest({}) as never, response as never);
      expect(response.statusCode).toBe(400);
      expect(response.body).toEqual({ error: "UI password not configured", code: "ui_auth_invalid_request" });
    }
  });

  it("accepts a valid owner session and rejects its expired session", async () => {
    vi.stubEnv("OPENCODE_JWT_SECRET", "test-secret");
    const validAuth = createUiAuth({ password: "correct password", readSettingsFromDiskMigrated: async () => ({}) });
    const loginResponse = createResponse();
    await validAuth.handleSessionCreate(createRequest({ password: "correct password", trustDevice: true }, undefined, "127.0.0.2"), loginResponse as never);
    const cookie = loginResponse.headers.get("Set-Cookie") as string;
    expect(loginResponse.body).toEqual({ authenticated: true });

    const statusResponse = createResponse();
    await validAuth.handleSessionStatus(createRequest(undefined, cookie) as never, statusResponse as never);
    expect(statusResponse.body).toEqual({ authenticated: true });
    validAuth.dispose();

    const expiredAuth = createUiAuth({ password: "correct password", sessionTtlMs: -1_000, readSettingsFromDiskMigrated: async () => ({}) });
    const expiredLogin = createResponse();
    await expiredAuth.handleSessionCreate(createRequest({ password: "correct password" }, undefined, "127.0.0.3"), expiredLogin as never);
    const expiredStatus = createResponse();
    await expiredAuth.handleSessionStatus(createRequest(undefined, expiredLogin.headers.get("Set-Cookie") as string) as never, expiredStatus as never);
    expect(expiredStatus.statusCode).toBe(401);
    expect(expiredStatus.body).toEqual({ authenticated: false, locked: true, code: "ui_auth_unauthorized" });
    expiredAuth.dispose();
  });

  it("logs an unexpected status failure without returning its detail", async () => {
    vi.stubEnv("OPENCODE_JWT_SECRET", "test-secret");
    const auth = createUiAuth({ password: "correct password", readSettingsFromDiskMigrated: async () => ({}) });
    const response = createResponse();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const request = {
      get headers() { throw new Error("private token detail"); },
    } as never;

    await auth.handleSessionStatus(request, response as never);

    expect(log).toHaveBeenCalled();
    expect(response.statusCode).toBe(500);
    expect(response.body).toEqual({ error: "Internal server error", code: "internal_error" });
    auth.dispose();
  });

  it("sets Retry-After with its coded rate-limit response", async () => {
    vi.stubEnv("OPENCODE_JWT_SECRET", "test-secret");
    const auth = createUiAuth({ password: "correct password", readSettingsFromDiskMigrated: async () => ({}) });
    const request = createRequest({ password: "wrong password" }, undefined, "127.0.0.4");
    for (let attempt = 0; attempt <= 10; attempt += 1) {
      const response = createResponse();
      await auth.handleSessionCreate(request, response as never);
      if (attempt === 10) {
        expect(response.statusCode).toBe(429);
        expect(response.headers.get("Retry-After")).toEqual(expect.any(Number));
        expect(response.body).toMatchObject({ code: "ui_auth_rate_limited" });
      }
    }
    auth.dispose();
  });
});
