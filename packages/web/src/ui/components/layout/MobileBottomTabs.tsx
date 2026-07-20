// packages/web/src/ui/components/layout/MobileBottomTabs.tsx
import React from 'react';
import { cn } from '@/lib/utils';
import type { MainTab } from '@/stores/useUIStore';
import {
  RiChat1Line,
  RiFileList3Line,
  RiTerminalBoxLine,
  RiMore2Line,
} from '@remixicon/react';

export interface TabDefinition {
  id: MainTab | 'more';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MOBILE_TABS: TabDefinition[] = [
  { id: 'chat', label: 'Chat', icon: RiChat1Line },
  { id: 'files', label: 'Context', icon: RiFileList3Line },
  { id: 'terminal', label: 'Terminal', icon: RiTerminalBoxLine },
  { id: 'more', label: 'More', icon: RiMore2Line },
];

interface MobileBottomTabsProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onOpenMore: () => void;
  unreadCount?: number;
}

export const MobileBottomTabs: React.FC<MobileBottomTabsProps> = ({
  activeTab,
  onTabChange,
  onOpenMore,
  unreadCount = 0,
}) => {
  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-[var(--surface-background)]',
        'border-t border-border/40',
        'pb-[env(safe-area-inset-bottom,0px)]',
      )}
    >
      <div className="flex items-center justify-around h-14">
        {MOBILE_TABS.map((tab) => {
          const showActive = tab.id === 'more'
            ? activeTab === 'git' || activeTab === 'diff' || activeTab === 'plan'
            : tab.id === activeTab;

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === 'more') {
                  onOpenMore();
                } else {
                  onTabChange(tab.id as MainTab);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                'min-w-0 gap-0.5',
                'transition-colors duration-150',
                showActive
                  ? 'text-[var(--primary)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              style={{ minHeight: '44px' }}
              aria-label={tab.label}
              aria-current={showActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.id === 'chat' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[var(--status-error)] border-2 border-[var(--surface-background)]" />
                )}
              </div>
              <span className="text-[10px] leading-tight font-medium tracking-wide">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomTabs;
