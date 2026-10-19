# Background worker: Module 11

Run one or more separate processes with `pnpm --filter @digimarket/worker start`.

Required: `DATABASE_URL` (Postgres runtime URL), `REDIS_URL` (managed Redis/Valkey).
BullMQ 5 job scheduler `minute-sweep` wakes a database recurrence sweep every minute.
The worker uses a transactional PostgreSQL cursor update and a compound unique constraint
on `(recurrenceId, scheduledFor)`. Redis delivery is deliberately *not* the source of
exactly-once guarantees. Multiple workers and retries cannot produce duplicate task occurrences.

Schedules are daily, weekly or monthly at local civil time in the specified IANA timezone.
Monthly dates clamp to the last day of short months. DST gaps advance to the first valid
local time; ambiguous times use the earliest matching instant.
Each sweep handles up to 100 due occurrences; large backlogs drain across sweeps.
Schedules with inactive assignees or closed projects are automatically paused.
No worker/Redis runs in the web or API hosting process. CI verifies DB deduplication and
worker build; Module 17 provisions managed Redis, deployment, monitoring and recovery.
