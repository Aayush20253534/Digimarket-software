CREATE TABLE "Notification" (
 "id" UUID NOT NULL,"organizationId" UUID NOT NULL,"recipientId" UUID NOT NULL,
 "dedupeKey" VARCHAR(180) NOT NULL,"kind" VARCHAR(40) NOT NULL,
 "title" VARCHAR(160) NOT NULL,"body" VARCHAR(300) NOT NULL,
 "href" VARCHAR(160) NOT NULL,"readAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_organizationId_recipientId_dedupeKey_key" ON "Notification"("organizationId","recipientId","dedupeKey");
CREATE INDEX "Notification_organizationId_recipientId_createdAt_id_idx" ON "Notification"("organizationId","recipientId","createdAt","id");
CREATE INDEX "Notification_organizationId_recipientId_readAt_idx" ON "Notification"("organizationId","recipientId","readAt");
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientId_fkey"
 FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
