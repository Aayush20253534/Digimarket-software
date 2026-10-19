# DigiMarket Software

Internal agency operations platform for a digital marketing team. This repository is currently in **Module 0: product and technical specification**; application code has not been implemented.

## Planned stack
- **Web:** Next.js, TypeScript, Tailwind CSS, shadcn/ui, Recharts
- **API:** Node.js, Express, TypeScript, Zod
- **Database:** Neon PostgreSQL, Prisma
- **Authentication:** Argon2id, JWT access tokens and rotating refresh sessions
- **Authorization:** Deny-by-default RBAC with record-level access checks
- **Cache / queues:** Redis, BullMQ, Server-Sent Events
- **Assets:** Cloudinary, private/authenticated delivery
- **Deployment:** Vercel (web), Render (API), managed Neon/Redis/Cloudinary

## Module 0 deliverables
| Document | Purpose |
| --- | --- |
| [Product charter](docs/00-PROJECT-CHARTER.md) | Goals, boundaries, assumptions |
| [Product requirements](docs/01-PRD.md) | Actors, modules, business rules |
| [System architecture](docs/02-ARCHITECTURE.md) | Runtime design, data flows, integrations |
| [Database design](docs/03-DATABASE-DESIGN.md) | Entities, keys, invariants, indexes |
| [Authorization matrix](docs/04-PERMISSIONS.md) | Permissions and record visibility |
| [Sitemap and UI](docs/05-SITEMAP-AND-UI.md) | Routes, layouts, forms, navigation |
| [API standards](docs/06-API-CONTRACTS.md) | Endpoints, errors, validation, versioning |
| [Workflows](docs/07-WORKFLOWS.md) | Leads, finances, invoices, content and tasks |
| [Security & operations](docs/08-SECURITY-AND-OPERATIONS.md) | Security controls, deployment and backups |
| [Execution roadmap](docs/09-MODULE-ROADMAP.md) | Modules 0–17, dependencies, acceptance gates |
| [Acceptance criteria](docs/10-ACCEPTANCE-CRITERIA.md) | Testable requirements and release criteria |
| [Decision log](docs/11-DECISIONS.md) | Locked decisions and items to confirm |
| [Wireframes](docs/wireframes/README.md) | Low-fidelity application screens |

## Development policy
1. One implementation module at a time; backend, frontend, authorization, tests and documentation must agree.
2. All financial balances come from PostgreSQL. Redis is a cache and job-queue transport, never the ledger.
3. No unrestricted public registration. Privileged actions are enforced in the API and audited.
4. Company-wide shared records are permission-filtered. Sensitive client credentials are never stored as plaintext.
5. Cloudinary handles files; Neon holds metadata and access policy. Sensitive files require authorized delivery.
6. No production secrets in Git. `.env.example` will only document variable names.

## Status
- [x] Module 0: specification and wireframes
- [ ] Module 1: monorepo and infrastructure
- [ ] Module 2: initial data layer
- [ ] Module 3: authentication and permissions
- [ ] Module 4: application shell
- [ ] Modules 5–17: feature delivery and production hardening

**Note:** Checkmarks in documentation represent planning work, not implementation, runtime verification or deployment.
