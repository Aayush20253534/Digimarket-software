-- Personal typed and hand-drawn notes. Tenant and owner required on every query.
CREATE TABLE "PersonalNote" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "ownerId" UUID NOT NULL,
 "title" VARCHAR(180) NOT NULL DEFAULT 'Untitled',
 "body" TEXT NOT NULL DEFAULT '',
 "strokes" TEXT NOT NULL DEFAULT '[]',
 "version" INTEGER NOT NULL DEFAULT 1,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "PersonalNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PersonalNote_organizationId_ownerId_updatedAt_id_idx"
 ON "PersonalNote"("organizationId","ownerId","updatedAt","id");
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_organizationId_fkey"
 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_ownerId_fkey"
 FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
