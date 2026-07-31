const DEFAULT_PORT = 3000;
const DEFAULT_TAIL_LINES = 200;

const COMMAND_NAMES = Object.freeze(['serve', 'stop', 'restart', 'status', 'logs', 'update']);

const COMMAND_DESCRIPTIONS = Object.freeze({
  serve: 'Start the web server (daemon default)',
  stop: 'Stop running instance(s)',
  restart: 'Stop and start the server',
  status: 'Show server status',
  logs: 'Tail OpenChamber logs',
  update: 'Check for and install updates',
});

const EXIT_CODE = Object.freeze({
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  USAGE_ERROR: 2,
  MISSING_DEPENDENCY: 3,
  AUTH_CONFIG_ERROR: 4,
  NETWORK_RUNTIME_ERROR: 5,
});

class TunnelCliError extends Error {
  constructor(message, exitCode = EXIT_CODE.GENERAL_ERROR) {
    super(message);
    this.name = 'TunnelCliError';
    this.exitCode = exitCode;
  }
}

// Fetch/Chromium restricted ports cannot be used by the browser UI.
const UNSAFE_BROWSER_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69,
  77, 79, 87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119,
  123, 135, 137, 139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515,
  526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990,
  993, 995, 1719, 1720, 1723, 2049, 3659, 4045, 5060, 5061, 6000, 6566,
  6665, 6666, 6667, 6668, 6669, 6697, 10080,
]);

function resolveApiHost(env = process.env) {
  const configured = typeof env?.OPENCHAMBER_HOST === 'string'
    ? env.OPENCHAMBER_HOST.trim()
    : '';
  if (!configured || configured === '0.0.0.0') return '127.0.0.1';
  if (configured === '::' || configured === '[::]') return '::1';
  return configured.startsWith('[') && configured.endsWith(']')
    ? configured.slice(1, -1)
    : configured;
}

function formatHostForUrl(host) {
  if (typeof host !== 'string') return '127.0.0.1';
  return host.includes(':') ? `[${host}]` : host;
}

function isUnsafeBrowserPort(port) {
  return Number.isFinite(port) && UNSAFE_BROWSER_PORTS.has(Math.trunc(port));
}

function formatUnsafePortWarning(port, env = process.env) {
  const host = formatHostForUrl(resolveApiHost(env));
  return `Port ${port} is browser-unsafe (ERR_UNSAFE_PORT) and is not supported for OpenChamber UI at http://${host}:${port}/.`;
}

function assertSafeBrowserPort(port, { context = 'This action', env = process.env } = {}) {
  if (!isUnsafeBrowserPort(port)) return;
  throw new TunnelCliError(
    `${context} cannot use port ${port}. ${formatUnsafePortWarning(port, env)} Use a safe port such as 3000, 5173, 8080, or a high ephemeral port.`,
    EXIT_CODE.USAGE_ERROR,
  );
}

function splitOptionToken(arg) {
  if (typeof arg !== 'string' || !arg.startsWith('-')) return null;
  if (arg.startsWith('--')) {
    const eqIndex = arg.indexOf('=');
    return {
      name: eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2),
      inlineValue: eqIndex >= 0 ? arg.slice(eqIndex + 1) : undefined,
      long: true,
    };
  }
  return { name: arg.slice(1), inlineValue: undefined, long: false };
}

function parseArgs(argv = process.argv.slice(2), env = process.env) {
  const args = Array.isArray(argv) ? [...argv] : [];
  const options = {
    port: DEFAULT_PORT,
    host: undefined,
    uiPassword: env?.OPENCHAMBER_UI_PASSWORD || undefined,
    json: false,
    all: false,
    follow: true,
    lines: DEFAULT_TAIL_LINES,
    plain: false,
    quiet: false,
    explicitPort: false,
    explicitUiPassword: false,
    foreground: false,
  };

  const removedFlagErrors = [];
  const positional = [];
  let helpRequested = false;
  let versionRequested = false;

  const consumeValue = (index, inlineValue) => {
    if (typeof inlineValue === 'string' && inlineValue.length > 0) {
      return { value: inlineValue, nextIndex: index };
    }
    const candidate = args[index + 1];
    if (typeof candidate === 'string' && !candidate.startsWith('-')) {
      return { value: candidate, nextIndex: index + 1 };
    }
    return { value: undefined, nextIndex: index };
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const parsedToken = splitOptionToken(arg);
    if (!parsedToken) {
      positional.push(arg);
      continue;
    }

    const { name, inlineValue, long } = parsedToken;
    switch (name) {
      case 'port':
      case 'p': {
        const consumed = consumeValue(i, inlineValue);
        let value = consumed.value;
        let nextIndex = consumed.nextIndex;
        if (value === undefined && typeof inlineValue !== 'string') {
          const candidate = args[i + 1];
          if (typeof candidate === 'string' && /^-\d+$/.test(candidate)) {
            value = candidate;
            nextIndex = i + 1;
          }
        }
        i = nextIndex;
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new TunnelCliError('Missing value for --port.', EXIT_CODE.USAGE_ERROR);
        }
        if (!/^-?\d+$/.test(value.trim())) {
          throw new TunnelCliError(`Invalid port value: ${value}`, EXIT_CODE.USAGE_ERROR);
        }
        const parsed = parseInt(value, 10);
        if (parsed < 1 || parsed > 65535) {
          throw new TunnelCliError(`Invalid port value: ${parsed}`, EXIT_CODE.USAGE_ERROR);
        }
        options.port = parsed;
        options.explicitPort = true;
        break;
      }
      case 'host': {
        const { value, nextIndex } = consumeValue(i, inlineValue);
        i = nextIndex;
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new TunnelCliError('Missing value for --host.', EXIT_CODE.USAGE_ERROR);
        }
        options.host = value.trim();
        break;
      }
      case 'ui-password': {
        const { value, nextIndex } = consumeValue(i, inlineValue);
        i = nextIndex;
        options.uiPassword = typeof value === 'string' ? value : '';
        options.explicitUiPassword = true;
        break;
      }
      case 'provider': case 'mode': case 'profile': case 'name': case 'config':
      case 'token': case 'token-file': case 'hostname': case 'connect-ttl': case 'session-ttl': {
        const { nextIndex } = consumeValue(i, inlineValue);
        i = nextIndex;
        removedFlagErrors.push(`\`--${name}\` is no longer available.`);
        break;
      }
      case 'token-stdin': case 'qr': case 'no-qr': case 'force': case 'show-secrets': case 'dry-run':
        removedFlagErrors.push(`\`--${name}\` is no longer available.`);
        break;
      case 'json': options.json = true; break;
      case 'all': options.all = true; break;
      case 'no-follow': options.follow = false; break;
      case 'lines': {
        const { value, nextIndex } = consumeValue(i, inlineValue);
        i = nextIndex;
        const parsed = parseInt(value ?? '', 10);
        if (Number.isFinite(parsed) && parsed > 0) options.lines = parsed;
        break;
      }
      case 'plain': options.plain = true; break;
      case 'quiet': case 'q': options.quiet = true; break;
      case 'help': case 'h': helpRequested = true; break;
      case 'version': case 'v': versionRequested = true; break;
      case 'foreground': case 'no-daemon': options.foreground = true; break;
      case 'daemon': case 'd': removedFlagErrors.push('`--daemon` was removed. OpenChamber now always runs in daemon mode.'); break;
      case 'try-cf-tunnel': removedFlagErrors.push('`--try-cf-tunnel` is no longer available.'); break;
      case 'tunnel-qr': removedFlagErrors.push('`--tunnel-qr` is no longer available.'); break;
      case 'tunnel-password-url': removedFlagErrors.push('`--tunnel-password-url` is no longer available.'); break;
      case 'tunnel-provider': case 'tunnel-mode': case 'tunnel-config': case 'tunnel-token':
      case 'tunnel-hostname': case 'tunnel':
        removedFlagErrors.push(`\`--${name}\` is no longer available.`);
        break;
      default:
        removedFlagErrors.push(!long && name.length === 1 ? `Unknown option: -${name}` : `Unknown option: --${name}`);
        break;
    }
  }

  return {
    command: positional[0] || 'serve',
    options,
    removedFlagErrors,
    helpRequested,
    versionRequested,
  };
}

export {
  COMMAND_DESCRIPTIONS,
  COMMAND_NAMES,
  DEFAULT_PORT,
  DEFAULT_TAIL_LINES,
  EXIT_CODE,
  TunnelCliError,
  UNSAFE_BROWSER_PORTS,
  assertSafeBrowserPort,
  formatUnsafePortWarning,
  isUnsafeBrowserPort,
  parseArgs,
  resolveApiHost,
  splitOptionToken,
};
