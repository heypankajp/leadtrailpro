# syntax=docker/dockerfile:1.7
# LeadTrailPro container image.
#
#   dev    – hot-reloading `next dev` with the project bind-mounted (used by compose.yaml)
#   runner – minimal production image built from Next.js standalone output (compose.prod.yaml)
#   deployer – follows the repository's branch and rebuilds the stack (compose.prod.yaml, scripts/deployer.mjs)

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# ---------------------------------------------------------------------------
# Development: dependencies live in the image (and in the node_modules volume
# that compose creates from it); the source tree is bind-mounted at /app.
FROM base AS dev
COPY scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint
# .next is a volume in compose; create it here so the volume inherits node's ownership.
RUN chmod +x /usr/local/bin/docker-entrypoint && mkdir -p /app/.next && chown -R node:node /app
USER node
COPY --chown=node:node package.json package-lock.json ./
RUN --mount=type=cache,target=/home/node/.npm,uid=1000,gid=1000 \
    npm ci && cp package-lock.json node_modules/.package-lock.docker
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint"]
CMD ["npm", "run", "dev"]

# ---------------------------------------------------------------------------
# Production build.
FROM base AS builder
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Production runtime: only the traced standalone output, static assets, and the
# database scripts (so migrations can run from this image too).
FROM base AS runner
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN mkdir -p /app/storage/attachments && chown -R node:node /app
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/scripts ./scripts
# The commit the image was built from, when the build names one (the deployer does); GET /api/deploy reports it.
ARG GIT_COMMIT=""
ENV APP_COMMIT=${GIT_COMMIT}
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# ---------------------------------------------------------------------------
# Deployer: the Docker command line (it drives the host's daemon through the mounted socket), git, and Node for
# scripts/deployer.mjs. The script in the deployer's own clone wins once that clone exists and parses, so the
# deployer runs the code it deploys; the copy in the image only serves the first start.
FROM docker:28-cli AS deployer
RUN apk add --no-cache git nodejs
COPY scripts/deployer.mjs /opt/deployer/scripts/deployer.mjs
COPY scripts/lib/deploy-plan.mjs /opt/deployer/scripts/lib/deploy-plan.mjs
ENTRYPOINT []
CMD ["sh", "-c", "f=/work/repo/scripts/deployer.mjs; { [ -f \"$f\" ] && node --check \"$f\" 2>/dev/null; } || f=/opt/deployer/scripts/deployer.mjs; exec node \"$f\""]
