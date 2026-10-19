import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { projectCreateSchema,projectUpdateSchema,projectListSchema,projectMemberSchema,
  projectMilestoneSchema,projectMilestoneUpdateSchema,projectDeliverableSchema,
  projectDeliverableUpdateSchema,projectDeliverableSubmitSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { ProjectsService } from "./service";
const id=z.uuid();
function parse<T>(s:z.ZodType<T>,v:unknown):T{
  const result=s.safeParse(v);
  if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid project fields");
  return result.data;
}
export function registerProjectRoutes(app:Express,auth:AuthService){
  const svc=new ProjectsService(auth.database);
  const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
    try{
      const token=req.get("authorization");
      if(!token?.startsWith("Bearer "))throw unauthorized();
      res.locals.principal=await auth.authenticate(token.slice(7));next();
    }catch(error){next(error);}
  };
  const actor=(res:Response)=>res.locals.principal as Principal;
  const root="/api/v1/projects";
  app.get(root,authenticated,async(req,res)=>{res.set("Cache-Control","no-store");
    res.json({data:await svc.list(actor(res),parse(projectListSchema,req.query))});});
  app.post(root,authenticated,async(req,res)=>{res.status(201).json({data:await svc.create(actor(res),parse(projectCreateSchema,req.body))});});
  app.get(root+"/assignees",authenticated,async(_req,res)=>{res.set("Cache-Control","no-store");
    res.json({data:await svc.assignees(actor(res))});});
  app.get(root+"/:id",authenticated,async(req,res)=>{res.set("Cache-Control","no-store");
    res.json({data:await svc.detail(actor(res),parse(id,req.params.id))});});
  app.put(root+"/:id",authenticated,async(req,res)=>{res.json({data:await svc.update(actor(res),
    parse(id,req.params.id),parse(projectUpdateSchema,req.body))});});
  app.post(root+"/:id/members",authenticated,async(req,res)=>{res.json({data:await svc.setMember(actor(res),
    parse(id,req.params.id),parse(projectMemberSchema,req.body))});});
  app.post(root+"/:id/members/:userId/remove",authenticated,async(req,res)=>{res.json({data:await svc.removeMember(actor(res),
    parse(id,req.params.id),parse(id,req.params.userId))});});
  app.post(root+"/:id/milestones",authenticated,async(req,res)=>{res.status(201).json({data:await svc.milestone(actor(res),
    parse(id,req.params.id),parse(projectMilestoneSchema,req.body))});});
  app.put(root+"/:id/milestones/:milestoneId",authenticated,async(req,res)=>{
    const input=parse(projectMilestoneUpdateSchema,req.body);
    res.json({data:await svc.milestoneStatus(actor(res),parse(id,req.params.id),
      parse(id,req.params.milestoneId),input.version,input.status)});});
  app.post(root+"/:id/deliverables",authenticated,async(req,res)=>{res.status(201).json({data:await svc.deliverable(actor(res),
    parse(id,req.params.id),parse(projectDeliverableSchema,req.body))});});
  app.put(root+"/:id/deliverables/:deliverableId",authenticated,async(req,res)=>{res.json({data:await svc.revise(actor(res),
    parse(id,req.params.id),parse(id,req.params.deliverableId),parse(projectDeliverableUpdateSchema,req.body))});});
  app.post(root+"/:id/deliverables/:deliverableId/submit",authenticated,async(req,res)=>{res.json({data:await svc.submit(actor(res),
    parse(id,req.params.id),parse(id,req.params.deliverableId),
    parse(projectDeliverableSubmitSchema,req.body).version)});});
}
