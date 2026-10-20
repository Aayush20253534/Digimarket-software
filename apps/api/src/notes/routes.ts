import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthService, Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";

const uuid=z.uuid();
const content=z.strictObject({
 title:z.string().trim().min(1).max(180),
 body:z.string().max(60000),
 strokes:z.string().max(60000).refine(value=>{
  try{const v=JSON.parse(value);return Array.isArray(v)&&v.length<=500&&v.every(s=>
    typeof s==="object"&&s!==null&&typeof s.color==="string"&&/^#[0-9a-fA-F]{6}$/.test(s.color)&&
    typeof s.width==="number"&&s.width>=1&&s.width<=30&&
    (s.tool===undefined||["pen","pencil","highlighter","marker"].includes(s.tool))&&
    Array.isArray(s.points)&&s.points.length<=2500&&
    s.points.every((p:unknown)=>Array.isArray(p)&&(p.length===2||p.length===3)&&p.every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)));
  }catch{return false;}
 },"Invalid drawing"),
});
const update=content.extend({version:z.number().int().min(1)});
function checked<T>(schema:z.ZodType<T>,value:unknown):T{
 const result=schema.safeParse(value);
 if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid note fields");
 return result.data;
}
export function registerNotesRoutes(app:Express,auth:AuthService){
 const db=auth.database;
 const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
  try{const header=req.get("authorization");
   if(!header?.startsWith("Bearer "))throw unauthorized();
   res.locals.principal=await auth.authenticate(header.slice(7));next();
  }catch(error){next(error);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const scope=(p:Principal)=>({organizationId:p.organizationId,ownerId:p.userId});
 const path="/api/v1/notes";
 app.get(path,authenticate,async(_req,res)=>{
  const p=actor(res);res.set("Cache-Control","no-store");
  const items=await db.personalNote.findMany({where:scope(p),
   select:{id:true,title:true,version:true,updatedAt:true,createdAt:true},
   orderBy:[{updatedAt:"desc"},{id:"desc"}],take:100});
  res.json({data:{items,limited:items.length===100}});
 });
 app.post(path,authenticate,async(req,res)=>{
  const p=actor(res);const input=checked(content,req.body);
  const note=await db.personalNote.create({data:{...scope(p),...input}});
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
  const result=await db.personalNote.updateMany({where:{id,...scope(p),version:input.version},
   data:{title:input.title,body:input.body,strokes:input.strokes,version:{increment:1}}});
  if(result.count===0){
   const owned=await db.personalNote.findFirst({where:{id,...scope(p)},select:{id:true}});
   throw new AuthError(owned?409:404,owned?"VERSION_CONFLICT":"NOT_FOUND",owned?"Note changed in another session. Copy your edits before reloading.":"Note not found");
  }
  const saved=await db.personalNote.findFirstOrThrow({where:{id,...scope(p)}});
  res.set("Cache-Control","no-store").json({data:saved});
 });
 app.delete(path+"/:id",authenticate,async(req,res)=>{
  const p=actor(res),id=checked(uuid,req.params.id),version=checked(z.coerce.number().int().min(1),req.query.version);
  const removed=await db.personalNote.deleteMany({where:{id,...scope(p),version}});
  if(!removed.count)throw new AuthError(409,"VERSION_CONFLICT","Note missing or changed. Reload before deleting.");
  res.status(204).end();
 });
}
