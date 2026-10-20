import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { assetIntentSchema,assetConfirmSchema,assetListSchema,assetLinkSchema,assetArchiveSchema } from "@digimarket/contracts";
import { AuthService, type Principal } from "../auth/service";
import { AuthError, unauthorized } from "../auth/errors";
import { AssetService } from "./service";
import { AssetFolderService } from "./folders";
const uuid=z.uuid();
function parse<T>(schema:z.ZodType<T>,data:unknown):T {
 const value=schema.safeParse(data);
 if(!value.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid asset fields");
 return value.data;
}
export function registerAssetRoutes(app:Express,auth:AuthService) {
 const service=new AssetService(auth.database);
 const folders=new AssetFolderService(auth.database);
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
   res.status(201).json({data:await service.confirm(actor(res),data.intentId,data.assetId,false,data.folderId??null)});
 });
 app.get(root,authenticated,async(req,res)=>{
   res.set("Cache-Control","no-store");
   const folderId=req.query.folderId;
   if(folderId!==undefined && folderId!=="root" && !uuid.safeParse(folderId).success)
    throw new AuthError(422,"VALIDATION_ERROR","Invalid folder");
   const knownQuery={...req.query};
   delete knownQuery.folderId; // Folder is validated separately; assetListSchema is intentionally strict.
   const input=parse(assetListSchema,knownQuery);
   res.json({data:await service.list(actor(res),{...input,
     ...(folderId!==undefined?{folderId:folderId==="root"?null:String(folderId)}:{})})});
 });
 app.get("/api/v1/asset-folders",authenticated,async(req,res)=>{
   const parentId=req.query.parentId;
   if(parentId!==undefined && parentId!=="root" && !uuid.safeParse(parentId).success)
     throw new AuthError(422,"VALIDATION_ERROR","Invalid folder");
   res.set("Cache-Control","no-store").json({data:await folders.list(actor(res),
     parentId===undefined||parentId==="root"?null:String(parentId))});
 });
 app.post("/api/v1/asset-folders",authenticated,async(req,res)=>{
   res.status(201).json({data:await folders.create(actor(res),req.body)});
 });
 app.post("/api/v1/asset-folders/:id/download",authenticated,async(req,res)=>{
   const zip=await folders.downloadFolder(actor(res),parse(uuid,req.params.id));
   res.set("Cache-Control","no-store");
   res.set("Content-Type","application/zip");
   res.set("Content-Disposition",'attachment; filename="'+zip.filename+'"');
   res.send(zip.data);
 });
 app.put("/api/v1/asset-folders/:id",authenticated,async(req,res)=>{
   res.json({data:await folders.update(actor(res),parse(uuid,req.params.id),req.body)});
 });
 app.delete("/api/v1/asset-folders/:id",authenticated,async(req,res)=>{
   await folders.remove(actor(res),parse(uuid,req.params.id));res.status(204).end();
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
 app.post(root+"/:id/organize",authenticated,async(req,res)=>{
   res.json({data:await folders.organize(actor(res),parse(uuid,req.params.id),req.body)});
 });
 app.post(root+"/:id/archive",authenticated,async(req,res)=>{
   res.json({data:await service.archive(actor(res),parse(uuid,req.params.id),
     parse(assetArchiveSchema,req.body).version)});
 });
}
