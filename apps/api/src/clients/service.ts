import { type PrismaClient, Prisma } from "@digimarket/db";
import type {
  ClientCreateInput, ClientUpdateInput, ClientListQuery, ClientContactInput, ClientEndAgreementInput, ClientRenewInput, ClientServiceInput,
} from "@digimarket/contracts";
import { agencyToday, businessCycle, dateOnlyRange } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import { agreementExpired, expiredAgreementWhere } from "./agreement-status";
import {ClientVideoReadinessService} from "./video-readiness-service";
import {ClientPostReadinessService} from "./post-readiness-service";
import {FinanceLedgerService} from "../finance/ledger-service";

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
   const today=this.today(),expired=expiredAgreementWhere(today);
   const due=new Date(today+"T00:00:00Z"),soon=new Date(due.getTime()+7*86400000);
   const expiring:Prisma.ClientWhereInput={status:"ACTIVE",NOT:expired,contractEndOn:{gte:due,lte:soon}};
   const clauses:Prisma.ClientWhereInput[]=[];
   if(input.section==="current")clauses.push({NOT:expired});
   if(input.section==="expired"||input.status==="EXPIRED")clauses.push(expired);
   if(input.status&&input.status!=="EXPIRED"){
     clauses.push({status:input.status});
     if(input.status!=="ARCHIVED")clauses.push({NOT:expired});
   }
   if(input.expiring)clauses.push(expiring);
   if(input.health)clauses.push({health:input.health});
   if(input.managerId)clauses.push({managerId:input.managerId});
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
       health:true,manager:{select:{id:true,displayName:true}},monthlyFee:true,monthlyAdBudget:true,sourceLead:{select:{googleMapsUrl:true}},
       _count:{select:{contacts:true}}}});
   const more=rows.length>input.limit;
   const page=rows.slice(0,input.limit);
   const finance=a.permissions.has("finance.read.all");
   const items=page.map(({monthlyFee,monthlyAdBudget,...row})=>({...row,monthlyFee:finance?monthlyFee:null,monthlyAdBudget:finance?monthlyAdBudget:null,agreementExpired:agreementExpired(row,today)}));
   const nextCursor=more?page.at(-1)?.id??null:null;
   if(!input.workspace)return {items,nextCursor,summary:undefined};
   const org={organizationId:a.organizationId},active={...org,status:"ACTIVE" as const,NOT:expired};
   const [total,all,activeCount,paused,archived,past,ending,fees,managers]=await Promise.all([
     this.db.client.count({where}),this.db.client.count({where:org}),this.db.client.count({where:active}),
     this.db.client.count({where:{...org,status:"PAUSED",NOT:expired}}),this.db.client.count({where:{...org,status:"ARCHIVED",NOT:expired}}),
     this.db.client.count({where:{...org,...expired}}),this.db.client.count({where:{...org,...expiring}}),
     finance?this.db.client.aggregate({where:active,_sum:{monthlyFee:true}}):Promise.resolve(null),
     this.db.user.findMany({where:{...org,status:"ACTIVE"},select:{id:true,displayName:true},orderBy:{displayName:"asc"}})
   ]);
   const cycle=businessCycle(today),withStock: (typeof items[number]&{readiness:Awaited<ReturnType<ClientsService["readiness"]>>})[]=[];
   // Bounded fan-out reuses the canonical stock calculations.
   for(let i=0;i<items.length;i+=4)withStock.push(...await Promise.all(items.slice(i,i+4).map(async row=>({...row,readiness:await this.readiness(a,row.id,cycle.key)}))));
   return {items:withStock,nextCursor,total,today,cycle,managers,summary:{all,active:activeCount,paused,archived,past,expiring:ending,monthlyFees:fees?fees._sum.monthlyFee?.toFixed(4)??"0.0000":null}};
 }
 private async readiness(a:Principal,id:string,key:string){
   const [v,p]=await Promise.all([new ClientVideoReadinessService(this.db).cycle(a,id,key),new ClientPostReadinessService(this.db).cycle(a,id,key)]);
   return {videos:v.remainingStock,posts:p.remainingStock,festival:p.festivalRemainingStock,videosDelivered:v.deliveredThisMonth,postsDelivered:p.deliveredThisMonth,festivalDelivered:p.festivalDeliveredThisMonth};
 }
 async detail(a:Principal,id:string){
   await this.existing(a,id);
   const client=await this.db.client.findFirstOrThrow({where:{id,organizationId:a.organizationId},
     include:{contacts:{orderBy:[{isPrimary:"desc"},{createdAt:"asc"}]},
       sourceLead:{select:{id:true,businessName:true,status:true,googleMapsUrl:true}}}});
   const result={...client,agreementExpired:agreementExpired(client,this.today())};
   return a.permissions.has("finance.read.all")?result:{...result,monthlyFee:null,monthlyAdBudget:null};
 }
 async overview(a:Principal,id:string){
   const client=await this.existing(a,id),cycle=businessCycle(this.today());
   const finance=a.permissions.has("finance.read.all");
   const [readiness,services,managers,history]=await Promise.all([
     this.readiness(a,id,cycle.key),this.db.clientService.findMany({where:{clientId:id},orderBy:{name:"asc"}}),
     this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},select:{id:true,displayName:true},orderBy:{displayName:"asc"}}),
     this.db.auditLog.findMany({where:{organizationId:a.organizationId,entityType:"Client",entityId:id},orderBy:[{createdAt:"desc"},{id:"desc"}],take:100,select:{id:true,action:true,createdAt:true,beforeRedacted:true,afterRedacted:true,actor:{select:{displayName:true}}}})
   ]);
   let financial=null;
   if(finance){
     const range=dateOnlyRange(cycle);
     const [invoices,payments,funds]=await Promise.all([
       this.db.invoice.aggregate({where:{organizationId:a.organizationId,clientId:id,status:"ISSUED",currencyCode:"INR"},_sum:{total:true,paidTotal:true},_count:true}),
       this.db.payment.aggregate({where:{organizationId:a.organizationId,clientId:id,status:"VERIFIED",currencyCode:"INR",receivedOn:range},_sum:{amount:true},_count:true}),
       new FinanceLedgerService(this.db).clientBalances(a,cycle)
     ]);
     const billed=invoices._sum.total??new Prisma.Decimal(0),paid=invoices._sum.paidTotal??new Prisma.Decimal(0);
     financial={invoiceCount:invoices._count,invoiceTotal:billed.toFixed(4),invoicePaid:paid.toFixed(4),invoiceOutstanding:billed.minus(paid).toFixed(4),verifiedPayments:payments._sum.amount?.toFixed(4)??"0.0000",paymentCount:payments._count,funds:funds.find(f=>f.id===id)??null};
   }
   return {cycle,readiness,services,managers,manager:managers.find(m=>m.id===client.managerId)??null,financial,history:history.map(({beforeRedacted,afterRedacted,...event})=>({...event,...(finance?{beforeRedacted,afterRedacted}:{})}))};
 }
 async renew(a:Principal,id:string,input:ClientRenewInput){
   deny(a,"clients.edit");deny(a,"finance.read.all");deny(a,"clients.read");
   const today=this.today();
   if(input.startOn>today||input.endOn<today)throw invalid("Renewal must be effective now, with an end date on or after today");
   return this.db.$transaction(async tx=>{
     const old=await tx.client.findFirst({where:{id,organizationId:a.organizationId}});
     if(!old)throw missing();
     if(old.version!==input.version)throw conflict();
     if(old.status==="ARCHIVED")throw invalid("Archived clients cannot be renewed");
     const priorStart=(old.currentAgreementStartOn??old.contractStartOn)?.toISOString().slice(0,10);
     const priorEnd=(old.agreementEndedOn??old.contractEndOn)?.toISOString().slice(0,10);
     const expired=agreementExpired(old,today);
     if(priorStart&&input.startOn<priorStart)throw invalid("Renewal cannot precede the current agreement");
     if(expired&&priorEnd&&input.startOn<=priorEnd)throw invalid("Reactivation must begin after the previous agreement ended");
     if(!expired&&old.contractEndOn&&input.endOn<=old.contractEndOn.toISOString().slice(0,10))throw invalid("Renewal must extend the agreement end date");
     const data={status:"ACTIVE" as const,currentAgreementStartOn:new Date(input.startOn+"T00:00:00Z"),contractEndOn:new Date(input.endOn+"T00:00:00Z"),agreementEndedOn:null,agreementEndReason:null,monthlyFee:input.monthlyFee,monthlyAdBudget:input.monthlyAdBudget,version:{increment:1}};
     const result=await tx.client.updateMany({where:{id,organizationId:a.organizationId,version:input.version},data});
     if(result.count!==1)throw conflict();
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:expired?"clients.reactivated":"clients.agreement_renewed",entityType:"Client",entityId:id,
       beforeRedacted:{startOn:priorStart??null,endOn:old.contractEndOn?.toISOString().slice(0,10)??null,endedOn:old.agreementEndedOn?.toISOString().slice(0,10)??null,endReason:old.agreementEndReason,monthlyFee:old.monthlyFee?.toFixed(4)??null,monthlyAdBudget:old.monthlyAdBudget?.toFixed(4)??null,status:old.status},
       afterRedacted:{startOn:input.startOn,endOn:input.endOn,monthlyFee:input.monthlyFee,monthlyAdBudget:input.monthlyAdBudget,reason:input.reason,version:input.version+1}}});
     return {id,version:input.version+1,status:"ACTIVE"};
   });
 }
 async saveService(a:Principal,id:string,input:ClientServiceInput){
   deny(a,"clients.edit");await this.existing(a,id);
   return this.db.$transaction(async tx=>{
     const existing=await tx.clientService.findFirst({where:{clientId:id,name:{equals:input.name,mode:"insensitive"}}});
     const data={name:input.name,description:optional(input.description),status:input.status};
     const item=existing?await tx.clientService.update({where:{id:existing.id},data}):await tx.clientService.create({data:{clientId:id,...data}});
     await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:"clients.service_saved",entityType:"Client",entityId:id,afterRedacted:{serviceId:item.id,name:item.name,status:item.status}}});
     return item;
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
 }
 async create(_a:Principal,_input:ClientCreateInput):Promise<never>{
   void _a;void _input;
   throw new AuthError(405,"LEAD_APPROVAL_REQUIRED","Approve a lead to create a client");
 }

 async update(a:Principal,id:string,input:ClientUpdateInput){
   deny(a,"clients.edit");
   await this.existing(a,id);
   const {version,status,...fields}=input;
   if(fields.monthlyFee!==undefined||fields.monthlyAdBudget!==undefined)deny(a,"finance.read.all");
   if(fields.managerId&&!(await this.db.user.findFirst({where:{id:fields.managerId,organizationId:a.organizationId,status:"ACTIVE"},select:{id:true}})))throw invalid("Choose an active account manager from this organization");
   if(!status&&!privateFields.some(key=>fields[key]!==undefined)&&
     !["contractStartOn","contractEndOn","monthlyFee","monthlyAdBudget","health","managerId","onboarding"].some(key=>fields[key as keyof typeof fields]!==undefined))throw invalid("At least one change is required");
   const data:Prisma.ClientUpdateManyMutationInput={version:{increment:1}};
   for(const key of privateFields){
     const value=fields[key];
     if(value!==undefined){
       if(key==="businessName")data.businessName=value.trim();
       else data[key]=optional(value);
     }
   }
   if(status)data.status=status;
   if(fields.health!==undefined)data.health=fields.health;
   if(fields.managerId!==undefined)data.managerId=fields.managerId;
   if(fields.onboarding!==undefined)data.onboarding=[...new Set(fields.onboarding)];
   if(fields.contractStartOn!==undefined)data.contractStartOn=fields.contractStartOn?new Date(fields.contractStartOn+"T00:00:00.000Z"):null;
   if(fields.contractEndOn!==undefined)data.contractEndOn=fields.contractEndOn?new Date(fields.contractEndOn+"T00:00:00.000Z"):null;
   if(fields.monthlyFee!==undefined)data.monthlyFee=fields.monthlyFee||null;
   if(fields.monthlyAdBudget!==undefined)data.monthlyAdBudget=fields.monthlyAdBudget||null;
   const previous=await this.db.client.findUniqueOrThrow({where:{id}});
   if(previous.currentAgreementStartOn&&((fields.monthlyFee!==undefined&&(fields.monthlyFee||null)!==(previous.monthlyFee?.toString()??null)&&(!previous.monthlyFee||!fields.monthlyFee||!previous.monthlyFee.equals(fields.monthlyFee)))||(fields.monthlyAdBudget!==undefined&&(fields.monthlyAdBudget||null)!==(previous.monthlyAdBudget?.toString()??null)&&(!previous.monthlyAdBudget||!fields.monthlyAdBudget||!previous.monthlyAdBudget.equals(fields.monthlyAdBudget)))))throw invalid("Use Renew agreement to change renewed commercial terms");
   if(previous.currentAgreementStartOn&&fields.contractStartOn!==undefined&&fields.contractStartOn!==(previous.contractStartOn?.toISOString().slice(0,10)??""))throw invalid("The original readiness anchor cannot change after renewal");
   if(previous.currentAgreementStartOn&&fields.contractEndOn!==undefined&&fields.contractEndOn!==(previous.contractEndOn?.toISOString().slice(0,10)??""))throw invalid("Use Renew agreement to change a renewed contract period");
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
       afterRedacted:{version:updated.version,status:updated.status,health:updated.health,managerId:updated.managerId,onboarding:updated.onboarding}}});
     return a.permissions.has("finance.read.all")?updated:{...updated,monthlyFee:null,monthlyAdBudget:null};
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
     if((previous.currentAgreementStartOn??previous.contractStartOn)&&endedOn<(previous.currentAgreementStartOn??previous.contractStartOn)!)throw invalid("The end date cannot precede the agreement start");
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
