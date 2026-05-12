// packages/ui/src/components/layout/MobileShell.tsx
import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useDialogStore } from '@/stores/useDialogStore';
import { cn } from '@/lib/utils';
import type { MainTab } from '@/stores/useUIStore';
import { MobileBottomTabs } from './MobileBottomTabs';
import { Header } from './Header';

interface MobileShellProps {
  children: React.ReactNode;
  /** Optional header rendered at top */
  header?: React.ReactNode;
  /** Whether to show the header */
  showHeader?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  header,
  showHeader = true,
}) => {
  const activeMainTab = useUIStore((s) => s.activeMainTab);
  const setActiveMainTab = useUIStore((s) => s.setActiveMainTab);
  const setSettingsDialogOpen = useDialogStore((s) => s.setSettingsDialogOpen);

  const handleTabChange = React.useCallback((tab: MainTab) => {
    setActiveMainTab(tab);
  }, [setActiveMainTab]);

  const handleOpenMore = React.useCallback(() => {
    // Open the more menu — we reuse settings as the "more" panel on mobile
    setSettingsDialogOpen(true);
  }, [setSettingsDialogOpen]);

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background',
        'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]',
      )}
    >
      {showHeader && (header ?? <Header />)}
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
        {children}
      </div>
      <MobileBottomTabs
        activeTab={activeMainTab}
        onTabChange={handleTabChange}
        onOpenMore={handleOpenMore}
      />
    </div>
  );
};

export default MobileShell;
