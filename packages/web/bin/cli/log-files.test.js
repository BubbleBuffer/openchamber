import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { createPaths } from './paths.js';
import { createLogFiles } from './log-files.js';

const fixtures = [];

afterEach(() => {
  for (const directory of fixtures.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function makeLogs() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openchamber-log-files-'));
  fixtures.push(directory);
  return createLogFiles({
    paths: createPaths({ env: { OPENCHAMBER_DATA_DIR: directory }, homedir: directory }),
    fsLike: fs,
    maxBytes: 4,
    keep: 2,
  });
}

describe('log files', () => {
  it('rotates bounded log history and tails the requested number of lines', () => {
    const logs = makeLogs();
    const logPath = logs.getLogFilePath(3000);
    logs.ensureLogDir();
    fs.writeFileSync(logPath, '12345');
    fs.writeFileSync(`${logPath}.1`, 'old');
    logs.rotateLogFile(logPath);

    expect(fs.readFileSync(`${logPath}.1`, 'utf8')).toBe('12345');
    expect(fs.readFileSync(`${logPath}.2`, 'utf8')).toBe('old');
    fs.writeFileSync(logPath, 'a\nb\nc\n');
    expect(logs.readTailLines(logPath, 2)).toEqual(['b', 'c']);
  });

  it('disposes a follower and stops polling', () => {
    const callbacks = [];
    const cleared = [];
    const logs = makeLogs();
    const logPath = logs.getLogFilePath(3001);
    logs.ensureLogDir();
    fs.writeFileSync(logPath, 'initial\n');
    const unsubscribe = logs.followFile(logPath, (line) => callbacks.push(line), {
      timers: {
        setInterval: (callback) => { callbacks.timer = callback; return 7; },
        clearInterval: (id) => cleared.push(id),
      },
    });

    fs.appendFileSync(logPath, 'next\n');
    callbacks.timer();
    unsubscribe();

    expect(callbacks).toContain('next');
    expect(cleared).toEqual([7]);
  });
});
