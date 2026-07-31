import fs from 'fs';

function createLogFiles({ paths, fsLike = fs, timers = { setInterval, clearInterval }, maxBytes = 10 * 1024 * 1024, keep = 5 } = {}) {
  if (!paths) throw new TypeError('createLogFiles requires paths');

  function ensureLogDir() {
    fsLike.mkdirSync(paths.getLogsDir(), { recursive: true });
    return paths.getLogsDir();
  }

  function rotateLogFile(logPath) {
    let stats;
    try { stats = fsLike.statSync(logPath); } catch { return; }
    if (stats.size < maxBytes) return;
    for (let index = keep - 1; index >= 1; index -= 1) {
      try { fsLike.renameSync(`${logPath}.${index}`, `${logPath}.${index + 1}`); } catch {}
    }
    try { fsLike.renameSync(logPath, `${logPath}.1`); } catch {}
  }

  function readTailLines(filePath, lineCount = 200) {
    try {
      const raw = fsLike.readFileSync(filePath, 'utf8');
      const lines = raw.split(/\r?\n/);
      if (lines.at(-1) === '') lines.pop();
      return lines.slice(Math.max(0, lines.length - lineCount));
    } catch { return []; }
  }

  function followFile(filePath, onLine, followOptions = {}) {
    const followTimers = followOptions.timers || timers;
    let position = 0;
    try { position = fsLike.statSync(filePath).size; } catch {}
    let remainder = '';
    const interval = followTimers.setInterval(() => {
      try {
        const stats = fsLike.statSync(filePath);
        if (stats.size < position) position = 0;
        if (stats.size === position) return;
        const length = stats.size - position;
        const fd = fsLike.openSync(filePath, 'r');
        try {
          const buffer = Buffer.alloc(length);
          fsLike.readSync(fd, buffer, 0, length, position);
          position = stats.size;
          const parts = (remainder + buffer.toString('utf8')).split(/\r?\n/);
          remainder = parts.pop() || '';
          for (const line of parts) onLine(line);
        } finally { fsLike.closeSync(fd); }
      } catch {}
    }, followOptions.intervalMs || 400);
    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      followTimers.clearInterval(interval);
    };
  }

  return { ensureLogDir, getLogFilePath: paths.getLogFilePath, rotateLogFile, readTailLines, followFile };
}

export { createLogFiles };
