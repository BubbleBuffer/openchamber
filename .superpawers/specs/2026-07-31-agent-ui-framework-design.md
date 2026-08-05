---
kind: spec
status: approved
id: agent-ui-framework
created: 2026-07-31
updated: 2026-07-31
---

# Agent UI Framework Design

## Objective

Extract the proven interaction behavior in OpenChamber into a runtime-neutral
agent UI framework that can serve OpenChamber, BubblePaw, and later agent
clients without making those products share storage, execution semantics,
networking, or visual identity.

BubblePaw retains its current visual language. OpenChamber remains the first
framework host and supplies an optional skin, not the framework's universal
appearance.

## Evidence and constraints

The current OpenChamber chat surface contains 193 TypeScript/TSX files. At
least 81 directly import OpenCode types, session/sync machinery, or product
stores. Its primitive layer contains 55 TypeScript/TSX files, roughly 41 of
which are leaf-level candidates without obvious product coupling.

This means the useful framework boundary is not the existing top-level chat
component boundary. The portable assets are lower-level contracts, pure
projections, scroll/viewport behavior, composer behavior, and slot-driven
presentation.

The design must preserve these constraints:

- OpenChamber remains an OpenCode client and owns its OpenCode/session-state
  adapter.
- BubblePaw remains a graph/atom-log client and owns its BubblePaw adapter.
- Neither product may gain a second durable state owner, event log, reconnect
  loop, or hidden execution policy through the UI framework.
- Framework packages may own ephemeral interaction state only.
- Core and headless React packages must not import OpenCode, BubblePaw wire
  types, Zustand stores, product aliases, Tailwind configuration, or product
  CSS.
- Unknown future content must remain renderable through explicit extension
  points rather than being discarded or coerced into provider-specific types.
- Initial extraction stays inside the OpenChamber workspace. Cross-repository
  consumption uses a pinned, reproducible artifact only after the first API is
  proven; no committed sibling-directory dependency is allowed.

## Approved package layers

### `agent-ui-core`

A framework-owned TypeScript package with no React dependency. It owns:

- normalized thread, turn, message, activity, capability, artifact, and
  content-block view models;
- JSON-safe extension data and explicit custom-block fallbacks;
- pure ordering, grouping, status, and projection helpers;
- reusable fixture builders and contract tests.

It does not own transport clients, observation streams, caching, persistence,
authentication, retries, or runtime commands.

The initial semantic model includes:

- stable IDs and turn relationships;
- normalized millisecond timestamps;
- message roles and lifecycle status;
- text, reasoning, capability, artifact, and custom content blocks;
- activity lifecycle status and optional duration/detail;
- opaque extension detail constrained to JSON-safe values.

Runtime adapters may retain richer source data outside this model. The core
model captures only concepts with stable meaning across both products.

### `agent-ui-react`

A headless React package depending on `agent-ui-core` and using React as a peer
dependency. The first release owns:

- virtualized ordered-entry layout;
- prepend-safe viewport anchoring;
- follow-bottom and user-scroll intent;
- load-before triggering and duplicate-load suppression;
- imperative navigation to stable entry keys;
- resize and mobile visual-viewport handling;
- slot-based rendering and class/data-attribute hooks.

It accepts view data and callbacks. It does not fetch data or subscribe to a
runtime directly. Product hooks remain responsible for translating runtime
state into component props.

The timeline behavior is generic over a stable keyed entry so OpenChamber can
initially retain its mature turn projection and renderer. Standard core view
models become the shared semantic target without forcing a big-bang renderer
rewrite.

### OpenChamber adapter and skin

OpenChamber owns:

- conversion from OpenCode/session-state structures to neutral core models;
- existing message/tool renderers and product actions;
- Tailwind/Base UI primitives, theme tokens, responsive chrome, and branded
  presentation;
- runtime stores, auth, sync, and session lifecycle.

An optional OpenChamber skin package is deferred until at least two framework
consumers demonstrate the same styled component need. Initial migration keeps
the skin in the product and consumes only headless behavior.

### BubblePaw adapter and skin

BubblePaw owns:

- conversion from semantic atoms, run evidence, and observation frames into
  the neutral core model;
- branch controls, graph/run semantics, artifacts, and extension evidence;
- its current CSS and visual identity;
- its source adapter, query cache, and resumable observation transport.

BubblePaw's existing `web/agent/src/agent-ui/contract.ts` is input to the core
contract design, not an API that the framework must preserve unchanged.

## Data and control flow

```text
OpenCode/session-state -> OpenChamber adapter --+
                                               |
BubblePaw atom/evidence -> BubblePaw adapter ---+-> neutral view models
                                                        |
                                                headless React behavior
                                                        |
                                             product render slots and skin
```

Durable truth flows in one direction from each product runtime. UI callbacks
flow back as commands owned by the product adapter. Framework components never
infer or execute graph transitions, tool policy, branch movement, or runtime
retries.

## Timeline contract

The first vertical slice is an `AgentTimeline` component and related hooks.
Its public behavior includes:

- stable keyed entries supplied in display order;
- a consumer-owned render function;
- consumer-owned loading, error, empty, and live-tail presentation;
- controlled `hasMoreBefore` and `isLoadingBefore` state;
- an `onLoadBefore` callback triggered near the leading boundary;
- follow-bottom state and a scroll-to-bottom command;
- capture/restore and scroll-to-key imperative methods;
- configurable estimates, overscan, thresholds, and accessibility labels;
- no mandatory CSS or theme provider.

Stable entry keys are a caller invariant. Duplicate keys fail focused tests and
produce a development diagnostic. Loading errors remain consumer state; the
timeline prevents duplicate callbacks but does not invent retry policy.

## Styling strategy

The core and React behavior packages emit semantic data attributes and accept
class names/render slots. They ship no Tailwind dependency and no product
tokens.

OpenChamber continues using Tailwind/Base UI and its existing tokens. BubblePaw
continues using its ordinary CSS. A later skin package may provide optional
recipes once actual cross-product repetition justifies it.

## Compatibility and migration

This is a clean internal contract, not a compatibility facade for current
OpenChamber component props.

Migration proceeds from leaves inward:

1. extract and prove framework behavior;
2. make OpenChamber's existing `VirtualizedMessageList` delegate layout and
   scrolling while retaining product projection/rendering;
3. compare browser correctness, bundle, and performance evidence;
4. promote the proven packages to a reproducible distribution boundary;
5. continue splitting OpenChamber's composer behavior, activity/tool
   presentation, Markdown services, and reusable primitive boundary into
   independently proven framework layers;
6. promote the resulting framework through a reproducible distribution
   boundary;
7. migrate BubblePaw through its own adapter only after the OpenChamber-first
   extraction is coherent.

Composer extraction follows the same rule: shared code owns IME-safe keyboard,
autosize, draft/history ports, attachments, and extension registries; products
own commands, slash/mention sources, persistence, and send semantics.

Markdown is deliberately later because OpenChamber's current renderer mixes
syntax themes, filesystem actions, popups, device behavior, and product stores.

## Distribution and promotion gate

During the first slice, packages are workspace-local and unpublished. The
slice includes packed-artifact smoke tests plus a BubblePaw-shaped consumer
fixture to prevent accidental OpenChamber assumptions.

Before actual BubblePaw adoption, review the public API and choose a stable
distribution boundary:

- preferred: move the proven packages into a dedicated framework repository
  and consume a pinned release or Git SHA;
- acceptable for an early private milestone: publish pinned prerelease
  packages under an owned namespace;
- rejected: committed `file:../../../openchamber/...` dependencies or copied
  package source with no synchronization authority.

## Proof and acceptance

The design is successful when:

- architecture checks reject product/runtime imports from framework packages;
- core contract tests cover standard and custom content;
- timeline tests prove append-following, user-scroll preservation, prepend
  anchoring, loading boundaries, stable-key navigation, resize, and mobile
  viewport behavior;
- OpenChamber's existing browser workflows and chat-load budgets remain green;
- a packed-artifact fixture renders both OpenChamber-shaped and
  BubblePaw-shaped timelines without product imports;
- package exports and peer dependencies install in an empty consumer;
- OpenChamber and BubblePaw retain exactly one runtime state authority each;
- no visual convergence is required between the products.

## OpenChamber-first extraction waves

After the timeline slice, OpenChamber is split further before BubblePaw adopts
the framework:

1. **Composer behavior:** IME-safe submit, autosize, history, draft ports,
   attachment handling, and extensible mention/command registries. OpenChamber
   retains its stores, slash-command sources, file/agent lookup, and send
   semantics.
2. **Activity and capability presentation:** neutral activity projection,
   expandable groups, duration/status presentation, and render slots for
   capability detail. OpenChamber retains provider-specific tool renderers and
   actions.
3. **Markdown services:** sanitize/copy/link/code/diagram service ports and a
   headless block renderer. OpenChamber retains syntax-theme generation,
   filesystem/context actions, and branded presentation.
4. **Primitive boundary:** move only proven Base UI wrappers and behavioral
   primitives behind an optional OpenChamber skin. Core/react packages remain
   CSS- and Tailwind-free.
5. **Promotion:** package/API review, independent repository or owned
   prerelease artifact, then BubblePaw adoption.

Each wave must leave OpenChamber consuming the extracted layer. No framework
package is allowed to become a dumping ground for code that still imports
product state indirectly.

## Deferred work

- Actual BubblePaw dependency adoption, pending the promotion gate.
- Artifact visualization components.
- Public package naming, registry publication, or a separate repository.
- Storybook or another component-catalog dependency; fixtures and focused tests
  are sufficient for the first slice.
