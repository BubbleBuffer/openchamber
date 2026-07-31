import React from 'react';
import { RiCloseLine, RiRefreshLine, RiStackLine } from '@remixicon/react';

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SortableTabsStrip, type SortableTabsStripItem } from '@/components/ui/sortable-tabs-strip';
import { McpDropdownContent } from '@/components/mcp/McpDropdown';
import { cn } from '@/lib/utils';

import {
  HeaderQuotaGroups,
  type QuotaDisplayMode,
  type RateLimitGroup,
} from './HeaderQuotaGroups';

type MobileHeaderServicesMenuProps = {
  buttonClassName: string;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeTab: 'usage' | 'mcp';
  setActiveTab: React.Dispatch<React.SetStateAction<'usage' | 'mcp'>>;
  quotaResultsLength: number;
  fetchAllQuotas: () => Promise<unknown>;
  servicesTabItems: SortableTabsStripItem[];
  quotaLastUpdated: number | null;
  quotaDisplayMode: QuotaDisplayMode;
  handleDisplayModeChange: (mode: QuotaDisplayMode) => Promise<void>;
  handleUsageRefresh: () => void;
  isQuotaLoading: boolean;
  isUsageRefreshSpinning: boolean;
  hasRateLimits: boolean;
  rateLimitGroups: RateLimitGroup[];
  expandedFamilies: Record<string, string[]>;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
};

const formatTime = (timestamp: number | null) => {
  if (!timestamp) return '-';
  try {
    return new Date(timestamp).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return '-';
  }
};

export const MobileHeaderServicesMenu = React.memo(function MobileHeaderServicesMenu({
  buttonClassName,
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  quotaResultsLength,
  fetchAllQuotas,
  servicesTabItems,
  quotaLastUpdated,
  quotaDisplayMode,
  handleDisplayModeChange,
  handleUsageRefresh,
  isQuotaLoading,
  isUsageRefreshSpinning,
  hasRateLimits,
  rateLimitGroups,
  expandedFamilies,
  toggleFamilyExpanded,
}: MobileHeaderServicesMenuProps) {
  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open && quotaResultsLength === 0) {
          void fetchAllQuotas();
        }
      }}
    >
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="View services" className={buttonClassName}>
              <RiStackLine className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>Services</p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        sideOffset={0}
        className="h-dvh w-[100vw] max-h-none rounded-none border-0 p-0 overflow-hidden"
      >
        <div className="flex h-full flex-col bg-[var(--surface-elevated)]">
          <div className="sticky top-0 z-20 bg-[var(--surface-elevated)] px-2 py-px">
            <div className="flex items-center justify-between gap-2 px-3 py-0">
              <div className="h-10 min-w-0 flex-1">
                <SortableTabsStrip
                  items={servicesTabItems}
                  activeId={activeTab}
                  onSelect={(tabID) => {
                    const value = tabID as 'usage' | 'mcp';
                    setActiveTab(value);
                    if (value === 'usage' && quotaResultsLength === 0) {
                      void fetchAllQuotas();
                    }
                  }}
                  layoutMode="fit"
                  variant="active-pill"
                  activePillInsetClassName="gap-0.5 px-px py-0"
                  activePillButtonClassName="h-8"
                  className="h-full"
                />
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-interactive-hover"
                aria-label="Close services"
              >
                <RiCloseLine className="h-5 w-5" />
              </button>
            </div>
          </div>

          {activeTab === 'mcp' ? <McpDropdownContent active={isOpen && activeTab === 'mcp'} /> : null}
          {activeTab === 'usage' ? (
            <div className="flex-1 overflow-y-auto overflow-x-hidden pb-[calc(4rem+env(safe-area-inset-bottom))]">
              <div className="border-b border-[var(--interactive-border)]">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex flex-col min-w-0 gap-0.5">
                    <span className="typography-ui-header font-semibold text-foreground">Rate limits</span>
                    <span className="truncate typography-micro text-muted-foreground">
                      {formatTime(quotaLastUpdated)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center h-6">
                      <button
                        type="button"
                        onClick={() => void handleDisplayModeChange('usage')}
                        className={cn(
                          'typography-ui-label px-1 pb-0.5 transition-colors',
                          quotaDisplayMode === 'usage'
                            ? 'text-foreground border-b-2 border-[var(--primary-base)]'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Used
                      </button>
                      <span className="text-muted-foreground typography-ui-label px-0.5">·</span>
                      <button
                        type="button"
                        onClick={() => void handleDisplayModeChange('remaining')}
                        className={cn(
                          'typography-ui-label px-1 pb-0.5 transition-colors',
                          quotaDisplayMode === 'remaining'
                            ? 'text-foreground border-b-2 border-[var(--primary-base)]'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        Remaining
                      </button>
                    </div>
                    <button
                      type="button"
                      className={cn(
                        'inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors',
                        'hover:text-foreground hover:bg-interactive-hover',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                      )}
                      onClick={handleUsageRefresh}
                      disabled={isQuotaLoading || isUsageRefreshSpinning}
                      aria-label="Refresh rate limits"
                    >
                      <RiRefreshLine className={cn('h-4 w-4', isUsageRefreshSpinning && 'animate-spin')} />
                    </button>
                  </div>
                </div>
              </div>

              {!hasRateLimits ? (
                <div className="px-4 py-6 text-center">
                  <span className="typography-ui-label text-muted-foreground">No rate limits available.</span>
                </div>
              ) : null}
              <HeaderQuotaGroups
                rateLimitGroups={rateLimitGroups}
                quotaDisplayMode={quotaDisplayMode}
                expandedFamilies={expandedFamilies}
                toggleFamilyExpanded={toggleFamilyExpanded}
                listClassName="py-1"
                dividerClassName="mx-4 my-1 border-t border-[var(--interactive-border)]"
              />
            </div>
          ) : null}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
