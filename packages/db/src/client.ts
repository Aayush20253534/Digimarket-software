import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client.ts";

/** Create a typed Prisma 7 client. Caller owns disconnect lifecycle. */
export function createDatabaseClient(connectionString = process.env.DATABASE_URL): PrismaClient {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required when accessing the database");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}
