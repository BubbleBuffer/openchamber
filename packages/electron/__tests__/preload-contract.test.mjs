import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const preloadPath = path.join(__dirname, '..', 'preload.mjs');

const readPreload = () => fs.readFile(preloadPath, 'utf8');

describe('Electron preload contract', () => {
  it('exposes desktop identity and local metadata globals', async () => {
    const source = await readPreload();
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_ELECTRON__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_LOCAL_ORIGIN__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_HOME__'/);
    assert.match(source, /exposeInMainWorld\('__OPENCHAMBER_MACOS_MAJOR__'/);
  });

  it('maps __TAURI__.core.invoke to the openchamber invoke channel', async () => {
    const source = await readPreload();
    assert.match(source, /exposeInMainWorld\('__TAURI__'/);
    assert.match(source, /core:\s*{[\s\S]*invoke:\s*\(cmd, args\)\s*=>\s*ipcRenderer\.invoke\('openchamber:invoke', cmd, args \|\| {}\)/);
  });

  it('keeps dialog and event APIs on their expected IPC contracts', async () => {
    const source = await readPreload();
    assert.match(source, /dialog:\s*{[\s\S]*open:\s*\(options\)\s*=>\s*ipcRenderer\.invoke\('openchamber:dialog:open', options \|\| {}\)/);
    assert.match(source, /event:\s*{[\s\S]*listen:\s*async \(event, handler\)\s*=>\s*addListener\(event, handler\)/);
    assert.match(source, /ipcRenderer\.on\('openchamber:emit'/);
    assert.match(source, /dispatchNativeEvent\(event, payload\.detail\)/);
  });
});
