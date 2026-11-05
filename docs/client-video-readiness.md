# Client video readiness (weekly stock)

## Access

Open **Clients → Video readiness** and select a client, or open a client's workspace and choose the **Video readiness** tab.

Requires `clients.read` to view, `clients.edit` to update. Counts are scoped by the current organization and client. The module does not grant additional visibility to private assets.

## Month and week

Choose a month in YYYY-MM. Each month is divided into 7-day buckets: W1 = 1–7, W2 = 8–14, W3 = 15–21, W4 = 22–28, W5 = 29 through month end (only if the last days exist). February with 28 days has four weeks; February with 29 days has five.

For each client/week manually enter:

- **New videos ready:** newly completed/approved videos entering ready stock that week, counted **once**.
- **Videos delivered:** videos handed over to the client or published as completed deliverables and leaving the ready stock.
- **Notes:** optional production/delivery context.

**Stock after each week = opening stock + newly ready − delivered.** Closing stock automatically carries forward into the next month. Available stock is ready for upcoming posting or delivery. This is not the count of raw videos, unfinished edits or queued but unapproved clips.

The selected month displays opening carried stock, newly ready this month, delivered this month, final ready stock and running stock by week. Historical month edits revalidate every subsequent week to prevent negative future stock.

## Data integrity

- One row per client, month, week; the account stores weekly movements rather than repeated stock snapshots.
- Counts are non-negative integers up to 10,000, validated server-side.
- Deliveries may not exceed available ready stock, including after a backdated revision.
- Concurrent edits use optimistic versions and serializable PostgreSQL transactions. Conflicts require a reload, rather than overwriting someone else's changes.
- Every save writes an audit entry with editor, client and previous/current counts.
- Read and write operations require both the correct permission and a client in the user's organization. Cross-workspace requests return 404.
- **This is an independent, manually maintained production tracker**, not a claim to automatically count video files, read project deliverables or infer social media posting. The distinct definitions prevent counting a prepared video several times as it remains in stock.

## Deployment

The additive Prisma migration `20261105201000_client_video_readiness` must be applied to the existing PostgreSQL database before the updated API serves these routes. No existing client, delivery, content or finance rows are reset or modified. The existing production startup migration workflow handles deployment. No new API keys or environment variables are necessary.

CI extends the isolated-PostgreSQL Clients test to cover stock rollover, February weeks, optimistic concurrency, negative-stock validation, tenant isolation and audit history.
