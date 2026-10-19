# Background worker

Module 1 reserves a distinct workspace for a future BullMQ worker. No queues, schedules, automatic tasks, or data writes are active yet.

The real worker lifecycle, Redis connection, job deduplication, retry policy, and PostgreSQL outbox integration are implemented in subsequent modules.
