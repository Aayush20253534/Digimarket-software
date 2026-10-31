import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clientUpdateSchema,clientListQuerySchema,
  clientContactSchema,clientServiceSchema,serviceDeliveryPlanSchema,
  serviceDeliveryPlanUpdateSchema,serviceDeliveryOccurrenceUpdateSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { ClientsService } from "./service";
import { ServiceDeliveryService } from "./delivery-service";
const id=z.uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T {
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid client fields");
 return result.data;
}
export function registerClientRoutes(app:Express,auth:AuthService) {
 const svc=new ClientsService(auth.database);
 const deliveries=new ServiceDeliveryService(auth.database);
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
 app.put(root+"/:id/services/:serviceId",authenticated,async(req,res)=>{
   res.json({data:await svc.updateService(actor(res),parse(id,req.params.id),
     parse(id,req.params.serviceId),parse(clientServiceSchema,req.body))});
 });

 app.get("/api/v1/service-deliveries",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   const query=z.strictObject({clientId:z.uuid().optional(),mine:z.enum(["true","false"]).optional()});
   res.json({data:await deliveries.list(actor(res),parse(query,req.query))});
 });
 app.post("/api/v1/service-deliveries",authenticated,async(req,res)=>{
   res.status(201).json({data:await deliveries.create(actor(res),parse(serviceDeliveryPlanSchema,req.body))});
 });
 app.put("/api/v1/service-deliveries/:id",authenticated,async(req,res)=>{
   res.json({data:await deliveries.update(actor(res),parse(id,req.params.id),
     parse(serviceDeliveryPlanUpdateSchema,req.body))});
 });
 app.delete("/api/v1/service-deliveries/:id",authenticated,async(req,res)=>{
   res.json({data:await deliveries.delete(actor(res),parse(id,req.params.id))});
 });
 app.put("/api/v1/service-deliveries/:id/occurrences/:occurrenceId",authenticated,async(req,res)=>{
   res.json({data:await deliveries.complete(actor(res),parse(id,req.params.id),
     parse(id,req.params.occurrenceId),parse(serviceDeliveryOccurrenceUpdateSchema,req.body))});
 });
 app.post("/api/v1/leads/:id/convert",authenticated,async(_req,res)=>{
   res.status(405).json({error:{code:"AUTO_CONVERSION_ONLY",
     message:"Set lead status to Approved to create its client"}});
 });
}
