# Phase 3 Session State Machine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split Phase 3 into independently reviewable implementation subplans that migrate OpenChamber to a shared canonical session-domain XState machine.

**Architecture:** `@openchamber/session-state` owns canonical session-domain semantics. Client and server bridges own runtime resources, transport normalization, actor lifecycle, and effect execution without recreating state rules. Legacy stores and `SessionRuntime` become compatibility surfaces only after their migration slices land.

**Tech Stack:** Bun, TypeScript, XState v5, `@xstate/react`, Zustand, Express server runtimes, OpenCode SSE/EventBus pipeline.

---

## Review

- **Status:** PASS
- **Reviewer:** superpawers-reviewer
- **Date:** 2026-05-29
- **Findings:** Spec coverage is mapped across the subplan set; dependency order is valid; no placeholders, dead references, legacy fallback paths, or global dual-protocol gaps were found.

## Planning Package

Implement these plans in order. Each subplan produces a working, testable checkpoint.

1. `.superpawers/plans/2026-05-29-phase-3-0-prework-dependencies.md`
2. `.superpawers/plans/2026-05-29-phase-3-1-shared-canonical-machine.md`
3. `.superpawers/plans/2026-05-29-phase-3-2-client-bridge-non-hot-adapters.md`
4. `.superpawers/plans/2026-05-29-phase-3-3-hot-path-message-migration.md`
5. `.superpawers/plans/2026-05-29-phase-3-4-server-bridge-sessionruntime.md`
6. `.superpawers/plans/2026-05-29-phase-3-5-canonical-snapshot-transport.md`
7. `.superpawers/plans/2026-05-29-phase-3-6-deprecation-final-verification.md`

## Dependency Chain

Plan 0 must land first because it reconciles the branch and installs packages.

Plan 1 must land before any runtime bridge work because every bridge depends on shared types, selectors, effects, snapshot validation, and fixture scenarios.

Plan 2 may start after Plan 1 and should migrate identity, lifecycle, activity, retry, and interruptions before messages.

Plan 3 must start after Plan 2 because it relies on client actor registry and selector hooks. It is intentionally isolated because streaming is the render hot path.

Plan 4 may start after Plan 1 and should be coordinated with Plan 5 because server bridge output feeds canonical transport.

Plan 5 must start after Plan 4 because old global synthetic transport events are replaced by machine snapshots produced by the server bridge.

Plan 6 is the closure plan. It must not start until Plans 2 through 5 are complete.

## Cross-Plan Rules

- Do not add legacy fallback for migrated fields.
- Do not broadcast both old global session protocols and `openchamber:session-snapshot` in the same migration slice.
- Do not put React, DOM, Express, SDK clients, timers, AbortControllers, EventBus instances, Maps, Sets, Dates, or class instances in shared machine context or snapshots.
- Preserve unchanged message and part object identity during part-only updates.
- Keep composer, selection, viewport, mobile drawer, and timeline presentation state outside the shared machine.
- Create or update `DOCUMENTATION.md` for every new server module.
- Run `bun run type-check` and `bun run lint` before declaring any subplan complete.

## Normalization Tables Required Before Bridge Coding

Server and client normalizers must use the same domain event union from `@openchamber/session-state`.

| Source input | Domain event or snapshot |
| --- | --- |
| OpenCode `session.status` busy | `STREAM_STARTED` or `RETRY_STARTED`, plus activity/lifecycle selectors derive working state |
| OpenCode `session.status` idle | `STREAM_COMPLETED`, `ABORT_CONFIRMED`, or retry cooldown completion based on active machine state |
| OpenCode `session.status` retry | `RETRY_STARTED` with `retryCount`, `retryMessage`, `retryCooldownUntil` |
| OpenCode `message.updated` | `MESSAGE_ADDED` when the message ID is new, otherwise `MESSAGE_UPDATED` |
| OpenCode `message.part.updated` | `MESSAGE_PART_STARTED`, `MESSAGE_PART_UPDATED`, or `MESSAGE_PART_FINISHED` based on part existence and completion metadata |
| OpenCode `message.part.delta` | `MESSAGE_PART_DELTA` against active `streamingPartId` or explicit target part ID |
| OpenCode permission asked/replied | `PERMISSION_REQUESTED` / `PERMISSION_RESOLVED` |
| OpenCode question asked/answered/rejected | `QUESTION_REQUESTED` / `QUESTION_ANSWERED` / `QUESTION_REJECTED` |
| OpenCode/runtime load error | `SESSION_LOAD_FAILED` |
| OpenCode/runtime stream error | `STREAM_FAILED` |
| Current sync loaded message window | `SessionSnapshotV1` restored with `restoreSessionMachineSnapshot(...)` or `SESSION_LOADED` plus message/part events |
| Load older success | `LOAD_OLDER_COMPLETED` |
| Load older failure | `LOAD_OLDER_FAILED` |
| Canonical transport event | `openchamber:session-snapshot` carrying `SessionSnapshotV1` |

## Final Acceptance

- `@openchamber/session-state` exports a typed XState v5 machine, domain events, effects, snapshots, validation, selectors, actor-key helpers, snapshot restoration, invariants, and fixture runner.
- Client chat adapter fields migrated in Phase 3 read from machine actors/selectors only.
- `useChatSessionData` is no longer an untracked source of truth for migrated fields.
- `SessionRuntime` compatibility snapshots derive from the server machine bridge instead of independent lifecycle/activity/retry maps.
- Global session transport emits `openchamber:session-snapshot` and no longer emits old global `openchamber:session-status` or `openchamber:session-activity` for migrated paths.
- Final verification passes: `bun run type-check`, `bun run lint`, `bun test packages/session-state/`, `bun test packages/ui/src/components/chat/`, relevant `packages/web/server` tests, and manual desktop/mobile streaming checks.
