# PostgreSQL / Prisma workspace

Prisma v7 schema and configuration initialized. The schema deliberately contains no application tables. Module 2 defines organization, identity, sessions, permissions, audit and outbox entities with checked-in migrations.

- Runtime Neon pooled connection variable: `DATABASE_URL`
- Migration Neon direct connection variable: `DIRECT_DATABASE_URL`
- Schema: `prisma/schema.prisma`
- Config: `prisma.config.ts`
- Run `pnpm --filter @digimarket/db db:validate` with a syntactically valid direct URL configured.
- No real database credentials or migrations are committed.
