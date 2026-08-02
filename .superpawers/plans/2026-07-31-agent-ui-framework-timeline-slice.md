---
kind: plan
status: completed
base_branch: main
parent_spec: .superpawers/specs/2026-07-31-agent-ui-framework-design.md
created: 2026-07-31
updated: 2026-07-31
next_action: Continue with .superpawers/plans/2026-07-31-agent-ui-framework-composer-slice.md.
---

# Agent UI Framework: Timeline First Slice

**Goal:** Establish runtime-neutral core and headless React packages inside the
OpenChamber workspace, migrate OpenChamber's virtualized timeline behavior to
them without changing product presentation, and produce enough cross-consumer
evidence to decide package promotion and BubblePaw adoption.

**Design reference:**
`.superpawers/specs/2026-07-31-agent-ui-framework-design.md`

## Approved constraints

- BubblePaw keeps its own visual identity.
- Framework packages own no networking, persistence, runtime subscription,
  durable state, authentication, or execution policy.
- No OpenCode, BubblePaw wire, Zustand, product alias, Tailwind, or product CSS
  import may enter the core/headless packages.
- OpenChamber remains the first real host. BubblePaw-shaped fixtures are the
  second contract consumer for this slice; actual BubblePaw adoption follows a
  separate promotion decision.
- Do not commit sibling-directory `file:` dependencies.
- Preserve OpenChamber's browser behavior and measured session-load budgets.

## Task 1: Establish framework packages and enforce their boundaries

- [x] **Outcome:** The workspace builds and tests two focused packages with an
  executable rule preventing product-runtime coupling.

**Files and anchors:**

- Create `packages/agent-ui-core/package.json`, `tsconfig.json`,
  `tsconfig.build.json`, and `src/index.ts`, following the build/export pattern
  in `packages/session-state`.
- Create `packages/agent-ui-react/package.json`, TypeScript build configuration,
  and `src/index.ts`; declare React and React DOM as peer dependencies and
  `agent-ui-core` as its workspace dependency.
- Modify root `package.json` build/type-check/lint scripts only where workspace
  discovery does not already cover the new packages.
- Extend `scripts/check-architecture.mjs` and
  `scripts/architecture-ledger.json` with a framework boundary that rejects
  imports from `packages/web`, OpenCode, session-state, Zustand, product path
  aliases, and product styles.
- Add focused architecture-check tests proving an allowed neutral import and
  representative rejected imports.

**Dependencies:** None.

**Proof:** Package type checks/builds pass independently; architecture tests
fail on forbidden fixture imports and pass on the real package trees; root
workspace discovery assigns package scripts exactly once.

## Task 2: Define neutral view contracts and two consumer fixtures

- [x] **Outcome:** Core view models express the stable semantic overlap between
  OpenChamber and BubblePaw without containing either runtime's wire types.

**Files and anchors:**

- Add focused modules under `packages/agent-ui-core/src/` for IDs/timestamps,
  thread/turn/message models, content blocks, activity/capability status,
  artifact references, JSON-safe extension detail, and timeline entry keys.
- Export pure ordering, grouping, duration, and fallback helpers through the
  package entrypoint.
- Add OpenChamber-shaped and BubblePaw-shaped neutral fixtures under the core
  package's test ownership. The BubblePaw fixture should cover chat and coding
  turns, capability activity, artifact references, and unknown extension data
  based on `../BubblePaw/web/agent/src/agent-ui/contract.ts` and the current
  BubblePaw observation model; it must not import the sibling repository.
- Add contract tests for stable IDs, timestamp normalization, lifecycle status,
  custom-block preservation, deterministic ordering, and JSON-safe detail.

**Dependencies:** Task 1.

**Proof:** Core tests exercise both fixture families; generated declarations
contain no product types; dependency and architecture checks remain green.

## Task 3: Extract the headless timeline behavior test-first

- [x] **Outcome:** `agent-ui-react` provides a generic, slot-rendered virtual
  timeline with the behavior currently proven in OpenChamber.

**Files and anchors:**

- Use `packages/web/src/ui/components/chat/hooks/useChatScrollManager.ts`,
  `useViewportAnchor.ts`, `components/TurnList.tsx`, and the layout portion of
  `VirtualizedMessageList.tsx` as behavioral sources, not APIs to preserve.
- Implement package-owned timeline hooks/component modules with stable keyed
  entries, consumer rendering, load-before control, follow-bottom state,
  capture/restore, scroll-to-key, configurable estimates/overscan/thresholds,
  semantic data attributes, and optional class names.
- Keep product entry projection, animations, stores, and message rendering out
  of the package.
- Add deterministic React/DOM tests covering initial placement, live append at
  bottom, no forced movement after user scroll, prepend anchor preservation,
  duplicate load suppression, loading-state changes, key navigation, dynamic
  resize, cleanup, and `visualViewport` keyboard resizing.
- Add an empty-consumer fixture that renders both neutral fixture families
  using distinct class names and render functions without Tailwind or a theme
  provider.

**Dependencies:** Tasks 1 and 2.

**Proof:** Focused package tests pass without product providers or global
stores; package output contains no CSS; an empty consumer builds with only
React, React DOM, the declared virtualizer dependency, and the packed framework
artifacts.

## Task 4: Migrate OpenChamber's timeline through a narrow adapter

- [x] **Outcome:** OpenChamber uses the framework for virtual layout and scroll
  behavior while retaining its current projection, renderer, styling, and
  session authority.

**Files and anchors:**

- Modify `packages/web/src/ui/components/chat/VirtualizedMessageList.tsx` to
  delegate virtualization, leading-page triggers, anchoring, follow-bottom,
  and imperative key navigation to `agent-ui-react`.
- Keep `useVirtualizedChatEntries.ts`, `MessageListEntry.tsx`, turn UI state,
  animation behavior, retry overlays, and OpenChamber store selection in the
  web product.
- Remove the superseded product copies of `useChatScrollManager.ts`,
  `useViewportAnchor.ts`, and `TurnList.tsx` after all consumers import the
  framework directly; do not retain pass-through facades.
- Update `packages/web/package.json`, TypeScript aliases, and Vite/test
  configuration only as required for workspace-package consumption.
- Adapt existing chat/message tests to assert observable behavior rather than
  internal hook placement.

**Dependencies:** Task 3.

**Proof:** OpenChamber type-check, focused chat/React tests, architecture check,
and production build pass. Existing timeline handles preserve scroll-to-turn,
scroll-to-message, capture, and restore behavior through stable product key
mapping.

## Task 5: Prove behavior, performance, and distributable package integrity

- [x] **Outcome:** The extraction is behaviorally neutral for OpenChamber and
  produces reproducible artifacts suitable for the promotion decision.

**Files and anchors:**

- Extend package manifest and release-script tests so both framework packages
  have explicit exports, declaration output, peer dependencies, and narrow
  file allowlists.
- Extend the existing pack/smoke machinery in
  `scripts/smoke-package-tarballs.mjs` or add a focused sibling script when its
  two-package assumptions would otherwise obscure ownership.
- Record before/after OpenChamber bundle chunks and the existing production
  browser session-load measurements.
- Run the full `VERIFY_BROWSER=1 scripts/verify.sh` ladder and exact tarball
  installation smoke.
- Inspect packed contents for product source, aliases, CSS, credentials, and
  undeclared dependencies.

**Dependencies:** Task 4.

**Proof:** All full-repository checks pass; the six browser workflows and chat
performance budget remain green; cold/prefetched/warm results do not regress
outside recorded variance; packed imports work in an empty project; package
contents satisfy the boundary audit.

## Task 6: Review the public seam and decide promotion

- [x] **Outcome:** A public-seam review decides whether the first-slice API is
  ready to become a cross-repository dependency and records the next bounded
  move.

**Review focus:**

- Verify the framework owns interaction behavior only and has no hidden
  runtime/state authority.
- Check that the API is driven by stable product needs rather than wrappers
  around OpenChamber internals.
- Review accessibility, cleanup, resize/scroll races, key invariants, package
  exports, peer dependency ranges, and tree-shaking.
- Compare the BubblePaw-shaped fixture to BubblePaw's real contracts and note
  any semantic mismatch before promotion.

**Decision outcomes:**

- Promote the packages into a dedicated framework repository and plan pinned
  adoption in both products; or
- keep them workspace-private and revise the API against concrete review
  findings before any BubblePaw dependency is introduced.

**Dependencies:** Task 5.

**Proof:** Review findings are resolved or explicitly accepted; the spec and
plan record the selected distribution boundary; the next plan names the exact
BubblePaw adoption artifact/version rather than a sibling filesystem path.

**Decision:** Keep both packages workspace-private while the approved
OpenChamber-first composer, activity, Markdown, and primitive waves establish
the coherent public surface. Actual BubblePaw adoption and repository/package
promotion remain gated on Wave 6. The review corrected a resize/follow-intent
race before this slice was frozen.

## Comprehensive acceptance

- Framework packages build, type-check, lint, test, and pack independently.
- Architecture enforcement prevents runtime/product coupling.
- OpenChamber delegates timeline behavior without visual or semantic changes.
- OpenChamber's full verifier, browser workflows, and performance budgets pass.
- Both OpenChamber-shaped and BubblePaw-shaped fixtures consume the same
  headless API with independent renderers.
- The work ends at a clean, reviewed promotion decision; it does not silently
  expand into composer, tool rendering, Markdown, publication, or BubblePaw
  migration.
