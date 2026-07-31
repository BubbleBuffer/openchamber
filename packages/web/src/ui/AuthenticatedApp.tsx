import { useEffect, useRef, type FC } from 'react';
import App from './App';
import { ClientSessionMachineBridge } from './components/chat/state/bridge/clientSessionMachineBridge';
import { ThemeProvider } from './components/providers/ThemeProvider';
import { ThemeSystemProvider } from './contexts/ThemeSystemContext';
import type { RuntimeAPIs } from './lib/api/types';
import { startModelPrefsAutoSave } from './lib/config/modelPrefsAutoSave';
import { syncSettings } from './lib/config/persistence';
import './lib/errors/debug';
import { applyPersistedDirectoryPreferences } from './lib/files/directoryPersistence';
import { startAppearanceAutoSave } from './lib/theme/appearanceAutoSave';
import { initializeDirectoryStore } from './stores/files/useDirectoryStore';

const AuthenticatedApp: FC<{ apis: RuntimeAPIs }> = ({ apis }) => {
  const modelPrefsCleanupRef = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    let disposed = false;

    void (async () => {
      await Promise.all([
        syncSettings(),
        applyPersistedDirectoryPreferences(),
        initializeDirectoryStore(),
      ]);
      if (disposed) return;

      startAppearanceAutoSave();
      modelPrefsCleanupRef.current = startModelPrefsAutoSave();
    })().catch((error) => {
      console.error('[main] authenticated settings init failed:', error);
    });

    return () => {
      disposed = true;
      modelPrefsCleanupRef.current?.();
      modelPrefsCleanupRef.current = undefined;
    };
  }, []);

  return (
    <ThemeSystemProvider>
      <ThemeProvider>
        <ClientSessionMachineBridge>
          <App apis={apis} />
        </ClientSessionMachineBridge>
      </ThemeProvider>
    </ThemeSystemProvider>
  );
};

export default AuthenticatedApp;
