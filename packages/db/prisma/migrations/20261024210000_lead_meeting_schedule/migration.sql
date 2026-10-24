-- Store a real meeting timestamp separately from the follow-up calendar date.
-- Existing Meeting Process leads remain unscheduled until a date and time are chosen.
ALTER TABLE "Lead" ADD COLUMN "meetingAt" TIMESTAMPTZ(6);
CREATE INDEX "Lead_organizationId_status_meetingAt_idx"
  ON "Lead" ("organizationId", "status", "meetingAt");