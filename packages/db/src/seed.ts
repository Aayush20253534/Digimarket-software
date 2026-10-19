import "dotenv/config";
import { createDatabaseClient } from "./client.ts";
import { permissionCatalog } from "./permissions.ts";

export async function seedPermissionCatalog() {
  const prisma = createDatabaseClient();
  try {
    // Upsert preserves existing user/role grants and is safe to run on deploy.
    for (const [key, description] of permissionCatalog) {
      await prisma.permission.upsert({
        where: { key },
        create: { key, description },
        update: { description },
      });
    }
    // Module 5/6/7/8 upgrade: attach new approval and finance grants to existing system roles,
    // without touching custom roles or removing any previously assigned permissions.
    const grants: Record<string, string[]> = {
      SUPER_ADMIN: ["approvals.read","approvals.submit","approvals.decide","approvals.policy.manage", "finance.read.all", "finance.category.manage", "finance.approve","leads.bulk","leads.duplicates.review","leads.convert","clients.read","clients.create","clients.edit","assets.upload","assets.read","assets.delete","projects.create","projects.assign","projects.read","projects.update","projects.deliverables.write","projects.review","projects.create","projects.assign","projects.read","projects.update","projects.deliverables.write","projects.review"],
      ADMIN: ["approvals.read","approvals.submit","approvals.decide","approvals.policy.manage","finance.read.all","finance.category.manage","finance.approve","leads.bulk","leads.duplicates.review","clients.read","clients.create","clients.edit","leads.convert","assets.upload","assets.read","assets.delete","projects.create","projects.assign","projects.read","projects.update","projects.deliverables.write","projects.review"],
      FOUNDER: ["approvals.read","approvals.submit","approvals.decide","finance.read.all","finance.approve","leads.bulk","leads.duplicates.review","clients.read","clients.create","clients.edit","leads.convert","assets.upload","assets.read","projects.create","projects.assign","projects.read","projects.update","projects.deliverables.write","projects.review"],
      EMPLOYEE: ["approvals.read","approvals.submit","leads.edit.own","clients.read","projects.read","projects.deliverables.write"],
    };
    const roles = await prisma.role.findMany({ where: { isSystem: true, key: { in: Object.keys(grants) } } });
    for (const role of roles) {
      await prisma.rolePermission.createMany({
        data: grants[role.key].map(permissionKey => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
    }
    return permissionCatalog.length;
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("/seed.ts")) {
  seedPermissionCatalog()
    .then((count) => console.info(`Seeded ${count} permission definitions; no users or credentials created.`))
    .catch((error: unknown) => {
      console.error("Permission catalog seed failed", error);
      process.exitCode = 1;
    });
}
