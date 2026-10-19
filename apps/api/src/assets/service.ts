import { randomUUID } from "node:crypto";
import type { PrismaClient, Prisma } from "@digimarket/db";
import type { AssetIntentInput, AssetListQuery } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import { type AssetProvider, CloudinaryAssetProvider, validateMedia } from "./provider";

const deny=(a:Principal,key:string)=>{if(!a.permissions.has(key))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Asset not found");
const clash=()=>new AuthError(409,"VERSION_CONFLICT","Asset changed; reload before updating");
const expired=()=>new AuthError(409,"INTENT_EXPIRED","Upload intent expired or already completed");
const resource=(kind:"IMAGE"|"VIDEO"|"RAW")=>kind.toLowerCase() as "image"|"video"|"raw";
export class AssetService {
 constructor(private readonly db:PrismaClient,private readonly provider:AssetProvider=new CloudinaryAssetProvider()){}
 private async client(a:Principal,id:string|null|undefined){
   if(!id)return null;
   deny(a,"clients.read");
   const found=await this.db.client.findFirst({where:{id,organizationId:a.organizationId,status:{not:"ARCHIVED"}},select:{id:true}});
   if(!found)throw new AuthError(404,"NOT_FOUND","Client not found");
   return found.id;
 }
 private async existing(a:Principal,id:string){
   deny(a,"assets.read");
   const found=await this.db.asset.findFirst({where:{id,organizationId:a.organizationId}});
   if(!found)throw missing();
   if(found.clientId&&!a.permissions.has("clients.read"))throw missing();
   return found;
 }
 async intent(a:Principal,input:AssetIntentInput){
   deny(a,"assets.upload");deny(a,"assets.read");
   const type=validateMedia(input.contentType,input.bytes);
   const clientId=await this.client(a,input.clientId);
   const id=randomUUID();
   const publicId="digimarket/"+a.organizationId+"/"+id+(type.kind==="raw"?".pdf":"");
   // The provider is configured before creating any database record.
   const options=this.provider.uploadOptions(publicId,type.kind,[type.format]);
   const expiresAt=new Date(Date.now()+10*60_000);
   await this.db.assetUploadIntent.create({data:{
     id,organizationId:a.organizationId,createdById:a.userId,clientId,
     publicId,filename:input.filename.trim(),contentType:input.contentType,
     resourceType:type.kind.toUpperCase() as "IMAGE"|"VIDEO"|"RAW",
     expectedBytes:input.bytes,expiresAt,
   }});
   return {intentId:id,expiresAt,resourceType:type.kind,...options};
 }
 async confirm(a:Principal,intentId:string,providerAssetId:string){
   deny(a,"assets.upload");deny(a,"assets.read");
   const intent=await this.db.assetUploadIntent.findFirst({where:{
     id:intentId,organizationId:a.organizationId,createdById:a.userId,
   }});
   if(!intent)throw new AuthError(404,"NOT_FOUND","Upload intent not found");
   if(intent.status!=="PENDING"||intent.expiresAt<=new Date())throw expired();
   if(intent.clientId)await this.client(a,intent.clientId);
   const info=validateMedia(intent.contentType,intent.expectedBytes);
   const verified=await this.provider.inspect(intent.publicId,info.kind);
   if(verified.asset_id!==providerAssetId||verified.public_id!==intent.publicId||
      verified.resource_type!==info.kind||verified.type!=="authenticated"||
      verified.format.toLowerCase()!==info.format||verified.bytes!==intent.expectedBytes){
     throw new AuthError(422,"PROVIDER_MISMATCH","Uploaded file does not match the authorized intent");
   }
   if(verified.created_at){
     const created=Date.parse(verified.created_at);
     if(!Number.isFinite(created)||created<intent.createdAt.getTime()-300_000)
       throw new AuthError(422,"PROVIDER_MISMATCH","Upload predates its authorization");
   }
   return this.db.$transaction(async tx=>{
     const acquired=await tx.assetUploadIntent.updateMany({where:{
       id:intent.id,organizationId:a.organizationId,status:"PENDING",expiresAt:{gt:new Date()},
     },data:{status:"CONFIRMED"}});
     if(acquired.count!==1)throw expired();
     const asset=await tx.asset.create({data:{
       organizationId:a.organizationId,uploadedById:a.userId,clientId:intent.clientId,
       uploadIntentId:intent.id,providerAssetId:verified.asset_id,publicId:intent.publicId,
       filename:intent.filename,contentType:intent.contentType,resourceType:intent.resourceType,
       format:verified.format,bytes:verified.bytes,
     }});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"assets.confirmed",entityType:"Asset",entityId:asset.id,
       afterRedacted:{clientLinked:!!asset.clientId,bytes:asset.bytes,resourceType:asset.resourceType}}});
     return asset;
   });
 }
 async list(a:Principal,input:AssetListQuery){
   deny(a,"assets.read");
   if(input.clientId)await this.client(a,input.clientId);
   const where:Prisma.AssetWhereInput={
     organizationId:a.organizationId,status:input.status,
     ...(!a.permissions.has("clients.read")?{clientId:null}:{}),
     ...(input.clientId?{clientId:input.clientId}:{}),
     ...(input.q?{OR:[{filename:{contains:input.q,mode:"insensitive"}},
       {contentType:{contains:input.q,mode:"insensitive"}}]}:{}),
   };
   const rows=await this.db.asset.findMany({where,take:input.limit+1,
     ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
     orderBy:[{createdAt:"desc"},{id:"desc"}],
     select:{id:true,filename:true,contentType:true,resourceType:true,bytes:true,
       status:true,version:true,clientId:true,createdAt:true,
       client:{select:{businessName:true}},uploader:{select:{displayName:true}}}});
   const more=rows.length>input.limit;
   const items=rows.slice(0,input.limit);
   return {items,nextCursor:more?items.at(-1)?.id??null:null};
 }
 async detail(a:Principal,id:string){
   const item=await this.existing(a,id);
   return {id:item.id,filename:item.filename,contentType:item.contentType,
     resourceType:item.resourceType,bytes:item.bytes,status:item.status,
     version:item.version,clientId:item.clientId,createdAt:item.createdAt,updatedAt:item.updatedAt};
 }
 async download(a:Principal,id:string){
   const item=await this.existing(a,id);
   if(item.status!=="ACTIVE")throw new AuthError(410,"ASSET_ARCHIVED","Asset is archived");
   const url=this.provider.download(item.publicId,resource(item.resourceType),item.format);
   await this.db.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"assets.download_authorized",entityType:"Asset",entityId:item.id}});
   return {url,expiresAt:new Date(Date.now()+120_000)};
 }
 async link(a:Principal,id:string,version:number,clientId:string|null){
   deny(a,"assets.upload");
   await this.existing(a,id);
   const target=await this.client(a,clientId);
   return this.db.$transaction(async tx=>{
     const done=await tx.asset.updateMany({where:{
       id,organizationId:a.organizationId,status:"ACTIVE",version,
     },data:{clientId:target,version:{increment:1}}});
     if(done.count!==1)throw clash();
     const item=await tx.asset.findUniqueOrThrow({where:{id}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"assets.link_changed",entityType:"Asset",entityId:id,afterRedacted:{hasClient:!!target}}});
     return {id:item.id,clientId:item.clientId,version:item.version};
   });
 }
 async archive(a:Principal,id:string,version:number){
   deny(a,"assets.delete");
   await this.existing(a,id);
   return this.db.$transaction(async tx=>{
     const done=await tx.asset.updateMany({where:{
       id,organizationId:a.organizationId,status:"ACTIVE",version,
     },data:{status:"ARCHIVED",version:{increment:1}}});
     if(done.count!==1)throw clash();
     const item=await tx.asset.findUniqueOrThrow({where:{id}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"assets.archived",entityType:"Asset",entityId:id}});
     return {id:item.id,status:item.status,version:item.version};
   });
 }
}
