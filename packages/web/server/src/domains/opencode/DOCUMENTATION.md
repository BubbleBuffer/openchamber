# OpenCode Module Documentation

## Purpose
This module provides OpenCode server integration utilities for the web server runtime, including configuration management and provider authentication.

## Directory layout

```
packages/web/server/src/domains/opencode/
  index.ts                    # Public entrypoint
  runtime.ts                  # Domain composition wrapper
  open-code-runtime.ts        # Managed/external OpenCode runtime state
  lifecycle.ts                # OpenCode process lifecycle
  routes/                     # OpenCode-owned HTTP route registration
  services/                   # Skills, commands, providers, agents, MCP helpers
  types.ts                    # Domain dependency and return contracts
```

When adding new files, place them inside the matching subfolder. Cross-cutting OpenCode process/runtime behavior stays at the module root; reusable support shared with other domains belongs in `packages/web/server/src/domains/opencode-support/`, `auth/`, `server-utils/`, or another focused domain.

## Entrypoints and structure
- `index.ts`: public entrypoint exporting `createOpenCodeDomain` and domain types.
- `runtime.ts`: adapts composition-root dependencies into the OpenCode runtime contract.
- `open-code-runtime.ts`: OpenCode process/runtime state, readiness, restart, proxy wiring, and auth header behavior.
- `lifecycle.ts`: managed/external OpenCode process lifecycle, startup, restart, readiness, and health monitoring.
- `routes/routes.ts`: OpenCode/provider settings and auth-related route registration.
- `routes/config-entity-routes.ts`: route registration for agent/command/MCP config orchestration and reload semantics.
- `routes/core-routes.ts`: server status/system routes, auth/access guard routes, and settings utility route registration.
- `routes/project-icon-routes.ts`: project icon upload/read/discovery route registration and icon storage orchestration.
- `routes/skill-routes.ts`: route registration for skill config CRUD, supporting files, and skills catalog scan/install flows.
- `services/skills.ts`, `services/commands.ts`, `services/providers.ts`, `services/agents.ts`, `services/mcp.ts`: per-domain config helpers.
- `../opencode-support/*`: OpenCode auth state, network, environment, project-directory, HMR, watcher, and binary-resolution support shared by this domain.
- `../auth/*`: provider authentication file operations and OpenCode auth state support.
- `../ui-auth/ui-auth.ts` and `../ui-auth/ui-passkeys.ts`: UI session authentication and passkey runtimes outside the OpenCode module.

## Public exports (auth/provider-auth.ts)
- `readAuthFile()`: Reads and parses `~/.local/share/opencode/auth.json`.
- `writeAuthFile(auth)`: Writes auth file with automatic backup.
- `removeProviderAuth(providerId)`: Removes a provider's auth entry.
- `getProviderAuth(providerId)`: Returns auth for a specific provider or null.
- `listProviderAuths()`: Returns list of provider IDs with configured auth.
- `AUTH_FILE`: Auth file path constant.
- `OPENCODE_DATA_DIR`: OpenCode data directory path constant.

## Public exports (opencode-support and services)
- `OPENCODE_CONFIG_DIR`, `AGENT_DIR`, `COMMAND_DIR`, `SKILL_DIR`, `CONFIG_FILE`, `CUSTOM_CONFIG_FILE`: Path constants.
- `AGENT_SCOPE`, `COMMAND_SCOPE`, `SKILL_SCOPE`: Scope constants with USER and PROJECT values.
- `ensureDirs()`: Creates required OpenCode directories.
- `parseMdFile(filePath)`, `writeMdFile(filePath, frontmatter, body)`: Markdown file operations with YAML frontmatter.
- `getConfigPaths(workingDirectory)`, `readConfigLayers(workingDirectory)`, `readConfig(workingDirectory)`: Config file operations with layer merging (user, project, custom).
- `writeConfig(config, filePath)`: Writes config with automatic backup.
- `getJsonEntrySource(layers, sectionKey, entryName)`: Resolves which config layer provides an entry.
- `getJsonWriteTarget(layers, preferredScope)`: Determines write target for config updates.
- `getAncestors(startDir, stopDir)`, `findWorktreeRoot(startDir)`: Git worktree helpers.
- `isPromptFileReference(value)`, `resolvePromptFilePath(reference)`, `writePromptFile(filePath, content)`: Prompt file reference handling.
- `walkSkillMdFiles(rootDir)`: Recursively finds all SKILL.md files.
- `addSkillFromMdFile(skillsMap, skillMdPath, scope, source)`: Parses and indexes a skill file.
- `resolveSkillSearchDirectories(workingDirectory)`: Returns skill search path order (config, project, home, custom).
- `listSkillSupportingFiles(skillDir)`, `readSkillSupportingFile(skillDir, relativePath)`, `writeSkillSupportingFile(skillDir, relativePath, content)`, `deleteSkillSupportingFile(skillDir, relativePath)`: Skill supporting file management.

## Public exports (`routes/routes.ts`)
- `registerOpenCodeRoutes(app, dependencies)`: Registers OpenCode-owned HTTP routes and internal module runtime:
  - `GET /api/config/settings`
  - `PUT /api/config/settings`
  - `GET /api/config/opencode-resolution`
  - `POST /api/opencode/directory`
  - `GET /api/provider/:providerId/source`
  - `DELETE /api/provider/:providerId/auth`
- Owns lazy auth library loading for provider auth checks/removal.
- Keeps route behavior independent from composition root; `index.ts` now supplies dependencies only.

## Public exports (sessions/session-runtime.ts)
- `createSessionRuntime({ writeSseEvent, getNotificationClients, broadcastEvent? })`: creates runtime-owned state machine and APIs for session status.
- Returned API:
  - `processOpenCodeSsePayload(payload)`
  - `getSessionActivitySnapshot()`
  - `getSessionStateSnapshot()`
  - `getSessionAttentionSnapshot()`
  - `getSessionState(sessionId)`
  - `getSessionAttentionState(sessionId)`
  - `markSessionViewed(sessionId, clientId)`
  - `markSessionUnviewed(sessionId, clientId)`
  - `markUserMessageSent(sessionId)`
  - `resetAllSessionActivityToIdle()`
  - `dispose()`

## Public exports (`lifecycle.ts`)
- `createOpenCodeLifecycleRuntime(dependencies)`: creates lifecycle runtime for managed/external OpenCode process orchestration.
- Returned API:
  - `startOpenCode()`
  - `restartOpenCode()`
  - `waitForOpenCodeReady(timeoutMs?, intervalMs?)`
  - `waitForAgentPresence(agentName, timeoutMs?, intervalMs?)`
  - `refreshOpenCodeAfterConfigChange(reason, options?)`
  - `bootstrapOpenCodeAtStartup()`
  - `startHealthMonitoring(healthCheckIntervalMs)`
  - `waitForPortRelease(port, timeoutMs, hostname?)`
  - `killProcessOnPort(port)`

## Public exports (env-runtime.js)
- `createOpenCodeEnvRuntime(dependencies)`: creates runtime that owns OpenCode CLI environment and binary discovery state.
- Returned API:
  - `applyLoginShellEnvSnapshot()`
  - `getLoginShellEnvSnapshot()`
  - `ensureOpencodeCliEnv()`
  - `applyOpencodeBinaryFromSettings()`
  - `resolveOpencodeCliPath()`
  - `resolveManagedOpenCodeLaunchSpec(opencodePath)`: resolves the effective managed OpenCode launch target, unwrapping Windows package-manager shims to a direct native binary or explicit runtime+script when possible.
  - `resolveGitBinaryForSpawn()`
  - `resolveWslExecutablePath()`
  - `buildWslExecArgs(execArgs, distroOverride?)`
  - `isExecutable(filePath)`
  - `searchPathFor(binaryName)`
  - `clearResolvedOpenCodeBinary()`

## Public exports (env-config.js)
- `resolveOpenCodeEnvConfig(options?)`: resolves and validates OpenCode host/port/hostname environment configuration.
- Returned object fields:
  - `configuredOpenCodePort`
  - `configuredOpenCodeHost`
  - `effectivePort`
  - `configuredOpenCodeHostname`

## Public exports (hmr-state-runtime.js)
- `createHmrStateRuntime(dependencies)`: creates runtime for HMR state container initialization and runtime<->HMR state synchronization.
- Returned API:
  - `getOrCreateHmrState()`
  - `ensureUserProvidedOpenCodePassword(hmrState)`
  - `getUserProvidedOpenCodePassword(hmrState)`
  - `resolveOpenCodeAuthFromState({ hmrState, userProvidedOpenCodePassword })`
  - `syncStateFromRuntime(hmrState, runtime)`
  - `restoreRuntimeFromState({ hmrState, userProvidedOpenCodePassword })`

## Public exports (bootstrap-runtime.js)
- `createBootstrapRuntime(dependencies)`: creates runtime for base app route bootstrap and UI auth controller initialization.
- Returned API:
  - `setupBaseRoutes(app, options)`

## Public exports (network-runtime.js)
- `createOpenCodeNetworkRuntime(dependencies)`: creates runtime for OpenCode network and URL concerns.
- Returned API:
  - `waitForReady(url, timeoutMs?)`
  - `normalizeApiPrefix(prefix)`
  - `setDetectedOpenCodeApiPrefix()`
  - `buildOpenCodeUrl(path, prefixOverride?)`
  - `ensureOpenCodeApiPrefix()`
  - `scheduleOpenCodeApiDetection()`

## Public exports (settings-runtime.js)
- `createSettingsRuntime(dependencies)`: creates settings lifecycle runtime for read/migrate/persist concerns.
- Returned API:
  - `readSettingsFromDisk()`
  - `readSettingsFromDiskMigrated()`
  - `writeSettingsToDisk(settings)`
  - `persistSettings(changes)`

## Public exports (settings-helpers.js)
- `createSettingsHelpers(dependencies)`: creates settings helper runtime for settings request/response shaping.
- Returned API:
  - `normalizePwaAppName(value, fallback?)`
  - `sanitizeSettingsUpdate(payload)`
  - `mergePersistedSettings(current, changes)`
  - `formatSettingsResponse(settings)`

## Public exports (settings-normalization-runtime.js)
- `createSettingsNormalizationRuntime(dependencies)`: creates normalization/sanitization runtime for shared settings and tunnel helper logic.
- Returned API:
  - `normalizeDirectoryPath(value)`
  - `normalizePathForPersistence(value)`
  - `normalizeSettingsPaths(input)`
  - `normalizeTunnelBootstrapTtlMs(value)`
  - `normalizeTunnelSessionTtlMs(value)`
  - `normalizeManagedRemoteTunnelHostname(value)`
  - `normalizeManagedRemoteTunnelPresets(value)`
  - `normalizeManagedRemoteTunnelPresetTokens(value)`
  - `isUnsafeSkillRelativePath(value)`
  - `sanitizeTypographySizesPartial(input)`
  - `normalizeStringArray(input)`
  - `sanitizeModelRefs(input, limit)`
  - `sanitizeSkillCatalogs(input)`
  - `sanitizeProjects(input)`

## Public exports (theme-runtime.js)
- `createThemeRuntime(dependencies)`: creates custom theme runtime for on-disk theme discovery and JSON normalization/validation.
- Returned API:
  - `normalizeThemeJson(raw)`
  - `readCustomThemesFromDisk()`

## Public exports (project-directory-runtime.js)
- `createProjectDirectoryRuntime(dependencies)`: creates runtime for request/project directory candidate normalization and validation.
- Returned API:
  - `resolveDirectoryCandidate(value)`
  - `validateDirectoryPath(candidate)`
  - `resolveProjectDirectory(req)`
  - `resolveOptionalProjectDirectory(req)`

## Public exports (`routes/config-entity-routes.ts`)
- `registerConfigEntityRoutes(app, dependencies)`: registers configuration entity routes:
  - Agents: `/api/config/agents/:name` and `/api/config/agents/:name/config`
  - Commands: `/api/config/commands/:name`
  - MCP servers: `/api/config/mcp` and `/api/config/mcp/:name`

## Public exports (auth-state-runtime.js)
- `createOpenCodeAuthStateRuntime(dependencies)`: creates runtime for managed OpenCode auth password state and request headers.
- Returned API:
  - `getOpenCodeAuthHeaders()`
  - `isOpenCodeConnectionSecure()`
  - `ensureLocalOpenCodeServerPassword(options?)`

## Public exports (`routes/core-routes.ts`)
- `registerServerStatusRoutes(app, dependencies)`: registers status/system endpoints:
  - `GET /health`
  - `POST /api/system/shutdown`
  - `GET /api/system/info`
 - `registerAuthAndAccessRoutes(app, dependencies)`: registers browser auth/session exchange and API access middleware:
   - `GET /auth/session`
   - `POST /auth/session`
   - `GET /auth/passkey/status`
   - `POST /auth/passkey/authenticate/options`
   - `POST /auth/passkey/authenticate/verify`
   - `POST /auth/passkey/register/options`
   - `POST /auth/passkey/register/verify`
   - `GET /api/passkeys`
   - `DELETE /api/passkeys/:id`
   - `POST /api/auth/reset`
   - `GET /connect`
   - `app.use('/api', ...)` auth/tunnel guard
- `registerSettingsUtilityRoutes(app, dependencies)`: registers small settings utility endpoints:
  - `GET /api/config/themes`
  - `POST /api/config/reload`
- `registerCommonRequestMiddleware(app, dependencies)`: registers shared request middleware stack:
  - conditional JSON body parser behavior for `/api/*` vs non-API requests
  - URL-encoded parser setup
  - request logging middleware

## Public exports (cli-options.js)
- `parseServeCliOptions(options)`: parses serve CLI flags and environment-derived defaults:
  - Port/host/ui-password
  - Tunnel provider/mode/config/token/hostname
  - Legacy `--tunnel` shorthand normalization

## Public exports (cli-entry-runtime.js)
- `runCliEntryIfMain(dependencies)`: detects direct CLI execution and runs server startup with parsed CLI options.

## Public exports (server-utils-runtime.js)
- `createServerUtilsRuntime(dependencies)`: creates server utility runtime for OpenCode orchestration helpers.
- Returned API:
  - `setOpenCodePort(port)`
  - `waitForOpenCodePort(timeoutMs?)`
  - `buildAugmentedPath()`
  - `parseSseDataPayload(block)`
  - `fetchAgentsSnapshot()`
  - `fetchProvidersSnapshot()`
  - `fetchModelsSnapshot()`
  - `setupProxy(app)`

## Public exports (shutdown-runtime.js)
- `createGracefulShutdownRuntime(dependencies)`: creates graceful shutdown runtime for managed OpenCode and web server teardown sequencing.
- Returned API:
  - `gracefulShutdown(options?)`

## Public exports (server-startup-runtime.js)
- `createServerStartupRuntime(dependencies)`: creates runtime for server bind/startup tunnel and process handler wiring.
- Returned API:
  - `resolveBindHost(host)`
  - `startListeningAndMaybeTunnel(options)`
  - `attachProcessHandlers(options)`

## Public exports (static-routes-runtime.js)
- `createStaticRoutesRuntime(dependencies)`: creates runtime for static dist resolution and static route registration.
- Returned API:
  - `registerStaticRoutes(app)`

## Public exports (feature-routes-runtime.js)
- `createFeatureRoutesRuntime(dependencies)`: creates runtime for main feature route registration orchestration.
- Returned API:
  - `registerRoutes(app, routeDependencies)`

## Public exports (opencode-resolution-runtime.js)
- `createOpenCodeResolutionRuntime(dependencies)`: creates runtime for OpenCode binary/source snapshot resolution.
- Returned API:
  - `getOpenCodeResolutionSnapshot(settings)`: returns configured/resolved OpenCode binary details plus effective managed-launch fields (`launchBinary`, `launchArgs`, `launchWrapperType`) when applicable.

## Public exports (tunnel-wiring-runtime.js)
- `createTunnelWiringRuntime(dependencies)`: creates runtime for tunnel service construction and tunnel route registration.
- Returned API:
  - `initialize(app, initialPort)`

## Public exports (startup-pipeline-runtime.js)
- `createStartupPipelineRuntime(dependencies)`: creates runtime for terminal wiring, proxy/bootstrap scheduling, static route registration, and server startup/listen flow.
- Returned API:
  - `run(options)`

## Public exports (routes/core-routes.ts and sibling route domains)
- `registerOpenChamberRoutes(app, dependencies)`: registers OpenChamber endpoints:
  - `GET /api/openchamber/update-check`
  - `POST /api/openchamber/update-install`
  - `GET /api/openchamber/models-metadata`
  - `GET /api/zen/models`

## Public exports (PWA manifest routes)
- `registerPwaManifestRoute(app, dependencies)`: registers PWA manifest endpoint with dynamic app-name resolution and recent-session shortcuts:
  - `GET /manifest.webmanifest`

## Public exports (`routes/project-icon-routes.ts`)
- `registerProjectIconRoutes(app, dependencies)`: registers project icon routes and owns icon storage/discovery flow:
  - `GET /api/projects/:projectId/icon`
  - `PUT /api/projects/:projectId/icon`
  - `DELETE /api/projects/:projectId/icon`
  - `POST /api/projects/:projectId/icon/discover`

## Public exports (`routes/skill-routes.ts`)
- `registerSkillRoutes(app, dependencies)`: registers skills-related routes:
  - Skills config CRUD and metadata under `/api/config/skills*`
  - Skills catalog listing/source pagination, scan, and install routes
  - Supporting skill file read/write/delete routes

## Public exports (proxy.js)
- `registerOpenCodeProxy(app, dependencies)`: registers OpenCode proxy routes and middleware.
- Owns:
  - SSE forwarders: `GET /api/global/event`, `GET /api/event`
  - Session message forwarder: `POST /api/session/:sessionId/message`
  - Generic `/api/*` forwarding with hop-by-hop header filtering
  - Windows `/session` merge fallback path behavior
  - OpenCode readiness gate for proxied `/api` requests

## Public exports (watcher.js)
- `createOpenCodeWatcherRuntime(dependencies)`: creates global event watcher runtime backed by the shared upstream SSE reader.
- Returned API:
  - `start()`
  - `stop()`
- Behavior:
  - Waits for OpenCode readiness before attaching the watcher.
  - In production wiring, subscribes to the shared global message-stream hub instead of opening its own `/global/event` connection.
  - Can still create its own `/global/event` reader when no shared hub is provided, which keeps module tests and isolated reuse simple.
  - Reuses event-stream parsing, `Last-Event-ID`, stall timeout, and reconnect behavior.
  - Forwards unwrapped global event payloads into notification/session side effects.

## Storage and configuration
- Provider auth: `~/.local/share/opencode/auth.json`.
- User config: `~/.config/opencode/opencode.json`.
- Project config: `<workingDirectory>/.opencode/opencode.json` or `opencode.json`.
- Custom config: `OPENCODE_CONFIG` env var path.
- Rate limit config: `OPENCHAMBER_RATE_LIMIT_MAX_ATTEMPTS`, `OPENCHAMBER_RATE_LIMIT_NO_IP_MAX_ATTEMPTS` env vars.

## Notes for contributors
- This module serves as foundation for OpenCode-related server utilities.
- Route ownership lives in module-level route files; `index.ts` wires dependencies only.
- All file writes include automatic backup before modification.
- Config merging follows priority: custom > project > user.
- UI auth uses scrypt for password hashing with constant-time comparison.
- Tunnel auth treats `host.docker.internal` as local-only when the socket remote IP is private/loopback.
