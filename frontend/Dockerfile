# Built from the repo root: docker compose build frontend.
FROM node:24.22-alpine AS base
# Identical to every other Dockerfile up to `RUN pnpm fetch`, so the images share its layer.
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
ENV NEXT_TELEMETRY_DISABLED=1
COPY tsconfig.base.json ./
COPY shared shared
COPY database database
COPY frontend frontend
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/frontend..."
RUN pnpm --filter @greenwave/database generate
# No .env in the image: real values arrive at runtime.
ENV STANDALONE_BUILD=1 SKIP_ENV_VALIDATION=1
RUN pnpm --filter @greenwave/frontend build

FROM base AS runner
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static ./frontend/.next/static
COPY --from=builder /app/frontend/public ./frontend/public
USER nextjs
EXPOSE 3000
CMD ["node", "frontend/server.js"]
