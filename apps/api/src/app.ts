import crypto from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiHealthSchema } from "@digimarket/contracts";
import { registerNotesRoutes } from "./notes/routes";
import { registerInsightsRoutes } from "./insights/routes";
import { registerCompanyRoutes } from "./company/routes";
import { registerProfitabilityRoutes } from "./profitability/routes";
import { registerBillingRoutes } from "./billing/routes";
import { registerContentRoutes } from "./content/routes";
import { registerTaskRoutes } from "./tasks/routes";
import { registerProjectRoutes } from "./projects/routes";
import { registerAssetRoutes } from "./assets/routes";
import { registerClientRoutes } from "./clients/routes";
import { registerLeadRoutes } from "./leads/routes";
import { registerWhatsAppWebhook } from "./whatsapp/webhook";
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
  // Register webhook before JSON parsing: signature verification requires raw bytes.
  if(authService)registerWhatsAppWebhook(app,authService);
  app.use(express.json({ limit: "128kb" }));
  app.use((req,res,next)=>{
    const id=crypto.randomUUID();
    res.set("X-Request-ID",id);
    const start=process.hrtime.bigint();
    res.on("finish",()=>{
      if(res.statusCode>=500){
        const elapsed=Number(process.hrtime.bigint()-start)/1e6;
        // Never log Authorization, cookies, request/query bodies or billing data.
        console.error(JSON.stringify({level:"error",kind:"http",requestId:id,
          method:req.method,status:res.statusCode,elapsedMs:Math.round(elapsed)}));
      }
    });next();
  });

  // Public discovery for the Render service URL. Never expose user or provider data.
  app.get(["/", "/endpoint", "/api/v1"], (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({
      data: {
        name: "DigiMarket API",
        status: "online",
        version: "v1",
        routes: {
          health: "GET /api/v1/health",
          readiness: "GET /api/v1/ready",
          login: "POST /api/v1/auth/login",
        },
        note: "Interactive sign-in is on the Vercel frontend at /login. Accounts must be provisioned by an administrator.",
      },
    });
  });

  app.get("/api/v1/health", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.status(200).json(apiHealthSchema.parse({
      data: { service: "api", status: "ok", timestamp: new Date().toISOString() },
      meta: { version: "v1" },
    }));
  });

  app.get("/api/v1/ready",async(_req,res)=>{
    res.set("Cache-Control","no-store");
    if(!authService)return res.status(503).json({data:{status:"unavailable"}});
    try{
      await authService.database.$queryRaw`SELECT 1`;
      return res.json({data:{status:"ready",database:"ok"}});
    }catch{
      return res.status(503).json({data:{status:"unavailable"}});
    }
  });
  app.get("/api/v1/ops/health",async(req,res)=>{
    res.set("Cache-Control","no-store");
    const expected=process.env.OPS_MONITOR_TOKEN;
    const candidate=req.get("x-ops-token")??"";
    if(!authService||!expected||expected.length<32||
      Buffer.byteLength(candidate)!==Buffer.byteLength(expected)||
      !timingSafeEqual(Buffer.from(candidate),Buffer.from(expected)))
      return res.status(404).json({error:{code:"NOT_FOUND",message:"Route not found"}});
    try{
      const [beat,pending,failed]=await Promise.all([
        authService.database.serviceHeartbeat.findUnique({where:{service:"worker"}}),
        authService.database.outboxEvent.count({where:{status:"PENDING"}}),
        authService.database.outboxEvent.count({where:{attempts:{gte:5},status:"PENDING"}}),
      ]);
      const age=beat?Math.max(0,Date.now()-beat.lastSeenAt.getTime()):null;
      const workerHealthy=age!==null&&age<180_000;
      res.status(workerHealthy?200:503).json({data:{status:workerHealthy?"ok":"degraded",
        database:"ok",workerAlive:workerHealthy,workerAgeSeconds:age===null?null:Math.round(age/1000),
        pendingOutbox:pending,stalledOutbox:failed}});
    }catch{
      res.status(503).json({data:{status:"unavailable"}});
    }
  });

  if (authService) {
    // Governance accounts do not gain operational access through direct API URLs,
    // even when older role-permission rows still contain legacy grants.
    const operationalPrefixes = [
      "/notes", "/leads", "/assets", "/asset-folders", "/content",
      "/search",
    ];
    app.use("/api/v1", async (request,response,next)=>{
      const protectedOperation=operationalPrefixes.some(prefix=>request.path===prefix||request.path.startsWith(prefix+"/"));
      if(!protectedOperation)return next();
      const bearer=request.get("authorization");
      if(!bearer?.startsWith("Bearer "))return next();
      try{
        const principal=await authService.authenticate(bearer.slice(7));
        if(principal.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")){
          return response.status(403).json({error:{code:"ADMIN_OPERATION_RESTRICTED",message:"Operational modules are not available to administrator accounts"}});
        }
        next();
      }catch(error){next(error);}
    });
    registerNotesRoutes(app, authService);
    registerInsightsRoutes(app, authService);
    registerCompanyRoutes(app, authService);
    registerProfitabilityRoutes(app, authService);
    registerBillingRoutes(app, authService);
    registerContentRoutes(app, authService);
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
