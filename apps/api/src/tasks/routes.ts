import type { Express,Request,Response,NextFunction } from "express";
import { z } from "zod";
import { taskCreateSchema,taskUpdateSchema,taskEditSchema,taskDeleteSchema,taskListSchema,
 taskAssigneesSchema,taskChecklistCreateSchema,taskChecklistUpdateSchema,taskCommentSchema,
 taskRecurrenceCreateSchema,taskRecurrenceUpdateSchema } from "@digimarket/contracts";
import { AuthService,type Principal } from "../auth/service";
import { AuthError,unauthorized } from "../auth/errors";
import { TasksService } from "./service";
const uid=z.uuid();
function parse<T>(schema:z.ZodType<T>,v:unknown):T{
 const result=schema.safeParse(v);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid task fields");
 return result.data;
}
export function registerTaskRoutes(app:Express,auth:AuthService){
 const svc=new TasksService(auth.database);
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
   try{
     const token=req.get("authorization");
     if(!token?.startsWith("Bearer "))throw unauthorized();
     res.locals.principal=await auth.authenticate(token.slice(7));next();
   }catch(error){next(error);}
 };
 const a=(res:Response)=>res.locals.principal as Principal;
 const root="/api/v1/tasks",recur="/api/v1/task-recurrences";
 app.get(root,authenticated,async(req,res)=>{res.set("Cache-Control","no-store");
   res.json({data:await svc.list(a(res),parse(taskListSchema,req.query))});});
 app.get(root+"/team",authenticated,async(_req,res)=>{res.set("Cache-Control","no-store");
   res.json({data:await svc.team(a(res))});});
 app.post(root,authenticated,async(req,res)=>{res.status(201).json({data:await svc.create(a(res),
   parse(taskCreateSchema,req.body))});});
 app.get(root+"/:id",authenticated,async(req,res)=>{res.set("Cache-Control","no-store");
   res.json({data:await svc.detail(a(res),parse(uid,req.params.id))});});
 app.put(root+"/:id",authenticated,async(req,res)=>{res.json({data:await svc.update(a(res),
   parse(uid,req.params.id),parse(taskUpdateSchema,req.body))});});
 app.put(root+"/:id/edit",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await svc.edit(a(res),parse(uid,req.params.id),parse(taskEditSchema,req.body))});
 });
 app.delete(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   const {version}=parse(taskDeleteSchema,req.body);
   res.json({data:await svc.delete(a(res),parse(uid,req.params.id),version)});
 });
 app.put(root+"/:id/assignees",authenticated,async(req,res)=>{
   const input=parse(taskAssigneesSchema,req.body);
   res.json({data:await svc.assign(a(res),parse(uid,req.params.id),input.version,input.assigneeIds)});
 });
 app.post(root+"/:id/checklist",authenticated,async(req,res)=>{
   const input=parse(taskChecklistCreateSchema,req.body);
   res.status(201).json({data:await svc.addChecklist(a(res),parse(uid,req.params.id),input.label)});
 });
 app.put(root+"/:id/checklist/:itemId",authenticated,async(req,res)=>{
   const input=parse(taskChecklistUpdateSchema,req.body);
   res.json({data:await svc.checklistStatus(a(res),parse(uid,req.params.id),parse(uid,req.params.itemId),input.completed)});
 });
 app.post(root+"/:id/comments",authenticated,async(req,res)=>{
   const input=parse(taskCommentSchema,req.body);
   res.status(201).json({data:await svc.comment(a(res),parse(uid,req.params.id),input.body)});
 });
 app.get(recur,authenticated,async(_req,res)=>{res.set("Cache-Control","no-store");
   res.json({data:await svc.listRecurrences(a(res))});});
 app.post(recur,authenticated,async(req,res)=>{
   res.status(201).json({data:await svc.createRecurrence(a(res),parse(taskRecurrenceCreateSchema,req.body))});
 });
 app.put(recur+"/:id",authenticated,async(req,res)=>{
   const input=parse(taskRecurrenceUpdateSchema,req.body);
   res.json({data:await svc.toggleRecurrence(a(res),parse(uid,req.params.id),input.version,input.enabled)});
 });
}
