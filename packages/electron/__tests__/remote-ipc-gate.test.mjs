import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMANDS_SAFE_FOR_REMOTE,
  isIpcCommandRemoteSafe,
  isLocalSender,
  assertIpcAvailableForOrigin,
} from '../src/ipc-gate.mjs';

const makeMockWebContents = (url) => ({
  getURL: () => url,
});

describe('COMMANDS_SAFE_FOR_REMOTE', () => {
  it('includes exactly the known low-risk commands', () => {
    const expected = [
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
    ];
    for (const command of expected) {
      assert.equal(
        COMMANDS_SAFE_FOR_REMOTE.has(command),
        true,
        `${command} should be remote-safe`,
      );
    }
    assert.equal(COMMANDS_SAFE_FOR_REMOTE.size, expected.length);
  });
});

describe('isIpcCommandRemoteSafe', () => {
  const safe = [
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
  ];
  const unsafe = [
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
  ];

  it('returns true for safe commands', () => {
    for (const command of safe) {
      assert.equal(isIpcCommandRemoteSafe(command), true, `${command} should be remote-safe`);
    }
  });

  it('returns false for unsafe commands', () => {
    for (const command of unsafe) {
      assert.equal(isIpcCommandRemoteSafe(command), false, `${command} must not be remote-safe`);
    }
  });
});

describe('isLocalSender', () => {
  it('returns true for file:// URL', () => {
    assert.equal(isLocalSender(makeMockWebContents('file:///some/path')), true);
  });

  it('returns true for about:blank', () => {
    assert.equal(isLocalSender(makeMockWebContents('about:blank')), true);
  });

  it('returns true for localhost', () => {
    assert.equal(isLocalSender(makeMockWebContents('http://localhost:3000/path')), true);
  });

  it('returns true for 127.0.0.1', () => {
    assert.equal(isLocalSender(makeMockWebContents('http://127.0.0.1:3000/path')), true);
  });

  it('returns true for ::1', () => {
    assert.equal(isLocalSender(makeMockWebContents('http://[::1]:3000/path')), true);
  });

  it('returns true for exact localOrigin match', () => {
    const localOrigin = 'http://localhost:3000';
    assert.equal(
      isLocalSender(makeMockWebContents('http://localhost:3000/dashboard'), localOrigin),
      true,
    );
  });

  it('returns false for remote HTTPS origin', () => {
    assert.equal(isLocalSender(makeMockWebContents('https://example.com/path')), false);
  });

  it('returns false for LAN IP without origin match', () => {
    assert.equal(isLocalSender(makeMockWebContents('http://192.168.1.5:3000/path')), false);
  });

  it('returns false when sender is missing', () => {
    assert.equal(isLocalSender(null), false);
  });

  it('returns false when getURL is missing', () => {
    assert.equal(isLocalSender({}), false);
  });

  it('returns false for malformed URL', () => {
    assert.equal(isLocalSender(makeMockWebContents('not-a-url')), false);
  });
});

describe('assertIpcAvailableForOrigin', () => {
  it('does not throw for local sender with unsafe command', () => {
    const sender = makeMockWebContents('file:///some/path');
    assert.doesNotThrow(() => assertIpcAvailableForOrigin(sender, 'desktop_read_file'));
  });

  it('does not throw for local sender with safe command', () => {
    const sender = makeMockWebContents('http://localhost:3000/path');
    const localOrigin = 'http://localhost:3000';
    assert.doesNotThrow(() =>
      assertIpcAvailableForOrigin(sender, 'desktop_hosts_get', localOrigin),
    );
  });

  it('does not throw for remote sender with safe command', () => {
    const sender = makeMockWebContents('https://example.com/path');
    assert.doesNotThrow(() => assertIpcAvailableForOrigin(sender, 'desktop_hosts_get'));
  });

  it('throws IPC not available for this origin for unsafe remote command', () => {
    const sender = makeMockWebContents('https://example.com/path');
    assert.throws(
      () => assertIpcAvailableForOrigin(sender, 'desktop_read_file'),
      /IPC not available for this origin/,
    );
  });
});
