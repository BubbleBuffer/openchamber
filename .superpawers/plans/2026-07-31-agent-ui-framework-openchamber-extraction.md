---
kind: plan
status: active
base_branch: main
parent_spec: .superpawers/specs/2026-07-31-agent-ui-framework-design.md
created: 2026-07-31
updated: 2026-07-31
active_child: .superpawers/plans/2026-07-31-agent-ui-framework-composer-slice.md
next_action: Keep composer deferred until the public 0.1.0-alpha.1 package gate is published and pinned in the lockfile.
---

# Agent UI Framework: OpenChamber-First Extraction Program

**Goal:** Aggressively split OpenChamber's proven agent interaction layers into
runtime-neutral framework packages, make OpenChamber consume every extracted
layer, and postpone BubblePaw adoption until the framework has a coherent,
reviewed distribution boundary.

## Program invariants

- OpenChamber remains fully functional and visually unchanged after every
  wave.
- `agent-ui-core` and `agent-ui-react` own shared semantics and behavior only.
- OpenCode/session-state types, product stores, transports, persistence,
  authentication, runtime commands, Tailwind, and product CSS stay in
  OpenChamber adapters/skin.
- Every extraction deletes or materially shrinks the superseded OpenChamber
  owner; pass-through facades and duplicate implementations do not count.
- The architecture ledger tightens after each split and never widens a legacy
  hotspot to accommodate framework work.
- BubblePaw is not modified until the promotion wave names a pinned,
  reproducible dependency.

## Wave 1: Neutral contracts and timeline behavior

Status: completed

Execute
`.superpawers/plans/2026-07-31-agent-ui-framework-timeline-slice.md`.

Exit evidence:

- core/react packages build, test, type-check, lint, and pack independently;
- OpenChamber delegates virtual layout, scroll intent, prepend anchoring, and
  key navigation to the framework;
- OpenChamber browser correctness and load-performance budgets remain green;
- OpenChamber- and BubblePaw-shaped fixtures use the same headless API.

## Wave 2: Composer behavior and extension registries

Status: planned

Create a focused child plan after Wave 1 freezes its package conventions.

Target seams:

- `components/chat/chat-input/ComposerTextarea.tsx`;
- `useComposerTextareaAutosize.ts`, composer keyboard/history/draft behavior,
  `composerSubmit.ts`, and attachment/drop helpers;
- neutral mention, command, attachment, and draft-storage ports;
- controlled composer state and IME-safe submission.

OpenChamber retains provider/session commands, file and agent lookup, queue
stores, inline comments, slash-command catalog, and visual chrome.

Exit evidence includes focused controller tests, existing ChatInput React
tests, mobile keyboard/browser proof, no draft regression, and reduced
OpenChamber ChatInput ownership metrics.

## Wave 3: Activity, capability, and expandable detail presentation

Status: pending

Create a focused child plan after the core content/activity contracts have
survived Waves 1 and 2.

Target seams:

- pure turn/activity projection helpers;
- expandable/collapsible activity grouping and duration/status behavior;
- capability summary rows, fallback detail, and render slots;
- transient/live state presentation without provider semantics.

OpenChamber retains its OpenCode part normalization, product tool renderer
registry, permission actions, task-session navigation, filesystem/Git actions,
and syntax/theme integration.

Exit evidence includes provider-agnostic fixture coverage, OpenChamber tool
lifecycle browser proof, and measurable reductions in `ProgressiveGroup`,
`ToolPart`, and `MessageBody` ownership.

## Wave 4: Markdown and rich-content services

Status: pending

Create a focused child plan only after the activity/content block API is
stable.

Target seams:

- Markdown/GFM/math parsing and safe rendering boundaries;
- sanitizer, clipboard, external-link, code-block, and diagram service ports;
- lazy heavyweight renderer loading and render-slot overrides;
- neutral artifact/link metadata.

OpenChamber retains theme generation, context-panel actions, effective
directory behavior, file downloads, and product-specific popup presentation.

Exit evidence includes hostile-markup sanitation tests, copy/link behavior,
lazy chunk proof, existing message rendering tests, and no bundle regression.

## Wave 5: Optional OpenChamber skin and primitive boundary

Status: pending

Audit the 55 current UI primitive files against actual framework consumers.
Move only primitives with two demonstrated framework-level consumers or a
clear headless behavioral responsibility. Keep branding, product dialogs,
logos, provider assets, and application chrome in OpenChamber.

Exit evidence includes a narrow export surface, Base UI accessibility tests,
theme-token-only styling, and a second fixture skin proving the headless
packages do not require Tailwind.

## Wave 6: Promotion and BubblePaw handoff

Status: pending

The timeline slice has been promoted into the dedicated local `agent-ui`
repository as lockstep `@bubblebuffer/agent-ui-core` and
`@bubblebuffer/agent-ui-react` `0.1.0-alpha.1` packages. OpenChamber consumes
the registry declaration and retains no framework source aliases or package
directories. The prerelease is intentionally not yet published; regenerate its
registry lock entry only after the staged trusted publish completes. Reject
sibling filesystem links and unsynchronized source copying.

Write a separate BubblePaw adoption plan covering its adapter, timeline,
composer, activity/tool evidence, and visual regression proof. Do not begin
that work inside this program.

## Program acceptance

- All five OpenChamber extraction waves are consumed by OpenChamber itself.
- Framework packages have enforced dependency direction and independent
  package proof.
- The full OpenChamber release-candidate ladder remains green after every wave.
- Architecture hotspot thresholds tighten rather than shift into new files.
- A stable distribution boundary exists before BubblePaw changes.
- The program ends with explicit BubblePaw adoption inputs, not an implicit
  cross-repository dependency.
