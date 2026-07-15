// packages/ui/src/components/layout/MobileDrawerPanel.tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface MobileDrawerPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Show drag handle at top */
  showDragHandle?: boolean;
  renderHeader?: (closeButton: React.ReactNode) => React.ReactNode;
}

export const MobileDrawerPanel: React.FC<MobileDrawerPanelProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  showDragHandle = true,
  renderHeader,
}) => {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [panelVisible, setPanelVisible] = React.useState(open);
  const [animating, setAnimating] = React.useState(false);
  const touchStartYRef = React.useRef(0);
  const touchCurrentYRef = React.useRef(0);
  const isDraggingRef = React.useRef(false);

  // Track open/close state with animation
  React.useEffect(() => {
    if (open) {
      setPanelVisible(true);
    } else if (!animating) {
      const timer = setTimeout(() => setPanelVisible(false), 200);
      return () => clearTimeout(timer);
    }
  }, [open, animating]);

  // Animate panel entry
  React.useEffect(() => {
    if (!panelRef.current || !panelVisible) return;

    const panel = panelRef.current;
    if (open) {
      panel.style.transform = 'translateY(100%)';
      panel.style.transition = 'none';
      void panel.offsetHeight;
      panel.style.transition = 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)';
      panel.style.transform = 'translateY(0)';
      setAnimating(true);
      const timer = setTimeout(() => setAnimating(false), 350);
      return () => clearTimeout(timer);
    } else {
      panel.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
      panel.style.transform = 'translateY(100%)';
      setAnimating(true);
      const timer = setTimeout(() => {
        setAnimating(false);
        setPanelVisible(false);
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, panelVisible]);

  // Swipe-to-dismiss
  const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
    isDraggingRef.current = false;
  }, []);

  const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!panelRef.current) return;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (deltaY > 0) {
      isDraggingRef.current = true;
      touchCurrentYRef.current = deltaY;
      panelRef.current.style.transition = 'none';
      panelRef.current.style.transform = `translateY(${deltaY}px)`;
    }
  }, []);

  const handleTouchEnd = React.useCallback(() => {
    if (!isDraggingRef.current || !panelRef.current) return;
    isDraggingRef.current = false;

    if (touchCurrentYRef.current > 100) {
      panelRef.current.style.transition = 'transform 0.2s ease-out';
      panelRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => onClose(), 200);
    } else {
      panelRef.current.style.transition = 'transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)';
      panelRef.current.style.transform = 'translateY(0)';
    }
    touchCurrentYRef.current = 0;
  }, [onClose]);

  if (!panelVisible) return null;

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-interactive-hover"
      aria-label="Close"
      style={{ minHeight: '44px', minWidth: '44px' }}
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        className={cn(
          'mt-auto flex max-h-[calc(100dvh-1rem)] min-h-0 w-full flex-col',
          'rounded-t-2xl border border-border/50 bg-[var(--surface-background)]',
          'shadow-2xl',
          'mx-auto max-w-lg',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        {showDragHandle && (
          <div className="flex justify-center pt-2 pb-1">
            <div className="w-9 h-1 rounded-full bg-[var(--border-muted)]" />
          </div>
        )}

        {/* Header */}
        {renderHeader ? renderHeader(closeButton) : (
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
            <h2 className="typography-ui-label font-semibold text-foreground">{title}</h2>
            {closeButton}
          </div>
        )}

        {/* Scrollable content */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="shrink-0 border-t border-border/40 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileDrawerPanel;
