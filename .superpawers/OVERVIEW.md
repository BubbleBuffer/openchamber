# OpenChamber Refactor — Overview & Checklist

> Living overview of the radical refactor program. Source of truth for "what's done / in flight / next".
> Deep design lives in `.superpawers/specs/`. Per-task plans live in `.superpawers/plans/`.
> Last updated: 2026-06-23 (Phase 3.3 merged into main; Phase 4 dead-field audit landed).

## Status snapshot

| Phase | Status | Notes |
|-------|--------|-------|
| 1 — Server runtime extraction | ✅ Complete | OpenCode / EventStream / Tunnel / Notification / Session runtimes; typed EventBus |
| 2 — Chat adapter modularization | ✅ Complete | Adapter boundary, composer / message-list splits, final commit `17cb29fc` |
| 3 — Session state machine | 🟡 Partial | 3.0 / 3.1 / 3.2 / **3.3** merged. 3.4–3.6 planned. |
| 4 — Store consolidation | 🟡 Partial | Dead-field audit pass done. Spec splits unblocked now that Phase 3.3 hot-path is in. |
| 5 — Broader UI migration | ⏸ Deferred | Until chat proves the pattern |

---

## Phase 1 — Server runtime extraction

- [x] OpenCodeRuntime — process lifecycle, port, auth, health, restart
- [x] Typed EventBus + cross-runtime event contract
- [x] EventStreamRuntime — SSE fan-out, per-directory isolation, stall recovery
- [x] TunnelRuntime — tunnel auth, bootstrap tokens
- [x] NotificationRuntime — web push, desktop notifications, templates, triggers
- [x] SessionRuntime — session event-bus wiring
- [x] Bounded caches (LRU + TTL) for upstream headers / state
- [x] `index.js` reduced from 1251 → ~714 lines (target was ~80; bridge still imports `./dist/domains/`)

Spec: `.superpawers/specs/2026-05-24-phase-1b-runtime-extractions-design.md`

---

## Phase 2 — Chat adapter modularization

- [x] Chat-facing adapter boundary (`packages/ui/src/components/chat/`)
- [x] Composer split into state / action / selection / history / keyboard / footer / controls
- [x] SessionMount pool (10-session LRU)
- [x] Message-list local UI / animation extracted
- [x] Chat scroll refactor — column-reverse + `useUserScrollDetector` + `useSSEAnchorSuppression`
- [x] Replace `useChatScrollManager` (400 lines)
- [x] Adapter → machine integration points defined (consumed by Phase 3)

Spec: `.superpawers/specs/2026-05-28-chat-adapter-modularization-design.md`
Plan: `.superpawers/plans/2026-05-11-chat-column-reverse-mount-pool.md` ✅ complete

---

## Phase 3 — Session state machine

Package: `packages/session-state/` (XState v5, typed events, snapshots, fixture runner)

- [x] **3.0** Prework + dependencies — `.superpawers/plans/2026-05-29-phase-3-0-prework-dependencies.md`
- [x] **3.1** Shared canonical machine — `.superpawers/plans/2026-05-29-phase-3-1-shared-canonical-machine.md`
- [x] **3.2** Client bridge — non-hot adapters (identity, lifecycle, activity, retry, interruptions) — `.superpawers/plans/2026-05-29-phase-3-2-client-bridge-non-hot-adapters.md`
- [x] **3.3** Hot-path message migration — `useChatMessages` now sources from machine hooks internally (no prop drilling from `useChatSessionData`); `useChatTimelineState` deleted as zero-callers dead code; `useStreamingStore` reads reduced to compatibility consumers (mount pool eviction, debug logging) — `.superpawers/plans/2026-05-29-phase-3-3-hot-path-message-migration.md`
- [ ] **3.4** Server bridge SessionRuntime — `.superpawers/plans/2026-05-29-phase-3-4-server-bridge-sessionruntime.md`
- [ ] **3.5** Canonical snapshot transport — `openchamber:session-snapshot` — `.superpawers/plans/2026-05-29-phase-3-5-canonical-snapshot-transport.md`
- [ ] **3.6** Deprecation + final verification — `.superpawers/plans/2026-05-29-phase-3-6-deprecation-final-verification.md`

Index: `.superpawers/plans/2026-05-29-phase-3-session-state-machine-index.md`

---

## Phase 4 — Store consolidation

Goal: remove store fields only after their consumers migrate.

- [x] **Dead-field audit (✅):** Removed 14 dead fields from `useUIStore` + `useSessionUIStore` (Phase 3.3-finish + Phase 4-audit commits). Sweep of sync/ + stores/ found 7 dead selectors, 3 dead type fields, 2 dead hooks, 1 dead counter — all removed. Total: **26 dead symbols across 6 stores**.
- [ ] **Pending — persisted-dead field** (`useAgentConfigStore.settingsAutoCreateWorktree`): defined + setter + persisted via `partialize`, but no UI reads/writes it. Skipped during audit per AGENTS.md (no data loss without consent). **Decision needed later:** (a) build UI for the worktree auto-create toggle, (b) add a persist-migration that drops it, or (c) leave dormant. See `packages/ui/src/stores/agents/useAgentConfigStore.ts:186`.
- [ ] Migrate config stores to API-backed hooks (`useProviderConfigStore`, `useAgentsStore`, `useProjectsStore`, `useGitStore`, `useGitHubPrStatusStore`, …)
- [ ] Delete `useUIStore` (1,718 lines) once machine owns session lifecycle / messages / parts / streaming
- [ ] Delete obsolete sync-store paths (event reducer, child stores)
- [ ] Keep thin UI stores only for: composer draft, viewport, selection, layout, theme
- [ ] Each deletion lands a concrete consumer-driven reason

Spec: `.superpawers/specs/2026-05-28-radical-architecture-refactor-v2-design.md` Phase 4

---

## Phase 5 — Broader UI migration (deferred)

- [ ] Apply adapter + machine patterns to sidebar / session list
- [ ] Apply to notifications surface
- [ ] Other session-aware surfaces

---

## Cross-cutting — Server TypeScript modernization

- [x] Stages 1–10 — 101 new TS files (27K lines) across 13 domain directories
- [x] Quota / git / github / mcp / services / routes / package-manager / skills-catalog — all ported to TS, all stale JS deleted, all `require()` bridges killed
- [x] `src/index.ts` replaces old `index.js` entry
- [x] Strict-mode cleanup — `as any` removed, Express types, catch typing, transformers
- [x] Last 4 JS files deleted (see "Recent cleanup" below)
- [x] 5 TS source / test files added to replace them

Specs:
- `.superpawers/specs/2026-05-31-server-typescript-modernization-design.md`
- `.superpawers/specs/2026-06-02-server-typescript-migration-handoff.md`

---

## Housekeeping — recent cleanup (2026-06-23)

### Branches dropped (14)
- [x] feature/chat-adapter-modularization-spec
- [x] feature/gemini-theme-engine
- [x] feature/mobile-first-pwa-fork
- [x] feature/model-picker-auto
- [x] feature/phase-1a-opencode-runtime
- [x] feature/phase-1b-event-driven-runtimes
- [x] feature/phase-1b-runtime-extractions
- [x] feature/radical-refactor-spec
- [x] feature/sentry-integration
- [x] feature/server-typescript-modernization
- [x] fix/error-recovery-gaps
- [x] fix/error-recovery-pipeline
- [x] fix/sentry-noise-and-crashes
- [x] phase-1b-server-runtimes

### Last JS files deleted (5)
- [x] `packages/web/server/proxy-headers.js` → `src/domains/server-utils/proxy-headers.ts`
- [x] `packages/web/server/proxy-headers.test.js` → `…/proxy-headers.test.ts`
- [x] `packages/web/server/opencode-proxy.test.js` (broken import path) → `…/proxy.test.ts`
- [x] `packages/web/server/sse-routes.test.js` (used `bun:test`) → split into `notifications/routes.test.ts` + `scheduled-tasks/routes.test.ts`
- [x] `packages/web/server/proxy-headers.d.ts` (stale artifact) → removed

### Branches — current state
- [x] `feature/streaming-refactor` — **folded into `feature/streaming-liveness-fix`**, then dropped. 13 commits of decomposition superseded by the focused liveness fix shipped on 2026-06-24. Frozen-chat bug closed: server emits explicit `data_stalled` / `data_resumed` frames when upstream stalls; browser dual-timer monitor (`markDataEvent` vs `markSocketActivity`) detects stalls and reconnects with `lastEventId` for replay. Masking `openchamber:heartbeat` data frames removed; `socket.ping()` retained for NAT keepalive. Spec: `.superpawers/specs/2026-06-24-streaming-liveness-fix-design.md`.

---

## Verification baseline

```bash
bun run type-check           # ✅ clean (all packages + server TS)
bun run type-check:server    # ✅ clean
bun run lint                 # ⚠ 804 pre-existing errors / warnings — none new from this session
bun run test                 # 199 / 201 pass (2 pre-existing bootstrap failures, unrelated)
```

## Out of scope for the rework (tracked elsewhere)

- Sentry integration — done
- TTS / Cloudflare tunnels / Tauri shell — removed
- Store / lib / chat folder restructuring — done
- VS Code / Electron parity — maintained per phase
- PWA / mobile-first UI — ongoing per `.opencode/skills/mobile-first-ui`