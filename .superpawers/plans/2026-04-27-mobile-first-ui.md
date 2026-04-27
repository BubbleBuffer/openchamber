# Mobile-First UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Invert the mobile/desktop layout architecture so mobile is the default rendering path and desktop conditionally adds complexity, with a new bottom tab navigation bar, swipe-up drawer panels, a mobile-first ChatContainer, decomposed MessageList, touch-optimized ChatInput, and clean MobileSessionStatusBar.

**Architecture:** A new `MobileShell` component wraps all mobile content with a fixed bottom tab bar (`MobileBottomTabs`) that replaces the desktop sidebar for tab switching. A generic `MobileDrawerPanel` component (built on the existing `MobileOverlayPanel`) provides swipe-up drawer panels for model/agent selection, session list, file preview, etc. `ChatContainer` is restructured so its default layout targets small screens — `isDesktop` becomes the conditional instead of `isMobile`. `MessageList` is decomposed into focused sub-components. `ChatInput` receives 44px minimum tap targets and visual viewport API keyboard handling. `MobileSessionStatusBar` is virtualized and receives pull-to-refresh. Phase 2 (Store Refactoring) is assumed complete — stores are split, dialog state is in `useDialogStore`, voice settings in `useVoiceSettingsStore`.

**Tech Stack:** TypeScript, React, Zustand, Tailwind v4, `@tanstack/react-virtual`, `motion`, `@remixicon/react`, Bun

---

## File Changes

| File | Change |
|------|--------|
| `packages/ui/src/components/layout/MobileShell.tsx` | **Create** — mobile-only layout wrapper with bottom tab bar |
| `packages/ui/src/components/layout/MobileBottomTabs.tsx` | **Create** — bottom tab bar component with 4 tabs |
| `packages/ui/src/components/layout/MobileDrawerPanel.tsx` | **Create** — generic swipe-up drawer with backdrop blur |
| `packages/ui/src/components/layout/MainLayout.tsx` | **Modify** — route mobile to MobileShell, keep desktop path unchanged |
| `packages/ui/src/components/chat/ChatContainer.tsx` | **Modify** — mobile-first default, remove isMobile prop threading, useDeviceInfo at leaves |
| `packages/ui/src/components/chat/MessageList.tsx` | **Modify** — extract TurnBlock, StreamingTail, LoadOlderButton; thin to orchestration only |
| `packages/ui/src/components/chat/turn/TurnBlock.tsx` | **Create** — grouped turn rendering (extracted from MessageList) |
| `packages/ui/src/components/chat/turn/StreamingTail.tsx` | **Create** — live streaming tail content (extracted from MessageList) |
| `packages/ui/src/components/chat/turn/LoadOlderButton.tsx` | **Create** — load older messages trigger (extracted from MessageList) |
| `packages/ui/src/components/chat/ChatInput.tsx` | **Modify** — 44px min tap targets, visual viewport API, improved attachment picker, voice button |
| `packages/ui/src/components/chat/MobileSessionStatusBar.tsx` | **Modify** — virtualize session list, add pull-to-refresh, add search/filter |
| `packages/ui/src/components/chat/UnifiedControlsDrawer.tsx` | **Modify** — use MobileDrawerPanel as base |
| `packages/ui/src/components/chat/MobileAgentButton.tsx` | **Modify** — 44px minimum touch target |
| `packages/ui/src/components/chat/MobileModelButton.tsx` | **Modify** — 44px minimum touch target |
| `packages/ui/src/stores/useUIStore.ts` | **Modify** — add `mobileActiveTab` field if needed |
| `packages/ui/src/lib/router/types.ts` | **No change** — existing MainTab type covers mobile needs |

---

### Task 1: MobileShell + MobileBottomTabs

**Files:**
- Create: `packages/ui/src/components/layout/MobileShell.tsx`
- Create: `packages/ui/src/components/layout/MobileBottomTabs.tsx`
- Modify: `packages/ui/src/components/layout/MainLayout.tsx:630-988`

- [ ] **Step 1: Create MobileBottomTabs.tsx**

```typescript
// packages/ui/src/components/layout/MobileBottomTabs.tsx
import React from 'react';
import { cn } from '@/lib/utils';
import type { MainTab } from '@/stores/useUIStore';
import {
  RiChat1Line,
  RiFileList3Line,
  RiTerminalBoxLine,
  RiMore2Line,
} from '@remixicon/react';

export interface TabDefinition {
  id: MainTab | 'more';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const MOBILE_TABS: TabDefinition[] = [
  { id: 'chat', label: 'Chat', icon: RiChat1Line },
  { id: 'files', label: 'Context', icon: RiFileList3Line },
  { id: 'terminal', label: 'Terminal', icon: RiTerminalBoxLine },
  { id: 'more', label: 'More', icon: RiMore2Line },
];

interface MobileBottomTabsProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  onOpenMore: () => void;
  unreadCount?: number;
}

export const MobileBottomTabs: React.FC<MobileBottomTabsProps> = ({
  activeTab,
  onTabChange,
  onOpenMore,
  unreadCount = 0,
}) => {
  return (
    <nav
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'bg-[var(--surface-background)]',
        'border-t border-border/40',
        'pb-[env(safe-area-inset-bottom,0px)]',
        'safe-area-bottom',
      )}
    >
      <div className="flex items-center justify-around h-14">
        {MOBILE_TABS.map((tab) => {
          const isActive = tab.id === (activeTab === 'git' || activeTab === 'diff' || activeTab === 'plan' ? 'more' : activeTab) || (tab.id === 'more' && (activeTab === 'git' || activeTab === 'diff' || activeTab === 'plan'));
          // Show "more" as active when on git/diff/plan tabs
          const showActive = tab.id === 'more'
            ? activeTab === 'git' || activeTab === 'diff' || activeTab === 'plan'
            : tab.id === activeTab;

          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === 'more') {
                  onOpenMore();
                } else {
                  onTabChange(tab.id as MainTab);
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full',
                'min-w-0 gap-0.5',
                'transition-colors duration-150',
                showActive
                  ? 'text-[var(--primary)]'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              style={{ minHeight: '44px' }}
              aria-label={tab.label}
              aria-current={showActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon className="h-5 w-5" />
                {tab.id === 'chat' && unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[var(--status-error)] border-2 border-[var(--surface-background)]" />
                )}
              </div>
              <span className="text-[10px] leading-tight font-medium tracking-wide">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default MobileBottomTabs;
```

- [ ] **Step 2: Create MobileShell.tsx**

```typescript
// packages/ui/src/components/layout/MobileShell.tsx
import React from 'react';
import { useUIStore } from '@/stores/useUIStore';
import { useDeviceInfo } from '@/lib/device';
import { useDialogStore } from '@/stores/useDialogStore';
import { cn } from '@/lib/utils';
import type { MainTab } from '@/stores/useUIStore';
import { MobileBottomTabs } from './MobileBottomTabs';
import { Header } from './Header';

interface MobileShellProps {
  children: React.ReactNode;
  /** Optional header rendered at top */
  header?: React.ReactNode;
  /** Whether to show the header */
  showHeader?: boolean;
}

export const MobileShell: React.FC<MobileShellProps> = ({
  children,
  header,
  showHeader = true,
}) => {
  const activeMainTab = useUIStore((s) => s.activeMainTab);
  const setActiveMainTab = useUIStore((s) => s.setActiveMainTab);
  const setSettingsDialogOpen = useUIStore((s) => s.setSettingsDialogOpen);

  const handleTabChange = React.useCallback((tab: MainTab) => {
    setActiveMainTab(tab);
  }, [setActiveMainTab]);

  const handleOpenMore = React.useCallback(() => {
    // Open the more menu — we reuse settings as the "more" panel on mobile
    setSettingsDialogOpen(true);
  }, [setSettingsDialogOpen]);

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-background',
        'pb-[calc(3.5rem+env(safe-area-inset-bottom,0px))]', // space for bottom tabs
      )}
    >
      {showHeader && (header ?? <Header />)}
      <div className="flex-1 min-h-0 overflow-hidden relative">
        {children}
      </div>
      <MobileBottomTabs
        activeTab={activeMainTab}
        onTabChange={handleTabChange}
        onOpenMore={handleOpenMore}
      />
    </div>
  );
};

export default MobileShell;
```

- [ ] **Step 3: Integrate MobileShell into MainLayout.tsx**

In `MainLayout.tsx`, replace the current mobile path (lines 645-842) with a `MobileShell` wrapper that contains the same child content. The desktop path (lines 843-984) stays unchanged.

The key change: instead of the inline `DrawerProvider` + mobile drawer markup + mobile header + backdrop + left/right drawer + main content area, wrap the mobile content in `<MobileShell>` and keep only the main content area + the `DrawerProvider` for the session sidebar drawer.

Current mobile path starts at line 645:
```tsx
{isMobile ? (
<DrawerProvider value={{...}}>
  {!isSettingsDialogOpen && <Header ... />}
  {/* Backdrop */}
  {/* Left drawer (Session) */}
  {/* Right drawer (Git) */}
  {/* Main content area */}
  {/* Mobile settings: full screen */}
</DrawerProvider>
```

Change to:
```tsx
{isMobile ? (
  <>
    {/* Overlay dialogs */ }
    <CommandPalette />
    <HelpDialog />
    <OpenCodeStatusDialog />
    <SessionDialogs />

    <MobileShell>
      {/* Main content area */ }
      <div
        className={cn(
          'flex flex-1 overflow-hidden relative',
          isSettingsDialogOpen && 'hidden'
        )}
      >
        <main className="w-full h-full overflow-hidden bg-background relative">
          <div className={cn('absolute inset-0', !isChatActive && 'invisible')}>
            <ErrorBoundary><ChatView /></ErrorBoundary>
          </div>
          {secondaryView && (
            <div className="absolute inset-0">
              <ErrorBoundary>{secondaryView}</ErrorBoundary>
            </div>
          )}
          {isMultiRunLauncherOpen && (
            <div className="absolute inset-0 z-10 bg-background">
              <ErrorBoundary>
                <MultiRunLauncher
                  initialPrompt={multiRunLauncherPrefillPrompt}
                  onCreated={() => setMultiRunLauncherOpen(false)}
                  onCancel={() => setMultiRunLauncherOpen(false)}
                />
              </ErrorBoundary>
            </div>
          )}
        </main>
      </div>

      {/* Mobile settings: full screen */ }
      {isSettingsDialogOpen && (
        <div
          className="fixed inset-0 z-20 bg-background"
          style={{ paddingTop: 'var(--oc-safe-area-top, 0px)', paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <ErrorBoundary>
            <React.Suspense fallback={null}>
              <SettingsView onClose={() => setSettingsDialogOpen(false)} />
            </React.Suspense>
          </ErrorBoundary>
        </div>
      )}
    </MobileShell>
  </>
) : (
```

Keep the DrawerProvider for session sidebar swipe on mobile. Add it as a wrapper inside MobileShell:

```tsx
<DrawerProvider value={{
  leftDrawerOpen: mobileLeftDrawerOpen,
  rightDrawerOpen: isRightSidebarOpen,
  toggleLeftDrawer: () => { ... },
  toggleRightDrawer: () => { ... },
  leftDrawerX,
  rightDrawerX,
  leftDrawerWidth,
  rightDrawerWidth,
  setMobileLeftDrawerOpen,
  setRightSidebarOpen,
}}>
  {/* Mobile left drawer (Session) */}
  <motion.aside ...>
    <SessionSidebar mobileVariant />
  </motion.aside>

  {/* Main content */}
  {children}
</DrawerProvider>
```

Make the imports include `MobileShell`:
```typescript
import { MobileShell } from './MobileShell';
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS. If there are import issues, fix path aliases — `@/` maps to `packages/ui/src/`.

- [ ] **Step 5: Verify the desktop path is unchanged**

Search `MainLayout.tsx` for `isMobile ?` to confirm the branch point. The desktop branch (`:`) should be untouched.

---

### Task 2: MobileDrawerPanel

**Files:**
- Create: `packages/ui/src/components/layout/MobileDrawerPanel.tsx`
- Modify: `packages/ui/src/components/chat/UnifiedControlsDrawer.tsx:1-257`
- Modify: `packages/ui/src/components/chat/MobileAgentButton.tsx:78` (touch target)
- Modify: `packages/ui/src/components/chat/MobileModelButton.tsx:28` (touch target)

- [ ] **Step 1: Create MobileDrawerPanel.tsx**

This is a generic swipe-up drawer built on top of `MobileOverlayPanel` with additional spring animation and swipe-to-dismiss.

```typescript
// packages/ui/src/components/layout/MobileDrawerPanel.tsx
import React from 'react';
import { animate } from 'motion/react';
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
import { cn } from '@/lib/utils';

interface MobileDrawerPanelProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  /** Height constraint e.g. 'max-h-[min(85dvh,640px)]' */
  maxHeight?: string;
  /** Show drag handle at top */
  showDragHandle?: boolean;
  renderHeader?: (closeButton: React.ReactNode) => React.ReactNode;
}

const springConfig = {
  type: 'spring' as const,
  stiffness: 500,
  damping: 35,
  mass: 0.8,
};

export const MobileDrawerPanel: React.FC<MobileDrawerPanelProps> = ({
  open,
  title,
  onClose,
  children,
  footer,
  className,
  maxHeight = 'max-h-[min(85dvh,640px)]',
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
      // Delay hiding until after animation
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
      // Force reflow
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
      // Swipe far enough — dismiss
      panelRef.current.style.transition = 'transform 0.2s ease-out';
      panelRef.current.style.transform = 'translateY(100%)';
      setTimeout(() => onClose(), 200);
    } else {
      // Snap back
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
```

- [ ] **Step 2: Update MobileAgentButton.tsx — 44px touch target**

In `MobileAgentButton.tsx`, change the button style block (line 76-91):

```typescript
return (
    <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
            'inline-flex min-w-0 items-center select-none',
            'rounded-lg border border-border/50 px-3',   // increased px
            'typography-label font-medium',              // larger text
            'focus:outline-none hover:bg-[var(--interactive-hover)]',
            'touch-none',
            className
        )}
        style={{
            minHeight: '44px',       // 44px minimum touch target
            color: `var(${agentColor.var})`,
        }}
        title={agentLabel}
    >
        <span className="truncate">{agentLabel}</span>
    </button>
);
```

- [ ] **Step 3: Update MobileModelButton.tsx — 44px touch target**

In `MobileModelButton.tsx`, change the button style block (line 22-34):

```typescript
return (
    <button
        type="button"
        onClick={onOpenModel}
        className={cn(
            'inline-flex min-w-0 items-center justify-center',
            'rounded-lg border border-border/50 px-3',
            'typography-label font-medium text-foreground/80',
            'focus:outline-none hover:bg-[var(--interactive-hover)]',
            className
        )}
        style={{ minHeight: '44px' }}
        title={modelLabel}
    >
        <span className="min-w-0 max-w-full overflow-x-auto whitespace-nowrap scrollbar-hidden">
            {modelLabel}
        </span>
    </button>
);
```

- [ ] **Step 4: Refactor UnifiedControlsDrawer to use MobileDrawerPanel**

This is a medium change. The `UnifiedControlsDrawer` currently uses `MobileOverlayPanel` at its root. Change it to use `MobileDrawerPanel` instead for the spring animation and swipe-to-dismiss behavior.

In `packages/ui/src/components/chat/UnifiedControlsDrawer.tsx`:

Replace the import:
```typescript
import { MobileOverlayPanel } from '@/components/ui/MobileOverlayPanel';
```
With:
```typescript
import { MobileDrawerPanel } from '@/components/layout/MobileDrawerPanel';
```

Replace the root `<MobileOverlayPanel>` wrapper (around line 200):

```typescript
return (
    <MobileDrawerPanel
        open={open}
        title="Model & Agent"
        onClose={onClose}
        footer={renderFooter()}
        maxHeight="max-h-[min(85dvh,600px)]"
    >
        {renderQuickSelect()}
        {renderModelList()}
        {renderEffortSelector()}
    </MobileDrawerPanel>
);
```

The internal functions (`renderQuickSelect`, `renderModelList`, `renderEffortSelector`, `renderFooter`) already exist in UnifiedControlsDrawer.tsx past line 80 — extract them as `React.useCallback` functions and call them inside the drawer children.

- [ ] **Step 5: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 3: Rewrite ChatContainer mobile-first

**Files:**
- Modify: `packages/ui/src/components/chat/ChatContainer.tsx`

- [ ] **Step 1: Remove isMobile prop threading from ChatContainer**

Currently `ChatContainer` reads `isMobile` from `useDeviceInfo()` at line 407 and passes it down to `ChatViewport`, `MessageList`, and CSS classes. 

The mobile-first approach:
- `ChatContainer` uses `useDeviceInfo()` internally at leaf components
- The outer shell defaults to mobile-friendly layout
- `isDesktop` conditions add desktop-specific enhancements

Remove `isMobile` from the `ChatViewport` props (line 62, prop `isMobile: boolean`) and from the `ChatViewport` memo comparison (line 177). Instead, `ChatViewport` reads `useDeviceInfo()` internally.

Replace `ChatViewport` props:
```typescript
type ChatViewportProps = {
    currentSessionId: string;
    isDesktopExpandedInput: boolean;
    // REMOVED: isMobile: boolean;
    stickyUserHeader: boolean;
    // ... rest unchanged
};
```

Add `useDeviceInfo()` inside `ChatViewport`:
```typescript
const ChatViewport = React.memo(({
    currentSessionId,
    isDesktopExpandedInput,
    // REMOVED: isMobile,
    stickyUserHeader,
    // ... rest unchanged
}: ChatViewportProps) => {
    const { isMobile } = useDeviceInfo(); // Read from device hook, not props
    // ... rest of component
});
```

- [ ] **Step 2: Fix input bar to bottom with safe area padding**

In the main return block of `ChatContainer` (lines 766-811), the ChatInput div currently has:
```tsx
<div className={cn('relative z-10', isDesktopExpandedInput ? 'flex-1 min-h-0 bg-background' : 'bg-background')}>
    <ChatInput scrollToBottom={resumeToLatestInstant} />
</div>
```

For mobile-first: always place the input at the bottom with safe area padding:
```tsx
<div className={cn(
    'relative z-10',
    'sticky bottom-0',
    isDesktopExpandedInput ? 'flex-1 min-h-0 bg-background' : 'bg-background',
    isMobile && 'pb-[env(safe-area-inset-bottom,0px)]',
)}>
```

Where `isMobile` is read from `useDeviceInfo()` at the top of the component (already available at line 407).

- [ ] **Step 3: Remove isMobile from ChatViewport usage and ChatViewport memo comparator**

At line 769-792 where ChatViewport is rendered, remove the `isMobile={isMobile}` prop:
```tsx
<ChatViewport
    currentSessionId={currentSessionId}
    isDesktopExpandedInput={isDesktopExpandedInput}
    // REMOVED: isMobile={isMobile}
    stickyUserHeader={stickyUserHeader}
    // ... rest unchanged
/>
```

Update the memo comparator (line 174-197) to remove `next.isMobile === prev.isMobile`:
```typescript
}, (prev, next) => {
    return prev.currentSessionId === next.currentSessionId
        && prev.isDesktopExpandedInput === next.isDesktopExpandedInput
        // REMOVED: && prev.isMobile === next.isMobile
        && prev.stickyUserHeader === next.stickyUserHeader
        // ... rest unchanged
});
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 4: Decompose MessageList

**Files:**
- Modify: `packages/ui/src/components/chat/MessageList.tsx` (thin down)
- Create: `packages/ui/src/components/chat/turn/TurnBlock.tsx`
- Create: `packages/ui/src/components/chat/turn/StreamingTail.tsx`
- Create: `packages/ui/src/components/chat/turn/LoadOlderButton.tsx`

This task extracts three components from `MessageList.tsx` (currently 1,666 lines). Each extraction preserves existing behavior.

- [ ] **Step 1: Create TurnBlock.tsx**

`TurnBlock` renders a single turn group: the user message + all assistant messages within a turn. It replaces the inline turn rendering in `MessageList` around lines 200-500.

First, create the directory:
```bash
mkdir -p /home/breadcat/Projects/openchamber/packages/ui/src/components/chat/turn
```

```typescript
// packages/ui/src/components/chat/turn/TurnBlock.tsx
import React from 'react';
import type { VirtualItem } from '@tanstack/react-virtual';
import type { ChatMessageEntry, TurnRecord, TurnGroupingContext } from '@/components/chat/lib/turns/types';
import type { AnimationHandlers } from '@/hooks/useChatScrollManager';
import TurnItem from '@/components/chat/components/TurnItem';
import { FadeInDisabledProvider } from '@/components/chat/message/FadeInOnReveal';

interface TurnBlockProps {
    virtualItem: VirtualItem;
    turn: TurnRecord;
    turnGroupingContext: TurnGroupingContext;
    isActiveStreamingTurn: boolean;
    hasRetryOverlay: boolean;
    getAnimationHandlers: (messageId: string) => AnimationHandlers;
}

export const TurnBlock: React.FC<TurnBlockProps> = React.memo(({
    virtualItem,
    turn,
    turnGroupingContext,
    isActiveStreamingTurn,
    hasRetryOverlay,
    getAnimationHandlers,
}) => {
    return (
        <div
            data-index={virtualItem.index}
            ref={virtualItem.measureElement}
            className="group"
        >
            <FadeInDisabledProvider disabled={isActiveStreamingTurn || hasRetryOverlay}>
                <TurnItem
                    turn={turn}
                    turnGroupingContext={turnGroupingContext}
                    isActiveStreamingTurn={isActiveStreamingTurn}
                    hasRetryOverlay={hasRetryOverlay}
                    getAnimationHandlers={getAnimationHandlers}
                />
            </FadeInDisabledProvider>
        </div>
    );
});

TurnBlock.displayName = 'TurnBlock';

export default TurnBlock;
```

- [ ] **Step 2: Create StreamingTail.tsx**

`StreamingTail` renders below the last turn showing live streaming content. Extracted from MessageList's streaming area (around lines 600-800).

```typescript
// packages/ui/src/components/chat/turn/StreamingTail.tsx
import React from 'react';
import type { Part } from '@/lib/opencode/client';
import type { StreamPhase } from '@/components/chat/message/types';
import ChatMessage from '@/components/chat/ChatMessage';
import { Skeleton } from '@/components/ui/skeleton';

interface StreamingTailProps {
    streamingMessageId: string | null;
    activeStreamingPhase: StreamPhase | null;
    streamingMessages: Array<{ info: { id: string }; parts: Part[] }>;
    isMobile: boolean;
}

export const StreamingTail: React.FC<StreamingTailProps> = React.memo(({
    streamingMessageId,
    activeStreamingPhase,
    streamingMessages,
    isMobile,
}) => {
    if (!streamingMessageId && !activeStreamingPhase) return null;
    if (streamingMessages.length === 0) {
        return (
            <div className="px-4 py-2">
                <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4 rounded-full" />
                    <Skeleton className="h-4 w-24" />
                </div>
            </div>
        );
    }

    return (
        <div className="streaming-tail">
            {streamingMessages.map((msg) => (
                <ChatMessage
                    key={msg.info.id}
                    message={msg.info}
                    parts={msg.parts}
                    isStreaming={msg.info.id === streamingMessageId}
                    streamingPhase={activeStreamingPhase}
                />
            ))}
        </div>
    );
});

StreamingTail.displayName = 'StreamingTail';

export default StreamingTail;
```

- [ ] **Step 3: Create LoadOlderButton.tsx**

```typescript
// packages/ui/src/components/chat/turn/LoadOlderButton.tsx
import React from 'react';
import { cn } from '@/lib/utils';

interface LoadOlderButtonProps {
    hasMoreAbove: boolean;
    isLoadingOlder: boolean;
    onLoadOlder: () => void;
    isMobile: boolean;
}

export const LoadOlderButton: React.FC<LoadOlderButtonProps> = React.memo(({
    hasMoreAbove,
    isLoadingOlder,
    onLoadOlder,
    isMobile,
}) => {
    if (!hasMoreAbove) return null;

    return (
        <div className="flex justify-center py-3">
            <button
                type="button"
                onClick={onLoadOlder}
                disabled={isLoadingOlder}
                className={cn(
                    'px-4 py-2 rounded-lg',
                    'typography-label text-muted-foreground',
                    'bg-[var(--surface-muted)] hover:bg-[var(--interactive-hover)]',
                    'transition-colors duration-150',
                    isMobile && 'min-h-[44px]', // 44px touch target on mobile
                )}
                style={isMobile ? { minWidth: '120px' } : undefined}
            >
                {isLoadingOlder ? 'Loading...' : 'Load older messages'}
            </button>
        </div>
    );
});

LoadOlderButton.displayName = 'LoadOlderButton';

export default LoadOlderButton;
```

- [ ] **Step 4: Thin down MessageList.tsx**

In `MessageList.tsx`:
1. Import the three new components at the top:
```typescript
import { TurnBlock } from './turn/TurnBlock';
import { StreamingTail } from './turn/StreamingTail';
import { LoadOlderButton } from './turn/LoadOlderButton';
```

2. Remove the inline turn rendering code (approximately lines 200-500 that renders turn items) and replace with `<TurnBlock>` usage.

3. Remove the inline streaming tail rendering code (approximately lines 600-800) and replace with `<StreamingTail>` usage.

4. Remove the inline load-older button code (approximately lines 100-160) and replace with `<LoadOlderButton>` usage.

The rendered content area in `MessageList` should reduce to:

```tsx
return (
    <div ref={scrollContainerRef} style={{ position: 'relative', height: `${totalSize}px` }}>
        {/* Load older button at top */}
        <LoadOlderButton
            hasMoreAbove={hasMoreAbove}
            isLoadingOlder={isLoadingOlder}
            onLoadOlder={onLoadOlder}
            isMobile={isMobile}
        />

        {/* Virtualized turn blocks */}
        {virtualItems.map((virtualItem) => {
            const entry = entries[virtualItem.index];
            if (entry.kind === 'turn') {
                return (
                    <TurnBlock
                        key={entry.turn.id}
                        virtualItem={virtualItem}
                        turn={entry.turn}
                        turnGroupingContext={turnGroupingCtx}
                        isActiveStreamingTurn={isActiveStreamingTurn}
                        hasRetryOverlay={shouldShowRetryOverlay}
                        getAnimationHandlers={getAnimationHandlers}
                    />
                );
            }
            return null;
        })}

        {/* Streaming tail */}
        <StreamingTail
            streamingMessageId={activeStreamingMessageId}
            activeStreamingPhase={activeStreamingPhase}
            streamingMessages={streamingMessages}
            isMobile={isMobile}
        />
    </div>
);
```

The `MessageList.tsx` should shrink from ~1,666 lines to ~300-400 lines, retaining:
- Virtualizer setup and configuration
- Entry processing (turn records creation)
- Scroll handling
- The main render function wiring together TurnBlock, StreamingTail, LoadOlderButton

- [ ] **Step 5: Verify the extracted components import correctly**

For `TurnItem` import — check if it's imported from `./components/TurnItem` in MessageList.tsx (line 7):
```typescript
import TurnItem from './components/TurnItem';
```
The `TurnBlock` wraps this same `TurnItem`. Keep the import in `TurnBlock.tsx`.

- [ ] **Step 6: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 5: Mobile-optimized ChatInput

**Files:**
- Modify: `packages/ui/src/components/chat/ChatInput.tsx`

- [ ] **Step 1: Increase minimum tap targets to 44px for all interactive elements**

In `ChatInput.tsx`, the `footerIconButtonClass` is used for most buttons (line 271+, 301+, 314+, etc.). Find its definition (search for `footerIconButtonClass` string usage) and add 44px sizing.

Add a utility constant at the top:
```typescript
const MOBILE_TOUCH_TARGET = 'min-h-[44px] min-w-[44px]';
```

For mobile-specific button classes, create a computed class:
```typescript
const mobileButtonClass = isMobile ? cn(footerIconButtonClass, MOBILE_TOUCH_TARGET) : footerIconButtonClass;
```

Apply `mobileButtonClass` to all buttons that are visible on mobile:
- `ComposerAttachmentControls` buttons
- `PermissionAutoAcceptButton` button
- `FocusModeButton` button
- `ComposerActionButtons` buttons

For the textarea, ensure minimum touch area:
```typescript
const textareaStyle = {
    minHeight: isMobile ? '44px' : undefined,
    maxHeight: `${MAX_VISIBLE_TEXTAREA_LINES * 1.5}em`,
};
```

- [ ] **Step 2: Use visual viewport API for keyboard handling**

The `MainLayout.tsx` currently has visual viewport detection (lines 354-601). ChatInput should also use the `window.visualViewport` directly for chat-specific adjustments.

After line 1170 (`const { phase: sessionPhase } = useCurrentSessionActivity();`), add:

```typescript
// Visual viewport keyboard inset for mobile
const [keyboardInset, setKeyboardInset] = React.useState(0);
React.useEffect(() => {
    if (!isMobile || typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportResize = () => {
        const vp = window.visualViewport!;
        const layoutHeight = window.innerHeight;
        const inset = Math.max(0, layoutHeight - vp.height);
        setKeyboardInset(inset);
    };

    window.visualViewport.addEventListener('resize', handleViewportResize);
    handleViewportResize();

    return () => {
        window.visualViewport?.removeEventListener('resize', handleViewportResize);
    };
}, [isMobile]);
```

Use `keyboardInset` in the input bar style:
```typescript
const inputBarStyle: React.CSSProperties = isMobile ? {
    paddingBottom: `max(env(safe-area-inset-bottom, 0px), ${keyboardInset}px)`,
} : {};
```

Apply to the input container's wrapping div (around line 1360+):
```tsx
<div
    style={inputBarStyle}
    className={cn(
        'relative border-t border-border/40',
        'bg-[var(--surface-background)]',
    )}
>
    {/* textarea + controls */}
</div>
```

- [ ] **Step 3: Improve attachment picker for mobile**

In `ComposerAttachmentControls`, replace the desktop `DropdownMenu` pattern for mobile with a visible toolbar button:

Change the attachment controls section (lines 266-363):
```typescript
return (
    <div className="flex items-center gap-x-2">
        {isMobile && (
            <button
                type="button"
                className={cn(footerIconButtonClass, MOBILE_TOUCH_TARGET)}
                onClick={handleOpenCommandMenu}
                title="Commands"
                aria-label="Commands"
            >
                <RiCommandLine className={cn(iconSizeClass)} />
            </button>
        )}
        <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleLocalFileSelect}
            accept="*/*"
        />
        {/* Mobile: single attachment button, opens native file picker */}
        <button
            type="button"
            className={cn(footerIconButtonClass, MOBILE_TOUCH_TARGET)}
            onClick={isMobile ? handlePickLocalFiles : undefined}
            {...(isMobile ? {} : {
                onClick: () => {
                    // Desktop: keep dropdown
                    requestAnimationFrame(handlePickLocalFiles);
                }
            })}
            title="Attach files"
            aria-label="Attach files"
        >
            <RiAttachment2 className={cn(iconSizeClass, 'text-current')} />
        </button>

        {/* Settings/agent button — always visible on mobile bar */}
        {onOpenSettings ? (
            <button
                type="button"
                onClick={onOpenSettings}
                className={cn(footerIconButtonClass, MOBILE_TOUCH_TARGET)}
                title="Model and agent settings"
                aria-label="Model and agent settings"
            >
                <RiAiAgentLine className={cn(iconSizeClass, 'text-current')} />
            </button>
        ) : null}
    </div>
);
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 6: Clean up MobileSessionStatusBar

**Files:**
- Modify: `packages/ui/src/components/chat/MobileSessionStatusBar.tsx`

- [ ] **Step 1: Add virtualized session list with @tanstack/react-virtual**

The current `MobileSessionStatusBar` (1,594 lines) renders sessions using flat `sessions.map()`. Virtualize this to handle 500+ sessions without DOM bloat.

Import the virtualizer at the top:
```typescript
import { useVirtualizer } from '@tanstack/react-virtual';
```

Create a scrollable container and virtualizer inside the component (around line 1000-1100, where the session list is rendered):

```typescript
const sessionsContainerRef = React.useRef<HTMLDivElement>(null);
const groupedSessions = useMemo(() => {
    // Use existing grouping logic from the component
    // Return flat array of { type: 'project' | 'session', ... }
    return flattenGroupedSessions(grouped); // helper function
}, [grouped, searchQuery]);

const virtualizer = useVirtualizer({
    count: groupedSessions.length,
    getScrollElement: () => sessionsContainerRef.current,
    estimateSize: () => 56, // 56px per item (session row)
    overscan: 8,
});

const virtualItems = virtualizer.getVirtualItems();
```

Replace the flat `.map()` render with a virtualized container:
```tsx
<div
    ref={sessionsContainerRef}
    className="flex-1 overflow-y-auto overscroll-contain"
    style={{ contain: 'strict' }}
>
    <div
        style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
        }}
    >
        {virtualItems.map((virtualItem) => {
            const entry = groupedSessions[virtualItem.index];
            return (
                <div
                    key={entry.id}
                    data-index={virtualItem.index}
                    ref={virtualizer.measureElement}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualItem.start}px)`,
                    }}
                >
                    {/* Render session row or project header */}
                    {entry.type === 'project' ? renderProjectHeader(entry) : renderSessionRow(entry)}
                </div>
            );
        })}
    </div>
</div>
```

- [ ] **Step 2: Add pull-to-refresh**

Add a pull-to-refresh indicator at the top of the session list. Use a `useRef<HTMLDivElement>` for the pull indicator:

```typescript
const pullToRefreshRef = React.useRef<{ startY: number; pulling: boolean }>({
    startY: 0,
    pulling: false,
});
const [pullDistance, setPullDistance] = React.useState(0);
const [isRefreshing, setIsRefreshing] = React.useState(false);
const PULL_THRESHOLD = 80;

const handleTouchStart = React.useCallback((e: React.TouchEvent) => {
    const container = sessionsContainerRef.current;
    if (!container || container.scrollTop > 5) return; // Only at top
    pullToRefreshRef.current = { startY: e.touches[0].clientY, pulling: true };
}, []);

const handleTouchMove = React.useCallback((e: React.TouchEvent) => {
    if (!pullToRefreshRef.current.pulling) return;
    const delta = e.touches[0].clientY - pullToRefreshRef.current.startY;
    if (delta > 0) {
        setPullDistance(Math.min(delta * 0.5, 120)); // Resistance factor
    }
}, []);

const handleTouchEnd = React.useCallback(() => {
    if (pullDistance >= PULL_THRESHOLD) {
        setIsRefreshing(true);
        setPullDistance(0);
        // Trigger session reload
        void useSessionUIStore.getState().refreshSessions();
        setTimeout(() => setIsRefreshing(false), 1000);
    } else {
        setPullDistance(0);
    }
    pullToRefreshRef.current.pulling = false;
}, [pullDistance]);
```

Add the pull indicator div:
```tsx
{pullDistance > 0 && (
    <div
        className="flex items-center justify-center text-muted-foreground transition-all"
        style={{ height: pullDistance, overflow: 'hidden' }}
    >
        {isRefreshing ? (
            <RiLoader4Line className="h-5 w-5 animate-spin" />
        ) : pullDistance >= PULL_THRESHOLD ? (
            <span className="typography-label">Release to refresh</span>
        ) : (
            <RiArrowDownLine className="h-5 w-5" />
        )}
    </div>
)}
```

- [ ] **Step 3: Add session search/filter**

Add a search bar at the top of the panel:

```typescript
const [searchQuery, setSearchQuery] = React.useState('');
```

Add a search input:
```tsx
<div className="px-3 py-2 border-b border-border/40">
    <input
        type="search"
        placeholder="Search sessions..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className={cn(
            'w-full px-3 py-2 rounded-lg',
            'bg-[var(--surface-muted)]',
            'typography-label text-foreground',
            'border border-border/40',
            'placeholder:text-muted-foreground',
            'focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]',
        )}
        style={{ minHeight: '44px' }}
    />
</div>
```

Filter the sessions:
```typescript
const filteredSessions = React.useMemo(() => {
    if (!searchQuery) return sessions;
    const query = searchQuery.toLowerCase();
    return sessions.filter((s) => {
        const title = s.title?.toLowerCase() ?? '';
        const id = s.id.toLowerCase();
        const dir = (s as any).directory?.toLowerCase() ?? '';
        return title.includes(query) || id.startsWith(query) || dir.includes(query);
    });
}, [sessions, searchQuery]);
```

Use `filteredSessions` instead of `sessions` in the grouping and virtualizer.

- [ ] **Step 4: Remove unused imports**

After the changes, scan the file for imports that are no longer used (like `DndContext`, `SortableContext`, `useSortable`, `CSS` from `@dnd-kit` — these were for drag-and-drop reordering which can be removed to simplify). Remove imports for:
- `@dnd-kit/core` (DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent)
- `@dnd-kit/sortable` (arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy)
- `@dnd-kit/utilities` (CSS)

If drag-and-drop reordering is still desired, keep it. Otherwise, remove to reduce bundle size and complexity.

- [ ] **Step 5: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

---

### Task 7: Final integration and verification

**Files:**
- No code changes — verification only

- [ ] **Step 1: Full type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS. If there are errors, fix them before proceeding.

- [ ] **Step 2: Run lint**

```bash
bun run lint
```
Expected: PASS. Fix any lint issues.

- [ ] **Step 3: Test on Chrome DevTools mobile emulation**

Start the dev server:
```bash
bun run dev
```

Open Chrome DevTools, toggle device emulation (Ctrl+Shift+M), and verify:
1. **iPhone SE (375x667)**: Bottom tab bar visible, no desktop sidebar, chat input at bottom with 44px targets
2. **iPad (768x1024)**: Shows as tablet — no bottom tab bar redirect, should show mobile-ish layout
3. **Pixel 5 (393x851)**: Same as iPhone SE
4. **Desktop (1920x1080)**: Desktop layout unchanged — sidebar, header, right sidebar all intact

- [ ] **Step 4: Verify desktop layout unchanged**

On desktop (no device emulation):
1. Sidebar renders with SessionSidebar ✓
2. Header renders with full controls ✓
3. Right sidebar with context/git ✓
4. BottomTerminalDock renders ✓
5. No bottom tab bar visible ✓

- [ ] **Step 5: Test URL-based routing on mobile**

On mobile emulation:
1. Navigate to `?tab=chat` → bottom tabs show Chat active ✓
2. Navigate to `?tab=git` → bottom tabs show More active ✓
3. Navigate to `?session=<id>` → session loads, Chat tab active ✓

- [ ] **Step 6: Bundle size sanity check**

```bash
bun run build
```
Verify the build completes without errors. Check that the bundle hasn't grown drastically by comparing output sizes in `packages/web/dist/`.

- [ ] **Step 7: Run full CI checks**

```bash
bun run type-check && bun run lint && bun run build
```
Expected: All pass.

---
