# Client Post Readiness

Post Readiness is a **separate** weekly inventory ledger in DigiMarket Clients, parallel to Video Readiness. Its quantities never change the video ledger.

## Workflow

Open **Clients → Post readiness**, select the client and month, or open an individual client's **Post readiness** tab. For each week, enter:
- **New posts ready**: completed, approved static posts/designs ready for future posting or delivery, added to stock once.
- **Posts delivered**: completed posts handed over to the client or published, leaving the available stock.
- **Notes**: optional production and delivery context.

Stock after week = opening stock + new posts ready − posts delivered.

Weeks are 1–7, 8–14, 15–21, 22–28, and 29–month end when applicable. Unused ready posts carry into the next week and next month. Backdated corrections are checked against all subsequent weeks to prevent negative stock.

## Controls

Existing **clients.read** permission allows viewing. **clients.edit** permits saving counts. Clients are organization-scoped. Saves use an optimistic version, serializable database transaction, a unique client/month/week record, and the existing audit log. Counts must be nonnegative integers at most 10,000. Post Readiness has no dependency on Video Readiness stock.

The tracker is manually maintained; it does **not** automatically count Instagram posts, designs, scheduled publications, media assets, or uploaded files.

## Deploy

Deploy the frontend and the matching backend from the merged `main` commit. Apply the additive Prisma migration `20261106090000_client_post_readiness` to the existing Postgres database before using the new API. Do not reset existing data. No additional API keys are required.

Routes:
- `GET /api/v1/clients/:id/post-readiness?month=YYYY-MM`
- `PUT /api/v1/clients/:id/post-readiness/:week` with `{month,readyAdded,delivered,note,version}`

Both routes are explicitly permitted by the Next.js API proxy, and the read route forwards the `month` query parameter.
