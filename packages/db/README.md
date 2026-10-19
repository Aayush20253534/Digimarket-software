# DigiMarket PostgreSQL data layer

Module 2 introduces real Prisma v7 models for `Organization`, `User`, `Role`, `Permission`, `UserRole`, `RolePermission`, `Session`, `Team`, `TeamMember`, `FounderProfile`, `AuditLog`, and `OutboxEvent`.

- All organization-linked records include an organization FK.
- Composite unique identifiers keep users and roles scoped to organization.
- Deletions of organizations containing identity or audit/outbox history are restricted.
- Client-generated UUID primary keys, PostgreSQL timestamp-with-timezone and indexed query paths.
- Password hashes and refresh token hashes are columns for Module 3; **no staff account/password is seeded**.
- Seed creates/upserts global permission definitions only; it grants no user permission.
- Outbox and audit events may be written together inside a Prisma transaction.
- Runtime uses `@prisma/adapter-pg` and a pooled `DATABASE_URL` with Prisma v7.
- Migrations use `DIRECT_DATABASE_URL` and `prisma migrate deploy` rather than resetting production.

## Cloud-only CI validation
GitHub Actions provisions **ephemeral PostgreSQL** and runs validation, Prisma generation, migrations, permission seed and transaction/integrity smoke tests. Existing unrelated Neon projects are never modified by CI.

## Prisma commands (used by CI / later cloud deploy)
~~~bash
pnpm --filter @digimarket/db db:validate
pnpm --filter @digimarket/db db:generate
pnpm --filter @digimarket/db db:migrate:deploy
pnpm --filter @digimarket/api exec tsx ../../packages/db/src/seed.ts
pnpm --filter @digimarket/api exec tsx ../../packages/db/src/integration-smoke.ts
~~~

`integration-smoke.ts` intentionally refuses to run unless `NODE_ENV=test` and database name contains `digimarket_ci`. It writes only inside rolled-back test transactions.

## Migration policy
- New migrations generated from Prisma schema, reviewed, committed, and applied through CI/cloud deployments.
- No database reset, force migration or schema push on a live Neon project.
- DB connection URL and secrets stored in cloud secrets, never in Git.
- Module 3 adds admin bootstrap and secure role grants; Module 2 only seeds permission vocabulary.
