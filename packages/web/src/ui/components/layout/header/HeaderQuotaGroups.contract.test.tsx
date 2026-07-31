import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HeaderQuotaGroups, type RateLimitGroup } from './HeaderQuotaGroups';

const rateLimitGroups: RateLimitGroup[] = [{
  providerId: 'codex',
  providerName: 'Codex',
  entries: [[
    '5h',
    {
      usedPercent: 75,
      remainingPercent: 25,
      windowSeconds: null,
      resetAfterSeconds: null,
      resetAt: null,
      resetAtFormatted: null,
      resetAfterFormatted: 'in 2 hours',
    },
  ]],
}];

const renderGroups = (quotaDisplayMode: 'usage' | 'remaining') => renderToStaticMarkup(
  <HeaderQuotaGroups
    rateLimitGroups={rateLimitGroups}
    quotaDisplayMode={quotaDisplayMode}
    expandedFamilies={{}}
    toggleFamilyExpanded={() => undefined}
    listClassName="quota-list"
    dividerClassName="quota-divider"
  />,
);

describe('HeaderQuotaGroups', () => {
  it('preserves the usage presentation after extraction from Header', () => {
    const markup = renderGroups('usage');

    expect(markup).toContain('Codex');
    expect(markup).toContain('5-Hour');
    expect(markup).toContain('in 2 hours');
    expect(markup).toContain('75%');
  });

  it('switches the same quota row to remaining percentage', () => {
    expect(renderGroups('remaining')).toContain('25%');
  });
});
