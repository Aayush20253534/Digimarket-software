# Low-fidelity UI wireframes
**Module 0 artifact** — structure and interaction design only. No application code or images are implemented.

## Index
- [01 — Authentication and app shell](01-auth-and-shell.md)
- [02 — Finance, expenses and approvals](02-finance-and-approvals.md)
- [03 — Leads, clients, projects and tasks](03-crm-projects-and-tasks.md)
- [04 — Content, assets, invoices and reporting](04-content-assets-billing.md)

## Layout rules
- Desktop: permanent collapsible left rail 240 px, global top bar 64 px, main area max 1440 px.
- Tablet: compact navigation rail/drawer and up to 2 KPI columns.
- Mobile: overlay navigation drawer, stacked cards, horizontal table scrolling only when no list/card adaptation is possible.
- All screens: breadcrumb, clear heading, scoped status, contextual primary action, filter controls, main results and help/empty/error states.
- Forms: explicit labels, optional sections collapsed, validation alongside field, fixed footer action only where appropriate.
- Permission-controlled actions are omitted when forbidden, but API remains authoritative.
- Every screen shows real accessible data only once implementation is complete.

## Canonical component inventory
AppShell, SideNav, TopBar, Breadcrumbs, PageHeader, DataTable, FilterBar, SearchInput, StatusBadge, KPI, DateRangePicker, CurrencyAmount, ConfirmDialog, FormField, FilePicker, AssetPreview, ActivityTimeline, ApprovalPanel, UserPicker, ClientPicker, ProjectPicker, CalendarGrid, KanbanBoard, NotificationCenter, EmptyState, ErrorState, Skeleton, Pagination.

## Design token references
Refer to ../05-SITEMAP-AND-UI.md for the initial typography, spacing, color, accessibility and layout specification.

## Interaction rules
- Do not interpret a submission as approved or posted until backend confirms it.
- Money actions require explicit status, currency and scope.
- Clicking client/project references navigates to permitted detail only.
- Asset download is through authorized server endpoint, not raw public Cloudinary path.
- A content scheduled badge is not a published badge.
- Primary action placement stays predictable across modules.
- Keep role-aware navigation concise; show personal tasks and notifications to every authenticated user.

## Screens not separately drawn
Founder profiles, team list, notification center, settings and the report filter pane use the common Detail/List templates illustrated in these files; their specific fields are defined in the page specification.
