import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const mainPath = path.join(__dirname, '..', 'main.mjs');

const readMain = () => fs.readFile(mainPath, 'utf8');

const extractRemoteSafeCommands = (source) => {
  const match = source.match(/const COMMANDS_SAFE_FOR_REMOTE = new Set\(\[([\s\S]*?)\]\);/);
  assert.ok(match, 'COMMANDS_SAFE_FOR_REMOTE block should exist');
  return new Set(Array.from(match[1].matchAll(/'([^']+)'/g), (item) => item[1]));
};

describe('Electron remote IPC gate contract', () => {
  it('allows only low-risk window and host-switcher commands for remote origins', async () => {
    const commands = extractRemoteSafeCommands(await readMain());
    for (const command of [
      'desktop_hosts_get',
      'desktop_host_probe',
      'desktop_new_window',
      'desktop_new_window_at_url',
      'desktop_set_window_title',
      'desktop_set_window_theme',
      'desktop_is_window_fullscreen',
      'desktop_start_window_drag',
      'desktop_get_app_version',
      'desktop_get_lan_address',
    ]) {
      assert.equal(commands.has(command), true, `${command} should remain remote-safe`);
    }
  });

  it('does not allow local file, shell, notification, or update commands remotely', async () => {
    const commands = extractRemoteSafeCommands(await readMain());
    for (const command of [
      'desktop_read_file',
      'desktop_save_markdown_file',
      'desktop_open_path',
      'desktop_reveal_path',
      'desktop_open_in_app',
      'desktop_open_file_in_app',
      'desktop_notify',
      'desktop_check_for_updates',
      'desktop_install_update',
      'desktop_ssh_start',
    ]) {
      assert.equal(commands.has(command), false, `${command} must not be remote-safe`);
    }
  });

  it('guards openchamber:invoke before dispatching to handleInvoke', async () => {
    const source = await readMain();
    assert.match(source, /ipcMain\.handle\('openchamber:invoke'/);
    assert.match(source, /!isLocalSender\(event\.sender\)\s*&&\s*!COMMANDS_SAFE_FOR_REMOTE\.has\(command\)/);
    assert.match(source, /throw new Error\('IPC not available for this origin'\)/);
    assert.match(source, /return handleInvoke\(browserWindow, command, args\)/);
  });
});
