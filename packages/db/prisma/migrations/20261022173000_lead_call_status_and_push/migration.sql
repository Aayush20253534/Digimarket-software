-- Add call outcomes as separate enum migration so values are committed before use.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'CALL_NOT_PICKING';
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'CALL_BUSY';
ALTER TABLE "Lead" ADD COLUMN "stageNote" TEXT NOT NULL DEFAULT '';
-- Recover the latest recorded call/status note from existing activity history.
UPDATE "Lead" AS l SET "stageNote"=COALESCE((
  SELECT a."note" FROM "LeadActivity" a
  WHERE a."leadId"=l.id AND a."note" IS NOT NULL AND length(trim(a."note"))>0
  ORDER BY a."createdAt" DESC LIMIT 1
),'');
CREATE TABLE "WebPushSubscription" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "endpointHash" VARCHAR(64) NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebPushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WebPushSubscription_endpointHash_key" ON "WebPushSubscription"("endpointHash");
CREATE INDEX "WebPushSubscription_organizationId_userId_idx" ON "WebPushSubscription"("organizationId","userId");
ALTER TABLE "WebPushSubscription" ADD CONSTRAINT "WebPushSubscription_userId_fkey"
 FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
