---
kind: plan
status: planned
base_branch: feature/agent-ui-framework
parent_spec: .superpawers/specs/2026-07-31-agent-ui-framework-design.md
created: 2026-07-31
updated: 2026-07-31
next_action: Implement Task 1 test-first by extracting pure key, history, and autocomplete transitions into agent-ui-core.
---

# Agent UI Framework: Composer Behavior Slice

**Goal:** Move OpenChamber's reusable composer state machine and DOM behavior
into the runtime-neutral framework, make OpenChamber consume it, and delete the
superseded product hooks without moving OpenCode commands, stores, catalogs,
send policy, or styling into the framework.

## Boundary

Framework ownership:

- controlled text, selection, and composition state;
- IME-safe key intent resolution;
- history traversal with draft restoration;
- autocomplete trigger parsing and controlled registry navigation;
- textarea autosizing and viewport/selection restoration;
- draft persistence through an injected storage port;
- neutral attachment/drop descriptors and callbacks.

OpenChamber ownership:

- session phase, queue policy inputs, and send/queue command execution;
- OpenCode agents, skills, slash commands, files, inline comments, and shell
  mode semantics;
- attachment upload/data-URL processing and filesystem paths;
- local store selection, toasts, focus mode, mobile/desktop chrome, Tailwind,
  Base UI, and the current visual textarea/highlight layers.

The framework emits typed intents; it never decides whether an OpenCode
session command is allowed or executes one.

## Task 1: Extract deterministic composer transitions into core

- [ ] Add `composer/model.ts`, `composer/keyboard.ts`, `composer/history.ts`,
  and `composer/autocomplete.ts` under `packages/agent-ui-core/src/`.
- [ ] Represent keyboard input as a serializable snapshot and return an intent
  union such as `submit`, `queue`, `newline`, `history-previous`,
  `history-next`, `autocomplete-key`, `dismiss`, `cycle`, or `none`.
- [ ] Move the provider-neutral portions of `autocompleteUtils.ts` and
  `textUtils.ts`; registries remain caller data/callbacks.
- [ ] Define pure history transitions over `{ index, draft, entries, value }`.
  Correct the documented first-ArrowUp skip in
  `useComposerHistory.ts`; add a regression test proving index `0` is shown
  first and the draft returns after ArrowDown.
- [ ] Add IME, mobile Enter, modifier, cursor-boundary, queue-intent,
  autocomplete-priority, and empty-history table tests.

**Proof:** Core tests contain no React, DOM, OpenCode, storage, or product
imports; the architecture ratchet rejects them.

## Task 2: Add controlled React composer behavior

- [ ] Add `useAgentComposer`, `useComposerAutosize`,
  `useComposerHistoryController`, and `useComposerDraftPort` under
  `packages/agent-ui-react/src/composer/`.
- [ ] Accept controlled `value`, `onValueChange`, current selection, history
  entries, registry state, and typed intent callbacks. Keep high-frequency
  text state local to the consumer and callbacks behind stable refs.
- [ ] Replace transient `height = auto` growth cycles with a measured strategy
  that only permits shrink when content contracts, preserving scrollTop.
- [ ] Define a narrow async/sync draft port (`read`, `write`, `remove`) with a
  caller-owned key; provide no localStorage singleton.
- [ ] Handle compositionstart/compositionend and WebKit keyCode 229 without
  firing submit, queue, autocomplete, or history intents.
- [ ] Add React/DOM tests for desktop/mobile Enter, IME, history cursor
  placement, selection restoration, viewport resize, autosize growth/shrink,
  stable callback identities, unmount cleanup, and storage failure isolation.

**Proof:** The package remains CSS-free and store-free; tests run without a
theme, runtime provider, or product alias.

## Task 3: Define neutral registry and attachment seams

- [ ] Define generic autocomplete registry items with stable IDs, labels,
  optional detail, query matching hooks, selection, and keyboard navigation.
- [ ] Define neutral dropped-file metadata and attachment intent callbacks;
  do not move OpenChamber's `AttachedFile`, server paths, uploads, or data-URL
  conversion into core.
- [ ] Extract generic prefix insertion, token replacement, paste/drop intent,
  and atomic-token deletion behavior.
- [ ] Prove command, file, agent, and skill-shaped registries through fixtures
  without naming OpenCode in framework production code.

**Proof:** Both OpenChamber-shaped and BubblePaw-shaped composer fixtures use
the same controller with different registries and attachment handlers.

## Task 4: Migrate OpenChamber and delete duplicate behavior

- [ ] Adapt `ChatInput.tsx` to supply runtime state and execute typed intents.
- [ ] Keep `ComposerTextarea.tsx`, `ComposerHighlightLayer.tsx`, autocomplete
  popups, footer/actions, and all styling product-owned; wire them to the
  framework controller.
- [ ] Replace and delete product-owned
  `useComposerKeyboard.ts`, `useComposerHistory.ts`,
  `useComposerTextareaAutosize.ts`, provider-neutral autocomplete helpers, and
  draft persistence machinery once their last imports are gone.
- [ ] Split the current 1,400-line `ChatInput.tsx` adapter by runtime command
  responsibility rather than moving it wholesale into the framework.
- [ ] Tighten the architecture ledger for every deleted or reduced hotspot.

**Proof:** Existing ChatInput, mention, draft, submit, drop, mobile, and browser
tests pass; the first-history-item bug is fixed intentionally and documented.

## Task 5: Distribution and regression proof

- [ ] Extend the framework clean-consumer fixture to render and interact with
  timeline plus composer behavior from packed artifacts.
- [ ] Inspect packed files for product aliases, CSS, stores, transports,
  credentials, and undeclared dependencies.
- [ ] Run package build/type/lint/test, architecture and script tests, focused
  ChatInput React tests, full production build, all six browser workflows, and
  chat-load performance.
- [ ] Record before/after ownership: deleted hooks, reduced `ChatInput.tsx`
  effective lines/imports/hooks, and bundle/performance variance.

**Proof:** `VERIFY_BROWSER=1 scripts/verify.sh` and
`bun run verify:agent-ui-packages` pass on the final tree.

## Exit decision

Keep the framework workspace-private and open the activity/capability child
plan. Do not promote or modify BubblePaw until the OpenChamber-first extraction
program reaches its explicit promotion wave.
