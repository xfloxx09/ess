################################################################################
# ESS API Dockerfile (production)
#
# Builds the NestJS API as a production image for Railway / any container
# platform. The runtime image preserves the pnpm workspace layout so the
# symlinks under apps/api/node_modules and packages/shared resolve correctly.
# At startup it runs `prisma migrate deploy` (or `db push` on first deploy)
# and then starts Nest. Set DATABASE_URL and JWT secrets at runtime.
################################################################################

# ----- Builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /repo

RUN apk add --no-cache libc6-compat openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifest + lockfile + the whole shared package first.
# (The root postinstall hook builds @ess/shared, so its sources must be
# present before `pnpm install`.) App sources come after for cache reuse.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

COPY apps/api apps/api

RUN pnpm --filter @ess/shared run build \
  && pnpm --filter @ess/api exec prisma generate \
  && pnpm --filter @ess/api run build

# Hard guarantee: if dist/main.js isn't here, fail the build immediately
# instead of producing a broken image that crash-loops at runtime.
RUN test -f apps/api/dist/main.js || (echo "FATAL: apps/api/dist/main.js missing after build" && exit 1)

# ----- Runtime ----------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl tini \
  && addgroup -S nodejs && adduser -S nestjs -G nodejs \
  && npm install -g prisma@5.22.0

# Preserve the pnpm workspace layout so the symlinks at apps/api/node_modules
# resolve into /app/node_modules/.pnpm/ correctly. Skipping `pnpm deploy` here
# because pnpm 9's deploy command can silently drop dist/ when the workspace
# package has no `files` field and dist is gitignored.
COPY --from=builder --chown=nestjs:nodejs /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml /app/
COPY --from=builder --chown=nestjs:nodejs /repo/node_modules /app/node_modules
COPY --from=builder --chown=nestjs:nodejs /repo/packages/shared/package.json /app/packages/shared/package.json
COPY --from=builder --chown=nestjs:nodejs /repo/packages/shared/dist /app/packages/shared/dist
COPY --from=builder --chown=nestjs:nodejs /repo/packages/shared/node_modules /app/packages/shared/node_modules
COPY --from=builder --chown=nestjs:nodejs /repo/apps/api/package.json /app/apps/api/package.json
COPY --from=builder --chown=nestjs:nodejs /repo/apps/api/dist /app/apps/api/dist
COPY --from=builder --chown=nestjs:nodejs /repo/apps/api/prisma /app/apps/api/prisma
COPY --from=builder --chown=nestjs:nodejs /repo/apps/api/node_modules /app/apps/api/node_modules

# Final sanity check that the built artifact is in the runtime image.
RUN test -f /app/apps/api/dist/main.js || (echo "FATAL: /app/apps/api/dist/main.js missing in runtime image" && exit 1)

WORKDIR /app/apps/api

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER nestjs

# tini = clean signal handling (Railway sends SIGTERM on rolling deploys).
ENTRYPOINT ["/sbin/tini", "--"]
# If migrations exist, apply them; otherwise push the schema (first-time deploy).
CMD ["sh", "-c", "if [ -d prisma/migrations ]; then prisma migrate deploy; else prisma db push --accept-data-loss --skip-generate; fi && node dist/main.js"]
