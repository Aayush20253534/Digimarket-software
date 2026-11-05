-- Add isolated client review-card records without changing existing CRM tables.
CREATE TABLE "ReviewCard" (
 "id" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "clientId" UUID NOT NULL,
 "createdById" UUID NOT NULL,
 "slug" VARCHAR(48) NOT NULL,
 "businessName" VARCHAR(180) NOT NULL,
 "googleReviewUrl" VARCHAR(1000) NOT NULL,
 "businessDetails" VARCHAR(1200) NOT NULL DEFAULT '',
 "logoUrl" VARCHAR(1000),
 "accentColor" VARCHAR(7) NOT NULL DEFAULT '#A855F7',
 "language" VARCHAR(12) NOT NULL DEFAULT 'English',
 "enabled" BOOLEAN NOT NULL DEFAULT true,
 "generationCount" INTEGER NOT NULL DEFAULT 0,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "ReviewCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ReviewCard_clientId_key" ON "ReviewCard"("clientId");
CREATE UNIQUE INDEX "ReviewCard_slug_key" ON "ReviewCard"("slug");
CREATE INDEX "ReviewCard_organizationId_createdAt_idx" ON "ReviewCard"("organizationId","createdAt");
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReviewCard" ADD CONSTRAINT "ReviewCard_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ReviewCardEvent" (
 "id" UUID NOT NULL,
 "cardId" UUID NOT NULL,
 "kind" VARCHAR(16) NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "ReviewCardEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewCardEvent_cardId_kind_createdAt_idx" ON "ReviewCardEvent"("cardId","kind","createdAt");
ALTER TABLE "ReviewCardEvent" ADD CONSTRAINT "ReviewCardEvent_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "ReviewCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
