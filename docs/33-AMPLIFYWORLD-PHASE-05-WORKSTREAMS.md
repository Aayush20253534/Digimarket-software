# AmplifyWorld Workspace — Phase 5 CRM, delivery, content & approvals

Branch: `feat/amplifyworld-ui-phase-5`. Production `main` is unchanged until review.

## Route-by-route implementation

| Route | Delivered | Preserved |
| --- | --- | --- |
| `/app/leads` | Dark violet responsive lead register, follow-up detail/editor, filter bar and page-scoped count. | Lead creation, edits, ownership, conversions, notes, duplicates and CSV import/export |
| `/app/clients` | Consistent directory and detail surfaces, adaptive layout and page-scoped count. | Client/contact/service creation and updates, lead linkage |
| `/app/projects` | Responsive auto-fit kanban status columns with legible project cards and consistent forms. | Members, milestones, deliverables, status changes and approvals |
| `/app/tasks` | Restyled task register/detail/recurrence workflows, accessible dark form controls. | Team assignments, checklists, recurrence and comments |
| `/app/content` | Richer editorial schedule, violet calendar, mobile agenda at widths under 900px, month/week/list retained. | Content revisions, assets, publish scheduling and approvals |
| `/app/approvals` | Dark approval queue, decision cards, policy forms, status/role indicators. | Request submission, approval/rejection, cancellation, policy management |

## Design and mobile details
- Shared dark Obsidian/Violet/Magenta theme scoped to these six routes using `data-workstream="true"` and `.aw-module-root` to prevent affecting finance, administration or unmigrated routes.
- The operational shell (Phase 3) and overview dashboard (Phase 4) remain unchanged; `data-dashboard` is retained.
- Reusable legacy PageHeader/Card/FormField/Notice semantics and original form handlers stay in place to preserve API and permission invariants.
- Buttons, selections, inputs and statuses have dark theme contrast, keyboard focus outlines, 44px touch-friendly height and reduced-motion handling.
- CRM detail panes stack at tablet/mobile widths. Project status columns use `auto-fit` rather than five squeezed fixed columns.
- The editorial calendar uses the same fetched `rows` and API date range for both desktop 7-column grid and mobile agenda. It does not change publication state or storage.
- Row counts explicitly read “on this page” because cursor-paginated API results are not totals.

## Verification and release
- New `.github/workflows/amplifyworld-phase5.yml` uses temporary Postgres and administrator identities, frozen install, lint, typecheck, full unit suite, build, browser-backed MFA, staff permissions and mobile workstream screen checks.
- Browser regression checks each of six pages at 375px for documented horizontal overflow, the mobile agenda's visibility, and the old list/month switch.
- No backend, Prisma migration, API contract or JWT changes.
- The prior `main` branch had an intermittent Module 5 browser-journey timeout after approval flow progressed into leads. This is tracked separately and should be rerun before a production merge, not interpreted as a pass.
- Keep this change in a preview PR for visual review. Only phase 5's six module interiors migrate; finance, reports, settings, notes editor and other areas are subsequent phases.
