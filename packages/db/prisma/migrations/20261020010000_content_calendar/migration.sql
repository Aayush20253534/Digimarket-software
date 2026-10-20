CREATE TYPE "ContentStatus" AS ENUM ('IDEA','DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','SCHEDULED','PUBLISHED','CANCELLED');
CREATE TYPE "ContentPlatform" AS ENUM ('INSTAGRAM','FACEBOOK','LINKEDIN','YOUTUBE','GOOGLE_BUSINESS','WEBSITE','OTHER');
CREATE TYPE "ContentFormat" AS ENUM ('REEL','POST','STORY','CAROUSEL','VIDEO','BLOG','OTHER');
CREATE TABLE "ContentPost" (
"id" UUID NOT NULL, "organizationId" UUID NOT NULL, "clientId" UUID NOT NULL, "projectId" UUID,
"createdById" UUID NOT NULL, "ownerId" UUID NOT NULL, "publishedById" UUID,
"approvalRequestId" UUID, "title" VARCHAR(180) NOT NULL, "caption" TEXT NOT NULL,
"hashtags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[], "platform" "ContentPlatform" NOT NULL,
"format" "ContentFormat" NOT NULL, "status" "ContentStatus" NOT NULL DEFAULT 'IDEA',
"publishAt" TIMESTAMPTZ(6), "publishedAt" TIMESTAMPTZ(6), "publishedUrl" VARCHAR(1000),
"version" INTEGER NOT NULL DEFAULT 1, "revision" INTEGER NOT NULL DEFAULT 1,
"createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
"updatedAt" TIMESTAMPTZ(6) NOT NULL,
CONSTRAINT "ContentPost_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ContentPostAsset" (
"postId" UUID NOT NULL, "assetId" UUID NOT NULL,"sortOrder" INTEGER NOT NULL DEFAULT 0,
CONSTRAINT "ContentPostAsset_pkey" PRIMARY KEY ("postId","assetId")
);
CREATE TABLE "ContentPostRevision" (
"id" UUID NOT NULL,"postId" UUID NOT NULL,"revision" INTEGER NOT NULL,
"snapshot" JSONB NOT NULL,"actorId" UUID NOT NULL,
"createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
CONSTRAINT "ContentPostRevision_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentPost_approvalRequestId_key" ON "ContentPost"("approvalRequestId");
CREATE INDEX "ContentPost_organizationId_publishAt_status_idx" ON "ContentPost"("organizationId","publishAt","status");
CREATE INDEX "ContentPost_organizationId_clientId_publishAt_idx" ON "ContentPost"("organizationId","clientId","publishAt");
CREATE INDEX "ContentPost_organizationId_ownerId_status_idx" ON "ContentPost"("organizationId","ownerId","status");
CREATE INDEX "ContentPostAsset_assetId_idx" ON "ContentPostAsset"("assetId");
CREATE UNIQUE INDEX "ContentPostRevision_postId_revision_key" ON "ContentPostRevision"("postId","revision");
CREATE INDEX "ContentPostRevision_postId_createdAt_idx" ON "ContentPostRevision"("postId","createdAt");
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPost" ADD CONSTRAINT "ContentPost_approvalRequestId_fkey" FOREIGN KEY ("approvalRequestId") REFERENCES "ApprovalRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPostAsset" ADD CONSTRAINT "ContentPostAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ContentPostAsset" ADD CONSTRAINT "ContentPostAsset_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ContentPostRevision" ADD CONSTRAINT "ContentPostRevision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "ContentPost"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
