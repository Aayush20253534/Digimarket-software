# DigiMarket UI v2 — Phase 1: Monochrome design system

**Scope:** visual foundation and theme infrastructure. Navigation consolidation is Phase 2; individual page IA and full interaction redesigns are Phases 3–6. No database, API, authorization or financial calculation changes.

## Approved appearance rules

- **Default:** dark, regardless of OS settings. Previously stored `aw-workspace-theme=light` is respected.
- **Light:** selectable using the existing sun/moon button. Preference is stored locally and survives route changes and page reloads.
- **Colors:** black, white and neutral greys. Original AmplifyWorld SVG assets are never filtered, recoloured or replaced.
- **Semantic exceptions:** subdued red, green, teal, blue and amber indicate status/validation outcomes. The former neon/magenta CRM badge palette is replaced in the workspace.
- **Typography:** Geist/Inter/system fallback. Normal **100%** desktop zoom; no global 75% scaling.
- **Spacing:** comfortable 8px-based rhythm, 10–12px cards, >=40px interactive controls where existing component semantics permit.
- **Charts:** monochrome CSS variables; reporting values, API access and labels unchanged.
- **Scrollbars:** `html[data-aw-theme]` controls page-level scrollbar, body and browser colour scheme. Nested register, message, table, sidebar and drawer scroll areas inherit theme-matched thumb/track colours. Firefox `scrollbar-color` and Chromium/WebKit `::-webkit-scrollbar` both covered.
- **Access:** root themes only apply while an authenticated `.aw-workspace` is mounted. The old public site and login screen are not redesigned.
- **Accessibility:** visible focus ring; reduced-motion still honoured; controls and charts retain accessible names.

## Tokens

Source of truth: `apps/web/src/styles/aw-enterprise-theme.css`, imported **last** in `apps/web/src/app/globals.css`. No new dependency or API needed.

| CSS token | Dark | Light |
|---|---|---|
| `--ui-canvas` | `#0B0B0C` | `#F6F6F7` |
| `--ui-surface` | `#171719` | `#FFFFFF` |
| `--ui-raised` | `#202022` | `#F5F5F6` |
| `--ui-hover` | `#2A2A2C` | `#EEEEF0` |
| `--ui-border` | `#343436` | `#E4E4E6` |
| `--ui-strong` | `#F5F5F5` | `#19191B` |
| `--ui-muted` | `#A6A6AA` | `#616167` |
| `--ui-primary` | `#FFFFFF` | `#171719` |
| `--ui-action-text` | `#101011` | `#FFFFFF` |
| `--ui-side` | `#111113` | `#FFFFFF` |
| `--ui-input` | `#1C1C1E` | `#FFFFFF` |

Charts use ten shade-specific `--aw-chart-N` tokens; no series is hardcoded to pink/violet/cyan. Status badges use `--stage-*-bg`, `--stage-*-fg` and `--stage-*-border` in each theme.

### Component conventions

- Prefer `AWButton`, `AWCard`, `AWInput`, `AWSelect`, `AWTextarea`, `AWBadge`, `AWTable`, `AWNotice` and `AWPageHeader` for future screens.
- Existing `ui.tsx` components are retained for compatibility and adopt `aw-v2-` structural hooks. Do not alter their React props or shared public exports in this phase.
- Specialized page styles still provide grid geometry, data table widths, dialogs and editor functionality. Theme styling supplies colour and component surface hierarchy; migrate page CSS to tokens in later phases rather than layering more new theme systems.
- Preserve SVG/image pixels, client uploads and the Notes canvas paper/ink; do **not** apply global grayscale filters.
- Do not make semantic statuses monochrome; they are the approved exceptions.

## Baseline and regression checks

1. `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm smoke`.
2. Isolated browser integration exercises Admin, Founder, Employee, role-scoped navigation, CRM states, Notes persistence, deliveries, finance and reporting.
3. Phase 0 screenshot workflow validates initial dark appearance, manual light mode, preference persistence, document-level scrollbar changes and 16 representative routes. The screenshots are archived as a CI artifact.
4. Responsive widths: 390px mobile, 768px tablet, 1440px desktop (plus existing public page widths). Table overflow stays inside scrollable containers; the document must not acquire unintended horizontal overflow.

## Explicitly deferred to Phase 2+

- Sidebar navigation grouping, Notes/Calendar hiding, Documents/Tasks tab merges, Approvals inbox.
- Full page-by-page semantic HTML/layout reconstruction and consolidation of older style sheets.
- Removing or redirecting any existing route, even hidden routes.
- Changing statuses, permissions, data models, contracts, recurrence, finance totals or PDF generation.

**Rollout:** Merge after required source checks and targeted browser checks. Review actual screenshot artifact and authenticated production/staging visuals at both themes before declaring full UI parity. A source-level pass or a Vercel build is not proof that every historical page has perfect contrast.
