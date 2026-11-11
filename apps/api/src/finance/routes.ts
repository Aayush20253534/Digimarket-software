import type { Express,Request,Response,NextFunction } from "express";
import { z } from "zod";
import {
  financeCategoryInputSchema,financeCategoryStatusSchema,financeCategoryEditSchema,financeEntryAdminEditSchema,financeEntryInputSchema,financeViewSchema,financeBreakdownQuerySchema,
} from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { FinanceService } from "./service";
import { InternalSettlementService } from "./internal-settlements";
import { AssetService } from "../assets/service";
import { assetIntentSchema,assetConfirmSchema } from "@digimarket/contracts";

function parse<T>(schema:z.ZodType<T>,value:unknown):T {
  const result=schema.safeParse(value);
  if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid financial request fields");
  return result.data;
}
export function registerFinanceRoutes(app:Express,auth:AuthService) {
  const finance=new FinanceService(auth.database);
  const internal=new InternalSettlementService(auth.database);
  const proofAssets=new AssetService(auth.database);
  const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
    try{
      const header=req.get("authorization");
      if(!header?.startsWith("Bearer "))throw unauthorized();
      res.locals.principal=await auth.authenticate(header.slice(7));
      next();
    }catch(error){next(error);}
  };
  const actor=(res:Response)=>res.locals.principal as Principal;
  const view=(req:Request)=>parse(financeViewSchema,req.query.view??"mine");
  const ledgerScope=(req:Request)=>parse(z.enum(["agency","client_ads","meta_ads"]).default("agency"),req.query.scope);
  const internalInput=z.strictObject({
    recipientId:z.uuid(),
    amount:z.string().regex(/^(0|[1-9][0-9]{0,12})(?:\.[0-9]{1,2})?$/),
    occurredOn:z.iso.date(),
    method:z.enum(["CASH","UPI","BANK_TRANSFER","CARD","OTHER"]),
    note:z.string().trim().max(500).optional(),
    idempotencyKey:z.uuid()
  });
  const internalVoidInput=z.strictObject({reason:z.string().trim().min(4).max(500)});

  app.post("/api/v1/finance/proof-intent",authenticate,async(req,res)=>{
    const body=parse(assetIntentSchema,req.body);
    res.status(201).json({data:await proofAssets.intent(actor(res),body,true)});
  });
  app.post("/api/v1/finance/proof-confirm",authenticate,async(req,res)=>{
    const body=parse(assetConfirmSchema,req.body);
    res.status(201).json({data:await proofAssets.confirm(actor(res),body.intentId,body.assetId,true)});
  });
  app.get("/api/v1/finance/entries/:id/proof",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store").json({data:await proofAssets.financeDownload(actor(res),
      parse(z.uuid(),req.params.id))});
  });
  app.get("/api/v1/finance/categories",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.categories(actor(res))});
  });
  app.post("/api/v1/finance/categories",authenticate,async(req,res)=>{
    res.status(201).json({data:await finance.addCategory(actor(res),parse(financeCategoryInputSchema,req.body))});
  });
  app.put("/api/v1/finance/categories/:id/status",authenticate,async(req,res)=>{
    const id=parse(z.uuid(),req.params.id),body=parse(financeCategoryStatusSchema,req.body);
    res.json({data:await finance.setCategoryActive(actor(res),id,body.active)});
  });
  app.put("/api/v1/finance/categories/:id",authenticate,async(req,res)=>{
    const id=parse(z.uuid(),req.params.id),body=parse(financeCategoryEditSchema,req.body);
    res.json({data:await finance.renameCategory(actor(res),id,body.name)});
  });
  app.delete("/api/v1/finance/categories/:id",authenticate,async(req,res)=>{
    const id=parse(z.uuid(),req.params.id);
    res.json({data:await finance.removeCategory(actor(res),id)});
  });
  app.get("/api/v1/finance/meta-ad-clients",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.metaAdClients(actor(res))});
  });
  app.get("/api/v1/finance/internal-settlements/founders",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store").json({data:await internal.founders(actor(res))});
  });
  app.post("/api/v1/finance/internal-settlements",authenticate,async(req,res)=>{
    const input=parse(internalInput,req.body);
    res.status(201).json({data:await internal.record(actor(res),input)});
  });
  app.post("/api/v1/finance/internal-settlements/:id/void",authenticate,async(req,res)=>{
    res.json({data:await internal.void(actor(res),parse(z.uuid(),req.params.id),
      parse(internalVoidInput,req.body).reason)});
  });
  app.get("/api/v1/finance/assignees",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.assignees(actor(res))});
  });
  app.put("/api/v1/finance/entries/:id",authenticate,async(req,res)=>{
    const id=parse(z.uuid(),req.params.id),body=parse(financeEntryAdminEditSchema,req.body);
    res.json({data:await finance.editEntry(actor(res),id,body)});
  });
  app.delete("/api/v1/finance/entries/:id",authenticate,async(req,res)=>{
    const id=parse(z.uuid(),req.params.id);
    res.json({data:await finance.removeEntry(actor(res),id)});
  });
  app.get("/api/v1/finance/entries",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.entries(actor(res),view(req),ledgerScope(req))});
  });
  app.post("/api/v1/finance/entries",authenticate,async(req,res)=>{
    res.status(201).json({data:await finance.submit(actor(res),parse(financeEntryInputSchema,req.body))});
  });
  app.get("/api/v1/finance/recurring-income",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.recurringIncome(actor(res))});
  });
  app.get("/api/v1/finance/meta-ads-distribution",authenticate,async(req,res)=>{
    const query=parse(z.object({
      view:financeViewSchema.default("mine"),
      from:z.iso.date().optional(),to:z.iso.date().optional(),
    }).refine(v=>!v.from||!v.to||v.from<=v.to),req.query);
    res.set("Cache-Control","no-store");
    res.json({data:await finance.metaAdsDistribution(actor(res),query.view,query.from,query.to)});
  });
  app.get("/api/v1/finance/summary",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.totals(actor(res),view(req))});
  });
  app.get("/api/v1/finance/report-breakdown",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.breakdown(actor(res),parse(financeBreakdownQuerySchema,req.query))});
  });
  app.get("/api/v1/finance/report-breakdown/export",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.exportBreakdown(actor(res),parse(financeBreakdownQuerySchema,req.query))});
  });
  app.get("/api/v1/finance/export",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.exportCsv(actor(res),view(req),ledgerScope(req))});
  });
}
