import React from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ChatView } from '@/components/views/ChatView';
import { FireworksProvider } from '@/contexts/FireworksContext';
import { Toaster } from '@/components/ui/sonner';
import { setStreamPerfEnabled } from '@/stores/utils/streamDebug';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
// useEventStream removed — replaced by SyncProvider + SyncBridge
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMenuActions } from '@/hooks/useMenuActions';
import { useSessionStatusBootstrap } from '@/hooks/useSessionStatusBootstrap';
import { useSessionAutoCleanup } from '@/hooks/useSessionAutoCleanup';
import { useQueuedMessageAutoSend } from '@/hooks/useQueuedMessageAutoSend';
import { useRouter } from '@/hooks/useRouter';
import { usePushVisibilityBeacon } from '@/hooks/usePushVisibilityBeacon';
import { usePwaManifestSync } from '@/hooks/usePwaManifestSync';
import { usePwaInstallPrompt } from '@/hooks/usePwaInstallPrompt';
import { useWindowControlsOverlayLayout } from '@/hooks/useWindowControlsOverlayLayout';
import { useWindowTitle } from '@/hooks/useWindowTitle';
import { useProviderConfigStore } from '@/stores/config/useProviderConfigStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { hasModifier } from '@/lib/utils';
import { useSessionUIStore } from '@/sync/session-ui-store';
import { useDirectoryStore } from '@/stores/files/useDirectoryStore';
import { useProjectsStore } from '@/stores/projects/useProjectsStore';
import { opencodeClient } from '@/lib/opencode/client';
import { SyncProvider, useSessions } from '@/sync/sync-context';
import { useSync } from '@/sync/use-sync';
import { setOptimisticRefs } from '@/sync/session-actions';
import { useFontPreferences } from '@/hooks/useFontPreferences';
import { CODE_FONT_OPTION_MAP, DEFAULT_MONO_FONT, DEFAULT_UI_FONT, UI_FONT_OPTION_MAP } from '@/lib/fontOptions';
import { RuntimeAPIProvider } from '@/contexts/RuntimeAPIProvider';
import { registerRuntimeAPIs } from '@/contexts/runtimeAPIRegistry';
import { useUIStore } from '@/stores/useUIStore';
import { useGitHubAuthStore } from '@/stores/github/useGitHubAuthStore';
import { useFeatureFlagsStore } from '@/stores/useFeatureFlagsStore';
import type { RuntimeAPIs } from '@/lib/api/types';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MCP_OAUTH_CALLBACK_PATH } from '@/components/sections/mcp/mcpOAuth';
import { lazyWithChunkRecovery } from '@/lib/errors/chunkLoadRecovery';
import { reportError } from '@/lib/errors/reportError';
import { DeferredAppOverlays } from '@/components/layout/DeferredAppOverlays';

// Lazy-loaded heavy views — loaded on demand to reduce initial bundle size.
const OnboardingScreen = lazyWithChunkRecovery(() =>
  import('@/components/onboarding/OnboardingScreen').then((m) => ({ default: m.OnboardingScreen })),
);
const McpOAuthCallbackPage = lazyWithChunkRecovery(() =>
  import('@/components/sections/mcp/McpOAuthCallbackPage').then((m) => ({ default: m.McpOAuthCallbackPage })),
);

type AppProps = {
  apis: RuntimeAPIs;
};

type EmbeddedSessionChatConfig = {
  sessionId: string;
  directory: string | null;
};

type EmbeddedVisibilityPayload = {
  visible?: unknown;
};

const readEmbeddedSessionChatConfig = (): EmbeddedSessionChatConfig | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('ocPanel') !== 'session-chat') {
    return null;
  }

  const sessionIdRaw = params.get('sessionId');
  const sessionId = typeof sessionIdRaw === 'string' ? sessionIdRaw.trim() : '';
  if (!sessionId) {
    return null;
  }

  const directoryRaw = params.get('directory');
  const directory = typeof directoryRaw === 'string' && directoryRaw.trim().length > 0
    ? directoryRaw.trim()
    : null;

  return {
    sessionId,
    directory,
  };
};

const isMcpOAuthCallbackPath = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.location.pathname === MCP_OAUTH_CALLBACK_PATH;
};

const EmbeddedSessionSelectionGate: React.FC<{
  embeddedSessionChat: EmbeddedSessionChatConfig | null;
}> = ({ embeddedSessionChat }) => {
  const sessions = useSessions();
  const currentSessionId = useSessionUIStore((state) => state.currentSessionId);
  const setCurrentSession = useSessionUIStore((state) => state.setCurrentSession);

  React.useEffect(() => {
    if (!embeddedSessionChat) {
      return;
    }

    if (currentSessionId === embeddedSessionChat.sessionId) {
      return;
    }

    if (!sessions.some((session) => session.id === embeddedSessionChat.sessionId)) {
      return;
    }

    void setCurrentSession(embeddedSessionChat.sessionId);
  }, [currentSessionId, embeddedSessionChat, sessions, setCurrentSession]);

  return null;
};

const SyncOptimisticBridge: React.FC = () => {
  const sync = useSync();
  const addRef = React.useRef(sync.optimistic.add);
  const removeRef = React.useRef(sync.optimistic.remove);
  addRef.current = sync.optimistic.add;
  removeRef.current = sync.optimistic.remove;

  React.useEffect(() => {
    setOptimisticRefs(
      (input) => addRef.current(input),
      (input) => removeRef.current(input),
    );
  }, []);

  return null;
};

function SyncAppEffects({ embeddedBackgroundWorkEnabled }: {
  embeddedBackgroundWorkEnabled: boolean;
}) {
  usePwaManifestSync();
  useWindowControlsOverlayLayout();
  useSessionAutoCleanup(embeddedBackgroundWorkEnabled);
  useQueuedMessageAutoSend(embeddedBackgroundWorkEnabled);
  useKeyboardShortcuts();

  return <SyncOptimisticBridge />;
}

function App({ apis }: AppProps) {
  const initializeApp = useProviderConfigStore((s) => s.initializeProviders);
  const isInitialized = useProviderConfigStore((s) => s.isInitialized);
  const isConnected = useProviderConfigStore((s) => s.isConnected);
  const providersCount = useProviderConfigStore((state) => state.providers.length);
  const agentsCount = useAgentConfigStore((state) => state.agents.length);
  const loadProviders = useProviderConfigStore((state) => state.loadProviders);
  const loadAgents = useAgentConfigStore((state) => state.loadAgents);
  const currentDirectory = useDirectoryStore((state) => state.currentDirectory);
  const setDirectory = useDirectoryStore((state) => state.setDirectory);
  const isSwitchingDirectory = useDirectoryStore((state) => state.isSwitchingDirectory);
  const [showMemoryDebug, setShowMemoryDebug] = React.useState(false);
  const { uiFont, monoFont } = useFontPreferences();
  const refreshGitHubAuthStatus = useGitHubAuthStore((state) => state.refreshStatus);
  const [isEmbeddedVisible, setIsEmbeddedVisible] = React.useState(true);
  const setPlanModeEnabled = useFeatureFlagsStore((state) => state.setPlanModeEnabled);
  const hasEverConnected = useProviderConfigStore((state) => state.hasEverConnected);
  const appReadyDispatchedRef = React.useRef(false);
  const initializationInFlightRef = React.useRef(false);
  const embeddedSessionChat = React.useMemo<EmbeddedSessionChatConfig | null>(() => readEmbeddedSessionChatConfig(), []);
  const embeddedBackgroundWorkEnabled = !embeddedSessionChat || isEmbeddedVisible;
  const isMcpOAuthCallback = React.useMemo(() => isMcpOAuthCallbackPath(), []);

  React.useEffect(() => {
    setStreamPerfEnabled(showMemoryDebug);
    return () => {
      setStreamPerfEnabled(false);
    };
  }, [showMemoryDebug]);

  React.useEffect(() => {
    registerRuntimeAPIs(apis);
    return () => registerRuntimeAPIs(null);
  }, [apis]);

  React.useEffect(() => {
    if (embeddedSessionChat) {
      return;
    }

    void refreshGitHubAuthStatus(apis.github, { force: true });
  }, [apis.github, embeddedSessionChat, refreshGitHubAuthStatus]);

  React.useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    const uiStack = UI_FONT_OPTION_MAP[uiFont]?.stack ?? UI_FONT_OPTION_MAP[DEFAULT_UI_FONT].stack;
    const monoStack = CODE_FONT_OPTION_MAP[monoFont]?.stack ?? CODE_FONT_OPTION_MAP[DEFAULT_MONO_FONT].stack;

    root.style.setProperty('--font-sans', uiStack);
    root.style.setProperty('--font-heading', uiStack);
    root.style.setProperty('--font-family-sans', uiStack);
    root.style.setProperty('--font-mono', monoStack);
    root.style.setProperty('--font-family-mono', monoStack);
    root.style.setProperty('--ui-regular-font-weight', '400');

    if (document.body) {
      document.body.style.fontFamily = uiStack;
    }
  }, [uiFont, monoFont]);

  React.useEffect(() => {
    if (!isInitialized) {
      return;
    }

    const timer = setTimeout(() => {
      const loadingElement = document.getElementById('initial-loading');
      if (loadingElement) {
        loadingElement.classList.add('fade-out');
        setTimeout(() => {
          loadingElement.remove();
        }, 300);
      }
    }, 150);

    return () => clearTimeout(timer);
  }, [isInitialized]);

  React.useEffect(() => {
    const fallbackTimer = setTimeout(() => {
      const loadingElement = document.getElementById('initial-loading');
      if (loadingElement && !isInitialized) {
        loadingElement.classList.add('fade-out');
        setTimeout(() => {
          loadingElement.remove();
        }, 300);
      }
    }, 5000);

    return () => clearTimeout(fallbackTimer);
  }, [isInitialized]);

  React.useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const res = await fetch('/health', { method: 'GET' }).catch(() => null);
      if (!res || !res.ok || cancelled) return;
      const data = (await res.json().catch(() => null)) as null | {
        planModeExperimentalEnabled?: unknown;
      };
      if (!data || cancelled) return;
      const raw = data.planModeExperimentalEnabled;
      const enabled = raw === true || raw === 1 || raw === '1' || raw === 'true';
      setPlanModeEnabled(enabled);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [setPlanModeEnabled]);

  React.useEffect(() => {
    const init = async () => {
      if (initializationInFlightRef.current) {
        return;
      }
      initializationInFlightRef.current = true;
      try {
        await initializeApp();
      } catch (err) {
        reportError(err, { action: 'Initialize application', silent: true });
        throw err;
      } finally {
        initializationInFlightRef.current = false;
      }
    };

    init();
  }, [initializeApp]);

  React.useEffect(() => {
    if (isInitialized) return;

    let active = true;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const retryInitialization = async () => {
      if (!active) return;
      const state = useProviderConfigStore.getState();
      if (state.isInitialized) return;
      if (initializationInFlightRef.current) {
        retryTimer = setTimeout(retryInitialization, 1000);
        return;
      }

      initializationInFlightRef.current = true;
      try {
        await state.initializeProviders();
      } finally {
        initializationInFlightRef.current = false;
      }

      const next = useProviderConfigStore.getState();
      if (!active || next.isInitialized) return;
      retryTimer = setTimeout(retryInitialization, 1000);
    };

    retryTimer = setTimeout(retryInitialization, 1000);

    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [isInitialized]);

  // Startup recovery: poll until providers AND agents are loaded.
  // loadProviders/loadAgents resolve normally even on failure (errors swallowed),
  // so a reactive effect can't detect failure — we need an interval.
  React.useEffect(() => {
    if (!isConnected) return;
    if (providersCount > 0 && agentsCount > 0) return;

    let active = true;
    let retries = 0;
    const MAX_RETRIES = 15;
    const attempt = async () => {
      const providerState = useProviderConfigStore.getState();
      const agentState = useAgentConfigStore.getState();
      if (providerState.providers.length > 0 && agentState.agents.length > 0) return;
      try {
        if (providerState.providers.length === 0) await loadProviders();
        if (useAgentConfigStore.getState().agents.length === 0) await loadAgents();
      } catch { /* retry next interval */ }
    };

    void attempt();
    const id = setInterval(() => {
      if (!active) return;
      if (++retries >= MAX_RETRIES) { clearInterval(id); return; }
      void attempt();
    }, 2000);
    return () => { active = false; clearInterval(id); };
  }, [isConnected, loadAgents, loadProviders, providersCount, agentsCount]);

  React.useEffect(() => {
    if (isSwitchingDirectory) {
      return;
    }

    if (!isConnected) {
      return;
    }
    opencodeClient.setDirectory(currentDirectory);

    // Session loading is handled by the sync system's bootstrap — no manual loadSessions needed.
  }, [currentDirectory, isSwitchingDirectory, isConnected]);

  React.useEffect(() => {
    if (!embeddedSessionChat || typeof window === 'undefined') {
      return;
    }

    const applyVisibility = (payload?: EmbeddedVisibilityPayload) => {
      const nextVisible = payload?.visible === true;
      setIsEmbeddedVisible(nextVisible);
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      const data = event.data as { type?: unknown; payload?: EmbeddedVisibilityPayload };
      if (data?.type !== 'openchamber:embedded-visibility') {
        return;
      }

      applyVisibility(data.payload);
    };

    const scopedWindow = window as unknown as {
      __openchamberSetEmbeddedVisibility?: (payload?: EmbeddedVisibilityPayload) => void;
    };

    scopedWindow.__openchamberSetEmbeddedVisibility = applyVisibility;
    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
      if (scopedWindow.__openchamberSetEmbeddedVisibility === applyVisibility) {
        delete scopedWindow.__openchamberSetEmbeddedVisibility;
      }
    };
  }, [embeddedSessionChat]);

  React.useEffect(() => {
    if (!embeddedSessionChat?.directory) {
      return;
    }

    if (currentDirectory === embeddedSessionChat.directory) {
      return;
    }

    setDirectory(embeddedSessionChat.directory, { showOverlay: false });
  }, [currentDirectory, embeddedSessionChat, setDirectory]);

  React.useEffect(() => {
    if (!embeddedSessionChat || typeof window === 'undefined') {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) {
        return;
      }

      if (event.key !== 'ui-store') {
        return;
      }

      void useUIStore.persist.rehydrate();
    };

    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  }, [embeddedSessionChat]);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId?: string }>).detail;
      const sessionId = typeof detail?.sessionId === 'string' ? detail.sessionId.trim() : '';
      if (!sessionId) return;
      void useSessionUIStore.getState().setCurrentSession(sessionId);
    };

    window.addEventListener('openchamber:open-session', handler as EventListener);
    return () => window.removeEventListener('openchamber:open-session', handler as EventListener);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ projectPath?: string }>).detail;
      const projectPath = typeof detail?.projectPath === 'string' ? detail.projectPath.trim() : '';
      if (!projectPath) return;
      const projectsStore = useProjectsStore.getState();
      const existing = projectsStore.projects.find((project) => project.path === projectPath);
      if (existing) {
        projectsStore.setActiveProject(existing.id);
      } else {
        projectsStore.addProject(projectPath);
      }
    };

    window.addEventListener('openchamber:open-project', handler as EventListener);
    return () => window.removeEventListener('openchamber:open-project', handler as EventListener);
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isInitialized || isSwitchingDirectory) return;
    if (appReadyDispatchedRef.current) return;
    appReadyDispatchedRef.current = true;
    (window as unknown as { __openchamberAppReady?: boolean }).__openchamberAppReady = true;
    window.dispatchEvent(new Event('openchamber:app-ready'));
  }, [isInitialized, isSwitchingDirectory]);

  // useEventStream replaced by SyncProvider + SyncBridge

  // Session attention now handled by notification-store via SSE events (session.idle/session.error)

  usePushVisibilityBeacon({ enabled: embeddedBackgroundWorkEnabled });
  usePwaInstallPrompt();

  useWindowTitle();

  useRouter();

  const handleToggleMemoryDebug = React.useCallback(() => {
    setShowMemoryDebug(prev => !prev);
  }, []);

  useMenuActions(handleToggleMemoryDebug);

  useSessionStatusBootstrap({ enabled: embeddedBackgroundWorkEnabled });

  React.useEffect(() => {
    if (embeddedSessionChat) {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isDebugShortcut = hasModifier(e)
        && e.shiftKey
        && !e.altKey
        && (e.code === 'KeyD' || e.key.toLowerCase() === 'd');

      if (isDebugShortcut) {
        e.preventDefault();
        setShowMemoryDebug(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [embeddedSessionChat]);

  if (!embeddedSessionChat && !isMcpOAuthCallback && !isInitialized && !isConnected) {
    return (
      <ErrorBoundary>
        <div className="h-full text-foreground bg-background">
          <React.Suspense fallback={<div className="h-full" />}>
            <OnboardingScreen
              mode={hasEverConnected ? 'local-setup' : 'first-launch'}
              onCliAvailable={() => void initializeApp()}
            />
          </React.Suspense>
        </div>
      </ErrorBoundary>
    );
  }

  if (embeddedSessionChat) {
    return (
      <ErrorBoundary>
        <SyncProvider sdk={opencodeClient.getSdkClient()} directory={currentDirectory || ''}>
          <RuntimeAPIProvider apis={apis}>
            <TooltipProvider delayDuration={700} skipDelayDuration={150}>
              <div className="h-full text-foreground bg-background">
                <EmbeddedSessionSelectionGate embeddedSessionChat={embeddedSessionChat} />
                <SyncAppEffects embeddedBackgroundWorkEnabled={embeddedBackgroundWorkEnabled} />
                <ChatView />
                <Toaster />
              </div>
            </TooltipProvider>
          </RuntimeAPIProvider>
        </SyncProvider>
      </ErrorBoundary>
    );
  }

  if (isMcpOAuthCallback) {
    return (
      <ErrorBoundary>
        <React.Suspense fallback={<div className="h-full bg-background" />}>
          <McpOAuthCallbackPage />
        </React.Suspense>
      </ErrorBoundary>
    );
  }

  // Always mount the full provider tree to avoid remounts when isInitialized
  // flips from false → true. FireworksProvider is a lightweight
  // shells; their heavy children are only activated when actually needed.
  const isBootShell = !isInitialized;

  return (
    <ErrorBoundary>
      <SyncProvider sdk={opencodeClient.getSdkClient()} directory={currentDirectory || ''}>
        <RuntimeAPIProvider apis={apis}>
          <FireworksProvider>
            <TooltipProvider delayDuration={700} skipDelayDuration={150}>
                <div className="h-full text-foreground bg-background">
                  <SyncAppEffects embeddedBackgroundWorkEnabled={embeddedBackgroundWorkEnabled} />
                  <MainLayout />
                  <Toaster />
                  {!isBootShell && (
                    <DeferredAppOverlays
                      showMemoryDebug={showMemoryDebug}
                      onCloseMemoryDebug={() => setShowMemoryDebug(false)}
                    />
                  )}
                </div>
              </TooltipProvider>
          </FireworksProvider>
        </RuntimeAPIProvider>
      </SyncProvider>
    </ErrorBoundary>
  );
}

export default App;
