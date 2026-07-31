import { parsePendingMcpAuthResponse } from '@contracts/opencode';
import {
  MCP_OAUTH_CALLBACK_PATH,
  parseMcpOAuthCallbackContext,
  parseMcpOAuthCallbackStateKey,
} from './mcpOAuth';

export interface McpAuthorizationResponse {
  code: string | null;
  context: { name: string; directory: string | null } | null;
  stateKey: string | null;
}

export function extractAuthorizationResponse(raw: string): McpAuthorizationResponse {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { code: null, context: null, stateKey: null };
  }

  try {
    const parsed = new URL(trimmed);
    const code = parsed.searchParams.get('code');
    if (typeof code === 'string' && code.trim()) {
      return {
        code: code.trim(),
        context: parseMcpOAuthCallbackContext(parsed.searchParams),
        stateKey: parseMcpOAuthCallbackStateKey(parsed.searchParams),
      };
    }
  } catch {
    // Fall through to treating the pasted value as a raw authorization code.
  }

  return {
    code: trimmed,
    context: null,
    stateKey: null,
  };
}

export function getStatusDescription(status: string | undefined, error?: string): string {
  switch (status) {
    case 'connected':
      return 'Connected and ready for OpenCode to discover tools and resources.';
    case 'failed':
      return error?.trim() || 'OpenCode could not reach this MCP server.';
    case 'needs_auth':
      return 'This remote MCP server requires authorization before it can connect.';
    case 'needs_client_registration':
      return error?.trim()
        || 'This remote MCP server requires client registration before authorization can complete.';
    case 'disabled':
      return 'This MCP server is disabled in configuration.';
    default:
      return 'Refresh or test the connection to load live runtime status.';
  }
}

export function statusCardClass(status: string | undefined): string {
  switch (status) {
    case 'failed':
      return 'border-[var(--status-error-border)] bg-[var(--status-error-background)]';
    case 'needs_auth':
    case 'needs_client_registration':
      return 'border-[var(--status-warning-border)] bg-[var(--status-warning-background)]';
    default:
      return 'border-[var(--interactive-border)] bg-[var(--surface-elevated)]';
  }
}

export function shouldShowFullStatusCard(
  status: string | undefined,
  authUrl: string | null,
  needsAuthorization: boolean,
  isAuthPolling: boolean,
): boolean {
  return status === 'failed'
    || status === 'needs_auth'
    || status === 'needs_client_registration'
    || Boolean(authUrl)
    || needsAuthorization
    || isAuthPolling;
}

export function buildMcpOAuthRedirectUri(
  name?: string | null,
  directory?: string | null,
): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const url = new URL(MCP_OAUTH_CALLBACK_PATH, window.location.origin);
  if (typeof name === 'string' && name.trim()) {
    url.searchParams.set('server', name.trim());
  }
  if (typeof directory === 'string' && directory.trim()) {
    url.searchParams.set('directory', directory.trim());
  }
  return url.toString();
}

export async function queuePendingMcpAuthContext(input: {
  state: string;
  name: string;
  directory?: string | null;
}): Promise<void> {
  const response = await fetch('/api/mcp/auth/pending', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      state: input.state,
      name: input.name,
      directory: typeof input.directory === 'string' && input.directory.trim()
        ? input.directory.trim()
        : null,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || 'Failed to prepare MCP authorization callback');
  }
}

export async function getPendingMcpAuthContext(
  stateKey: string,
): Promise<{ name: string; directory: string | null } | null> {
  const response = await fetch(`/api/mcp/auth/pending?state=${encodeURIComponent(stateKey)}`);
  if (!response.ok) {
    return null;
  }

  const parsed = parsePendingMcpAuthResponse(await response.json().catch(() => null));
  if (!parsed.ok || !parsed.value || !('name' in parsed.value) || !parsed.value.name) {
    return null;
  }

  return {
    name: parsed.value.name,
    directory: parsed.value.directory ?? null,
  };
}

export async function clearPendingMcpAuthContext(
  stateKey: string | null | undefined,
): Promise<void> {
  if (typeof stateKey !== 'string' || !stateKey.trim()) {
    return;
  }

  await fetch(
    `/api/mcp/auth/pending?state=${encodeURIComponent(stateKey.trim())}`,
    { method: 'DELETE' },
  ).catch(() => undefined);
}

export function normalizeMcpAuthErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  if (/oauth state required/i.test(message)) {
    return 'Authorization session expired or was cleared during reload. Click Authorize again.';
  }
  return message;
}

export function buildMcpRuntimeActionKey(
  name: string | null,
  directory?: string | null,
): string {
  const normalizedDirectory = typeof directory === 'string' && directory.trim()
    ? directory.trim()
    : '__global__';
  return `${name ?? '__none__'}::${normalizedDirectory}`;
}
