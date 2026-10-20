import type {Express,Request,Response,NextFunction} from "express";
import {z} from "zod";
import {profitabilityPeriodSchema,costAllocationUpdateSchema,
  revenueRecognitionCreateSchema,revenueRecognitionReverseSchema} from "@digimarket/contracts";
import {AuthService,type Principal} from "../auth/service";
import {AuthError,unauthorized} from "../auth/errors";
import {ProfitabilityService} from "./service";
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 const d=schema.safeParse(value);
 if(!d.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid profitability request");
 return d.data;
}
const uid=z.uuid();
export function registerProfitabilityRoutes(app:Express,auth:AuthService){
 const svc=new ProfitabilityService(auth.database),base="/api/v1/profitability";
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));
   next();
  }catch(e){next(e);}
 };
 const a=(res:Response)=>res.locals.principal as Principal;
 const period=(req:Request)=>parse(profitabilityPeriodSchema,req.query);
 app.get(base+"/report",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.report(a(res),period(req))});
 });
 app.get(base+"/export",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");res.json({data:await svc.csv(a(res),period(req))});
 });
 app.get(base+"/expenses",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const p=period(req);res.json({data:await svc.expenses(a(res),p.from,p.to)});
 });
 app.put(base+"/expenses/:id/allocations",authenticated,async(req,res)=>{
  res.json({data:await svc.setExpenseAllocations(a(res),parse(uid,req.params.id),
    parse(costAllocationUpdateSchema,req.body))});
 });
 app.get(base+"/recognitions",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const clientId=req.query.clientId?parse(uid,req.query.clientId):undefined;
  res.json({data:await svc.recognitions(a(res),clientId)});
 });
 app.post(base+"/recognitions",authenticated,async(req,res)=>{
  res.status(201).json({data:await svc.recognize(a(res),parse(revenueRecognitionCreateSchema,req.body))});
 });
 app.post(base+"/recognitions/:id/reverse",authenticated,async(req,res)=>{
  res.status(201).json({data:await svc.reverse(a(res),parse(uid,req.params.id),
    parse(revenueRecognitionReverseSchema,req.body))});
 });
}
