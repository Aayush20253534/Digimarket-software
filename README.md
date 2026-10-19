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
If the dependency lockfile has not landed yet, use `pnpm install --no-frozen-lockfile` once. Main-branch CI is configured to commit a verified lockfile after passing validation.

## Workspace
~~~text
apps/
  api/       Express API: versioned health route + integration tests
  web/       Next.js App Router + server-side API connectivity screen
  worker/    reserved for future BullMQ queue consumers
packages/
  contracts/ Zod shared DTOs and tests
  db/        Prisma v7 datasource/generator foundation (no tables yet)
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
No public signup or client credentials stored here. **Authentication is not yet implemented**. All runtime provider credentials must be in untracked environment files or hosting secret stores; never commit real secrets to this public repository. Sensitive Cloudinary files must use authenticated delivery when the asset module is built.

## Roadmap
- [x] Module 0: product architecture and wireframes
- [x] Module 1: monorepo scaffold, API/web foundation and CI configuration (see actual GitHub Actions status for runtime verification)
- [ ] Module 2: initial database models and migrations
- [ ] Module 3: authentication and RBAC
- [ ] Module 4: dashboard UI and common components
- [ ] Modules 5–17: workflows, finance, CRM, clients, assets, projects, tasks, calendar, billing, profit, reporting, security and deployment

**Design and scaffolding are not a production release.**
