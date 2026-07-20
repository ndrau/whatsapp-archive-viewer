# WhatsApp Archive Viewer — TrueNAS / Portainer
#
# App-Image = nur Code. Persistente Datasets als Volumes:
#   /app/chats   ← DATA  (Uploads / WhatsApp-Exporte, überlebt Image-Updates)
#   /app/.built  ← BUILT (Index/JSON, jederzeit neu baubar)

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.12.0 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p chats .built \
  && pnpm exec next build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV BUILD_CHATS_ON_START=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates unzip \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g tsx@4.23.1 \
  && addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

# Next.js standalone (ohne volle node_modules)
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Nur für pnpm run build:chats zur Laufzeit (Volumes)
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./
COPY scripts/docker-entrypoint.mjs ./docker-entrypoint.mjs

RUN mkdir -p chats .built \
  && chown -R nextjs:nodejs /app

USER nextjs
EXPOSE 3000
CMD ["node", "docker-entrypoint.mjs"]
