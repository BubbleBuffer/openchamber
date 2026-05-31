# Server TypeScript Modernization Design

## Context

The current web server lives under `packages/web/server/` as JavaScript ESM. It contains roughly 176 JavaScript files and about 42K lines of server implementation. The browser web app and shared UI are TypeScript, but the server is not covered by `tsc`; `packages/web/tsconfig.json` only includes the browser app and UI sources.

The server currently relies on a mix of runtime JavaScript, partial JSDoc types, and a hand-maintained `server/index.d.ts` for the public server API consumed by other packages. This creates drift risk, weak refactoring support, and poor maintainability. The main server entrypoint, `packages/web/server/index.js`, is also a large orchestration file that wires together Express, OpenCode runtime, tunnels, sessions, terminal handling, notifications, SSE/WebSocket streaming, web push, and shutdown behavior.

The modernization goal is not a mechanical rename from JavaScript to TypeScript. The server should be restructured into explicit, typed domains while preserving practical runtime compatibility for the web app and Electron.

## Goals

- Move server implementation from JavaScript to TypeScript.
- Add real server type-checking to project verification.
- Replace hand-written public declarations with emitted TypeScript declarations.
- Split the current god-entrypoint into focused bootstrap, app, runtime, and domain modules.
- Make server lifecycle, dependency wiring, and cross-domain communication explicit.
- Keep development fast by allowing Bun to run server TypeScript directly.
- Keep Electron/runtime packaging compatible by compiling server TypeScript to JavaScript.
- Migrate in stages so critical live behaviors can be verified slice by slice.
- Be aggressive about deleting bad internals and stale JavaScript once a domain is replaced.

## Non-Goals

- Preserve existing internal file paths or module boundaries.
- Preserve compatibility shims without a concrete runtime consumer.
- Preserve the hand-maintained `server/index.d.ts` after declarations are emitted from TypeScript.
- Do a single all-at-once greenfield rewrite of every server behavior.
- Migrate terminal handling and event streaming in the same implementation slice.

## Strategy

Use a strangler rewrite with aggressive domain internals and conservative cutover.

The server should not be rewritten all at once. Instead, each implementation slice should create or migrate one coherent domain, test it, cut the runtime over to the TypeScript domain, and delete the replaced JavaScript immediately. Within each domain, old structure is not sacred: bad module boundaries, JSDoc pseudo-types, singleton globals, and ad hoc cross-imports should be replaced with typed services and explicit dependencies.

## Target Architecture

The target package layout is:

```txt
packages/web/server/
  src/
    index.ts
    main.ts
    app/
      create-app.ts
      middleware.ts
      route-registry.ts
    runtime/
      server.ts
      shutdown.ts
      env.ts
      dependencies.ts
    domains/
      terminal/
      event-stream/
      opencode/
      sessions/
      tunnels/
      notifications/
      git/
      quota/
      fs/
      config/
    shared/
      errors.ts
      result.ts
      validation.ts
      lifecycle.ts
  dist/
```

`server/src/index.ts` is the package/runtime API for Electron and other in-process consumers. `server/src/main.ts` is the CLI/development executable entrypoint. Both files should orchestrate only. Domain behavior belongs in focused modules under `server/src/domains/`.

Domain modules should expose typed factories such as `createTerminalDomain()`, `createEventStreamDomain()`, `createOpenCodeDomain()`, and `createSessionsDomain()`. A domain may expose route registration, lifecycle hooks, and a narrow service API for other domains.

## Runtime Graph

The runtime graph should be explicit instead of hidden in imports and module-level globals.

```ts
type ServerRuntime = {
  app: Express
  httpServer: Server
  config: ServerConfig
  lifecycle: LifecycleRegistry
  domains: {
    terminal: TerminalDomain
    eventStream: EventStreamDomain
    opencode: OpenCodeDomain
    sessions: SessionsDomain
  }
}
```

The preferred public API shape is:

```ts
startWebServer(options): Promise<ServerController>
createWebServerRuntime(options): Promise<ServerRuntime>
```

Exact names can be finalized during implementation planning, but the API should distinguish constructing the runtime from starting/listening where practical.

## Domain Boundaries

- Bootstrap/runtime owns process-level concerns: environment parsing, config normalization, HTTP listen/stop, signal handling, shutdown ordering, and dependency construction.
- App assembly owns Express creation, common middleware, static routes, and domain route mounting.
- Terminal owns PTY runtime selection, WebSocket protocol, terminal sessions, replay buffers, stream lifecycle, and cleanup.
- Event-stream owns SSE/WebSocket fanout, upstream OpenCode event parsing, global UI broadcasts, liveness, reconnect behavior, and stream client management.
- OpenCode owns OpenCode startup/shutdown, proxy behavior, config/entity routes, provider/agent/skill services, and OpenCode-specific runtime state.
- Sessions owns session actor registry, session effects, snapshots, bridge wiring, and state-machine integration.
- Feature domains such as tunnels, notifications, git, quota, fs, config, scheduled tasks, projects, magic prompts, TTS, and auth/security expose routes plus narrow service interfaces.

Cross-domain communication must happen through explicit dependencies. For example, terminal should receive an `EventPublisher` if it needs to broadcast events. OpenCode should receive typed notification or session dependencies when it needs them. Domains should not reach into each other through ad hoc imports or shared mutable globals.

## Build And Runtime Model

The server should be a real TypeScript build target:

```txt
server/src/**/*.ts
  -> server/dist/**/*.js
  -> server/dist/**/*.d.ts
```

Add a server-specific TypeScript config, likely `packages/web/tsconfig.server.json`, so the server can be type-checked independently from the browser app.

Expected script shape:

```json
{
  "type-check:web": "tsc --noEmit -p packages/web/tsconfig.json",
  "type-check:web-server": "tsc --noEmit -p packages/web/tsconfig.server.json",
  "build:web-server": "tsc -p packages/web/tsconfig.server.json",
  "dev:server": "bun server/src/main.ts --port ${OPENCHAMBER_PORT:-3001}"
}
```

Development may run server TypeScript directly through Bun for fast iteration. Packaged and Electron-compatible runtime must consume compiled JavaScript from `server/dist`, not raw TypeScript.

Electron currently keeps `@openchamber/web` external during main-process bundling because server dependencies include Bun-only or native modules. That constraint remains important. Bun-only dependencies, especially PTY-related imports, must stay behind runtime-guarded dynamic imports so Node/Electron does not eagerly load unsupported `bun:` modules.

Package exports should be updated so in-process consumers resolve to compiled server output, for example `@openchamber/web/server` or an equivalent stable export pointing at `server/dist/index.js`.

## Migration Order

### Stage 1: Foundation And Bootstrap

- Add server TypeScript config, build output, package exports, and dev/build/type-check scripts.
- Create `server/src/index.ts` and `server/src/main.ts`.
- Extract old `index.js` responsibilities into typed bootstrap, app, runtime, environment, dependency, and shutdown modules.
- Preserve enough initial behavior to verify server start/stop, route mounting, and Electron-compatible import.

### Stage 2: Terminal Domain

- Move PTY selection, WebSocket protocol, replay buffer, terminal sessions, streaming, and cleanup into `domains/terminal`.
- Define typed interfaces for terminal messages, sessions, replay buffers, process lifecycle, and runtime selection.
- Preserve the Bun/Node boundary: Bun-specific PTY code only loads under Bun; Electron/Node remains safe.
- Add tests for protocol parsing, replay behavior, session cleanup, and runtime import guards.

### Stage 3: Event-Stream Domain

- Move SSE routes, WebSocket fanout, upstream event parsing, global UI broadcasts, hub behavior, and liveness into `domains/event-stream`.
- Define typed event envelopes and publisher/subscriber interfaces.
- Test compression bypass, reconnect behavior, fanout, liveness, and upstream parsing.
- Replace broad mutable client sets with owned domain runtime state.

### Stage 4: OpenCode And Sessions

- Move OpenCode startup/shutdown/proxy/config/entity/service routes into `domains/opencode`.
- Move session actor registry, effects, snapshots, bridge, and state-machine integration into `domains/sessions`.
- Replace implicit cross-module state with injected domain services.

### Stage 5: Remaining Feature Domains

- Migrate tunnels, notifications, git, quota, fs, scheduled tasks, projects, config, magic prompts, TTS, and auth/security into domain folders.
- Delete old JavaScript modules as each domain is fully replaced.
- Remove `server/index.d.ts` once TypeScript emits declarations from `index.ts`.

### Stage 6: Cleanup And Enforcement

- Remove old `server/**/*.js` implementation files.
- Include server TypeScript in root type-check verification.
- Include server TypeScript in lint coverage.
- Ensure packaged Electron, dev server, CLI, and package exports consume the intended entrypoints.

## Testing Strategy

Tests are the safety rail for this refactor. Existing behavior is too spread out to trust by inspection.

- Unit tests for pure protocol/state modules: terminal protocol, replay buffer, event envelope parsing, lifecycle registry, and config parsing.
- Domain tests for factories with fake dependencies: terminal domain, event-stream domain, OpenCode domain, and sessions domain.
- Integration tests for Express route mounting, SSE/WebSocket behavior, terminal WebSocket behavior, startup, and shutdown.
- Electron compatibility smoke test that imports the compiled server in a Node/Electron-like runtime and verifies Bun-only imports stay guarded.

## Acceptance Criteria

- `bun run type-check:web-server` passes and is included in root `type-check`.
- `bun run lint` includes `server/src/**/*.ts`.
- `bun run build:web-server` emits JavaScript and declarations.
- `bun run dev:server` starts from `server/src/main.ts`.
- Packaged/runtime entrypoints consume `server/dist/index.js`.
- Electron can import/start/stop the server without loading Bun-only modules.
- Critical route behavior is preserved where still desired.
- Terminal WebSocket sessions can start, stream output, replay buffered output, and clean up.
- Event-stream SSE/WebSocket paths preserve compression bypass, fanout, reconnect/liveness, and upstream parsing.
- The hand-written `server/index.d.ts` is deleted after TypeScript declarations exist.
- Old JavaScript implementation files are deleted after their domains migrate.

## Risk Controls

- Do not migrate terminal and event streaming in the same implementation slice.
- After each domain cutover, delete the replaced JavaScript immediately to avoid split-brain behavior.
- Keep public behavior tests close to routes and protocols, not old module structure.
- Prefer typed dependency injection over singleton globals.
- Keep Bun-only and native dependencies behind runtime-guarded dynamic imports.
- Treat direct TypeScript execution in Bun as a development convenience, not the production/runtime contract.
