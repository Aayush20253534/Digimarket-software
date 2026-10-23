-- Record an agreement awaiting signature without changing existing lead stages.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'AGREEMENT_PENDING' AFTER 'DECISION_PENDING';
