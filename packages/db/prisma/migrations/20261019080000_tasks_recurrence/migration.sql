CREATE TYPE "TaskStatus" AS ENUM ('TODO','IN_PROGRESS','BLOCKED','IN_REVIEW','DONE','CANCELLED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW','MEDIUM','HIGH','URGENT');
CREATE TYPE "RecurrenceFrequency" AS ENUM ('DAILY','WEEKLY','MONTHLY');
CREATE TABLE "TaskRecurrence" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID,
 "createdById" UUID NOT NULL, "title" VARCHAR(180) NOT NULL, "description" VARCHAR(2000),
 "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM', "assigneeIds" UUID[] NOT NULL,
 "frequency" "RecurrenceFrequency" NOT NULL, "interval" INTEGER NOT NULL DEFAULT 1,
 "timezone" VARCHAR(80) NOT NULL, "anchorAt" TIMESTAMPTZ(6) NOT NULL,
 "nextRunAt" TIMESTAMPTZ(6) NOT NULL, "dueOffsetDays" INTEGER NOT NULL DEFAULT 0,
 "enabled" BOOLEAN NOT NULL DEFAULT true, "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "TaskRecurrence_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Task" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "projectId" UUID,
 "createdById" UUID NOT NULL, "recurrenceId" UUID, "scheduledFor" TIMESTAMPTZ(6),
 "title" VARCHAR(180) NOT NULL, "description" VARCHAR(2000),
 "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
 "status" "TaskStatus" NOT NULL DEFAULT 'TODO', "dueAt" TIMESTAMPTZ(6),
 "completedAt" TIMESTAMPTZ(6), "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskAssignment" (
 "taskId" UUID NOT NULL, "userId" UUID NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TaskAssignment_pkey" PRIMARY KEY ("taskId","userId")
);
CREATE TABLE "TaskChecklistItem" (
 "id" UUID NOT NULL, "taskId" UUID NOT NULL,
 "label" VARCHAR(240) NOT NULL, "completed" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "TaskChecklistItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TaskComment" (
 "id" UUID NOT NULL, "taskId" UUID NOT NULL, "authorId" UUID NOT NULL,
 "body" VARCHAR(2000) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Task_recurrenceId_scheduledFor_key" ON "Task"("recurrenceId","scheduledFor");
CREATE INDEX "Task_organizationId_status_dueAt_idx" ON "Task"("organizationId","status","dueAt");
CREATE INDEX "Task_organizationId_createdAt_id_idx" ON "Task"("organizationId","createdAt","id");
CREATE INDEX "Task_projectId_status_idx" ON "Task"("projectId","status");
CREATE INDEX "TaskAssignment_userId_taskId_idx" ON "TaskAssignment"("userId","taskId");
CREATE INDEX "TaskChecklistItem_taskId_createdAt_idx" ON "TaskChecklistItem"("taskId","createdAt");
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId","createdAt");
CREATE INDEX "TaskRecurrence_enabled_nextRunAt_idx" ON "TaskRecurrence"("enabled","nextRunAt");
CREATE INDEX "TaskRecurrence_organizationId_createdAt_idx" ON "TaskRecurrence"("organizationId","createdAt");
ALTER TABLE "Task" ADD CONSTRAINT "Task_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Task" ADD CONSTRAINT "Task_recurrenceId_fkey" FOREIGN KEY ("recurrenceId") REFERENCES "TaskRecurrence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskAssignment" ADD CONSTRAINT "TaskAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskChecklistItem" ADD CONSTRAINT "TaskChecklistItem_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TaskRecurrence" ADD CONSTRAINT "TaskRecurrence_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
