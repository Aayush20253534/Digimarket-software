import "dotenv/config";
import { createDatabaseClient, type PrismaClient } from "@digimarket/db";
import { permissionCatalog } from "@digimarket/db/permissions";
import { hashPassword } from "./crypto";
import { SYSTEM_ROLES, systemRoleGrants } from "./policies";

export async function bootstrapFirstAdmin(env: NodeJS.ProcessEnv = process.env, existingDatabase?: PrismaClient) {
  const orgName = env.BOOTSTRAP_ORG_NAME?.trim();
  const loginId = env.BOOTSTRAP_ADMIN_LOGIN?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
  if (!orgName || !loginId || !/^[a-z0-9_.-]{3,80}$/.test(loginId) || password.length < 12 || password.length > 128) {
    throw new Error("Bootstrap requires organization name, valid login ID and password of 12–128 characters in cloud secrets");
  }
  const db = existingDatabase ?? createDatabaseClient();
  try {
    const passwordHash = await hashPassword(password);
    return await db.$transaction(async (tx) => {
      // Serializes concurrent bootstrap attempts within one database.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(336197, 3)::text AS locked`;
      if (await tx.organization.count() !== 0) throw new Error("Bootstrap refused: organization already exists");
      for (const [key, description] of permissionCatalog) {
        await tx.permission.upsert({ where: { key }, create: { key, description }, update: { description } });
      }
      const organization = await tx.organization.create({ data: { name: orgName } });
      const user = await tx.user.create({ data: {
        organizationId: organization.id, loginId, displayName: "Platform Administrator",
        passwordHash, status: "INVITED", mustChangePassword: true,
      } });
      for (const key of SYSTEM_ROLES) {
        const role = await tx.role.create({ data: {
          organizationId: organization.id, key, label: key.replaceAll("_", " "), isSystem: true,
        } });
        await tx.rolePermission.createMany({ data: systemRoleGrants[key].map((permissionKey) => ({ roleId: role.id, permissionKey })) });
        if (key === "SUPER_ADMIN") await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
      }
      await tx.auditLog.create({ data: {
        organizationId: organization.id, actorId: user.id,
        action: "organization.bootstrapped", entityType: "Organization", entityId: organization.id,
      } });
      return { organizationId: organization.id, adminLoginId: loginId };
    });
  } finally {
    if (!existingDatabase) await db.$disconnect();
  }
}

/**
 * One-time bootstrap for hosts without shell access (including Render Free).
 * No HTTP setup route, no default password, and existing tenants are never modified.
 * Remove the three temporary BOOTSTRAP_* variables after first successful login.
 */
export async function bootstrapIfConfigured(db: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  const names = ["BOOTSTRAP_ORG_NAME", "BOOTSTRAP_ADMIN_LOGIN", "BOOTSTRAP_ADMIN_PASSWORD"] as const;
  const present = names.filter((name) => Boolean(env[name]?.trim()));
  if (present.length === 0) return "not_configured" as const;
  if (present.length !== names.length) {
    throw new Error("Provide all three temporary BOOTSTRAP_* values or remove all of them");
  }
  // Avoid rerunning a one-time bootstrap on free-host restarts or redeploys.
  if (await db.organization.count() > 0) return "already_initialized" as const;
  await bootstrapFirstAdmin(env, db);
  return "created" as const;
}

if (process.argv[1]?.endsWith("bootstrap.ts")) {
  bootstrapFirstAdmin()
    .then(({ organizationId, adminLoginId }) => {
      console.info(`Organization ${organizationId} bootstrapped for login ${adminLoginId}. Password not printed; mandatory password change and MFA enrollment on first use.`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Bootstrap failed");
      process.exitCode = 1;
    });
}
