# Bootstrap domain

The bootstrap domain owns server composition and lifecycle orchestration. The
public adapter remains [`../../index.ts`](../../index.ts): it creates the
Express application, registers routes, starts the HTTP server, and returns the
`startWebUiServer` controller. [`server-composition.ts`](./server-composition.ts)
assembles the domain runtimes and the shared per-server lifecycle state; it
does not become a second route registry or a second CLI entrypoint.

## Lifecycle boundaries

These are separate resources with separate owners:

| Resource | Owner and responsibility |
| --- | --- |
| OpenChamber backend server | The bootstrap composition and `index.ts` own the Express/HTTP server, route and WebSocket registration, process handlers, and graceful shutdown. |
| Managed OpenCode subprocess | The OpenCode domain owns launch, readiness, health monitoring, and process state. Bootstrap cleanup stops it only when this server run created it. |
| Externally managed OpenCode connection | The OpenCode domain connects using the configured host/port (or skip-start mode). OpenChamber uses the connection but does not launch or stop the external process. |

An OpenCode connection is therefore not the OpenChamber server itself. Stopping
the backend closes its HTTP and streaming resources; it must not terminate an
externally managed OpenCode service.

## Composition and startup order

`createServerComposition()` eagerly assembles the settings, security,
notification, session, event-stream, proxy, and shutdown runtimes. OpenCode
domain creation is late-bound: `ensureOpenCodeDomain()` memoizes successful
creation, while the stable runtime proxy and callbacks resolve the current
domain after initialization. A failed domain construction is not memoized, so
the next startup can retry.

`startWebUiServer` follows this order:

1. Normalize startup options, create Express and compression middleware, and
   assign the HTTP server to lifecycle state.
2. Ensure the OpenCode domain, bind the Express app to it, and register base
   and feature routes.
3. Create static-route dependencies and run the startup pipeline. The pipeline
   creates terminal and event-stream WebSocket runtimes, configures the proxy,
   starts the non-blocking OpenCode bootstrap, registers static routes, listens
   on the resolved host/port, and installs process handlers.
4. Install Sentry's Express error handler and return the server controller.

Zen-model validation is intentionally started without blocking application
startup. The pipeline's OpenCode bootstrap is observed even when a later stage
fails, so a rejected startup cannot become an unhandled promise.

## Cleanup responsibilities

Startup rollback disposes only resources created by the failed run: process
handlers, event-stream and terminal runtimes, the HTTP server, UI auth, and a
managed OpenCode process/port when ownership changed during that run. Cleanup
failures are logged while the original startup error is rethrown.

The controller's `stop()` delegates to graceful shutdown. Shutdown disposes
process handlers, watchers, session and notification resources, health checks,
terminal and event-stream runtimes, then stops a managed OpenCode process when
appropriate and closes the OpenChamber HTTP server. External OpenCode
connections are explicitly left running.
