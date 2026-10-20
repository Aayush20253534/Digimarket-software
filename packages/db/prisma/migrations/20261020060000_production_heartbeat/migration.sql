-- Internal production worker heartbeat; contains no tenant or customer data.
CREATE TABLE "ServiceHeartbeat" (
 "service" VARCHAR(40) NOT NULL,
 "startedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "lastSeenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMPTZ(6) NOT NULL,
 CONSTRAINT "ServiceHeartbeat_pkey" PRIMARY KEY ("service")
);
