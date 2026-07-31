---
kind: plan
status: superseded
base_branch: feature/lint-integration-readiness
created: 2026-07-27
updated: 2026-07-29
superseded_by: .superpawers/plans/2026-07-30-openchamber-completion-master-plan.md
next_action: Use the completion master plan as the authoritative implementation and verification record.
---

# Browser Regression and Deterministic OpenCode E2E Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpawers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Add a modern Playwright Test browser gate that catches the deployed PWA's auth-ordering, service-worker, missing-workspace, and BFCache regressions while providing a deterministic real-OpenCode/fake-model-provider path for later end-to-end workflow coverage.

**Design Reference:** Approved chat design: use Playwright Test with OpenChamber-specific fixtures and high-level flow helpers; keep Maestro as an optional later production-canary smoke tool, not the diagnostic browser gate.

## Approved Design Summary

- Use `@playwright/test` as a separate browser runner under `tests/browser`; do not force browser tests into the existing Vitest Node, happy-dom, or Bun store runners.
- Run a real built PWA against a real OpenChamber server and a real isolated OpenCode child. The fixture owns all startup and teardown and uses only PID-targeted cleanup already permitted by the repository.
- Extend the OpenCode test helper to isolate persistent data/config/state/cache directories and optionally write a temporary `opencode.json` provider configuration. Never inherit or modify the developer's OpenCode database.
- Add a local Node HTTP fixture implementing the OpenAI-compatible chat-completions streaming protocol. OpenCode points a temporary provider at it through `provider.*.options.baseURL`; the fixture emits deterministic text/tool/error/delay scenarios without external credentials or network access.
- Defer authenticated `/api/*` work until the auth gate has succeeded; preserve local appearance initialization without protected network calls. Stop the service worker from intercepting or caching `/api/*` responses.
- Treat persisted BFCache suspension as a lifecycle state: pagehide suspends the event pipeline without reporting a network failure, persisted pageshow resumes it silently, and genuine transport failures retain existing reconnect behavior.
- Treat missing historical workspaces as recoverable UI state, not a repeated error loop; do not delete session history automatically.
- The existing `/connect` registrar gap is a separate server integration regression and must be covered/fixed in this plan because it is observable on the deployed canary.
- Existing polluted OpenCode records under the user's real database are outside this plan and require a separate explicit backup/prune authorization.

### Task 1: Establish Playwright runner and isolated process fixtures

- [x] **Outcome:** A separate Playwright browser project can start a real isolated OpenCode/OpenChamber pair, serve the built PWA, authenticate through the UI, and always clean up its own resources without touching user OpenCode state.

**Files and anchors:**
- Modify: `tests/package.json` — own the `@playwright/test` dev dependency and add `test:browser`; do not add Playwright to `packages/web` or change existing Vitest/Bun runner ownership.
- Create: `tests/browser/playwright.config.ts` — configure Chromium, deterministic retries/timeouts, trace/screenshot/video-on-failure, and the browser test web target.
- Create: `tests/browser/fixtures/openchamber.ts` — provide `isolatedOpenCode`, `openchamber`, `page`, and high-level `login`/`logout` fixtures with worker-scoped startup and guaranteed teardown. Start the built server through the CLI-owned foreground entry, `bun run --cwd packages/web bin/cli.js serve --port <allocated-port> --host 127.0.0.1 --foreground`, with child-handle/PID cleanup only.
- Modify: `tests/helpers/opencode-process.ts` — add isolated `HOME`, `XDG_CONFIG_HOME`, `XDG_DATA_HOME`, `XDG_STATE_HOME`, `XDG_CACHE_HOME`, `OPENCODE_DATA_DIR`, and per-worker log/config directories under one worker-owned temporary root, plus optional temporary `opencode.json` writing; retain PID files, sibling watchdog, and exact-PID cleanup.
- Create: `tests/browser/support/server-process.ts` — spawn the built OpenChamber CLI foreground entry with `OPENCHAMBER_DATA_DIR` set to a separate worker directory, `OPENCHAMBER_UI_PASSWORD` set to the fixture-only password, `OPENCODE_HOST` set to the isolated OpenCode URL, `OPENCODE_SKIP_START=true`, `OPENCHAMBER_SKIP_OPENCODE_START=true`, and `OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION=true`; poll the owned child port for readiness and dispose only that child handle.
- Modify: `packages/web/server/src/index.ts` and its startup option/type seam — honor `OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION=true` only as the fixture-controlled opt-out for the existing fire-and-forget Zen validation; production defaults remain unchanged.
- Create: `tests/browser/smoke.spec.ts` — prove built app load, password login, authenticated session, and fixture teardown.
- Modify: `tests/README.md` and create `tests/browser/README.md` — document runner ownership, required build/OpenCode prerequisites, fake-provider modes, and PID-safe cleanup.

**Constraints:**
- No `pgrep`, `pkill`, `killall`, process-name matching, broad port killing, or cleanup of unrelated PIDs.
- No real model provider, external API key, network dependency, or secret committed to the repository.
- Do not run browser tests against `better.breadcat.cc` by default; the default target is a local isolated fixture. A separately authorized canary smoke may use an explicit URL.
- Do not alter the existing `tests/web` process harness until the isolation change is proven compatible.
- OpenCode startup validation must use the explicit test seam `OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION=true` in the browser server fixture; the child bootstrap assertion is the no-external-network proof for this startup fetch, and no parent-observed child network allowlist is required.

**Dependencies:** None.

**Proof:** Playwright smoke passes against a production build; fixture teardown leaves no owned process or temporary state; an isolation test proves the child receives distinct XDG/OpenCode paths and no user database path; a server bootstrap test proves the child-controlled `OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION=true` branch is entered and the external Zen validator is not invoked; existing `bun run test:web` remains green.

### Task 2: Add deterministic fake-model provider and OpenCode workflow fixture

- [x] **Outcome:** Real OpenCode can produce deterministic streamed assistant output, tool-call states, and controlled provider failures through a local fake OpenAI-compatible API.

**Files and anchors:**
- Create: `tests/browser/support/fake-openai-provider.ts` — Node HTTP server for `/v1/models` and `/v1/chat/completions`, with scripted scenarios for streamed text deltas, tool calls, delayed chunks, 429/500, malformed SSE, and abrupt disconnect. Require `Authorization: Bearer browser-test-key`; expose deterministic `setScenario()` control from the fixture and assert the request model is `test-model`.
- Create: `tests/browser/support/fake-openai-provider.test.ts` — test protocol framing, scenario selection, cleanup, and no external network access.
- Modify: `tests/helpers/opencode-process.ts` — accept an optional temporary config and write this exact isolated project config before spawn: provider ID `browser-test`, model ID `test-model`, `api: "openai"`, `options.baseURL: "http://127.0.0.1:<fake-port>/v1"`, `options.apiKey: "browser-test-key"`, and a `models.test-model` declaration. Preserve it only inside the isolated fixture directory.
- Create: `tests/browser/opencode-chat.spec.ts` — real browser → OpenChamber → OpenCode → fake provider flow covering deterministic streamed output and one tool-call lifecycle.
- Modify: `tests/README.md` — document built-in `noop` for transport-only tests and the local fake provider for model-shaped workflows.

**Constraints:**
- OpenCode remains real; only the upstream model HTTP service is fake.
- The fake provider speaks the narrow protocol OpenCode actually requests and asserts request shape so tests fail on integration drift. Text responses use OpenAI chunk SSE frames followed by `data: [DONE]`; tool scenarios emit `delta.tool_calls` for the declared `browser_test_tool` and terminate with `finish_reason: "tool_calls"`; controlled errors terminate with the declared HTTP status or connection close.
- Use synthetic `part.update()` only for provider-independent storage/event tests; do not describe it as model E2E.
- Avoid arbitrary sleeps; wait for observable SSE/DOM/event conditions.

**Dependencies:** Task 1.

**Proof:** Fake provider protocol tests pass; browser flow observes deterministic assistant deltas and tool state through the actual UI; error scenarios produce stable UI failure behavior; no credentials or external requests are used.

### Task 3: Fix authentication ordering and service-worker API policy

- [ ] **Outcome:** An unauthenticated browser mount makes no protected API calls, and the service worker neither intercepts nor caches authenticated `/api/*` traffic or rejects FetchEvents.

**Files and anchors:**
- Modify: `packages/web/src/ui/main.tsx` and the auth/provider composition around `SessionAuthGate` — keep only synchronous/local appearance initialization before the gate; remove the pre-gate `syncSettings()` call. Move `ThemeSystemProvider` and `ThemeProvider` inside `SessionAuthGate`, and invoke `syncSettings()` from the authenticated subtree/effect after the gate succeeds. The pre-auth allowlist is limited to `/auth/session`, passkey status/options/verify, static assets, and navigation; do not offer an alternative auth-status-prop design in this task.
- Modify: `packages/web/src/sw.ts` — bypass `/api/*` requests entirely so the browser handles authentication, freshness, and failures; retain static asset/image/navigation caching and offline fallback behavior.
- Create: `tests/browser/auth-ordering.spec.ts` — assert zero protected API requests before successful `/auth/session`/password login, then assert bootstrap requests begin after authentication.
- Create: `packages/web/src/sw.test.ts` or an equivalent browser-owned service-worker contract test — prove API requests are not handled by the cache strategy and no rejected `respondWith` promise is produced.
- Create: `tests/browser/service-worker.spec.ts` — verify the production PWA has a service worker, API requests remain network-owned, and failed API requests do not emit rejected FetchEvent/page errors.

**Constraints:**
- Preserve server-side 401 behavior; do not weaken auth to hide frontend sequencing.
- Never cache user-authenticated API responses in the service worker.
- Respect mobile-first provider composition; mobile and desktop must share the same auth-safe lifecycle.

**Dependencies:** Task 1.

**Proof:** RED/GREEN auth-ordering and service-worker tests; browser console/request guard reports no unexpected pre-auth API or rejected FetchEvent; existing React, web, and type-check suites pass.

### Task 4: Make missing workspaces and BFCache transport lifecycle quiet and recoverable

- [ ] **Outcome:** Deleted historical workspace paths do not create repeated noisy probes, and BFCache pagehide/pageshow does not report a transient WebSocket closure as a user-visible transport failure.

**Files and anchors:**
- Modify: `packages/web/src/ui/sync/event-pipeline.ts` — add persisted `pagehide` suspension and persisted `pageshow` resume around `runWsAttempt`; suppress disconnect/error reporting while suspended, preserve `lastEventId`, and keep genuine close/error reconnect behavior unchanged.
- Modify: `packages/web/src/ui/stores/globalSessions.ts`, `packages/web/src/ui/sync/child-store.ts`, `packages/web/src/ui/sync/sync-context.tsx`, `packages/web/src/ui/components/session/sidebar/hooks/useDirectoryStatusProbe.ts`, and the owning directory/session presentation seam — add one shared directory availability state (`exists | missing | checking | unknown`) keyed by normalized directory, expose it to `ChildStoreManager`/bootstrap, and classify a 404 probe as unavailable history. Bootstrap must consult this state before `runBootstrap`, skip its five-attempt empty-session retry/toast for a known-missing directory, retain the session record, and allow one bounded re-probe on explicit user navigation or the existing cache interval.
- Create: `packages/web/src/ui/sync/event-pipeline.bfcache.test.ts` — deterministic pagehide/pageshow, abrupt close, resume, replay, and cleanup coverage.
- Create: `tests/browser/bfcache.spec.ts` — use one real same-origin navigation followed by Playwright `goBack()`; require observed `pagehide.persisted === true` and `pageshow.persisted === true` events (fail if the browser does not produce a persisted transition), then assert silent reconnect, preserved replay position, and no unexpected console/network failures. Do not replace this with synthetic lifecycle dispatch.
- Create: `tests/browser/missing-workspace.spec.ts` — seed a session pointing at a removed isolated workspace and assert a stable unavailable state with bounded requests and no repeated error storm.

**Constraints:**
- Preserve event ordering, replay/gap recovery, delta coalescing, and mobile shell behavior.
- Do not silently prune historical sessions or mutate OpenCode storage.
- Use observable lifecycle events and bounded retry assertions, not fixed-delay flake masking.

**Dependencies:** Task 1 and Task 3.

**Proof:** Unit lifecycle tests and browser BFCache/missing-workspace specs pass with request/console guards; existing event-pipeline and integration suites remain green.

### Task 5: Restore and prove the `/connect` route ownership seam

- [ ] **Outcome:** The deployed composition registers `/connect` through its owning registrar, preserving its authenticated/expired-link behavior instead of falling through to SPA HTML.

**Files and anchors:**
- Create: `packages/web/server/src/domains/routes/connect-route.ts` — own the single `/connect` handler registrar and its explicit tunnel/UI-auth/settings/TTL dependencies.
- Modify: `packages/web/server/src/domains/bootstrap/bootstrap-runtime.ts`, `packages/web/server/src/domains/routes/core-routes.ts`, `packages/web/server/src/domains/opencode/routes/core-routes.ts`, `packages/web/server/src/contracts/route-inventory.ts`, and `packages/web/server/src/contracts/route-inventory.test.ts` — make `domains/routes/core-routes.ts` the sole active `/connect` owner by invoking `registerConnectRoute` from the active bootstrap composition; remove the duplicate registration from the OpenCode core registrar and update inventory/source assertions to the shared route owner. Do not invoke the entire OpenCode core registrar or copy the handler body. Preserve the existing `tunnelAuthController`, `uiAuthController`, settings, TTL, status, and expired-link behavior through the shared seam.
- Modify: `packages/web/server/src/domains/opencode/routes/core-routes.test.ts` and `packages/web/server/src/__tests__/bootstrap.test.ts` — assert `/connect` is registered and invalid/expired links retain the existing safe response.
- Create: `tests/web/connect-route.test.ts` — real OpenChamber/OpenCode integration proof that `/connect` does not fall through to SPA HTML.

**Constraints:** Preserve auth boundaries and existing connect-link semantics; do not broaden route registration or change unrelated startup ordering.

**Dependencies:** Task 1.

**Proof:** Route inventory and focused server tests pass; real server integration returns the expected connect-link response rather than `text/html` SPA fallback.

### Task 6: Add the integrated browser quality gate and documentation

- [ ] **Outcome:** The repository has one documented command for the local Playwright browser gate, with deterministic diagnostics and safe CI/manual execution guidance.

**Files and anchors:**
- Modify: `package.json`, `tests/package.json`, and runner ownership documentation — add browser test scripts without mixing Playwright files into Vitest or Bun discovery.
- Modify: `scripts/verify.sh` only if the approved quality-gate policy requires the browser lane; keep environment-dependent browser/OpenCode execution as an explicit reliable lane rather than silently making the base script flaky.
- Create/modify: `tests/browser/README.md`, root `AGENTS.md`, and relevant PWA/test documentation — document build prerequisites, Chromium installation, fake-provider scenarios, process cleanup, local vs canary target, and no-user-database guarantees.
- Create: `tests/browser/fixtures/diagnostics.ts` — shared console/page/request/service-worker failure classification with explicit allowlists for expected auth 401s and controlled failure scenarios.

**Constraints:** No browser test may use process-name matching or mutate the live canary by default. Keep existing runner ownership assertions current. Record skipped infrastructure honestly when Chromium/OpenCode is unavailable.

**Dependencies:** Tasks 1–5.

**Proof:** `bun run test:browser`, package/type/build checks, existing `test:web` and `test:integration`, docs validation, diff hygiene, and a clean-run diagnostic report all pass.

## Review and verification decision

Select an independent integrated review after implementation because this crosses authentication, service-worker caching, WebSocket lifecycle, real-process isolation, and browser-runner ownership. The review must specifically check that tests fail on the original console symptoms, that fake-provider E2E remains real OpenCode integration, and that cleanup cannot touch the user's OpenCode process or database.

The final comprehensive gate runs after review and includes the Playwright browser lane plus the existing server, web, integration, type-check, build, docs, and contract checks. Existing repository-wide lint debt is compared against the preserved baseline and is not silently expanded into this slice.
