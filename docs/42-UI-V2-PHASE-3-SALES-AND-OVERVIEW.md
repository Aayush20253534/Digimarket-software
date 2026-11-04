# DigiMarket UI v2 — Phase 3: Overview and Sales & CRM

## Scope
This release completes the role-aware Overview presentation, Leads CRM, Follow-ups, Meetings, Clients directory and client workspace styling. It builds on Phases 1–2, using the original AmplifyWorld artwork, default-dark/light monochrome tokens, semantic status colours and grouped navigation.

**Safety:** UI-only. No schema migrations, API endpoint or contract modifications, authentication/permissions changes, lead/client status changes, note/content deletion, revenue calculation changes or PDF generation changes. All original bookmarked URLs continue to work.

## Overview
- Admin: retains the authenticated command centre, role/access metrics, recent records, live-report cards and existing admin data scope; visually simplified as one balanced surface hierarchy.
- Founder: gets a titled workspace and permission-scoped quick links to Leads, Follow-ups, Meetings, Clients, Tasks and Deliveries. The existing business-insights charts still use the live /reports/overview API.
- Employee/member: gets the same accessible overview, with only links allowed by existing permissions. The same appointments, follow-ups and delivery modules continue their original API requests.
- Graphs are built from scoped reporting data, never inferred from incomplete table pages. Missing reports remain clearly unavailable.

## Sales workspace navigation
A single SalesWorkspaceNav component appears on Leads, Follow-ups, Meetings, Clients directory and client detail, showing only destinations permitted by leads.read and clients.read. It is horizontally scrollable on mobile with an accessible active-page state.

## Leads CRM
- Existing per-source, stage, search, sort, 10-per-page register, lead-details drawer and mutation flows remain.
- Existing eight metrics now use consistent monochrome cards. A new five-stage distribution chart and conversion view use the existing /leads/metrics response. No hard-coded metrics or new API calls.
- Existing stage badges remain semantic, while general surfaces, table chrome and lead editor use monochrome tokens.
- Original access restrictions for creating, assigning, exporting and deleting leads remain.

## Follow-ups and Meetings
- Both retain the original four-/six-column tables, 20-item cursor pagination, deep links, click-to-call and Google Maps links.
- Summary cards clearly describe the count **on the currently loaded page**. Meetings may also show the API-supplied total.
- Search is local to those 20 loaded records. All / Overdue / Today / Upcoming follow-up filters, and All / Today / Upcoming / Past meeting filters do not change backend pagination or data.
- Follow-up dates are stored as date-only at UTC noon and categorized using their ISO date component against the current Asia/Kolkata day. Meeting instants use Asia/Kolkata for date classification, matching the displayed IST time.
- Clearing filters immediately restores the loaded page. No record is modified by filtering.

## Clients and delivery workspace
- Directory retains server-backed search, status filters, legacy sort fallback, pagination and each client workspace link.
- Four status/size cards are clearly marked **on this page**. The segmented status chart also uses only current-page rows.
- Client avatar initials are generated from displayed business names, never fabricated images.
- Five original detail tabs (Delivery, Services, Agreement, Contacts, Files & Assets), associated edit controls and client asset permissions remain.
- All legacy client delivery scheduling, contacts, services, agreement values and permissions are retained.

## Responsive and accessibility
- Dedicated responsive layout tokens in aw-phase3-sales-workspaces.css, loaded after Phase 2's monochrome styles.
- Accessible table names, labels, sections, focus states and real numeric text accompany visual bars.
- Horizontal scrolling stays within overflowing table containers, not the whole document.
- No changing actual business values for UI display; chart percentages come from API-supplied counts.
- Reduced motion and theme-matched scrollbars respected.

## Verification
- Run workspace CI lint, typecheck, unit/API integration, application build and smoke.
- Existing isolated browser test covers Admin, Founder and Employee permissions, lead CRUD/stages, schedule flows, client conversion and delivery operations.
- Added Phase 3 checks: role dashboard identity, current sales nav, live funnel, page-only follow-up filter and clients status graph.
- Review dark and light screenshots plus mobile capture; do not state production deployment is complete before Vercel confirms a successful main deployment.

## Next phase
Phase 4 targets detailed Client Deliveries, Tasks, History and approval interactions without changing the business service models.
