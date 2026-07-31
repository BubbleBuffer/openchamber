import React from 'react';
import { lazyWithChunkRecovery } from '@/lib/errors/chunkLoadRecovery';

// Thin lazy wrapper around the heavy MarkdownRenderer implementation.
// The full implementation (marked, react-markdown, beautiful-mermaid,
// react-syntax-highlighter, etc.) is loaded on demand, keeping the
// initial bundle lean.

export type { MarkdownVariant } from './MarkdownRendererImpl';

const MarkdownRendererLazy = lazyWithChunkRecovery(() =>
  import('./MarkdownRendererImpl').then((m) => ({ default: m.MarkdownRenderer }))
);

const SimpleMarkdownRendererLazy = lazyWithChunkRecovery(() =>
  import('./MarkdownRendererImpl').then((m) => ({ default: m.SimpleMarkdownRenderer }))
);

type MarkdownRendererProps = React.ComponentPropsWithoutRef<typeof MarkdownRendererLazy>;
type SimpleMarkdownRendererProps = React.ComponentPropsWithoutRef<typeof SimpleMarkdownRendererLazy>;

const PlainTextFallback: React.FC<{ content: string; className?: string }> = ({ content, className }) => (
  <div className={`break-words whitespace-pre-wrap w-full min-w-0 ${className ?? ''}`}>
    {content}
  </div>
);

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = (props) => (
  <React.Suspense fallback={<PlainTextFallback content={props.content} className={props.className} />}>
    <MarkdownRendererLazy {...props} />
  </React.Suspense>
);

export const SimpleMarkdownRenderer: React.FC<SimpleMarkdownRendererProps> = (props) => (
  <React.Suspense fallback={<PlainTextFallback content={props.content} className={props.className} />}>
    <SimpleMarkdownRendererLazy {...props} />
  </React.Suspense>
);
