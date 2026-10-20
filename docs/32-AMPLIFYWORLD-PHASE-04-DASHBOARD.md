# AmplifyWorld Workspace Phase 4: Dashboard and shared data patterns

Branch: `feat/amplifyworld-ui-phase-4`, stacked on Phase 3. Authorized for merge to `main` after full CI passes.

## Implemented
- Dark, responsive command-center dashboard at `/app/dashboard`, integrated with Phase 3 workspace shell.
- Four true session/authorization metrics: authenticated status, role count, granted permission count and accessible module count.
- Real, permission-scoped recent-record previews from the existing `/clients`, `/leads`, and `/projects` endpoints, ten records per module at most.
- Honest data presentation: never call those partial pages company-wide totals. Identify incomplete pages and per-module loading errors without hiding successful responses.
- Filterable/sortable recent-records table, mobile horizontal containment, local pagination, quick links and account-scope summary.
- Reusable components: AWStat, AWPanel, AWDataToolbar, AWSortButton and AWLocalPagination.
- Phase 3 shell auto-uses a dark canvas **only** for the dashboard; other management feature pages stay in their previous styling until later phases.
- No backend changes, migrations or permission modifications; the Express API still enforces access.

## Browser QA
- Full admin first-login password rotation and MFA.
- Admin/employee authorization boundary checks.
- Desktop collapse and mobile modal navigation.
- Dashboard presence, session metrics, text filter, record-type select and refresh control.
- Existing public homepage and design-preview responsiveness.
- Next.js build, ESLint, TypeScript and unit tests.

## Release order
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4, preserving stacked commits. Review Vercel production after the final merge.

## Explicitly deferred
Individual legacy module page redesigns, notes, new reporting endpoints, and comprehensive real-time organization totals are **not** part of Phase 4. The dashboard must not invent finance or project statistics.
