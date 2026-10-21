-- Preserve existing LeadStage values and historical client references.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'REJECTED';
ALTER TABLE "Lead"
  ADD COLUMN "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN "deletedById" UUID;
CREATE INDEX "Lead_organizationId_deletedAt_createdAt_idx"
  ON "Lead"("organizationId","deletedAt","createdAt");
