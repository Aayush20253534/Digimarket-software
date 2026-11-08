# DigiMarket AI Review Cards

## Customer flow
- Founders/staff with `clients.read` can inspect cards; `clients.edit` can create, edit, pause, and permanently delete them.
- Each card has a Delete action with a confirmation dialog. Deletion removes the card and its SCAN/GENERATED/CLICK events (via database cascade), invalidates printed QR links, and does **not** delete the CRM client or Google reviews.
- Create one card for an existing CRM client, entering the exact Google Business Profile “Ask for reviews” link.
- A unique opaque slug and QR code point to `/review/<slug>`. Print the card from the dashboard.
- On scanning, the public page automatically navigates to the stored official Google write-review URL; no draft is generated.
- Existing printed `/review/<slug>` QR links remain valid and now redirect automatically.
- The separate dashboard “AI draft preview” link uses `/review/<slug>?draft=1`; customer must replace all placeholders with genuine personal experience.
- DigiMarket cannot post reviews on customers’ behalf.

## Backend and deployment
1. Deploy the additive migration at `packages/db/prisma/migrations/20261105170000_ai_review_cards/migration.sql` with `pnpm --filter @digimarket/db db:migrate:deploy`.
2. Build and deploy the backend and frontend at the same revision. Deploy backend first if independent.
3. On the Render API service configure `GROQ_API_KEY` (server-side only) and optionally `GROQ_REVIEW_MODEL` (default `openai/gpt-oss-20b`). Obtain the key from https://console.groq.com/keys. The Groq API uses `https://api.groq.com/openai/v1/chat/completions`. If `GROQ_API_KEY` is absent, the previous `OPENAI_API_KEY` / `OPENAI_REVIEW_MODEL` integration remains available.
4. Without a valid API key, on provider quota exhaustion (HTTP 429), provider failure or timeout, the system intentionally returns a labeled non-AI starter draft, rather than silently charging a secondary provider. Never disclose the API key to the browser.
5. Deploy backend before frontend so `/public/:slug/scan` is present for tracking.
6. Test `/app/ai-review-cards`: scan the QR to confirm it opens the correct Google review form without the AI draft page. Test “AI draft preview” separately.

## Data, privacy, metrics
- `ReviewCard` is organization-scoped and linked to one existing client.
- `ReviewCardEvent` stores only `SCAN`, `GENERATED` and `CLICK` events with timestamps, no customer identity, clipboard content, or review contents.
- Direct QR scans record `SCAN` and `CLICK` redirect-attempt events when telemetry is available, **not** verified published reviews or guaranteed local SEO gains.
- AI draft generation is opt-in and records `SCAN` and `GENERATED`. Scan tracking is best-effort and must not delay Google navigation for more than 900 ms.
- Public endpoints are rate-limited. Cards can be paused or permanently deleted from the dashboard. QR links do not change after editing; deleted QR links become invalid. The DELETE endpoint requires `clients.edit` and filters by organization.
- QR artwork currently uses the public `api.qrserver.com` image endpoint and therefore depends on that provider for rendering. A local QR renderer would require adding and locking a dependency.
- The default AI prompt disallows invented customer experiences, fake praise, star ratings, incentives, and posting automation.
