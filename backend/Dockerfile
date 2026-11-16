# Built from the repo root: docker compose build backend.
FROM node:24.22-alpine
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

COPY tsconfig.base.json ./
COPY shared shared
COPY database database
COPY backend backend
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/backend..."
RUN pnpm --filter @greenwave/database generate

USER node
WORKDIR /app/backend
CMD ["node", "--import", "tsx", "src/main.ts"]
