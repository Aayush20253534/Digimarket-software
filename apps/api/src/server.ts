import "dotenv/config";
import { createApp } from "./app";

const rawPort = Number(process.env.PORT ?? "4000");
if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
  throw new Error("PORT must be a valid TCP port number");
}

const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const server = createApp(allowedOrigins).listen(rawPort, "0.0.0.0", () => {
  console.info(`DigiMarket API listening on port ${rawPort}`);
});

function shutdown(signal: string) {
  console.info(`Received ${signal}; closing HTTP server`);
  server.close((error) => {
    if (error) {
      console.error("Shutdown error", error);
      process.exitCode = 1;
    }
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
