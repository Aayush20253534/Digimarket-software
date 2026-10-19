import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Use direct Neon connections for migrations and pooled connections at runtime.
    // Placeholder is only used by static validation/generation when no provider is configured.
    url: process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:5432/digimarket_unconfigured",
  },
});
