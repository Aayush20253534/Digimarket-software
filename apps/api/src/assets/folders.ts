import {z} from "zod";
import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
import {buildZip} from "./zip";
import {CloudinaryAssetProvider} from "./provider";

const uuid=z.uuid(),folderLabel=z.string().trim().min(1).max(120);
const color=z.string().regex(/^#[0-9a-fA-F]{6}$/);
const createInput=z.strictObject({name:folderLabel,parentId:uuid.nullable().default(null),color:color.default("#A56CE4")});
const editInput=z.strictObject({name:folderLabel.optional(),color:color.optional(),parentId:uuid.nullable().optional(),version:z.number().int().min(1)});
const fileInput=z.strictObject({filename:z.string().trim().min(1).max(180),folderId:uuid.nullable(),version:z.number().int().min(1)});
const validate=<T>(schema:z.ZodType<T>,input:unknown):T=>{
 const v=schema.safeParse(input);if(!v.success)throw new AuthError(422,"VALIDATION_ERROR","Invalid folder or filename");
 return v.data;
};
const need=(p:Principal,permission:string)=>{if(!p.permissions.has(permission))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Folder not found");
export class AssetFolderService{
 constructor(private db:PrismaClient){}
 private async get(p:Principal,id:string){
  const folder=await this.db.assetFolder.findFirst({where:{id,organizationId:p.organizationId}});
  if(!folder)throw missing();return folder;
 }
 private async parent(p:Principal,id:string|null){
  if(id)await this.get(p,id);
 }
 async list(p:Principal,parentId:string|null){
  need(p,"assets.read");
  await this.parent(p,parentId);
  const [folders,count]=await Promise.all([
    this.db.assetFolder.findMany({where:{organizationId:p.organizationId,parentId},
      orderBy:[{name:"asc"},{id:"asc"}],take:200}),
    this.db.asset.count({where:{organizationId:p.organizationId,folderId:parentId,status:"ACTIVE",
      ...(p.permissions.has("clients.read")?{}:{clientId:null})}}),
  ]);
  return {folders,fileCount:count,limited:folders.length===200};
 }
 async create(p:Principal,raw:unknown){
  need(p,"assets.upload");const v=validate(createInput,raw);await this.parent(p,v.parentId);
  const duplicate=await this.db.assetFolder.findFirst({where:{organizationId:p.organizationId,parentId:v.parentId,name:{equals:v.name,mode:"insensitive"}}});
  if(duplicate)throw new AuthError(409,"ALREADY_EXISTS","A folder with this name already exists");
  return this.db.assetFolder.create({data:{organizationId:p.organizationId,createdById:p.userId,...v}});
 }
 async update(p:Principal,id:string,raw:unknown){
  need(p,"assets.upload");const v=validate(editInput,raw);const current=await this.get(p,id);
  if(v.parentId!==undefined){
   if(v.parentId===id)throw new AuthError(422,"VALIDATION_ERROR","A folder cannot contain itself");
   await this.parent(p,v.parentId);
   let step=v.parentId;const seen=new Set<string>();
   while(step){
    if(step===id||seen.has(step))throw new AuthError(422,"VALIDATION_ERROR","Folder cycle is not allowed");
    seen.add(step);step=(await this.get(p,step)).parentId;
   }
  }
  const nextName=v.name??current.name,nextParent=v.parentId===undefined?current.parentId:v.parentId;
  if(nextName!==current.name||nextParent!==current.parentId){
   const duplicate=await this.db.assetFolder.findFirst({where:{organizationId:p.organizationId,
     parentId:nextParent,name:{equals:nextName,mode:"insensitive"},id:{not:id}}});
   if(duplicate)throw new AuthError(409,"ALREADY_EXISTS","A folder with this name already exists");
  }
  const result=await this.db.assetFolder.updateMany({where:{id,organizationId:p.organizationId,version:v.version},
    data:{name:nextName,parentId:nextParent,...(v.color?{color:v.color}:{}),version:{increment:1}}});
  if(!result.count)throw new AuthError(409,"VERSION_CONFLICT","Folder changed; refresh to retry");
  return this.get(p,id);
 }
 async downloadFolder(p:Principal,id:string){
  need(p,"assets.read");const root=await this.get(p,id);
  const stack:[string,string,number][]=[[root.id,"",0]];
  const visited=new Set<string>();
  const files:{name:string;data:Buffer}[]=[];
  let bytes=0;
  const cloudinary=new CloudinaryAssetProvider();
  while(stack.length){
   const [folderId,path,depth]=stack.pop()!;
   if(visited.has(folderId)||depth>6)throw new AuthError(422,"FOLDER_TOO_DEEP","Folder nesting exceeds download limit");
   visited.add(folderId);
   const [sub,assets]=await Promise.all([
    this.db.assetFolder.findMany({where:{organizationId:p.organizationId,parentId:folderId},take:100}),
    this.db.asset.findMany({where:{organizationId:p.organizationId,folderId,status:"ACTIVE",
      ...(p.permissions.has("clients.read")?{}:{clientId:null})},
      select:{filename:true,bytes:true,publicId:true,format:true,resourceType:true},take:31}),
   ]);
   if(sub.length>=100||assets.length>30||files.length+assets.length>30)
    throw new AuthError(422,"ARCHIVE_LIMIT","Download one folder with 30 files or fewer.");
   for(const child of sub)stack.push([child.id,path+child.name.replace(/[\\/:*?"<>|]/g,"_").replace(/\p{Cc}/gu,"_")+"/",depth+1]);
   for(const asset of assets){
    if(bytes+asset.bytes>25_000_000)throw new AuthError(422,"ARCHIVE_LIMIT","Folder exceeds 25 MB ZIP limit");
    const link=cloudinary.download(asset.publicId,asset.resourceType.toLowerCase() as "image"|"video"|"raw",asset.format);
    const url=new URL(link);
    if(url.protocol!=="https:"||url.hostname!=="res.cloudinary.com")
      throw new AuthError(503,"STORAGE_URL_INVALID","Secure download host is unavailable");
    const response=await fetch(link,{signal:AbortSignal.timeout(8000)});
    if(!response.ok)throw new AuthError(503,"DOWNLOAD_FAILED","Storage could not return a file");
    const raw=Buffer.from(await response.arrayBuffer());
    if(raw.length>asset.bytes+65536||bytes+raw.length>25_000_000)
      throw new AuthError(422,"ARCHIVE_LIMIT","Folder ZIP would exceed size limits");
    bytes+=raw.length;
    files.push({name:path+asset.filename.replace(/[\\/:*?"<>|]/g,"_").replace(/\p{Cc}/gu,"_"),data:raw});
   }
  }
  await this.db.auditLog.create({data:{organizationId:p.organizationId,actorId:p.userId,
    action:"assets.folder_downloaded",entityType:"AssetFolder",entityId:id,afterRedacted:{files:files.length}}});
  return {filename:root.name.replace(/[^a-zA-Z0-9 _-]/g,"_")+".zip",data:buildZip(files)};
 }
 async remove(p:Principal,id:string){
  need(p,"assets.delete");await this.get(p,id);
  const [sub,files]=await Promise.all([
    this.db.assetFolder.count({where:{organizationId:p.organizationId,parentId:id}}),
    this.db.asset.count({where:{organizationId:p.organizationId,folderId:id}}),
  ]);
  if(sub||files)throw new AuthError(409,"FOLDER_NOT_EMPTY","Move or remove the contents first");
  await this.db.assetFolder.deleteMany({where:{id,organizationId:p.organizationId}});
 }
 async organize(p:Principal,id:string,raw:unknown){
  need(p,"assets.upload");need(p,"assets.read");
  const v=validate(fileInput,raw);await this.parent(p,v.folderId);
  const file=await this.db.asset.findFirst({where:{id,organizationId:p.organizationId,status:"ACTIVE"}});
  if(!file||file.clientId&&!p.permissions.has("clients.read"))throw new AuthError(404,"NOT_FOUND","Asset not found");
  const updated=await this.db.asset.updateMany({where:{id,organizationId:p.organizationId,status:"ACTIVE",version:v.version},
    data:{filename:v.filename,folderId:v.folderId,version:{increment:1}}});
  if(!updated.count)throw new AuthError(409,"VERSION_CONFLICT","File changed. Refresh and retry.");
  await this.db.auditLog.create({data:{organizationId:p.organizationId,actorId:p.userId,
    action:"assets.organized",entityType:"Asset",entityId:id,
    afterRedacted:{folderId:v.folderId,filenameChanged:file.filename!==v.filename}}});
  return this.db.asset.findFirstOrThrow({where:{id,organizationId:p.organizationId}});
 }
}
