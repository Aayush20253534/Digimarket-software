-- Additive private ChatGPT OAuth and idempotency tables.
CREATE TABLE "ChatGptOAuthClient" (
 "id" VARCHAR(120) NOT NULL PRIMARY KEY,
 "redirectUris" TEXT[] NOT NULL,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ChatGptOAuthCode" (
 "codeHash" VARCHAR(64) NOT NULL PRIMARY KEY,
 "clientId" VARCHAR(120) NOT NULL,
 "redirectUri" VARCHAR(1000) NOT NULL,
 "userId" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "codeChallenge" VARCHAR(128) NOT NULL,
 "userAuthVersion" INTEGER NOT NULL,
 "resource" VARCHAR(1000) NOT NULL,
 "scopes" TEXT[] NOT NULL,
 "expiresAt" TIMESTAMPTZ(6) NOT NULL,
 "usedAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ChatGptOAuthCode_expiresAt_idx" ON "ChatGptOAuthCode" ("expiresAt");
CREATE TABLE "ChatGptGrant" (
 "id" UUID NOT NULL PRIMARY KEY,
 "clientId" VARCHAR(120) NOT NULL,
 "userId" UUID NOT NULL,
 "organizationId" UUID NOT NULL,
 "userAuthVersion" INTEGER NOT NULL,
 "scopes" TEXT[] NOT NULL,
 "accessTokenHash" VARCHAR(64),
 "refreshTokenHash" VARCHAR(64),
 "resource" VARCHAR(1000) NOT NULL,
 "accessExpiresAt" TIMESTAMPTZ(6) NOT NULL,
 "refreshExpiresAt" TIMESTAMPTZ(6) NOT NULL,
 "revokedAt" TIMESTAMPTZ(6),
 "lastUsedAt" TIMESTAMPTZ(6),
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChatGptGrant_accessTokenHash_key" ON "ChatGptGrant" ("accessTokenHash");
CREATE UNIQUE INDEX "ChatGptGrant_refreshTokenHash_key" ON "ChatGptGrant" ("refreshTokenHash");
CREATE INDEX "ChatGptGrant_organizationId_userId_createdAt_idx" ON "ChatGptGrant" ("organizationId","userId","createdAt");
CREATE TABLE "ChatGptWrite" (
 "id" UUID NOT NULL PRIMARY KEY,
 "grantId" UUID NOT NULL,
 "key" VARCHAR(80) NOT NULL,
 "toolName" VARCHAR(100) NOT NULL,
 "payloadHash" VARCHAR(64) NOT NULL,
 "state" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
 "result" JSONB,
 "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ChatGptWrite_grantId_key_key" ON "ChatGptWrite" ("grantId","key");
