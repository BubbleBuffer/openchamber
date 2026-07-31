import React from 'react';
import type { EditorView } from '@codemirror/view';
import {
  RiCheckLine,
  RiClipboardLine,
  RiCodeSSlashLine,
  RiDownloadLine,
  RiFileCopy2Line,
  RiFullscreenExitLine,
  RiFullscreenLine,
  RiLoader4Line,
  RiMenuFold2Line,
  RiMore2Fill,
  RiNodeTree,
  RiSave3Line,
  RiSearchLine,
  RiTextWrap,
} from '@remixicon/react';

import { GoToLineDialog } from '../GoToLineDialog';
import { PreviewToggleButton } from '../PreviewToggleButton';
import { toast } from '@/components/ui';
import { Button } from '@/components/ui/button';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn, getModifierLabel } from '@/lib/utils';

export interface FileViewerControlsProps {
  autoSaveStatus: 'idle' | 'saved';
  canCopy: boolean;
  canCopyPath: boolean;
  canEdit: boolean;
  displayPath: string;
  editorView: EditorView | null;
  fileContent: string;
  isDirty: boolean;
  isFullscreen: boolean;
  isGoToLineOpen: boolean;
  isHtml: boolean;
  isJson: boolean;
  isMarkdown: boolean;
  isMobile: boolean;
  isSaving: boolean;
  isSelectedImage: boolean;
  jsonViewMode: 'tree' | 'text';
  mode: 'full' | 'editor-only';
  onDownload?: () => void;
  onFullscreenChange: (fullscreen: boolean) => void;
  onGoToLineOpenChange: (open: boolean) => void;
  onJsonViewModeChange: (mode: 'tree' | 'text') => void;
  onPreviewModeChange: (mode: 'preview' | 'edit') => void;
  onSave: () => void;
  onSearchOpenChange: (open: boolean) => void;
  onWrapLinesChange: (wrap: boolean) => void;
  previewMode: 'preview' | 'edit';
  textViewMode: 'view' | 'edit';
  wrapLines: boolean;
  exitFullscreenOnly?: boolean;
}

export const FileViewerControls: React.FC<FileViewerControlsProps> = ({
  autoSaveStatus,
  canCopy,
  canCopyPath,
  canEdit,
  displayPath,
  editorView,
  exitFullscreenOnly = false,
  fileContent,
  isDirty,
  isFullscreen,
  isGoToLineOpen,
  isHtml,
  isJson,
  isMarkdown,
  isMobile,
  isSaving,
  isSelectedImage,
  jsonViewMode,
  mode,
  onDownload,
  onFullscreenChange,
  onGoToLineOpenChange,
  onJsonViewModeChange,
  onPreviewModeChange,
  onSave,
  onSearchOpenChange,
  onWrapLinesChange,
  previewMode,
  textViewMode,
  wrapLines,
}) => {
  const [copied, setCopied] = React.useState<'content' | 'path' | null>(null);
  const copiedTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => () => {
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }
  }, []);

  const copy = React.useCallback(async (kind: 'content' | 'path', value: string) => {
    const result = await copyTextToClipboard(value);
    if (!result.ok) {
      toast.error('Copy failed');
      return;
    }
    setCopied(kind);
    if (copiedTimeoutRef.current !== null) {
      window.clearTimeout(copiedTimeoutRef.current);
    }
    copiedTimeoutRef.current = window.setTimeout(() => setCopied(null), 1200);
  }, []);

  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-1 shadow-sm">
      {canEdit && textViewMode === 'edit' && (
        isSaving ? (
          <span className="flex items-center gap-1 px-1 text-muted-foreground typography-meta">
            <RiLoader4Line className="h-3.5 w-3.5 animate-spin" />
            Saving...
          </span>
        ) : autoSaveStatus === 'saved' && !isDirty ? (
          <span className="flex items-center gap-1 px-1 text-[color:var(--status-success)] typography-meta">
            <RiCheckLine className="h-3.5 w-3.5" />
            Saved
          </span>
        ) : isDirty ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSave}
            className="h-6 gap-1 px-1 text-muted-foreground opacity-80 hover:bg-transparent hover:opacity-100 focus-visible:bg-transparent active:bg-transparent"
            title={`Save now (${getModifierLabel()}+S) - auto-saves after 1.5s`}
            aria-label={`Save (${getModifierLabel()}+S)`}
          >
            <RiSave3Line className="h-4 w-4" />
          </Button>
        ) : null
      )}

      {!isSelectedImage && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onWrapLinesChange(!wrapLines)}
            className={cn(
              'h-6 w-6 p-0 transition-opacity hover:bg-transparent focus-visible:bg-transparent active:bg-transparent',
              wrapLines ? 'text-foreground opacity-100' : 'text-muted-foreground opacity-65 hover:opacity-100',
            )}
            title={wrapLines ? 'Disable line wrap' : 'Enable line wrap'}
          >
            <RiTextWrap className="size-4" />
          </Button>
          {textViewMode === 'edit' && (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  onSearchOpenChange(true);
                  event.currentTarget.blur();
                }}
                className="h-6 w-6 p-0 text-foreground opacity-100 transition-opacity hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
                title="Find in file"
              >
                <RiSearchLine className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(event) => {
                  onGoToLineOpenChange(!isGoToLineOpen);
                  event.currentTarget.blur();
                }}
                className="h-6 w-6 p-0 text-foreground opacity-100 transition-opacity hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
                title="Go to line"
              >
                <RiMenuFold2Line className="size-4" />
              </Button>
              <GoToLineDialog
                open={isGoToLineOpen}
                onOpenChange={onGoToLineOpenChange}
                view={editorView}
                variant="inline"
              />
            </>
          )}
        </>
      )}

      {(isMarkdown || isHtml) && (
        <PreviewToggleButton
          currentMode={previewMode}
          onToggle={() => onPreviewModeChange(previewMode === 'preview' ? 'edit' : 'preview')}
        />
      )}

      {isJson && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onJsonViewModeChange(jsonViewMode === 'tree' ? 'text' : 'tree')}
          className="h-6 w-6 p-0 text-muted-foreground opacity-65 hover:bg-transparent hover:opacity-100 focus-visible:bg-transparent active:bg-transparent"
          title={jsonViewMode === 'tree' ? 'Switch to Text View' : 'Switch to Tree View'}
        >
          {jsonViewMode === 'tree' ? (
            <RiCodeSSlashLine className="size-4" />
          ) : (
            <RiNodeTree className="size-4" />
          )}
        </Button>
      )}

      {canCopy && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy('content', fileContent)}
          className="h-6 w-6 p-0 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
          title="Copy file contents"
          aria-label="Copy file contents"
        >
          {copied === 'content' ? (
            <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
          ) : (
            <RiClipboardLine className="h-4 w-4" />
          )}
        </Button>
      )}

      {canCopyPath && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void copy('path', displayPath)}
          className="h-6 w-6 p-0 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
          title={`Copy file path (${displayPath})`}
          aria-label={`Copy file path (${displayPath})`}
        >
          {copied === 'path' ? (
            <RiCheckLine className="h-4 w-4 text-[color:var(--status-success)]" />
          ) : (
            <RiFileCopy2Line className="h-4 w-4" />
          )}
        </Button>
      )}

      {onDownload && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDownload}
          className="h-6 w-6 p-0 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
          title="Save file"
          aria-label="Save file"
        >
          <RiDownloadLine className="h-4 w-4" />
        </Button>
      )}

      {exitFullscreenOnly ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFullscreenChange(false)}
          className="h-6 w-6 p-0 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
          title="Exit fullscreen"
          aria-label="Exit fullscreen"
        >
          <RiFullscreenExitLine className="h-4 w-4" />
        </Button>
      ) : (!isMobile && mode === 'full' && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onFullscreenChange(!isFullscreen)}
          className="h-6 w-6 p-0 hover:bg-transparent focus-visible:bg-transparent active:bg-transparent"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <RiFullscreenExitLine className="h-4 w-4" />
          ) : (
            <RiFullscreenLine className="h-4 w-4" />
          )}
        </Button>
      ))}
    </div>
  );
};

export const FloatingFileViewerControls: React.FC<FileViewerControlsProps> = (props) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    const closeOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-slot="dropdown-menu-content"], [data-slot="dropdown-menu-item"]')) {
        return;
      }
      if (containerRef.current && !containerRef.current.contains(target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOutside);
    return () => document.removeEventListener('mousedown', closeOutside);
  }, [open]);

  return (
    <div
      ref={containerRef}
      className="absolute right-3 top-3 z-30"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <FileViewerControls {...props} />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          className="h-8 w-8 rounded-lg border border-[var(--interactive-border)] bg-[var(--surface-elevated)] p-0 text-muted-foreground shadow-sm hover:text-foreground"
          aria-label="Show editor controls"
          title="Editor controls"
        >
          <RiMore2Fill className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};
