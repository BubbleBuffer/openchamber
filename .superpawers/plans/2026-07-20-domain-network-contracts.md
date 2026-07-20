---
kind: plan
status: active
base_branch: feature/lint-integration-readiness
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - domain-network-contracts
created: 2026-07-20
updated: 2026-07-20
next_action: "Execute Task 2"
---

# Domain Network Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Give every maintained OpenChamber HTTP, SSE, and WebSocket boundary a domain-owned contract, runtime validation, stable safe errors, and executable contract coverage without changing protected product behavior.

**Design Reference:** `.superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`

## Architecture

Pure contracts live under `packages/web/server/src/contracts/` because the server build already owns the published runtime artifact. Browser code imports those modules through an `@contracts/*` source alias. Contract modules must remain portable: no Express, DOM, Node, filesystem, OpenCode SDK, service objects, or process handles. They may export serializable DTOs, stable codes, constants, type guards, and pure parsers.

The browser feature flow is `feature -> domain contract -> browser transport adapter`; the server flow is `route adapter -> domain contract parser -> domain service`. Server routes validate requests before invoking services and validate or explicitly construct responses at the network edge. Browser adapters decode untrusted JSON before returning typed values. Existing Git caches, terminal connection state, sync-store authority, replay ordering, and render/subscription boundaries are preserved.

No schema dependency is added. Small composable `unknown` parsers provide the required runtime guarantees and preserve explicit error paths. OpenCode SDK proxy payloads remain owned by the SDK; OpenChamber validates only its own route parameters, wrappers, synthetic events, and compatibility metadata.

### Error Compatibility Contract

HTTP failures keep the existing top-level message field and add a code: `{ error: string, code: <domain code> }`. This is additive for existing clients that read `error`; successful response shapes and headers remain endpoint-specific. Migrations preserve the current status class at every route boundary:

- `400` invalid parameter, query, or body;
- `401` missing or expired owner session;
- `403` invalid Origin, CSRF, or forbidden resource;
- `404` absent route/resource;
- `409` state or Git conflict;
- `413` body or payload limit;
- `415` unsupported media or icon format;
- `429` rate limit, including the current `Retry-After` header;
- `502` upstream/provider failure;
- `503` startup, shutdown, or temporarily unavailable runtime;
- `504` model, Zen, or other upstream timeout;
- `500` unknown internal failure, logged with diagnostic context but returned as `internal_error` with no raw exception, path, token, credential, command output, or upstream body.

Existing route tests lock any more-specific status/header behavior before migration. Owner-auth middleware, Origin/CSRF enforcement, loopback issuance, and cookie attributes do not move into contracts. WebSocket upgrade failures keep their current plain-text status body and gain `X-OpenChamber-Error-Code`; post-upgrade error frames keep `type: "error"` and `message` and gain `code`. SSE authentication failures remain HTTP failures before stream establishment.

### Endpoint Ownership Inventory

Task 1 creates `packages/web/server/src/contracts/route-inventory.ts`, a declarative map from every active route registrar to one contract owner or an explicit external/static pass-through classification. Its test fails when route literals are added without inventory coverage. The initial inventory includes:

- `domains/routes/core-routes.ts`, `openchamber-routes.ts`, `static-routes.ts`, event-stream upgrades, and PWA manifest routes: `system`, `ui-auth`, `opencode`, `event-stream`, or `static-pass-through`;
- `domains/opencode/routes/core-routes.ts`, `routes.ts`, `config-entity-routes.ts`, `project-icon-routes.ts`, and `skill-routes.ts`: `settings`, `opencode`, `files`, or `skills-catalog`, with direct SDK proxy payloads marked `sdk-pass-through`;
- `domains/fs/routes.ts`, `git/routes.ts`, `github/routes.ts`, `quota/routes.ts`, `terminal/routes.ts`, `notifications/routes.ts`, `session-folders/routes.ts`, and `magic-prompts/routes.ts`: their matching domain contract;
- health/static files and raw OpenCode HTTP/SSE proxy routes: explicit pass-through entries that still document authentication and transport ownership.

The following exact ownership is part of the inventory and implementation scope:

- project icon GET/PUT/DELETE/discover in `domains/opencode/routes/project-icon-routes.ts`, `src/ui/lib/project/projectMeta.ts`, and `src/ui/stores/projects/useProjectsStore.ts` -> `contracts/project-assets.ts` with `project_asset_*` codes and `project-icon-routes.test.ts`;
- installed skill CRUD/supporting-file routes in `domains/opencode/routes/skill-routes.ts` and `src/ui/stores/skills/useSkillsStore.ts`, plus catalog source/scan/install routes and `useSkillsCatalogStore.ts` -> `contracts/skills.ts` with separate installed/catalog discriminants and route/store adapter tests;
- custom theme listing in `domains/opencode/routes/core-routes.ts` and `src/ui/contexts/ThemeSystemContext.tsx` -> `contracts/themes.ts` and theme route/decoder tests;
- update check/install plus Zen/model metadata in `domains/routes/openchamber-routes.ts`, `src/ui/stores/useUpdateStore.ts`, `src/ui/components/ui/UpdateDialog.tsx`, `src/ui/stores/config/useProviderConfigStore.ts`, and `src/ui/components/sections/openchamber/NotificationSettings.tsx` -> `contracts/system.ts`, `domains/routes/openchamber-routes.test.ts`, `src/ui/stores/useUpdateStore.test.ts`, `src/ui/stores/config/useProviderConfigStore.test.ts`, and `tests/react/notification-settings-contract.test.tsx`;
- notification stream, Push, and session status/view/message routes in `domains/notifications/routes.ts` plus their sync/store clients -> `contracts/notifications.ts` and `notifications/routes.test.ts`/client contract tests;
- `/api/find/file` and `/api/experimental/tool/ids` forwarded by `domains/server-utils/proxy.ts` -> `sdk-pass-through`; browser files/tools adapters validate only their narrow feature model (`FileSearchResult` or string ID list) and do not assert ownership of the upstream wire schema;
- final `app.use("/api", apiProxy)` in `domains/server-utils/proxy.ts` -> `sdk-pass-through`. Upstream SDK status, body, and allowed headers pass through unchanged. Only OpenChamber-generated proxy transport failures before an upstream response use the common `{ error, code }` contract, such as `opencode_unavailable`.

## Execution Defaults

Tasks 1-4 are Test-first because they establish or migrate executable network behavior. Task 5 is Evidence-led tracking and verification after the implementation has independent review. Implementers own local RED/GREEN sequencing, scoped diff inspection, and task commits. Never use process-name matching; integration cleanup remains PID-file/watchdog/reaper based.

### Task 1: Establish Contract And Transport Foundations

- [x] **Outcome:** A portable domain-contract layer owns common errors, protocol compatibility metadata, HTTP decoding primitives, and the complete message-stream SSE/WS wire protocol used by both browser and server.

**Files and anchors:**
- Create: `packages/web/server/src/contracts/common.ts` - portable `ApiErrorResponse`, stable common error codes, JSON object/string/number/boolean/array parsers, and a result type that distinguishes valid values from validation failures.
- Create: `packages/web/server/src/contracts/system.ts` - contracts and parsers for `/health`, `/api/system/info`, `/api/openchamber/update-check`, `/api/openchamber/update-install`, `/api/openchamber/models-metadata`, and `/api/zen/models`; own update availability/install results, model metadata records, Zen model lists, timeout/upstream errors, and one protocol version constant without adding client/server negotiation behavior beyond reporting the value.
- Create: `packages/web/server/src/contracts/event-stream.ts` - `SseEventEnvelope<unknown>`, the discriminated `MessageStreamWsFrame` union, scope/error/stall/replay fields, frame parser, and synthetic OpenChamber event types.
- Create: `packages/web/server/src/contracts/route-inventory.ts` and `route-inventory.test.ts` - enumerate every active route registrar/endpoint as contracted, SDK pass-through, or static pass-through and reject uncovered additions.
- Create: `packages/web/server/src/contracts/common.test.ts`, `system.test.ts`, and `event-stream.test.ts` - valid/invalid JSON, safe error serialization, compatibility metadata, every WS frame variant, malformed frames, wrapped/unwrapped SSE payloads, and unknown outer-frame rejection.
- Modify: `packages/web/tsconfig.json`, `packages/web/vite.config.ts`, `packages/web/tsconfig.server.json`, `packages/web/tsconfig.server.build.json`, `tests/tsconfig.json`, `tests/vitest.config.ts`, `tests/react/vitest.config.ts`, and `tests/perf/vitest.config.ts` - browser/tests resolve `@contracts/*` to `packages/web/server/src/contracts/*`; server files use relative `../../contracts/*.js` imports so emitted Node ESM has no unresolved alias. Retain existing UI/web/session-state aliases.
- Modify: `packages/web/server/src/domains/event-stream/types.ts` and `protocol.ts` - consume the shared transport contracts, replace wire-facing `any` with `unknown`, and keep server-only hub/socket dependencies local.
- Modify: `packages/web/src/ui/sync/event-pipeline.ts` - remove the client-only `MessageStreamWsFrame`, parse outer frames through the shared contract, reject malformed outer frames without mutating state, and preserve reconnect/fallback/last-event behavior. A valid `event` frame carries an opaque SDK payload; unknown SDK event types are not rejected here.
- Modify: `packages/web/server/src/domains/routes/core-routes.ts`, `openchamber-routes.ts`, `packages/web/server/src/shared/types.ts`, `packages/web/src/ui/stores/useUpdateStore.ts`, `packages/web/src/ui/components/ui/UpdateDialog.tsx`, `packages/web/src/ui/stores/config/useProviderConfigStore.ts`, and `packages/web/src/ui/components/sections/openchamber/NotificationSettings.tsx` - expose/decode compatibility, update, model metadata, and Zen model contracts without changing update installation or notification-model behavior.
- Modify/create: `packages/web/server/src/domains/routes/openchamber-routes.test.ts`, `packages/web/src/ui/stores/useUpdateStore.test.ts`, `packages/web/src/ui/stores/config/useProviderConfigStore.test.ts`, and `tests/react/notification-settings-contract.test.tsx` - prove successful and malformed results, 504 timeout, safe upstream error, and unchanged update/model consumer behavior.
- Modify: `packages/web/server/src/domains/event-stream/protocol.test.ts`, `upstream-reader.test.ts`, `global-hub.test.ts`, `global-ws-bridge.test.ts`, `directory-ws-bridge.test.ts`, `packages/web/src/ui/sync/event-pipeline.test.ts`, and `tests/web/ws-upgrades.test.ts` - prove the same contracts drive both transports and preserve ready, scoped delivery, replay, stall/resume, slow-client closure, and SSE fallback.

**Constraints:**
- Preserve `/api/event`, `/api/global/event`, `/api/event/ws`, `/api/global/event/ws`, and `/api/notifications/stream` paths and their authentication/origin behavior.
- Do not add work to the event hot path beyond one bounded object/type discriminator pass per received frame; no schema traversal of SDK event payload bodies.
- Do not alter session-machine authority, directory routing, event coalescing, orphan-delta buffering, or replay ordering.
- Browser SSE fallback remains decoded by `@opencode-ai/sdk/v2` `global.event()` and treats SDK events as externally owned. Server upstream SSE parsing validates only the OpenChamber wrapper (`eventId`, `directory`, opaque `payload`). WS framing validates the OpenChamber outer frame. Tests cover replay IDs, stall/resume, malformed-frame state immutability, and identical event delivery across WS and SDK SSE fallback.
- Compatibility metadata reporting is additive. Blocking read-only update behavior remains owned by `pwa-auth-runtime`.

**Dependencies:**
- None.

**Proof:**
- Shared contract tests, all event-stream Vitest files, client pipeline/liveness/reconnect tests, WS/web integration tests, type-check, server build, and web build pass.

### Task 2: Contract Core Browser And Persisted-Settings Domains

- [ ] **Outcome:** OpenChamber-owned files, settings, push, notifications, and UI-auth routes accept and return domain DTOs through runtime validators; malformed input and authorization failures use stable safe codes while existing successful browser behavior remains unchanged. SDK-owned file-search and tool-ID pass-throughs retain upstream semantics and use only browser-local narrow feature decoders.

**Files and anchors:**
- Create: `packages/web/server/src/contracts/files.ts` - OpenChamber-owned list/stat/read/write/mkdir/delete/rename/raw request and response DTOs, strict response parsers, path/content/body validators, and `fs_*` error codes. `/api/find/file` remains SDK pass-through and is narrowed into a browser feature model without duplicating its upstream schema.
- Create: `packages/web/server/src/contracts/settings.ts` - move neutral serializable `AppSettings` and `SkillCatalogConfig` ownership from `packages/web/src/ui/lib/config/settingsTypes.ts`; define GET/PUT/reload DTOs, persisted-input parser/sanitization boundary, and `settings_*` codes.
- Create: `packages/web/server/src/contracts/notifications.ts` - push subscribe/unsubscribe/visibility, notification SSE synthetic events, and `notification_*` codes.
- Create: `packages/web/server/src/contracts/ui-auth.ts` - owner-session request/response/error contracts without importing auth controllers. The experimental tool-ID endpoint remains SDK pass-through; its browser adapter validates only a string-ID array.
- Create: focused `*.test.ts` files beside each contract covering success, missing/wrong/array input, unknown persisted fields, authorization response, malformed successful response, and representative partial failure.
- Modify: `packages/web/server/src/domains/fs/routes.ts`, `settings/helpers.ts`, `settings/runtime.ts`, `domains/opencode/routes/core-routes.ts`, `domains/opencode/routes/routes.ts`, `domains/routes/core-routes.ts`, `notifications/routes.ts`, `domains/server-utils/proxy.ts`, and UI-auth route/controller boundaries in `packages/web/server/src/domains/ui-auth/` - parse untrusted params/query/body/persisted data before domain calls and construct contracted responses.
- Modify: `packages/web/src/api/files.ts`, `settings.ts`, `push.ts`, and `notifications.ts` - decode OpenChamber-owned JSON/SSE payloads through contracts and surface coded safe errors rather than unchecked casts. The `/api/find/file` branch in `files.ts` and `packages/web/src/api/tools.ts` use browser-local `unknown`-to-feature-model decoders only; they do not import shared wire contracts or alter upstream SDK payload/error semantics.
- Modify: `packages/web/src/ui/lib/config/settingsTypes.ts`, `persistence.ts`, `openchamberConfig.ts`, API/store consumers, and `packages/web/src/ui/lib/api/types.ts` - import domain DTOs from `@contracts`, remove duplicate definitions, and preserve settings coalescing/flush/rollback behavior.
- Modify: `packages/web/server/src/domains/fs/routes.test.ts`, `settings/runtime.test.ts`, `notifications/routes.test.ts`, `packages/web/server/src/domains/ui-auth/routes.test.ts` (create if current controller tests cannot exercise HTTP), `packages/web/server/src/domains/security/request-security.test.ts` (create), `packages/web/src/api/files.test.ts`, `notifications.test.ts`, `push.test.ts`, and `packages/web/src/ui/lib/config/persistence.test.ts` - exercise success, invalid input, missing/expired auth, invalid Origin, rate-limit status/header, persisted-data cleanup, write failure/retry, and per-item/partial outcomes where supported.

**Constraints:**
- Workspace path enforcement remains server policy and is not moved into contracts.
- Unknown exceptions are logged with context but return `internal_error` plus a safe message; no raw credentials, filesystem details, tokens, or upstream bodies are exposed.
- `contracts/settings.ts` owns two explicit shapes: complete `PersistedSettings` and browser-visible `AppSettings`. The persisted inventory is generated from one `SETTINGS_FIELDS` descriptor used by validation and tested for parity with `sanitizeSettingsUpdate`. It includes every currently accepted field, including `uiFont`, `monoFont`, `markdownDisplayMode`, `githubClientId`, `githubScopes`, `showTextJustificationActivity`, `typographySizes`, and `toolCallExpansion`, plus all fields already in browser `AppSettings`. Server-only/bootstrap fields are classified explicitly instead of silently dropped. Only unknown/obsolete fields are removed.
- Inventory every direct `persistSettings`/atomic settings writer, not only `sanitizeSettingsUpdate`. `publicOrigin` and secret `vapidKeys` are persisted server-only fields: they survive unrelated writes and migrations, are validated in server code, and are never included in `AppSettings` or GET responses. Project-icon, directory, notification, and template-runtime direct writes receive preservation tests.
- Atomic/coalesced settings writes retain current behavior. Fix the reachable queue failure in `settings/runtime.ts` so one rejected atomic write does not permanently reject later saves; tests prove failure propagation, preserved prior data, and a successful subsequent write.
- HTTP CSRF token enforcement is explicitly deferred to `pwa-auth-runtime`; this task documents that current gap and preserves existing HTTP auth behavior. It tests missing/expired owner auth and Origin enforcement where currently active, plus WebSocket 401/403 upgrade rejection, without inventing a CSRF middleware in this chunk.
- Browser adapters may preserve endpoint-specific successful result shapes; do not introduce a universal success envelope.
- SDK-pass-through file-search and tool-ID adapters are excluded from shared contract ownership and `contract-matrix.test.ts`; their local decoder tests establish only the feature shape needed by the UI.

**Dependencies:**
- Task 1.

**Proof:**
- Domain contract tests, FS/settings/notification/auth route tests, browser API tests, store tests, React settings tests, type-check, web/server builds, and protected files/settings/PWA notification web tests pass.

### Task 3: Contract Git, GitHub, Quota, And Catalog Domains

- [ ] **Outcome:** Git, GitHub, quota, and skills-catalog requests/responses/errors have one domain authority shared by route adapters and browser clients; the bulk browser API registry no longer owns their wire DTOs.

**Files and anchors:**
- Create: `packages/web/server/src/contracts/git.ts` - authoritative Git status/diff/branch/log/identity/worktree/merge/rebase/stash/request DTOs, parsers, per-item result types, and stable `git_*` codes. Reconcile current/null/tracking/ahead/behind/attention/conflict drift explicitly.
- Create: `packages/web/server/src/contracts/github.ts` - auth/device-flow/user/PR/issue/check request and response DTOs, parsers, and `github_*` codes; retain disconnected and partial check-run states as explicit discriminated outcomes.
- Create: `packages/web/server/src/contracts/quota.ts`, `skills.ts`, `project-assets.ts`, and `themes.ts` - move existing provider/catalog/installed-skill wire shapes, project-icon operations, and custom-theme listing to contract owners and preserve provider/item-specific partial failures.
- Create: `packages/web/server/src/contracts/git.test.ts`, `github.test.ts`, `quota.test.ts`, `skills.test.ts`, `project-assets.test.ts`, and `themes.test.ts` for all discriminants, representative invalid inputs, malformed successes, authorization failures, nullable/optional fields, and batch partial success.
- Modify: `packages/web/server/src/domains/git/types.ts`, `routes.ts`, and `service.ts` public adapters - import wire types from the contract while retaining internal service/process types in the domain.
- Modify: `packages/web/src/ui/lib/git/gitApiHttp.ts` and `packages/web/src/api/git.ts` - decode network responses without changing TTL/inflight caches, invalidation, dynamic directory reads, or optimistic worktree behavior.
- Modify: `packages/web/server/src/domains/github/types.ts`, `routes.ts`, `packages/web/src/api/github.ts`, and browser GitHub consumers - replace inline/unchecked DTO assembly and `jsonOrNull<T>` with contracts while preserving Octokit as a server adapter detail.
- Modify: quota, installed-skill/catalog, project-icon, and theme server routes/types plus the exact browser stores/contexts named in the endpoint inventory - use shared contracts and preserve configured/unconfigured/error, CRUD/supporting-file, install/scan, icon-discovery, and custom-theme semantics.
- Modify: `packages/web/src/ui/lib/api/types.ts` - remove Git/GitHub/quota/catalog request/response definitions and import only feature-facing API interfaces or contract types where the runtime API aggregate still needs them.
- Create/modify exact route tests: `packages/web/server/src/domains/git/routes.contract.test.ts`, `github/routes.contract.test.ts`, `quota/routes.contract.test.ts`, `opencode/routes/skill-routes.test.ts`, `opencode/routes/project-icon-routes.test.ts`, and `opencode/routes/core-routes.test.ts`.
- Create/modify exact browser adapter/consumer tests: `packages/web/src/ui/lib/git/gitApiHttp.contract.test.ts`, `packages/web/src/api/github.contract.test.ts`, `packages/web/src/ui/stores/quota/useQuotaStore.contract.test.ts`, `packages/web/src/ui/stores/skills/useSkillsStore.contract.test.ts`, `useSkillsCatalogStore.contract.test.ts`, `packages/web/src/ui/stores/projects/useProjectsStore.contract.test.ts`, and `packages/web/src/ui/contexts/ThemeSystemContext.contract.test.tsx`. Cover representative success, invalid directory/body, unauthenticated GitHub, upstream partial check failure, Git batch/per-item failure, quota provider error, installed/catalog skill partial failure, icon 415, and malformed theme payload.

**Constraints:**
- Do not refactor `gitApiHttp.ts` cache architecture or Git service command execution; only contract translation and validation are in scope.
- Do not expose Octokit, simple-git, child-process, filesystem, or credential-provider types to browser code.
- Dynamic directory reads and rich polling fields retain current fidelity and reference behavior.
- GitHub unauthenticated/disconnected results remain non-exceptional only where currently modeled as product state; malformed or unauthorized mutations use stable errors.

**Dependencies:**
- Tasks 1 and 2.

**Proof:**
- Contract suites, Git/GitHub/quota/catalog route tests, browser adapter/store tests, worktree contract tests, web integration tests, type-check, builds, and lint comparison show no behavior or hot-path regression.

### Task 4: Contract Terminal And Remaining OpenChamber Routes

- [ ] **Outcome:** Terminal HTTP/WS control frames, OpenChamber-owned OpenCode/config routes, session-folder and magic-prompt wrappers, and remaining runtime API methods use explicit contracts; SDK-owned payloads remain delegated rather than duplicated.

**Files and anchors:**
- Create: `packages/web/server/src/contracts/terminal.ts` - session/capability/create/input/resize/restart/kill DTOs, terminal WS control/data frame unions and parser, and `terminal_*` errors.
- Create: `packages/web/server/src/contracts/opencode.ts` - only OpenChamber-owned directory, config entity, provider-source, reload/resolution, model metadata, MCP pending-auth, session-folder, and magic-prompt wrapper DTOs/codes. Document SDK pass-through payloads as externally owned.
- Create: `packages/web/server/src/contracts/terminal.test.ts` and `opencode.test.ts` covering success, invalid dimensions/encoding/body/path/name, authorization failure, process/upstream error, and reconnect/partial terminal state.
- Modify: `packages/web/server/src/domains/terminal/types.ts`, `protocol.ts`, `routes.ts`, browser `packages/web/src/ui/lib/terminal/terminalApi.ts`, and `packages/web/src/api/terminal.ts` - share HTTP/WS contracts while preserving transport preference, reconnect, backpressure, keepalive, and process cleanup.
- Modify: `packages/web/server/src/domains/opencode/routes/routes.ts`, `config-entity-routes.ts`, `domains/routes/openchamber-routes.ts`, `domains/server-utils/proxy.ts`, `session-folders/routes.ts`, and `magic-prompts/routes.ts` - validate OpenChamber-owned wrappers and return contracted safe errors without moving service policy; leave raw SDK routes marked pass-through.
- Modify: corresponding browser config/model/MCP/session-folder/magic-prompt clients and `packages/web/src/ui/lib/api/types.ts` - consume domain contracts and remove remaining request/response/event DTO accumulation.
- Create/modify exact server tests: `packages/web/server/src/domains/terminal/routes.test.ts`, existing `terminal/protocol.test.ts`, `opencode/routes/routes.test.ts`, new `opencode/routes/config-entity-routes.test.ts`, `session-folders/routes.test.ts`, and `magic-prompts/routes.test.ts`.
- Create/modify exact browser tests: `packages/web/src/ui/lib/terminal/terminalApi.test.ts`, `packages/web/src/ui/stores/config/useProviderConfigStore.test.ts`, `packages/web/src/ui/stores/mcp/useMcpConfigStore.contract.test.ts`, `packages/web/src/ui/stores/session/useSessionFoldersStore.contract.test.ts`, `packages/web/src/ui/lib/tools/magicPrompts.contract.test.ts`, `packages/web/src/ui/components/sections/mcp/McpOAuthCallbackPage.contract.test.tsx`, and `McpPage.contract.test.tsx`. The inventory test fails if one of these endpoints has no named contract/test owner.

**Constraints:**
- Do not recreate OpenCode SDK event/session/message/tool schemas. SDK proxy requests and responses remain typed by `@opencode-ai/sdk/v2`; contracts cover only OpenChamber parameters, envelopes, synthetic events, and errors.
- Terminal frame parsing is bounded and allocation-conscious; no additional iteration is added per terminal data chunk after the initial discriminator check.
- Preserve terminal tabs/reconnect, session prompt/tool/permission behavior, and local/remote parity.

**Dependencies:**
- Tasks 1-3.

**Proof:**
- Terminal contract/protocol tests, OpenCode wrapper route tests, session/chat/tool/permission tests, web and full integration suites, type-check, and builds pass.

### Task 5: Remove Bulk Contracts, Document Protocol, And Close The Chunk

- [ ] **Outcome:** The old bulk API type registry and ad hoc wire casts are absent, active architecture documentation describes supported routes/transports/authentication/error/version expectations, exhaustive checks pass, and the parent chunk is machine-validly completed.

**Files and anchors:**
- Modify: `packages/web/src/ui/lib/api/types.ts` - retain it explicitly as the minimal aggregate-only `RuntimeAPIs` bridge required by this plan. It may compose domain API interfaces and browser-only callback/subscription types, but owns no network request, response, event, error, or persisted DTO. Removal of the generic runtime bridge is deferred.
- Modify: `packages/web/src/api/index.ts` and `packages/web/src/ui/contexts/runtimeAPIContext.ts` / provider hooks - compose domain API interfaces from contract modules without broad state or subscription changes.
- Create: `packages/web/server/src/contracts/DOCUMENTATION.md` - route/domain index, dependency rule, validation rule, common error shape and stable codes, protocol compatibility value, HTTP/SSE/WS frames, authentication/Origin/CSRF expectations, replay/stall/reconnect/expiry behavior, partial-failure conventions, and future-shell integration guidance.
- Modify: `packages/web/server/src/domains/{fs,git,github,quota,skills-catalog,opencode,ui-auth}/DOCUMENTATION.md` and create concise docs for terminal/event-stream/settings/notifications where absent - link to the authoritative contracts and state domain-specific invariants rather than copying types.
- Modify: `AGENTS.md` architecture/documentation map and active contributor guidance - direct new wire behavior to domain contracts and prohibit route-local DTO duplication/unchecked browser response casts.
- Create: `scripts/check-network-contracts.mjs` and root `check:contracts` script - reject domain wire DTO definitions in the bulk API file, imports from Express/Node/DOM/SDK/process modules in `server/src/contracts`, browser imports of server services/routes/internal types, blanket contract casts/suppressions, uncovered route inventory entries, duplicate error codes, and undocumented contract modules. Scan browser `dist/**` and its browser dependency graph for `node:`, Express, server-service, or raw source-only contract leakage. The published web tarball intentionally includes `server/**`; validate its browser assets strictly while allowing Node imports in the server artifact.
- Create: `packages/web/server/src/contracts/contract-matrix.test.ts` - matrix covering one success, invalid input, authorization failure, safe unknown exception, and representative partial failure for every maintained domain; verify error-code uniqueness/stability, status/header compatibility, and compatibility metadata.
- Update: `.superpawers/plans/2026-07-20-domain-network-contracts.md`, parent spec, and active `.superpawers/OVERVIEW.md` only after independent review and verification.

**Constraints:**
- Preserve the generic runtime API bridge until a later plan proves it can be removed; it may aggregate interfaces but must not own wire DTOs.
- Do not include Express, browser APIs, SDK clients, filesystem types, shell globals, or process handles in contract modules.
- Existing historical changelog/plans/specs remain untouched.
- Final verification uses the correct Vitest runners and the established PID-safe integration harness.

**Dependencies:**
- Tasks 1-4 and a fresh integrated review with no accepted material findings.

**Proof:**
- Ownership audit reports zero violations. Frozen install, clean-dist type-check, canonical build, all contract/server/store/React/performance/web/integration tests, package/install/CLI checks, docs validation, and `scripts/verify.sh` complete; inherited lint may remain only without increased counts or new categories. Plan parser reports terminal status and parent `domain-network-contracts` completed with sibling chunks unchanged.

## Required Verification Commands

Use the repository’s declared runners; do not run Vitest files through `bun test`.

- `bun install --frozen-lockfile`
- remove only ignored `packages/session-state/dist`, `packages/web/dist`, and `packages/web/server/dist`, then `bun run type-check` to prove clean-checkout source resolution
- `bun run build`
- `bun run check:contracts`
- `bun run --cwd packages/web test -- src server/src/contracts server/src/domains/event-stream server/src/domains/fs server/src/domains/settings server/src/domains/security server/src/domains/ui-auth server/src/domains/git server/src/domains/github server/src/domains/quota server/src/domains/terminal server/src/domains/opencode server/src/domains/notifications server/src/domains/session-folders server/src/domains/magic-prompts server/src/domains/routes` (the `src` target includes the named MCP, session-folder, magic-prompt, terminal, store, and API browser contract tests)
- `bun run --cwd packages/session-state test`
- `bun run test:stores`
- `bun run test:react`
- `bun run test:perf`
- `bun run test:web`
- `bun run test:integration`
- `bun run build:web-server`
- `bun run docs:validate`
- `bun test scripts/bump-version.test.mjs scripts/runtime-release-contract.test.mjs`
- `npm pack --workspaces=false` in `packages/session-state` and `packages/web`, clean external installation/import, `startWebUiServer` export, and CLI `--help` proof
- `docker build --target runtime .` when Docker is available; otherwise record the exact unavailable command error and make no pass claim
- `scripts/verify.sh`, with a separate fresh `bun run lint` count comparison against the inherited baseline; type-check/build must pass and no workspace may increase errors/warnings or add a rule category

Before tracking closure, a fresh integrated reviewer must report no accepted material findings and a fresh verifier must report PASS. Then update only the plan, parent spec, and active overview: set plan `status: completed`, add `closed: 2026-07-20`, remove `next_action`, add nonempty structured `verification` frontmatter, check all five outcomes, and set only parent chunk `domain-network-contracts` to `Status: completed`. Run:

- `node /home/breadcat/.config/opencode/skills/superpawers/plan-management/scripts/plans.js plan .superpawers/plans/2026-07-20-domain-network-contracts.md`
- `node /home/breadcat/.config/opencode/skills/superpawers/plan-management/scripts/plans.js spec .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md`
- `node /home/breadcat/.config/opencode/skills/superpawers/plan-management/scripts/plans.js check .superpawers --json`, filtering diagnostics for this plan/chunk while recording unrelated legacy workspace diagnostics without modifying historical artifacts.
