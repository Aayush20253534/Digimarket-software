/**
 * Safe production startup diagnostics. Only known Prisma error codes are emitted.
 * Never include error.message, metadata, connection strings, SQL or user data.
 */
const hints: Record<string, string> = {
  P1000: "Database credentials were rejected; check Neon username/password and database URL.",
  P1001: "Database endpoint unreachable; verify Neon project, host and network access.",
  P1002: "Database connection timed out; verify Neon availability.",
  P1011: "Database TLS connection failed; use a trusted certificate and sslmode=verify-full.",
  P1017: "Database server closed the connection; verify Neon availability and pooling.",
  P2002: "A unique database constraint failed during setup; inspect organization bootstrap state.",
  P2010: "A raw database query failed; check migration status and database permissions.",
  P2021: "Required database table does not exist; run Prisma migrations before starting the API.",
  P2022: "A required database column is missing; run Prisma migrations against the correct Neon database.",
  P2024: "Database connection pool timed out; check Neon pool limits and concurrent connections.",
  P2028: "Database transaction failed; check Neon migration/schema and transaction pool.",
  P2037: "Database connection limit reached; check Neon usage and pool settings.",
};
const knownNames = new Set([
  "PrismaClientKnownRequestError",
  "PrismaClientInitializationError",
  "PrismaClientUnknownRequestError",
  "PrismaClientRustPanicError",
  "Error",
]);
export function describeStartupError(error: unknown, phase: "bootstrap" | "server"): {
  phase: string;
  name: string;
  code: string;
  hint: string;
} {
  const record = error && typeof error === "object" ? error as {name?: unknown; code?: unknown} : {};
  const name = typeof record.name === "string" && knownNames.has(record.name) ? record.name : "UNKNOWN";
  const code = typeof record.code === "string" && /^P\d{4}$/.test(record.code)
    ? record.code : "UNKNOWN";
  return {
    phase, name, code,
    hint: hints[code] ?? "Review migration logs and verify both Neon database URLs target the same database. Do not expose credentials.",
  };
}
