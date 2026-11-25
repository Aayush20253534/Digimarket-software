ALTER TABLE "Quotation" ADD COLUMN "clientId" UUID, ADD COLUMN "leadId" UUID, ADD COLUMN "revisionOfId" UUID;
ALTER TABLE "Agreement" ADD COLUMN "clientId" UUID, ADD COLUMN "leadId" UUID, ADD COLUMN "revisionOfId" UUID, ADD COLUMN "sourceQuotationId" UUID;
CREATE TABLE "DocumentDraft" (
 "organizationId" UUID NOT NULL, "userId" UUID NOT NULL, "kind" VARCHAR(16) NOT NULL, "payload" JSONB NOT NULL, "links" JSONB NOT NULL, "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "DocumentDraft_pkey" PRIMARY KEY ("organizationId","userId","kind"),
 CONSTRAINT "DocumentDraft_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 CONSTRAINT "DocumentDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

ALTER TABLE "Quotation" ADD COLUMN "validThrough" DATE;
UPDATE "Quotation" SET "validThrough" = "quoteDate" + (CASE WHEN jsonb_typeof("payload"->'validityDays') = 'number' THEN LEAST(180, GREATEST(1, ("payload"->>'validityDays')::numeric::integer)) ELSE 7 END - 1);
ALTER TABLE "Quotation" ALTER COLUMN "validThrough" SET NOT NULL;
CREATE INDEX "Quotation_organizationId_validThrough_idx" ON "Quotation"("organizationId","validThrough");
