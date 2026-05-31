# Radical Architecture Refactor v2 — Revised Design Spec

**Status:** Draft  
**Date:** 2026-05-28  
**Supersedes:** 2026-05-19 Radical Architecture Refactor draft  
**Scope:** Server runtime architecture, chat UI modularization, session state ownership, and store consolidation strategy

## Why This Revision Exists

The original radical refactor correctly identified the core problems: server monoliths, implicit session state, broad stores, and component subscription cascades. Its server direction has already been partially implemented across local work branches. Its UI/store direction needs to become more incremental.

The revised plan keeps the same end-state goals but changes the order:

- Server runtime extraction first.
- Chat adapter boundary and modularization next.
- Session state machine behind the chat adapters after the component boundary exists.
- Store consolidation only after consumers migrate.

This avoids a risky big-bang rewrite while still moving toward a clean architecture.

## Current Branch Reality

- Local `main` contains Phase 1a-style OpenCode runtime extraction work.
- `feature/phase-1b-runtime-extractions` contains broader server runtime extraction work: typed EventBus, EventStreamRuntime, NotificationRuntime, SessionRuntime event-bus wiring, TunnelRuntime, and bounded cache follow-ups.
- `feature/radical-refactor-spec` contains the original umbrella spec but is stale relative to later server runtime work.
- The active chat cleanup has uncommitted work that already starts extracting composer and session-shell responsibilities.

Before implementation planning continues, the target branch should reconcile these histories so the spec reflects the actual server baseline.

## Revised Problem Statement

OpenChamber has two connected architecture problems:

- Runtime ownership was unclear. Server responsibilities were concentrated in `packages/web/server/index.js` and shared through direct state reads.
- UI session ownership remains unclear. Chat session state is spread across sync modules, UI stores, input stores, selection stores, component-local refs, and derived heuristics.

The chat view is the most visible failure mode of the UI problem. It combines streaming session state, composer state, virtualized timeline behavior, permission/question interruptions, scroll anchors, and mobile layout constraints in one user-facing surface.

The next phase should use chat as the proving ground for the future session state architecture.

## Revised Goals

- Keep server runtimes domain-owned and event-bus mediated.
- Create a stable chat-facing adapter API before building the final session state machine.
- Modularize chat rendering and behavior by responsibility.
- Build the session state machine behind adapter boundaries, not directly into components.
- Consolidate stores after consumers migrate, not before.
- Preserve web, Electron, VS Code, and mobile/PWA behavior throughout.

## Revised Non-Goals

- Do not delete broad stores as an early milestone.
- Do not require every UI surface to migrate before chat is stable.
- Do not introduce a new query/cache dependency as part of this refactor.
- Do not make arbitrary line-count limits a hard correctness condition.
- Do not redesign UI visuals while changing state boundaries.

## Updated Architecture Program

### Phase 1: Server Runtime Extraction

**Status:** Implemented or nearly implemented across local branches.

Intent:

- Keep `index.js` as an orchestrator instead of the owner of domain state.
- Move OpenCode lifecycle, event streaming, notifications, sessions, and tunnels into domain runtimes.
- Use typed EventBus events for cross-runtime communication.
- Avoid direct runtime-to-runtime state reads.

Remaining work before marking fully complete:

- Reconcile `main`, `feature/radical-refactor-spec`, and `feature/phase-1b-runtime-extractions`.
- Decide whether Phase 1b lands before or alongside the chat adapter spec.
- Update documentation to reflect the actual `index.js` size and runtime boundaries after reconciliation.

### Phase 2: Chat Adapter Boundary And Modularization

**Status:** Next recommended phase.

Intent:

- Add `packages/ui/src/components/chat/state` as the stable chat-facing state boundary.
- Modularize composer, session shell, timeline, message list, and message rendering responsibilities.
- Keep current stores underneath adapters initially.
- Prepare for the session machine by naming adapter APIs around chat/session concepts.

Detailed design: `.superpawers/specs/2026-05-28-chat-adapter-modularization-design.md`

### Phase 3: Session State Machine Behind Chat Adapters

**Status:** Deferred until Phase 2 creates stable consumers.

Intent:

- Build an explicit session lifecycle model.
- Feed normalized SSE/session events into the machine.
- Expose state through the same adapter hooks introduced in Phase 2.
- Migrate adapter internals one slice at a time.

This phase should not require rewriting composer or message-list components because those components should already consume adapter APIs.

### Phase 4: Store Consolidation By Consumer Migration

**Status:** Deferred.

Intent:

- Remove store responsibilities only when their consumers have migrated.
- Keep thin UI stores for true UI concerns: draft/input, viewport, selection, layout, theme.
- Move session lifecycle, messages, parts, permissions, questions, and streaming state to the session machine once proven.
- Delete obsolete sync/store paths last.

### Phase 5: Broader UI Migration

**Status:** Deferred until chat proves the pattern.

Intent:

- Apply adapter and machine patterns to sidebar/session list, notifications, and related session-aware surfaces.
- Avoid migrating unrelated domains merely to satisfy architecture purity.

## Changes From The Original Radical Spec

### Keep

- Domain-owned server runtimes.
- EventBus-mediated server communication.
- Explicit session state ownership as the eventual UI goal.
- Thin UI stores as the eventual store shape.
- Fine-grained subscriptions as a performance requirement.

### Revise

- Replace early store deletion with adapter-first migration.
- Replace broad UI migration with chat-first migration.
- Treat store line-count limits as review heuristics, not hard gates.
- Make Electron and VS Code parity explicit for shared UI changes.
- Defer config/API store migration until there is a concrete consumer-driven need.

### Remove

- Any implication that `useUIStore` or sync stores must disappear before chat is modular.
- Any requirement to introduce a generic query framework.
- Any conflicting session phase language such as treating tool execution as both part of streaming and a separate waiting-tool phase.

## Revised Session State Machine Direction

The session machine remains a goal, but it should be designed after the chat adapter API stabilizes.

Machine-owned state should include:

- session lifecycle phase
- messages and parts
- streaming buffers
- tool part status as part/message data
- permission requests
- question requests
- retry/error/abort state
- session attention indicators

Machine-owned state should not include:

- composer draft text
- textarea cursor state
- viewport scroll position
- current mobile drawer state
- theme/layout preference
- model/agent selection unless explicitly tied to a session send contract

Important direction:

- Tool calls are not a separate session phase by default. They are represented by message part state while the session remains active/streaming unless a permission or question interruption pauses user action.
- Reconnect/replay handling must be specified before implementation. The machine must tolerate duplicate events, missing historical events, and partial reloads.
- Multi-directory/session routing must be explicit. The machine should not infer directory ownership from stale UI state.

## Revised Store Consolidation Direction

Store consolidation should follow this order:

1. Introduce adapter hooks over current stores.
2. Migrate chat components to adapters.
3. Build machine/state replacements behind adapters.
4. Migrate adapter internals to the new owner.
5. Remove obsolete store fields once no consumers remain.
6. Delete obsolete store files only after all fields are gone.

This preserves working behavior and gives each deletion a concrete reason.

## Updated Success Criteria

### Phase 1 Success

- Server runtimes own their domain state.
- Cross-runtime communication uses EventBus events.
- `index.js` is an orchestrator, not a state owner.
- Existing server tests pass.

### Phase 2 Success

- Chat has a documented adapter boundary.
- Composer, session shell, timeline, and message list responsibilities are separated.
- Chat components trend away from direct broad-store imports.
- Pure chat utilities have focused tests.
- Current behavior is preserved across desktop, mobile, web, Electron, and VS Code.

### Phase 3 Success

- Session machine can replace adapter internals without rewriting chat render components.
- Machine transition behavior is covered by tests and replay fixtures where practical.
- Streaming, abort, retry, permissions, questions, and reconnect behavior are explicit.

### Phase 4 Success

- Store fields are deleted only after consumers migrate.
- Remaining stores own only clear UI or independent domain concerns.
- Components subscribe through narrow hooks/selectors.

## Risk Controls

- Prefer extraction without behavior changes before algorithm changes.
- Use adapter APIs to limit blast radius.
- Keep commits phase-sized and reviewable.
- Preserve mobile-first behavior and keyboard-safe layouts during chat changes.
- Treat hot-path chat rendering changes as performance-sensitive.
- Verify under streaming, session switching, older-history loading, abort, and mobile keyboard scenarios.

## Open Decisions Before Implementation Planning

1. Which branch becomes the integration base for Phase 2 after reconciling current `main` and Phase 1b runtime work?
2. Should the existing uncommitted chat extraction be committed as the first Phase 2 checkpoint before further modularization?
3. Which chat bug or symptom should be used as the manual verification scenario for the modularization phase?
