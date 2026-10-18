#!/bin/sh
# Entrypoint for the development container (Dockerfile target `dev`).
# The node_modules directory is a Docker volume seeded from the image. When
# package-lock.json changes (git pull, npm install on the host) the volume is
# stale, so reinstall before starting the requested command.
set -e

if [ -f package-lock.json ]; then
  stamp="node_modules/.package-lock.docker"
  if [ ! -f "$stamp" ] || ! cmp -s package-lock.json "$stamp"; then
    echo "package-lock.json changed since dependencies were installed; running npm ci..."
    npm ci
    cp package-lock.json "$stamp"
  fi
fi

exec "$@"
