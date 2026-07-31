import { lazy, StrictMode, Suspense, type ErrorInfo } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts'
import './index.css'
import { SessionAuthGate } from './components/auth/SessionAuthGate'
import { applyAppearancePreferences, loadAppearancePreferences } from './lib/theme/appearancePersistence'
import { startTypographyWatcher } from './lib/theme/typographyWatcher'
import { purgeLegacyVoiceStorage } from './lib/storage/legacyCleanup'
import type { RuntimeAPIs } from './lib/api/types'

declare global {
  interface Window {
    __OPENCHAMBER_RUNTIME_APIS__?: RuntimeAPIs;
  }
}

const runtimeAPIs = (typeof window !== 'undefined' && window.__OPENCHAMBER_RUNTIME_APIS__) || (() => {
  throw new Error('Runtime APIs not provided for legacy UI entrypoint.');
})();

purgeLegacyVoiceStorage();

// Only local appearance state is read before authentication. The authenticated
// application graph is lazy so module-level stores cannot issue protected
// requests while the password gate is still locked.
void loadAppearancePreferences()
  .then((appearance) => {
    if (appearance) applyAppearancePreferences(appearance);
    startTypographyWatcher();
  })
  .catch((err) => {
    console.error('[main] appearance init failed:', err);
  });

export const AuthenticatedApp = lazy(() => import('./AuthenticatedApp'));


const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

const logReactError = (error: unknown, errorInfo: ErrorInfo) => {
  console.error('[react-root] Render error', error, {
    componentStack: errorInfo.componentStack ?? null,
  });
};

createRoot(rootElement, {
  onUncaughtError: logReactError,
  onCaughtError: logReactError,
  onRecoverableError: logReactError,
}).render(
  <StrictMode>
    <SessionAuthGate>
      <Suspense
        fallback={(
          <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground">
            Loading OpenChamber…
          </div>
        )}
      >
        <AuthenticatedApp apis={runtimeAPIs} />
      </Suspense>
    </SessionAuthGate>
  </StrictMode>,
);
