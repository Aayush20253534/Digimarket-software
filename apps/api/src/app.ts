import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiHealthSchema } from "@digimarket/contracts";

export function createApp(allowedOrigins: string[] = ["http://localhost:3000"]) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json({ limit: "128kb" }));

  app.get("/api/v1/health", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.status(200).json(apiHealthSchema.parse({
      data: { service: "api", status: "ok", timestamp: new Date().toISOString() },
      meta: { version: "v1" },
    }));
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
      meta: { requestId: crypto.randomUUID() },
    });
  });

  return app;
}
