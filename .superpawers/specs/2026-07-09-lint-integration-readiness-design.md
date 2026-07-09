# Lint & Integration Readiness — Design Spec

> **Status:** Approved design (user-approved 2026-07-09). Ready for subplan decomposition.
> **Branch:** `feature/lint-integration-readiness`
> **Baseline commit:** `7f82984c` on `main`

---

## 1. Context & Goal

OpenChamber has gone through an aggressive decoupling and refactor wave (store splits, domain extraction, shell-runtime seam tests). Type-checking passes cleanly across all 6 packages, but two blockers prevent `scripts/verify.sh` from passing and block integration test confidence:

1. **Lint fails with 649 errors** across `@openchamber/web`, `@openchamber/ui`, and `@openchamber/tests`. The dominant category is `@typescript-eslint/no-explicit-any` (495 errors, 76% of all errors), concentrated almost entirely in `packages/web/server/`.
2. **Integration tests cannot run** — `bun run test:web` and `bun run test:opencode` time out in `beforeAll` because `waitForHttp()` in `tests/helpers/opencode-process.ts` issues `fetch()` calls without per-request timeouts, allowing a single stuck fetch to block for 21–127s (OS TCP timeout) and blow past the vitest hook timeout.

**Goal:** Eliminate `any` usage wherever feasible (user directive: "eliminate any usage wherever possible entirely"), clear remaining lint errors, and fix integration test startup readiness so the full verification ladder passes.

**Success criteria:**
- `bun run lint` exits 0 (0 errors) — warnings are out of scope.
- `bun run type-check` continues to pass.
- `bun run test:stores`, `test:react` continue to pass.
- `bun run test:web`, `test:opencode`, and `test:integration` pass without startup timeouts.
- No blanket `eslint-disable`, no broad rule disables, no replacing `any` with unsafe aliases (e.g. `Function`, `object` used as escape hatches).

---

## 2. Scope

### In Scope
- **`@typescript-eslint/no-explicit-any` (495 errors, 27 files):** Replace with concrete types, SDK/API types, `unknown` with narrowing, generics, or localized adapter types. The vast majority (~490) are in `packages/web/server/`; 6 are in `tests/react/mocks/`.
- **Other blocking lint errors (~154):** `no-unused-vars` (112), `ban-ts-comment` (10), `no-unsafe-function-type` (10), `no-empty` (7), `no-empty-object-type` (2), `no-require-imports` (2), `react-hooks/rules-of-hooks` (2), `prefer-const` (3), `no-extra-boolean-cast` (1), `no-useless-escape` (1).
- **Integration startup fix:** Bounded per-request timeout in `waitForHttp()`.

### Out of Scope
- **Warnings:** `complexity` (1045 warnings), `max-lines` (88 warnings), and all other warning-only rules are explicitly out of scope. These are refactoring-level changes, not type-safety fixes.
- **Subdomain store unit tests** (git, files, agents, etc.) — known coverage gap predating this work.
- **Functional/behavioral changes** — this is a type-safety and test-infrastructure effort, not a feature change. No runtime behavior should change.

---

## 3. Non-Goals & Guardrails

| Rule | Rationale |
|------|-----------|
| No blanket `eslint-disable` or per-file rule disables | Defeats the purpose; hides debt instead of fixing it |
| No replacing `any` with unsafe aliases (`Function`, `object`, `{}`) | Trades one lint error for another; not real type safety |
| Prefer `unknown` + narrowing for genuinely opaque boundaries | Type-safe escape hatch when no concrete type exists |
| Remove `eslint-disable` comments in `packages/ui` that suppress `any` where the `any` can now be properly typed | The 0 active `any` errors in ui are suppressed via comments — fix the underlying type where feasible |
| No `pgrep`/`pkill`/`killall` or name-based process matching in test harness | AGENTS.md HARD RULE; cleanup is PID-file/watchdog based only |
| No functional behavior changes | Type annotations and test infra only |

---

## 4. Approach: Risk-Tiered, Integration-First

The work is ordered to unblock the integration feedback loop first, then attack lint debt from lowest-risk/mechanical to highest-risk/domain-specific.

**Why integration first:** The lint cleanup will need verification runs. If `test:web`/`test:opencode` are broken, every intermediate lint verification is incomplete. Fixing the 2-line integration blocker first means subsequent lint phases can run the full verification ladder.

**Why risk-tiered (not package-by-package):** Mechanical Express route typing (~200 errors) is low-risk and high-volume — clearing it early reduces the error count significantly with near-zero chance of introducing type errors. The hard API-boundary work (`settings/types.ts`, WebAuthn) is isolated and small but needs design judgment — doing it last lets the bulk of mechanical work proceed quickly.

---

## 5. Phase 1 — Integration Startup Readiness

**Problem:** `tests/helpers/opencode-process.ts:183-198` — `waitForHttp()` calls `fetch()` without a per-request timeout. A single stuck fetch (TCP SYN retransmit while `opencode serve` binds but doesn't yet serve) blocks for 21–127s, making the outer deadline loop ineffective.

**Fix:** Add `AbortSignal.timeout(2_000)` to each `fetch()` call. This is a 2-line insertion. `AbortSignal.timeout()` is native in Node ≥19; the project requires ≥20.

```typescript
// Target state for waitForHttp (tests/helpers/opencode-process.ts:183-198)
async function waitForHttp(baseUrl: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const urlPath of ["/health", "/"]) {
      try {
        const response = await fetch(`${baseUrl}${urlPath}`, {
          signal: AbortSignal.timeout(2_000),
        })
        if (response.status < 500) return
      } catch (error) {
        lastError = error
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw lastError ?? new Error("Timed out waiting for OpenCode HTTP endpoint")
}
```

**Precedent:** `tests/web/sse-events.test.ts:18-49` already uses `AbortController` + `setTimeout` for per-request timeout. `AbortSignal.timeout()` is the modern equivalent.

**Timeout value rationale:** 2_000ms. OpenCode starts locally; TCP handshake completes in <50ms. 2s is generous for a local process under load. With 15s deadline, 100ms between retries, 2 URLs per iteration: ~105 attempts per URL, each bounded to 2s.

**Verification:** `type-check` → `test:opencode` (faster, 10 files) → `test:web` (7 files, the currently-broken suite) → `test:integration` (full 17 files).

**Safety:** All existing cleanup (PID recording, orphan reaper, sibling watchdog, `process.on("exit")` safety net) is preserved unchanged. No name-based process matching introduced.

---

## 6. Phase 2 — Mechanical Express Route Handler Types (~100 errors)

**Files:** `core-routes.ts` (49), `skill-routes.ts` (69 — partial, route handler portion), `project-icon-routes.ts` (16), `opencode/routes/routes.ts` (16), `git/routes.ts` (1), `openchamber-routes.ts` (8), `feature-routes-runtime.ts` (10), `static-routes.ts` (1), `opencode/routes/core-routes.ts` (5).

**Pattern:** Route handlers typed as `app: any`, `req: any`, `res: any`, `next: any`.

**Remediation:** Import Express types (`Express`, `Request`, `Response`, `NextFunction`) and replace `any` params. Pure type-import changes, zero runtime risk.

**Risk:** Low. Express is already a dependency. The type imports are standard.

---

## 7. Phase 3 — Trivial `any` → `unknown`/`string`/narrowing (~15 errors)

**Files:** `opencode-support/watcher.ts` (4), `event-stream/runtime.ts` (1), `quota/providers/zhipuai.ts` (2), `fs/routes.ts` (1), `scheduled-tasks/runtime.ts` (1), `web/src/api/notifications.ts` (7), `opencode/services/mcp.ts` (2).

**Patterns:** `callback: any` → typed callback; `(error: any)` → `(error: unknown)` with narrowing; `body: any` → typed body; `(_ignoredName: any)` → `string`.

**Risk:** Low. Mechanical narrowing changes.

---

## 8. Phase 4 — Git Service Internal Helpers (140 errors)

**File:** `packages/web/server/src/domains/git/service.ts` — the single highest-concentration file (28% of all `any` errors).

**Three sub-patterns:**

| Sub-pattern | Count | Remediation |
|-------------|-------|-------------|
| Function params typed `any` | ~78 | Type as `string`, `string \| undefined`, or domain types (`ProjectID`, `WorktreePath`). Internal helpers with clear call-site contracts. |
| Array callback `any` annotations | ~33 | Use `unknown` + narrowing, or the array's inferred element type. Bodies often already do `typeof` checks. |
| `as any` casts (`(status as any)?.tracking`) | ~35 | Replace with proper type assertions to known types. |

**Risk:** Medium. Requires understanding param contracts from call sites, but the functions are internal helpers with well-known argument shapes.

---

## 9. Phase 5 — GitHub Routes & PR Status (~69 errors)

**Files:** `github/routes.ts` (48), `github/pr-status.ts` (21).

**Patterns:** `catch (error: any)` → `catch (error: unknown)` with type guard; `Record<string, any>` → Octokit response types or explicit PR metadata types; `.map((item: any) => ...)` → typed transformations.

**Remediation:** Octokit types are available (it's a dependency). Use `Record<string, unknown>` for opaque API payloads where exact field shapes are uncertain. Define explicit PR status types for fields the code actually reads.

**Risk:** Medium. Octokit types cover most response shapes; some PR metadata fields may need local type definitions.

---

## 10. Phase 6 — Server Bootstrap Runtime Adapters (52 errors)

**File:** `packages/web/server/src/index.ts`.

**Patterns:**
- `let uiAuthController: any = null` — mutable runtime references.
- `const openCodeRuntime: any = new Proxy(...)` — Proxy wrapper around runtime.
- `(runtime as any)[prop]` — `as any` casts on Proxy access (lines 401, 408, 414).
- `Set<any>`, `Record<string, any>` — ad-hoc aggregation.
- `(createSessionRuntime as any)({...})` — function call casts.

**Remediation:**
- Runtime references: type with their actual interface types (most runtime creators export return types).
- Proxy access: define a typed interface for the runtime surface and assert to it.
- `Set<any>`/`Record<string, any>`: type with concrete element/value types.
- Function call casts: use generics or proper type assertions.

**Risk:** Medium-high. Proxy wrappers and ad-hoc runtime aggregation may need adapter types. Some casts may indicate genuine type gaps in the SDK interface.

---

## 11. Phase 7 — UI Auth / WebAuthn Boundary (14 errors)

**Files:** `ui-auth.ts` (4), `ui-passkeys.ts` (10).

**Patterns:**
- `payload: any` in route handlers → Express `Request` body typing.
- `.transports as any` for WebAuthn serialization (ui-passkeys.ts:431, 562, 627) — known TS limitation with WebAuthn transport arrays.
- `(req as any).socket?.encrypted` → Express type extension or `Request` typing.
- `(settings as any)?.publicOrigin` → settings type.

**Remediation:** Express types for route handlers. WebAuthn `.transports` may need a localized type assertion utility if the `@simplewebauthn` types don't expose transports cleanly.

**Risk:** Medium. WebAuthn TS gaps may require a narrowly-scoped assertion helper (not a blanket disable).

---

## 12. Phase 8 — Settings API Boundary (21 errors)

**Files:** `settings/types.ts` (13), `settings/themes.ts` (8).

**Patterns:**
- `settings/types.ts`: function signatures like `normalizeSettingsPaths(input: any): { settings: any; changed: boolean }`, `sanitizeSettingsUpdate(payload: object): any`, `mergePersistedSettings(current: any, changes: any): any`, `formatSettingsResponse(settings: any): any`. These are true API boundary types — each `any` is a complex settings object.
- `settings/themes.ts`: `const cssVariables: Record<string, any>` — values are always CSS strings → `Record<string, string>`.

**Remediation:**
- `themes.ts`: Trivial — `Record<string, string>`.
- `types.ts`: Define the settings object shape as an explicit interface. This is the most costly refactor because it requires understanding the full settings schema. If the schema is too fluid, define a `SettingsRecord` type that captures the known fields and uses `Record<string, unknown>` for forward-compat extensions.

**Risk:** High. This is the one phase where real schema design judgment is needed.

---

## 13. Phase 9 — Remaining Non-`any` Lint Errors (~154 errors)

After all `any` is eliminated, clear the remaining blocking errors:

| Rule | Count | Fix | Risk |
|------|-------|-----|------|
| `no-unused-vars` | 112 | Remove dead imports. ~20 test files + store/component files. | Low (mechanical) |
| `ban-ts-comment` | 10 | `@ts-ignore` → `@ts-expect-error` in `open-code-runtime.ts` (7), `git/service.ts` (3) | Low |
| `no-unsafe-function-type` | 10 | `Function` → explicit callback signatures in `bootstrap/types.ts` | Low |
| `no-empty` | 9 | Add comments or remove empty blocks in `shutdown-runtime.ts`, `openchamber-routes.ts`, `server-utils/proxy.ts` | Low |
| `no-empty-object-type` | 2 | `interface Deps {}` → typed or `Record<string, never>` in `git/routes.ts`, `github/routes.ts` | Low |
| `no-require-imports` | 2 | Convert to ESM imports | Low |
| `react-hooks/rules-of-hooks` | 2 | Move `useState`/`useMemo` before early return in `MobileSessionStatusBar.tsx:1462-1463` | Medium (hook ordering correctness) |
| `prefer-const` | 5 | `let` → `const` | Low |
| `no-extra-boolean-cast` | 1 | Remove redundant `!!` | Low |
| `no-useless-escape` | 1 | Remove unnecessary escape | Low |
| `tests/react/mocks/tanstack-react-virtual.ts` (6 `any`) | 6 | Type the mock | Low |

---

## 14. Verification Strategy

Every phase must pass this ladder before the phase is considered complete:

| Step | Command | Gate |
|------|---------|------|
| 1 | `bun run type-check` | 0 errors (all packages) |
| 2 | `bun run lint` (or focused: `bun run --filter '@openchamber/web' lint`) | Error count must not increase; target 0 by final phase |
| 3 | `bun run test:stores` | 240 tests pass |
| 4 | `bun run test:react` | 72 tests pass |
| 5 | `bun run test:opencode` | Pass (requires Phase 1 fix) |
| 6 | `bun run test:web` | Pass (requires Phase 1 fix) |
| 7 | `bun run test:integration` | Full suite passes |

Steps 5–7 are only valid after Phase 1. Phases 2–9 verify primarily with steps 1–4, running steps 5–7 at phase boundaries or final verification.

**Final verification:** `scripts/verify.sh` (type-check + lint + build) must pass.

---

## 15. Subplan Decomposition Guidance

This spec is expected to decompose into multiple implementation plans. Suggested split:

| Subplan | Phases | Rationale |
|---------|--------|-----------|
| **A: Integration Readiness** | Phase 1 | Standalone, unblocks all test runs, small and focused |
| **B: Mechanical `any` Cleanup** | Phases 2 + 3 + themes.ts + test mocks | Low-risk bulk; ~121 errors; one implementer can do this |
| **C: Git Service Typing** | Phase 4 | Largest single file (140 errors); isolated to one file; needs call-site analysis |
| **D: GitHub/Octokit Typing** | Phase 5 | Two files, shared Octokit type knowledge |
| **E: Server Bootstrap** | Phase 6 | One file, Proxy complexity, may need adapter types |
| **F: UI Auth + Settings Boundary** | Phases 7 + 8 | Smallest cluster + highest-risk schema work; ~35 errors |
| **G: Remaining Non-`any` Errors** | Phase 9 | Mechanical sweep to 0 errors |

Each subplan should be independently verifiable and committable.

---

## 16. Baseline Metrics (for progress tracking)

| Metric | Baseline (pre-work) | Target |
|--------|---------------------|--------|
| `no-explicit-any` errors | 495 | 0 |
| Total lint errors | 649 | 0 |
| Files with `any` errors | 27 | 0 |
| `test:web` | FAIL (timeout) | PASS |
| `test:opencode` | Not run (would fail) | PASS |
| `test:integration` | Not run (would fail) | PASS |
| `type-check` | PASS | PASS |
| `test:stores` | PASS (240) | PASS |
| `test:react` | PASS (72) | PASS |
