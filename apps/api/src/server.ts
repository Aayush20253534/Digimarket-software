import "dotenv/config";
import { createApp } from "./app";
import { createDatabaseClient } from "@digimarket/db";
import { AuthService } from "./auth/service";
import { loadAuthConfig } from "./auth/crypto";
import { validateProductionApiConfig } from "./runtime/production";

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

// Fail closed if database mode is enabled but JWT/MFA secrets are missing.
const database = process.env.DATABASE_URL ? createDatabaseClient() : null;
const authService = database ? new AuthService(database, loadAuthConfig()) : undefined;
const server = createApp(allowedOrigins, authService).listen(rawPort, "0.0.0.0", () => {
  console.info(`DigiMarket API listening on port ${rawPort}`);
});

function shutdown(signal: string) {
  console.info(`Received ${signal}; closing HTTP server`);
  server.close(async (error) => {
    if (database) await database.$disconnect();
    if (error) {
      console.error("Shutdown error", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
