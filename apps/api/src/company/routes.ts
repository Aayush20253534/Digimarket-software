import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {founderCreateSchema,founderUpdateSchema,companySettingsSchema,billingSettingsSchema}
 from "@digimarket/contracts";
import {AuthService,type Principal} from "../auth/service";
import {AuthError,unauthorized} from "../auth/errors";
import {CompanyService} from "./service";
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid company settings");
 return result.data;
}
export function registerCompanyRoutes(app:Express,auth:AuthService){
 const svc=new CompanyService(auth.database);
 const authorize=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const bearer=req.get("authorization");
   if(!bearer?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(bearer.slice(7));next();
  }catch(e){next(e);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const base="/api/v1";
 app.get(base+"/founders",authorize,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.founders(actor(res))});
 });
 app.get(base+"/founders/eligible-staff",authorize,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.eligibleStaff(actor(res))});
 });
 app.post(base+"/founders",authorize,async(req,res)=>{
  res.status(201).json({data:await svc.createFounder(actor(res),parse(founderCreateSchema,req.body))});
 });
 app.put(base+"/founders/:id",authorize,async(req,res)=>{
  res.json({data:await svc.updateFounder(actor(res),parse(z.uuid(),req.params.id),
    parse(founderUpdateSchema,req.body))});
 });
 app.get(base+"/billing-defaults",authorize,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.billingDefaults(actor(res))});
 });
 app.get(base+"/company-settings",authorize,async(_req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.settings(actor(res))});
 });
 app.put(base+"/company-settings",authorize,async(req,res)=>{
  res.json({data:await svc.updateCompany(actor(res),parse(companySettingsSchema,req.body))});
 });
 app.put(base+"/company-settings/billing",authorize,async(req,res)=>{
  res.json({data:await svc.updateBilling(actor(res),parse(billingSettingsSchema,req.body))});
 });
}
