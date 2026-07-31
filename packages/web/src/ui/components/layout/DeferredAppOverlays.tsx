import React from 'react';
import { ConfigUpdateOverlay } from '@/components/ui/ConfigUpdateOverlay';
import { useDialogStore } from '@/stores/useDialogStore';
import { lazyWithChunkRecovery } from '@/lib/errors/chunkLoadRecovery';
import { DeferredMount } from './DeferredMount';

const AboutDialog = lazyWithChunkRecovery(() =>
  import('@/components/ui/AboutDialog').then((module) => ({ default: module.AboutDialog })),
);
const MemoryDebugPanel = lazyWithChunkRecovery(() =>
  import('@/components/ui/MemoryDebugPanel').then((module) => ({ default: module.MemoryDebugPanel })),
);
const QuickOpenDialog = lazyWithChunkRecovery(() =>
  import('@/components/ui/QuickOpenDialog').then((module) => ({ default: module.QuickOpenDialog })),
);

type DeferredAppOverlaysProps = {
  showMemoryDebug: boolean;
  onCloseMemoryDebug: () => void;
};

export const DeferredAppOverlays: React.FC<DeferredAppOverlaysProps> = ({
  showMemoryDebug,
  onCloseMemoryDebug,
}) => {
  const isAboutDialogOpen = useDialogStore((state) => state.isAboutDialogOpen);
  const setAboutDialogOpen = useDialogStore((state) => state.setAboutDialogOpen);
  const isQuickOpenOpen = useDialogStore((state) => state.isQuickOpenOpen);

  return (
    <>
      <ConfigUpdateOverlay />
      <DeferredMount active={isQuickOpenOpen}>
        <React.Suspense fallback={null}>
          <QuickOpenDialog />
        </React.Suspense>
      </DeferredMount>
      <DeferredMount active={isAboutDialogOpen}>
        <React.Suspense fallback={null}>
          <AboutDialog open={isAboutDialogOpen} onOpenChange={setAboutDialogOpen} />
        </React.Suspense>
      </DeferredMount>
      {showMemoryDebug && (
        <React.Suspense fallback={null}>
          <MemoryDebugPanel onClose={onCloseMemoryDebug} />
        </React.Suspense>
      )}
    </>
  );
};
