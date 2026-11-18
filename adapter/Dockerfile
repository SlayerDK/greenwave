# Built from the repo root: docker compose build adapter-aarhus, or docker build -f adapter/Dockerfile .
# The pattern every Node container copies; see docs/implementation-plans/02-migrate.md.

# Pin the minor version (check Docker Hub), the same one in every Dockerfile.
FROM node:24.22-alpine
# Prisma needs OpenSSL on Alpine.
RUN apk add --no-cache openssl && corepack enable
ENV PNPM_HOME="/pnpm" PATH="/pnpm:$PATH"
WORKDIR /app

# Cached until the lockfile or the root manifest changes. This layer holds every
# package in the lockfile (~1.5 GB), built with the scripts allowBuilds permits,
# which download Prisma's schema engine. Every Dockerfile is identical up to here,
# so all images share it. package.json is here for its packageManager: without
# it corepack runs the newest pnpm, and the install below would run another.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch

# Only this container's sources: the adapter and the contracts it imports.
# --ignore-scripts skips the root preinstall/postinstall (no Prisma client here).
COPY tsconfig.base.json ./
COPY shared shared
COPY adapter adapter
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/adapter..."

USER node
WORKDIR /app/adapter
CMD ["node", "--import", "tsx", "src/main.ts"]
