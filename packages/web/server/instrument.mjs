import * as Sentry from '@sentry/node';

const originalConsoleError = console.error;

console.error = (...args) => {
  originalConsoleError.apply(console, args);

  for (const arg of args) {
    if (arg instanceof Error) {
      Sentry.captureException(arg, { extra: { consoleArgs: args.filter((a) => !(a instanceof Error)).map(String) } });
      return;
    }
  }

  Sentry.captureMessage(args.map((a) => (typeof a === 'string' ? a : String(a))).join(' '), { level: 'error' });
};

Sentry.init({
  dsn: 'https://fdd1d15d875e43828cbc8e4cbdb8fff6@o4511341573636096.ingest.de.sentry.io/4511341589430352',
  environment: process.env.NODE_ENV ?? 'development',
  release: process.env.SENTRY_RELEASE ?? undefined,
  sendDefaultPii: false,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // Enable source map parsing so stack traces resolve original source
  // locations in Sentry. Bun processes source maps from filesystem.
  sourceMaps: true,
  integrations: (integrations) => {
    // Bun doesn't support util.getSystemErrorMap() — the systemError
    // integration crashes with TypeError on every invocation.
    return integrations.filter((i) => i.name !== 'SystemError');
  },
});
