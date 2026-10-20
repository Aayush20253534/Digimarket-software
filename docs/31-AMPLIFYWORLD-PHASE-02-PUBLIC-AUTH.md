# AmplifyWorld Workspace — Phase 2: Public homepage and authentication

**Branch:** `feat/amplifyworld-ui-phase-2`, stacked on Phase 1 branch. Production `main` remains unchanged pending approved reviews.

## Delivered

- Premium responsive software landing page at `/`, with brand identity, navigation to sections, honest illustrative dashboard, agency modules, workflow, security and login CTA.
- Preserved server-side Express API health check with `data-testid="api-health-status"` and explicit note that health is not database or account readiness.
- Dark branded `/login` screens for credentials, temporary password rotation, TOTP enrollment and TOTP verification.
- Existing authentication handlers, Next.js proxy, JWT sessions and cookies remain unchanged; browser secrets remain in memory and are cleared on completion.
- Password-visibility toggles and accessible labels, error announcements, mobile-first layout, reduced-motion support.
- Root page metadata updated to AmplifyWorld Workspace while retaining no-index private-app policy.
- No fabricated business statistics, case studies or testimonials presented as real data. All preview illustrations are explicitly labeled.
- No backend/Prisma/permissions/environment changes.

## Regression tests

`apps/web/tests/public-auth.spec.ts` checks 320px, 375px, 390px, 768px, 1024px, 1440px widths, screen content, form labels, password reveal and CTA navigation.

`.github/workflows/amplifyworld-phase2.yml` runs frozen install, lint, typecheck, unit tests, complete workspace builds, isolated Postgres migration/bootstrap, real API + web servers, and the existing full admin-first-login/password-rotation/TOTP and staff-role browser regression suite, plus public-page tests.

## Notes

Phase 1 supplied a scalable brand-derived SVG; the official uploaded raster logo is a distinct asset and should replace the vector mark as required when an optimized copy can be committed. The public design does not claim fictitious performance metrics.

Changes are isolated in branch previews. Do not merge Phase 2 independently of Phase 1: review PRs in order.
