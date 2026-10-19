CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE','ARCHIVED');
CREATE TYPE "AssetUploadState" AS ENUM ('PENDING','CONFIRMED');
CREATE TYPE "AssetResourceType" AS ENUM ('IMAGE','VIDEO','RAW');
CREATE TABLE "AssetUploadIntent" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "createdById" UUID NOT NULL,
 "clientId" UUID,
 "publicId" VARCHAR(255) NOT NULL,
 "filename" VARCHAR(180) NOT NULL,
 "contentType" VARCHAR(100) NOT NULL,
 "resourceType" "AssetResourceType" NOT NULL,
 "expectedBytes" INTEGER NOT NULL,
 "status" "AssetUploadState" NOT NULL DEFAULT 'PENDING',
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "AssetUploadIntent_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "AssetUploadIntent_bytes_positive" CHECK ("expectedBytes" > 0)
);
CREATE TABLE "Asset" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "uploadedById" UUID NOT NULL,
 "clientId" UUID,
 "uploadIntentId" UUID NOT NULL,
 "providerAssetId" VARCHAR(120) NOT NULL,
 "publicId" VARCHAR(255) NOT NULL,
 "filename" VARCHAR(180) NOT NULL,
 "contentType" VARCHAR(100) NOT NULL,
 "resourceType" "AssetResourceType" NOT NULL,
 "format" VARCHAR(16) NOT NULL,
 "bytes" INTEGER NOT NULL,
 "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "Asset_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "Asset_positive_bytes" CHECK ("bytes" > 0),
 CONSTRAINT "Asset_positive_version" CHECK ("version" >= 1)
);
CREATE UNIQUE INDEX "AssetUploadIntent_publicId_key" ON "AssetUploadIntent"("publicId");
CREATE INDEX "AssetUploadIntent_organizationId_expiresAt_status_idx" ON "AssetUploadIntent"("organizationId","expiresAt","status");
CREATE UNIQUE INDEX "Asset_uploadIntentId_key" ON "Asset"("uploadIntentId");
CREATE UNIQUE INDEX "Asset_providerAssetId_key" ON "Asset"("providerAssetId");
CREATE UNIQUE INDEX "Asset_publicId_key" ON "Asset"("publicId");
CREATE INDEX "Asset_organizationId_status_createdAt_idx" ON "Asset"("organizationId","status","createdAt");
CREATE INDEX "Asset_organizationId_clientId_createdAt_idx" ON "Asset"("organizationId","clientId","createdAt");
CREATE INDEX "Asset_organizationId_filename_idx" ON "Asset"("organizationId","filename");
ALTER TABLE "AssetUploadIntent" ADD CONSTRAINT "AssetUploadIntent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetUploadIntent" ADD CONSTRAINT "AssetUploadIntent_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetUploadIntent" ADD CONSTRAINT "AssetUploadIntent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_uploadIntentId_fkey" FOREIGN KEY ("uploadIntentId") REFERENCES "AssetUploadIntent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
