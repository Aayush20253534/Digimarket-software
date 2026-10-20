# AmplifyWorld Workspace · Phases 6–9 engineering handover
Date: 2026-10-20

## Phase 6 · Finance, reporting and administration
- Existing Finance, Invoices/Payments, Client Profitability, Reports, Company Settings, Founders, Team/Accounts, Asset Manager, Profile, Search and Notifications have route-scoped dark violet UI polish in `amplifyworld-phase6.css`.
- Existing data-fetch/mutation handlers and role-gated API endpoints preserved. This is a presentation migration, not a finance-logic rewrite.
- Shared icon/navigation and narrow-screen table overflow treatments included.

## Phase 7 · Notes
- PostgreSQL table `PersonalNote` + Prisma migration `20261020100000_personal_notes`.
- Every API operation requires a verified bearer session; read, write and delete are scoped to organization ID **and** owner ID.
- Typed text stored safely as Markdown source; preview renders React text nodes (not unsafe HTML).
- Canvas accepts mouse, touch and stylus, stores bounded normalized vector strokes on server. Undo/clear/ink controls are included.
- Autosave uses a 900ms debounce and optimistic revision check. Concurrent changes return HTTP 409 rather than silently overwriting. UI preserves unsaved text on conflict.
- Manual save, deletion confirmation, notes list, dedicated route, sidebar/header/dashboard shortcuts included.
- No localStorage used to persist user note content.

## Phase 8 · Regression coverage
- Playwright full live-isolated journeys validate authentication, MFA, approvals, finance, leads/clients, project, content calendar, dashboard tasks and mobile layouts.
- Added Notes creation/drawing/autosave/reload/delete regression and viewport overflow checks at 320, 375, 390, 768, 1024 and 1440 pixels.
- Notes API unit tests exercise owner scope, authorization, validation and revision conflicts.
- Browsers require temporary PostgreSQL, generated test secrets, migration deployment and Chrome; see `.github/workflows/amplifyworld-notes-responsive.yml`.

## Phase 9 · Release conditions
- Universal `Validate workspace` CI and comprehensive browser regression MUST pass on the exact final commit, with the PostgreSQL Notes migration and tests.
- `scripts/smoke.mjs` now expects AmplifyWorld branding, removing obsolete DigiMarket homepage assertion.
- Apply the Notes migration to a staging database BEFORE preview verification. Confirm role-scoped Notes after sign-in; test two-tab edit conflict.
- No automatic production promotion should be inferred from GitHub green checks. Deployment requires verified Render workspace, Neon migration, Vercel team permissions, environment configuration and non-destructive post-deploy smoke against real provider URLs.
- On Render Free no worker/Redis is available: recurring schedules/alerts are *not* live even if UI management exists.
- Complete a backup and disposable restore test and approve release separately from the UI redesign if live production access is unavailable.
