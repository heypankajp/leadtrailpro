#!/bin/sh
# Runs the Selenium end-to-end suite in Docker: a fresh in-memory MySQL, the
# production build of the app, a Chromium grid, and the test runner.
#
#   scripts/e2e.sh                               # whole suite
#   scripts/e2e.sh tests/e2e/02-leads.test.mjs   # one or more files
#
# Watch the browser live at http://localhost:7900 while a run is in progress.
# Screenshots and page sources of failed tests land in tests/e2e/output/.
set -eu
cd "$(dirname "$0")/.."

if command -v docker >/dev/null 2>&1; then
  DOCKER=docker
else
  # Docker Desktop on macOS without the CLI on PATH.
  for candidate in "/Applications/Docker.app/Contents/Resources/bin/docker" "/Applications/Docker 2.app/Contents/Resources/bin/docker"; do
    if [ -x "$candidate" ]; then DOCKER="$candidate"; break; fi
  done
  [ -n "${DOCKER:-}" ] || { echo "docker not found: install Docker Desktop or put docker on PATH" >&2; exit 1; }
  PATH="$(dirname "$DOCKER"):$PATH"
  export PATH
fi

compose() { "$DOCKER" compose --profile test "$@"; }

# Start from a clean database (tmpfs) and a current build of the app.
compose rm -sf e2e app-test db-test selenium >/dev/null 2>&1 || true
compose build app-test e2e

status=0
if [ "$#" -gt 0 ]; then
  compose run --rm e2e node --test --test-concurrency=1 --test-timeout=120000 "$@" || status=$?
else
  compose run --rm e2e || status=$?
fi

compose rm -sf app-test db-test selenium >/dev/null 2>&1 || true
exit $status
