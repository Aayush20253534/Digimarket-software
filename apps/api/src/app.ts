import crypto from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiHealthSchema } from "@digimarket/contracts";
import { registerTaskRoutes } from "./tasks/routes";
import { registerProjectRoutes } from "./projects/routes";
import { registerAssetRoutes } from "./assets/routes";
import { registerClientRoutes } from "./clients/routes";
import { registerLeadRoutes } from "./leads/routes";
import { registerFinanceRoutes } from "./finance/routes";
import { registerApprovalRoutes } from "./approvals/routes";
import { registerAuthRoutes } from "./auth/routes";
import type { AuthService } from "./auth/service";

export function createApp(allowedOrigins: string[] = ["http://localhost:3000"], authService?: AuthService) {
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

  if (authService) {
    registerTaskRoutes(app, authService);
    registerProjectRoutes(app, authService);
    registerLeadRoutes(app, authService);
    registerClientRoutes(app, authService);
    registerAssetRoutes(app, authService);
    registerFinanceRoutes(app, authService);
    registerApprovalRoutes(app, authService);
    registerAuthRoutes(app, authService, allowedOrigins);
  }

  app.use((_request, response) => {
    response.status(404).json({
      error: { code: "NOT_FOUND", message: "Route not found" },
      meta: { requestId: crypto.randomUUID() },
    });
  });

  return app;
}
