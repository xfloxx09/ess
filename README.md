# ESS Platform

Production-grade rebuild of the Employee Self-Service platform: shift planning,
sales tracking, KPIs, anträge (requests), audit, real-time updates and CSV
imports for a contact-center workforce.

The repo is a **pnpm monorepo** containing:

| Workspace | Purpose |
| --- | --- |
| `apps/api` | NestJS API on PostgreSQL/Prisma. JWT + refresh-cookie auth, Socket.IO realtime, role + view-key based authz, audit log, CSV/PDF reports. |
| `apps/web` | Next.js 14 (App Router) UI with Tailwind, shadcn-style primitives, Tanstack Query, Zustand, react-hook-form, Sonner, lucide-react, recharts, next-themes, and a German/English locale switcher. |
| `packages/shared` | Type-only and runtime contracts shared between API and web (Zod schemas, view keys, real-time event union). |
| `infra/` | Local docker-compose for PostgreSQL. |

## Quick start (local)

Requirements: **Node 20.10+**, **pnpm 9.12+**, **Docker** (for the dev DB).

```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate

cp .env.example .env
pnpm install

# Start Postgres + create schema + seed demo data
pnpm db:up
pnpm --filter @ess/api run db:deploy
pnpm --filter @ess/api run db:seed

# Run API + Web concurrently
pnpm dev
```

Web: <http://localhost:3000> · API: <http://localhost:4000/health>

Demo accounts (seeded):

```
admin@ess.local        / ChangeMe123!
controlling@ess.local  / ChangeMe123!
agent@ess.local        / ChangeMe123!
agent2@ess.local       / ChangeMe123!
```

## Useful scripts

```bash
pnpm dev              # Postgres + API + Web in parallel (watch mode)
pnpm dev:api          # only API
pnpm dev:web          # only Web
pnpm build            # build everything (shared, api, web)
pnpm lint             # tsc + prettier checks
pnpm format           # prettier --write
pnpm test             # unit tests via vitest
pnpm db:up            # docker compose up postgres
pnpm db:migrate       # prisma migrate dev (development)
pnpm db:reset         # wipe + re-apply migrations
pnpm db:seed          # seed demo data
pnpm db:studio        # open Prisma Studio
```

## Configuration (env)

`apps/api` reads its environment through a Zod-validated loader
(`src/common/env.ts`). The full list lives in `.env.example`. The most
important variables:

| Var | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_ACCESS_SECRET` | yes | ≥ 16 chars, used for short-lived access tokens |
| `JWT_REFRESH_SECRET` | yes | ≥ 16 chars, used for refresh tokens (httpOnly cookie) |
| `JWT_ACCESS_TTL` | no | default `15m` |
| `JWT_REFRESH_TTL` | no | default `30d` |
| `CORS_ORIGINS` | no | comma list, e.g. `https://web.example.com` |
| `COOKIE_DOMAIN` | no | optional cookie scope |
| `COOKIE_SECURE` | no | default `true` in production |
| `NEXT_PUBLIC_API_BASE` | web | full URL of the API in production |

## Deployment to Railway

The repo ships first-class Railway configs:

- `apps/api/railway.json` – Dockerfile build, `migrate deploy` on start, health
  check at `/health`.
- `apps/web/railway.json` – Dockerfile build, Next standalone server, health
  check at `/login`.

Recommended setup on Railway:

1. **PostgreSQL** plugin (already provisioned).
2. **API service** – root `apps/api`, picks up `apps/api/Dockerfile`. Wire env:
   - `DATABASE_URL` ← `${{ Postgres.DATABASE_URL }}`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (`openssl rand -hex 32`)
   - `CORS_ORIGINS=https://<your-web>.up.railway.app`
   - `COOKIE_SECURE=true`, `NODE_ENV=production`
3. **Web service** – root `apps/web`, `apps/web/Dockerfile`. Wire env:
   - `NEXT_PUBLIC_API_BASE=https://<your-api>.up.railway.app` (set as
     **build-time** variable so it gets baked into the bundle).

After the API service is up the first time, run a one-off seed:

```bash
railway run --service api pnpm --filter @ess/api run db:seed
```

## Authorization model

System roles: **AGENT**, **CONTROLLING**, **ADMIN**.

Controllers/admins also configure **AccessRoles** (under
*Admin → Organisation & Rollen*) which grant additional **view keys** (e.g.
`controlling_roster_day`, `admin_users`) and optional **scopes** that limit
data to specific *Dienstleister / Abteilung / Project / Team* nodes. Backend
guards (`Roles`, `Access`) and frontend route guards (`useRequireAuth`)
respect this same view-key vocabulary.

## Realtime

The Nest API exposes a Socket.IO gateway under `/ws`. Clients authenticate
with the JWT access token via the Socket.IO `auth.token` field. The web app
auto-invalidates Tanstack Query caches on roster, antrag, notification and
import events (`apps/web/src/lib/realtime.tsx`).

## Importing data

`/imports` (Admin/Controlling) accepts CSV uploads with header rows for two
schemas:

- `KPI_DAILY` — `email,date,minuteIb,minuteOb,waitMinutes,salesEuro,npsEuro`
- `SALES`     — `email,date,project,product,quantity,contractRef`

Both run through a Zod-validated, transactional pipeline; rejected rows are
preserved in `ImportRow` for replay. Progress is streamed via WebSocket and
the user receives a notification on completion.

## Reports

`/reports` produces:

- KPI leaderboard (CSV)
- KPI summary (PDF, generated with `pdfkit`)
- Roster month export (CSV)

## Project structure highlights

```
apps/
  api/
    prisma/
      schema.prisma         # full DB model
      seed.ts               # demo seed
    src/
      common/               # env, prisma, authz helpers
      modules/
        auth/               # login + refresh + reset + argon2
        users/              # admin user CRUD
        admin-org-access/   # dienstleister/abteilung/project/team + access roles
        shiftplan/          # roster grid, history, reconciliation, agent month
        calendar/           # agent bookings + policies
        sales/              # sales entries + leaderboard inputs
        kpi/                # daily/monthly/dashboard
        antraege/           # disruption/meeting requests
        config/             # catalog & rule admin
        imports/            # CSV pipeline
        reports/            # CSV/PDF exports
        audit/              # audit log + CSV export
        notifications/      # in-app notifications + preferences
        realtime/           # Socket.IO gateway

apps/
  web/
    src/
      app/                  # App Router pages
      components/
        shell/              # sidebar, topbar, app shell, notifications bell
        ui/                 # shadcn-style primitives
      i18n/                 # German default + English
      lib/                  # api, auth, query, realtime, stores, utils

packages/
  shared/                   # zod schemas, view keys, role types, realtime events

infra/
  docker-compose.yml        # local Postgres
```

## License

Proprietary — © 2026 ESS Platform contributors.
