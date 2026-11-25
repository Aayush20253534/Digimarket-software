import type { PrismaClient, Prisma } from "@digimarket/db";
import type {
  ClientCreateInput, ClientUpdateInput, ClientListQuery, ClientContactInput, ClientEndAgreementInput,
} from "@digimarket/contracts";
import { agencyToday } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import { agreementExpired, expiredAgreementWhere } from "./agreement-status";

const deny=(a:Principal,permission:string)=>{if(!a.permissions.has(permission))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Client changed; refresh before editing");
const optional=(value?:string)=>value?.trim()||null;
const privateFields=["businessName","businessType","phone","email","location","websiteUrl","instagramUrl","facebookUrl","notes"] as const;

export class ClientsService {
 constructor(private readonly db:PrismaClient,private readonly today=agencyToday){}
 private async existing(a:Principal,id:string) {
   deny(a,"clients.read");
   const client=await this.db.client.findFirst({where:{id,organizationId:a.organizationId}});
   if(!client)throw missing();
   return client;
 }
 async list(a:Principal,input:ClientListQuery){
   deny(a,"clients.read");
   const expired=expiredAgreementWhere(this.today());
   const clauses:Prisma.ClientWhereInput[]=[];
   if(input.section==="current")clauses.push({NOT:expired});
   if(input.section==="expired"||input.status==="EXPIRED")clauses.push(expired);
   if(input.status&&input.status!=="EXPIRED"){
     clauses.push({status:input.status});
     if(input.status!=="ARCHIVED")clauses.push({NOT:expired});
   }
   const where:Prisma.ClientWhereInput={organizationId:a.organizationId,
     ...(clauses.length?{AND:clauses}:{}),
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
       contractEndOn:true,agreementEndedOn:true,agreementEndReason:true,
       _count:{select:{contacts:true}}}});
   const more=rows.length>input.limit;
   const page=rows.slice(0,input.limit);
   return {items:page.map(row=>({...row,agreementExpired:agreementExpired(row,this.today())})),nextCursor:more?page.at(-1)?.id??null:null};
 }
 async detail(a:Principal,id:string){
   await this.existing(a,id);
   const client=await this.db.client.findFirstOrThrow({where:{id,organizationId:a.organizationId},
     include:{contacts:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]},
       sourceLead:{select:{id:true,businessName:true,status:true}}}});
   const result={...client,agreementExpired:agreementExpired(client,this.today())};
   return a.permissions.has("finance.read.all")?result:{...result,monthlyFee:null,monthlyAdBudget:null};
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
   if(status==="EXPIRED"&&previous.status!=="EXPIRED")throw invalid("Use End agreement to record the end date and reason");
   if(previous.agreementEndedOn&&status&&status!=="EXPIRED")throw invalid("An ended agreement must remain in Expired");
   const start=fields.contractStartOn===undefined?previous.contractStartOn?.toISOString().slice(0,10):fields.contractStartOn;
   const end=fields.contractEndOn===undefined?previous.contractEndOn?.toISOString().slice(0,10):fields.contractEndOn;
   if(start&&end&&start>end)throw invalid("Contract end date must be on or after start date");
   if(previous.agreementEndedOn&&((start&&start>previous.agreementEndedOn.toISOString().slice(0,10))||
     (end&&end<previous.agreementEndedOn.toISOString().slice(0,10))))throw invalid("Agreement dates must include the recorded end date");
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
 async endAgreement(a:Principal,id:string,input:ClientEndAgreementInput){
   deny(a,"clients.edit");deny(a,"clients.read");
   if(input.endedOn>this.today())throw invalid("The agreement end date cannot be in the future");
   return this.db.$transaction(async tx=>{
     const previous=await tx.client.findFirst({where:{id,organizationId:a.organizationId}});
     if(!previous)throw missing();
     if(previous.version!==input.version)throw conflict();
     if(previous.agreementEndedOn)throw new AuthError(409,"AGREEMENT_ENDED","This agreement has already been manually ended");
     if(previous.status==="ARCHIVED")throw invalid("Archived clients cannot end an agreement");
     const endedOn=new Date(input.endedOn+"T00:00:00Z");
     if(previous.contractStartOn&&endedOn<previous.contractStartOn)throw invalid("The end date cannot precede the agreement start");
     if(previous.contractEndOn&&endedOn>previous.contractEndOn)throw invalid("The end date cannot be after the original agreement end");
     const result=await tx.client.updateMany({where:{id,organizationId:a.organizationId,version:input.version},
       data:{status:"EXPIRED",agreementEndedOn:endedOn,agreementEndReason:input.reason,version:{increment:1}}});
     if(result.count!==1)throw conflict();
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:"clients.agreement_ended",entityType:"Client",entityId:id,
       beforeRedacted:{status:previous.status,contractEndOn:previous.contractEndOn?.toISOString().slice(0,10)??null},
       afterRedacted:{status:"EXPIRED",endedOn:input.endedOn,reason:input.reason,version:input.version+1}}});
     return {id,status:"EXPIRED" as const,agreementEndedOn:input.endedOn,version:input.version+1};
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
 async convert(_a:Principal,_leadId:string,_version:number):Promise<never>{
   void _a;void _leadId;void _version;
   throw new AuthError(405,"AUTO_CONVERSION_ONLY","Clients are created when the lead is Approved");
 }
}
