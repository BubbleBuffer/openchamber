#!/usr/bin/env bash
# Verify project: type-check, lint, build
set -uo pipefail
status=0
divider="――――"

echo ""
echo "$divider type-check $divider"
bun run type-check || status=1

echo ""
echo "$divider lint $divider"
bun run lint || status=1

echo ""
echo "$divider build $divider"
bun run build || status=1

echo ""
if [ "$status" -eq 0 ]; then
  echo "✓ verification passed"
else
  echo "✗ verification failed"
fi
exit $status
