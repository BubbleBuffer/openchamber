import { parseUpdateCheckResult } from "@contracts/system";

export async function waitForUpdateApplied(
  previousVersion?: string,
  maxAttempts = 300,
  intervalMs = 2000,
  isServerReachable?: () => Promise<boolean>,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch('/api/openchamber/update-check', { method: 'GET', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const parsed = parseUpdateCheckResult(await response.json().catch(() => null));
        if (parsed.ok && (parsed.value.available === false || (typeof parsed.value.currentVersion === 'string' && typeof previousVersion === 'string' && parsed.value.currentVersion !== previousVersion))) return true;
      } else if ((response.status === 401 || response.status === 403) && await isServerReachable?.()) {
        return true;
      }
    } catch { /* Server may be restarting */ }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  return false;
}
