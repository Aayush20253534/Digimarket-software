import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
import {monthWeeks} from "./readiness-weeks";
export {monthWeeks} from "./readiness-weeks";

const clientMissing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"POST_WEEK_CONFLICT","Post readiness changed. Refresh and retry.");
export type PostWeekInput={
 readyAdded:number;delivered:number;note?:string|null;version:number;
 festivalReadyAdded?:number;festivalDelivered?:number;festivalNote?:string|null;
};
type Movement={month:string;week:number;readyAdded:number;delivered:number;
 festivalReadyAdded:number;festivalDelivered:number};
const ordered=(a:Movement,b:Movement)=>a.month.localeCompare(b.month)||a.week-b.week;

/**
 * Weekly post movements form one client-owned inventory, carried month to
 * month. Editing an old week must not create negative inventory in any future
 * week. SERIALIZABLE transactions, optimistic revisions and a unique composite
 * constraint protect concurrent writes.
 */
export class ClientPostReadinessService{
 constructor(private readonly db:PrismaClient){}
 private async allowed(actor:Principal,clientId:string,edit=false){
  if(!actor.permissions.has(edit?"clients.edit":"clients.read"))throw forbidden();
  const client=await this.db.client.findFirst({
   where:{id:clientId,organizationId:actor.organizationId},
   select:{id:true,businessName:true,contractStartOn:true,contractEndOn:true}
  });
  if(!client)throw clientMissing();
  return client;
 }
 async monthly(actor:Principal,clientId:string,month:string){
  const client=await this.allowed(actor,clientId);
  const entries=await this.db.clientPostWeek.findMany({
   where:{organizationId:actor.organizationId,clientId,month:{lte:month}},
   orderBy:[{month:"asc"},{week:"asc"}],
   select:{id:true,month:true,week:true,readyAdded:true,delivered:true,note:true,
    festivalReadyAdded:true,festivalDelivered:true,festivalNote:true,
    version:true,updatedAt:true,updatedBy:{select:{displayName:true}}}
  });
  const prior=entries.filter(row=>row.month<month);
  const openingStock=prior.reduce((total,row)=>total+row.readyAdded-row.delivered,0);
  const festivalOpeningStock=prior.reduce((total,row)=>total+row.festivalReadyAdded-row.festivalDelivered,0);
  let remaining=openingStock,festivalRemaining=festivalOpeningStock;
  const current=entries.filter(row=>row.month===month);
  const byWeek=new Map(current.map(row=>[row.week,row]));
  const weeks=monthWeeks(month,client.contractStartOn,client.contractEndOn).map(range=>{
   const row=byWeek.get(range.week);
   const availableBefore=remaining,festivalAvailableBefore=festivalRemaining;
   remaining+=row?.readyAdded??0;
   remaining-=row?.delivered??0;
   festivalRemaining+=row?.festivalReadyAdded??0;
   festivalRemaining-=row?.festivalDelivered??0;
   return {
    ...range,readyAdded:row?.readyAdded??0,delivered:row?.delivered??0,
    availableBefore,remainingStock:remaining,version:row?.version??0,
    festivalReadyAdded:row?.festivalReadyAdded??0,festivalDelivered:row?.festivalDelivered??0,
    festivalAvailableBefore,festivalRemainingStock:festivalRemaining,
    festivalNote:row?.festivalNote??"",
    note:row?.note??"",updatedAt:row?.updatedAt?.toISOString()??null,
    updatedBy:row?.updatedBy.displayName??null
   };
  });
  return {clientId,clientName:client.businessName,month,openingStock,
   contractStartOn:client.contractStartOn?.toISOString().slice(0,10)??null,
   contractEndOn:client.contractEndOn?.toISOString().slice(0,10)??null,
   agreementAligned:!!client.contractStartOn,
   readyThisMonth:current.reduce((n,row)=>n+row.readyAdded,0),
   deliveredThisMonth:current.reduce((n,row)=>n+row.delivered,0),
   remainingStock:remaining,
   festivalOpeningStock,
   festivalReadyThisMonth:current.reduce((n,row)=>n+row.festivalReadyAdded,0),
   festivalDeliveredThisMonth:current.reduce((n,row)=>n+row.festivalDelivered,0),
   festivalRemainingStock:festivalRemaining,weeks};
 }
 async saveWeek(actor:Principal,clientId:string,month:string,week:number,input:PostWeekInput){
  const client=await this.allowed(actor,clientId,true);
  if(!monthWeeks(month,client.contractStartOn,client.contractEndOn).some(row=>row.week===week))
   throw new AuthError(422,"INVALID_POST_WEEK","Week is outside the client agreement period for the selected month");
  try{
   return await this.db.$transaction(async tx=>{
    const rows=await tx.clientPostWeek.findMany({
     where:{organizationId:actor.organizationId,clientId},
     orderBy:[{month:"asc"},{week:"asc"}],
     select:{id:true,month:true,week:true,readyAdded:true,delivered:true,version:true,note:true,
      festivalReadyAdded:true,festivalDelivered:true,festivalNote:true}
    });
    const previous=rows.find(row=>row.month===month&&row.week===week);
    if((previous?.version??0)!==input.version)throw conflict();
    // Missing festival fields are left unchanged for older app versions.
    const festivalReadyAdded=input.festivalReadyAdded??previous?.festivalReadyAdded??0;
    const festivalDelivered=input.festivalDelivered??previous?.festivalDelivered??0;
    const festivalNote=input.festivalNote===undefined
     ?previous?.festivalNote??null:input.festivalNote?.trim()||null;
    const movements=[
     ...rows.filter(row=>row.month!==month||row.week!==week),
     {month,week,readyAdded:input.readyAdded,delivered:input.delivered,
      festivalReadyAdded,festivalDelivered}
    ].sort(ordered);
    let available=0,festivalAvailable=0;
    for(const row of movements){
     available+=row.readyAdded-row.delivered;
     festivalAvailable+=row.festivalReadyAdded-row.festivalDelivered;
     if(available<0)throw new AuthError(422,"INSUFFICIENT_POST_STOCK",
      "Delivered posts exceed ready stock, including a later week. Add ready posts first or correct the delivered count.");
     if(festivalAvailable<0)throw new AuthError(422,"INSUFFICIENT_FESTIVAL_POST_STOCK",
      "Delivered festival posts exceed festival-ready stock, including a later week. Add ready festival posts first or correct the delivered count.");
    }
    const note=input.note?.trim()||null;
    const updated=previous
     ?await (async()=>{
       const changed=await tx.clientPostWeek.updateMany({
        where:{id:previous.id,organizationId:actor.organizationId,version:input.version},
        data:{readyAdded:input.readyAdded,delivered:input.delivered,note,
         festivalReadyAdded,festivalDelivered,festivalNote,
         updatedById:actor.userId,version:{increment:1}}
       });
       if(changed.count!==1)throw conflict();
       return tx.clientPostWeek.findUniqueOrThrow({where:{id:previous.id}});
      })()
     :await tx.clientPostWeek.create({data:{
       organizationId:actor.organizationId,clientId,month,week,
       readyAdded:input.readyAdded,delivered:input.delivered,note,
       festivalReadyAdded,festivalDelivered,festivalNote,
       updatedById:actor.userId
      }});
    await tx.auditLog.create({data:{
     organizationId:actor.organizationId,actorId:actor.userId,
     action:"clients.post_readiness_saved",entityType:"Client",entityId:clientId,
     ...(previous?{beforeRedacted:{month,week,readyAdded:previous.readyAdded,
      delivered:previous.delivered,festivalReadyAdded:previous.festivalReadyAdded,
      festivalDelivered:previous.festivalDelivered,version:previous.version}}:{}),
     afterRedacted:{month,week,readyAdded:updated.readyAdded,delivered:updated.delivered,
      festivalReadyAdded:updated.festivalReadyAdded,festivalDelivered:updated.festivalDelivered,
      version:updated.version}
    }});
    return {month,week,version:updated.version,readyAdded:updated.readyAdded,
     delivered:updated.delivered,festivalReadyAdded:updated.festivalReadyAdded,
     festivalDelivered:updated.festivalDelivered};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){
   if(error instanceof AuthError)throw error;
   if(["P2002","P2034"].includes((error as {code?:string}).code??""))throw conflict();
   throw error;
  }
 }
}
