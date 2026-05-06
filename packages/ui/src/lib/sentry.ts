import * as Sentry from '@sentry/react';

declare const __APP_VERSION__: string | undefined;

const originalConsoleError = console.error;

console.error = (...args: unknown[]) => {
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
  environment: import.meta.env.MODE,
  release: __APP_VERSION__,

  sendDefaultPii: false,

  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  tracesSampleRate: import.meta.env.DEV ? 1.0 : 0.2,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
