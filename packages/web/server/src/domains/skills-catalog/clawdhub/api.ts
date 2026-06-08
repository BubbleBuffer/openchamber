/**
 * ClawdHub API client
 *
 * ClawdHub is a public skill registry at https://clawdhub.com
 * This client provides methods to fetch skills list and download skill packages.
 */

const CLAWDHUB_API_BASE = "https://clawdhub.com/api/v1";
const CLAWDHUB_PAGE_LIMIT = 25;

// Rate limiting: ClawdHub allows 120 requests/minute
const RATE_LIMIT_DELAY_MS = 100;
let lastRequestTime = 0;

async function rateLimitedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const maxAttempts = 10;

  let lastResponse: Response | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const now = Date.now();
    const elapsed = now - lastRequestTime;
    if (elapsed < RATE_LIMIT_DELAY_MS) {
      await new Promise((resolve) =>
        setTimeout(resolve, RATE_LIMIT_DELAY_MS - elapsed)
      );
    }
    lastRequestTime = Date.now();

    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        "User-Agent": "OpenChamber/1.0",
        ...options.headers,
      },
    });

    lastResponse = response;

    if (response.status === 429 || response.status >= 500) {
      if (attempt < maxAttempts - 1) {
        const waitMs = 50 * (attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
    }

    return response;
  }

  return lastResponse!;
}

/**
 * Fetch paginated list of skills from ClawdHub
 */
export async function fetchClawdHubSkills({
  cursor,
}: {
  cursor?: string;
} = {}): Promise<{ items: unknown[]; nextCursor: string | null }> {
  const url = cursor
    ? `${CLAWDHUB_API_BASE}/skills?cursor=${encodeURIComponent(cursor)}&limit=${CLAWDHUB_PAGE_LIMIT}`
    : `${CLAWDHUB_API_BASE}/skills?limit=${CLAWDHUB_PAGE_LIMIT}`;

  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ClawdHub API error (${response.status}): ${text || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    nextCursor?: string;
    next_cursor?: string;
    next?: string;
    cursor?: string;
    items?: unknown[];
  };
  const nextCursor =
    (typeof data.nextCursor === "string" && data.nextCursor) ||
    (typeof data.next_cursor === "string" && data.next_cursor) ||
    (typeof data.next === "string" && data.next) ||
    (typeof data.cursor === "string" && data.cursor) ||
    null;

  return {
    items: data.items || [],
    nextCursor,
  };
}

/**
 * Fetch details for a specific skill version
 */
export async function fetchClawdHubSkillVersion(
  slug: string,
  version = "latest"
): Promise<unknown> {
  // For 'latest', we need to first get the skill metadata to find the latest version
  if (version === "latest") {
    const skillResponse = await rateLimitedFetch(
      `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(slug)}`
    );
    if (!skillResponse.ok) {
      throw new Error(`ClawdHub skill not found: ${slug}`);
    }
    const skillData = (await skillResponse.json()) as {
      skill?: { tags?: { latest?: string } };
      latestVersion?: { version?: string };
    };
    const latestVersion =
      skillData.skill?.tags?.latest || skillData.latestVersion?.version;
    if (!latestVersion) {
      throw new Error(`No latest version found for skill: ${slug}`);
    }
    version = latestVersion;
  }

  const url = `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(
    slug
  )}/versions/${encodeURIComponent(version)}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ClawdHub version error (${response.status}): ${text || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Download a skill package as a ZIP buffer
 */
export async function downloadClawdHubSkill(
  slug: string,
  version: string
): Promise<ArrayBuffer> {
  const versionParam =
    typeof version === "string" && version !== "latest"
      ? `&version=${encodeURIComponent(version)}`
      : "&tag=latest";
  const url = `${CLAWDHUB_API_BASE}/download?slug=${encodeURIComponent(
    slug
  )}${versionParam}`;

  const response = await rateLimitedFetch(url, {
    headers: {
      Accept: "application/zip",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ClawdHub download error (${response.status}): ${text || response.statusText}`
    );
  }

  return response.arrayBuffer();
}

/**
 * Get skill metadata without version details
 */
export async function fetchClawdHubSkillInfo(slug: string): Promise<unknown> {
  const url = `${CLAWDHUB_API_BASE}/skills/${encodeURIComponent(slug)}`;
  const response = await rateLimitedFetch(url);

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(
      `ClawdHub skill error (${response.status}): ${text || response.statusText}`
    );
  }

  return response.json();
}
