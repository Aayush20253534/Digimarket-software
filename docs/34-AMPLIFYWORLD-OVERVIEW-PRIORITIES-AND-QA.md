# AmplifyWorld Workspace: Overview Priorities and QA Expansion

## Scope / dependencies

This enhancement is based on Phase 5 `feat/amplifyworld-ui-phase-5` and will remain stacked until PR #6 is approved. Production `main` is untouched.

### Phase 5.1: Action center (implemented on this branch)

- Dashboard shows **numbered orange pending tasks**. Pending means TODO, IN_PROGRESS, BLOCKED or IN_REVIEW, including overdue tasks. DONE and CANCELLED are excluded.
- A separate **past deadline** list includes unfinished tasks whose precise due time has passed, plus accessible PLANNED, ACTIVE and ON_HOLD projects whose due date is before the user's local day.
- Administrators with `tasks.manage` see all team tasks; others see only tasks created by/assigned to them, as enforced by `GET /tasks?view=team|mine`. Projects use existing project-scoped API.
- Cursor pagination traverses up to 30 API pages per module (100 results/page). If there are more, a visible partial-results warning appears rather than claiming organization-wide completeness.
- Pending tasks are ordered by due date. Both lists can expand beyond the first eight visible items with working Show more controls.
- Refresh updates the lists and the deadline clock. Deadline cutoffs update at least once a minute while the page remains open.
- Button and icon links navigate only to existing functional Tasks/Projects screens. There is no placeholder route masquerading as the Notes editor.

### Phase 7: Notes shortcut + true saving (required next)

The Notes icon and quick-create button will be enabled **only after** Notes CRUD, permissions, persistence, autosave/conflict recovery, rich text, and stylus/touch canvas are functioning. The primary destinations will be `/app/notes` and a notes shortcut in the dashboard header and sidebar. Do not fabricate saved notes with a UI-only stub or browser local storage.

### Phase 5 mobile editorial calendar

The existing Phase 5 implementation supplies a 7-column desktop calendar and phone/tablet agenda view under 900px, with month/week/list controls. Phase 8 must test date navigation, past/future month rollover, empty periods, filters, swipe/touch ergonomics and draft creation on real browser widths.

### Phase 6 & 8: Icons, colors and broken controls

`lucide-react` is already installed (`^0.468.0`). Reuse consistent 18px and 20px icons, semantic positive/warning/danger colors, focus/hover/disabled states, and page-specific empty/error states. No extra icon framework is required.

The final button QA must enumerate and exercise every permitted action, mutation confirmation, form validation, navigation, modal/dialog, tabs, pagination, and role-specific state on all supported viewport sizes (320, 375, 390, 768, 1024, 1440px), covering both pointer and keyboard interactions. Defects must be fixed before the Phase 9 release. Passing limited smoke tests is not a claim that every button works.

### Verification

The isolated CI workflow `.github/workflows/amplifyworld-priorities.yml` checks authentication, role-scope boundaries, an injected representative task/project deadline dataset, overdue classification, orange numbering, and baseline mobile route integrity. No backend/schema changes for this action-center enhancement.
