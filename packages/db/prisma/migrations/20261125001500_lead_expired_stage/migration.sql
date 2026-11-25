-- Former clients remain in their acquisition cohort; transition is guarded by the CRM service.
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'EXPIRED';
