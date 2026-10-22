ALTER TABLE "PersonalNote" ADD COLUMN "kind" VARCHAR(16) NOT NULL DEFAULT 'handwritten';
UPDATE "PersonalNote" SET "kind"='typed' WHERE LENGTH(TRIM("body"))>0 AND ("strokes"='[]' OR "strokes"='');
ALTER TABLE "User" ADD COLUMN "avatarData" TEXT;
CREATE TABLE "WorkspaceMessage" ("id" UUID NOT NULL, "organizationId" UUID NOT NULL, "senderId" UUID NOT NULL, "recipientId" UUID NOT NULL, "text" TEXT NOT NULL DEFAULT '', "noteSnapshot" JSONB, "attachment" JSONB, "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "WorkspaceMessage_pkey" PRIMARY KEY ("id"));
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMessage" ADD CONSTRAINT "WorkspaceMessage_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "WorkspaceMessage_organizationId_senderId_recipientId_createdAt_idx" ON "WorkspaceMessage"("organizationId","senderId","recipientId","createdAt");
CREATE INDEX "WorkspaceMessage_organizationId_recipientId_createdAt_idx" ON "WorkspaceMessage"("organizationId","recipientId","createdAt");
