import type { PrismaClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import type { ServiceDeliveryPlanInput,ServiceDeliveryPlanUpdateInput,
  ServiceDeliveryOccurrenceUpdateInput } from "@digimarket/contracts";

const missing=()=>new AuthError(404,"NOT_FOUND","Delivery schedule not found");
const collision=()=>new AuthError(409,"VERSION_CONFLICT","Delivery changed; reload first");
const manage=(a:Principal)=>a.roles.some(role=>["SUPER_ADMIN","ADMIN","FOUNDER"].includes(role))&&a.permissions.has("clients.edit");
const date=(s:string)=>new Date(s+"T00:00:00.000Z");
const onlyDate=(value:Date)=>value.toISOString().slice(0,10);
export function datesInRange(start:string,end:string,weekdays:number[]){
 const results:string[]=[],selected=new Set(weekdays);
 for(let time=date(start).getTime(),last=date(end).getTime();time<=last;time+=86_400_000){
   const current=new Date(time);if(selected.has(current.getUTCDay()))results.push(onlyDate(current));
 }
 return results;
}
const todayInZone=(zone:string)=>{
 const formatter=new Intl.DateTimeFormat("en-GB",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"});
 const parts=formatter.formatToParts(new Date());
 const part=(type:string)=>parts.find(p=>p.type===type)?.value??"";
 return part("year")+"-"+part("month")+"-"+part("day");
};
export class ServiceDeliveryService {
 constructor(private readonly db:PrismaClient){}
 private requireManager(a:Principal){
  if(!manage(a))throw forbidden();
 }
 private async client(a:Principal,id:string){
  if(!a.permissions.has("clients.read"))throw forbidden();
  const c=await this.db.client.findFirst({where:{id,organizationId:a.organizationId,status:{not:"ARCHIVED"}}});
  if(!c)throw missing();
  return c;
 }
 private async validate(a:Principal,input:{clientId:string;serviceId?:string|null;assigneeId:string;startOn:string;endOn:string;weekdays:number[]}){
  const client=await this.client(a,input.clientId);
  if(client.status!=="ACTIVE")throw invalid("Client must be active to schedule deliveries");
  if((date(input.endOn).getTime()-date(input.startOn).getTime())/86_400_000>366)
    throw invalid("A service delivery schedule may span at most 367 dates");
  if(!datesInRange(input.startOn,input.endOn,input.weekdays).length)
    throw invalid("Choose at least one weekday within the selected dates");
  const assignee=await this.db.user.findFirst({where:{id:input.assigneeId,organizationId:a.organizationId,status:"ACTIVE"},select:{id:true}});
  if(!assignee)throw invalid("Choose an active employee in your organization");
  if(input.serviceId){
   const service=await this.db.clientService.findFirst({where:{id:input.serviceId,clientId:client.id,status:"ACTIVE"},select:{id:true}});
   if(!service)throw invalid("Service must belong to this client and be active");
  }
 }
 async list(a:Principal,input:{clientId?:string;mine?:"true"|"false"}){
  if(!a.permissions.has("clients.read"))throw forbidden();
  const mine=!manage(a)||input.mine==="true";
  const schedules=await this.db.serviceDeliverySchedule.findMany({where:{
   organizationId:a.organizationId,
   ...(input.clientId?{clientId:input.clientId}:{}),
   ...(mine?{assigneeId:a.userId}:{}),
  },orderBy:[{createdAt:"desc"},{id:"desc"}],take:150,
   include:{client:{select:{id:true,businessName:true}},service:{select:{id:true,name:true}},
    assignee:{select:{id:true,displayName:true}},occurrences:{orderBy:{scheduledOn:"asc"},
      include:{completedBy:{select:{displayName:true}}}}}});
  return {items:schedules};
 }
 async create(a:Principal,input:ServiceDeliveryPlanInput){
  this.requireManager(a);
  await this.validate(a,input);
  const dates=datesInRange(input.startOn,input.endOn,input.weekdays);
  return this.db.$transaction(async tx=>{
   const record=await tx.serviceDeliverySchedule.create({data:{
    organizationId:a.organizationId,clientId:input.clientId,serviceId:input.serviceId??null,
    title:input.title,assigneeId:input.assigneeId,createdById:a.userId,
    startOn:date(input.startOn),endOn:date(input.endOn),weekdays:input.weekdays,
    occurrences:{create:dates.map(scheduledOn=>({scheduledOn:date(scheduledOn)}))},
   }});
   await tx.notification.create({data:{organizationId:a.organizationId,recipientId:input.assigneeId,
    dedupeKey:"service-delivery.assigned:"+record.id,kind:"DELIVERY_ASSIGNED",title:"New client delivery schedule",
    body:input.title.slice(0,180),href:"/app/deliveries"}});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"deliveries.schedule_created",entityType:"ServiceDeliverySchedule",entityId:record.id,
    afterRedacted:{occurrences:dates.length,assigneeId:input.assigneeId}}});
   return record;
  });
 }
 async update(a:Principal,id:string,input:ServiceDeliveryPlanUpdateInput){
  this.requireManager(a);
  const existing=await this.db.serviceDeliverySchedule.findFirst({where:{id,organizationId:a.organizationId}});
  if(!existing)throw missing();
  await this.validate(a,{...input,clientId:existing.clientId});
  const today=todayInZone("Asia/Kolkata");
  const next=datesInRange(input.startOn,input.endOn,input.weekdays).filter(x=>x>=today);
  return this.db.$transaction(async tx=>{
   const updated=await tx.serviceDeliverySchedule.updateMany({where:{id,organizationId:a.organizationId,version:input.version},data:{
    serviceId:input.serviceId??null,title:input.title,assigneeId:input.assigneeId,
    startOn:date(input.startOn),endOn:date(input.endOn),weekdays:input.weekdays,
    active:input.active,version:{increment:1},
   }});
   if(updated.count!==1)throw collision();
   // Past occurrences and all completed dates remain in the audit history.
   await tx.serviceDeliveryOccurrence.deleteMany({where:{scheduleId:id,status:"PENDING",scheduledOn:{gte:date(today)}}});
   await tx.serviceDeliveryOccurrence.createMany({data:next.map(scheduledOn=>({scheduleId:id,scheduledOn:date(scheduledOn)})),skipDuplicates:true});
   if(existing.assigneeId!==input.assigneeId)await tx.notification.create({data:{
    organizationId:a.organizationId,recipientId:input.assigneeId,
    dedupeKey:"service-delivery.reassigned:"+id+":"+input.version,kind:"DELIVERY_ASSIGNED",
    title:"Client delivery reassigned",body:input.title.slice(0,180),href:"/app/deliveries",
   }});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"deliveries.schedule_updated",entityType:"ServiceDeliverySchedule",entityId:id,
    afterRedacted:{assigneeId:input.assigneeId,active:input.active}}});
   return tx.serviceDeliverySchedule.findUniqueOrThrow({where:{id}});
  });
 }
 async complete(a:Principal,id:string,occurrenceId:string,input:ServiceDeliveryOccurrenceUpdateInput){
  if(!a.permissions.has("clients.read"))throw forbidden();
  const schedule=await this.db.serviceDeliverySchedule.findFirst({
   where:{id,organizationId:a.organizationId},include:{organization:{select:{timezone:true}}}});
  if(!schedule)throw missing();
  const isManager=manage(a);
  if(!isManager&&schedule.assigneeId!==a.userId)throw forbidden();
  if(!schedule.active&&!isManager)throw invalid("This delivery schedule is paused");
  const occurrence=await this.db.serviceDeliveryOccurrence.findFirst({where:{id:occurrenceId,scheduleId:id}});
  if(!occurrence)throw missing();
  const due=onlyDate(occurrence.scheduledOn);
  if(input.completed&&due>todayInZone(schedule.organization.timezone))throw invalid("Future deliveries cannot be completed");
  return this.db.$transaction(async tx=>{
   const changed=await tx.serviceDeliveryOccurrence.updateMany({
    where:{id:occurrenceId,scheduleId:id,version:input.version},data:{
     status:input.completed?"COMPLETED":"PENDING",completedAt:input.completed?new Date():null,
     completedById:input.completed?a.userId:null,version:{increment:1},
   }});
   if(changed.count!==1)throw collision();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:input.completed?"deliveries.occurrence_completed":"deliveries.occurrence_reopened",
    entityType:"ServiceDeliveryOccurrence",entityId:occurrenceId,afterRedacted:{scheduleId:id,date:due}}});
   return tx.serviceDeliveryOccurrence.findUniqueOrThrow({where:{id:occurrenceId}});
  });
 }
}
