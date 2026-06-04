import type { StartDeviceFlowParams, StartDeviceFlowResult } from "./types.js";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function encodeForm(params: Record<string, string | undefined | null>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    body.set(key, String(value));
  }
  return body.toString();
}

async function postForm(url: string, params: Record<string, string | undefined | null>): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: encodeForm(params),
  });

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = (payload as any)?.error_description || (payload as any)?.error || response.statusText;
    const error: any = new Error(message || "GitHub request failed");
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload ?? {};
}

export async function startDeviceFlow({ clientId, scope }: StartDeviceFlowParams): Promise<StartDeviceFlowResult> {
  return postForm(DEVICE_CODE_URL, {
    client_id: clientId,
    scope,
  }) as unknown as Promise<StartDeviceFlowResult>;
}

export async function exchangeDeviceCode({ clientId, deviceCode }: { clientId: string; deviceCode: string }): Promise<Record<string, unknown>> {
  return postForm(ACCESS_TOKEN_URL, {
    client_id: clientId,
    device_code: deviceCode,
    grant_type: DEVICE_GRANT_TYPE,
  });
}
