-- New values must commit before being used in the data migration.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'MEETING_PROCESS';
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'APPROVED';
