# DigiMarket UI v2 — Phase 5: Finance, Documents and Reports

## Scope and guarantees
Phase 5 redesigns Finance, Quotations, Agreements, agency Reports, Leads analytics and Income/Expense breakdowns with the established dark/light monochrome system.
All existing finance APIs, exact four-decimal amount storage, posting rules, audit trails, Meta Ads expense classification, approval workflows, document snapshots and PDF files are preserved.
No schema migration, API contract change, permissions update, historical data deletion or accounting formula modification was introduced.

## Business workspace navigation
- Shared BusinessWorkspaceNav shows Finance only with finance.read.all or finance.entry.read.own, Documents only to Founder/Admin/Super-admin roles and Reports only with reports.business.read.
- The reporting shell extends navigation to Leads, Income and Expense breakdowns. The Documents shell retains quotation/agreement tabs.
- All canonical and legacy URLs remain valid.

## Finance
- The six original monetary totals continue to show API-supplied posted income, posted expenses, net posted, pending income, pending expenses, and **Client Meta Ads spend** separately.
- A posted cashflow comparison uses display-only bar widths. Original money() keeps exact string-to-cent rounding for visible amounts.
- A local page-section navigation links to Summary, Recurring agreements where authorized, New entry where permitted, Meta Ads spend and Financial register.
- Meta Ads filter distinguishes Agency and Client on the 200 loaded records without changing a record or making new API calls.
- Agency financial register adds local text, type and status filters for loaded transactions. CSV export retains its server-side scope and up-to-5,000 row limit.
- The current finance edit and delete dialogs, proof uploads, categories, client selection, accounting classification, ledger summary, audit trail and permission checks are unchanged.
- Projected recurring agreement amounts remain labelled projections, never posted revenue.

## Documents
- The original signed-ready PDF generators and saved quotation/agreement APIs are untouched.
- Quotations now have in-page wayfinding for default or custom workflows and persistent summary/history anchors.
- Default quotation remains editable at 8 reels and 8 posts per month. New quotation services, fees, taxes, influencer costs and ad budgets stay individually configurable.
- Agreements now have linked client, dates, services, charges, terms, summary and history steps. Typed names are not represented as signed electronic contracts.
- Saved document history retains immutable snapshots, reuse/download functionality and local client/number search.
- Exports keep the existing AmplifyWorld PDF branding. Monochrome styling affects the browser interface only.

## Reports
- The agency Reports screen gains clearly labelled links to Leads analytics, Income breakdown and Expense breakdown with current report range forwarded in the URL.
- Calendar shortcuts cover This month, Last 30 days and This year, retaining the existing from/to request scope and date validation.
- A period provenance strip uses report.from, report.to and report.asOf as delivered by the reports API.
- Existing lead stage chart, posted Income vs Expenses comparison, conversion KPIs, financial ledger and definitions remain data-driven.
- Detail pages keep their existing pagination, search and filters, with overridden dark/light monochrome surfaces and local scroll containment.

## Styling and test coverage
- aw-phase5-business-workspaces.css loads after Phase 4 and overrides older purple Finance, Document and Report styles, without altering original logo or semantic status colors.
- Inputs, financial registers, summary cards and PDF workflow panels share consistent spacing, focus rings and responsive 320–1440px layouts.
- The updated authenticated Playwright test covers Business navigation, quotation defaults, agreement sections, posted cashflow, local register filters and reporting shortcuts.
- CI release gate remains route compatibility, lint, TypeScript, unit/API integration, application build, smoke and isolated authenticated browser tests.
- Verify the merged commit's Vercel deployment independently before stating the live frontend is updated.

## Next phase
Phase 6: final cross-module design consistency, messaging/settings polish, accessibility and production readiness audit.
