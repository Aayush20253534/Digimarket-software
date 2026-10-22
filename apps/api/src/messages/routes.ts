import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const uuid=z.uuid();
export function registerWorkspaceMessages(app:Express, auth:AuthService){
 const db=auth.database;
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{
   const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));
   next();
  }catch(error){next(error);}
 };
 const principal=(res:Response)=>res.locals.principal as Principal;
 const route="/api/v1/messages";
 app.get(route+"/users",authenticate,async(_req,res)=>{
  const p=principal(res);
  const users=await db.user.findMany({where:{organizationId:p.organizationId,status:"ACTIVE",id:{not:p.userId}},
   select:{id:true,displayName:true,loginId:true,avatarData:true},orderBy:{displayName:"asc"},take:200});
  res.set("Cache-Control","no-store").json({data:{items:users}});
 });
 app.get(route,authenticate,async(req,res)=>{
  const p=principal(res);const peer=uuid.safeParse(req.query.with);
  if(!peer.success)throw new AuthError(422,"VALIDATION_ERROR","Select a valid recipient");
  const target=await db.user.findFirst({where:{id:peer.data,organizationId:p.organizationId,status:"ACTIVE"},select:{id:true}});
  if(!target)throw new AuthError(404,"NOT_FOUND","User not found");
  const items=await db.workspaceMessage.findMany({where:{organizationId:p.organizationId,OR:[
   {senderId:p.userId,recipientId:target.id},{senderId:target.id,recipientId:p.userId}]},
   orderBy:{createdAt:"desc"},take:100});
  res.set("Cache-Control","no-store").json({data:{items:items.reverse()}});
 });
 const input=z.strictObject({recipientId:uuid,text:z.string().trim().max(4000).default(""),
  noteId:uuid.optional(),
  attachment:z.strictObject({name:z.string().min(1).max(150),mime:z.string().max(100),
   data:z.string().max(1450000).regex(/^data:[^;]+;base64,[a-zA-Z0-9+/=]+$/)}).optional()});
 app.post(route,authenticate,async(req,res)=>{
  const parsed=input.safeParse(req.body);
  if(!parsed.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid message fields");
  const p=principal(res),v=parsed.data;
  if(v.recipientId===p.userId)throw new AuthError(422,"VALIDATION_ERROR","Cannot message yourself");
  const target=await db.user.findFirst({where:{id:v.recipientId,organizationId:p.organizationId,status:"ACTIVE"},select:{id:true}});
  if(!target)throw new AuthError(404,"NOT_FOUND","Recipient unavailable");
  let noteSnapshot:Record<string,string>|undefined;
  if(v.noteId){
   const note=await db.personalNote.findFirst({where:{id:v.noteId,organizationId:p.organizationId,ownerId:p.userId,deletedAt:null}});
   if(!note)throw new AuthError(404,"NOT_FOUND","Note not found");
   noteSnapshot={sourceId:note.id,title:note.title,kind:note.kind,body:note.body,strokes:note.strokes,pages:note.pages};
  }
  if(!v.text&&!noteSnapshot&&!v.attachment)throw new AuthError(422,"VALIDATION_ERROR","Empty message");
  const item=await db.workspaceMessage.create({data:{organizationId:p.organizationId,senderId:p.userId,
   recipientId:target.id,text:v.text,noteSnapshot,
   attachment:v.attachment??undefined}});
  res.status(201).set("Cache-Control","no-store").json({data:item});
 });
 app.get(route+"/:id/note",authenticate,async(req,res)=>{
  const p=principal(res),id=uuid.safeParse(req.params.id);
  if(!id.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid message ID");
  const message=await db.workspaceMessage.findFirst({where:{id:id.data,organizationId:p.organizationId,
   OR:[{recipientId:p.userId},{senderId:p.userId}]},select:{noteSnapshot:true}});
  if(!message?.noteSnapshot)throw new AuthError(404,"NOT_FOUND","Shared note not found");
  res.set("Cache-Control","no-store").json({data:message.noteSnapshot});
 });
 app.post(route+"/:id/save-note",authenticate,async(req,res)=>{
  const p=principal(res);const id=uuid.safeParse(req.params.id);
  if(!id.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid message ID");
  const message=await db.workspaceMessage.findFirst({where:{id:id.data,organizationId:p.organizationId,recipientId:p.userId}});
  if(!message||!message.noteSnapshot||typeof message.noteSnapshot!=="object"||Array.isArray(message.noteSnapshot))
   throw new AuthError(404,"NOT_FOUND","Shared note unavailable");
  const n=message.noteSnapshot as Record<string,unknown>;
  if(typeof n.title!=="string"||typeof n.body!=="string"||typeof n.strokes!=="string"||typeof n.pages!=="string"||
     (n.kind!=="typed"&&n.kind!=="handwritten"))throw new AuthError(422,"VALIDATION_ERROR","Invalid shared note");
  const note=await db.personalNote.create({data:{organizationId:p.organizationId,ownerId:p.userId,
   title:n.title.slice(0,180),body:n.body.slice(0,60000),strokes:n.strokes.slice(0,60000),
   pages:n.pages.slice(0,120000),kind:n.kind}});
  res.status(201).json({data:{id:note.id}});
 });
 const avatar=z.strictObject({avatarData:z.string().max(140000).regex(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/=]+$/)});
 app.put("/api/v1/profile/avatar",authenticate,async(req,res)=>{
  const p=principal(res);const v=avatar.safeParse(req.body);
  if(!v.success)throw new AuthError(422,"VALIDATION_ERROR","Provide PNG, JPEG or WebP under 100 KB");
  const user=await db.user.update({where:{id:p.userId},data:{avatarData:v.data.avatarData},select:{avatarData:true}});
  res.json({data:user});
 });
 app.get("/api/v1/profile/avatar",authenticate,async(_req,res)=>{
  const p=principal(res);
  const user=await db.user.findFirst({where:{id:p.userId,organizationId:p.organizationId},select:{avatarData:true}});
  res.set("Cache-Control","no-store").json({data:user});
 });
 app.delete("/api/v1/profile/avatar",authenticate,async(_req,res)=>{
  const p=principal(res);
  await db.user.update({where:{id:p.userId},data:{avatarData:null}});
  res.status(204).end();
 });
}
