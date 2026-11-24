FROM node:24.22-alpine AS base
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

FROM base AS builder
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY tsconfig.base.json ./
COPY shared shared
COPY database database
COPY predictor predictor
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/predictor..."
RUN pnpm --filter @greenwave/database generate

FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app/predictor
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/predictor /app/predictor
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/database /app/database
CMD ["node", "--import", "tsx", "src/main.ts"]
