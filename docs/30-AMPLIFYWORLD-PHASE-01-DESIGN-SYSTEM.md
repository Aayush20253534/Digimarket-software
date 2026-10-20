# AmplifyWorld Workspace — Phase 1: Design system

**Scope:** An additive, isolated visual foundation. No existing business route, API, schema, auth, workflow, or permissions are modified in this phase.

## Implementation contract

- Branch: `feat/amplifyworld-ui-phase-1`; review via Vercel preview before merge.
- Existing DigiMarket views stay in their original light styling until their dedicated rollout phases. New styles are activated only inside `.aw-theme`, preventing half-migrated white-on-black screens.
- Files: `src/styles/amplifyworld-tokens.css`, `src/components/brand-logo.tsx`, `src/components/aw-ui.tsx`, `src/components/aw-dialog.tsx`, `public/brand/amplifyworld-mark.svg`, plus the read-only `/design-preview` route.
- React/Tailwind native components avoid new dependencies and do not change the existing pnpm lockfile.
- The SVG is a **responsive AW mark adapted from the user-supplied visual reference**, not a lossless copy of the user-provided raster logo. The original approved raster should be added as a production brand asset before the public landing/login redesign, when its approved source file is available for repository upload.
- Typeface stack names Geist / Geist Mono with system fallback; no external font download is required for build. Exact licensed font files may be installed later, subject to assets policy.

## Tokens

| Purpose | Value |
|---|---|
| Obsidian `--aw-canvas` | `#09070E` |
| Surface `--aw-surface` | `#171122` |
| Raised surface `--aw-surface-raised` | `#20162F` |
| Primary violet `--aw-violet` | `#7C3AED` |
| Purple `--aw-purple` | `#B026FF` |
| Magenta `--aw-magenta` | `#F037DB` |
| Primary text `--aw-ink` | `#F7F5FB` |
| Muted text `--aw-muted` | `#B5ADC5` |
| Border `--aw-border` | `#362842` |
| Focus `--aw-focus` | `#E6B3FF` |

Font stack: Geist / Inter / system UI; Geist Mono / system monospace. Spacing uses Tailwind's existing spacing scale; shared radii are 6/10/14/20/28px.

## Component inventory

`BrandLogo` (compact, tagline, workspace); `AWButton` (primary, secondary, ghost, danger, small); `AWCard`; `AWPageHeader`; `AWFormField`; `AWInput`; `AWSelect`; `AWTextarea`; `AWBadge`; `AWStatusBadge`; `AWTable` (contained horizontal overflow and accessible label); `AWNotice`; `AWEmptyState`; `AWSkeleton`; `AWDialog` (native dialog keyboard semantics and focus management).

## QA gates

1. Existing routes must remain unchanged and pass the full monorepo CI.
2. `/design-preview` must be accessible as a static, read-only concept route and must never fetch customer data.
3. Screen widths 320px, 375px, 768px, and 1440px must have no document-level horizontal overflow in the design preview.
4. Mouse and keyboard activation work for functional preview controls, Escape closes its native dialog.
5. `prefers-reduced-motion` disables decorative motion and animations.
6. The Notes module, responsive app-shell changes, homepage and existing page migrations remain in later approved phases.

## Next phase

Phase 2: migrate the public introduction page and existing login/password-rotation/MFA presentation to the new tokens and exact approved imagery while preserving API behavior. Phase 3: replace fixed sidebar with a collapsible permission-aware shell.
