import React from 'react';
import {
  RiDeleteBinLine,
  RiDownloadLine,
  RiEditLine,
  RiFileAddLine,
  RiFileCopy2Line,
  RiFileCopyLine,
  RiFolder3Fill,
  RiFolderAddLine,
  RiFolderOpenFill,
  RiMore2Fill,
} from '@remixicon/react';

import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from '@/components/ui';
import { copyTextToClipboard } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { getDisplayPath, type FileNode, type FileStatus } from './nodeUtils';

export type FileMutationKind = 'createFile' | 'createFolder' | 'rename' | 'delete';

export type FileMutationTarget = {
  path: string;
  name?: string;
  type?: 'file' | 'directory';
};

interface FileRowProps {
  node: FileNode;
  root: string;
  isExpanded: boolean;
  isActive: boolean;
  isMobile: boolean;
  status?: FileStatus | null;
  badge?: { modified: number; added: number } | null;
  permissions: {
    canRename: boolean;
    canCreateFile: boolean;
    canCreateFolder: boolean;
    canDelete: boolean;
  };
  downloadFile?: (path: string) => Promise<void>;
  contextMenuPath: string | null;
  setContextMenuPath: (path: string | null) => void;
  onSelect: (node: FileNode) => void;
  onToggle: (path: string) => void;
  onOpenDialog: (type: FileMutationKind, data: FileMutationTarget) => void;
}

const FileStatusDot: React.FC<{ status: FileStatus }> = ({ status }) => {
  const color = {
    open: 'var(--status-info)',
    modified: 'var(--status-warning)',
    'git-modified': 'var(--status-warning)',
    'git-added': 'var(--status-success)',
    'git-deleted': 'var(--status-error)',
  }[status];

  return <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />;
};

export const FileRow: React.FC<FileRowProps> = ({
  node,
  root,
  isExpanded,
  isActive,
  isMobile,
  status,
  badge,
  permissions,
  downloadFile,
  contextMenuPath,
  setContextMenuPath,
  onSelect,
  onToggle,
  onOpenDialog,
}) => {
  const isDir = node.type === 'directory';
  const { canRename, canCreateFile, canCreateFolder, canDelete } = permissions;

  const handleContextMenu = React.useCallback((event?: React.MouseEvent) => {
    if (!canRename && !canCreateFile && !canCreateFolder && !canDelete) return;
    event?.preventDefault();
    setContextMenuPath(node.path);
  }, [canRename, canCreateFile, canCreateFolder, canDelete, node.path, setContextMenuPath]);

  const handleInteraction = React.useCallback(() => {
    if (isDir) {
      onToggle(node.path);
      return;
    }
    onSelect(node);
  }, [isDir, node, onSelect, onToggle]);

  const handleMenuButtonClick = React.useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setContextMenuPath(node.path);
  }, [node.path, setContextMenuPath]);

  return (
    <div
      className="group relative flex items-center"
      onContextMenu={!isMobile ? handleContextMenu : undefined}
    >
      <button
        type="button"
        onClick={handleInteraction}
        onContextMenu={!isMobile ? handleContextMenu : undefined}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground transition-colors pr-8 select-none',
          isActive ? 'bg-interactive-selection/70' : 'hover:bg-interactive-hover/40',
        )}
      >
        {isDir
          ? (isExpanded
            ? <RiFolderOpenFill className="h-4 w-4 flex-shrink-0 text-primary/60" />
            : <RiFolder3Fill className="h-4 w-4 flex-shrink-0 text-primary/60" />)
          : <FileTypeIcon filePath={node.path} extension={node.extension} />}
        <span className="min-w-0 flex-1 truncate typography-meta" title={node.path}>
          {node.name}
        </span>
        {!isDir && status ? <FileStatusDot status={status} /> : null}
        {isDir && badge ? (
          <span className="text-xs flex items-center gap-1 ml-auto mr-1">
            {badge.modified > 0 ? <span className="text-[var(--status-warning)]">M{badge.modified}</span> : null}
            {badge.added > 0 ? <span className="text-[var(--status-success)]">+{badge.added}</span> : null}
          </span>
        ) : null}
      </button>
      {(canRename || canCreateFile || canCreateFolder || canDelete) ? (
        <div className={cn(
          'absolute right-1 top-1/2 -translate-y-1/2',
          !isMobile && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100',
          isMobile && 'opacity-100',
        )}>
          <DropdownMenu
            open={contextMenuPath === node.path}
            onOpenChange={(open) => setContextMenuPath(open ? node.path : null)}
          >
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleMenuButtonClick}
              >
                <RiMore2Fill className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" onCloseAutoFocus={() => setContextMenuPath(null)}>
              {canRename ? (
                <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onOpenDialog('rename', node); }}>
                  <RiEditLine className="mr-2 h-4 w-4" /> Rename
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={(event) => {
                event.stopPropagation();
                void copyTextToClipboard(node.path).then((result) => {
                  if (result.ok) {
                    toast.success('Path copied');
                    return;
                  }
                  toast.error('Copy failed');
                });
              }}>
                <RiFileCopyLine className="mr-2 h-4 w-4" /> Copy Path
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(event) => {
                event.stopPropagation();
                const relativePath = getDisplayPath(root, node.path) || node.path;
                void copyTextToClipboard(relativePath).then((result) => {
                  if (result.ok) {
                    toast.success('Relative path copied');
                    return;
                  }
                  toast.error('Copy failed');
                });
              }}>
                <RiFileCopy2Line className="mr-2 h-4 w-4" /> Copy Relative Path
              </DropdownMenuItem>
              {!isDir && downloadFile ? (
                <DropdownMenuItem onClick={(event) => {
                  event.stopPropagation();
                  void downloadFile(node.path);
                }}>
                  <RiDownloadLine className="mr-2 h-4 w-4" /> Save
                </DropdownMenuItem>
              ) : null}
              {isDir && (canCreateFile || canCreateFolder) ? (
                <>
                  <DropdownMenuSeparator />
                  {canCreateFile ? (
                    <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onOpenDialog('createFile', node); }}>
                      <RiFileAddLine className="mr-2 h-4 w-4" /> New File
                    </DropdownMenuItem>
                  ) : null}
                  {canCreateFolder ? (
                    <DropdownMenuItem onClick={(event) => { event.stopPropagation(); onOpenDialog('createFolder', node); }}>
                      <RiFolderAddLine className="mr-2 h-4 w-4" /> New Folder
                    </DropdownMenuItem>
                  ) : null}
                </>
              ) : null}
              {canDelete ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={(event) => { event.stopPropagation(); onOpenDialog('delete', node); }}
                    className="text-destructive focus:text-destructive"
                  >
                    <RiDeleteBinLine className="mr-2 h-4 w-4" /> Delete
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}
    </div>
  );
};
