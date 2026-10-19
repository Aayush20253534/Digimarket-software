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
