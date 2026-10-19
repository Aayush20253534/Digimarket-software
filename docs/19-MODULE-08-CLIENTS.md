# Module 8: Clients and lead-to-client conversion

## Delivered
- Organization-scoped client directory at /app/clients: search, status filter, pagination, profile editing with optimistic version checks, contacts, service records and status (ACTIVE, PAUSED, ARCHIVED).
- Direct client creation, with no invented billing details. Client service entries are descriptive only. Invoicing, profitability, secret vaults, asset uploads and project links remain for later modules.
- Won lead -> client via POST /api/v1/leads/:id/convert. Requires leads.convert, leads.read and clients.create. A lead must be WON; the caller passes its current version.
- Conversion atomically increments the lead version, creates a client with a unique sourceLeadId, snapshots safe business fields, creates a primary contact where available, records activity/audit and queues a minimal outbox event. A second attempt or concurrent duplicate cannot create an additional client.
- User-visible link between converted leads and clients. The leads directory keeps the sales history.
- Role-based backend checks. Clients are limited to the authenticated organization. EMPLOYEE has clients.read by default, but not clients.edit or leads.convert; admins and founders can manage clients. Existing system role grants are updated idempotently by re-running the permission seeder (custom roles are preserved).
- No plaintext social platform credentials are stored. Only public social profile URLs appear in this module.

## Data model
Client (unique nullable sourceLeadId; organization, creator, status and version); ClientContact (a primary contact per client); ClientService (a descriptive service and status). Migration in packages/db/prisma/migrations/20261019050000_clients/. Client records are never hard-deleted by these endpoints. Version conflicts return 409.

## Routes
- GET /api/v1/clients?status=&q=&cursor=&limit= (organization-scoped, limit max 100)
- POST /api/v1/clients (direct creation, clients.create)
- GET /api/v1/clients/:id (clients.read)
- PUT /api/v1/clients/:id (clients.edit, version)
- POST /api/v1/clients/:id/contacts (clients.edit)
- POST /api/v1/clients/:id/services (clients.edit)
- POST /api/v1/leads/:id/convert ({version}, leads.convert + leads.read + clients.create)

Same-origin Next.js proxy allowlists the exact routes and query parameters. 404 hides cross-organization IDs; audit/outbox events contain no sensitive contact payload.

## Verification
GitHub Actions Module 8 uses disposable PostgreSQL 16, deploys versioned migrations twice for idempotence, validates Prisma schema, runs lint/types/tests/build, then performs client isolation, won-only conversion, unique conversion, permission, pagination and optimistic-version smoke assertions and the Module 7 regression suite. Existing browser tests cover won-lead conversion, client details, contact and service creation.

### Configuration and deployment
No new runtime provider secrets. After migration deployment, run the permission catalog seeder to upgrade existing system role grants. This CI uses an isolated database, not the live agency Neon instance. Production migration and deployment occur at Module 17.
