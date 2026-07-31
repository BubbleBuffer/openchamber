import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  FileViewerControls,
  FloatingFileViewerControls,
  type FileViewerControlsProps,
} from './FileViewerControls';

const props = (overrides: Partial<FileViewerControlsProps> = {}): FileViewerControlsProps => ({
  autoSaveStatus: 'idle',
  canCopy: true,
  canCopyPath: true,
  canEdit: true,
  displayPath: 'src/example.ts',
  editorView: null,
  fileContent: 'export {};',
  isDirty: false,
  isFullscreen: false,
  isGoToLineOpen: false,
  isHtml: false,
  isJson: false,
  isMarkdown: false,
  isMobile: false,
  isSaving: false,
  isSelectedImage: false,
  jsonViewMode: 'tree',
  mode: 'full',
  onFullscreenChange: () => undefined,
  onGoToLineOpenChange: () => undefined,
  onJsonViewModeChange: () => undefined,
  onPreviewModeChange: () => undefined,
  onSave: () => undefined,
  onSearchOpenChange: () => undefined,
  onWrapLinesChange: () => undefined,
  previewMode: 'edit',
  textViewMode: 'view',
  wrapLines: true,
  ...overrides,
});

describe('FileViewerControls', () => {
  it('keeps file actions and fullscreen affordances in the extracted controls', () => {
    const markup = renderToStaticMarkup(<FileViewerControls {...props()} />);

    expect(markup).toContain('Copy file contents');
    expect(markup).toContain('Copy file path (src/example.ts)');
    expect(markup).toContain('aria-label="Fullscreen"');
    expect(markup).toContain('Disable line wrap');
  });

  it('renders the saving state and exit-only fullscreen variant', () => {
    const markup = renderToStaticMarkup(
      <FileViewerControls
        {...props({ isSaving: true, textViewMode: 'edit' })}
        exitFullscreenOnly
      />,
    );

    expect(markup).toContain('Saving...');
    expect(markup).toContain('aria-label="Exit fullscreen"');
    expect(markup).not.toContain('aria-label="Fullscreen"');
  });

  it('starts the floating wrapper collapsed', () => {
    const markup = renderToStaticMarkup(<FloatingFileViewerControls {...props()} />);

    expect(markup).toContain('aria-label="Show editor controls"');
    expect(markup).not.toContain('Copy file contents');
  });
});
