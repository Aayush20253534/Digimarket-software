CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE','PAUSED','ARCHIVED');
CREATE TYPE "ClientServiceStatus" AS ENUM ('ACTIVE','PAUSED','ENDED');

CREATE TABLE "Client" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "sourceLeadId" UUID,
 "createdById" UUID NOT NULL,
 "businessName" VARCHAR(180) NOT NULL,
 "businessType" VARCHAR(120),
 "phone" VARCHAR(40),
 "email" VARCHAR(255),
 "location" VARCHAR(240),
 "websiteUrl" VARCHAR(500),
 "instagramUrl" VARCHAR(500),
 "facebookUrl" VARCHAR(500),
 "notes" VARCHAR(2000),
 "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "Client_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Client_version_check" CHECK ("version" >= 1)
);
CREATE TABLE "ClientContact" (
 "id" UUID NOT NULL,
 "clientId" UUID NOT NULL,
 "name" VARCHAR(160) NOT NULL,
 "role" VARCHAR(120),
 "phone" VARCHAR(40),
 "email" VARCHAR(255),
 "isPrimary" BOOLEAN NOT NULL DEFAULT false,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientService" (
 "id" UUID NOT NULL,
 "clientId" UUID NOT NULL,
 "name" VARCHAR(120) NOT NULL,
 "description" VARCHAR(1000),
 "status" "ClientServiceStatus" NOT NULL DEFAULT 'ACTIVE',
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "ClientService_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Client_sourceLeadId_key" ON "Client"("sourceLeadId");
CREATE INDEX "Client_organizationId_status_updatedAt_idx" ON "Client"("organizationId","status","updatedAt");
CREATE INDEX "Client_organizationId_businessName_idx" ON "Client"("organizationId","businessName");
CREATE INDEX "ClientContact_clientId_createdAt_idx" ON "ClientContact"("clientId","createdAt");
CREATE UNIQUE INDEX "ClientContact_one_primary_per_client" ON "ClientContact"("clientId") WHERE "isPrimary" = true;
CREATE INDEX "ClientService_clientId_status_idx" ON "ClientService"("clientId","status");
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_sourceLeadId_fkey" FOREIGN KEY ("sourceLeadId") REFERENCES "Lead"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientService" ADD CONSTRAINT "ClientService_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
