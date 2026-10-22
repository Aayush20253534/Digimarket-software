-- Allow sales staff to mark prospects that have not been contacted yet.
-- Existing pending leads and the default for new leads are unchanged.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'YET_TO_CALL' AFTER 'PENDING';
