# syntax=docker/dockerfile:1.7
# LeadTrailPro container image.
#
#   dev    – hot-reloading `next dev` with the project bind-mounted (used by compose.yaml)
#   runner – minimal production image built from Next.js standalone output (compose.prod.yaml)

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
USER node
EXPOSE 3000
CMD ["node", "server.js"]
