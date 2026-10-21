import type { PrismaClient, Prisma } from "@digimarket/db";
import type {
  ClientCreateInput, ClientUpdateInput, ClientListQuery, ClientContactInput, ClientServiceInput,
} from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";

const deny=(a:Principal,permission:string)=>{if(!a.permissions.has(permission))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Client changed; refresh before editing");
const converted=()=>new AuthError(409,"ALREADY_CONVERTED","This lead already has a client record");
const optional=(value?:string)=>value?.trim()||null;
const privateFields=["businessName","businessType","phone","email","location","websiteUrl","instagramUrl","facebookUrl","notes"] as const;

export class ClientsService {
 constructor(private readonly db:PrismaClient){}
 private async existing(a:Principal,id:string) {
   deny(a,"clients.read");
   const client=await this.db.client.findFirst({where:{id,organizationId:a.organizationId}});
   if(!client)throw missing();
   return client;
 }
 async list(a:Principal,input:ClientListQuery){
   deny(a,"clients.read");
   const where:Prisma.ClientWhereInput={organizationId:a.organizationId,
     ...(input.status?{status:input.status}:{}),
     ...(input.q?{OR:[
       {businessName:{contains:input.q,mode:"insensitive"}},
       {phone:{contains:input.q}},
       {location:{contains:input.q,mode:"insensitive"}},
       {email:{contains:input.q,mode:"insensitive"}},
     ]}:{})};
   const rows=await this.db.client.findMany({where,take:input.limit+1,
     ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
     orderBy:[{[input.sort??"createdAt"]:input.direction??"desc"} as Prisma.ClientOrderByWithRelationInput,{id:input.direction??"desc"}],
     select:{id:true,businessName:true,businessType:true,phone:true,email:true,location:true,
       status:true,sourceLeadId:true,version:true,createdAt:true,updatedAt:true,
       _count:{select:{contacts:true,services:true}}}});
   const more=rows.length>input.limit;
   const page=rows.slice(0,input.limit);
   return {items:page,nextCursor:more?page.at(-1)?.id??null:null};
 }
 async detail(a:Principal,id:string){
   await this.existing(a,id);
   return this.db.client.findFirstOrThrow({where:{id,organizationId:a.organizationId},
     include:{contacts:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]},
       services:{orderBy:{createdAt:"asc"}},
       sourceLead:{select:{id:true,businessName:true,status:true}}}});
 }
 async create(_a:Principal,_input:ClientCreateInput):Promise<never>{
   throw new AuthError(405,"LEAD_APPROVAL_REQUIRED","Approve a lead to create a client");
 }

 async update(a:Principal,id:string,input:ClientUpdateInput){
   deny(a,"clients.edit");
   await this.existing(a,id);
   const {version,status,...fields}=input;
   if(!status&&!privateFields.some(key=>fields[key]!==undefined))throw invalid("At least one change is required");
   const data:Prisma.ClientUpdateManyMutationInput={version:{increment:1}};
   for(const key of privateFields){
     const value=fields[key];
     if(value!==undefined){
       if(key==="businessName")data.businessName=value.trim();
       else data[key]=optional(value);
     }
   }
   if(status)data.status=status;
   return this.db.$transaction(async tx=>{
     const result=await tx.client.updateMany({where:{id,organizationId:a.organizationId,version},data});
     if(result.count!==1)throw conflict();
     const updated=await tx.client.findUniqueOrThrow({where:{id}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"clients.updated",entityType:"Client",entityId:id,
       afterRedacted:{version:updated.version,status:updated.status}}});
     return updated;
   });
 }
 async addContact(a:Principal,id:string,input:ClientContactInput){
   deny(a,"clients.edit");
   await this.existing(a,id);
   return this.db.$transaction(async tx=>{
     if(input.isPrimary)await tx.clientContact.updateMany({where:{clientId:id},data:{isPrimary:false}});
     const contact=await tx.clientContact.create({data:{
       clientId:id,name:input.name.trim(),role:optional(input.role),
       phone:optional(input.phone),email:optional(input.email),isPrimary:input.isPrimary,
     }});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"clients.contact_added",entityType:"Client",entityId:id,
       afterRedacted:{contactId:contact.id}}});
     return contact;
   });
 }
 async addService(a:Principal,id:string,input:ClientServiceInput){
   deny(a,"clients.edit");
   await this.existing(a,id);
   return this.db.$transaction(async tx=>{
     const service=await tx.clientService.create({data:{
       clientId:id,name:input.name.trim(),description:optional(input.description),status:input.status,
     }});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"clients.service_added",entityType:"Client",entityId:id,
       afterRedacted:{serviceId:service.id,status:service.status}}});
     return service;
   });
 }
 async convert(_a:Principal,_leadId:string,_version:number):Promise<never>{
   throw new AuthError(405,"AUTO_CONVERSION_ONLY","Clients are created when the lead is Approved");
 }
}
