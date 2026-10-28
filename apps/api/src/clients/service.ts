import type { PrismaClient, Prisma } from "@digimarket/db";
import type {
  ClientCreateInput, ClientUpdateInput, ClientListQuery, ClientContactInput, ClientServiceInput,
} from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";

const deny=(a:Principal,permission:string)=>{if(!a.permissions.has(permission))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Client changed; refresh before editing");
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
   void _a;void _input;
   throw new AuthError(405,"LEAD_APPROVAL_REQUIRED","Approve a lead to create a client");
 }

 async update(a:Principal,id:string,input:ClientUpdateInput){
   deny(a,"clients.edit");
   await this.existing(a,id);
   const {version,status,...fields}=input;
   if(!status&&!privateFields.some(key=>fields[key]!==undefined)&&
     !["contractStartOn","contractEndOn","monthlyFee","monthlyAdBudget"].some(key=>fields[key as keyof typeof fields]!==undefined))throw invalid("At least one change is required");
   const data:Prisma.ClientUpdateManyMutationInput={version:{increment:1}};
   for(const key of privateFields){
     const value=fields[key];
     if(value!==undefined){
       if(key==="businessName")data.businessName=value.trim();
       else data[key]=optional(value);
     }
   }
   if(status)data.status=status;
   if(fields.contractStartOn!==undefined)data.contractStartOn=fields.contractStartOn?new Date(fields.contractStartOn+"T00:00:00.000Z"):null;
   if(fields.contractEndOn!==undefined)data.contractEndOn=fields.contractEndOn?new Date(fields.contractEndOn+"T00:00:00.000Z"):null;
   if(fields.monthlyFee!==undefined)data.monthlyFee=fields.monthlyFee||null;
   if(fields.monthlyAdBudget!==undefined)data.monthlyAdBudget=fields.monthlyAdBudget||null;
   const previous=await this.db.client.findUniqueOrThrow({where:{id}});
   const start=fields.contractStartOn===undefined?previous.contractStartOn?.toISOString().slice(0,10):fields.contractStartOn;
   const end=fields.contractEndOn===undefined?previous.contractEndOn?.toISOString().slice(0,10):fields.contractEndOn;
   if(start&&end&&start>end)throw invalid("Contract end date must be on or after start date");
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
       monthlyTarget:input.monthlyTarget??null,
     }});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
       action:"clients.service_added",entityType:"Client",entityId:id,
       afterRedacted:{serviceId:service.id,status:service.status,monthlyTarget:service.monthlyTarget}}});
     return service;
   });
 }

 // A single permission-scoped snapshot powers client delivery Overview and client workspaces.
 // Project visibility exactly follows ProjectsService: private team projects are not leaked.
 async deliverySummary(a:Principal){
   deny(a,"clients.read");
   const now=new Date();
   const monthStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
   const nextMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+1,1));
   const projectAllowed=a.permissions.has("projects.read");
   const canSeeAllProjects=a.permissions.has("projects.assign");
   const projectScope:Prisma.ProjectWhereInput=canSeeAllProjects?{}:{
     OR:[{createdById:a.userId},{members:{some:{userId:a.userId}}}],
   };
   const rows=await this.db.client.findMany({
     where:{organizationId:a.organizationId,status:{not:"ARCHIVED"}},
     orderBy:[{updatedAt:"desc"},{id:"desc"}],take:101,
     select:{
       id:true,businessName:true,status:true,contractStartOn:true,contractEndOn:true,
       monthlyFee:true,monthlyAdBudget:true,
       services:{where:{status:"ACTIVE"},select:{id:true,name:true,monthlyTarget:true,status:true}},
       projects:{where:projectAllowed?projectScope:{id:{in:[]}},select:{
         id:true,name:true,status:true,dueOn:true,
         deliverables:{select:{status:true}},
       }},
       contentPosts:a.permissions.has("content.read")?{where:{
         status:"PUBLISHED",publishedAt:{gte:monthStart,lt:nextMonth},
       },select:{format:true}}:false,
     },
   });
   const items=rows.slice(0,100).map(row=>{
     const projects=row.projects||[];
     const posts=row.contentPosts||[];
     const targets=row.services.map(service=>{
       const format=/reels?/i.test(service.name)?"REEL":/posts?/i.test(service.name)?"POST":null;
       return {id:service.id,name:service.name,monthlyTarget:service.monthlyTarget,
         deliveredThisMonth:format&&a.permissions.has("content.read")?
           posts.filter(post=>post.format===format).length:null};
     });
     return {
       id:row.id,businessName:row.businessName,status:row.status,
       contractStartOn:row.contractStartOn,contractEndOn:row.contractEndOn,
       monthlyFee:row.monthlyFee,monthlyAdBudget:row.monthlyAdBudget,
       targets,
       projects:projects.map(project=>({
         id:project.id,name:project.name,status:project.status,dueOn:project.dueOn,
         totalDeliverables:project.deliverables.length,
         approvedDeliverables:project.deliverables.filter(d=>d.status==="APPROVED").length,
       })),
       activeProjects:projects.filter(p=>p.status==="ACTIVE"||p.status==="PLANNED").length,
       totalDeliverables:projects.reduce((sum,p)=>sum+p.deliverables.length,0),
       approvedDeliverables:projects.reduce((sum,p)=>sum+p.deliverables.filter(d=>d.status==="APPROVED").length,0),
     };
   });
   return {items,truncated:rows.length>100,month:now.toISOString().slice(0,7)};
 }
 async convert(_a:Principal,_leadId:string,_version:number):Promise<never>{
   void _a;void _leadId;void _version;
   throw new AuthError(405,"AUTO_CONVERSION_ONLY","Clients are created when the lead is Approved");
 }
}
