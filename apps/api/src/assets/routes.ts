import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { assetIntentSchema,assetConfirmSchema,assetListSchema,assetLinkSchema,assetArchiveSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { AssetService } from "./service";
const uuid=z.uuid();
function parse<T>(schema:z.ZodType<T>,data:unknown):T {
 const value=schema.safeParse(data);
 if(!value.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid asset fields");
 return value.data;
}
export function registerAssetRoutes(app:Express,auth:AuthService) {
 const service=new AssetService(auth.database);
 const authenticated=async(req:Request,res:Response,next:NextFunction)=>{
   try{
     const header=req.get("authorization");
     if(!header?.startsWith("Bearer "))throw unauthorized();
     res.locals.principal=await auth.authenticate(header.slice(7));
     next();
   }catch(e){next(e);}
 };
 const actor=(res:Response)=>res.locals.principal as Principal;
 const root="/api/v1/assets";
 app.post(root+"/upload-intent",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.status(201).json({data:await service.intent(actor(res),parse(assetIntentSchema,req.body))});
 });
 app.post(root+"/confirm",authenticated,async(req,res)=>{
   const data=parse(assetConfirmSchema,req.body);
   res.status(201).json({data:await service.confirm(actor(res),data.intentId,data.assetId)});
 });
 app.get(root,authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await service.list(actor(res),parse(assetListSchema,req.query))});
 });
 app.get(root+"/:id",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await service.detail(actor(res),parse(uuid,req.params.id))});
 });
 app.post(root+"/:id/authorized-download",authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   res.json({data:await service.download(actor(res),parse(uuid,req.params.id))});
 });
 app.post(root+"/:id/link",authenticated,async(req,res)=>{
   const data=parse(assetLinkSchema,req.body);
   res.json({data:await service.link(actor(res),parse(uuid,req.params.id),data.version,data.clientId)});
 });
 app.post(root+"/:id/archive",authenticated,async(req,res)=>{
   res.json({data:await service.archive(actor(res),parse(uuid,req.params.id),
     parse(assetArchiveSchema,req.body).version)});
 });
}
