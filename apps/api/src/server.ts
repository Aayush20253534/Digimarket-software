import "dotenv/config";
import { createApp } from "./app";
import { createDatabaseClient } from "@digimarket/db";
import { AuthService } from "./auth/service";
import { loadAuthConfig } from "./auth/crypto";
import { validateProductionApiConfig } from "./runtime/production";
import { bootstrapIfConfigured } from "./auth/bootstrap";
import { describeStartupError } from "./runtime/startup-error";

validateProductionApiConfig(process.env);
if(process.env.NODE_ENV==="production"&&!process.env.DATABASE_URL)
 throw new Error("Live API cannot start without DATABASE_URL");
const rawPort = Number(process.env.PORT ?? "4000");
if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Fail closed if database mode is enabled but JWT secrets are missing.
const database = process.env.DATABASE_URL ? createDatabaseClient() : null;
const authService = database ? new AuthService(database, loadAuthConfig()) : undefined;
async function startServer() {
  // Render Free has no interactive shell or pre-deploy hook.
  // Optional temporary BOOTSTRAP_* secrets initialize only an empty database.
  if (database) {
    const result = await bootstrapIfConfigured(database);
    if (result === "created") {
      console.info("Initial administrator created; remove BOOTSTRAP_* secrets after first successful login.");
    } else if (result === "already_initialized") {
      console.info("Organization already initialized; bootstrap credentials were ignored. Remove BOOTSTRAP_* secrets.");
    }
  }
  // Finance entries must enter an approval queue. Existing organizations created
  // before FINANCE policies were introduced should receive a safe default, while
  // administrators' explicit disabled policies remain untouched.
  if(database){
    const organizations=await database.organization.findMany({select:{id:true}});
    if(organizations.length){
      await database.approvalPolicy.createMany({
        data:organizations.map(organization=>({
          organizationId:organization.id,category:"FINANCE" as const,
          name:"Finance approvals",active:true,
          approverRoleKeys:["SUPER_ADMIN","ADMIN","FOUNDER"],
        })),
        skipDuplicates:true,
      });
    }
  }
  const server = createApp(allowedOrigins, authService).listen(rawPort, "0.0.0.0", () => {
    console.info(`DigiMarket API listening on port ${rawPort}`);
  });

  let closing = false;
  function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    console.info(`Received ${signal}; closing HTTP server`);
    server.close(async (error) => {
      if (database) await database.$disconnect();
      if (error) {
        console.error("Shutdown error", error instanceof Error ? error.name : "UNKNOWN");
        process.exitCode = 1;
      }
    });
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void startServer().catch(async (error: unknown) => {
  // Provider error descriptions can carry DSNs, so print only the error class.
  console.error("API startup failed:", describeStartupError(error,"bootstrap"));
  process.exitCode = 1;
  if (database) await database.$disconnect();
});
