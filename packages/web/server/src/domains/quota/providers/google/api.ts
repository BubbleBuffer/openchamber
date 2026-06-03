const GOOGLE_PRIMARY_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const GOOGLE_ENDPOINTS = [
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
  "https://autopush-cloudcode-pa.sandbox.googleapis.com",
  GOOGLE_PRIMARY_ENDPOINT,
];

const GOOGLE_HEADERS: Record<string, string> = {
  "User-Agent": "antigravity/1.11.5 windows/amd64",
  "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
  "Client-Metadata":
    '{"ideType":"IDE_UNSPECIFIED","platform":"PLATFORM_UNSPECIFIED","pluginType":"GEMINI"}',
};

export async function refreshGoogleAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as Record<string, unknown>;
  return typeof data?.access_token === "string" ? data.access_token : null;
}

export async function fetchGoogleQuotaBuckets(
  accessToken: string,
  projectId?: string
): Promise<Record<string, unknown> | null> {
  const body = projectId ? { project: projectId } : {};

  try {
    const response = await fetch(`${GOOGLE_PRIMARY_ENDPOINT}/v1internal:retrieveUserQuota`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function fetchGoogleModels(
  accessToken: string,
  projectId?: string
): Promise<Record<string, unknown> | null> {
  const body = projectId ? { project: projectId } : {};

  for (const endpoint of GOOGLE_ENDPOINTS) {
    try {
      const response = await fetch(`${endpoint}/v1internal:fetchAvailableModels`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...GOOGLE_HEADERS,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        return (await response.json()) as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }

  return null;
}