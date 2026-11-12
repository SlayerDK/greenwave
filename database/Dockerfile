# Built from the repo root: docker compose build migrate, or docker build -f database/Dockerfile .
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

# Only this container's sources. --ignore-scripts skips the root preinstall/postinstall;
# the client is generated below.
COPY tsconfig.base.json ./
COPY database database
RUN pnpm install --offline --frozen-lockfile --ignore-scripts --filter "@greenwave/database..."
RUN pnpm --filter @greenwave/database generate

USER node
WORKDIR /app/database
CMD ["node_modules/.bin/prisma", "migrate", "deploy"]
