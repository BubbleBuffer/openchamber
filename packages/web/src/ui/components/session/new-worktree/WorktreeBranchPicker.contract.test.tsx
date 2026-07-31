import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { WorktreeBranchPicker } from './WorktreeBranchPicker';

const renderPicker = (value: string) => renderToStaticMarkup(
  <WorktreeBranchPicker
    isMobile
    title="Select Branch"
    value={value}
    placeholder="Choose a branch..."
    localBranches={['main']}
    remoteBranches={['origin/feature']}
    isLoading={false}
    canFetch
    onFetch={() => undefined}
    onSelect={() => undefined}
  />,
);

describe('WorktreeBranchPicker', () => {
  it('renders the empty selection and fetch affordance', () => {
    const markup = renderPicker('');

    expect(markup).toContain('Choose a branch...');
    expect(markup).toContain('title="Fetch branches"');
  });

  it('renders the selected branch instead of the placeholder', () => {
    const markup = renderPicker('remotes/origin/feature');

    expect(markup).toContain('remotes/origin/feature');
    expect(markup).not.toContain('Choose a branch...');
  });
});
