import type { Express,Request,Response,NextFunction } from "express";
import { z } from "zod";
import { contentCreateSchema,contentUpdateSchema,contentListQuerySchema,
 contentVersionSchema,contentPublishSchema } from "@digimarket/contracts";
import { AuthService,type Principal } from "../auth/service";
import { AuthError,unauthorized } from "../auth/errors";
import { ContentService } from "./service";
const uid=z.uuid();
function parse<T>(schema:z.ZodType<T>,value:unknown):T{
  const result=schema.safeParse(value);
  if(!result.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid content fields");
  return result.data;
}
export function registerContentRoutes(app:Express,auth:AuthService){
  const svc=new ContentService(auth.database);
  const authenticate=async(req:Request,res:Response,next:NextFunction)=>{
    try{
      const header=req.get("authorization");
      if(!header?.startsWith("Bearer "))throw unauthorized();
      res.locals.principal=await auth.authenticate(header.slice(7));next();
    }catch(e){next(e);}
  };
  const actor=(res:Response)=>res.locals.principal as Principal;
  const base="/api/v1/content";
  app.get(base,authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await svc.list(actor(res),parse(contentListQuerySchema,req.query))});
  });
  app.post(base,authenticate,async(req,res)=>res.status(201).json({
    data:await svc.create(actor(res),parse(contentCreateSchema,req.body))}));
  app.get(base+"/staff",authenticate,async(_req,res)=>{
    res.set("Cache-Control","no-store");res.json({data:await svc.staff(actor(res))});
  });
  app.get(base+"/:id",authenticate,async(req,res)=>{
    res.set("Cache-Control","no-store");
    res.json({data:await svc.detail(actor(res),parse(uid,req.params.id))});
  });
  app.put(base+"/:id",authenticate,async(req,res)=>res.json({data:await svc.update(
    actor(res),parse(uid,req.params.id),parse(contentUpdateSchema,req.body))}));
  app.post(base+"/:id/submit",authenticate,async(req,res)=>{
    const input=parse(contentVersionSchema,req.body);
    res.json({data:await svc.submit(actor(res),parse(uid,req.params.id),input.version)});
  });
  app.post(base+"/:id/schedule",authenticate,async(req,res)=>{
    const input=parse(contentVersionSchema,req.body);
    res.json({data:await svc.schedule(actor(res),parse(uid,req.params.id),input.version)});
  });
  app.post(base+"/:id/publish",authenticate,async(req,res)=>{
    const input=parse(contentPublishSchema,req.body);
    res.json({data:await svc.publish(actor(res),parse(uid,req.params.id),input.version,input.publishedUrl)});
  });
  app.post(base+"/:id/cancel",authenticate,async(req,res)=>{
    const input=parse(contentVersionSchema,req.body);
    res.json({data:await svc.cancel(actor(res),parse(uid,req.params.id),input.version)});
  });
}
