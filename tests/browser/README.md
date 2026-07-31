# Browser regression tests

The browser lane is owned by Playwright Test and is intentionally separate from
the Vitest/Bun runners. Run it from the repository root with:

```bash
bun run build
bun run --cwd tests test:browser
```

The default project starts a real, locally installed `opencode` binary and the
built OpenChamber CLI in the foreground. Each Playwright worker gets separate
`HOME`, XDG, OpenCode, and OpenChamber data/log/config directories. OpenCode
instances record their PID and owner identity and use the existing sibling watchdog; teardown
signals only the child handles created by that worker. No user database,
canary URL, process-name matching, or broad port cleanup is used.

Chromium must be installed for Playwright (`bunx playwright install chromium`).
The fixture resolves `bun` through `PATH`; set `BUN_BINARY` only when an
explicit Bun executable is required.
The browser fixture uses the explicit `OPENCHAMBER_SKIP_ZEN_MODEL_VALIDATION`
test seam, so the startup smoke does not access the external Zen model service.

The deterministic session-load budget can be run independently:

```bash
bun run test:perf:chat
```

It measures the complete browser path from session selection to text appearing
in the DOM. The local isolated runtime must keep a true cold load below 2,000 ms
and cached or hover-prefetched loads below 250 ms. The test logs cold request
timings plus all warm samples so regressions can be diagnosed without a trace.

Model workflows use the loopback-only fake OpenAI-compatible provider. OpenCode
is configured with provider `browser-test`, model `test-model`, and the fixture
key `browser-test-key`; protocol tests cover deterministic text/tool streams,
delays, HTTP 429/500 responses, malformed SSE, and abrupt disconnects. No
external provider or credential is used.
