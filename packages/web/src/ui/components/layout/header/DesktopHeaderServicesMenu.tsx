import React from 'react';
import { RiRefreshLine, RiStackLine } from '@remixicon/react';

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
export type { RateLimitGroup } from './HeaderQuotaGroups';

type DesktopHeaderServicesMenuProps = {
  buttonClassName: string;
  isDesktopLayout: boolean;
  isOpen: boolean;
  setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  activeTab: 'usage' | 'mcp';
  setActiveTab: React.Dispatch<React.SetStateAction<'usage' | 'mcp'>>;
  quotaResultsLength: number;
  fetchAllQuotas: () => Promise<unknown>;
  servicesTabItems: SortableTabsStripItem[];
  quotaLastUpdated: number | null;
  quotaDisplayMode: QuotaDisplayMode;
  quotaDisplayTabItems: SortableTabsStripItem[];
  handleDisplayModeChange: (mode: QuotaDisplayMode) => Promise<void>;
  handleUsageRefresh: () => void;
  isQuotaLoading: boolean;
  isUsageRefreshSpinning: boolean;
  hasRateLimits: boolean;
  rateLimitGroups: RateLimitGroup[];
  expandedFamilies: Record<string, string[]>;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
  shortcutLabel: (actionId: string) => string;
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

export const DesktopHeaderServicesMenu = React.memo(function DesktopHeaderServicesMenu({
  buttonClassName,
  isDesktopLayout,
  isOpen,
  setIsOpen,
  activeTab,
  setActiveTab,
  quotaResultsLength,
  fetchAllQuotas,
  servicesTabItems,
  quotaLastUpdated,
  quotaDisplayMode,
  quotaDisplayTabItems,
  handleDisplayModeChange,
  handleUsageRefresh,
  isQuotaLoading,
  isUsageRefreshSpinning,
  hasRateLimits,
  rateLimitGroups,
  expandedFamilies,
  toggleFamilyExpanded,
  shortcutLabel,
}: DesktopHeaderServicesMenuProps) {
  return (
    <DropdownMenu
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open && activeTab === 'usage' && quotaResultsLength === 0) {
          void fetchAllQuotas();
        }
      }}
    >
      <Tooltip delayDuration={500}>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open services, usage and MCP"
              className={cn(
                buttonClassName,
                isDesktopLayout ? 'w-auto max-w-[14rem] justify-start gap-1.5 px-2.5' : 'h-8 w-8',
              )}
            >
              <RiStackLine className="h-[18px] w-[18px]" />
              {isDesktopLayout ? (
                <span className="truncate typography-ui-label font-medium text-foreground">Services</span>
              ) : null}
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          <p>
            Services ({shortcutLabel('toggle_services_menu')}; next tab {shortcutLabel('cycle_services_tab')})
          </p>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        className="w-[min(27rem,calc(100vw-2rem))] max-h-[75vh] overflow-y-auto bg-[var(--surface-elevated)] p-0"
      >
        <div className="sticky top-0 z-20 px-2 pt-1.5 pb-px">
          <div className="h-9">
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
        </div>

        {activeTab === 'mcp' ? <McpDropdownContent active={isOpen && activeTab === 'mcp'} /> : null}
        {activeTab === 'usage' ? (
          <div className="overflow-x-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--interactive-border)] px-4 py-2.5">
              <div className="flex min-w-0 items-baseline gap-2">
                <span className="typography-ui-header font-semibold text-foreground">Rate limits</span>
                <span className="truncate typography-micro text-muted-foreground">
                  {formatTime(quotaLastUpdated)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-7 w-[10.5rem]">
                  <SortableTabsStrip
                    items={quotaDisplayTabItems}
                    activeId={quotaDisplayMode}
                    onSelect={(tabID) => void handleDisplayModeChange(tabID as QuotaDisplayMode)}
                    layoutMode="fit"
                    variant="active-pill"
                    activePillInsetClassName="gap-0.5 px-px py-0"
                    className="h-full"
                  />
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

            {!hasRateLimits ? (
              <div className="px-4 py-5 text-center">
                <span className="typography-ui-label text-muted-foreground">No rate limits available.</span>
              </div>
            ) : null}
            <HeaderQuotaGroups
              rateLimitGroups={rateLimitGroups}
              quotaDisplayMode={quotaDisplayMode}
              expandedFamilies={expandedFamilies}
              toggleFamilyExpanded={toggleFamilyExpanded}
              listClassName="py-2"
              dividerClassName="mx-4 my-2 border-t border-[var(--interactive-border)]"
            />
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
