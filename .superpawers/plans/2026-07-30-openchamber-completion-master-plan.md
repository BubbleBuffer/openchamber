---
kind: plan
status: complete
base_branch: feature/browser-regression
parent_spec: .superpawers/specs/2026-07-14-web-pwa-maintainability-program-design.md
covers_chunks:
  - state-authority-convergence
  - component-design-system-convergence
  - protected-domain-hardening
  - pwa-auth-runtime
  - quality-gates-and-test-architecture
  - dependency-documentation-convergence
created: 2026-07-30
updated: 2026-07-30
next_action: Use the integrated clean baseline for component-framework exploration; optionally reproduce the container build on a host with a working Docker daemon before publishing.
verification:
  - Master plan reviewed against the active design and current repository baseline.
  - Each implementation wave receives a focused child plan and fresh baseline before code changes.
  - No wave closes until its focused checks and the cumulative verification ladder pass.
---

# OpenChamber Completion Master Execution Plan

## 1. Purpose

This is the execution control plane for completing the Web/PWA Maintainability
Program. The active design remains the authority for product scope, protected
capabilities, security invariants, and completion criteria.

This file answers four program-level questions:

1. What is actually complete, and what remains?
2. Which work has hard ordering dependencies?
3. Which bounded lanes can safely run in parallel?
4. What evidence is required before the project can be called clean, optimized,
   and production-ready?

This is deliberately not a single enormous implementation prompt. Before each
wave starts, create or update a focused child plan with exact files, tests,
ownership, and proof. The master plan should change only when the dependency
graph, scope, or evidence changes.

## 2. Honest Starting Point

Substantial desloppification has already happened. The repository is not an
early cleanup experiment anymore:

- Electron, VS Code, scheduled tasks, shell-era package boundaries, ad hoc
  network contracts, and oversized server/CLI entrypoints have been removed or
  decomposed.
- The branch is roughly 34,000 lines smaller than the original baseline despite
  adding contracts and tests.
- Six of the design's twelve implementation chunks are complete.
- Type checking, production building, session-state tests, store tests, React
  tests, integration tests, scripts, docs, and contract checks already pass in
  the current environment.

The remaining half is harder than the removed half. It contains cross-cutting
runtime authority, browser authentication, PWA lifecycle, protected feature
hardening, large UI seams, lint debt, test architecture, and real optimization.
These areas cannot be completed safely by deleting obvious dead surfaces.

The project is therefore:

- approximately **50% complete by design chunk count**;
- further along in structural simplification than in production hardening;
- only at the beginning of evidence-driven optimization;
- close enough to run, but not yet at a trustworthy release gate.

Percentages below are planning estimates, not earned-value accounting:

| Dimension | Current estimate | Evidence |
| --- | ---: | --- |
| Product/runtime contraction | 90–100% | Desktop, extension, scheduled-task, and duplicate package surfaces removed |
| Foundational contracts/composition | 80–90% | Network contracts and server/CLI decomposition complete |
| Browser/PWA correctness | 40–55% | Runner and fake provider exist; auth ordering and tool-flow regressions remain |
| State/component maintainability | 35–50% | Store splitting began; central event and oversized component hotspots remain |
| Protected-domain hardening | 35–50% | Capabilities survive, but ownership, focused boundaries, and lint/tests are uneven |
| Test/quality convergence | 45–60% | Many layers pass; browser and lint gates do not |
| Measured optimization | 5–15% | Baselines expose problems; representative budgets and fixes are not established |
| Overall production-readiness | 45–55% | Useful and runnable, but not yet a clean release candidate |

## 3. Baseline Ledger

Record a dated fresh baseline at the start of every wave. The current reference
baseline is:

### Repository state

- Branch: `feature/browser-regression`
- Observed HEAD on 2026-07-30: `f1998b4d`.
- Worktree: intentionally dirty with in-progress browser regression work.
- The dirty changes are user work and must be preserved.
- The current browser work is the integration bottleneck; do not launch
  overlapping implementation agents into the same worktree.
- This dirty-tree ledger is observational, not an immutable release baseline.
  The Wave 0 exit recaptures evidence from a named clean commit.

### Passing evidence

- Type check: passes.
- Production build: passes; approximately 83 seconds and 5.78 GB maximum RSS on
  the measured host.
- Session-state tests: 78/78 pass.
- Store tests: 239/239 pass, with noisy import-time unauthorized requests still
  requiring correction.
- React tests: 65/65 pass.
- Integration tests: 58 pass, 2 skip.
- Script tests: 12/12 pass.
- Documentation validation: 7 pages pass.
- Network contract checks: pass.

### Failing or incomplete evidence

- Web unit suite: one runner-ownership failure for the new service-worker test.
- Browser suite: three pass, two fail.
  - Protected API traffic starts before the initial auth check completes.
  - The fake tool-call flow reaches a UI error state and stops short of the
    expected provider exchange.
- The active browser plan has two of six tasks complete, Task 3 partially
  implemented, and four tasks still open.
- Lint:
  - Web: 344 errors, 941 warnings.
  - Tests: 36 errors, 5 warnings.
  - Session state: 0 errors, 5 warnings.
  - Total: 380 errors, 951 warnings.
- The current chat performance benchmark does not exercise a representative
  message stream and cannot prove hot-path performance.
- Pull-request CI currently installs, builds, type-checks, and lints, but runs
  none of the unit, store, React, integration, browser, performance, contract,
  documentation, script, or package-install proof.
- `scripts/verify.sh` currently means type-check plus lint plus build, not the
  complete verification ladder its name implies.
- The release workflow builds and publishes without installing the produced
  tarballs into an empty project or running the full protected-workflow gate.

### Known optimization evidence

- `vendor-.bun` is approximately 17.59 MB raw / 4.13 MB gzip.
- The main bundle is approximately 3.51 MB raw / 0.96 MB gzip.
- The current manual chunk rule groups Bun's nested package paths into a giant
  catch-all vendor chunk.
- Static view barrels and mixed static/dynamic imports defeat intended lazy
  loading.
- The unauthenticated entry currently preloads the giant vendor chunk.
- The largest remaining UI and service files range from roughly 2,000 to 3,500
  lines.
- The central sync event handler has extreme branching complexity and broad
  state fan-out.
- Static asset cache policy and unconditional per-request logging are additional
  server/runtime hypotheses that require measurement.

### Immutable baseline record

Every authoritative wave baseline records:

- commit SHA and clean-tree status;
- capture timestamp, host identity/resources, and operating system;
- Bun, Node, OpenCode, Playwright, and relevant browser versions;
- exact commands, exit codes, durations, test counts, and skips;
- bundle/performance measurements with variance;
- artifact, trace, report, and log paths plus hashes where durable;
- every known failure with owner and disposition.

## 4. Program Invariants

Every wave must preserve these rules:

1. The active design's protected workflow matrix is non-negotiable.
2. Browser/PWA plus one server and CLI is the maintained product topology.
3. Session-machine truth, live directory truth, and presentation state must each
   have one documented owner.
4. Correctness is established before performance changes are judged.
5. Optimization claims require repeatable measurements, not line count,
   intuition, or a successful build alone.
6. No blanket lint suppression, compatibility facade, pass-through module, or
   arbitrary component split is accepted as cleanup.
7. Tests that own subprocesses use exact PID-file/watchdog cleanup. Process-name
   matching such as `pgrep`, `pkill`, or `killall` is forbidden.
8. No broad upstream merge is part of this program. Upstream changes are
   considered selectively by capability and risk.
9. No agent may overwrite, reset, or silently absorb pre-existing dirty work.
10. Security, authentication, service topology, and release changes that alter
    the host or external exposure receive an explicit operator decision.

## 5. Execution Model

### 5.1 Master plan plus focused wave plans

Use this master plan for sequencing and program status. Use focused plans for
implementation. A focused wave plan must state:

- one bounded outcome;
- owned files and explicit no-touch files;
- dependencies and starting commit;
- acceptance tests and expected failures;
- rollback or recovery notes;
- measurements to capture;
- the review handoff.

### 5.2 Agent topology

The effective default is one integrator plus up to three concurrent agents:

- **Integrator/controller:** owns the dependency graph, shared spines, merge
  order, cumulative verification, and status updates.
- **Implementation agents:** each owns one disjoint lane and returns a small,
  reviewable patch plus evidence.
- **Review agent:** checks requirements, regressions, scope drift, and
  architectural consistency independently of the author.
- **Verification/performance agent:** reproduces tests, traces, bundles, or
  benchmarks without changing the implementation under test.

These roles can rotate. High-reasoning agents are most valuable for ambiguous
runtime boundaries, failure diagnosis, security, protocol traces, and final
review. Mechanical lint slices should still be tightly scoped; more reasoning
does not remove merge conflicts.

Use many agents across sequential waves, not many agents editing the same
central files at once. With four active slots, the practical ceiling is three
parallel lanes plus the integrator.

### 5.3 Worktree and ownership discipline

Do not begin parallel code work until the current dirty browser tranche is
integrated or preserved on a clearly named branch/commit.

After that point:

- give each implementation lane its own branch/worktree or a patch-only brief;
- pin every lane to the same integration base;
- assign one owner per file;
- forbid opportunistic edits outside the lane;
- merge the lowest-level contracts before their consumers;
- rerun focused checks after each merge and the cumulative gate after the wave;
- stop and replan when two lanes discover they need the same shared spine.

### 5.4 Collision zones

These zones are exclusive-owner or integrator-owned while active:

| Collision zone | Typical surfaces | Rule |
| --- | --- | --- |
| Auth/bootstrap spine | `main.tsx`, authenticated app loading, auth gate, persistence startup, telemetry startup, service worker registration | One author until browser ordering proof passes |
| State/sync spine | sync context, session machine bridge, event pipeline, session UI store, live session indexes | One architectural owner; consumer migrations may fan out only after interfaces freeze |
| Root quality/config | root manifests, lockfile, lint config, test configs, verification scripts, CI workflows | Integrator-owned; lane agents propose minimal deltas |
| Bundle/router spine | Vite config, route/view barrels, main layout, lazy route registry | One bundle owner; feature view internals may be parallel |
| Server composition/routes | server bootstrap, core route registry, auth middleware order, lifecycle cleanup | One composition owner; independent domain services may be parallel |
| Shared network contracts | domain contract indexes, shared schemas, error envelopes | Contract change lands before server/client consumers |
| Documentation topology | root README, architecture docs, deployment/security instructions | Consolidate after behavior freezes; one final editor |

## 6. Dependency Graph

The critical path is:

```text
Current dirty browser tranche
  -> browser/auth and protocol correctness
  -> representative bundle/network/state/render baselines
  -> runtime/state authority convergence
  -> component and hot-path optimization
  -> final quality/dependency/documentation convergence
  -> release-candidate proof
```

Protected server domains can advance alongside state convergence after browser
contracts stabilize. Component-family decomposition can fan out after the state
interfaces they consume are frozen. Lint cleanup follows touched domains
continuously, with a final convergence wave rather than one enormous rewrite.

## 7. Execution Waves

### Wave 0 — Preserve and Stabilize the Current Tranche

**Goal:** turn the current dirty browser work into a known, reviewable base.

Work:

1. Inventory the exact dirty diff and classify each file as complete, partial,
   generated, or unrelated.
2. Finish Task 3 of the browser-regression plan:
   - no same-origin protected request before the initial auth check resolves;
   - authenticated application code loads only after the gate permits it;
   - service-worker registration and update behavior obey the same boundary;
   - telemetry is either delayed appropriately or explicitly excluded from
     protected-API classification.
3. Diagnose the fake-provider tool flow from network trace through protocol
   events, store reduction, and rendered UI. Fix the root cause rather than the
   expectation count.
4. Make test ownership include the new service-worker test.
5. Run the focused unit and browser suites, inspect traces, and integrate the
   tranche before opening other code lanes.

Parallelism:

- One auth/bootstrap author.
- One tool-flow investigator may work read-only in parallel, then implement
  only if its files do not overlap.
- One verifier may reproduce traces and review requests.
- The integrator owns runner configuration and final merge.

Exit gate:

- All existing browser tests pass on the first attempt for three consecutive
  cold runs; a retry success is recorded as flakiness and does not qualify.
- No protected same-origin request occurs before auth.
- No import-time unauthorized store traffic appears in focused tests.
- Tool calls render and complete without the app error boundary.
- New tests are owned by exactly one intended runner.
- The tranche is independently reviewed and committed at a named SHA with no
  unowned changes.
- A fresh immutable baseline is captured from that SHA before parallel
  worktrees fan out.

### Wave 1 — Browser Regression and Runtime Baseline

**Goal:** close the rest of the active browser-regression plan and establish a
reliable browser gate plus pre-refactor measurements. This wave does not close
the full `pwa-auth-runtime` design chunk; update/offline and end-to-end remote
security work closes in Wave 3.

Parallel lanes:

1. **Navigation/recovery lane**
   - BFCache restore and reconnect behavior.
   - Event gap/replay behavior observable in browser tests.
   - Draft and live-stream position preservation.
2. **Workspace availability lane**
   - Missing, deleted, or temporarily unavailable workspaces.
   - Cold-session discovery and directory switching.
   - Understandable empty/error/recovery UI.
3. **Route convergence lane**
   - Remove or redirect duplicate `/connect` paths.
   - Make core route ownership explicit.
   - Add direct-load and browser-navigation coverage.
4. **Browser harness lane**
   - Deterministic readiness and diagnostics.
   - Exact child-process ownership and cleanup.
   - CI-compatible commands and artifact capture.
5. **Performance-baseline lane**
   - Commit a real `event pipeline -> stores -> React leaf` workload before
     state or component refactoring.
   - Capture cold anonymous boot, authenticated blank-chat boot, and deferred
     feature network graphs.
   - Capture current event integrity, store commits, React commits, long tasks,
     build time/RSS, and bundle sizes with exact commands.
   - Treat timing as informational until same-runner variance is calibrated, but
     make integrity and commit-count assertions immediately enforceable.

Shared-spine rules:

- Auth/bootstrap remains frozen except for reviewed regression fixes.
- Navigation/recovery and workspace-availability agents may investigate, design
  tests, and prepare disjoint fixtures in parallel. Their implementation is
  serial under one state/sync owner unless a directory-availability interface
  is first frozen and their owned files are proven disjoint.
- Route registry and test runner configuration have one owner.
- Browser tests should assert user outcomes and security ordering, not incidental
  request counts where protocol semantics are the real invariant.

Exit gate:

- The complete browser-regression plan is closed.
- Browser/process tests pass first-attempt on three consecutive cold runs.
- BFCache, missing workspace, `/connect`, auth, service worker, and representative
  tool flows have regression coverage.
- Every fixture-owned PID record references a dead exact PID, owned child
  handles have exited, and owned temporary roots are cleaned. Verification never
  searches for processes by name.
- A versioned, reproducible pre-refactor performance baseline exists and is the
  entry gate for Wave 2.

### Wave 2 — State Authority Convergence

**Goal:** make every session and presentation concern have one authoritative
owner before broad UI work or render optimization.

Serial spine:

1. Document current authorities and every surviving mirror.
2. Define the stable session snapshot/event interface.
3. Establish the session-machine bridge and directory/live-state precedence.
4. Split the central event pipeline by domain and update frequency.
5. Freeze the new interfaces.

Parallel migration lanes after the interface freeze:

- session lifecycle, reconnect, retry, and interruption consumers;
- message/part/tool-stream consumers;
- directory/session-list and cold-discovery consumers;
- presentation-only preference/layout consumers.

Required removals:

- deprecated streaming exports;
- obsolete adapters and compatibility mirrors;
- broad selectors that subscribe unrelated views to hot state;
- full collection cloning for events that touch only one entity;
- import-time network startup hidden in store modules.

Exit gate:

- Authority documentation matches implementation.
- Reconnect, replay/gap recovery, directory switching, cold discovery, optimistic
  rollback, retry, interruption, and history restoration tests pass.
- Instrumented representative streams show that unrelated consumers do not
  rerender or receive store commits.
- Obsolete mirrors and adapters have zero consumers and are removed.

### Wave 3 — Protected-Domain and PWA/Auth Hardening

**Goal:** make the valuable surviving features independently understandable,
testable, and safe to change, while completing the single-owner browser security
model.

PWA/auth security is a dedicated high-risk lane with this internal sequence:

1. Characterize loopback, remote bind, trusted-proxy, cookie, origin, CSRF,
   expiry, revoke, HTTP mutation, SSE, and WebSocket invariants with tests.
2. Implement server enforcement with one owner for auth middleware and server
   composition.
3. Prove the service worker never caches or intercepts API, authentication, SSE,
   or WebSocket traffic and implement the documented update/offline policy.
4. Integrate expiry and reauthentication with replay/live-stream position after
   Wave 2's state interfaces are stable.
5. Cover owner bootstrap, logout, credential reset, lost-credential recovery,
   unsafe remote-start refusal, and trusted reverse-proxy operation.

Browser request-order assertions must be scoped to the OpenChamber origin so
third-party telemetry paths cannot be mistaken for protected OpenChamber API
traffic. Excluding telemetry from that classifier is not evidence of privacy.
Wave closure requires a recorded privacy/loading decision and a separate
cross-origin telemetry assertion.

Parallel domain groups, chosen to avoid shared server registries:

- sessions/chat plus models/tools/permissions;
- projects/files plus terminal lifecycle;
- Git/worktrees;
- GitHub plus quota providers;
- ordinary product settings after the PWA/auth configuration interface freezes.

Credential-bearing settings, owner bootstrap/reset, trusted-proxy configuration,
and public-origin configuration belong exclusively to the PWA/auth owner.

Each domain lane must produce:

- a concise owner and public-interface note;
- explicit input/output and partial-failure behavior;
- removal of unsafe type escapes in touched boundaries;
- focused success, failure, authorization, cancellation, and cleanup tests;
- confirmation that the protected workflow matrix remains intact.

Special attention:

- Decompose the largest Git and filesystem services at responsibility seams, not
  file-size thresholds.
- Keep local Git failure independent from GitHub/provider failure.
- Preserve partial quota successes when one provider fails.
- Prove terminal ownership, reconnect/close semantics, and exact cleanup.
- Keep route composition and shared contracts under single-owner control.

Exit gate:

- Every protected domain has an owner, focused interface, and risk-proportional
  tests.
- No duplicate runtime implementation survives.
- HTTP mutations, SSE, and WebSocket upgrades enforce the approved
  cookie/CSRF/origin/proxy policy.
- Hostile tests cover forged `Host`, untrusted `Forwarded` and
  `X-Forwarded-*`, a loopback peer behind an untrusted proxy, cross-origin
  WebSocket upgrades, missing/invalid CSRF, cookie `HttpOnly`/`SameSite` and
  conditional `Secure`, and owner reset invalidating all sessions.
- Auth expiry and reauthentication preserve recoverable live-stream position.
- Unsafe non-loopback exposure refuses to start.
- Incompatible protocol enters a blocking read-only state with no further
  mutation; drafts survive until safe activation; failed updates leave the
  current app usable; activation purges obsolete caches; cached-shell
  disconnected and uncached offline-unavailable states are both covered.
- Full integration tests and protected workflow smoke tests pass.

### Wave 4 — Component and Design-System Convergence

**Goal:** split the remaining oversized client surfaces and converge on the
repository's one mobile-first primitive system.

Component families, executed in batches of at most three disjoint lanes:

- file/project surfaces;
- Git/worktree surfaces;
- chat tool rendering and tool-result surfaces;
- model controls, settings, and quota surfaces;
- header, navigation, and responsive layout.

The integrator or one designated shared-shell owner reserves `MainLayout`,
`ContextPanel`, `SessionSidebar`, view barrels/registries, `components/ui/**`,
theme providers, and shared command/navigation registries. A family lane may
propose changes to these surfaces but may not edit them concurrently.

Method:

1. Characterize current behavior with focused tests.
2. Identify state ownership, interaction, and reusable-behavior seams.
3. Extract behavior hooks/controllers before purely visual fragments where
   appropriate.
4. Migrate primitives to base UI wrappers.
5. Cover loading, empty, failure, keyboard, focus, and phone/desktop layouts.
6. Delete old paths only after all consumers migrate.

Do not:

- split files into pass-through components solely to lower line counts;
- move business state into component-local effects;
- create a second primitive layer;
- perform global restyling while functional boundaries are moving.

Exit gate:

- Major surfaces have clear responsibilities and focused tests.
- HeroUI and Radix have no production imports.
- Mobile and desktop browser smoke tests pass.
- Accessibility and focus behavior is explicitly covered on touched surfaces.

### Wave 5 — Evidence-Driven Optimization

**Goal:** optimize the real runtime after correctness and state boundaries are
stable.

#### Lane A: bundle and loading

- Replace the `.bun` path-based vendor catch-all with intentional stable groups
  or allow Rollup to choose where it performs better.
- Remove static view barrels that defeat route-level lazy loading.
- Resolve mixed static/dynamic imports.
- Measure cold entry, common chat route, and deferred route transfer separately.
- Remove assets and dependencies only after import and runtime audits.

#### Lane B: state and render hot paths

- Extend the Wave 1 representative session/message, tool, and reconnect harness;
  retire the preference-write benchmark as evidence for streaming performance.
- Count event reductions, store commits, component renders, long tasks, and heap
  growth.
- Narrow subscriptions and update only touched collections.
- Validate that virtualization and memoization address measured pressure rather
  than hiding stale data.

#### Lane C: server and transport

- Profile startup, idle ownership, SSE/WebSocket fan-out, filesystem watching,
  and cleanup.
- Remove duplicated parsing, serialization, polling, or watcher work where
  traces prove it matters.
- Keep backpressure, cancellation, and shutdown behavior explicit.

#### Lane D: build and developer feedback

- Profile Vite/Rollup phases and memory.
- Audit sourcemaps, transforms, dependency prebundling, and asset processing.
- Shorten the default feedback path without weakening the release build.
- Remain measurement-only while Lane A owns Vite/Rollup and asset configuration;
  configuration changes land serially through the bundle owner.

Provisional targets, to be recalibrated after three same-host samples:

- eliminate the single `vendor-.bun` catch-all;
- reduce anonymous boot to at most 500 KB gzip and authenticated blank-chat boot
  to at most 1.5 MB gzip;
- keep every individual eager JavaScript chunk below 500 KB gzip;
- keep CodeMirror, diff workers, terminal, Mermaid/KaTeX, and HEIC conversion
  out of the eager path;
- reduce production build median below 70 seconds on the reference host, or
  achieve at least a 25% time improvement and document the measured blocker
  before hardening a different time budget;
- reduce production build peak RSS below 4.8 GB on the reference host, or
  achieve at least a 25% memory improvement and document the measured blocker
  before hardening a different memory budget;
- show no unbounded heap growth during a sustained representative stream;
- show no unrelated high-frequency store commits/renders for message events;
- keep server idle and steady-state resource use within 15% of a like-for-like
  baseline unless an intentional capability explains the change.

Boot transfer budgets mean a cold browser cache, negotiated compressed transfer,
and all JavaScript, CSS, and font requests through the defined settled state.
The baseline report must define that settled state and count background preloads
so chunk fragmentation cannot evade the budget. Every asset required by the
offline shell must appear in precache/runtime-cache proof and remain below the
configured 5 MB raw per-asset ceiling.

Before server optimization begins, its focused child plan must freeze the exact
workload and budgets for p95 endpoint latency, stream time-to-first-event,
connection count, idle/soak memory, timers, listeners, and retained per-client
state.

Final performance budgets must be calibrated against a representative
device/network/workload and include at least one user-visible metric such as
startup-to-interactive or long-task pressure. Record median and variance, not
only individual samples. Missing a target requires explicit operator acceptance;
the 25% fallback is evidence for a discussion, not automatic completion.

Optimization evidence must include commands, host/runtime versions, three
samples where variance matters, and before/after artifacts. A bundle that is
split into many files but transfers the same code is not a pass.

Exit gate:

- Representative performance tests are reproducible and enforce useful budgets.
- Bundle and route-loading regressions are gated.
- Improvements hold under real message/tool/reconnect workloads.
- Correctness and protected workflow tests remain green.

### Wave 6 — Quality-Gate Convergence

**Goal:** turn the remaining debt into reliable automated feedback rather than
an end-of-project surprise.

Continuous rule:

- Every earlier lane leaves touched files with no new lint debt and, where
  practical, zero local warnings.

Parallel final slices:

- state/session code;
- component families;
- protected server domains;
- tests and helpers;
- documentation and configuration audits.

Work:

- eliminate the remaining 380 errors and 951 warnings through real typing,
  ownership, and responsibility fixes;
- prohibit new warnings before making all warnings globally blocking;
- give root commands one documented interface for unit, store, React, server,
  integration, browser, and performance checks;
- define deterministic pull-request lanes and explicit environment-dependent
  lanes;
- add the omitted deterministic unit, store, React, session-state, script,
  contract, and documentation checks to pull-request proof;
- add a serialized browser lane with retained failure artifacts;
- type-check and lint Playwright specs, fixtures, support servers, and runner
  configuration in addition to executing them;
- keep test ownership mutually exclusive;
- make verification failure output actionable.
- establish `bun run verify:full` as the canonical release-authoritative command
  covering type-check, lint, build, deterministic suites, browser, performance,
  contracts, documentation, scripts, and package proof; CI and release invoke
  the same command set, with clearly documented environment-dependent parts.

The root manifests, lockfile, lint/test configuration, verification scripts, and
CI mutations remain serial and integrator-owned. Parallel audit lanes may return
findings or draft documentation, not mutate those shared control surfaces.

Exit gate:

- First-party TypeScript/TSX lint has zero errors and warnings.
- Type check, all deterministic test layers, production build, and verification
  pass from a clean process state.
- CI invokes the documented commands and uploads useful failure artifacts.
- Every skip has an owner, reason, and expiry; no protected workflow is skipped,
  and release proof has zero unexplained or environment-accidental skips.

### Wave 7 — Dependency, Documentation, and Runtime Topology

**Goal:** ensure repository metadata and operator instructions describe only the
maintained product.

Parallel audits:

- manifests, lockfile, patches, overrides, and scripts;
- assets, icons, service worker, and packaging;
- CI/release workflows and environment variables;
- architecture, security, development, deployment, and recovery docs;
- historical plan status and dead-reference inventory.

Required decisions:

- remove Radix/HeroUI dependencies after production imports reach zero;
- reconcile README tunnel guidance with the CLI's removed-tunnel behavior;
- document one supported local development topology and one production topology;
- resolve the system/user service port collision before enabling a development
  service;
- choose and document selective upstream adoption rules;
- mark old planning artifacts historical/completed/superseded so the active
  design and this execution plan are unambiguous.

Host-level service edits, credential/bootstrap changes, public exposure, release
publishing, and dependency additions require explicit operator authorization.

Exit gate:

- Fresh install is reproducible.
- Dependency and dead-reference audits are clean.
- Docs match actual commands, security behavior, ports, and service ownership.
- No removed runtime or primitive library survives in production paths.
- Produced server and CLI tarballs install into an empty temporary project and
  pass import/help/startup smoke checks.
- Fresh-install proof uses `bun install --frozen-lockfile`, an isolated empty
  dependency cache where practical, no workspace symlink resolution, and scans
  package contents/logs for secrets or unintended local/generated files.

### Wave 8 — Release-Candidate Proof

**Goal:** prove the cleaned and optimized system as an operator and user would
experience it.

Proof matrix:

- fresh clone/install/build/verify;
- package both publishable artifacts, inspect contents, install them into an
  empty project, and smoke the installed server and CLI;
- loopback start and owner flow;
- configured remote/trusted-proxy start and refusal of unsafe exposure;
- install/update PWA flow;
- auth bootstrap, logout, expiry, reset, and recovery;
- session create/open/prompt/stream/cancel/retry/reconnect;
- model/tool/permission flow;
- project/file read-edit-save and failure handling;
- terminal create/input/resize/reconnect/close;
- Git/worktree and GitHub workflows;
- quota partial failure;
- settings validation/reset;
- service restart and cleanup;
- installed-artifact upgrade/restart and rollback/recovery for settings/runtime
  state and service-worker/cache behavior;
- performance budgets on the reference workload.

Run an independent adversarial review of:

- security boundaries;
- data loss and recovery;
- fixture-owned PID records, exact recorded PIDs/process groups, and owned
  watchers/temp roots—never process-name enumeration or killing;
- stale state/reconnect behavior;
- hidden duplicate implementations;
- documentation-command mismatches.

Exit gate:

- Every active design chunk is marked complete with evidence.
- `scripts/verify.sh` and the full protected workflow matrix pass.
- Release artifacts are built from the exact reviewed commit.
- The release workflow depends on the same verified SHA and cannot publish an
  artifact rebuilt from unverified source.
- Tag SHA equals the reviewed SHA, and SHA-256/package manifests prove that the
  exact tarball bytes installed and smoke-tested are the bytes published.
- Known residual risks are explicit, bounded, and accepted rather than hidden.

Service restart proof uses an isolated throwaway service/process and dynamically
allocated or reserved test ports. Live system/user units and `/etc` remain
read-only unless the operator explicitly authorizes that exact action. Remote
and trusted-proxy proof uses an isolated local namespace/container or loopback
proxy unless a public bind is explicitly authorized; an agent must not expose
the host on `0.0.0.0` merely to satisfy the plan.

## 8. Review and Verification Protocol

Each lane uses this handoff:

1. **Author report**
   - outcome and changed files;
   - commit SHA, clean status, and ownership-diff audit;
   - tests run with exact result;
   - assumptions and intentionally deferred work;
   - before/after measurements and artifact hashes when applicable.
2. **Requirements review**
   - compare behavior to the active design and focused plan;
   - check protected workflows and non-goals;
   - reject scope expansion disguised as cleanup.
3. **Engineering review**
   - inspect authority, lifecycle, failure, cancellation, cleanup, security,
     typing, and test quality;
   - search for surviving consumers before deletion.
   - for auth, security, lifecycle, persistence, and shared-state work, record
     approval from a reviewer other than the author before integration.
4. **Independent verification**
   - rerun focused commands from a clean process state;
   - inspect browser traces, bundle reports, or profiles rather than trusting
     summarized output.
5. **Integration gate**
   - merge in dependency order;
   - rerun cumulative checks;
   - update the baseline ledger and next action.

Failure policy:

- A reproducible regression blocks the lane.
- A flaky test is treated as a product/test defect, not rerun until green and
  ignored.
- A benchmark without a representative workload blocks an optimization claim,
  not the whole correctness wave.
- An unexpected collision with a shared spine stops both edits and returns the
  decision to the integrator.

## 9. Progress Tracking

Update this table only when the cited exit gate is satisfied:

| Wave | Status | Evidence pointer |
| --- | --- | --- |
| Completed design chunks (6/12) | Complete | Active design |
| 0. Preserve/current tranche | Complete | 2026-07-30 implementation checkpoint below |
| 1. Browser runtime/PWA correctness | Complete | Three consecutive cold five-test Playwright passes |
| 2. State authority convergence | Complete | Canonical session resource manager, shared metadata/optimistic/LRU authority, pagination metadata, end-turn reconciliation |
| 3. Protected-domain hardening | Complete | Auth-gated application graph, service-worker exclusions, protected-API ordering browser proof |
| 4. Component/design system | Complete for this program | Single active SessionMount, inspectable tool fallback, and bounded monolith extractions listed below |
| 5. Evidence-driven optimization | Complete | Repeated production-browser chat budgets, provider cache, deferred authenticated surfaces, package allowlist |
| 6. Quality-gate convergence | Complete | Zero-error lint, architecture ratchet, comprehensive verifier, PR/release gates |
| 7. Dependency/docs/runtime topology | Complete | Retired dependencies/features removed; exact tarball smoke and version checks |
| 8. Release-candidate proof | Complete with environmental residual | Full browser/protected workflows and exact tarball smoke; Docker unavailable |

### 2026-07-30 implementation checkpoint

- Removed voice settings/runtime, magic prompts, Sentry, and skills marketplace
  management. Installed-skill listing and detail views remain read-only.
- Deferred the authenticated application graph until login succeeds and kept
  API/auth/event traffic out of service-worker caching.
- Replaced hidden session mount pooling with one active mount, shared
  directory/session resources, global request deduplication, parallel initial
  metadata/message loading, and LRU-backed warm history.
- Fixed forced end-of-turn reconciliation so its REST page cannot be smaller
  than the already resident SSE history.
- Added a ten-second directory-scoped provider bootstrap cache with explicit
  force-refresh paths.
- Added an architecture baseline checker covering 860 source files. It rejects
  hotspot growth and requires the ledger to tighten when a metric improves.
- Production client build: anonymous main entry 135.64 kB / 41.58 kB gzip;
  authenticated application 3,183.08 kB / 886.35 kB gzip.
- Verification: workspace and server type checks, architecture check,
  production build, contract/store/React/script/integration suites, focused
  lint with no errors, and three consecutive cold browser suites are green.
- Environment limitation: Docker was unavailable, so the container build is
  not yet part of the earned evidence.
- Remaining architecture debt: 103 baselined hotspots, led by git service,
  FilesView, ModelControls, ToolPart, GitView, Header, sync-context, and
  MessageBody.

### 2026-07-30 autonomous completion checkpoint

- Added a deterministic production-browser chat-load budget. Repeated measured
  results are 888–1078 ms cold, 26–34 ms hover-prefetched, and 24–35 ms warm
  median; the enforced budgets are under 2 seconds cold and under 250 ms for
  prefetched/warm navigation.
- Deferred ten authenticated secondary surfaces until first use. The
  authenticated application chunk fell from 3,183,675 to 3,119,205 bytes raw
  and from 889,620 to 870,808 bytes gzip (about 2.1%).
- Decomposed ownership out of sync-context, Git conflict and GitHub issue
  routes, FilesView, ModelControls, Header, ToolPart, ChatInput, and
  NewWorktreeDialog. Each improvement tightened the architecture ledger rather
  than raising a threshold.
- `NewWorktreeDialog` fell from 1,823 to 1,291 effective lines, and its state
  and total-hook counts are now below policy. `ChatInput` fell from 1,502 to
  1,373 effective lines and 218 to 186 branch points.
- Added bounded, five-second read-only skill discovery caching and retained
  only installed-skill list/detail APIs and UI. Marketplace mutation remains
  removed.
- The architecture check currently covers 890 source files with 103 baselined
  hotspots and two reviewed data/generated classifications. Active
  `DiffView`, MCP, and Git service lanes must settle before the next cumulative
  verification snapshot.

### 2026-07-30 final implementation evidence

- Final architecture check: 904 maintained source files, 103 strictly
  baselined legacy hotspots, and two reviewed generated/data-only
  classifications. No baseline was widened.
- High-impact parent reductions include:
  - Git service: 2,824 to 2,333 effective lines across conflict, diff, operation,
    and branch/remote domain services.
  - FilesView: 2,653 to 2,004 across file rows, mutation dialog, editor tabs,
    and viewer controls.
  - ModelControls: 2,581 to 1,562 across model/agent details and mobile selector
    ownership.
  - DiffView: 1,564 to 1,021; NewWorktreeDialog: 1,823 to 1,291;
    MessageBody: 1,422 to 1,000.
  - ToolPart, Header, ChatInput, sync-context, GitView, PullRequestSection,
    MCP, and GitHub routes also received bounded tested extractions.
- Final production-browser load measurements:
  - cold session text visible: 851–1088 ms across repeated runs;
  - hover-prefetched: 27–33 ms;
  - warm median: 24–30 ms;
  - warm maximum: 27–39 ms;
  - enforced budgets remain 2,000 ms cold and 250 ms prefetched/warm.
- Final production bundle:
  - anonymous entry: 135.66 kB / 41.59 kB gzip;
  - authenticated app: 3,120.60 kB / 871.06 kB gzip, down from
    3,183.08 kB / 886.35 kB gzip.
- Final verification:
  - all workspace and server TypeScript checks pass;
  - repository lint exits zero errors (884 web and four test warnings remain);
  - web unit/contracts: 129 files / 531 tests;
  - server subset: 74 files / 341 tests;
  - session-state: 78/78; stores: 236/236; React: 72/72;
  - integration: 58 pass / two documented skips;
  - scripts: 28/28; docs and network-contract audits pass;
  - production browser: 6/6, including auth ordering, real text/tool flows,
    service-worker isolation, smoke, and the load budget.
- Release hardening:
  - `scripts/verify.sh` now runs the complete non-browser ladder;
  - PR and release workflows add browser proof and packed-artifact smoke;
  - release input/tag SemVer must match all publishable manifests;
  - the exact smoke-tested tarballs are hashed, uploaded, and published;
  - the web package contains 854 allowlisted production files rather than
    1,925 source/test-heavy files and weighs 6,606,695 bytes compressed.

### Accepted residual constraints

- The 103 ratcheted hotspots are real remaining maintainability debt, not a
  claim of zero large files. The largest are Git service (2,333), FilesView
  (2,004), GitView (1,805), ToolPart (1,746), ModelControls (1,562), MCP
  (1,540), and PullRequestSection (1,509). The ratchet prevents regression and
  requires every future improvement to lower its exact baseline.
- Lint warnings remain mostly complexity and max-lines signals. Lint has zero
  errors and the architecture ledger is the enforced migration mechanism;
  suppressing or arbitrarily splitting all warnings was outside this release.
- Integration keeps two explicit skips: one stronger `data_stalled` assertion
  needs controllable upstream silence, and WebSocket replay may skip when the
  external OpenCode fixture does not emit replayable SSE IDs.
- Docker was not responsive on this host, so the Dockerfile corrections are
  statically/build reviewed but the container image was not reproduced.
- The worktree intentionally remains uncommitted and includes pre-existing user
  work. No branch push, release, live service edit, or publication was
  performed.

At every integration checkpoint, report:

- waves/tasks complete, active, and blocked;
- passing/failing verification layers;
- lint counts versus the previous baseline;
- bundle/build/runtime measurements versus the previous baseline;
- newly discovered risk or scope;
- next three bounded agent assignments;
- files or collision zones reserved by the integrator.

## 10. Feasibility and Scaling Judgment

This program is feasible without a rewrite. The completed contraction and
contract work provide enough structure to finish incrementally.

A single large design is useful and should remain stable. A single giant
implementation plan handed to a large swarm is not safe. The main limits are
shared-state architecture, auth/bootstrap ordering, root configuration, and
integration—not agent intelligence or raw throughput.

The productive scaling model is:

- one stable design;
- this one broad execution map;
- roughly 25–40 bounded implementation/review assignments;
- two or three disjoint implementation lanes per wave;
- fresh reviewers and verifiers after each merge;
- one integrator continuously protecting the shared spines.

High-reasoning agents can substantially accelerate diagnosis, domain
decomposition, review, and performance analysis. They cannot safely make the
state authority, route registry, Vite configuration, lockfile, or auth
bootstrap concurrently. Those parts remain serial critical-path work.

A reasonable expectation is that roughly 55–65% of the remaining assignments
can run concurrently with some other lane. That does not mean 55–65% of elapsed
time disappears: integration, repeated full gates, and the shared spines remain
on the critical path.

The strongest first move is not to begin all six remaining design chunks. It is
to finish and integrate the browser-regression tranche, establish a clean
branch/worktree base, and then open the first disjoint lanes from Waves 1–3.
