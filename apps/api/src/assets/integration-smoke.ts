import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { AssetService } from "./service";
import type { AssetProvider,ProviderResource,UploadOptions } from "./provider";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 9 integration requires isolated digimarket_ci PostgreSQL");

const resources=new Map<string,ProviderResource>();
const fake:AssetProvider={
 uploadOptions(publicId,resourceType,formats):UploadOptions{
   return {uploadUrl:"https://api.cloudinary.com/v1_1/mock/"+resourceType+"/upload",
     params:{public_id:publicId,type:"authenticated",allowed_formats:formats.join(","),signature:"test-sig"}};
 },
 async inspect(publicId){
   const stored=resources.get(publicId);
   if(!stored)throw Object.assign(new Error("Not found"),{status:422});
   return stored;
 },
 download(publicId,resourceType){
   return "https://api.cloudinary.com/v1_1/mock/"+resourceType+"/download?asset="+encodeURIComponent(publicId)+"&expires_at=mock";
 },
};
const db=createDatabaseClient(),svc=new AssetService(db,fake);
const identity=(id:string,org:string,permissions:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles:["ADMIN"],permissions:new Set(permissions),
});
const all=["assets.read","assets.upload","assets.delete","clients.read"];
function uploadMock(publicId:string,kind:string,format:string,bytes:number,id:string){
 resources.set(publicId,{asset_id:id,public_id:publicId,resource_type:kind,type:"authenticated",
   format,bytes,created_at:new Date().toISOString()});
}
try{
 const a=await db.organization.create({data:{name:"Asset Org A"}});
 const b=await db.organization.create({data:{name:"Asset Org B"}});
 const owner=await db.user.create({data:{organizationId:a.id,loginId:"asset-admin",displayName:"Owner",status:"ACTIVE"}});
 const outsider=await db.user.create({data:{organizationId:b.id,loginId:"asset-other",displayName:"External",status:"ACTIVE"}});
 const admin=identity(owner.id,a.id,all);
 const foreign=identity(outsider.id,b.id,all);
 const reader=identity(owner.id,a.id,["assets.read"]);
 const noClient=identity(owner.id,a.id,["assets.read"]);
 const uploader=identity(owner.id,a.id,["assets.read","assets.upload"]);
 const client=await db.client.create({data:{organizationId:a.id,createdById:owner.id,businessName:"Client A"}});
 const outsideClient=await db.client.create({data:{organizationId:b.id,createdById:outsider.id,businessName:"Client B"}});
 await assert.rejects(()=>svc.intent(reader,{filename:"forbidden.png",contentType:"image/png",bytes:120}),
   (e:{status?:number})=>e.status===403);
 await assert.rejects(()=>svc.intent(admin,{filename:"x.exe",contentType:"image/png",bytes:20_000_001}),
   (e:{status?:number})=>e.status===422);
 await assert.rejects(()=>svc.intent(admin,{filename:"pic.png",contentType:"image/png",bytes:20,clientId:outsideClient.id}),
   (e:{status?:number})=>e.status===404);
 const intent=await svc.intent(admin,{filename:"Ad.png",contentType:"image/png",bytes:120,clientId:client.id});
 assert.equal(intent.params.type,"authenticated");
 assert.ok(intent.params.public_id.startsWith("digimarket/"+a.id+"/"));
 assert.equal(intent.resourceType,"image");
 await assert.rejects(()=>svc.confirm(foreign,intent.intentId,"first-asset-id"),
   (e:{status?:number})=>e.status===404);
 await assert.rejects(()=>svc.confirm(admin,intent.intentId,"first-asset-id"),
   (e:{status?:number})=>e.status===422);
 uploadMock(intent.params.public_id,"image","png",120,"first-asset-id");
 await assert.rejects(()=>svc.confirm(admin,intent.intentId,"forged-id"),
   (e:{status?:number})=>e.status===422);
 resources.set(intent.params.public_id,{...resources.get(intent.params.public_id)!,type:"upload"});
 await assert.rejects(()=>svc.confirm(admin,intent.intentId,"first-asset-id"),
   (e:{status?:number})=>e.status===422);
 uploadMock(intent.params.public_id,"image","png",120,"first-asset-id");
 const actual=await svc.confirm(admin,intent.intentId,"first-asset-id");
 assert.equal(actual.clientId,client.id);
 assert.equal(actual.providerAssetId,"first-asset-id");
 assert.equal(await db.asset.count({where:{uploadIntentId:intent.intentId}}),1);
 await assert.rejects(()=>svc.confirm(admin,intent.intentId,"first-asset-id"),
   (e:{status?:number})=>e.status===409);
 assert.equal((await svc.list(admin,{limit:30,status:"ACTIVE"})).items.length,1);
 assert.equal((await svc.list(foreign,{limit:30,status:"ACTIVE"})).items.length,0);
 assert.equal((await svc.list(noClient,{limit:30,status:"ACTIVE"})).items.length,0);
 await assert.rejects(()=>svc.detail(foreign,actual.id),(e:{status?:number})=>e.status===404);
 await assert.rejects(()=>svc.download(foreign,actual.id),(e:{status?:number})=>e.status===404);
 await assert.rejects(()=>svc.download(reader,actual.id),(e:{status?:number})=>e.status===404);
 const granted=await svc.download(admin,actual.id);
 assert.ok(granted.url.includes("download?"));
 assert.ok(granted.expiresAt.getTime()>Date.now());
 await assert.rejects(()=>svc.archive(uploader,actual.id,1),(e:{status?:number})=>e.status===403);
 await assert.rejects(()=>svc.link(admin,actual.id,8,null),(e:{status?:number})=>e.status===409);
 await assert.rejects(()=>svc.link(admin,actual.id,1,outsideClient.id),(e:{status?:number})=>e.status===404);
 const general=await svc.link(admin,actual.id,1,null);
 assert.equal(general.clientId,null);assert.equal(general.version,2);
 assert.equal((await svc.list(noClient,{limit:30,status:"ACTIVE"})).items.length,1);
 const img=await svc.intent(admin,{filename:"Another.webp",contentType:"image/webp",bytes:70});
 uploadMock(img.params.public_id,"image","webp",70,"second-asset-id");
 await svc.confirm(admin,img.intentId,"second-asset-id");
 const page=await svc.list(admin,{limit:1,status:"ACTIVE"});
 assert.ok(page.nextCursor);
 const next=await svc.list(admin,{limit:1,status:"ACTIVE",cursor:page.nextCursor!});
 assert.equal(next.items.length,1);assert.notEqual(next.items[0].id,page.items[0].id);
 assert.equal((await svc.list(admin,{limit:30,status:"ACTIVE",q:"Another"})).items.length,1);
 const archived=await svc.archive(admin,actual.id,2);
 assert.equal(archived.status,"ARCHIVED");
 await assert.rejects(()=>svc.download(admin,actual.id),(e:{status?:number})=>e.status===410);
 assert.equal((await svc.list(admin,{limit:30,status:"ARCHIVED"})).items.length,1);
 const expiredIntent=await svc.intent(admin,{filename:"Expired.pdf",contentType:"application/pdf",bytes:250});
 await db.assetUploadIntent.update({where:{id:expiredIntent.intentId},data:{expiresAt:new Date(Date.now()-5000)}});
 uploadMock(expiredIntent.params.public_id,"raw","pdf",250,"expired-provider-id");
 await assert.rejects(()=>svc.confirm(admin,expiredIntent.intentId,"expired-provider-id"),
   (e:{status?:number})=>e.status===409);
 assert.ok((await db.auditLog.count({where:{organizationId:a.id,entityType:"Asset"}}))>=4);
 console.info("Module 9 PASS: authenticated uploads, provider verification, organization/client isolation, unauthorized and forged intent, expiry, browsing, download, link, archive.");
}finally{await db.$disconnect();}
