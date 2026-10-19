# DigiMarket Software

An internal digital marketing agency workspace, built as a pnpm TypeScript monorepo. Module 0 specifications are maintained under [docs/](docs/). Module 1 introduces the executable foundation: Next.js web, Express API, shared contracts, Prisma workspace, local Redis, CI and smoke testing.

## Stack
- **Web:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4
- **API:** Node.js 22, Express 5, TypeScript, Helmet, CORS
- **Contracts:** shared Zod v4 schemas and TypeScript types
- **Database foundation:** Prisma v7 for planned Neon PostgreSQL (actual schema/migrations start in Module 2)
- **Infra:** pnpm 10, Docker Compose Redis for later queues/caches, Cloudinary environment placeholders
- **Quality:** ESLint 9, Prettier, Vitest, Supertest, GitHub Actions, integrated web/API smoke

## Setup
Prerequisites: Node 22, pnpm 10.34.5 (Corepack or standalone), internet access for dependency installation.

~~~bash
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
~~~

- Web: http://localhost:3000
- API: http://localhost:4000/api/v1/health

The web homepage performs a real server-side health request to Express and displays **Connected** or **Unavailable**. No mock business records are served.

For optional local Redis: `docker compose up -d redis`. This is not required to run Module 1.

## Validation
~~~bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# Start production API and web in separate terminals:
pnpm --filter @digimarket/api start
pnpm --filter @digimarket/web start
# Then:
pnpm smoke
~~~
The committed `pnpm-lock.yaml` is used with `--frozen-lockfile` in CI and local installations.

## Workspace
~~~text
apps/
  api/       Express API: versioned health route + integration tests
  web/       Next.js App Router + server-side API connectivity screen
  worker/    reserved for future BullMQ queue consumers
packages/
  contracts/ Zod shared DTOs and tests
  db/        Prisma v7 organization and identity models with committed migrations
  ui/        reserved for shared UI components
scripts/
  smoke.mjs  real HTTP web + API integration probe
docs/        full product, architecture, DB, permissions and UI specifications
~~~

## Documentation
- [PRD](docs/01-PRD.md), [architecture](docs/02-ARCHITECTURE.md), [data model](docs/03-DATABASE-DESIGN.md), [permissions](docs/04-PERMISSIONS.md)
- [Module roadmap](docs/09-MODULE-ROADMAP.md) and [UI wireframes](docs/wireframes/README.md)
- [Module 1 setup, boundaries and verification](docs/12-MODULE-01-IMPLEMENTATION.md)

## Security
No public signup or client credentials stored here. **Authentication is implemented at the API level, but no production organization or user has been bootstrapped.**. All runtime provider credentials must be in untracked environment files or hosting secret stores; never commit real secrets to this public repository. Sensitive Cloudinary files must use authenticated delivery when the asset module is built.

## Roadmap
- [x] Module 0: product architecture and wireframes
- [x] Module 1: monorepo scaffold, API/web foundation and CI configuration (see actual GitHub Actions status for runtime verification)
- [x] Module 2: initial database models, migrations and isolated PostgreSQL validation
- [x] Module 3: authentication, admin user provisioning, JWT sessions, MFA and RBAC
- [x] Module 4: secure login UI, protected dashboard, admin user management and app shell
- [x] Module 5: approval policies, request queue, atomic decisions, role-aware UI and PostgreSQL integration
- [x] Module 6: organization-wide finance categories, income/expense approval ledger, exact posted/pending sums, scoped CSV exports
- [ ] Modules 7–17: CRM, clients, assets, projects, tasks, calendar, billing, profit, reporting, security and deployment

**Design and scaffolding are not a production release.**

## Module 2 database milestone
Prisma 7 defines the initial organization, user, session, role/permission, team/founder, audit and outbox models. Migration SQL is versioned in `packages/db/prisma/migrations/` and is tested with a GitHub Actions PostgreSQL service. See [Module 2 implementation](docs/13-MODULE-02-IMPLEMENTATION.md). This milestone does **not** connect to a live agency Neon database or create employee credentials.

## Module 3: authenticated API foundation
Secure identity routes and server-side authorization are implemented in `apps/api/src/auth`. First administrator provisioning uses a **one-time cloud CLI task**, not public signup. Existing non-auth application routes remain limited to health checks. The [Module 3 specification](docs/14-MODULE-03-AUTH.md) documents the endpoints, secret configuration and verification. User-facing login and administrator dashboards were delivered in Module 4.

## Module 4 interface
The actual browser application exposes `/login`, `/app/dashboard`, `/app/profile` and `/app/team/users`. It uses same-origin `/api/v1/*` for an allowlisted set of backend API routes and keeps bearer access tokens only in memory. Business modules not implemented yet are labeled as coming later. See [Module 4 implementation](docs/15-MODULE-04-UI.md).

## Module 5 approval workflows
The `/app/approvals` screen provides submissions, a role-filtered decision queue and configuration of category policies. An administrator must create an active policy before anyone can submit requests. Approval outcomes do not post accounting or publish content until those feature modules are implemented. The reusable state machine prevents self-approval and concurrent duplicate decisions. See [Module 5 implementation](docs/16-MODULE-05-APPROVALS.md).

## Module 6 income & expenses
The `/app/finance` screen creates user-scoped income/expense submissions with administrator-managed categories, approval-gated posting and exact decimal sums. The FINANCE approval policy is required first; authorized reviewers resolve those entries from `/app/approvals`. CSV exports are permission-scoped. See [Module 6 finance details](docs/17-MODULE-06-FINANCE.md). No live banking, Cloudinary receipts or production Neon deployment is performed here.
