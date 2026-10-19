# Module execution roadmap — 0 to 17
**Method:** complete a module's schema changes, domain logic, API, UI, authz tests, integration checks and documentation before moving on. Module 0 is documentation/design only.

## Universal definition of done (applies to implementation modules)
- All planned routes and actions working against real server/database data.
- Schema migrations and relational constraints reviewed and tested.
- Zod request/response contracts, role/record-level enforcement, audit events.
- UI: success, empty, loading, validation and error states; responsive and keyboard usable.
- Unit, API integration and regression tests passing; types/lint/build pass.
- Environment variables documented without secrets.
- No hard-coded dashboards pretending to show production data.
- No broken integrations with previous modules.
- Commit pushed, release notes and verification steps included.

## Ordered execution
| Module | Name | Dependencies | Implementation deliverables | Gate |
| ---: | --- | --- | --- | --- |
| 0 | Product architecture and UI specification | None | Charter, PRD, architecture, DB design, permissions, sitemap, API contracts, workflows, acceptance gates, wireframes | Document completeness and internal consistency |
| 1 | Monorepo and infrastructure | 0 | Next.js/Express/TypeScript workspaces, lint/test/build, env templates, CI, local Redis | Clean install, build and app-to-API smoke test |
| 2 | Initial database models | 1 | Neon/Prisma, identity/org/role/session/audit/outbox schema, migrations, seeds | Safe migrations, FK/index checks |
| 3 | Authentication and authorization | 2 | Login/admin invite/reset, Argon2id, JWT/refresh, MFA for privileged accounts, RBAC and record checks | Auth security integration tests |
| 4 | App shell and dashboard framework | 3 | Responsive nav, reusable components, profile, scoped dashboard placeholders from real empty DB | All role routes and empty states |
| 5 | Approval workflow engine | 3–4 | Policies, requests, decision history, queue, atomic transitions | No self/duplicate unauthorized approval |
| 6 | Finance and expense/income | 5 | Categories, receipts linkage strategy, immutable posted entries, views, exports | Reconciled posted and pending sums |
| 7 | Leads CRM | 3–4 | Lead register, stage/follow-up/duplicate detection, audit, import/export | Concurrent conversion contract specified/tested |
| 8 | Clients | 7 | Client profiles, contacts/services, lead conversion, linked records | One lead -> one client; scoped reads |
| 9 | Cloudinary file and asset manager | 3,8 | Upload intents, secure upload/confirm, file browser, access-controlled delivery | Private asset isolation confirmed |
| 10 | Projects and deliverables | 5,8,9 | Project board, milestones, members, deliverable review | Project links, deliverable approvals |
| 11 | Tasks and recurrence | 10 | My/team tasks, assignees, recurrence scheduler, BullMQ | Exactly-one occurrence after retry |
| 12 | Content calendar | 5,8,9,10,11 | Content list/calendar, versioned approvals, publish record | Revision invalidates prior approval |
| 13 | Invoices and payments | 5,6,8,9 | Draft/issue invoices, invoice PDFs, verified payments/allocations, receivables | No duplicate cash posting or over-allocation |
| 14 | Client profitability | 6,8,10,13 | Client-level revenue/cost attribution and trend analytics | Defined method, accurate sample fixtures |
| 15 | Founders and settings | 3,4,6 | Founder profiles, team display, categories/approval/billing settings | Permissions do not derive from title |
| 16 | Reporting/search/notifications | 6–15 | Permission-filtered global search, cross-module reports, SSE, alert/reconciliation jobs | Results scoped and cache consistency |
| 17 | Production readiness | 1–16 | E2E/security tests, documentation, backup/restore, deploy and monitoring | Successful smoke + recovery rehearsal |

## Checkpoints
- **A — Foundations:** 0–4, users sign in and see accessible, permission-aware layout.
- **B — Operations:** 5–8, leads/clients and money workflows functional.
- **C — Delivery:** 9–12, files, projects, tasks and content pipeline functional.
- **D — Business analytics:** 13–16, invoicing, profits, reports and configurable organization operations.
- **E — Release:** 17, backed-up monitored production deployment.

## Suggested issue/commit format
- Branch: feature/module-01-foundation, etc.; keep default branch protected when configured.
- Commit: feat(m01): initialize workspace and CI / docs(m00): write product architecture.
- Task template:
  1. Entities and migrations
  2. Domain services and state transitions
  3. API + request validation + permissions
  4. UI screens/forms/filters
  5. Audit/outbox/notifications as applicable
  6. Tests (happy path, bad input, unauthorized, concurrency)
  7. Migration/release notes + push verification

## Cross-module constraints
- Module 6 receipts require Module 9 upload UI; until Module 9, attachment IDs only with controlled enablement or postpone receipts, not insecure direct public uploads.
- Module 8 conversion must be transactionally unique, despite CRM work beginning in 7.
- Module 11 recurrence must use persistent unique keys independent of BullMQ's delivery guarantees.
- Module 13 payment posting is integrated into finance service, never a second independent income counter.
- Module 14 financial metrics require explicit recognition/cost attribution rules, not mere sum of invoices.
- Module 16 search and dashboards enforce same resource-level permissions as source modules.
- Module 17 security is the final audit, but security/testing are mandatory in every module.

## Module 0 completion inventory
- [x] Charter, actors, scope and excluded integrations.
- [x] PRD and module requirements.
- [x] Stack and architecture decisions.
- [x] Conceptual relational data model and invariants.
- [x] Roles, authorization matrix and isolation rules.
- [x] Route sitemap, design system and UI specification.
- [x] API standards and endpoint catalog.
- [x] Workflow/state diagrams.
- [x] Security, operations and environment variable contract.
- [x] Module-by-module implementation roadmap.
- [x] Acceptance criteria, decisions and low-fidelity wireframes.
- [ ] Application scaffold: Module 1.
