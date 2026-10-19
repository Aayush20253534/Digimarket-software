# Module 1 implementation notes
**Status:** Complete and verified by GitHub Actions on 2026-10-19. No production deployment or provider credentials.

## Delivered
- Root pnpm workspace with Node 22, shared TypeScript config, ESLint, Prettier.
- Next.js 16 App Router frontend in apps/web with Tailwind CSS 4 and responsive foundation screen.
- Express 5 API in apps/api with Helmet, restricted CORS, JSON body limit, versioned /api/v1/health and structured 404.
- Shared Zod contract package with health response parser/types.
- Vitest contract tests and Supertest API tests.
- Prisma v7 workspace and Postgres datasource/config. No tables or migrations until Module 2.
- Redis local Docker Compose service with loopback-only published port and basic healthcheck.
- Cloudinary, Redis, Neon, auth environment variable names documented. No credentials checked in.
- Worker and shared UI workspaces reserved for later feature modules; no fake worker activity.
- GitHub Actions CI for install, lint, typecheck, tests, build and browser-server-to-API smoke.
- Smoke script that checks both Express health and Next.js server-side API fetch.

## Prerequisites
- Node.js 22.x
- Corepack/pnpm 10.34.5
- Optional Docker Engine + Compose for local Redis
- Internet access to package registry for first install

## Quick start
~~~bash
git clone https://github.com/Aayush20253534/Digimarket-software.git
cd Digimarket-software
corepack enable
corepack prepare pnpm@10.34.5 --activate
pnpm install --frozen-lockfile
cp .env.example .env
pnpm dev
~~~
Then visit http://localhost:3000/ and the API health endpoint http://localhost:4000/api/v1/health.

The generated `pnpm-lock.yaml` has been committed by the successful initial CI run. Subsequent installations and CI use `pnpm install --frozen-lockfile`.

## Optional Redis
~~~bash
docker compose up -d redis
docker compose ps
docker compose down
~~~
Redis is not required for the first health endpoint. No queue consumer or database API exists yet.

## Commands
~~~bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
# In one terminal, run pnpm --filter @digimarket/api start
# In another, run pnpm --filter @digimarket/web start
pnpm smoke
~~~
`pnpm smoke` asserts API and frontend together are reachable and Next.js rendered the live Express status.

## App/API separation
- Web internal API target: `API_INTERNAL_URL` (server-only; defaults to http://127.0.0.1:4000).
- API CORS allowed browser origins: comma-separated `CORS_ALLOWED_ORIGINS`.
- API bind port: `PORT` (default 4000).
- Browser does not yet call authenticated routes; Module 3 will add auth/session mechanism.

## Prisma / Neon future integration
- `packages/db/prisma/schema.prisma` has only generator/datasource; `prisma.config.ts` prioritizes `DIRECT_DATABASE_URL`.
- Runtime `DATABASE_URL` must be a pooled Neon connection string.
- Module 2 will add identity and organization models, real migrations and database tests. Do not interpret schema initialization as a functioning database connection.

## Delivery constraints and notes
- `pnpm-lock.yaml` was generated and committed after a successful GitHub Actions run.
- Cloudinary is not connected: private asset upload/download functionality begins in Module 9.
- Redis is provisioned locally but API does not yet depend on it.
- Authentication and permissions are specified but not implemented until Module 3.
- Deployment topology is defined; no Vercel/Render services have been deployed.
- If GitHub Actions is disabled or does not have permission to write the lockfile, it must be added manually on a machine with package-registry connectivity.

## Module 1 acceptance checks
- [x] Fresh dependency installation succeeds (GitHub Actions run 39225727872).
- [x] ESLint passes.
- [x] TypeScript typechecks across workspace.
- [x] Shared contracts/API integration tests pass.
- [x] Next.js and API production builds succeed.
- [x] Smoke verifies live Next.js -> Express health.
- [x] Lockfile committed to repository.
- [x] Remote branch head verified.
Check only items actually validated; see workflow run on GitHub for authoritative status.

## Verification evidence
- Initial successful workflow: https://github.com/Aayush20253534/Digimarket-software/actions/runs/39225727872
- Initial implementation commit: 524a7a99cb64d47ae76a7b418b560c9a9df3a3c4
- Lockfile commit: 80ac1ae8cf286fcbb63bb879a4102da8d975cb94
- The CI workflow subsequently uses a frozen lockfile, with read-only GitHub permissions.
