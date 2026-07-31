import fs from 'fs';
import path from 'path';

import { createPaths } from './paths.js';
import { createProcessRuntime } from './process-runtime.js';

function identityFingerprint(value) {
  if (typeof value === 'string') return value;
  return typeof value?.fingerprint === 'string' ? value.fingerprint : null;
}

function createInstanceStore({ paths = createPaths(), fsLike = fs, processRuntime = createProcessRuntime({ fsLike }), clock = () => Date.now() } = {}) {
  const ensureRunDir = () => fsLike.mkdirSync(paths.getRunDir(), { recursive: true, mode: 0o700 });
  const resolvePidPath = (value) => typeof value === 'number' ? paths.getPidFilePath(value) : value;
  const resolveInstancePath = (value) => typeof value === 'number' ? paths.getInstanceFilePath(value) : value;

  function readPidFile(fileOrPort) {
    try {
      const content = fsLike.readFileSync(resolvePidPath(fileOrPort), 'utf8').trim();
      const pid = Number.parseInt(content, 10);
      return Number.isFinite(pid) && pid > 0 ? pid : null;
    } catch { return null; }
  }

  function writePidFile(fileOrPort, pid, onNotice) {
    try { ensureRunDir(); fsLike.writeFileSync(resolvePidPath(fileOrPort), String(pid), { mode: 0o600 }); }
    catch (error) { onNotice?.({ level: 'warning', code: 'PID_FILE_WRITE_FAILED', message: `Could not write PID file: ${error.message}` }); }
  }

  function removePidFile(fileOrPort) {
    try { fsLike.unlinkSync(resolvePidPath(fileOrPort)); } catch {}
  }

  function readInstanceRecord(fileOrPort) {
    try {
      const parsed = JSON.parse(fsLike.readFileSync(resolveInstancePath(fileOrPort), 'utf8'));
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch { return null; }
  }

  function writeInstanceRecord(fileOrPort, options = {}, onNotice) {
    const port = typeof fileOrPort === 'number' ? fileOrPort : options.port;
    const pid = Number.isFinite(options.pid) ? options.pid : readPidFile(port);
    let captured = identityFingerprint(options.identityFingerprint);
    if (!captured) {
      try { captured = identityFingerprint(processRuntime.getProcessIdentity?.(pid)); } catch { captured = null; }
    }
    const record = {
      port,
      pid,
      host: typeof options.host === 'string' && options.host.length > 0 ? options.host : undefined,
      launchMode: options.launchMode === 'foreground' ? 'foreground' : 'daemon',
      uiPassword: typeof options.uiPassword === 'string' ? options.uiPassword : undefined,
      hasUiPassword: typeof options.uiPassword === 'string',
      startedAt: Number.isFinite(options.startedAt) ? options.startedAt : clock(),
      identityFingerprint: captured || undefined,
      processIdentityFingerprint: captured || undefined,
    };
    try { ensureRunDir(); fsLike.writeFileSync(resolveInstancePath(fileOrPort), JSON.stringify(record, null, 2), { mode: 0o600 }); }
    catch (error) { onNotice?.({ level: 'warning', code: 'INSTANCE_FILE_WRITE_FAILED', message: `Could not write instance file: ${error.message}` }); }
    return record;
  }

  function removeInstanceFile(fileOrPort) {
    try { fsLike.unlinkSync(resolveInstancePath(fileOrPort)); } catch {}
  }

  async function discoverRunningInstances() {
    const instances = [];
    let files;
    try { ensureRunDir(); files = fsLike.readdirSync(paths.getRunDir()); } catch { return instances; }
    for (const file of files.filter((name) => /^openchamber-\d+\.pid$/.test(name))) {
      const port = Number.parseInt(file.slice('openchamber-'.length, -'.pid'.length), 10);
      const pidFilePath = path.join(paths.getRunDir(), file);
      const pid = readPidFile(pidFilePath);
      const instanceFilePath = paths.getInstanceFilePath(port);
      if (!pid || !processRuntime.isProcessRunning(pid)) {
        removePidFile(pidFilePath);
        removeInstanceFile(instanceFilePath);
        continue;
      }
      const stored = readInstanceRecord(instanceFilePath);
      const expected = identityFingerprint(stored?.identityFingerprint) || identityFingerprint(stored?.processIdentityFingerprint);
      const current = processRuntime.getProcessIdentity?.(pid) || null;
      if (expected && current && identityFingerprint(current) !== expected) {
        removePidFile(pidFilePath);
        removeInstanceFile(instanceFilePath);
        continue;
      }
      let mtime = 0;
      try { mtime = fsLike.statSync(pidFilePath).mtimeMs; } catch {}
      instances.push({
        ...(stored || {}),
        port,
        pid,
        pidFilePath,
        instanceFilePath,
        mtime,
        startedAt: Number.isFinite(stored?.startedAt) ? stored.startedAt : 0,
        launchMode: stored?.launchMode === 'foreground' ? 'foreground' : 'daemon',
        identityFingerprint: expected || null,
        identityStatus: expected && current ? 'verified' : 'identity-unverified',
      });
    }
    instances.sort((a, b) => a.port - b.port);
    return instances;
  }

  function getLatestInstance(instances) {
    if (!Array.isArray(instances) || instances.length === 0) return null;
    return [...instances].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0) || (b.mtime || 0) - (a.mtime || 0) || b.port - a.port)[0];
  }

  return {
    paths,
    readPidFile,
    writePidFile,
    removePidFile,
    readInstanceRecord,
    writeInstanceRecord,
    removeInstanceFile,
    discoverRunningInstances,
    getLatestInstance,
  };
}

export { createInstanceStore };
