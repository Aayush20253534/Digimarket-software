-- Support cross-organization login lookup and active client agreement filtering.
CREATE INDEX "User_loginId_idx" ON "User"("loginId");
CREATE INDEX "Client_organizationId_status_contractEndOn_idx" ON "Client"("organizationId", "status", "contractEndOn");
