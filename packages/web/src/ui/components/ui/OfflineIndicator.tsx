import React from 'react';
import { cn } from '@/lib/utils';

/**
 * OfflineIndicator — shows a small banner when the browser detects it's offline.
 * Uses the native online/offline events and navigator.onLine.
 */
export const OfflineIndicator: React.FC = () => {
  const [isOffline, setIsOffline] = React.useState(() => !navigator.onLine);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      setDismissed(false);
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline || dismissed) return null;

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'flex items-center justify-center gap-2',
        'bg-[var(--status-error)] text-white',
        'px-4 py-2 text-sm font-medium',
        'safe-area-pb'
      )}
      role="alert"
      aria-live="polite"
    >
      <span>You are offline</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="ml-2 rounded px-2 py-1 text-xs font-semibold uppercase tracking-wide bg-white/20 hover:bg-white/30 transition-colors"
        aria-label="Dismiss offline warning"
      >
        Dismiss
      </button>
    </div>
  );
};
