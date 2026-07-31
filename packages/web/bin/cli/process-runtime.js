import fs from 'fs';
import net from 'net';
import { spawnSync } from 'child_process';

function normalizeIdentity(value) {
  if (!value) return null;
  if (typeof value === 'string') return { fingerprint: value };
  if (typeof value !== 'object' || typeof value.fingerprint !== 'string' || !value.fingerprint) return null;
  return { ...value, fingerprint: value.fingerprint };
}

function defaultHost(env = process.env) {
  const configured = typeof env?.OPENCHAMBER_HOST === 'string' ? env.OPENCHAMBER_HOST.trim() : '';
  if (!configured || configured === '0.0.0.0') return '127.0.0.1';
  if (configured === '::' || configured === '[::]') return '::1';
  return configured.startsWith('[') && configured.endsWith(']') ? configured.slice(1, -1) : configured;
}

function formatHost(host) {
  return typeof host === 'string' && host.includes(':') ? `[${host}]` : (host || '127.0.0.1');
}

function createDefaultIdentityProbe({ fsLike, spawnSyncLike, platform }) {
  return (pid) => {
    if (!Number.isFinite(pid) || pid <= 0) return null;
    try {
      if (platform === 'linux') {
        const stat = fsLike.readFileSync(`/proc/${pid}/stat`, 'utf8');
        const closingParen = stat.lastIndexOf(')');
        if (closingParen < 0) return null;
        const fields = stat.slice(closingParen + 2).trim().split(/\s+/);
        // The first value after the comm field is field 3; starttime is field 22.
        const startTime = fields[19];
        return startTime ? { fingerprint: `linux:starttime:${startTime}`, startTime } : null;
      }
      if (platform === 'darwin') {
        const result = spawnSyncLike('ps', ['-p', String(pid), '-o', 'lstart='], { encoding: 'utf8' });
        const start = String(result?.stdout || '').trim();
        return result?.status === 0 && start ? { fingerprint: `darwin:lstart:${start}`, startTime: start } : null;
      }
      if (platform === 'win32') {
        const command = '(Get-Process -Id ' + String(pid) + ').StartTime.ToUniversalTime().Ticks';
        const result = spawnSyncLike('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8', windowsHide: true });
        const start = String(result?.stdout || '').trim();
        return result?.status === 0 && start ? { fingerprint: `windows:creation:${start}`, startTime: start } : null;
      }
    } catch {
      return null;
    }
    return null;
  };
}

function createProcessRuntime({
  processLike = process,
  fsLike,
  netLike = net,
  fetchImpl = globalThis.fetch,
  spawnSyncLike = spawnSync,
  identityProbe,
  isProcessRunning: processRunningProbe,
  timers = { setTimeout, clearTimeout },
  clock = () => Date.now(),
  env = process.env,
  platform = processLike.platform || process.platform,
  AbortControllerLike = globalThis.AbortController,
} = {}) {
  const filesystem = fsLike || fs;
  const probe = identityProbe || createDefaultIdentityProbe({ fsLike: filesystem, spawnSyncLike, platform });

  function getProcessIdentity(pid) {
    try {
      return normalizeIdentity(probe(pid));
    } catch {
      return null;
    }
  }

  function isProcessRunning(pid) {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    if (typeof processRunningProbe === 'function') {
      try { return processRunningProbe(pid) === true; } catch { return false; }
    }
    try {
      if (typeof processLike.kill === 'function') {
        processLike.kill(pid, 0);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function waitForProcessExit(pid, timeoutMs = 2500) {
    if (!Number.isFinite(pid) || pid <= 0) return Promise.resolve(true);
    const duration = Number.isFinite(timeoutMs) && timeoutMs >= 0 ? Math.trunc(timeoutMs) : 2500;
    const deadline = clock() + duration;
    return new Promise((resolve) => {
      const check = () => {
        if (!isProcessRunning(pid)) return resolve(true);
        if (clock() >= deadline) return resolve(false);
        timers.setTimeout(check, 150);
      };
      check();
    });
  }

  function expectedFingerprint(record) {
    return typeof record?.identityFingerprint === 'string' && record.identityFingerprint
      ? record.identityFingerprint
      : (typeof record?.processIdentityFingerprint === 'string' ? record.processIdentityFingerprint : null);
  }

  function verifyIdentity(record) {
    const expected = expectedFingerprint(record);
    if (!expected) return { verified: false, reason: 'identity-unverified' };
    const current = getProcessIdentity(record.pid);
    if (!current) return { verified: false, reason: 'identity-unverified' };
    if (current.fingerprint !== expected) return { verified: false, reason: 'stale-record' };
    return { verified: true, identity: current };
  }

  async function terminateProcessTree(recordOrPid, options = {}) {
    const record = typeof recordOrPid === 'object'
      ? recordOrPid
      : {
          pid: recordOrPid,
          identityFingerprint: options.identityFingerprint || options.processIdentityFingerprint,
        };
    const pid = record.pid;
    if (!Number.isFinite(pid) || pid <= 0) return { stopped: true, signalSent: false };
    const gracefulTimeoutMs = Number.isFinite(options.gracefulTimeoutMs) && options.gracefulTimeoutMs >= 0 ? Math.trunc(options.gracefulTimeoutMs) : 2500;
    const forceTimeoutMs = Number.isFinite(options.forceTimeoutMs) && options.forceTimeoutMs >= 0 ? Math.trunc(options.forceTimeoutMs) : 3000;
    const beforeGraceful = verifyIdentity(record);
    if (!beforeGraceful.verified) return { stopped: false, reason: beforeGraceful.reason, signalSent: false };

    const signal = (value) => {
      const current = verifyIdentity(record);
      if (!current.verified) return current;
      try {
        processLike.kill(pid, value);
      } catch {
        // The process may have exited between the identity check and signal.
      }
      return { verified: true };
    };

    if (platform === 'win32') {
      const graceful = signal(undefined);
      if (!graceful.verified) return { stopped: false, reason: graceful.reason, signalSent: false };
      if (await waitForProcessExit(pid, 800)) return { stopped: true, signalSent: true };
      const treeCheck = verifyIdentity(record);
      if (!treeCheck.verified) return { stopped: false, reason: treeCheck.reason, signalSent: true };
      try { spawnSyncLike('taskkill', ['/pid', String(pid), '/t'], { stdio: 'ignore', windowsHide: true }); } catch {}
      if (await waitForProcessExit(pid, gracefulTimeoutMs)) return { stopped: true, signalSent: true };
      const forceCheck = verifyIdentity(record);
      if (!forceCheck.verified) return { stopped: false, reason: forceCheck.reason, signalSent: true };
      try { spawnSyncLike('taskkill', ['/pid', String(pid), '/f', '/t'], { stdio: 'ignore', windowsHide: true }); } catch {}
      return { stopped: await waitForProcessExit(pid, forceTimeoutMs), signalSent: true };
    }

    const graceful = signal('SIGTERM');
    if (!graceful.verified) return { stopped: false, reason: graceful.reason, signalSent: false };
    if (await waitForProcessExit(pid, gracefulTimeoutMs)) return { stopped: true, signalSent: true };
    const forceCheck = verifyIdentity(record);
    if (!forceCheck.verified) return { stopped: false, reason: forceCheck.reason, signalSent: true };
    const forced = signal('SIGKILL');
    if (!forced.verified) return { stopped: false, reason: forced.reason, signalSent: true };
    return { stopped: await waitForProcessExit(pid, forceTimeoutMs), signalSent: true };
  }

  async function stopInstanceProcess(recordOrPid, options = {}) {
    const record = typeof recordOrPid === 'object'
      ? recordOrPid
      : {
          pid: recordOrPid,
          identityFingerprint: options.identityFingerprint || options.processIdentityFingerprint,
        };
    const shutdownWaitMs = Number.isFinite(options.shutdownWaitMs) && options.shutdownWaitMs >= 0 ? Math.trunc(options.shutdownWaitMs) : 5000;
    if (!(await waitForProcessExit(record.pid, shutdownWaitMs))) return terminateProcessTree(record, options);
    return { stopped: true, signalSent: false };
  }

  function buildLocalUrl(port, endpoint = '') {
    const pathPart = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `http://${formatHost(optionsHost(optionsFromEnv(env)))}:${port}${pathPart}`;
  }

  async function requestServerShutdown(port, timeoutMs = 1500) {
    if (!Number.isFinite(port) || port <= 0 || typeof fetchImpl !== 'function') return false;
    const controller = new AbortControllerLike();
    const timeout = timers.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(buildLocalUrl(port, '/api/system/shutdown'), { method: 'POST', signal: controller.signal });
      return response.ok;
    } catch { return false; } finally { timers.clearTimeout(timeout); }
  }

  async function requestJson(port, endpoint, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) && options.timeoutMs > 0 ? Math.trunc(options.timeoutMs) : 4000;
    const controller = new AbortControllerLike();
    const timeout = timers.setTimeout(() => controller.abort(), timeoutMs);
    const fetchOptions = { ...options };
    delete fetchOptions.timeoutMs;
    try {
      const response = await fetchImpl(buildLocalUrl(port, endpoint), {
        ...fetchOptions,
        headers: { Accept: 'application/json', ...(fetchOptions.body ? { 'Content-Type': 'application/json' } : {}), ...(fetchOptions.headers || {}) },
        signal: controller.signal,
      });
      const body = await response.json().catch(() => null);
      return { response, body };
    } catch (error) {
      if (error?.name === 'AbortError' || error?.code === 'ABORT_ERR') throw new Error(`Request to ${endpoint} timed out after ${timeoutMs}ms.`);
      throw error;
    } finally { timers.clearTimeout(timeout); }
  }

  async function isServerHealthReady(port, timeoutMs = 1000) {
    if (!Number.isFinite(port) || port <= 0 || typeof fetchImpl !== 'function') return false;
    const controller = new AbortControllerLike();
    const timeout = timers.setTimeout(() => controller.abort(), timeoutMs);
    try { return (await fetchImpl(buildLocalUrl(port, '/health'), { headers: { Accept: 'text/plain' }, signal: controller.signal })).ok; }
    catch { return false; } finally { timers.clearTimeout(timeout); }
  }

  async function waitForServerHealth(port, { timeoutMs = 60000, intervalMs = 250, onTick } = {}) {
    const start = clock();
    const deadline = start + timeoutMs;
    while (clock() < deadline) {
      const elapsedMs = clock() - start;
      onTick?.({ elapsedMs, timeoutMs });
      if (await isServerHealthReady(port, Math.min(1000, intervalMs * 2))) { onTick?.({ elapsedMs: Math.min(clock() - start, timeoutMs), timeoutMs, complete: true }); return true; }
      await new Promise((resolve) => timers.setTimeout(resolve, intervalMs));
    }
    onTick?.({ elapsedMs: timeoutMs, timeoutMs, timedOut: true });
    return false;
  }

  async function isPortAvailable(port, host) {
    if (!Number.isFinite(port) || port <= 0) return false;
    return new Promise((resolve) => {
      const server = netLike.createServer();
      server.unref?.();
      server.on('error', () => resolve(false));
      server.listen({ port, host }, () => server.close(() => resolve(true)));
    });
  }

  async function fetchSystemInfoFromPort(port) {
    if (!Number.isFinite(port) || port <= 0 || typeof fetchImpl !== 'function') return null;
    const controller = new AbortControllerLike();
    const timeout = timers.setTimeout(() => controller.abort(), 1500);
    try {
      const response = await fetchImpl(buildLocalUrl(port, '/api/system/info'), { headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) return null;
      const body = await response.json().catch(() => null);
      return body && typeof body.runtime === 'string' ? { runtime: body.runtime, pid: Number.isFinite(body.pid) ? body.pid : null } : null;
    } catch { return null; } finally { timers.clearTimeout(timeout); }
  }

  async function resolveAvailablePort(desiredPort, explicitPort = false, onNotice) {
    const startPort = Number.isFinite(desiredPort) ? Math.trunc(desiredPort) : 3000;
    if (explicitPort || await isPortAvailable(startPort)) return startPort;
    const message = `Port ${startPort} in use; using a free port`;
    onNotice?.({ level: 'warning', code: 'PORT_REASSIGNED', message });
    return 0;
  }

  return {
    buildLocalUrl,
    getProcessIdentity,
    getProcessIdentityFingerprint: (pid) => getProcessIdentity(pid)?.fingerprint || null,
    isProcessRunning,
    waitForProcessExit,
    verifyIdentity,
    terminateProcessTree,
    stopInstanceProcess,
    requestServerShutdown,
    requestJson,
    isServerHealthReady,
    waitForServerHealth,
    isPortAvailable,
    fetchSystemInfoFromPort,
    resolveAvailablePort,
  };
}

function optionsFromEnv(env) { return env || process.env; }
function optionsHost(env) { return defaultHost(env); }

export { createProcessRuntime };
