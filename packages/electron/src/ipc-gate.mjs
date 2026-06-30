export const COMMANDS_SAFE_FOR_REMOTE = new Set([
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
]);

export const isIpcCommandRemoteSafe = (command) => COMMANDS_SAFE_FOR_REMOTE.has(command);

export const isLocalSender = (webContents, localOrigin = null) => {
  try {
    const raw = typeof webContents?.getURL === 'function' ? webContents.getURL() : '';
    if (!raw) return false;
    if (raw.startsWith('file://') || raw === 'about:blank') return true;
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    const hostname = url.hostname;
    const hostWithoutBrackets = hostname.startsWith('[') && hostname.endsWith(']')
      ? hostname.slice(1, -1)
      : hostname;
    if (hostWithoutBrackets === 'localhost' || hostWithoutBrackets === '127.0.0.1' || hostWithoutBrackets === '::1') return true;
    if (localOrigin) {
      try {
        return url.origin === new URL(localOrigin).origin;
      } catch {
        return false;
      }
    }
    return false;
  } catch {
    return false;
  }
};

export const assertIpcAvailableForOrigin = (webContents, command, localOrigin = null) => {
  if (!isLocalSender(webContents, localOrigin) && !isIpcCommandRemoteSafe(command)) {
    throw new Error('IPC not available for this origin');
  }
};
