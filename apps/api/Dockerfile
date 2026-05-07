################################################################################
# ESS API Dockerfile (production)
#
# Builds the NestJS API as a slim production image. Designed for Railway, but
# works on any container platform. The image runs `prisma migrate deploy` then
# starts Nest. Set DATABASE_URL and the JWT secrets at runtime.
################################################################################

# ----- Builder ----------------------------------------------------------------
FROM node:20-alpine AS builder
WORKDIR /repo

RUN apk add --no-cache libc6-compat openssl python3 make g++ \
  && corepack enable \
  && corepack prepare pnpm@9.12.0 --activate

# Copy workspace manifest + lockfile first to maximise Docker cache reuse.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile

# Now copy sources and build.
COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @ess/shared run build \
  && pnpm --filter @ess/api exec prisma generate \
  && pnpm --filter @ess/api run build \
  && pnpm --filter @ess/api deploy --prod /app/api

# ----- Runtime ----------------------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache libc6-compat openssl tini \
  && addgroup -S nodejs && adduser -S nestjs -G nodejs

COPY --from=builder --chown=nestjs:nodejs /app/api /app
COPY --from=builder --chown=nestjs:nodejs /repo/apps/api/prisma /app/prisma

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

USER nestjs

# tini = clean signal handling (Railway sends SIGTERM on rolling deploys).
ENTRYPOINT ["/sbin/tini", "--"]
# If migrations exist, apply them; otherwise push the schema (first-time deploy).
CMD ["sh", "-c", "if [ -d prisma/migrations ]; then node node_modules/prisma/build/index.js migrate deploy; else node node_modules/prisma/build/index.js db push --accept-data-loss --skip-generate; fi && node dist/main.js"]
