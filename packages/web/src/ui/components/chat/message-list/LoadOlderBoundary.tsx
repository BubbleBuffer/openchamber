import React from 'react';
import { LoadOlderButton } from '../turn/LoadOlderButton';

interface LoadOlderBoundaryProps {
  isLoadingOlder: boolean;
  hasMoreAbove: boolean;
  turnStart: number;
  onLoadEarlier: () => void;
}

export const LoadOlderBoundary = React.memo(function LoadOlderBoundary({
  isLoadingOlder,
  hasMoreAbove,
  turnStart,
  onLoadEarlier,
}: LoadOlderBoundaryProps) {
  return (
    <LoadOlderButton
      hasMoreAbove={turnStart > 0 || hasMoreAbove}
      isLoadingOlder={isLoadingOlder}
      onLoadOlder={onLoadEarlier}
    />
  );
});
