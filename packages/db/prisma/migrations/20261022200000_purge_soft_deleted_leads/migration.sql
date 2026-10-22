-- Replace the legacy soft-delete model with actual database deletion.
-- Run once on deployment; keep converted client records but detach their
-- foreign key from historical leads that were already marked deleted.
-- Retain redacted audit logs, which are not FK references to Lead.
BEGIN;

UPDATE "Client" AS client
SET "sourceLeadId" = NULL
WHERE "sourceLeadId" IN (
  SELECT "id" FROM "Lead" WHERE "deletedAt" IS NOT NULL
);

DELETE FROM "LeadDuplicateCandidate" AS candidate
WHERE EXISTS (
  SELECT 1 FROM "Lead" AS lead
  WHERE lead."deletedAt" IS NOT NULL
    AND (lead."id" = candidate."leadId" OR lead."id" = candidate."candidateId")
);

DELETE FROM "LeadActivity" AS activity
USING "Lead" AS lead
WHERE activity."leadId" = lead."id" AND lead."deletedAt" IS NOT NULL;

DELETE FROM "Lead" WHERE "deletedAt" IS NOT NULL;

COMMIT;
