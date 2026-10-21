import type { Express,Request,Response,NextFunction } from "express";
import { z } from "zod";
import {
  financeCategoryInputSchema,financeCategoryStatusSchema,financeCategoryEditSchema,financeEntryAdminEditSchema,financeEntryInputSchema,financeViewSchema,
} from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { FinanceService } from "./service";
import { AssetService } from "../assets/service";
import { assetIntentSchema,assetConfirmSchema } from "@digimarket/contracts";

function parse<T>(schema:z.ZodType<T>,value:unknown):T {
  const result=schema.safeParse(value);
  if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid financial request fields");
  return result.data;
}
export function registerFinanceRoutes(app:Express,auth:AuthService) {
  const finance=new FinanceService(auth.database);
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
    res.json({data:await finance.removeExpense(actor(res),id)});
  });
  app.get("/api/v1/finance/entries",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.entries(actor(res),view(req))});
  });
  app.post("/api/v1/finance/entries",authenticate,async(req,res)=>{
    res.status(201).json({data:await finance.submit(actor(res),parse(financeEntryInputSchema,req.body))});
  });
  app.get("/api/v1/finance/summary",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.totals(actor(res),view(req))});
  });
  app.get("/api/v1/finance/export",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await finance.exportCsv(actor(res),view(req))});
  });
}
