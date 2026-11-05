# DigiMarket UI v2 — Phase 6: Final Polish and Release Audit

## Scope

Phase 6 completes the six-phase redesign with the established black-and-white dark/light token system. It finishes Communication, Settings, Account, Team and supporting search/admin pages, and establishes an explicit production verification checklist. The original AmplifyWorld logo and semantic approval/task/lead statuses remain unchanged.

**Non-destructive implementation:** no database migrations, backend API edits, permission grants, billing changes, deleted records, posting-rule modifications or changed document PDF payloads.

## Communication: Messages

- The original `/app/messages` endpoint, private thread membership checks, polling, read acknowledgment, message send and file/note attachment handling remain intact.
- Add local **All members / Unread** filtering with a count based on the current permission-scoped member response.
- Refresh member directory button uses the existing GET method and does not send messages.
- The unread-only empty state is distinct from no active members and failed search.
- Display keyboard focus rings and accessible unread counts; conversation messages remain a labelled log.
- Keep the existing user-supplied message text and attachment payload handling. The draft remains bounded to 5,000 characters in the UI.
- Replace leftover violet chat gradients, badges, bubbles, composer, overlays, scroll tracks and avatars with `--ui-*` and native dark/light colours.
- The hidden Notes Studio shortcut is removed from the empty chat screen, while previously shared notes and direct URLs remain supported.

## Settings, Profile and Administration

- Keep the one **Settings** sidebar destination with links to Company Settings, Team & Access, Founders and Integrations according to the existing permissions.
- Highlight the current Settings destination. Company administration displays a read-only summary of the authenticated organization, currency, active finance categories and active approval policies.
- Do not expose Finance ledger or Founders action links to users who lack the respective existing read permissions.
- Organization/billing forms retain the original optimistic version checks and original endpoints.
- Profile avatar file input remains an actual keyboard-focusable native control (visually hidden instead of `display:none`), with a live uploading indicator.
- Scope neutral CSS to Company Settings, Profile, Team Accounts, Founders, ChatGPT integration and personal Search. Role-restricted screens retain their original permission checks and actions.
- Profile permissions and session information are still retrieved from the authenticated API; no role or token is persisted in local state beyond existing behavior.

## Visual and accessibility rules

- Final styles load from `apps/web/src/styles/aw-phase6-final-polish.css` **after** the Phase 5 layer.
- Strong/muted text, canvas, cards, inputs, tabs, scrollbars, selection and focus use the `--ui-*`, `--mono-scroll-*` and `--aw-chart-*` palette. Semantic status/validation rules remain `--stage-*`.
- Check keyboard-only navigation for top bar, global sidebar, mobile drawer, Settings cards, member buttons, attachment input and profile upload input.
- Ensure accessible names, inline status messages and sufficient focus contrast in dark/light modes. Honour `prefers-reduced-motion`.
- Long message threads and admin tables scroll **inside** their regions instead of forcing the entire page wider than the viewport.
- Target responsive verification at 390, 768 and 1366 pixels; existing Phase 0 screenshot capture also covers the full app route list.

## Validation required before release

1. **UI v2 route compatibility:** old URLs, hidden Notes navigation and grouped sidebar must remain intact.
2. **Lint and TypeScript:** no new React hook-order, accessibility or compile errors.
3. **Unit/API integration:** all current identity, permission, finance, client, task, approval and asset workflows.
4. **Build and API smoke:** Next.js and Express build outputs must succeed.
5. **Authenticated Playwright:** cover Conversations filter, theme switch, Messages overflow at three viewport widths, Settings permissions, Profile input, Finance, Documents, Reports, Leads, Tasks and Approvals.
6. **Screenshot audit:** inspect screenshots of main routes in desktop/mobile and dark/light; the existing opt-in baseline suite must use **isolated CI accounts only**, never client production records.
7. **Vercel deployment:** confirm the **exact squash-merge SHA** has a successful Vercel build and production alias. A prior green preview or GitHub CI does not prove that production is deployed.
8. **Deployment constraints:** the Phase 5 main merge reported a Vercel *build-rate-limit* failure. Do not conflate a quota/deployment block with a source-code failure or assert production rollout without a success result.
9. **Operational review:** verify production login, real user permissions, employee/founder entry scopes, Meta Ads Self/Client separation, private asset proof, document PDF output and messaging in a permitted production test session. CI cannot independently verify live third-party data or accounts.
10. **Rollback:** keep the previous known-good `main` merge SHA and Vercel deployment metadata. If production regressions occur, use normal deployment rollback and preserve all original records.

## Status semantics

A phase can be **code complete and merged** while production rollout remains **pending**. Record the CI state, merge SHA and Vercel state separately; never use an unverified screenshot or alias as proof of deployment.
