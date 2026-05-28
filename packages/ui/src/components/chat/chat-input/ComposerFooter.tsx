import React from 'react';
import { BrowserVoiceButton } from '@/components/voice';
import { ModelControls } from '../controls/ModelControls';
import { ComposerAttachmentControls } from './ComposerAttachmentControls';
import { ComposerActionButtons } from './ComposerActionButtons';
import { FocusModeButton } from './FocusModeButton';
import { PermissionAutoAcceptButton } from './PermissionAutoAcceptButton';
import { cn } from '@/lib/utils';

const MemoModelControls = React.memo(ModelControls);

interface ComposerFooterProps {
  isVSCode: boolean;
  footerIconButtonClass: string;
  footerGapClass: string;
  iconSizeClass: string;
  sendIconSizeClass: string;
  stopIconSizeClass: string;
  canSend: boolean;
  canAbort: boolean;
  hasContent: boolean;
  currentSessionId: string | null;
  newSessionDraftOpen: boolean;
  isExpandedInput: boolean;
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
  onToggleExpandedInput: () => void;
}

export const ComposerFooter = React.memo(function ComposerFooter({
  isVSCode,
  footerIconButtonClass,
  footerGapClass,
  iconSizeClass,
  sendIconSizeClass,
  stopIconSizeClass,
  canSend,
  canAbort,
  hasContent,
  currentSessionId,
  newSessionDraftOpen,
  isExpandedInput,
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
  onToggleExpandedInput,
}: ComposerFooterProps) {
  return (
    <>
      <div className={cn("flex items-center flex-shrink-0", footerGapClass)}>
        <ComposerAttachmentControls
          isMobile={false}
          isVSCode={isVSCode}
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
        <FocusModeButton
          footerIconButtonClass={footerIconButtonClass}
          iconSizeClass={iconSizeClass}
          isExpandedInput={isExpandedInput}
          onToggle={onToggleExpandedInput}
        />
        <PermissionAutoAcceptButton
          footerIconButtonClass={footerIconButtonClass}
          iconSizeClass={iconSizeClass}
          permissionScopeSessionId={permissionScopeSessionId}
          permissionAutoAcceptEnabled={permissionAutoAcceptEnabled}
          handlePermissionAutoAcceptToggle={handlePermissionAutoAcceptToggle}
          withTooltip
        />
      </div>
      <div className={cn('flex items-center flex-1 justify-end', footerGapClass, 'md:gap-x-3')}>
        <MemoModelControls className={cn('flex-1 min-w-0 justify-end')} />
        <BrowserVoiceButton />
        <ComposerActionButtons
          isMobile={false}
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
    </>
  );
});