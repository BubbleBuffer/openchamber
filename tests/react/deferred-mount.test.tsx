import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { DeferredMount } from '@/components/layout/DeferredMount';

describe('DeferredMount', () => {
  test('defers inactive content, then preserves it after the first activation', () => {
    const { rerender } = render(
      <DeferredMount active={false}>
        <div>Deferred content</div>
      </DeferredMount>,
    );

    expect(screen.queryByText('Deferred content')).toBeNull();

    rerender(
      <DeferredMount active>
        <div>Deferred content</div>
      </DeferredMount>,
    );
    expect(screen.getByText('Deferred content')).toBeTruthy();

    rerender(
      <DeferredMount active={false}>
        <div>Deferred content</div>
      </DeferredMount>,
    );
    expect(screen.getByText('Deferred content')).toBeTruthy();
  });
});
