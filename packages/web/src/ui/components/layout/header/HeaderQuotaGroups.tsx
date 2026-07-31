import React from 'react';
import { RiArrowDownSLine, RiArrowRightSLine } from '@remixicon/react';

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ProviderLogo } from '@/components/ui/ProviderLogo';
import { PaceIndicator } from '@/components/sections/usage/PaceIndicator';
import { UsageProgressBar } from '@/components/sections/usage/UsageProgressBar';
import {
  calculateExpectedUsagePercent,
  calculatePace,
  formatPercent,
  formatWindowLabel,
} from '@/lib/quota';
import { getDisplayModelName } from '@/lib/quota/model-families';
import type { UsageWindow } from '@/types';

export type QuotaDisplayMode = 'usage' | 'remaining';

export interface RateLimitGroup {
  providerId: string;
  providerName: string;
  entries: Array<[string, UsageWindow]>;
  error?: string;
  modelFamilies?: Array<{
    familyId: string | null;
    familyLabel: string;
    models: Array<[string, UsageWindow]>;
  }>;
}

type HeaderQuotaGroupsProps = {
  rateLimitGroups: RateLimitGroup[];
  quotaDisplayMode: QuotaDisplayMode;
  expandedFamilies: Record<string, string[]>;
  toggleFamilyExpanded: (providerId: string, familyId: string) => void;
  listClassName: string;
  dividerClassName: string;
};

const quotaPresentation = (
  window: UsageWindow,
  quotaDisplayMode: QuotaDisplayMode,
  label?: string,
) => {
  const displayPercent = quotaDisplayMode === 'remaining'
    ? window.remainingPercent
    : window.usedPercent;
  const paceInfo = calculatePace(window.usedPercent, window.resetAt, window.windowSeconds, label);
  const expectedMarker = paceInfo?.dailyAllocationPercent != null
    ? (
      quotaDisplayMode === 'remaining'
        ? 100 - calculateExpectedUsagePercent(paceInfo.elapsedRatio)
        : calculateExpectedUsagePercent(paceInfo.elapsedRatio)
    )
    : null;

  return { displayPercent, paceInfo, expectedMarker };
};

export const HeaderQuotaGroups = React.memo(function HeaderQuotaGroups({
  rateLimitGroups,
  quotaDisplayMode,
  expandedFamilies,
  toggleFamilyExpanded,
  listClassName,
  dividerClassName,
}: HeaderQuotaGroupsProps) {
  return (
    <div className={listClassName}>
      {rateLimitGroups.map((group, index) => {
        const providerExpandedFamilies = expandedFamilies[group.providerId] ?? [];

        return (
          <React.Fragment key={group.providerId}>
            {index > 0 ? <div className={dividerClassName} /> : null}
            <div className="flex items-center gap-2 px-4 py-2">
              <ProviderLogo providerId={group.providerId} className="h-4 w-4" />
              <span className="typography-ui-label font-medium text-foreground">
                {group.providerName}
              </span>
            </div>

            {group.entries.length === 0 && (!group.modelFamilies || group.modelFamilies.length === 0) ? (
              <div className="px-4 pb-2">
                <span className="typography-ui-label text-muted-foreground">
                  {group.error ?? 'No rate limits reported.'}
                </span>
              </div>
            ) : (
              <div className="space-y-3 px-4 pb-2">
                {group.entries.map(([label, window]) => {
                  const { displayPercent, paceInfo, expectedMarker } = quotaPresentation(
                    window,
                    quotaDisplayMode,
                    label,
                  );

                  return (
                    <div key={`${group.providerId}-${label}`} className="flex flex-col gap-1.5">
                      <div className="flex min-w-0 items-center justify-between gap-3">
                        <div className="min-w-0 flex items-center gap-2">
                          <span className="truncate typography-ui-label text-foreground">
                            {formatWindowLabel(label)}
                          </span>
                          {window.resetAfterFormatted ?? window.resetAtFormatted ? (
                            <span className="truncate typography-micro text-muted-foreground">
                              {window.resetAfterFormatted ?? window.resetAtFormatted}
                            </span>
                          ) : null}
                        </div>
                        <span className="typography-ui-label tabular-nums text-foreground">
                          {formatPercent(displayPercent) === '-' ? '' : formatPercent(displayPercent)}
                        </span>
                      </div>
                      <UsageProgressBar
                        percent={displayPercent}
                        tonePercent={window.usedPercent}
                        className="h-1.5"
                        expectedMarkerPercent={expectedMarker}
                      />
                      {paceInfo ? <PaceIndicator paceInfo={paceInfo} compact /> : null}
                    </div>
                  );
                })}

                {group.modelFamilies && group.modelFamilies.length > 0 ? (
                  <div className="space-y-0.5">
                    {group.modelFamilies.map((family) => {
                      const familyKey = family.familyId ?? 'other';
                      const isExpanded = providerExpandedFamilies.includes(familyKey);

                      return (
                        <Collapsible
                          key={familyKey}
                          open={isExpanded}
                          onOpenChange={() => toggleFamilyExpanded(group.providerId, familyKey)}
                        >
                          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-1.5 text-left hover:bg-[var(--interactive-hover)]/50 transition-colors">
                            <span className="typography-ui-label font-medium text-foreground">
                              {family.familyLabel}
                            </span>
                            {isExpanded ? (
                              <RiArrowDownSLine className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <RiArrowRightSLine className="h-4 w-4 text-muted-foreground" />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-2.5 pb-1 pl-1 pt-1">
                              {family.models.map(([modelName, window]) => {
                                const { displayPercent, paceInfo, expectedMarker } = quotaPresentation(
                                  window,
                                  quotaDisplayMode,
                                );

                                return (
                                  <div
                                    key={`${group.providerId}-${modelName}`}
                                    className="flex flex-col gap-1.5"
                                  >
                                    <div className="flex min-w-0 items-center justify-between gap-3">
                                      <span className="truncate typography-micro text-muted-foreground">
                                        {getDisplayModelName(modelName)}
                                      </span>
                                      <span className="typography-ui-label tabular-nums text-foreground">
                                        {formatPercent(displayPercent) === '-' ? '' : formatPercent(displayPercent)}
                                      </span>
                                    </div>
                                    <UsageProgressBar
                                      percent={displayPercent}
                                      tonePercent={window.usedPercent}
                                      className="h-1.5"
                                      expectedMarkerPercent={expectedMarker}
                                    />
                                    {paceInfo ? <PaceIndicator paceInfo={paceInfo} compact /> : null}
                                  </div>
                                );
                              })}
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
});
