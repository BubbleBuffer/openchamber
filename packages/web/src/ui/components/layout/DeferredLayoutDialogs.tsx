import React from 'react';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useDialogStore } from '@/stores/useDialogStore';
import { lazyWithChunkRecovery } from '@/lib/errors/chunkLoadRecovery';
import { DeferredMount } from './DeferredMount';

const CommandPalette = lazyWithChunkRecovery(() =>
  import('@/components/ui/CommandPalette').then((module) => ({ default: module.CommandPalette })),
);
const HelpDialog = lazyWithChunkRecovery(() =>
  import('@/components/ui/HelpDialog').then((module) => ({ default: module.HelpDialog })),
);
const OpenCodeStatusDialog = lazyWithChunkRecovery(() =>
  import('@/components/ui/OpenCodeStatusDialog').then((module) => ({ default: module.OpenCodeStatusDialog })),
);
const SettingsWindow = lazyWithChunkRecovery(() =>
  import('@/components/views/SettingsWindow').then((module) => ({ default: module.SettingsWindow })),
);
const MultiRunWindow = lazyWithChunkRecovery(() =>
  import('@/components/views/MultiRunWindow').then((module) => ({ default: module.MultiRunWindow })),
);
const MultiRunLauncher = lazyWithChunkRecovery(() =>
  import('@/components/multirun/MultiRunLauncher').then((module) => ({ default: module.MultiRunLauncher })),
);

export const GlobalDeferredDialogs: React.FC = () => {
  const commandOpen = useDialogStore((state) => state.isCommandPaletteOpen);
  const helpOpen = useDialogStore((state) => state.isHelpDialogOpen);
  const statusOpen = useDialogStore((state) => state.isOpenCodeStatusDialogOpen);

  return (
    <>
      <DeferredMount active={commandOpen}>
        <React.Suspense fallback={null}><CommandPalette /></React.Suspense>
      </DeferredMount>
      <DeferredMount active={helpOpen}>
        <React.Suspense fallback={null}><HelpDialog /></React.Suspense>
      </DeferredMount>
      <DeferredMount active={statusOpen}>
        <React.Suspense fallback={null}><OpenCodeStatusDialog /></React.Suspense>
      </DeferredMount>
    </>
  );
};

export const DesktopDeferredDialogs: React.FC = () => {
  const settingsOpen = useDialogStore((state) => state.isSettingsDialogOpen);
  const setSettingsOpen = useDialogStore((state) => state.setSettingsDialogOpen);
  const multiRunOpen = useDialogStore((state) => state.isMultiRunLauncherOpen);
  const setMultiRunOpen = useDialogStore((state) => state.setMultiRunLauncherOpen);
  const initialPrompt = useDialogStore((state) => state.multiRunLauncherPrefillPrompt);

  return (
    <>
      <DeferredMount active={settingsOpen}>
        <React.Suspense fallback={null}>
          <SettingsWindow open={settingsOpen} onOpenChange={setSettingsOpen} />
        </React.Suspense>
      </DeferredMount>
      <DeferredMount active={multiRunOpen}>
        <React.Suspense fallback={null}>
          <MultiRunWindow open={multiRunOpen} onOpenChange={setMultiRunOpen} initialPrompt={initialPrompt} />
        </React.Suspense>
      </DeferredMount>
    </>
  );
};

export const MobileDeferredMultiRunLauncher: React.FC = () => {
  const isOpen = useDialogStore((state) => state.isMultiRunLauncherOpen);
  const setOpen = useDialogStore((state) => state.setMultiRunLauncherOpen);
  const initialPrompt = useDialogStore((state) => state.multiRunLauncherPrefillPrompt);

  if (!isOpen) return null;

  return (
    <div className="absolute inset-0 z-10 bg-background">
      <ErrorBoundary>
        <React.Suspense fallback={null}>
          <MultiRunLauncher
            initialPrompt={initialPrompt}
            onCreated={() => setOpen(false)}
            onCancel={() => setOpen(false)}
          />
        </React.Suspense>
      </ErrorBoundary>
    </div>
  );
};
