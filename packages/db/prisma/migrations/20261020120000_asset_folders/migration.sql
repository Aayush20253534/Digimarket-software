CREATE TABLE "AssetFolder" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "createdById" UUID NOT NULL,
 "parentId" UUID,
 "name" VARCHAR(120) NOT NULL,
 "color" VARCHAR(7) NOT NULL DEFAULT '#A56CE4',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "AssetFolder_pkey" PRIMARY KEY("id")
);
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssetFolder" ADD CONSTRAINT "AssetFolder_parentId_fkey"
 FOREIGN KEY ("parentId") REFERENCES "AssetFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "AssetFolder_organizationId_parentId_name_idx" ON "AssetFolder"("organizationId","parentId","name");
ALTER TABLE "Asset" ADD COLUMN "folderId" UUID;
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_folderId_fkey"
 FOREIGN KEY ("folderId") REFERENCES "AssetFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Asset_organizationId_folderId_status_createdAt_idx"
 ON "Asset"("organizationId","folderId","status","createdAt");
