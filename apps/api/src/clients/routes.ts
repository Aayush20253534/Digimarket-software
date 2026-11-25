import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { clientUpdateSchema,clientListQuerySchema,clientEndAgreementSchema,
  clientContactSchema,clientRenewSchema,clientServiceSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { ClientsService } from "./service";
import { ClientVideoReadinessService } from "./video-readiness-service";
import { ClientPostReadinessService } from "./post-readiness-service";
const id=z.uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T {
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid client fields");
 return result.data;
}
export function registerClientRoutes(app:Express,auth:AuthService) {
 const svc=new ClientsService(auth.database);
 const videos=new ClientVideoReadinessService(auth.database);
 const posts=new ClientPostReadinessService(auth.database);
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
 // Stored week keys remain unchanged; cycle views return the original save keys.
 const month=z.string().regex(/^[0-9]{4}-(0[1-9]|1[0-2])$/);
 const weekNumber=z.coerce.number().int().min(1).max(36);
 const videoWeekInput=z.strictObject({month,readyAdded:z.number().int().min(0).max(10000),
  delivered:z.number().int().min(0).max(10000),
  note:z.string().trim().max(500).optional(),version:z.number().int().min(0),clientCycle:z.literal(true).optional()});
 const postWeekInput=videoWeekInput.safeExtend({
  festivalReadyAdded:z.number().int().min(0).max(10000).optional(),
  festivalDelivered:z.number().int().min(0).max(10000).optional(),
  festivalNote:z.string().trim().max(500).nullable().optional()
 });
 app.get(root+"/:id/video-readiness",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const basis=parse(z.enum(["calendar","cycle","client"]).default("calendar"),req.query.basis);
  const clientId=parse(id,req.params.id);
  if(basis==="client"){res.json({data:await videos.clientCycle(actor(res),clientId,parse(month.optional(),req.query.month))});return;}
  res.json({data:await videos[basis==="cycle"?"cycle":"monthly"](actor(res),clientId,parse(month,req.query.month))});
 });
 app.put(root+"/:id/video-readiness/:week",authenticated,async(req,res)=>{
  const body=parse(videoWeekInput,req.body);
  res.json({data:await videos.saveWeek(actor(res),parse(id,req.params.id),body.month,
   parse(weekNumber,req.params.week),body,body.clientCycle===true)});
 });
 // Post readiness uses the same week buckets as videos but independent stock.
 app.get(root+"/:id/post-readiness",authenticated,async(req,res)=>{
  res.set("Cache-Control","no-store");
  const basis=parse(z.enum(["calendar","cycle","client"]).default("calendar"),req.query.basis);
  const clientId=parse(id,req.params.id);
  if(basis==="client"){res.json({data:await posts.clientCycle(actor(res),clientId,parse(month.optional(),req.query.month))});return;}
  res.json({data:await posts[basis==="cycle"?"cycle":"monthly"](actor(res),clientId,parse(month,req.query.month))});
 });
 app.put(root+"/:id/post-readiness/:week",authenticated,async(req,res)=>{
  const body=parse(postWeekInput,req.body);
  res.json({data:await posts.saveWeek(actor(res),parse(id,req.params.id),body.month,
   parse(weekNumber,req.params.week),body,body.clientCycle===true)});
 });
 app.get(root+"/:id/overview",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.overview(actor(res),parse(id,req.params.id))});
 });
 app.post(root+"/:id/renew",authenticated,async(req,res)=>{
   res.json({data:await svc.renew(actor(res),parse(id,req.params.id),parse(clientRenewSchema,req.body))});
 });
 app.post(root+"/:id/services",authenticated,async(req,res)=>{
   res.json({data:await svc.saveService(actor(res),parse(id,req.params.id),parse(clientServiceSchema,req.body))});
 });
 app.get(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.detail(actor(res),parse(id,req.params.id))});
 });
 app.put(root+"/:id",authenticated,async(req,res)=>{
   res.json({data:await svc.update(actor(res),parse(id,req.params.id),parse(clientUpdateSchema,req.body))});
 });
 app.post(root+"/:id/end-agreement",authenticated,async(req,res)=>{
   res.json({data:await svc.endAgreement(actor(res),parse(id,req.params.id),parse(clientEndAgreementSchema,req.body))});
 });
 app.post(root+"/:id/contacts",authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.addContact(actor(res),parse(id,req.params.id),
     parse(clientContactSchema,req.body))});
 });
 app.post("/api/v1/leads/:id/convert",authenticated,async(_req,res)=>{
   res.status(405).json({error:{code:"AUTO_CONVERSION_ONLY",
     message:"Set lead status to Approved to create its client"}});
 });
}
