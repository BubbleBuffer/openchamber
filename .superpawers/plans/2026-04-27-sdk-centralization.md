# SDK Type Centralization — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Centralize all SDK type imports through `packages/ui/src/lib/opencode/client.ts` so 100+ files no longer import directly from `@opencode-ai/sdk/v2` or `@opencode-ai/sdk/v2/client`.

**Architecture:** Add missing type re-exports to `client.ts`, then update every file under `packages/ui/src/` to import types from `@/lib/opencode/client` instead of the SDK. Both `@opencode-ai/sdk/v2` and `@opencode-ai/sdk/v2/client` re-export from `./gen/types.gen.js` — all types are available from either path. We can import everything from the single `@opencode-ai/sdk/v2` path in `client.ts`.

**Key design decisions:**
- `client.ts` imports ALL types from a single SDK path: `@opencode-ai/sdk/v2` (the runtime import of `createOpencodeClient` already comes from there too)
- `client.ts` does NOT change its own internal imports — only its re-export block at the bottom
- Files that previously split imports across `/v2` and `/v2/client` consolidate into a single import line from `@/lib/opencode/client`
- Inline `import('@opencode-ai/sdk/v2')` type references (in `ToolPart.tsx`) are changed to `import('@/lib/opencode/client')`
- One file excluded: `packages/web/server/lib/scheduled-tasks/runtime.js` (server-side, outside scope)

**Tech Stack:** TypeScript, Bun, `@opencode-ai/sdk`

---

## File Changes

| File | Change |
|------|--------|
| `packages/ui/src/lib/opencode/client.ts` | Add 21 missing type re-exports |
| `packages/ui/src/sync/event-reducer.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/sync-context.tsx` | Merge 3 SDK import lines into 1 from `@/lib/opencode/client` |
| `packages/ui/src/sync/sync-refs.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/use-sync.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/session-cache.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/session-actions.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/submit.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/types.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/streaming.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/session-ui-store.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/live-aggregate.ts` | Merge 2 SDK import lines into 1 from `@/lib/opencode/client` |
| `packages/ui/src/sync/sanitize.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/optimistic.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/reconnect-recovery.ts` | Merge 2 SDK import lines into 1 from `@/lib/opencode/client` |
| `packages/ui/src/sync/reconnect-recovery.test.ts` | Merge 2 SDK import lines into 1 from `@/lib/opencode/client` |
| `packages/ui/src/sync/event-pipeline.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/persist-cache.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/sync/bootstrap.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useConfigStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useAgentsStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useMcpStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useTodosPersistStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useGlobalSessionsStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/types/sessionTypes.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/globalSessions.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/permissionStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/useAgentGroupsStore.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/utils/permissionAutoAccept.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/utils/messageUtils.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/utils/tokenUtils.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/stores/utils/messageProjectors.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/sessionEvents.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/messageCompletion.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/messageFreshness.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/messages/synthetic.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/messages/messageText.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/messages/agentMentions.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/lib/exportSession.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/hooks/useChatSearchDirectory.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/hooks/useSessionAutoCleanup.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/hooks/useModelLists.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/hooks/useAssistantStatus.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/types.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/utils.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSessionSidebarSections.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/SessionSidebar.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/SessionDialogs.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/activitySections.ts` | Merge 2 SDK import lines into 1 from `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/ConfirmDialogs.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSessionActions.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useArchivedAutoFolders.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useProjectSessionSelection.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSessionFolderCleanup.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSessionGrouping.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useProjectSessionLists.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useDirectoryStatusProbe.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/session/sidebar/hooks/useSessionPrefetch.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/sections/agents/AgentsSidebar.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/sections/commands/AgentSelector.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/mcp/McpDropdown.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/layout/ContextSidebarTab.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/layout/Header.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/resolveFallbackTaskSessionId.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/ToolPart.tsx` | Change SDK import + inline `import()` to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/JustificationBlock.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/parts/UserTextPart.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/mobileControlsUtils.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/partUtils.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/normalizeUserDisplayParts.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/messageRole.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/renderCompare.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/message/MessageBody.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/lib/turns/types.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/lib/turns/applyRetryOverlay.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/MessageList.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/MarkdownRendererImpl.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/TurnChangedFilesDropdown.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/MobileSessionStatusBar.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/changedFiles.ts` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/StatusRow.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/TimelineDialog.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/ChatMessage.tsx` | Change SDK import to `@/lib/opencode/client` |
| `packages/ui/src/components/chat/ChatContainer.tsx` | Change SDK import to `@/lib/opencode/client` |

---

### Task 1: Add All Missing Type Re-exports to client.ts

**Files:**
- Modify: `packages/ui/src/lib/opencode/client.ts:1-14` (import block)
- Modify: `packages/ui/src/lib/opencode/client.ts:1597-1599` (re-export block)

- [ ] **Step 1: Add type imports for the 19 missing types to client.ts**

Current import block (lines 4-14):
```typescript
import type {
  Session,
  Message,
  Part,
  Provider,
  Config,
  Model,
  Agent,
  TextPartInput,
  FilePartInput,
} from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type {
  Session,
  Message,
  Part,
  Provider,
  Config,
  Model,
  Agent,
  TextPartInput,
  FilePartInput,
  Event,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  Project,
  Todo,
  TextPart,
  ReasoningPart,
  ToolPart,
  ToolState,
  AssistantMessage,
  Command,
  LspStatus,
  McpStatus,
  VcsInfo,
  PermissionConfig,
  Path,
  ProviderAuthResponse,
  ProviderListResponse,
} from "@opencode-ai/sdk/v2";
```

Also, ensure line 1 has `OpencodeClient` in its runtime import (it already does, but confirm it's available as a type):
```typescript
import { createOpencodeClient, OpencodeClient } from "@opencode-ai/sdk/v2";
```
This line stays as-is.

- [ ] **Step 2: Update re-export block at bottom of client.ts**

Current (lines 1597-1599):
```typescript
// Exported types
export type { Session, Message, Part, Provider, Config, Model };
export type { App };
```

Change to:
```typescript
// Exported types
export type {
  Session,
  Message,
  Part,
  Provider,
  Config,
  Model,
  App,
  Agent,
  OpencodeClient,
  Event,
  SessionStatus,
  PermissionRequest,
  QuestionRequest,
  Project,
  Todo,
  TextPart,
  ReasoningPart,
  ToolPart,
  ToolState,
  AssistantMessage,
  Command,
  LspStatus,
  McpStatus,
  VcsInfo,
  PermissionConfig,
  Path,
  ProviderAuthResponse,
  ProviderListResponse,
};
```

This consolidates the two separate `export type { ... }` lines into one and adds all 21 missing types (`Agent` through `ProviderListResponse`, plus `OpencodeClient`).

- [ ] **Step 3: Run type-check on packages/ui**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS (client.ts itself should have no errors; no consumer files changed yet, so they still work via their direct SDK imports)

---

### Task 2: Update sync/ Files (18 files)

**Files in order (batch by subdirectory):**

#### Batch 2a: event-reducer.ts and event-pipeline.ts (2 files)

- [ ] **Step 1: Update event-reducer.ts**

File: `packages/ui/src/sync/event-reducer.ts`

Current (lines 1-12):
```typescript
import type {
  Event,
  Message,
  Part,
  PermissionRequest,
  Project,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
} from "@opencode-ai/sdk/v2/client"
import { Binary } from "./binary"
```

Change to:
```typescript
import type {
  Event,
  Message,
  Part,
  PermissionRequest,
  Project,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
} from "@/lib/opencode/client"
import { Binary } from "./binary"
```

- [ ] **Step 2: Update event-pipeline.ts**

File: `packages/ui/src/sync/event-pipeline.ts`

Current (line 11):
```typescript
import type { Event, OpencodeClient } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Event, OpencodeClient } from "@/lib/opencode/client"
```

- [ ] **Step 3: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/sync/event-reducer.ts packages/ui/src/sync/event-pipeline.ts
git commit -m "refactor: centralize SDK type imports in event-reducer and event-pipeline"
```

#### Batch 2b: sync-context.tsx, sync-refs.ts, use-sync.ts (3 files)

- [ ] **Step 1: Update sync-context.tsx**

File: `packages/ui/src/sync/sync-context.tsx`

Currently has THREE SDK import lines (lines 3, 4, 7, 35):
```typescript
import type { Event, Message, Part } from "@opencode-ai/sdk/v2/client"
import type { Session } from "@opencode-ai/sdk/v2"
...
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
...
import type { SessionStatus } from "@opencode-ai/sdk/v2/client"
```

Change to ONE line (replace all SDK-importing lines):
```typescript
import type { Event, Message, Part, Session, OpencodeClient, SessionStatus } from "@/lib/opencode/client"
```

Find the first SDK import line and replace it with this single consolidated line. Remove the subsequent separate SDK import lines (the ones importing just `Session`, `OpencodeClient`, `SessionStatus`).

- [ ] **Step 2: Update sync-refs.ts**

File: `packages/ui/src/sync/sync-refs.ts`

Current (line 8):
```typescript
import type { OpencodeClient } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { OpencodeClient } from "@/lib/opencode/client"
```

- [ ] **Step 3: Update use-sync.ts**

File: `packages/ui/src/sync/use-sync.ts`

Current (line 2):
```typescript
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Message, Part } from "@/lib/opencode/client"
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/sync/sync-context.tsx packages/ui/src/sync/sync-refs.ts packages/ui/src/sync/use-sync.ts
git commit -m "refactor: centralize SDK type imports in sync-context, sync-refs, use-sync"
```

#### Batch 2c: session-cache.ts, session-actions.ts, submit.ts (3 files)

- [ ] **Step 1: Update session-cache.ts**

File: `packages/ui/src/sync/session-cache.ts`

Current (lines 1-8):
```typescript
import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  Todo,
} from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type {
  Message,
  Part,
  PermissionRequest,
  QuestionRequest,
  SessionStatus,
  Todo,
} from "@/lib/opencode/client"
```

- [ ] **Step 2: Update session-actions.ts**

File: `packages/ui/src/sync/session-actions.ts`

Current (line 6):
```typescript
import type { OpencodeClient, Session, Message, Part } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { OpencodeClient, Session, Message, Part } from "@/lib/opencode/client"
```

- [ ] **Step 3: Update submit.ts**

File: `packages/ui/src/sync/submit.ts`

Current (line 1):
```typescript
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Message, Part } from "@/lib/opencode/client"
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/sync/session-cache.ts packages/ui/src/sync/session-actions.ts packages/ui/src/sync/submit.ts
git commit -m "refactor: centralize SDK type imports in session-cache, session-actions, submit"
```

#### Batch 2d: types.ts, streaming.ts, session-ui-store.ts (3 files)

- [ ] **Step 1: Update types.ts**

File: `packages/ui/src/sync/types.ts`

Current (lines 1-19):
```typescript
import type {
  Agent,
  Command,
  Config,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Path,
  PermissionRequest,
  Project,
  ProviderAuthResponse,
  ProviderListResponse,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
  VcsInfo,
} from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type {
  Agent,
  Command,
  Config,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Path,
  PermissionRequest,
  Project,
  ProviderAuthResponse,
  ProviderListResponse,
  QuestionRequest,
  Session,
  SessionStatus,
  Todo,
  VcsInfo,
} from "@/lib/opencode/client"
```

- [ ] **Step 2: Update streaming.ts**

File: `packages/ui/src/sync/streaming.ts`

Current (line 10):
```typescript
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Message, SessionStatus } from "@/lib/opencode/client"
```

- [ ] **Step 3: Update session-ui-store.ts**

File: `packages/ui/src/sync/session-ui-store.ts`

Current (line 16):
```typescript
import type { Session, Part, Message, TextPart } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Session, Part, Message, TextPart } from "@/lib/opencode/client"
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/sync/types.ts packages/ui/src/sync/streaming.ts packages/ui/src/sync/session-ui-store.ts
git commit -m "refactor: centralize SDK type imports in types, streaming, session-ui-store"
```

#### Batch 2e: live-aggregate.ts, sanitize.ts, optimistic.ts, reconnect-recovery.ts, reconnect-recovery.test.ts, persist-cache.ts, bootstrap.ts (7 files)

- [ ] **Step 1: Update live-aggregate.ts**

File: `packages/ui/src/sync/live-aggregate.ts`

Current (lines 1-2):
```typescript
import type { SessionStatus } from '@opencode-ai/sdk/v2/client'
import type { Session } from '@opencode-ai/sdk/v2'
```

Change to ONE line:
```typescript
import type { Session, SessionStatus } from "@/lib/opencode/client"
```

- [ ] **Step 2: Update sanitize.ts**

File: `packages/ui/src/sync/sanitize.ts`

Current (line 14):
```typescript
import type { Session, Message } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Session, Message } from "@/lib/opencode/client"
```

- [ ] **Step 3: Update optimistic.ts**

File: `packages/ui/src/sync/optimistic.ts`

Current (line 1):
```typescript
import type { Message, Part } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { Message, Part } from "@/lib/opencode/client"
```

- [ ] **Step 4: Update reconnect-recovery.ts**

File: `packages/ui/src/sync/reconnect-recovery.ts`

Current (lines 1-2):
```typescript
import type { SessionStatus, Message } from "@opencode-ai/sdk/v2/client"
import type { Session } from "@opencode-ai/sdk/v2"
```

Change to ONE line:
```typescript
import type { Session, Message, SessionStatus } from "@/lib/opencode/client"
```

- [ ] **Step 5: Update reconnect-recovery.test.ts**

File: `packages/ui/src/sync/reconnect-recovery.test.ts`

Current (lines 2-3):
```typescript
import type { Message, SessionStatus } from "@opencode-ai/sdk/v2/client"
import type { Session } from "@opencode-ai/sdk/v2"
```

Change to ONE line:
```typescript
import type { Session, Message, SessionStatus } from "@/lib/opencode/client"
```

- [ ] **Step 6: Update persist-cache.ts**

File: `packages/ui/src/sync/persist-cache.ts`

Current (line 10):
```typescript
import type { VcsInfo } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { VcsInfo } from "@/lib/opencode/client"
```

- [ ] **Step 7: Update bootstrap.ts**

File: `packages/ui/src/sync/bootstrap.ts`

Current (line 1):
```typescript
import type { OpencodeClient, PermissionRequest, Project, QuestionRequest } from "@opencode-ai/sdk/v2/client"
```

Change to:
```typescript
import type { OpencodeClient, PermissionRequest, Project, QuestionRequest } from "@/lib/opencode/client"
```

- [ ] **Step 8: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add packages/ui/src/sync/live-aggregate.ts packages/ui/src/sync/sanitize.ts packages/ui/src/sync/optimistic.ts packages/ui/src/sync/reconnect-recovery.ts packages/ui/src/sync/reconnect-recovery.test.ts packages/ui/src/sync/persist-cache.ts packages/ui/src/sync/bootstrap.ts
git commit -m "refactor: centralize SDK type imports in remaining sync files"
```

---

### Task 3: Update stores/ Files (13 files)

#### Batch 3a: useConfigStore.ts, useAgentsStore.ts, useMcpStore.ts, useTodosPersistStore.ts (4 files)

- [ ] **Step 1: Update useConfigStore.ts**

File: `packages/ui/src/stores/useConfigStore.ts`

Current (line 4):
```typescript
import type { Provider, Agent } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Provider, Agent } from "@/lib/opencode/client";
```

- [ ] **Step 2: Update useAgentsStore.ts**

File: `packages/ui/src/stores/useAgentsStore.ts`

Current (line 4):
```typescript
import type { Agent, PermissionConfig } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Agent, PermissionConfig } from "@/lib/opencode/client";
```

- [ ] **Step 3: Update useMcpStore.ts**

File: `packages/ui/src/stores/useMcpStore.ts`

Current (line 3):
```typescript
import type { McpStatus } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { McpStatus } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update useTodosPersistStore.ts**

File: `packages/ui/src/stores/useTodosPersistStore.ts`

Current (line 3):
```typescript
import type { Todo } from '@opencode-ai/sdk/v2/client';
```

Change to:
```typescript
import type { Todo } from '@/lib/opencode/client';
```

- [ ] **Step 5: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/stores/useConfigStore.ts packages/ui/src/stores/useAgentsStore.ts packages/ui/src/stores/useMcpStore.ts packages/ui/src/stores/useTodosPersistStore.ts
git commit -m "refactor: centralize SDK type imports in config, agents, mcp, todos stores"
```

#### Batch 3b: useGlobalSessionsStore.ts, sessionTypes.ts, globalSessions.ts (3 files)

- [ ] **Step 1: Update useGlobalSessionsStore.ts**

File: `packages/ui/src/stores/useGlobalSessionsStore.ts`

Current (line 2):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update sessionTypes.ts**

File: `packages/ui/src/stores/types/sessionTypes.ts`

Current (line 1):
```typescript
import type { Session, Message, Part } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Session, Message, Part } from "@/lib/opencode/client";
```

- [ ] **Step 3: Update globalSessions.ts**

File: `packages/ui/src/stores/globalSessions.ts`

Current (line 1):
```typescript
import type { OpencodeClient, Session } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { OpencodeClient, Session } from "@/lib/opencode/client";
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/stores/useGlobalSessionsStore.ts packages/ui/src/stores/types/sessionTypes.ts packages/ui/src/stores/globalSessions.ts
git commit -m "refactor: centralize SDK type imports in global session stores"
```

#### Batch 3c: permissionStore.ts, useAgentGroupsStore.ts, permissionAutoAccept.ts (3 files)

- [ ] **Step 1: Update permissionStore.ts**

File: `packages/ui/src/stores/permissionStore.ts`

Current (line 3):
```typescript
import type { Session } from "@opencode-ai/sdk/v2/client";
```

Change to:
```typescript
import type { Session } from "@/lib/opencode/client";
```

- [ ] **Step 2: Update useAgentGroupsStore.ts**

File: `packages/ui/src/stores/useAgentGroupsStore.ts`

Current (line 9):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update permissionAutoAccept.ts**

File: `packages/ui/src/stores/utils/permissionAutoAccept.ts`

Current (line 1):
```typescript
import type { Session } from "@opencode-ai/sdk/v2/client";
```

Change to:
```typescript
import type { Session } from "@/lib/opencode/client";
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/stores/permissionStore.ts packages/ui/src/stores/useAgentGroupsStore.ts packages/ui/src/stores/utils/permissionAutoAccept.ts
git commit -m "refactor: centralize SDK type imports in permission and agent group stores"
```

#### Batch 3d: messageUtils.ts, tokenUtils.ts, messageProjectors.ts (3 files)

- [ ] **Step 1: Update messageUtils.ts**

File: `packages/ui/src/stores/utils/messageUtils.ts`

Current (line 1):
```typescript
import type { Part } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Part } from "@/lib/opencode/client";
```

- [ ] **Step 2: Update tokenUtils.ts**

File: `packages/ui/src/stores/utils/tokenUtils.ts`

Current (line 1):
```typescript
import type { Message, Part } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Message, Part } from "@/lib/opencode/client";
```

- [ ] **Step 3: Update messageProjectors.ts**

File: `packages/ui/src/stores/utils/messageProjectors.ts`

Current (line 1):
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/stores/utils/messageUtils.ts packages/ui/src/stores/utils/tokenUtils.ts packages/ui/src/stores/utils/messageProjectors.ts
git commit -m "refactor: centralize SDK type imports in message utils stores"
```

---

### Task 4: Update lib/ Files (7 files)

#### Batch 4a: sessionEvents.ts, messageCompletion.ts, messageFreshness.ts (3 files)

- [ ] **Step 1: Update sessionEvents.ts**

File: `packages/ui/src/lib/sessionEvents.ts`

Current (line 1):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update messageCompletion.ts**

File: `packages/ui/src/lib/messageCompletion.ts`

Current (line 2):
```typescript
import type { Part } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Part } from "@/lib/opencode/client";
```

- [ ] **Step 3: Update messageFreshness.ts**

File: `packages/ui/src/lib/messageFreshness.ts`

Current (line 1):
```typescript
import type { Message } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Message } from '@/lib/opencode/client';
```

- [ ] **Step 4: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ui/src/lib/sessionEvents.ts packages/ui/src/lib/messageCompletion.ts packages/ui/src/lib/messageFreshness.ts
git commit -m "refactor: centralize SDK type imports in lib helpers"
```

#### Batch 4b: synthetic.ts, messageText.ts, agentMentions.ts, exportSession.ts (4 files)

- [ ] **Step 1: Update synthetic.ts**

File: `packages/ui/src/lib/messages/synthetic.ts`

Current (line 1):
```typescript
import type { Part } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Part } from "@/lib/opencode/client";
```

- [ ] **Step 2: Update messageText.ts**

File: `packages/ui/src/lib/messages/messageText.ts`

Current (line 1):
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update agentMentions.ts**

File: `packages/ui/src/lib/messages/agentMentions.ts`

Current (line 1):
```typescript
import type { Agent } from "@opencode-ai/sdk/v2";
```

Change to:
```typescript
import type { Agent } from "@/lib/opencode/client";
```

- [ ] **Step 4: Update exportSession.ts**

File: `packages/ui/src/lib/exportSession.ts`

Current (line 1):
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 5: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/lib/messages/synthetic.ts packages/ui/src/lib/messages/messageText.ts packages/ui/src/lib/messages/agentMentions.ts packages/ui/src/lib/exportSession.ts
git commit -m "refactor: centralize SDK type imports in message libs"
```

---

### Task 5: Update hooks/ Files (4 files)

- [ ] **Step 1: Update useChatSearchDirectory.ts**

File: `packages/ui/src/hooks/useChatSearchDirectory.ts`

Current (line 7):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update useSessionAutoCleanup.ts**

File: `packages/ui/src/hooks/useSessionAutoCleanup.ts`

Current (line 2):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update useModelLists.ts**

File: `packages/ui/src/hooks/useModelLists.ts`

Current (line 4):
```typescript
import type { Provider } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { Provider } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update useAssistantStatus.ts**

File: `packages/ui/src/hooks/useAssistantStatus.ts`

Current (line 2):
```typescript
import type { AssistantMessage, Message, Part, ReasoningPart, TextPart, ToolPart } from '@opencode-ai/sdk/v2';
```

Change to:
```typescript
import type { AssistantMessage, Message, Part, ReasoningPart, TextPart, ToolPart } from '@/lib/opencode/client';
```

- [ ] **Step 5: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/hooks/useChatSearchDirectory.ts packages/ui/src/hooks/useSessionAutoCleanup.ts packages/ui/src/hooks/useModelLists.ts packages/ui/src/hooks/useAssistantStatus.ts
git commit -m "refactor: centralize SDK type imports in hooks"
```

---

### Task 6: Update components/ Files (30+ files)

#### Batch 6a: session/sidebar/types.ts, utils.tsx, 9 sidebar hooks (11 files)

All of these import `type { Session }` from SDK. Apply the same pattern.

- [ ] **Step 1: Update types.ts**

File: `packages/ui/src/components/session/sidebar/types.ts`

Change line 1:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update utils.tsx**

File: `packages/ui/src/components/session/sidebar/utils.tsx`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update useSessionSidebarSections.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSessionSidebarSections.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update useSidebarPersistence.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update useSessionActions.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSessionActions.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 6: Update useArchivedAutoFolders.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useArchivedAutoFolders.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 7: Update useProjectSessionSelection.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useProjectSessionSelection.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 8: Update useSessionFolderCleanup.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSessionFolderCleanup.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 9: Update useSessionGrouping.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSessionGrouping.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 10: Update useProjectSessionLists.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useProjectSessionLists.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 11: Update useDirectoryStatusProbe.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useDirectoryStatusProbe.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 12: Update useSessionPrefetch.ts**

File: `packages/ui/src/components/session/sidebar/hooks/useSessionPrefetch.ts`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 13: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add packages/ui/src/components/session/sidebar/types.ts packages/ui/src/components/session/sidebar/utils.tsx packages/ui/src/components/session/sidebar/hooks/useSessionSidebarSections.ts packages/ui/src/components/session/sidebar/hooks/useSidebarPersistence.ts packages/ui/src/components/session/sidebar/hooks/useSessionActions.ts packages/ui/src/components/session/sidebar/hooks/useArchivedAutoFolders.ts packages/ui/src/components/session/sidebar/hooks/useProjectSessionSelection.ts packages/ui/src/components/session/sidebar/hooks/useSessionFolderCleanup.ts packages/ui/src/components/session/sidebar/hooks/useSessionGrouping.ts packages/ui/src/components/session/sidebar/hooks/useProjectSessionLists.ts packages/ui/src/components/session/sidebar/hooks/useDirectoryStatusProbe.ts packages/ui/src/components/session/sidebar/hooks/useSessionPrefetch.ts
git commit -m "refactor: centralize SDK type imports in sidebar types and hooks"
```

#### Batch 6b: SessionSidebar.tsx, SessionDialogs.tsx, SessionGroupSection.tsx, activitySections.ts, ConfirmDialogs.tsx, SessionNodeItem.tsx (6 files)

- [ ] **Step 1: Update SessionSidebar.tsx**

File: `packages/ui/src/components/session/SessionSidebar.tsx`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update SessionDialogs.tsx**

File: `packages/ui/src/components/session/SessionDialogs.tsx`

Change line 17:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update SessionGroupSection.tsx**

File: `packages/ui/src/components/session/sidebar/SessionGroupSection.tsx`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update activitySections.ts**

File: `packages/ui/src/components/session/sidebar/activitySections.ts`

Currently has TWO lines (lines 1-2):
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
import type { SessionStatus } from '@opencode-ai/sdk/v2/client';
```

Change to ONE line:
```typescript
import type { Session, SessionStatus } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update ConfirmDialogs.tsx**

File: `packages/ui/src/components/session/sidebar/ConfirmDialogs.tsx`

Change line 4:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 6: Update SessionNodeItem.tsx**

File: `packages/ui/src/components/session/sidebar/SessionNodeItem.tsx`

Change line 2:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 7: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/session/SessionSidebar.tsx packages/ui/src/components/session/SessionDialogs.tsx packages/ui/src/components/session/sidebar/SessionGroupSection.tsx packages/ui/src/components/session/sidebar/activitySections.ts packages/ui/src/components/session/sidebar/ConfirmDialogs.tsx packages/ui/src/components/session/sidebar/SessionNodeItem.tsx
git commit -m "refactor: centralize SDK type imports in session sidebar components"
```

#### Batch 6c: AgentsSidebar.tsx, AgentSelector.tsx, McpDropdown.tsx, ContextSidebarTab.tsx, Header.tsx (5 files)

- [ ] **Step 1: Update AgentsSidebar.tsx**

File: `packages/ui/src/components/sections/agents/AgentsSidebar.tsx`

Change line 23:
```typescript
import type { Agent } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Agent } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update AgentSelector.tsx**

File: `packages/ui/src/components/sections/commands/AgentSelector.tsx`

Change line 2:
```typescript
import type { Agent } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Agent } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update McpDropdown.tsx**

File: `packages/ui/src/components/mcp/McpDropdown.tsx`

Change line 2:
```typescript
import type { McpStatus } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { McpStatus } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update ContextSidebarTab.tsx**

File: `packages/ui/src/components/layout/ContextSidebarTab.tsx`

Change line 2:
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update Header.tsx**

File: `packages/ui/src/components/layout/Header.tsx`

Change line 69:
```typescript
import type { Session } from '@opencode-ai/sdk/v2/client';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 6: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/sections/agents/AgentsSidebar.tsx packages/ui/src/components/sections/commands/AgentSelector.tsx packages/ui/src/components/mcp/McpDropdown.tsx packages/ui/src/components/layout/ContextSidebarTab.tsx packages/ui/src/components/layout/Header.tsx
git commit -m "refactor: centralize SDK type imports in agents, mcp, layout components"
```

#### Batch 6d: Chat message/parts/ files (8 files)

- [ ] **Step 1: Update ReasoningPart.tsx**

File: `packages/ui/src/components/chat/message/parts/ReasoningPart.tsx`

Change line 3:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update resolveFallbackTaskSessionId.ts**

File: `packages/ui/src/components/chat/message/parts/resolveFallbackTaskSessionId.ts`

Change line 9:
```typescript
import type { Session, SessionStatus } from '@opencode-ai/sdk/v2/client';
```
To:
```typescript
import type { Session, SessionStatus } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update AssistantTextPart.tsx**

File: `packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx`

Change line 2:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update ToolPart.tsx — import line**

File: `packages/ui/src/components/chat/message/parts/ToolPart.tsx`

Change line 9:
```typescript
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { ToolPart as ToolPartType, ToolState as ToolStateUnion } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update ToolPart.tsx — inline import() references (2 occurrences)**

In the same file, change these inline type references:
```typescript
import('@opencode-ai/sdk/v2').Part[]
```
To:
```typescript
import('@/lib/opencode/client').Part[]
```

And:
```typescript
import('@opencode-ai/sdk/v2').Message[]
```
To:
```typescript
import('@/lib/opencode/client').Message[]
```

These appear at lines 2142, 2147, 2289, 2294.

- [ ] **Step 6: Update JustificationBlock.tsx**

File: `packages/ui/src/components/chat/message/parts/JustificationBlock.tsx`

Change line 2:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 7: Update ProgressiveGroup.tsx**

File: `packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx`

Change line 5:
```typescript
import type { ToolPart as ToolPartType } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { ToolPart as ToolPartType } from '@/lib/opencode/client';
```

- [ ] **Step 8: Update UserTextPart.tsx**

File: `packages/ui/src/components/chat/message/parts/UserTextPart.tsx`

Change line 3:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 9: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add packages/ui/src/components/chat/message/parts/ReasoningPart.tsx packages/ui/src/components/chat/message/parts/resolveFallbackTaskSessionId.ts packages/ui/src/components/chat/message/parts/AssistantTextPart.tsx packages/ui/src/components/chat/message/parts/ToolPart.tsx packages/ui/src/components/chat/message/parts/JustificationBlock.tsx packages/ui/src/components/chat/message/parts/ProgressiveGroup.tsx packages/ui/src/components/chat/message/parts/UserTextPart.tsx
git commit -m "refactor: centralize SDK type imports in chat message parts"
```

#### Batch 6e: mobileControlsUtils.ts, partUtils.ts, normalizeUserDisplayParts.ts, messageRole.ts, renderCompare.ts, MessageBody.tsx (6 files)

- [ ] **Step 1: Update mobileControlsUtils.ts**

File: `packages/ui/src/components/chat/mobileControlsUtils.ts`

Change line 1:
```typescript
import type { Agent } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Agent } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update partUtils.ts**

File: `packages/ui/src/components/chat/message/partUtils.ts`

Change line 1:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update normalizeUserDisplayParts.ts**

File: `packages/ui/src/components/chat/message/normalizeUserDisplayParts.ts`

Change line 1:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update messageRole.ts**

File: `packages/ui/src/components/chat/message/messageRole.ts`

Change line 1:
```typescript
import type { Message } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update renderCompare.ts**

File: `packages/ui/src/components/chat/message/renderCompare.ts`

Change line 1:
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 6: Update MessageBody.tsx**

File: `packages/ui/src/components/chat/message/MessageBody.tsx`

Has TWO SDK import lines (lines 2, 10). Change both:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
import type { ToolPart as ToolPartType } from '@opencode-ai/sdk/v2';
```

To ONE consolidated line:
```typescript
import type { Part, ToolPart as ToolPartType } from '@/lib/opencode/client';
```

- [ ] **Step 7: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/chat/mobileControlsUtils.ts packages/ui/src/components/chat/message/partUtils.ts packages/ui/src/components/chat/message/normalizeUserDisplayParts.ts packages/ui/src/components/chat/message/messageRole.ts packages/ui/src/components/chat/message/renderCompare.ts packages/ui/src/components/chat/message/MessageBody.tsx
git commit -m "refactor: centralize SDK type imports in chat message utilities"
```

#### Batch 6f: turns/types.ts, turns/applyRetryOverlay.ts, MessageList.tsx, MarkdownRendererImpl.tsx, TurnChangedFilesDropdown.tsx (5 files)

- [ ] **Step 1: Update turns/types.ts**

File: `packages/ui/src/components/chat/lib/turns/types.ts`

Change line 1:
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update applyRetryOverlay.ts**

File: `packages/ui/src/components/chat/lib/turns/applyRetryOverlay.ts`

Change line 1:
```typescript
import type { Message } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update MessageList.tsx**

File: `packages/ui/src/components/chat/MessageList.tsx`

Change line 2:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 4: Update MarkdownRendererImpl.tsx**

File: `packages/ui/src/components/chat/MarkdownRendererImpl.tsx`

Change line 12:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update TurnChangedFilesDropdown.tsx**

File: `packages/ui/src/components/chat/TurnChangedFilesDropdown.tsx`

Change line 3:
```typescript
import type { ToolPart } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { ToolPart } from '@/lib/opencode/client';
```

- [ ] **Step 6: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/ui/src/components/chat/lib/turns/types.ts packages/ui/src/components/chat/lib/turns/applyRetryOverlay.ts packages/ui/src/components/chat/MessageList.tsx packages/ui/src/components/chat/MarkdownRendererImpl.tsx packages/ui/src/components/chat/TurnChangedFilesDropdown.tsx
git commit -m "refactor: centralize SDK type imports in chat turns and message list"
```

#### Batch 6g: MobileSessionStatusBar.tsx, changedFiles.ts, StatusRow.tsx, TimelineDialog.tsx, ChatMessage.tsx, ChatContainer.tsx (6 files)

- [ ] **Step 1: Update MobileSessionStatusBar.tsx**

File: `packages/ui/src/components/chat/MobileSessionStatusBar.tsx`

Change line 8:
```typescript
import type { Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Session } from '@/lib/opencode/client';
```

- [ ] **Step 2: Update changedFiles.ts**

File: `packages/ui/src/components/chat/changedFiles.ts`

Change line 1:
```typescript
import type { ToolPart } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { ToolPart } from '@/lib/opencode/client';
```

- [ ] **Step 3: Update StatusRow.tsx**

File: `packages/ui/src/components/chat/StatusRow.tsx`

Change line 14:
```typescript
import type { Todo } from "@opencode-ai/sdk/v2/client";
```
To:
```typescript
import type { Todo } from "@/lib/opencode/client";
```

- [ ] **Step 4: Update TimelineDialog.tsx**

File: `packages/ui/src/components/chat/TimelineDialog.tsx`

Change line 14:
```typescript
import type { Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Part } from '@/lib/opencode/client';
```

- [ ] **Step 5: Update ChatMessage.tsx**

File: `packages/ui/src/components/chat/ChatMessage.tsx`

Change line 2:
```typescript
import type { Message, Part } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message, Part } from '@/lib/opencode/client';
```

- [ ] **Step 6: Update ChatContainer.tsx**

File: `packages/ui/src/components/chat/ChatContainer.tsx`

Change line 3:
```typescript
import type { Message, Part, Session } from '@opencode-ai/sdk/v2';
```
To:
```typescript
import type { Message, Part, Session } from '@/lib/opencode/client';
```

- [ ] **Step 7: Run type-check**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components/chat/MobileSessionStatusBar.tsx packages/ui/src/components/chat/changedFiles.ts packages/ui/src/components/chat/StatusRow.tsx packages/ui/src/components/chat/TimelineDialog.tsx packages/ui/src/components/chat/ChatMessage.tsx packages/ui/src/components/chat/ChatContainer.tsx
git commit -m "refactor: centralize SDK type imports in remaining chat components"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run type-check on packages/ui**

```bash
bun run --cwd packages/ui type-check
```
Expected: PASS (no errors)

- [ ] **Step 2: Verify zero remaining direct SDK imports in packages/ui/src/**

```bash
grep -rn "@opencode-ai/sdk" packages/ui/src/ | grep -v "node_modules" | grep -v ".test.ts" || echo "NO REMAINING DIRECT SDK IMPORTS"
```
Expected: `NO REMAINING DIRECT SDK IMPORTS` (all SDK imports should only remain in `packages/ui/src/lib/opencode/client.ts`)

If any remain, they are files that were missed. Update their imports to use `@/lib/opencode/client`.

- [ ] **Step 3: Run full repo type-check**

```bash
bun run type-check
```
Expected: PASS (or pre-existing errors only outside packages/ui)

- [ ] **Step 4: Run lint**

```bash
bun run lint:ui
```
Expected: PASS (or pre-existing issues only)

- [ ] **Step 5: Run tests**

```bash
bun test
```
Workdir: `packages/ui`
Expected: Same pre-existing pass/fail state as before, no new failures.

- [ ] **Step 6: Build ui package**

```bash
bun run build:ui
```
Expected: PASS (no build errors)

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "refactor: centralize all SDK type imports through client.ts"
```

---

## Review

**Status: PENDING** | Reviewer: SuperPawers subagent | Date: 2026-04-27

### Count Check

Total files changed: ~90 (1 client.ts re-export + ~89 consumer files)

| Category | Count | Task |
|----------|-------|------|
| client.ts | 1 | Task 1 |
| sync/ | 18 | Task 2 (5 batches) |
| stores/ | 13 | Task 3 (4 batches) |
| lib/ | 7 | Task 4 (2 batches) |
| hooks/ | 4 | Task 5 |
| components/ | ~30+ | Task 6 (7 batches) |
| **Total** | **~90+** | |

### Risk Assessment

- **Low risk** — Pure type-import path changes. No runtime behavior changes.
- **ToolPart.tsx** has the most risk due to inline `import()` type references. These must be caught in the type-check.
- **No circular dependency risk** — `client.ts` is a leaf module (imports from SDK, does not import from any of the changed files).
