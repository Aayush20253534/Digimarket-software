-- Add the nonterminal CRM stage without disturbing existing lead records.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'DECISION_PENDING' AFTER 'MEETING_PROCESS';
