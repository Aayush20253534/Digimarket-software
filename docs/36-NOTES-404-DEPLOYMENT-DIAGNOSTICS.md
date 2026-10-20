# Notes API 404 release regression
The web BFF and Express route exist in `main`. The fallback response
`{"error":{"code":"NOT_FOUND","message":"Route not found"},"meta":{"requestId":"..."}}`
is emitted by Express for unregistered routes, not by the Notes service.

## Why deployment can diverge
`render.yaml` intentionally sets `autoDeployTrigger: off`. A frontend update or GitHub merge does **not** upgrade the Render API. The Prisma `20261020100000_personal_notes` migration must be deployed too.

## Non-destructive release checks
1. Render deploy the latest `main` revision using the configured build/start commands, which run `db:migrate:deploy` before API startup. Ensure database backup and rollback procedure are available.
2. Unauthenticated `GET https://<render-api>/api/v1/notes` **must return 401**, not 404.
3. Unauthenticated `GET https://<vercel-web>/api/v1/notes` **must return 401**, not 404/503.
4. Run `PROD_API_ORIGIN=https://... PROD_WEB_ORIGIN=https://... pnpm release:smoke` in a trusted environment with no user credentials (on CI, use protected variables). Existing readiness/auth checks remain.
5. Verify authenticated create → save typed + handwriting → reload → delete in Notes. Check overdue items and responsive content calendar.

If the first check is 404 the backend is stale or routes are not registered. If first check passes but the second fails, inspect `API_INTERNAL_URL` on Vercel and its correct Render origin. A missing table would normally produce 5xx after authentication, **not** the generic route 404.
