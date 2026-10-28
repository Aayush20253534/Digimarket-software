import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clientUpdateSchema,clientListQuerySchema,
  clientContactSchema,clientServiceSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { ClientsService } from "./service";
const id=z.uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T {
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid client fields");
 return result.data;
}
export function registerClientRoutes(app:Express,auth:AuthService) {
 const svc=new ClientsService(auth.database);
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
   try{
     const token=req.get("authorization");
     if(!token?.startsWith("Bearer "))throw unauthorized();
     res.locals.principal=await auth.authenticate(token.slice(7));
     next();
   }catch(e){next(e);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const root="/api/v1/clients";
 app.get(root,authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.list(actor(res),parse(clientListQuerySchema,req.query))});
 });
 app.post(root,authenticated,async(_req,res)=>{
   res.status(405).json({error:{code:"LEAD_APPROVAL_REQUIRED",
     message:"Approve a lead in Leads CRM to create a client"}});
 });
 app.get(root+"/deliveries",authenticated,async(_req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.deliverySummary(actor(res))});
 });
 app.get(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.detail(actor(res),parse(id,req.params.id))});
 });
 app.put(root+"/:id",authenticated,async(req,res)=>{
   res.json({data:await svc.update(actor(res),parse(id,req.params.id),parse(clientUpdateSchema,req.body))});
 });
 app.post(root+"/:id/contacts",authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.addContact(actor(res),parse(id,req.params.id),
     parse(clientContactSchema,req.body))});
 });
 app.post(root+"/:id/services",authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.addService(actor(res),parse(id,req.params.id),
     parse(clientServiceSchema,req.body))});
 });
 app.post("/api/v1/leads/:id/convert",authenticated,async(_req,res)=>{
   res.status(405).json({error:{code:"AUTO_CONVERSION_ONLY",
     message:"Set lead status to Approved to create its client"}});
 });
}
