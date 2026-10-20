
-- Non-destructive Notes Studio extension; existing notes are retained verbatim.
ALTER TABLE "PersonalNote" ADD COLUMN "pages" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "PersonalNote" ADD COLUMN "notebookId" UUID;
ALTER TABLE "PersonalNote" ADD COLUMN "starred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PersonalNote" ADD COLUMN "deletedAt" TIMESTAMPTZ(6);
CREATE TABLE "PersonalNotebook" (
 "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "ownerId" UUID NOT NULL,
 "name" VARCHAR(100) NOT NULL, "color" VARCHAR(7) NOT NULL DEFAULT '#8C45DB',
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonalNotebook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonalNotebook_organizationId_ownerId_name_idx" ON "PersonalNotebook"("organizationId","ownerId","name");
CREATE INDEX "PersonalNote_organizationId_ownerId_deletedAt_idx" ON "PersonalNote"("organizationId","ownerId","deletedAt");
