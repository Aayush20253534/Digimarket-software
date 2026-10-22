import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const uuid=z.uuid();
const content=z.strictObject({
 kind:z.enum(["typed","handwritten"]).optional(),
 title:z.string().trim().min(1).max(180),
 body:z.string().max(60000),
 pages:z.string().max(120000).refine(value=>{
  try{const pages=JSON.parse(value);return Array.isArray(pages)&&pages.length<=25&&pages.every(p=>
    typeof p==="object"&&p!==null&&typeof p.id==="string"&&p.id.length<=64&&
    typeof p.strokes==="string"&&p.strokes.length<=60000&&["dotted","ruled","grid","blank"].includes(p.paper));
  }catch{return false;}
 },"Invalid note pages").optional(),
 strokes:z.string().max(60000).refine(value=>{
  try{const v=JSON.parse(value);return Array.isArray(v)&&v.length<=500&&v.every(s=>
    typeof s==="object"&&s!==null&&typeof s.color==="string"&&/^#[0-9a-fA-F]{6}$/.test(s.color)&&
    typeof s.width==="number"&&s.width>=1&&s.width<=30&&
    (s.tool===undefined||["pen","pencil","highlighter","marker","brush","fountain","shape","text","sticky"].includes(s.tool))&&
    (s.opacity===undefined||(typeof s.opacity==="number"&&s.opacity>=0&&s.opacity<=1))&&
     (s.style===undefined||["solid","dashed","dotted"].includes(s.style))&&
     (s.shape===undefined||["line","square","rectangle","roundedRectangle","ellipse","circle","triangle","diamond","pentagon","hexagon","star","arrow"].includes(s.shape))&&
     (s.text===undefined||(typeof s.text==="string"&&s.text.length<=200))&&
     Array.isArray(s.points)&&s.points.length<=2500&&
    s.points.every((p:unknown)=>Array.isArray(p)&&(p.length===2||p.length===3)&&p.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)));
  }catch{return false;}
 },"Invalid drawing"),
});
const update=content.extend({version:z.number().int().min(1)});
function checked<T>(schema:z.ZodType<T>,value:unknown):T{
 const result=schema.safeParse(value);
 if(!result.success){
   const fields=[...new Set(result.error.issues.map(issue=>issue.path.join(".")||"request"))].slice(0,5);
   throw new AuthError(422,"VALIDATION_ERROR","Invalid note fields: "+fields.join(", "));
 }
 return result.data;
}
export function registerNotesRoutes(app:Express,auth:AuthService){
 const db=auth.database;
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));
   next();
  }catch(error){next(error);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const scope=(p:Principal)=>({organizationId:p.organizationId,ownerId:p.userId});
 const path="/api/v1/notes";
 const notebookInput=z.strictObject({name:z.string().trim().min(1).max(100),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#8C45DB")});
 app.get(path+"/notebooks",authenticate,async(_req,res)=>{
  res.set("Cache-Control","no-store");
  res.json({data:{items:await db.personalNotebook.findMany({where:scope(actor(res)),orderBy:[{name:"asc"},{id:"asc"}],take:200})}});
 });
 app.post(path+"/notebooks",authenticate,async(req,res)=>{
  const input=checked(notebookInput,req.body);
  const book=await db.personalNotebook.create({data:{...scope(actor(res)),...input}});
  res.status(201).json({data:book});
 });
 app.put(path+"/notebooks/:id",authenticate,async(req,res)=>{
  const id=checked(uuid,req.params.id),input=checked(notebookInput,req.body),p=actor(res);
  const updated=await db.personalNotebook.updateMany({where:{id,...scope(p)},data:input});
  if(!updated.count)throw new AuthError(404,"NOT_FOUND","Notebook not found");
  res.json({data:{updated:true}});
 });
 app.delete(path+"/notebooks/:id",authenticate,async(req,res)=>{
  const id=checked(uuid,req.params.id),p=actor(res);
  await db.$transaction(async tx=>{
   const found=await tx.personalNotebook.findFirst({where:{id,...scope(p)}});
   if(!found)throw new AuthError(404,"NOT_FOUND","Notebook not found");
   await tx.personalNote.updateMany({where:{...scope(p),notebookId:id},data:{notebookId:null}});
   await tx.personalNotebook.delete({where:{id}});
  });res.status(204).end();
 });
 app.put(path+"/:id/metadata",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id);
  const input=checked(z.strictObject({starred:z.boolean().optional(),notebookId:uuid.nullable().optional()}),req.body);
  if(input.notebookId){
   const exists=await db.personalNotebook.findFirst({where:{id:input.notebookId,...scope(p)},select:{id:true}});
   if(!exists)throw new AuthError(404,"NOT_FOUND","Notebook not found");
  }
  const updated=await db.personalNote.updateMany({where:{id,...scope(p),deletedAt:null},data:input});
  if(!updated.count)throw new AuthError(404,"NOT_FOUND","Note not found");
  res.json({data:await db.personalNote.findFirstOrThrow({where:{id,...scope(p)}})});
 });
 app.post(path+"/:id/restore",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id);
  const updated=await db.personalNote.updateMany({where:{id,...scope(p)},data:{deletedAt:null}});
  if(!updated.count)throw new AuthError(404,"NOT_FOUND","Note not found");
  res.json({data:{restored:true}});
 });
 // A permanent deletion can only purge a note already in the owner's Trash.
 app.delete(path+"/:id/permanent",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id);
  const removed=await db.personalNote.deleteMany({where:{id,...scope(p),deletedAt:{not:null}}});
  if(!removed.count)throw new AuthError(404,"NOT_FOUND","Trashed note not found");
  res.status(204).end();
 });
 app.get(path,authenticate,async(req,res)=>{
  const p=actor(res);res.set("Cache-Control","no-store");
  const deleted=req.query.trash==="true";
  const items=await db.personalNote.findMany({where:{...scope(p),deletedAt:deleted?{not:null}:null},
   select:{id:true,title:true,kind:true,strokes:true,starred:true,notebookId:true,deletedAt:true,version:true,updatedAt:true,createdAt:true},
   orderBy:[{updatedAt:"desc"},{id:"desc"}],take:100});
  res.json({data:{items,limited:items.length===100}});
 });
 app.post(path,authenticate,async(req,res)=>{
  const p=actor(res);const input=checked(content,req.body);
  const kind=input.kind??(input.body.trim()?"typed":"handwritten");
  const note=await db.personalNote.create({data:{...scope(p),...input,kind}});
  res.status(201).set("Cache-Control","no-store").json({data:note});
 });
 app.get(path+"/:id",authenticate,async(req,res)=>{
  const p=actor(res);const id=checked(uuid,req.params.id);
  const note=await db.personalNote.findFirst({where:{id,...scope(p)}});
  if(!note)throw new AuthError(404,"NOT_FOUND","Note not found");
  res.set("Cache-Control","no-store").json({data:note});
 });
 app.put(path+"/:id",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id),input=checked(update,req.body);
  const existing=await db.personalNote.findFirst({where:{id,...scope(p),deletedAt:null},select:{kind:true}});
  if(existing && input.kind && input.kind!==existing.kind)throw new AuthError(422,"IMMUTABLE_NOTE_TYPE","Note type cannot be changed");
  const result=await db.personalNote.updateMany({where:{id,...scope(p),deletedAt:null,version:input.version},
   data:{title:input.title,body:input.body,strokes:input.strokes,...(input.pages!==undefined?{pages:input.pages}:{}),version:{increment:1}}});
  if(result.count===0){
   const owned=await db.personalNote.findFirst({where:{id,...scope(p)},select:{id:true}});
   throw new AuthError(owned?409:404,owned?"VERSION_CONFLICT":"NOT_FOUND",owned?"Note changed in another session. Copy your edits before reloading.":"Note not found");
  }
  const saved=await db.personalNote.findFirstOrThrow({where:{id,...scope(p)}});
  res.set("Cache-Control","no-store").json({data:saved});
 });
 app.delete(path+"/:id",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id),version=checked(z.coerce.number().int().min(1),req.query.version);
  const removed=await db.personalNote.updateMany({where:{id,...scope(p),version,deletedAt:null},data:{deletedAt:new Date()}});
  if(!removed.count)throw new AuthError(409,"VERSION_CONFLICT","Note missing or changed. Reload before deleting.");
  res.status(204).end();
 });
}
