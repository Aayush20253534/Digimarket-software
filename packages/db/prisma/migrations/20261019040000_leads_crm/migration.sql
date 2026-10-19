CREATE TYPE "LeadStage" AS ENUM ('NEW','CONTACTED','QUALIFIED','PROPOSAL','WON','LOST');
CREATE TYPE "LeadActivityKind" AS ENUM ('CREATED','NOTE','STAGE_CHANGED','OWNER_ASSIGNED','FOLLOW_UP_SET','DETAILS_UPDATED','DUPLICATE_REVIEWED');
CREATE TYPE "LeadDuplicateResolution" AS ENUM ('OPEN','CONFIRMED','DISMISSED');
CREATE TABLE "Lead" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "businessName" VARCHAR(180) NOT NULL,
 "normalizedBusinessName" VARCHAR(180) NOT NULL,
 "contactName" VARCHAR(160),
 "phone" VARCHAR(40),
 "normalizedPhone" VARCHAR(20),
 "businessType" VARCHAR(120),
 "location" VARCHAR(240),
 "websiteUrl" VARCHAR(500),
 "instagramUrl" VARCHAR(500),
 "source" VARCHAR(120),
 "status" "LeadStage" NOT NULL DEFAULT 'NEW',
 "assignedToId" UUID,
 "createdById" UUID NOT NULL,
 "nextFollowUpAt" TIMESTAMPTZ(6),
 "importKey" UUID,
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "Lead_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Lead_version_check" CHECK ("version" >= 1)
);
CREATE TABLE "LeadActivity" (
 "id" UUID NOT NULL,
 "leadId" UUID NOT NULL,
 "actorId" UUID NOT NULL,
 "kind" "LeadActivityKind" NOT NULL,
 "note" VARCHAR(2000),
 "metadata" JSONB,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LeadActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeadDuplicateCandidate" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "leadId" UUID NOT NULL,
 "candidateId" UUID NOT NULL,
 "reason" VARCHAR(80) NOT NULL,
 "resolution" "LeadDuplicateResolution" NOT NULL DEFAULT 'OPEN',
 "resolvedById" UUID,
 "resolvedAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "LeadDuplicateCandidate_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "LeadDuplicateCandidate_pair_check" CHECK ("leadId" < "candidateId")
);
CREATE UNIQUE INDEX "Lead_organizationId_importKey_key" ON "Lead"("organizationId","importKey");
CREATE INDEX "Lead_organizationId_status_updatedAt_idx" ON "Lead"("organizationId","status","updatedAt");
CREATE INDEX "Lead_organizationId_assignedToId_nextFollowUpAt_idx" ON "Lead"("organizationId","assignedToId","nextFollowUpAt");
CREATE INDEX "Lead_organizationId_normalizedPhone_idx" ON "Lead"("organizationId","normalizedPhone");
CREATE INDEX "Lead_organizationId_normalizedBusinessName_idx" ON "Lead"("organizationId","normalizedBusinessName");
CREATE INDEX "LeadActivity_leadId_createdAt_idx" ON "LeadActivity"("leadId","createdAt");
CREATE UNIQUE INDEX "LeadDuplicateCandidate_organizationId_leadId_candidateId_key" ON "LeadDuplicateCandidate"("organizationId","leadId","candidateId");
CREATE INDEX "LeadDuplicateCandidate_organizationId_resolution_createdAt_idx" ON "LeadDuplicateCandidate"("organizationId","resolution","createdAt");
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadActivity" ADD CONSTRAINT "LeadActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadDuplicateCandidate" ADD CONSTRAINT "LeadDuplicateCandidate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadDuplicateCandidate" ADD CONSTRAINT "LeadDuplicateCandidate_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadDuplicateCandidate" ADD CONSTRAINT "LeadDuplicateCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeadDuplicateCandidate" ADD CONSTRAINT "LeadDuplicateCandidate_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
