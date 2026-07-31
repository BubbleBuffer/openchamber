import React from 'react';
import {
  RiArrowDownSLine,
  RiArrowLeftSLine,
  RiCloseLine,
} from '@remixicon/react';

import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useRuntimeStore } from '@/stores/useRuntimeStore';
import { getDisplayPath, type FileNode } from './nodeUtils';

interface EditorTabsProps {
  openFiles: FileNode[];
  selectedFile: FileNode | null;
  root: string;
  showMobilePageContent: boolean;
  setShowMobilePageContent: React.Dispatch<React.SetStateAction<boolean>>;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (path: string) => void;
}

export const EditorTabs = React.memo(function EditorTabs({
  openFiles,
  selectedFile,
  root,
  showMobilePageContent,
  setShowMobilePageContent,
  onSelectFile,
  onCloseFile,
}: EditorTabsProps) {
  const isMobile = useRuntimeStore((state) => state.isMobile);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = React.useState({ left: false, right: false });

  const updateOverflow = React.useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    const nextOverflow = {
      left: element.scrollLeft > 2,
      right: element.scrollLeft + element.clientWidth < element.scrollWidth - 2,
    };
    setOverflow((current) => (
      current.left === nextOverflow.left && current.right === nextOverflow.right
        ? current
        : nextOverflow
    ));
  }, []);

  React.useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;

    updateOverflow();
    element.addEventListener('scroll', updateOverflow, { passive: true });
    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(element);

    return () => {
      element.removeEventListener('scroll', updateOverflow);
      resizeObserver.disconnect();
    };
  }, [openFiles.length, updateOverflow]);

  return (
    <div className="flex min-w-0 items-center px-3 py-1.5">
      {isMobile && showMobilePageContent ? (
        <button
          type="button"
          onClick={() => setShowMobilePageContent(false)}
          aria-label="Back"
          className="mr-1 inline-flex h-7 w-7 flex-shrink-0 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <RiArrowLeftSLine className="h-5 w-5" />
        </button>
      ) : null}

      {isMobile ? (
        selectedFile ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex min-w-0 max-w-full items-center gap-1 text-left typography-ui-label font-medium"
                aria-label="Open files"
              >
                <FileTypeIcon
                  filePath={selectedFile.path}
                  extension={selectedFile.extension}
                  className="h-3.5 w-3.5 flex-shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{selectedFile.name}</span>
                <RiArrowDownSLine className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[16rem]">
              {openFiles.map((file) => {
                const isActive = selectedFile.path === file.path;
                return (
                  <DropdownMenuItem
                    key={file.path}
                    onSelect={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest('[data-close-open-file]')) {
                        event.preventDefault();
                        return;
                      }
                      if (!isActive) {
                        onSelectFile(file);
                      }
                    }}
                    className={cn(
                      'flex items-center justify-between gap-2',
                      isActive && 'bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]',
                    )}
                  >
                    <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
                      <FileTypeIcon
                        filePath={file.path}
                        extension={file.extension}
                        className="h-3.5 w-3.5 flex-shrink-0"
                      />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    </span>
                    <button
                      type="button"
                      data-close-open-file
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onCloseFile(file.path);
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)]"
                      aria-label={`Close ${file.name}`}
                    >
                      <RiCloseLine className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <div className="truncate typography-ui-label font-medium">Select a file</div>
        )
      ) : openFiles.length > 0 ? (
        <div className="relative min-w-0 flex-1">
          {overflow.left ? (
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent" />
          ) : null}
          {overflow.right ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent" />
          ) : null}
          <div
            ref={scrollRef}
            className="flex min-w-0 items-center gap-1 overflow-x-auto scrollbar-none"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {openFiles.map((file) => {
              const isActive = selectedFile?.path === file.path;
              return (
                <div
                  key={file.path}
                  title={getDisplayPath(root, file.path)}
                  className={cn(
                    'group inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 typography-ui-label transition-colors',
                    isActive
                      ? 'border-[var(--primary-muted)] bg-[var(--interactive-selection)] text-[var(--interactive-selection-foreground)]'
                      : 'border-[var(--interactive-border)] bg-transparent text-[var(--surface-muted-foreground)] hover:bg-[var(--interactive-hover)] hover:text-[var(--surface-foreground)]',
                  )}
                >
                  <FileTypeIcon
                    filePath={file.path}
                    extension={file.extension}
                    className="h-3.5 w-3.5 flex-shrink-0"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!isActive) {
                        onSelectFile(file);
                      }
                    }}
                    className="max-w-[12rem] truncate text-left"
                  >
                    {file.name}
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCloseFile(file.path);
                    }}
                    className={cn(
                      'rounded-sm p-0.5 text-[var(--surface-muted-foreground)] hover:text-[var(--surface-foreground)]',
                      !isActive && 'opacity-0 group-hover:opacity-100 [@media(hover:none)]:opacity-100',
                    )}
                    aria-label={`Close ${file.name}`}
                  >
                    <RiCloseLine size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="truncate typography-ui-label font-medium">Select a file</div>
      )}
    </div>
  );
});
