#!/usr/bin/env bash
# Run the repository's release-candidate verification ladder.
set -uo pipefail

status=0
divider="――――"

run_step() {
  local name="$1"
  shift
  echo ""
  echo "$divider $name $divider"
  "$@" || status=1
}

run_step "type-check" bun run type-check
run_step "lint" bun run lint
run_step "architecture" bun run architecture:check
run_step "network contracts" bun run check:contracts
run_step "documentation" bun run docs:validate
run_step "script tests" bun run test:scripts
run_step "agent UI core tests" bun run --cwd packages/agent-ui-core test
run_step "agent UI React tests" bun run --cwd packages/agent-ui-react test
run_step "agent UI package artifacts" bun run verify:agent-ui-packages
run_step "session-state tests" bun run --cwd packages/session-state test
run_step "web unit/contract tests" bun run --cwd packages/web test
run_step "store tests" bun run test:stores
run_step "React tests" bun run test:react
run_step "integration tests" bun run test:integration
run_step "production build" bun run build

# Browser tests require an installed Playwright Chromium. CI and release
# validation opt in explicitly after installing it; local verification remains
# useful on machines without browser dependencies.
if [ "${VERIFY_BROWSER:-0}" = "1" ]; then
  run_step "browser workflows" bun run --cwd tests test:browser
  run_step "chat-load performance budget" bun run test:perf:chat
else
  echo ""
  echo "Browser verification skipped (set VERIFY_BROWSER=1 after installing Playwright Chromium)."
fi

echo ""
if [ "$status" -eq 0 ]; then
  echo "✓ verification passed"
else
  echo "✗ verification failed"
fi
exit "$status"
