import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "./client.ts";
import { permissionCatalog } from "./permissions.ts";

if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL?.includes("digimarket_ci")) {
  throw new Error("Refusing database integration smoke outside isolated digimarket_ci test database");
}

const prisma = createDatabaseClient();
const rollbackMarker = "INTENTIONAL_TRANSACTION_ROLLBACK";
const slug = randomUUID().slice(0, 12);

try {
  assert.equal(await prisma.permission.count(), permissionCatalog.length);
  const firstOrganizationId = randomUUID();
  const secondOrganizationId = randomUUID();
  let rollbackHappened = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.organization.create({
        data: { id: firstOrganizationId, name: `test-one-${slug}` },
      });
      await tx.organization.create({
        data: { id: secondOrganizationId, name: `test-two-${slug}` },
      });

      const userOne = await tx.user.create({
        data: {
          organizationId: firstOrganizationId,
          loginId: "employee",
          displayName: "Test Employee",
        },
      });
      const userTwo = await tx.user.create({
        data: {
          organizationId: secondOrganizationId,
          loginId: "employee",
          displayName: "Second Organization User",
        },
      });
      assert.notEqual(userOne.id, userTwo.id);
      assert.equal(userOne.status, "INVITED");
      assert.equal(userOne.mustChangePassword, true);

      const role = await tx.role.create({
        data: { organizationId: firstOrganizationId, key: "employee", label: "Employee", isSystem: true },
      });
      await tx.userRole.create({ data: { userId: userOne.id, roleId: role.id } });
      await tx.rolePermission.create({ data: { roleId: role.id, permissionKey: "leads.read" } });

      const team = await tx.team.create({
        data: { organizationId: firstOrganizationId, name: "Creative" },
      });
      await tx.teamMember.create({ data: { teamId: team.id, userId: userOne.id } });
      await tx.founderProfile.create({
        data: { organizationId: firstOrganizationId, displayName: "Founder", title: "Marketing", responsibilities: "Brand growth" },
      });
      await tx.session.create({
        data: { userId: userOne.id, refreshTokenHash: `test-only-hash-${slug}`, expiresAt: new Date(Date.now() + 3600000) },
      });
      await tx.auditLog.create({
        data: { organizationId: firstOrganizationId, actorId: userOne.id, action: "test.create", entityType: "User", entityId: userOne.id },
      });
      await tx.outboxEvent.create({
        data: { organizationId: firstOrganizationId, eventKey: `test-once-${slug}`, kind: "test.created", aggregateType: "User", aggregateId: userOne.id, payloadMinimal: { entityId: userOne.id } },
      });

      assert.equal(await tx.auditLog.count({ where: { organizationId: firstOrganizationId } }), 1);
      assert.equal(await tx.outboxEvent.count({ where: { organizationId: firstOrganizationId } }), 1);
      assert.equal(await tx.userRole.count({ where: { userId: userOne.id } }), 1);

      throw new Error(rollbackMarker);
    });
  } catch (error) {
    assert.equal((error as Error).message, rollbackMarker);
    rollbackHappened = true;
  }

  assert.equal(rollbackHappened, true);
  assert.equal(await prisma.organization.count({ where: { id: { in: [firstOrganizationId, secondOrganizationId] } } }), 0);
  assert.equal(await prisma.auditLog.count({ where: { organizationId: firstOrganizationId } }), 0);
  assert.equal(await prisma.outboxEvent.count({ where: { organizationId: firstOrganizationId } }), 0);

  // Verify composite organization/login uniqueness in an isolated transaction.
  try {
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: `test-duplicate-${slug}` } });
      await tx.user.create({ data: { organizationId: org.id, loginId: "same-login", displayName: "One" } });
      await tx.user.create({ data: { organizationId: org.id, loginId: "same-login", displayName: "Two" } });
    });
    assert.fail("Expected unique-constraint conflict");
  } catch (error) {
    assert.equal((error as { code?: string }).code, "P2002");
  }
  assert.equal(await prisma.organization.count({ where: { name: `test-duplicate-${slug}` } }), 0);

  console.info("Database smoke PASS: role/permission associations, sessions, audit/outbox transaction, rollback, tenant-scoped uniqueness.");
} finally {
  await prisma.$disconnect();
}
