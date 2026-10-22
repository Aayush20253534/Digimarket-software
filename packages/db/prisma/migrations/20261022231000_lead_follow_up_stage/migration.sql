-- Allow sales representatives to track leads awaiting another call.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'FOLLOW_UP' AFTER 'CALL_BUSY';
