import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { leadCreateSchema, leadUpdateSchema, leadAssignSchema, leadNoteSchema, leadDuplicateReviewSchema,
  leadListQuerySchema, leadImportSchema, leadDeleteSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { LeadsService } from "./service";
function parse<T>(schema:z.ZodType<T>,value:unknown):T {
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid lead fields");
 return result.data;
}
const id=z.uuid();
export function registerLeadRoutes(app:Express,auth:AuthService){
 const svc=new LeadsService(auth.database);
 const stageNoteBody=z.strictObject({note:z.string().trim().max(2000)});
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
   try{
     const token=req.get("authorization");
     if(!token?.startsWith("Bearer "))throw unauthorized();
     res.locals.principal=await auth.authenticate(token.slice(7));
     next();
   }catch(e){next(e);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const root="/api/v1/leads";
 app.get(root,authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.list(actor(res),parse(leadListQuerySchema,req.query))});
 });
 app.post(root,authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.create(actor(res),parse(leadCreateSchema,req.body))});
 });
 const followUpsQuery=z.strictObject({
   cursor:z.uuid().optional(),limit:z.coerce.number().int().min(1).max(100).default(20),
 });
 app.get(root+"/follow-ups",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.scheduledFollowUps(actor(res),parse(followUpsQuery,req.query))});
 });
 app.get(root+"/follow-ups/today",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   const input=parse(z.strictObject({date:z.iso.date()}),req.query);
   res.json({data:await svc.followUpsOn(actor(res),input.date)});
 });
 app.get(root+"/metrics",authenticated,async(_req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.metrics(actor(res))});
 });
 app.get(root+"/assignees",authenticated,async(_req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.assignees(actor(res))});
 });
 app.get(root+"/duplicates",authenticated,async(_req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.duplicates(actor(res))});
 });
 app.post(root+"/duplicates/:id/review",authenticated,async(req,res)=>{
   res.json({data:await svc.resolveDuplicate(actor(res),parse(id,req.params.id),
     parse(leadDuplicateReviewSchema,req.body).resolution)});
 });
 app.post(root+"/import",authenticated,async(req,res)=>{
   const input=parse(leadImportSchema,req.body);
   res.status(201).json({data:await svc.import(actor(res),input.batchId,input.rows)});
 });
 app.get(root+"/export",authenticated,async(_req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.export(actor(res))});
 });
 app.delete(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   const {version}=parse(leadDeleteSchema,req.body);
   res.json({data:await svc.delete(actor(res),parse(id,req.params.id),version)});
 });
 app.get(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.detail(actor(res),parse(id,req.params.id))});
 });
 app.put(root+"/:id",authenticated,async(req,res)=>{
   res.json({data:await svc.update(actor(res),parse(id,req.params.id),parse(leadUpdateSchema,req.body))});
 });
 app.put(root+"/:id/assign",authenticated,async(req,res)=>{
   const input=parse(leadAssignSchema,req.body);
   res.json({data:await svc.assign(actor(res),parse(id,req.params.id),input.version,input.assignedToId)});
 });
 app.put(root+"/:id/stage-note",authenticated,async(req,res)=>{
   const {note}=parse(stageNoteBody,req.body);
   res.set("Cache-Control","no-store");
   res.json({data:await svc.saveStageNote(actor(res),parse(id,req.params.id),note)});
 });
 app.post(root+"/:id/notes",authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.note(actor(res),parse(id,req.params.id),parse(leadNoteSchema,req.body).note)});
 });
}
