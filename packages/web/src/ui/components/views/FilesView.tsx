import React from 'react';

import {
  RiCloseLine,
  RiLoader4Line,
  RiRefreshLine,
  RiSearchLine,
  RiFileAddLine,
  RiFolderAddLine,
} from '@remixicon/react';
import { toast } from '@/components/ui';

import { ScrollableOverlay } from '@/components/ui/ScrollableOverlay';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CodeMirrorEditor } from '@/components/ui/CodeMirrorEditor';
import { JsonTreeView } from '@/components/ui/JsonTreeView';
import { SimpleMarkdownRenderer } from '@/components/chat/MarkdownRenderer';
import { languageByExtension, loadLanguageByExtension } from '@/lib/codemirror/languageByExtension';
import { createFlexokiCodeMirrorTheme } from '@/lib/codemirror/flexokiTheme';
import { File as PierreFile } from '@pierre/diffs/react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useFileSearchStore } from '@/stores/files/useFileSearchStore';
import { useDeviceInfo } from '@/lib/device';
 import { cn, hasModifier } from '@/lib/utils';
import { getLanguageFromExtension, getImageMimeType, isImageFile } from '@/lib/tools/toolHelpers';
import { useRuntimeAPIs } from '@/hooks/useRuntimeAPIs';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { useThemeSystem } from '@/contexts/useThemeSystem';
import { useNavigationStore } from '@/stores/useNavigationStore';
import { useUIStore } from '@/stores/useUIStore';
import { useContextPanelStore } from '@/stores/useContextPanelStore';
import { useFilesViewTabsStore } from '@/stores/files/useFilesViewTabsStore';
import { useGitStatus } from '@/stores/git/useGitStore';
import { useAgentConfigStore } from '@/stores/agents/useAgentConfigStore';
import { buildCodeMirrorCommentWidgets, normalizeLineRange, useInlineCommentController } from '@/components/comments';
import { useDirectoryShowHidden } from '@/lib/files/directoryShowHidden';
import { useFilesViewShowGitignored } from '@/lib/files/filesViewShowGitignored';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { useEffectiveDirectory } from '@/hooks/useEffectiveDirectory';
import { FileTypeIcon } from '@/components/icons/FileTypeIcon';
import { ensurePierreThemeRegistered } from '@/lib/shiki/appThemeRegistry';
import { getDefaultTheme } from '@/lib/theme/themes';
import { eventMatchesShortcut, getEffectiveShortcutCombo } from '@/lib/shortcuts';
import {
  type FileNode,
  type FileStatus,
  MAX_VIEW_CHARS,
  getAncestorPaths,
  getDisplayPath,
  isAbsolutePath,
  isDirectoryReadError,
  isHtmlFile,
  isJsonFile,
  isMarkdownFile,
  normalizePath,
  shouldIgnoreEntryName,
  shouldIgnorePath,
  sortNodes,
  FileRow,
  type FileMutationKind,
  type FileMutationTarget,
  FileMutationDialog,
  EditorTabs,
  FileViewerControls,
  FloatingFileViewerControls,
} from './files-view';

type FileStatSnapshot = {
  path: string;
  size: number;
  mtimeMs?: number;
};

type SelectedLineRange = {
  start: number;
  end: number;
};

const getFileIcon = (filePath: string, extension?: string): React.ReactNode => (
  <FileTypeIcon filePath={filePath} extension={extension} />
);

interface FilesViewProps {
  mode?: 'full' | 'editor-only';
}

export const FilesView: React.FC<FilesViewProps> = ({ mode = 'full' }) => {
  const { files } = useRuntimeAPIs();
  const { currentTheme, availableThemes, lightThemeId, darkThemeId } = useThemeSystem();
  const { isMobile, screenWidth } = useDeviceInfo();
  const showHidden = useDirectoryShowHidden();
  const showGitignored = useFilesViewShowGitignored();

  const currentDirectory = useEffectiveDirectory() ?? '';
  const root = normalizePath(currentDirectory.trim());
  const showEditorTabsRow = isMobile || mode !== 'editor-only';
  const suppressFileLoadingIndicator = mode === 'editor-only' && !isMobile;
  const searchFiles = useFileSearchStore((state) => state.searchFiles);
  const gitStatus = useGitStatus(currentDirectory);

  const [searchQuery, setSearchQuery] = React.useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 200);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const [showMobilePageContent, setShowMobilePageContent] = React.useState(false);
  const [wrapLines, setWrapLines] = React.useState(true);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [isSearchOpen, setIsSearchOpen] = React.useState(false);
  const [textViewMode, setTextViewMode] = React.useState<'view' | 'edit'>('edit');
  const [mdViewMode, setMdViewMode] = React.useState<'preview' | 'edit'>('edit');
  const [jsonViewMode, setJsonViewMode] = React.useState<'tree' | 'text'>('tree');
  const [htmlViewMode, setHtmlViewMode] = React.useState<'preview' | 'edit'>('edit');

  const lightTheme = React.useMemo(
    () => availableThemes.find((theme) => theme.metadata.id === lightThemeId) ?? getDefaultTheme(false),
    [availableThemes, lightThemeId],
  );
  const darkTheme = React.useMemo(
    () => availableThemes.find((theme) => theme.metadata.id === darkThemeId) ?? getDefaultTheme(true),
    [availableThemes, darkThemeId],
  );

  React.useEffect(() => {
    ensurePierreThemeRegistered(lightTheme);
    ensurePierreThemeRegistered(darkTheme);
  }, [lightTheme, darkTheme]);

  const EMPTY_PATHS: string[] = React.useMemo(() => [], []);
  const openPaths = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.openPaths ?? EMPTY_PATHS) : EMPTY_PATHS));
  const selectedPath = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.selectedPath ?? null) : null));
  const expandedPaths = useFilesViewTabsStore((state) => (root ? (state.byRoot[root]?.expandedPaths ?? EMPTY_PATHS) : EMPTY_PATHS));
  const addOpenPath = useFilesViewTabsStore((state) => state.addOpenPath);
  const removeOpenPath = useFilesViewTabsStore((state) => state.removeOpenPath);
  const removeOpenPathsByPrefix = useFilesViewTabsStore((state) => state.removeOpenPathsByPrefix);
  const setSelectedPath = useFilesViewTabsStore((state) => state.setSelectedPath);
  const toggleExpandedPath = useFilesViewTabsStore((state) => state.toggleExpandedPath);
  const expandPaths = useFilesViewTabsStore((state) => state.expandPaths);

  const toFileNode = React.useCallback((path: string): FileNode => {
    const normalized = normalizePath(path);
    const parts = normalized.split('/');
    const name = parts[parts.length - 1] || normalized;
    const extension = name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
    return {
      name,
      path: normalized,
      type: 'file',
      extension,
    };
  }, []);

  const openFiles = React.useMemo(() => openPaths.map(toFileNode), [openPaths, toFileNode]);
  const effectiveSelectedPath = React.useMemo(() => selectedPath ?? openPaths[0] ?? null, [openPaths, selectedPath]);
  const selectedFile = React.useMemo(() => (effectiveSelectedPath ? toFileNode(effectiveSelectedPath) : null), [effectiveSelectedPath, toFileNode]);

  const [childrenByDir, setChildrenByDir] = React.useState<Record<string, FileNode[]>>({});
  const loadedDirsRef = React.useRef<Set<string>>(new Set());
  const inFlightDirsRef = React.useRef<Set<string>>(new Set());

  const [searchResults, setSearchResults] = React.useState<FileNode[]>([]);
  const [searching, setSearching] = React.useState(false);

  const [fileContent, setFileContent] = React.useState<string>('');
  const [fileLoading, setFileLoading] = React.useState(false);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [loadedFilePath, setLoadedFilePath] = React.useState<string | null>(null);

  const [draftContent, setDraftContent] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const autoSaveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastLoadedFileStatRef = React.useRef<FileStatSnapshot | null>(null);
  const [autoSaveStatus, setAutoSaveStatus] = React.useState<'idle' | 'saved'>('idle');

  const [confirmDiscardOpen, setConfirmDiscardOpen] = React.useState(false);
  const pendingSelectFileRef = React.useRef<FileNode | null>(null);
  const pendingTabRef = React.useRef<import('@/stores/useUIStore').MainTab | null>(null);
  const pendingClosePathRef = React.useRef<string | null>(null);
  const skipDirtyOnceRef = React.useRef(false);
  const editorViewRef = React.useRef<EditorView | null>(null);
  const editorWrapperRef = React.useRef<HTMLDivElement | null>(null);
  const [editorViewReadyNonce, setEditorViewReadyNonce] = React.useState(0);
  const pendingNavigationRafRef = React.useRef<number | null>(null);
  const pendingNavigationCycleRef = React.useRef<{ key: string; attempts: number }>({ key: '', attempts: 0 });

  React.useEffect(() => {
    return () => {
      if (pendingNavigationRafRef.current !== null && typeof window !== 'undefined') {
        window.cancelAnimationFrame(pendingNavigationRafRef.current);
        pendingNavigationRafRef.current = null;
      }
    };
  }, []);

  const [activeDialog, setActiveDialog] = React.useState<FileMutationKind | null>(null);
  const [dialogData, setDialogData] = React.useState<FileMutationTarget | null>(null);
  const [dialogInputValue, setDialogInputValue] = React.useState('');
  const [isDialogSubmitting, setIsDialogSubmitting] = React.useState(false);
  const [contextMenuPath, setContextMenuPath] = React.useState<string | null>(null);
  const [isGoToLineOpen, setIsGoToLineOpen] = React.useState(false);

  const canCreateFile = Boolean(files.writeFile);
  const canCreateFolder = Boolean(files.createDirectory);
  const canRename = Boolean(files.rename);
  const canDelete = Boolean(files.delete);
  const handleOpenDialog = React.useCallback((type: FileMutationKind, data: FileMutationTarget) => {
    setActiveDialog(type);
    setDialogData(data);
    setDialogInputValue(type === 'rename' ? data.name || '' : '');
    setIsDialogSubmitting(false);
  }, []);

  // Line selection state for commenting
  const [lineSelection, setLineSelection] = React.useState<SelectedLineRange | null>(null);
  const isSelectingRef = React.useRef(false);
  const selectionStartRef = React.useRef<number | null>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  // Session/config for sending comments
  const setMainTabGuard = useNavigationStore((state) => state.setMainTabGuard);
  const pendingFileNavigation = useContextPanelStore((state) => state.pendingFileNavigation);
  const setPendingFileNavigation = useContextPanelStore((state) => state.setPendingFileNavigation);
  const pendingFileFocusPath = useContextPanelStore((state) => state.pendingFileFocusPath);
  const setPendingFileFocusPath = useContextPanelStore((state) => state.setPendingFileFocusPath);
  const shortcutOverrides = useUIStore((state) => state.shortcutOverrides);
  const settingsDefaultFileViewerPreview = useAgentConfigStore((state) => state.settingsDefaultFileViewerPreview);

  // Global mouseup to end drag selection
  React.useEffect(() => {
    const handleGlobalMouseUp = () => {
      isSelectingRef.current = false;
      selectionStartRef.current = null;
      setIsDragging(false);
    };
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Extract selected code
  const extractSelectedCode = React.useCallback((content: string, range: SelectedLineRange): string => {
    const lines = content.split('\n');
    const startLine = Math.max(1, range.start);
    const endLine = Math.min(lines.length, range.end);
    if (startLine > endLine) return '';
    return lines.slice(startLine - 1, endLine).join('\n');
  }, []);

  const fileCommentController = useInlineCommentController<SelectedLineRange>({
    source: 'file',
    fileLabel: selectedFile?.path ?? null,
    language: selectedFile?.path ? getLanguageFromExtension(selectedFile.path) || 'text' : 'text',
    getCodeForRange: (range) => extractSelectedCode(fileContent, normalizeLineRange(range)),
    toStoreRange: (range) => ({ startLine: range.start, endLine: range.end }),
    fromDraftRange: (draft) => ({ start: draft.startLine, end: draft.endLine }),
  });

  const {
    drafts: filesFileDrafts,
    commentText,
    editingDraftId,
    setSelection: setCommentSelection,
    saveComment,
    cancel,
    reset,
    startEdit,
    deleteDraft,
  } = fileCommentController;

  React.useEffect(() => {
    setLineSelection(null);
    reset();
    setMainTabGuard(null);
    setDraftContent('');
    setIsSaving(false);
  }, [selectedFile?.path, reset, setMainTabGuard]);

  React.useEffect(() => {
    setCommentSelection(lineSelection);
  }, [lineSelection, setCommentSelection]);

  React.useEffect(() => {
    if (!lineSelection && !editingDraftId) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      if (target.closest('[data-comment-input="true"]') || target.closest('[data-comment-card="true"]')) return;
      if (target.closest('.cm-gutterElement')) return;
      if (target.closest('[data-sonner-toast]') || target.closest('[data-sonner-toaster]')) return;

      setLineSelection(null);
      cancel();
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [cancel, editingDraftId, lineSelection]);

  const handleSaveComment = React.useCallback((text: string, range?: { start: number; end: number }) => {
    const finalRange = range ?? lineSelection ?? undefined;
    if (range) {
      setLineSelection(range);
    }
    saveComment(text, finalRange);
    setLineSelection(null);
  }, [lineSelection, saveComment]);

  const mapDirectoryEntries = React.useCallback((dirPath: string, entries: Array<{ name: string; path: string; isDirectory: boolean }>): FileNode[] => {
    const nodes = entries
      .filter((entry) => entry && typeof entry.name === 'string' && entry.name.length > 0)
      .filter((entry) => showHidden || !entry.name.startsWith('.'))
      .filter((entry) => showGitignored || !shouldIgnoreEntryName(entry.name))
      .map<FileNode>((entry) => {
        const name = entry.name;
        const normalizedEntryPath = normalizePath(entry.path || '');
        const path = normalizedEntryPath
          ? (isAbsolutePath(normalizedEntryPath)
            ? normalizedEntryPath
            : normalizePath(`${dirPath}/${normalizedEntryPath}`))
          : normalizePath(`${dirPath}/${name}`);
        const type = entry.isDirectory ? 'directory' : 'file';
        const extension = type === 'file' && name.includes('.') ? name.split('.').pop()?.toLowerCase() : undefined;
        return {
          name,
          path,
          type,
          extension,
        };
      });

    return sortNodes(nodes);
  }, [showGitignored, showHidden]);

  const loadDirectory = React.useCallback(async (dirPath: string) => {
    const normalizedDir = normalizePath(dirPath.trim());
    if (!normalizedDir) {
      return;
    }

    if (loadedDirsRef.current.has(normalizedDir) || inFlightDirsRef.current.has(normalizedDir)) {
      return;
    }

    inFlightDirsRef.current = new Set(inFlightDirsRef.current);
    inFlightDirsRef.current.add(normalizedDir);

    const respectGitignore = !showGitignored;
    const listPromise = files.listDirectory(normalizedDir, { respectGitignore }).then((result) => result.entries.map((entry) => ({
        name: entry.name,
        path: entry.path,
        isDirectory: entry.isDirectory,
      })));

    await listPromise
      .then((entries) => {
        const mapped = mapDirectoryEntries(normalizedDir, entries);

        loadedDirsRef.current = new Set(loadedDirsRef.current);
        loadedDirsRef.current.add(normalizedDir);
        setChildrenByDir((prev) => ({ ...prev, [normalizedDir]: mapped }));
      })
      .catch(() => {
        setChildrenByDir((prev) => ({
          ...prev,
          [normalizedDir]: prev[normalizedDir] ?? [],
        }));
      })
      .finally(() => {
        inFlightDirsRef.current = new Set(inFlightDirsRef.current);
        inFlightDirsRef.current.delete(normalizedDir);
      });
  }, [files, mapDirectoryEntries, showGitignored]);

  const refreshRoot = React.useCallback(async () => {
    if (!root) {
      return;
    }

    loadedDirsRef.current = new Set();
    inFlightDirsRef.current = new Set();
    setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));

    await loadDirectory(root);
  }, [loadDirectory, root]);

  /**
   * Incrementally refresh a single directory without nuking the rest of the
   * tree.  After the operation the parent directory is reloaded in-place so
   * the new/renamed/deleted entry becomes visible immediately while every
   * other expanded directory keeps its cached children.
   */
  const refreshDirectory = React.useCallback(async (dirPath: string) => {
    if (!dirPath) {
      await refreshRoot();
      return;
    }
    const normalized = normalizePath(dirPath);
    // Remove from loaded set so loadDirectory will actually fetch again.
    loadedDirsRef.current = new Set(loadedDirsRef.current);
    loadedDirsRef.current.delete(normalized);
    // Also cancel any in-flight request for this dir so the new fetch wins.
    inFlightDirsRef.current = new Set(inFlightDirsRef.current);
    inFlightDirsRef.current.delete(normalized);
    await loadDirectory(normalized);
  }, [loadDirectory, refreshRoot]);

  const lastFilesViewDirRef = React.useRef<string>('');
  const lastFilesViewTreeKeyRef = React.useRef<string>('');

  React.useEffect(() => {
    if (!root) {
      return;
    }

    const treeKey = `${root}|h${showHidden ? '1' : '0'}|g${showGitignored ? '1' : '0'}`;
    const dirChanged = lastFilesViewDirRef.current !== root;
    const treeKeyChanged = lastFilesViewTreeKeyRef.current !== treeKey;

    if (!dirChanged && !treeKeyChanged) {
      return;
    }

    if (dirChanged) {
      lastFilesViewDirRef.current = root;
      setFileContent('');
      setFileError(null);
      setLoadedFilePath(null);
      setShowMobilePageContent(false);
    }

    if (treeKeyChanged) {
      lastFilesViewTreeKeyRef.current = treeKey;
      loadedDirsRef.current = new Set();
      inFlightDirsRef.current = new Set();
      setChildrenByDir((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      void loadDirectory(root);
    }
  }, [loadDirectory, root, showGitignored, showHidden]);

  // Auto-refresh expanded directories when user returns to the tab
  React.useEffect(() => {
    if (!files.listDirectory) return;

    const handleVisibilityChange = () => {
      if (!document.hidden && expandedPaths.length > 0) {
        for (const dir of expandedPaths) {
          void refreshDirectory(dir);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [expandedPaths, files.listDirectory, refreshDirectory]);

  // Poll expanded directories for external changes
  React.useEffect(() => {
    if (!files.listDirectory) return;
    if (expandedPaths.length === 0) return;

    const interval = setInterval(() => {
      if (document.hidden) return;
      for (const dir of expandedPaths) {
        void refreshDirectory(dir);
      }
    }, 8000);

    return () => clearInterval(interval);
  }, [expandedPaths, files.listDirectory, refreshDirectory]);

  const handleDialogSubmit = React.useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!dialogData || !activeDialog) return;

    setIsDialogSubmitting(true);
    const finishDialogOperation = () => {
      setActiveDialog(null);
    };

    const failDialogOperation = (message: string) => {
      toast.error(message);
    };

    const done = () => {
      setIsDialogSubmitting(false);
    };

    if (activeDialog === 'createFile') {
      if (!dialogInputValue.trim()) {
        failDialogOperation('Filename is required');
        done();
        return;
      }
      if (!files.writeFile) {
        failDialogOperation('Write not supported');
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);
      await files.writeFile(newPath, '')
        .then(async (result) => {
          if (result.success) {
            toast.success('File created');
            await refreshDirectory(parentPath);
          }
          finishDialogOperation();
        })
        .catch(() => failDialogOperation('Operation failed'))
        .finally(done);
      return;
    }

    if (activeDialog === 'createFolder') {
      if (!dialogInputValue.trim()) {
        failDialogOperation('Folder name is required');
        done();
        return;
      }

      const parentPath = dialogData.path;
      const prefix = parentPath ? `${parentPath}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);
      await files.createDirectory(newPath)
        .then(async (result) => {
          if (result.success) {
            toast.success('Folder created');
            await refreshDirectory(parentPath);
          }
          finishDialogOperation();
        })
        .catch(() => failDialogOperation('Operation failed'))
        .finally(done);
      return;
    }

    if (activeDialog === 'rename') {
      if (!dialogInputValue.trim()) {
        failDialogOperation('Name is required');
        done();
        return;
      }

      if (!files.rename) {
        failDialogOperation('Rename not supported');
        done();
        return;
      }

      const oldPath = dialogData.path;
      const parentDir = oldPath.split('/').slice(0, -1).join('/');
      const prefix = parentDir ? `${parentDir}/` : '';
      const newPath = normalizePath(`${prefix}${dialogInputValue.trim()}`);

      await files.rename(oldPath, newPath)
        .then(async (result) => {
          if (result.success) {
            toast.success('Renamed successfully');
            await refreshDirectory(parentDir);
            if (root) {
              removeOpenPathsByPrefix(root, oldPath);
            }
            if (selectedFile?.path === oldPath || selectedFile?.path.startsWith(`${oldPath}/`)) {
              if (root) {
                setSelectedPath(root, null);
              }
              setFileContent('');
              setFileError(null);
              setLoadedFilePath(null);
              if (isMobile) {
                setShowMobilePageContent(false);
              }
            }
          }
          finishDialogOperation();
        })
        .catch(() => failDialogOperation('Operation failed'))
        .finally(done);
      return;
    }

    if (activeDialog === 'delete') {
      if (!files.delete) {
        failDialogOperation('Delete not supported');
        done();
        return;
      }

      const deletedPath = dialogData.path;
      const parentDir = deletedPath.split('/').slice(0, -1).join('/');
      await files.delete(deletedPath)
        .then(async (result) => {
          if (result.success) {
            toast.success('Deleted successfully');
            await refreshDirectory(parentDir);
            if (root) {
              removeOpenPathsByPrefix(root, deletedPath);
            }
            if (selectedFile?.path === deletedPath || selectedFile?.path.startsWith(`${deletedPath}/`)) {
              if (root) {
                setSelectedPath(root, null);
              }
              setFileContent('');
              setFileError(null);
              setLoadedFilePath(null);
              if (isMobile) {
                setShowMobilePageContent(false);
              }
            }
          }
          finishDialogOperation();
        })
        .catch(() => failDialogOperation('Operation failed'))
        .finally(done);
      return;
    }

    done();
  }, [activeDialog, dialogData, dialogInputValue, files, refreshDirectory, isMobile, removeOpenPathsByPrefix, root, selectedFile?.path, setSelectedPath]);

  React.useEffect(() => {
    if (!currentDirectory) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    const trimmedQuery = debouncedSearchQuery.trim();
    if (!trimmedQuery) {
      setSearchResults([]);
      setSearching(false);
      return;
    }

    let cancelled = false;
    setSearching(true);

    searchFiles(currentDirectory, trimmedQuery, 150, {
      includeHidden: showHidden,
      respectGitignore: !showGitignored,
      type: 'file',
    })
      .then((hits) => {
        if (cancelled) {
          return;
        }

        const filtered = hits.filter((hit) => showGitignored || !shouldIgnorePath(hit.path));

        const mapped: FileNode[] = filtered.map((hit) => ({
          name: hit.name,
          path: normalizePath(hit.path),
          type: 'file',
          extension: hit.extension,
          relativePath: hit.relativePath,
        }));

        setSearchResults(mapped);
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSearching(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentDirectory, debouncedSearchQuery, searchFiles, showHidden, showGitignored]);

  const readFile = React.useCallback(async (path: string): Promise<string> => {
    if (files.readFile) {
      const result = await files.readFile(path);
      return result.content ?? '';
    }

    const response = await fetch(`/api/fs/read?path=${encodeURIComponent(path)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error((error as { error?: string }).error || 'Failed to read file');
    }
    return response.text();
  }, [files]);

  const readFileStat = React.useCallback(async (path: string): Promise<FileStatSnapshot | null> => {
    if (files.statFile) {
      const result = await files.statFile(path);
      return {
        path: result.path,
        size: result.size,
        mtimeMs: result.mtimeMs,
      };
    }
    return null;
  }, [files]);

  const displayedContent = React.useMemo(() => {
    return fileContent.length > MAX_VIEW_CHARS
      ? `${fileContent.slice(0, MAX_VIEW_CHARS)}\n\n… truncated …`
      : fileContent;
  }, [fileContent]);

  const isDirty = React.useMemo(() => draftContent !== displayedContent, [draftContent, displayedContent]);
  // Guards and polling need the latest dirty state without rebuilding navigation
  // callbacks or restarting intervals on every editor change.
  const isDirtyRef = React.useRef(isDirty);
  isDirtyRef.current = isDirty;

  const saveDraft = React.useCallback(async () => {
    if (!selectedFile || !files.writeFile) {
      toast.error('Saving not supported');
      return;
    }

    if (!isDirty) {
      return;
    }

    setIsSaving(true);

    await files.writeFile(selectedFile.path, draftContent)
      .then((result) => {
        if (!result?.success) {
          toast.error('Failed to write file');
          return;
        }
        setFileContent(draftContent);
        // Refresh stat after write so polling doesn't see a stale metadata change.
        void readFileStat(selectedFile.path)
          .then((stat) => {
            if (stat) {
              lastLoadedFileStatRef.current = stat;
            }
          })
          .catch(() => { });
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Save failed');
      })
      .finally(() => {
        setIsSaving(false);
      });
  }, [draftContent, files, isDirty, readFileStat, selectedFile]);

  React.useEffect(() => {
    if (!isDirty) {
      setMainTabGuard(null);
      return;
    }

    const guard = (_nextTab: import('@/stores/useUIStore').MainTab) => {
      if (skipDirtyOnceRef.current) {
        skipDirtyOnceRef.current = false;
        return true;
      }
      setConfirmDiscardOpen(true);
      pendingTabRef.current = _nextTab;
      return false;
    };

    setMainTabGuard(guard);

    return () => {
      const currentGuard = useNavigationStore.getState().mainTabGuard;
      if (currentGuard === guard) {
        setMainTabGuard(null);
      }
    };
  }, [isDirty, setMainTabGuard]);

  // Auto-save: debounce 1.5s after user stops typing
  const AUTO_SAVE_DELAY = 1500;

  React.useEffect(() => {
    const canWrite = Boolean(selectedFile && files.writeFile);
    if (!isDirty || !canWrite || isSaving) {
      return;
    }

    autoSaveTimerRef.current = setTimeout(() => {
      void saveDraft().then(() => {
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      });
    }, AUTO_SAVE_DELAY);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [draftContent, isDirty, selectedFile, files.writeFile, isSaving, saveDraft]);

  // Reset auto-save status when switching files
  React.useEffect(() => {
    setAutoSaveStatus('idle');
  }, [selectedFile?.path]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!hasModifier(e)) {
        return;
      }

      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        // Cancel pending auto-save; user wants immediate save
        if (autoSaveTimerRef.current) {
          clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        if (!isSaving) {
          void saveDraft().then(() => {
            setAutoSaveStatus('saved');
            setTimeout(() => setAutoSaveStatus('idle'), 2000);
          });
        }
      } else if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSaving, saveDraft]);

  const loadSelectedFile = React.useCallback(async (node: FileNode) => {
    setFileError(null);
    setLoadedFilePath(null);

    const selectedIsImage = isImageFile(node.path);
    const isSvg = node.path.toLowerCase().endsWith('.svg');

    if (isMobile) {
      setShowMobilePageContent(true);
    }

    if (selectedIsImage && !isSvg) {
      setFileContent('');
      setDraftContent('');
      setLoadedFilePath(node.path);
      setFileLoading(false);
      return;
    }

    setFileLoading(true);

    await readFile(node.path)
      .then((content) => {
        setFileContent(content);
        setDraftContent(content.length > MAX_VIEW_CHARS
          ? `${content.slice(0, MAX_VIEW_CHARS)}\n\n… truncated …`
          : content);
        setLoadedFilePath(node.path);
        void readFileStat(node.path)
          .then((stat) => {
            if (stat) {
              lastLoadedFileStatRef.current = stat;
            }
          })
          .catch(() => { });
      })
      .catch((error) => {
        if (isDirectoryReadError(error)) {
          if (root) {
            setSelectedPath(root, null);
          }
          setFileError(null);
          setFileContent('');
          setDraftContent('');
          setLoadedFilePath(null);
          lastLoadedFileStatRef.current = null;
          if (searchQuery.trim().length > 0) {
            setSearchQuery('');
          }
          if (isMobile) {
            setShowMobilePageContent(false);
          }
          if (root) {
            const ancestors = getAncestorPaths(node.path, root);
            const pathsToExpand = [...ancestors, node.path];
            if (pathsToExpand.length > 0) {
              expandPaths(root, pathsToExpand);
            }
            for (const path of pathsToExpand) {
              if (!loadedDirsRef.current.has(path)) {
                void loadDirectory(path);
              }
            }
          }
          return;
        }
        setFileContent('');
        setDraftContent('');
        setFileError(error instanceof Error ? error.message : 'Failed to read file');
        lastLoadedFileStatRef.current = null;
      })
      .finally(() => {
        setFileLoading(false);
      });
  }, [expandPaths, isMobile, loadDirectory, readFile, readFileStat, root, searchQuery, setSelectedPath]);

  const ensurePathVisible = React.useCallback(async (targetPath: string, includeTarget: boolean) => {
    if (!root) {
      return;
    }

    const ancestors = getAncestorPaths(targetPath, root);
    const pathsToExpand = includeTarget ? [...ancestors, targetPath] : ancestors;

    if (pathsToExpand.length > 0) {
      expandPaths(root, pathsToExpand);
    }

    for (const path of pathsToExpand) {
      if (!loadedDirsRef.current.has(path)) {
        await loadDirectory(path);
      }
    }
  }, [expandPaths, loadDirectory, root]);

  const getNextOpenFile = React.useCallback((path: string, filesList: FileNode[]) => {
    const index = filesList.findIndex((file) => file.path === path);
    if (index === -1 || filesList.length <= 1) {
      return null;
    }
    return filesList[index + 1] ?? filesList[index - 1] ?? null;
  }, []);

  const handleSelectFile = React.useCallback(async (node: FileNode) => {
    if (skipDirtyOnceRef.current) {
      skipDirtyOnceRef.current = false;
    } else if (isDirtyRef.current) {
      setConfirmDiscardOpen(true);
      pendingSelectFileRef.current = node;
      return;
    }

    if (root) {
      setSelectedPath(root, node.path);
      addOpenPath(root, node.path);
      void ensurePathVisible(node.path, false);
    }

    setFileError(null);
    setFileContent('');
    setDraftContent('');
    setLoadedFilePath(null);
    if (isMobile) {
      setShowMobilePageContent(true);
    }
  }, [addOpenPath, ensurePathVisible, isMobile, root, setSelectedPath]);

  React.useEffect(() => {
    if (!selectedFile?.path) {
      return;
    }

    void ensurePathVisible(selectedFile.path, false);
  }, [ensurePathVisible, selectedFile?.path]);

  React.useEffect(() => {
    if (!selectedFile) {
      return;
    }

    if (loadedFilePath === selectedFile.path) {
      return;
    }

    // Selection changes are guarded; this effect is also what restores persisted tabs on mount.
    void loadSelectedFile(selectedFile);
  }, [loadSelectedFile, loadedFilePath, selectedFile]);

  // Poll open file for external changes.
  // When a change is detected, reset loadedFilePath so the effect above
  // triggers a single reload — no double-load.
  React.useEffect(() => {
    if (!selectedFile?.path || loadedFilePath !== selectedFile.path) {
      return;
    }

    let cancelled = false;
    const interval = window.setInterval(() => {
      if (document.hidden) {
        return;
      }

      void readFileStat(selectedFile.path)
        .then((latestStat) => {
          if (cancelled || !latestStat) {
            return;
          }

          const previousStat = lastLoadedFileStatRef.current;
          if (!previousStat || previousStat.path !== selectedFile.path) {
            lastLoadedFileStatRef.current = latestStat;
            return;
          }

          const changedByMtime = latestStat.mtimeMs !== undefined
            && previousStat.mtimeMs !== undefined
            && latestStat.mtimeMs !== previousStat.mtimeMs;
          const changedBySize = latestStat.size !== previousStat.size;

          if (!changedByMtime && !changedBySize) {
            return;
          }

          if (isDirtyRef.current) {
            return;
          }

          lastLoadedFileStatRef.current = latestStat;
          // Reset loadedFilePath so the effect above triggers a single reload.
          setLoadedFilePath(null);
        })
        .catch(() => { });
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [loadedFilePath, readFileStat, selectedFile?.path]);

  const discardAndContinue = React.useCallback(() => {
    const nextFile = pendingSelectFileRef.current;
    const nextTab = pendingTabRef.current;
    const closePath = pendingClosePathRef.current;

    pendingSelectFileRef.current = null;
    pendingTabRef.current = null;
    pendingClosePathRef.current = null;

    // Allow one guarded navigation (tab/file) without re-opening dialog.
    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    // Discard draft by reverting back to last loaded content
    setDraftContent(displayedContent);

    if (closePath) {
      if (root) {
        removeOpenPath(root, closePath);
      }
      if (selectedFile?.path === closePath) {
        if (nextFile) {
          void handleSelectFile(nextFile);
        } else {
          if (root) {
            setSelectedPath(root, null);
          }
          setFileContent('');
          setFileError(null);
          setLoadedFilePath(null);
          if (isMobile) {
            setShowMobilePageContent(false);
          }
        }
      }
      return;
    }

    if (nextFile) {
      void handleSelectFile(nextFile);
      return;
    }

    if (nextTab) {
      setMainTabGuard(null);
      useNavigationStore.getState().setActiveMainTab(nextTab);
    }
  }, [displayedContent, handleSelectFile, isMobile, removeOpenPath, root, selectedFile?.path, setMainTabGuard, setSelectedPath]);

  const saveAndContinue = React.useCallback(async () => {
    const nextFile = pendingSelectFileRef.current;
    const nextTab = pendingTabRef.current;
    const closePath = pendingClosePathRef.current;

    pendingSelectFileRef.current = null;
    pendingTabRef.current = null;
    pendingClosePathRef.current = null;

    // We'll proceed after saving; suppress guard reopening.
    skipDirtyOnceRef.current = true;

    setConfirmDiscardOpen(false);

    await saveDraft();

    if (closePath) {
      if (root) {
        removeOpenPath(root, closePath);
      }
      if (selectedFile?.path === closePath) {
        if (nextFile) {
          await handleSelectFile(nextFile);
        } else {
          if (root) {
            setSelectedPath(root, null);
          }
          setFileContent('');
          setFileError(null);
          setLoadedFilePath(null);
          if (isMobile) {
            setShowMobilePageContent(false);
          }
        }
      }
      return;
    }

    if (nextFile) {
      await handleSelectFile(nextFile);
      return;
    }

    if (nextTab) {
      setMainTabGuard(null);
      useNavigationStore.getState().setActiveMainTab(nextTab);
    }
  }, [handleSelectFile, isMobile, removeOpenPath, root, saveDraft, selectedFile?.path, setMainTabGuard, setSelectedPath]);

  const handleCloseFile = React.useCallback((path: string) => {
    const isActive = selectedFile?.path === path;
    const nextFile = getNextOpenFile(path, openFiles);

    if (isActive && isDirtyRef.current) {
      setConfirmDiscardOpen(true);
      pendingSelectFileRef.current = nextFile;
      pendingClosePathRef.current = path;
      return;
    }

    if (root) {
      removeOpenPath(root, path);
    }

    if (!isActive) {
      return;
    }

    if (nextFile) {
      void handleSelectFile(nextFile);
      return;
    }

    if (root) {
      setSelectedPath(root, null);
    }
    setFileContent('');
    setFileError(null);
    setLoadedFilePath(null);
    if (isMobile) {
      setShowMobilePageContent(false);
    }
  }, [getNextOpenFile, handleSelectFile, isMobile, openFiles, removeOpenPath, root, selectedFile?.path, setSelectedPath]);

  const getFileStatus = React.useCallback((path: string): FileStatus | null => {
    // Check open status
    if (openPaths.includes(path)) return 'open';

    // Check git status
    if (gitStatus?.files) {
      const relative = path.startsWith(root + '/') ? path.slice(root.length + 1) : path;
      const file = gitStatus.files.find(f => f.path === relative);
      if (file) {
        if (file.index === 'A' || file.working_dir === '?') return 'git-added';
        if (file.index === 'D') return 'git-deleted';
        if (file.index === 'M' || file.working_dir === 'M') return 'git-modified';
      }
    }
    return null;
  }, [openPaths, gitStatus, root]);

  const getFolderBadge = React.useCallback((dirPath: string): { modified: number; added: number } | null => {
    if (!gitStatus?.files) return null;
    const relativeDir = dirPath.startsWith(root + '/') ? dirPath.slice(root.length + 1) : dirPath;
    const prefix = relativeDir ? `${relativeDir}/` : '';

    let modified = 0, added = 0;
    for (const f of gitStatus.files) {
      if (f.path.startsWith(prefix)) {
        if (f.index === 'M' || f.working_dir === 'M') modified++;
        if (f.index === 'A' || f.working_dir === '?') added++;
      }
    }
    return modified + added > 0 ? { modified, added } : null;
  }, [gitStatus, root]);

  const toggleDirectory = React.useCallback(async (dirPath: string) => {
    const normalized = normalizePath(dirPath);
    if (!root) return;

    toggleExpandedPath(root, normalized);

    if (!loadedDirsRef.current.has(normalized)) {
      await loadDirectory(normalized);
    }
  }, [loadDirectory, root, toggleExpandedPath]);

  function renderTree(dirPath: string, depth: number): React.ReactNode {
    const nodes = childrenByDir[dirPath] ?? [];

    return nodes.map((node, index) => {
      const isDir = node.type === 'directory';
      const isExpanded = isDir && expandedPaths.includes(node.path);
      const isActive = selectedFile?.path === node.path;
      const isLast = index === nodes.length - 1;

      return (
        <li key={node.path} className="relative">
          {depth > 0 && (
            <>
              <span className="absolute top-3.5 left-[-12px] w-3 h-px bg-border/40" />
              {isLast && (
                <span className="absolute top-3.5 bottom-0 left-[-13px] w-[2px] bg-background" />
              )}
            </>
          )}
          <FileRow
            node={node}
            root={root}
            isExpanded={isExpanded}
            isActive={isActive}
            isMobile={isMobile}
            status={!isDir ? getFileStatus(node.path) : undefined}
            badge={isDir ? getFolderBadge(node.path) : undefined}
            permissions={{ canRename, canCreateFile, canCreateFolder, canDelete }}
            downloadFile={files.downloadFile}
            contextMenuPath={contextMenuPath}
            setContextMenuPath={setContextMenuPath}
            onSelect={handleSelectFile}
            onToggle={toggleDirectory}
            onOpenDialog={handleOpenDialog}
          />
          {isDir && isExpanded && (
            <ul className="flex flex-col gap-1 ml-3 pl-3 border-l border-border/40 relative">
              {renderTree(node.path, depth + 1)}
            </ul>
          )}
        </li>
      );
    });
  }

  const isSelectedImage = Boolean(selectedFile?.path && isImageFile(selectedFile.path));
  const isSelectedSvg = Boolean(selectedFile?.path && selectedFile.path.toLowerCase().endsWith('.svg'));
  const selectedFilePath = selectedFile?.path ?? '';
  const pendingNavigationTargetPath = React.useMemo(
    () => normalizePath(pendingFileNavigation?.path ?? ''),
    [pendingFileNavigation?.path],
  );
  const shouldMaskEditorForPendingNavigation = Boolean(
    pendingFileNavigation
    && pendingNavigationTargetPath
    && selectedFilePath
    && selectedFilePath === pendingNavigationTargetPath
    && !fileLoading
    && !fileError
    && !isSelectedImage,
  );

  const displaySelectedPath = React.useMemo(() => {
    return getDisplayPath(root, selectedFilePath);
  }, [selectedFilePath, root]);

  const canCopy = Boolean(selectedFile && (!isSelectedImage || isSelectedSvg) && fileContent.length > 0);
  const canCopyPath = Boolean(selectedFile && displaySelectedPath.length > 0);
  const canEdit = Boolean(selectedFile && !isSelectedImage && files.writeFile && fileContent.length <= MAX_VIEW_CHARS);
  const isMarkdown = Boolean(selectedFile?.path && isMarkdownFile(selectedFile.path));
  const isJson = Boolean(selectedFile?.path && isJsonFile(selectedFile.path));
  const isHtml = Boolean(selectedFile?.path && isHtmlFile(selectedFile.path));
  const isTextFile = Boolean(selectedFile && !isSelectedImage);
  const canUseShikiFileView = isTextFile && !isMarkdown && !(isHtml && htmlViewMode === 'preview');
  const staticLanguageExtension = React.useMemo(
    () => (selectedFilePath ? languageByExtension(selectedFilePath) : null),
    [selectedFilePath],
  );
  const [dynamicLanguageExtension, setDynamicLanguageExtension] = React.useState<Extension | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    const selectedPath = selectedFile?.path;

    if (!selectedPath || staticLanguageExtension) {
      setDynamicLanguageExtension(null);
      return;
    }

    setDynamicLanguageExtension(null);
    void loadLanguageByExtension(selectedPath).then((extension) => {
      if (!cancelled) {
        setDynamicLanguageExtension(extension);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [selectedFile?.path, staticLanguageExtension]);

  React.useEffect(() => {
    if (!canEdit && textViewMode === 'edit') {
      setTextViewMode('view');
    }
  }, [canEdit, textViewMode]);

  const MD_VIEWER_MODE_KEY = 'openchamber:files:md-viewer-mode';
  const HTML_VIEWER_MODE_KEY = 'openchamber:files:html-viewer-mode';

  React.useEffect(() => {
    const defaultMode = settingsDefaultFileViewerPreview ? 'view' : 'edit';
    setTextViewMode(defaultMode);

    // Respect per-type localStorage preference when available,
    // falling back to the setting-derived default when nothing is stored.
    let mdDefault: 'preview' | 'edit' = settingsDefaultFileViewerPreview ? 'preview' : 'edit';
    try {
      const stored = localStorage.getItem(MD_VIEWER_MODE_KEY);
      if (stored === 'preview' || stored === 'edit') {
        mdDefault = stored;
      }
    } catch {
      // Ignore localStorage errors
    }
    setMdViewMode(mdDefault);

    let htmlDefault: 'preview' | 'edit' = settingsDefaultFileViewerPreview ? 'preview' : 'edit';
    try {
      const stored = localStorage.getItem(HTML_VIEWER_MODE_KEY);
      if (stored === 'preview' || stored === 'edit') {
        htmlDefault = stored;
      }
    } catch {
      // Ignore localStorage errors
    }
    setHtmlViewMode(htmlDefault);
  }, [selectedFile?.path, settingsDefaultFileViewerPreview]);

  const saveMdViewMode = React.useCallback((mode: 'preview' | 'edit') => {
    setMdViewMode(mode);
    try {
      localStorage.setItem(MD_VIEWER_MODE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const getMdViewMode = React.useCallback((): 'preview' | 'edit' => {
    return mdViewMode;
  }, [mdViewMode]);

  const JSON_VIEWER_MODE_KEY = 'openchamber:files:json-viewer-mode';

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(JSON_VIEWER_MODE_KEY);
      if (stored === 'tree') {
        setJsonViewMode('tree');
      } else if (stored === 'text') {
        setJsonViewMode('text');
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveJsonViewMode = React.useCallback((mode: 'tree' | 'text') => {
    setJsonViewMode(mode);
    try {
      localStorage.setItem(JSON_VIEWER_MODE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const saveHtmlViewMode = React.useCallback((mode: 'preview' | 'edit') => {
    setHtmlViewMode(mode);
    try {
      localStorage.setItem(HTML_VIEWER_MODE_KEY, mode);
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const getHtmlViewMode = React.useCallback((): 'preview' | 'edit' => {
    return htmlViewMode;
  }, [htmlViewMode]);
  React.useEffect(() => {
    if (!pendingFileNavigation || !root) {
      return;
    }

    const scheduleNavigationRetry = () => {
      if (typeof window === 'undefined') {
        return;
      }
      if (pendingNavigationRafRef.current !== null) {
        return;
      }

      pendingNavigationRafRef.current = window.requestAnimationFrame(() => {
        pendingNavigationRafRef.current = null;
        setEditorViewReadyNonce((value) => value + 1);
      });
    };

    const isEditorSyncedWithDraft = (view: EditorView, expectedContent: string): boolean => {
      if (view.state.doc.length !== expectedContent.length) {
        return false;
      }

      if (expectedContent.length === 0) {
        return true;
      }

      const sampleSize = Math.min(128, expectedContent.length);
      const startSample = view.state.sliceDoc(0, sampleSize);
      if (startSample !== expectedContent.slice(0, sampleSize)) {
        return false;
      }

      const endFrom = Math.max(0, expectedContent.length - sampleSize);
      const endSample = view.state.sliceDoc(endFrom, expectedContent.length);
      return endSample === expectedContent.slice(endFrom);
    };

    const targetPath = normalizePath(pendingFileNavigation.path);
    if (!targetPath) {
      setPendingFileNavigation(null);
      pendingNavigationCycleRef.current = { key: '', attempts: 0 };
      return;
    }

    const navigationKey = `${targetPath}:${pendingFileNavigation.line}:${pendingFileNavigation.column ?? 1}`;
    if (pendingNavigationCycleRef.current.key !== navigationKey) {
      pendingNavigationCycleRef.current = { key: navigationKey, attempts: 0 };
    }

    if (selectedFile?.path !== targetPath) {
      if (selectedPath !== targetPath) {
        setSelectedPath(root, targetPath);
      }
      return;
    }

    if (fileLoading || loadedFilePath !== targetPath) {
      return;
    }

    if (fileError || isSelectedImage) {
      setPendingFileNavigation(null);
      pendingNavigationCycleRef.current = { key: '', attempts: 0 };
      return;
    }

    if (!canEdit) {
      return;
    }

    if (textViewMode !== 'edit') {
      setTextViewMode('edit');
      return;
    }

    const view = editorViewRef.current;
    if (!view) {
      scheduleNavigationRetry();
      return;
    }

    if (!isEditorSyncedWithDraft(view, draftContent)) {
      scheduleNavigationRetry();
      return;
    }

    const targetLineNumber = Math.max(1, Math.min(pendingFileNavigation.line, view.state.doc.lines));
    const targetLine = view.state.doc.line(targetLineNumber);
    const targetColumn = Math.max(1, pendingFileNavigation.column || 1);
    const lineLength = Math.max(0, targetLine.to - targetLine.from);
    const clampedColumnOffset = Math.min(lineLength, targetColumn - 1);
    const targetPosition = targetLine.from + clampedColumnOffset;
    const isAtTarget = view.state.selection.main.head === targetPosition;
    const shouldDispatch = !isAtTarget || pendingNavigationCycleRef.current.attempts === 0;

    if (shouldDispatch) {
      pendingNavigationCycleRef.current.attempts += 1;
      view.dispatch({
        selection: { anchor: targetPosition },
        effects: EditorView.scrollIntoView(targetPosition, { y: 'center' }),
      });
      view.focus();
      scheduleNavigationRetry();
      return;
    }

    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        const syncedView = editorViewRef.current;
        if (!syncedView) {
          return;
        }

        syncedView.dispatch({
          selection: { anchor: targetPosition },
          effects: EditorView.scrollIntoView(targetPosition, { y: 'center' }),
        });
        syncedView.focus();
      });
    }

    setPendingFileNavigation(null);
    pendingNavigationCycleRef.current = { key: '', attempts: 0 };
  }, [
    canEdit,
    draftContent,
    editorViewReadyNonce,
    fileError,
    fileLoading,
    isSelectedImage,
    loadedFilePath,
    pendingFileNavigation,
    root,
    selectedFile?.path,
    selectedPath,
    setPendingFileNavigation,
    setSelectedPath,
    textViewMode,
  ]);

  React.useEffect(() => {
    if (!pendingFileFocusPath || !root) {
      return;
    }

    const targetPath = normalizePath(pendingFileFocusPath);
    if (!targetPath) {
      setPendingFileFocusPath(null);
      return;
    }

    if (selectedFile?.path !== targetPath) {
      if (selectedPath !== targetPath) {
        setSelectedPath(root, targetPath);
      }
      return;
    }

    if (fileLoading || loadedFilePath !== targetPath || fileError || isSelectedImage) {
      return;
    }

    if (canEdit && textViewMode !== 'edit') {
      setTextViewMode('edit');
      return;
    }

    if (canEdit) {
      const view = editorViewRef.current;
      if (!view) {
        return;
      }
      view.focus();
    }

    setPendingFileFocusPath(null);
  }, [
    canEdit,
    fileError,
    fileLoading,
    isSelectedImage,
    loadedFilePath,
    pendingFileFocusPath,
    root,
    selectedFile?.path,
    selectedPath,
    setPendingFileFocusPath,
    setSelectedPath,
    textViewMode,
  ]);

  const nudgeEditorSelectionAboveKeyboard = React.useCallback((view: EditorView | null) => {
    if (!isMobile || !view || !view.hasFocus || typeof window === 'undefined') {
      return;
    }

    const viewport = window.visualViewport;
    if (!viewport) {
      return;
    }

    const layoutHeight = document.documentElement.clientHeight || window.innerHeight;
    const occludedBottom = Math.max(0, layoutHeight - (viewport.offsetTop + viewport.height));
    if (occludedBottom <= 0) {
      return;
    }

    const head = view.state.selection.main.head;
    const cursorRect = view.coordsAtPos(head);
    if (!cursorRect) {
      return;
    }

    const visibleBottom = Math.round(viewport.offsetTop + viewport.height);
    const clearance = 20;
    const overlap = cursorRect.bottom + clearance - visibleBottom;
    if (overlap <= 0) {
      return;
    }

    view.scrollDOM.scrollTop += overlap;
  }, [isMobile]);

  React.useEffect(() => {
    if (!isMobile || typeof window === 'undefined') {
      return;
    }

    const runNudge = () => {
      window.requestAnimationFrame(() => {
        nudgeEditorSelectionAboveKeyboard(editorViewRef.current);
      });
    };

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', runNudge);
    viewport?.addEventListener('scroll', runNudge);
    document.addEventListener('selectionchange', runNudge);

    return () => {
      viewport?.removeEventListener('resize', runNudge);
      viewport?.removeEventListener('scroll', runNudge);
      document.removeEventListener('selectionchange', runNudge);
    };
  }, [isMobile, nudgeEditorSelectionAboveKeyboard]);

  React.useEffect(() => {
    if (!canEdit || textViewMode !== 'edit' || isMobile) {
      return;
    }

    const goToLineCombo = getEffectiveShortcutCombo('open_go_to_line', shortcutOverrides);

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('[role="dialog"]')) {
        return;
      }

      const isEditorTarget = Boolean(target?.closest('.cm-editor'));
      const isTypingTarget = Boolean(
        target?.closest('input, textarea, [contenteditable="true"], [role="textbox"]')
      );
      if (isTypingTarget && !isEditorTarget) {
        return;
      }

      const activeElement = document.activeElement as Element | null;
      const editorHasFocus = Boolean(activeElement?.closest('.cm-editor'));
      if (!editorHasFocus) {
        return;
      }

      if (eventMatchesShortcut(event, goToLineCombo)) {
        event.preventDefault();
        setIsGoToLineOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canEdit, isMobile, shortcutOverrides, textViewMode]);

  const editorExtensions = React.useMemo(() => {
    if (!selectedFile?.path) {
      return [createFlexokiCodeMirrorTheme(currentTheme)];
    }

    const extensions = [createFlexokiCodeMirrorTheme(currentTheme)];
    const language = staticLanguageExtension ?? dynamicLanguageExtension;
    if (language) {
      extensions.push(language);
    }
    if (wrapLines) {
      extensions.push(EditorView.lineWrapping);
    }
    if (isMobile) {
      extensions.push(EditorView.updateListener.of((update) => {
        if (!update.view.hasFocus) {
          return;
        }
        if (!(update.selectionSet || update.focusChanged || update.viewportChanged || update.geometryChanged)) {
          return;
        }

        window.requestAnimationFrame(() => {
          nudgeEditorSelectionAboveKeyboard(update.view);
        });
      }));
    }
    return extensions;
  }, [currentTheme, selectedFile?.path, staticLanguageExtension, dynamicLanguageExtension, wrapLines, isMobile, nudgeEditorSelectionAboveKeyboard]);

  const pierreTheme = React.useMemo(
    () => ({ light: lightTheme.metadata.id, dark: darkTheme.metadata.id }),
    [lightTheme.metadata.id, darkTheme.metadata.id],
  );

  const imageSrc = selectedFile?.path && isSelectedImage
    ? (isSelectedSvg
      ? `data:${getImageMimeType(selectedFile.path)};utf8,${encodeURIComponent(fileContent)}`
      : `/api/fs/raw?path=${encodeURIComponent(selectedFile.path)}`)
    : '';




  const renderDialogs = () => (
    <FileMutationDialog
      kind={activeDialog}
      target={dialogData}
      inputValue={dialogInputValue}
      submitting={isDialogSubmitting}
      onInputChange={setDialogInputValue}
      onClose={() => setActiveDialog(null)}
      onSubmit={() => { void handleDialogSubmit(); }}
    />
  );

  const blockWidgets = React.useMemo(() => {
    return buildCodeMirrorCommentWidgets({
      drafts: filesFileDrafts,
      editingDraftId,
      commentText,
      selection: lineSelection,
      isDragging,
      fileLabel: selectedFile?.path ?? '',
      newWidgetId: 'files-new-comment-input',
      mapDraftToRange: (draft) => ({ start: draft.startLine, end: draft.endLine }),
      onSave: handleSaveComment,
      onCancel: () => {
        setLineSelection(null);
        cancel();
      },
      onEdit: (draft) => {
        startEdit(draft);
        setLineSelection({ start: draft.startLine, end: draft.endLine });
      },
      onDelete: deleteDraft,
    });
  }, [cancel, commentText, deleteDraft, editingDraftId, filesFileDrafts, handleSaveComment, isDragging, lineSelection, selectedFile?.path, startEdit]);

  const renderShikiFileView = React.useCallback((file: FileNode, content: string) => {
    return (
      <div className="h-full">
        <PierreFile
          file={{
            name: file.name,
            contents: content,
            lang: getLanguageFromExtension(file.path) || undefined,
          }}
          options={{
            disableFileHeader: true,
            overflow: wrapLines ? 'wrap' : 'scroll',
            theme: pierreTheme,
            themeType: currentTheme.metadata.variant === 'dark' ? 'dark' : 'light',
          }}
          className="block h-full w-full"
          style={{ height: '100%' }}
        />
      </div>
    );
  }, [currentTheme.metadata.variant, pierreTheme, wrapLines]);

  const fileViewerControlsProps = {
    autoSaveStatus,
    canCopy,
    canCopyPath,
    canEdit,
    displayPath: displaySelectedPath,
    editorView: editorViewRef.current,
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
    onDownload: files.downloadFile
      ? () => { void files.downloadFile?.(selectedFilePath); }
      : undefined,
    onFullscreenChange: setIsFullscreen,
    onGoToLineOpenChange: setIsGoToLineOpen,
    onJsonViewModeChange: saveJsonViewMode,
    onPreviewModeChange: isHtml ? saveHtmlViewMode : saveMdViewMode,
    onSave: () => { void saveDraft(); },
    onSearchOpenChange: setIsSearchOpen,
    onWrapLinesChange: setWrapLines,
    previewMode: isHtml ? getHtmlViewMode() : getMdViewMode(),
    textViewMode,
    wrapLines,
  } as const;

  const fileViewer = (
    <div
      className="relative flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden"
    >
      <Dialog open={confirmDiscardOpen} onOpenChange={(open) => {
        // Intentionally no "cancel" action. Keep dialog modal.
        if (!open) {
          setConfirmDiscardOpen(true);
        }
      }}>
        <DialogContent showCloseButton={false} className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>
              Save your edits before continuing?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => void saveAndContinue()}
              disabled={isSaving}
              className="border-[var(--status-success-border)] bg-[var(--status-success-background)] text-[var(--status-success)] hover:bg-[rgb(var(--status-success)/0.2)]"
            >
              Save changes
            </Button>
            <Button variant="destructive" onClick={discardAndContinue}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className={cn('flex flex-col flex-shrink-0', showEditorTabsRow && 'border-b border-border/40')}>
        {/* Row 1: Tabs */}
        {showEditorTabsRow ? (
          <EditorTabs
            openFiles={openFiles}
            selectedFile={selectedFile}
            root={root}
            showMobilePageContent={showMobilePageContent}
            setShowMobilePageContent={setShowMobilePageContent}
            onSelectFile={handleSelectFile}
            onCloseFile={handleCloseFile}
          />
        ) : null}

      </div>

      <div className="flex-1 min-h-0 min-w-0 relative">
        {selectedFile && !isSearchOpen && (
          <FloatingFileViewerControls {...fileViewerControlsProps} />
        )}
        <ScrollableOverlay outerClassName="h-full min-w-0" className="h-full min-w-0">
          {!selectedFile ? (
            <div className="p-3 typography-ui text-muted-foreground">Pick a file from the tree.</div>
          ) : fileLoading ? (
            suppressFileLoadingIndicator
              ? <div className="p-3" />
              : (
                <div className="p-3 flex items-center gap-2 typography-ui text-muted-foreground">
                  <RiLoader4Line className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              )
          ) : fileError ? (
            <div className="p-3 typography-ui text-[color:var(--status-error)]">{fileError}</div>
          ) : isSelectedImage ? (
            <div className="flex h-full items-center justify-center p-3">
              <img
                src={imageSrc}
                alt={selectedFile?.name ?? 'Image'}
                className="max-w-full max-h-[70vh] object-contain rounded-md border border-border/30 bg-primary/10"
              />
            </div>
          ) : selectedFile && isJson && jsonViewMode === 'tree' ? (
            <ErrorBoundary
              fallback={
                <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                  <div className="mb-1 font-medium text-destructive">JSON viewer unavailable</div>
                  <div className="text-sm text-muted-foreground">
                    Switch to text mode to view raw content.
                  </div>
                </div>
              }
            >
              <div className="h-full overflow-auto">
                <JsonTreeView
                  jsonString={fileContent}
                  maxHeight="100%"
                  initiallyExpandedDepth={2}
                />
              </div>
            </ErrorBoundary>
          ) : selectedFile && isMarkdown && getMdViewMode() === 'preview' ? (
            <div className="h-full overflow-auto p-3">
              {fileContent.length > 500 * 1024 && (
                <div className="mb-3 rounded-md border border-status-warning/20 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
                  This file is large ({Math.round(fileContent.length / 1024)}KB). Preview may be limited.
                </div>
              )}
              <ErrorBoundary
                fallback={
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                    <div className="mb-1 font-medium text-destructive">Preview unavailable</div>
                    <div className="text-sm text-muted-foreground">
                      Switch to edit mode to fix the issue.
                    </div>
                  </div>
                }
              >
                <SimpleMarkdownRenderer
                  content={fileContent}
                  className="typography-markdown-body"
                  stripFrontmatter
                />
              </ErrorBoundary>
            </div>
          ) : selectedFile && isHtml && htmlViewMode === 'preview' ? (
            <div className="h-full overflow-hidden">
              <iframe
                srcDoc={(() => {
                  // Inject base tag for relative paths (CSS/JS/images) to work
                  const basePath = selectedFile.path.substring(0, selectedFile.path.lastIndexOf('/') + 1);
                  if (!basePath) return fileContent;
                  const baseTag = `<base href="${basePath}">`;
                  return fileContent.replace(/<head([^>]*)>/i, `<head$1>${baseTag}`);
                })()}
                className="w-full h-full border-none"
                sandbox="allow-scripts allow-same-origin allow-forms"
                title="HTML Preview"
              />
            </div>
          ) : selectedFile && canUseShikiFileView && textViewMode === 'view' ? (
            renderShikiFileView(selectedFile, draftContent)
          ) : (
            <div
              className={cn('relative h-full', shouldMaskEditorForPendingNavigation && 'overflow-hidden')}
              ref={editorWrapperRef}
            >
              <div className={cn('h-full', shouldMaskEditorForPendingNavigation && 'invisible')}>
                <CodeMirrorEditor
                  value={draftContent}
                  onChange={setDraftContent}
                  extensions={editorExtensions}
                  className="h-full"
                  blockWidgets={blockWidgets}
                  onViewReady={(view) => {
                    editorViewRef.current = view;
                    setEditorViewReadyNonce((value) => value + 1);
                    window.requestAnimationFrame(() => {
                      nudgeEditorSelectionAboveKeyboard(view);
                    });
                  }}
                  onViewDestroy={() => {
                    if (editorViewRef.current) {
                      editorViewRef.current = null;
                    }
                    setEditorViewReadyNonce((value) => value + 1);
                  }}
                  enableSearch
                  searchOpen={isSearchOpen}
                  onSearchOpenChange={setIsSearchOpen}
                  highlightLines={lineSelection
                    ? {
                      start: Math.min(lineSelection.start, lineSelection.end),
                      end: Math.max(lineSelection.start, lineSelection.end),
                    }
                    : undefined}
                  lineNumbersConfig={{
                    domEventHandlers: {
                      mousedown: (view: EditorView, line: { from: number; to: number }, event: Event) => {
                        if (!(event instanceof MouseEvent)) {
                          return false;
                        }
                        if (event.button !== 0) {
                          return false;
                        }
                        event.preventDefault();

                        const lineNumber = view.state.doc.lineAt(line.from).number;

                        // Mobile: tap-to-extend selection
                        if (isMobile && lineSelection && !event.shiftKey) {
                          const start = Math.min(lineSelection.start, lineSelection.end, lineNumber);
                          const end = Math.max(lineSelection.start, lineSelection.end, lineNumber);
                          setLineSelection({ start, end });
                          isSelectingRef.current = false;
                          selectionStartRef.current = null;
                          setIsDragging(false);
                          return true;
                        }

                        isSelectingRef.current = true;
                        selectionStartRef.current = lineNumber;
                        setIsDragging(true);

                        if (lineSelection && event.shiftKey) {
                          const start = Math.min(lineSelection.start, lineNumber);
                          const end = Math.max(lineSelection.end, lineNumber);
                          setLineSelection({ start, end });
                        } else {
                          setLineSelection({ start: lineNumber, end: lineNumber });
                        }

                        return true;
                      },
                      mouseover: (view: EditorView, line: { from: number; to: number }, event: Event) => {
                        if (!(event instanceof MouseEvent)) {
                          return false;
                        }
                        if (event.buttons !== 1) {
                          return false;
                        }
                        if (!isSelectingRef.current || selectionStartRef.current === null) {
                          return false;
                        }

                        const lineNumber = view.state.doc.lineAt(line.from).number;
                        const start = Math.min(selectionStartRef.current, lineNumber);
                        const end = Math.max(selectionStartRef.current, lineNumber);
                        setLineSelection({ start, end });
                        setIsDragging(true);
                        return false;
                      },
                      mouseup: () => {
                        isSelectingRef.current = false;
                        selectionStartRef.current = null;
                        setIsDragging(false);
                        return false;
                      },
                    },
                  }}
                />
              </div>
              {shouldMaskEditorForPendingNavigation && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
                  <div className="flex items-center gap-2 typography-ui text-muted-foreground">
                    <RiLoader4Line className="h-4 w-4 animate-spin" />
                    Opening file at change...
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollableOverlay>
      </div>
    </div>
  );

  const hasTree = Boolean(root && childrenByDir[root]);

  const treePanel = (
    <section className={cn(
      "flex min-h-0 flex-col overflow-hidden",
      isMobile ? "h-full w-full bg-background" : "h-full rounded-xl border border-border/60 bg-background/70"
    )}>
      <div className={cn("flex flex-col gap-2 py-2", isMobile ? "px-3" : "px-2")}>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <RiSearchLine className="pointer-events-none absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search files…"
              className="h-8 pl-8 pr-8 typography-meta"
            />
            {searchQuery.trim().length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2 top-2 inline-flex h-4 w-4 items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
              >
                <RiCloseLine className="h-4 w-4" />
              </button>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenDialog('createFile', { path: currentDirectory, type: 'directory' })}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="New File"
          >
            <RiFileAddLine className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleOpenDialog('createFolder', { path: currentDirectory, type: 'directory' })}
            className="h-8 w-8 p-0 flex-shrink-0"
            title="New Folder"
          >
            <RiFolderAddLine className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void refreshRoot()} className="h-8 w-8 p-0 flex-shrink-0">
            <RiRefreshLine className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ScrollableOverlay outerClassName="flex-1 min-h-0" className={cn("py-2", isMobile ? "px-3" : "px-2")}>
        <ul className="flex flex-col">
          {searching ? (
            <li className="flex items-center gap-1.5 px-2 py-1 typography-meta text-muted-foreground">
              <RiLoader4Line className="h-4 w-4 animate-spin" />
              Searching…
            </li>
          ) : searchResults.length > 0 ? (
            searchResults.map((node) => {
              const isActive = selectedFile?.path === node.path;
              return (
                <li key={node.path}>
                  <button
                    type="button"
                    onClick={() => void handleSelectFile(node)}
                    className={cn(
                      'flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-foreground transition-colors',
                      isActive ? 'bg-interactive-selection/70' : 'hover:bg-interactive-hover/40'
                    )}
                  >
                    {getFileIcon(node.path, node.extension)}
                    <span
                      className="min-w-0 flex-1 truncate typography-meta"
                      style={{ direction: 'rtl', textAlign: 'left' }}
                      title={node.path}
                    >
                      {node.relativePath ?? node.path}
                    </span>
                  </button>
                </li>
              );
            })
          ) : hasTree ? (
            renderTree(root, 0)
          ) : (
            <li className="px-2 py-1 typography-meta text-muted-foreground">Loading…</li>
          )}
        </ul>
      </ScrollableOverlay>
    </section>
  );

  // Fullscreen file viewer overlay
  const fullscreenViewer = mode === 'full' && isFullscreen && selectedFile && (
    <div className="absolute inset-0 z-50 flex flex-col bg-background">
      {/* Fullscreen content */}
      <div className="flex-1 min-h-0 min-w-0 relative">
        <div className="absolute right-4 top-4 z-30">
          <FileViewerControls {...fileViewerControlsProps} exitFullscreenOnly />
        </div>
        <ScrollableOverlay outerClassName="h-full min-w-0" className="h-full min-w-0">
          {fileLoading ? (
            suppressFileLoadingIndicator
              ? <div className="p-4" />
              : (
                <div className="p-4 flex items-center gap-2 typography-ui text-muted-foreground">
                  <RiLoader4Line className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              )
          ) : fileError ? (
            <div className="p-4 typography-ui text-[color:var(--status-error)]">{fileError}</div>
          ) : isSelectedImage ? (
            <div className="flex h-full items-center justify-center p-4">
              <img
                src={imageSrc}
                alt={selectedFile.name}
                className="max-w-full max-h-full object-contain rounded-md border border-border/30 bg-primary/10"
              />
            </div>
          ) : isMarkdown && getMdViewMode() === 'preview' ? (
            <div className="h-full overflow-auto p-4">
              {fileContent.length > 500 * 1024 && (
                <div className="mb-3 rounded-md border border-status-warning/20 bg-status-warning/10 px-3 py-2 text-sm text-status-warning">
                  This file is large ({Math.round(fileContent.length / 1024)}KB). Preview may be limited.
                </div>
              )}
              <ErrorBoundary
                fallback={
                  <div className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2">
                    <div className="mb-1 font-medium text-destructive">Preview unavailable</div>
                    <div className="text-sm text-muted-foreground">
                      Switch to edit mode to fix the issue.
                    </div>
                  </div>
                }
              >
                <SimpleMarkdownRenderer
                  content={fileContent}
                  className="typography-markdown-body"
                  stripFrontmatter
                />
              </ErrorBoundary>
            </div>
          ) : canUseShikiFileView && textViewMode === 'view' ? (
            renderShikiFileView(selectedFile, draftContent)
          ) : (
            <div className={cn('relative h-full', shouldMaskEditorForPendingNavigation && 'overflow-hidden')}>
              <div className={cn('h-full', shouldMaskEditorForPendingNavigation && 'invisible')}>
                <CodeMirrorEditor
                  value={draftContent}
                  onChange={setDraftContent}
                  extensions={editorExtensions}
                  className="h-full"
                  onViewReady={(view) => {
                    editorViewRef.current = view;
                    window.requestAnimationFrame(() => {
                      nudgeEditorSelectionAboveKeyboard(view);
                    });
                  }}
                  onViewDestroy={() => {
                    if (editorViewRef.current) {
                      editorViewRef.current = null;
                    }
                  }}
                />
              </div>
              {shouldMaskEditorForPendingNavigation && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background">
                  <div className="flex items-center gap-2 typography-ui text-muted-foreground">
                    <RiLoader4Line className="h-4 w-4 animate-spin" />
                    Opening file at change...
                  </div>
                </div>
              )}
            </div>
          )}
        </ScrollableOverlay>
      </div>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-background relative">
      {renderDialogs()}
      {fullscreenViewer}
      {isMobile ? (
        showMobilePageContent ? (
          fileViewer
        ) : (
          treePanel
        )
      ) : mode === 'editor-only' ? (
        <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden bg-background">
            {fileViewer}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0 min-w-0 gap-3 px-3 pb-3 pt-2">
          {screenWidth >= 700 && (
            <div className="w-72 flex-shrink-0 min-h-0 overflow-hidden">
              {treePanel}
            </div>
          )}
          <div className="flex-1 min-h-0 min-w-0 overflow-hidden rounded-xl border border-border/60 bg-background">
            {fileViewer}
          </div>
        </div>
      )}
    </div>
  );
};
