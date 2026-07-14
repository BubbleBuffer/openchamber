import React from 'react';
import { ModelControls } from '../controls/ModelControls';
import { UnifiedControlsDrawer } from '../controls/UnifiedControlsDrawer';
import { MobileAgentButton } from '../controls/MobileAgentButton';
import { MobileModelButton } from '../controls/MobileModelButton';
import { ComposerAttachmentControls } from './ComposerAttachmentControls';
import { ComposerActionButtons } from './ComposerActionButtons';
import { PermissionAutoAcceptButton } from './PermissionAutoAcceptButton';
import type { MobileControlsPanel } from '../controls/mobileControlsUtils';

const MemoModelControls = React.memo(ModelControls);
const MemoUnifiedControlsDrawer = React.memo(UnifiedControlsDrawer);
const MemoMobileAgentButton = React.memo(MobileAgentButton);
const MemoMobileModelButton = React.memo(MobileModelButton);

interface ComposerMobileControlsProps {
  footerIconButtonClass: string;
  iconSizeClass: string;
  sendIconSizeClass: string;
  stopIconSizeClass: string;
  canSend: boolean;
  canAbort: boolean;
  hasContent: boolean;
  currentSessionId: string | null;
  newSessionDraftOpen: boolean;
  mobileControlsPanel: MobileControlsPanel;
  onOpenSettings?: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleLocalFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handlePickLocalFiles: () => void;
  handleOpenCommandMenu: () => void;
  openIssuePicker: () => void;
  openPrPicker: () => void;
  permissionScopeSessionId: string | null;
  permissionAutoAcceptEnabled: boolean;
  handlePermissionAutoAcceptToggle: () => void;
  onPrimaryAction: () => void;
  onQueueMessage: () => void;
  onAbort: () => void;
  onOpenMobileControls: () => void;
  onOpenAgentPanel: () => void;
  onCycleAgent: () => void;
  onMobilePanelChange: (panel: MobileControlsPanel) => void;
  onMobilePanelSelection: () => void;
  onAgentPanelSelection: () => void;
  mobileControlsOpen: boolean;
  onCloseMobileControls: () => void;
  handleOpenMobilePanel: (panel: MobileControlsPanel) => void;
  handleReturnToUnifiedControls: () => void;
}

export const ComposerMobileControls = React.memo(function ComposerMobileControls({
  footerIconButtonClass,
  iconSizeClass,
  sendIconSizeClass,
  stopIconSizeClass,
  canSend,
  canAbort,
  hasContent,
  currentSessionId,
  newSessionDraftOpen,
  mobileControlsPanel,
  onOpenSettings,
  fileInputRef,
  handleLocalFileSelect,
  handlePickLocalFiles,
  handleOpenCommandMenu,
  openIssuePicker,
  openPrPicker,
  permissionScopeSessionId,
  permissionAutoAcceptEnabled,
  handlePermissionAutoAcceptToggle,
  onPrimaryAction,
  onQueueMessage,
  onAbort,
  onOpenMobileControls,
  onOpenAgentPanel,
  onCycleAgent,
  onMobilePanelChange,
  onMobilePanelSelection,
  onAgentPanelSelection,
  mobileControlsOpen,
  onCloseMobileControls,
  handleOpenMobilePanel,
}: ComposerMobileControlsProps) {
  return (
    <>
      <div className="flex w-full items-center justify-between gap-x-1.5">
        <div className="flex items-center gap-x-1.5">
          <ComposerAttachmentControls
            isMobile={true}
            footerIconButtonClass={footerIconButtonClass}
            iconSizeClass={iconSizeClass}
            fileInputRef={fileInputRef}
            handleLocalFileSelect={handleLocalFileSelect}
            handlePickLocalFiles={handlePickLocalFiles}
            handleOpenCommandMenu={handleOpenCommandMenu}
            openIssuePicker={openIssuePicker}
            openPrPicker={openPrPicker}
            onOpenSettings={onOpenSettings}
          />
          <PermissionAutoAcceptButton
            footerIconButtonClass={footerIconButtonClass}
            iconSizeClass={iconSizeClass}
            permissionScopeSessionId={permissionScopeSessionId}
            permissionAutoAcceptEnabled={permissionAutoAcceptEnabled}
            handlePermissionAutoAcceptToggle={handlePermissionAutoAcceptToggle}
          />
        </div>
        <div className="flex items-center min-w-0 gap-x-1 justify-end">
          <div className="flex items-center gap-x-1 min-w-0 max-w-[60vw] flex-shrink">
            <MemoMobileModelButton onOpenModel={onOpenMobileControls} className="min-w-0 flex-shrink" />
            <MemoMobileAgentButton
              onOpenAgentPanel={onOpenAgentPanel}
              onCycleAgent={onCycleAgent}
              className="min-w-0 flex-shrink"
            />
          </div>
          <div className="flex items-center gap-x-1 flex-shrink-0">
            <ComposerActionButtons
              isMobile={true}
              footerIconButtonClass={footerIconButtonClass}
              sendIconSizeClass={sendIconSizeClass}
              stopIconSizeClass={stopIconSizeClass}
              canSend={canSend}
              canAbort={canAbort}
              hasContent={!!hasContent}
              currentSessionId={currentSessionId}
              newSessionDraftOpen={newSessionDraftOpen}
              onPrimaryAction={onPrimaryAction}
              onQueueMessage={onQueueMessage}
              onAbort={onAbort}
            />
          </div>
        </div>
      </div>
      <MemoModelControls
        className="hidden"
        mobilePanel={mobileControlsPanel}
        onMobilePanelChange={onMobilePanelChange}
        onMobilePanelSelection={onMobilePanelSelection}
        onAgentPanelSelection={onAgentPanelSelection}
      />
      <MemoUnifiedControlsDrawer
        open={mobileControlsOpen}
        onClose={onCloseMobileControls}
        onOpenModel={() => handleOpenMobilePanel('model')}
        onOpenEffort={() => handleOpenMobilePanel('variant')}
      />
    </>
  );
});
