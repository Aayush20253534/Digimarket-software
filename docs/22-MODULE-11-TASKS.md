# Module 11 — Staff tasks and recurring work

## Implemented
- `/app/tasks` for staff-specific tasks, organization-wide management views, filters, priorities, assigned employees, due times, and optional existing client project association.
- `Task`, `TaskAssignment`, `TaskChecklistItem`, `TaskComment` and `TaskRecurrence` relational models with migration `20261019080000_tasks_recurrence`.
- Project-linked tasks require the assignees to be active members of that project; cross-organization access remains denied.
- Employees can see their assigned/created tasks and change assigned task statuses and checklist entries. Managers can manage all tasks and assignees. Creator-only tasks are visible to the creator; staff without assignment cannot alter tasks.
- Completion requires an entirely checked checklist. Comments are permission-gated and never exposed through another user's task details.
- Recurrence supports daily, weekly, monthly intervals from 1 to 12 and timezone-specific wall-clock times. Monthly dates clamp to the last day; DST nonexistent wall times advance to the next valid time, and ambiguous times choose the first occurrence.
- Separate worker app powered by BullMQ's Job Scheduler; wakes every minute and sweeps at most 100 due occurrences per job. PostgreSQL performs atomic recurrence cursor compare-and-swap and a unique (recurrenceId,scheduledFor) key for retry-safe exactly-once task instance creation.
- Schedule auto-pauses if assignees become disabled or associated project is closed or membership is lost.
- Outbox and redacted audit events are persisted transactionally with task creation and due recurrence generation.

## API
- GET/POST `/api/v1/tasks` (`view=mine|team`, status, projectId, q, cursor, limit)
- GET `/api/v1/tasks/team` staff options; GET/PUT `/api/v1/tasks/:id`
- PUT `/api/v1/tasks/:id/assignees`
- POST `/api/v1/tasks/:id/checklist`; PUT `/api/v1/tasks/:id/checklist/:itemId`
- POST `/api/v1/tasks/:id/comments`
- GET/POST `/api/v1/task-recurrences`
- PUT `/api/v1/task-recurrences/:id` (pause or resume)

## Roles
- SUPER_ADMIN, ADMIN and FOUNDER: tasks.create, tasks.read, tasks.manage, tasks.recurrence.manage, tasks.comment, tasks.update.own.
- EMPLOYEE: tasks.read, tasks.comment, tasks.update.own. No unrestricted team visibility or unapproved new recurrence schedule.
- System permission catalog and default system role seeder are additive; custom roles preserved.
- Run the idempotent `pnpm --filter @digimarket/db exec tsx src/seed.ts` after applying migrations to existing organizations.

## Quality and deployment
- GitHub workflow `.github/workflows/module11-tasks.yml` uses disposable PostgreSQL 16 + Redis 7; tests migration application, schema drift, workspace build, task isolation, optimistic version guards, checklist/comments, recurrence worker, DST/month-end, auto-pause, and Module 10 regression.
- Runtime worker: `pnpm --filter @digimarket/worker start`, with `DATABASE_URL` and `REDIS_URL` in host-managed secret storage.
- Recurrence is asynchronous; worker is required for automatic occurrences. API alone does not execute jobs. Redis must be managed and monitored for production.
- Catch-up backlog processes at most 100 instances per scan; monitor lag and recurrence pauses.
- No managed Redis or live Neon deployment is provisioned by this module. Production rollout remains Module 17.
