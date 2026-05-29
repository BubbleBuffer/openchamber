# session-state

## Purpose

`@openchamber/session-state` owns the runtime-agnostic session-domain state machine used by web server and UI runtime bridges.

## Boundaries

This package may import XState and TypeScript-only types. It must not import React, DOM APIs, Express, OpenCode SDK clients, EventBus instances, AbortController, timers, filesystem APIs, browser globals, Zustand stores, or server runtimes.

## Public Exports

The package exports canonical session machine types, actor-key helpers, snapshots, validation, selectors, invariants, hydration helpers, and fixture runner utilities.

## Failure Handling

Invalid domain events, invalid hydration input, invalid snapshots, duplicate actor identity, non-serializable data, and impossible transitions fail fast in development, test, and CI. Production fatal containment is actor-local and represented in the canonical snapshot.

## Contributing

Keep state semantics in this package. Bridges translate inputs and execute effects; they do not recreate lifecycle, retry, streaming, history, permission, question, or fatal recovery rules.
