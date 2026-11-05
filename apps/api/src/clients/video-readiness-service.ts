import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";

const clientMissing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"VIDEO_WEEK_CONFLICT","Video readiness changed. Refresh and retry.");
export const monthWeeks=(month:string)=>{
 const [year,monthNumber]=month.split("-").map(Number);
 const days=new Date(Date.UTC(year,monthNumber,0)).getUTCDate();
 return Array.from({length:Math.ceil(days/7)},(_,i)=>({
  week:i+1,from:i*7+1,to:Math.min((i+1)*7,days),
 }));
};
export type VideoWeekInput={readyAdded:number;delivered:number;note?:string|null;version:number};
type Movement={month:string;week:number;readyAdded:number;delivered:number};
const ordered=(a:Movement,b:Movement)=>a.month.localeCompare(b.month)||a.week-b.week;

/**
 * Weekly video movements form one client-owned inventory, carried month to
 * month. Editing an old week must not create negative inventory in any future
 * week. SERIALIZABLE transactions, optimistic revisions and a unique composite
 * constraint protect concurrent writes.
 */
export class ClientVideoReadinessService{
 constructor(private readonly db:PrismaClient){}
 private async allowed(actor:Principal,clientId:string,edit=false){
  if(!actor.permissions.has(edit?"clients.edit":"clients.read"))throw forbidden();
  const client=await this.db.client.findFirst({
   where:{id:clientId,organizationId:actor.organizationId},
   select:{id:true,businessName:true}
  });
  if(!client)throw clientMissing();
  return client;
 }
 async monthly(actor:Principal,clientId:string,month:string){
  const client=await this.allowed(actor,clientId);
  const entries=await this.db.clientVideoWeek.findMany({
   where:{organizationId:actor.organizationId,clientId,month:{lte:month}},
   orderBy:[{month:"asc"},{week:"asc"}],
   select:{id:true,month:true,week:true,readyAdded:true,delivered:true,note:true,
    version:true,updatedAt:true,updatedBy:{select:{displayName:true}}}
  });
  const prior=entries.filter(row=>row.month<month);
  const openingStock=prior.reduce((total,row)=>total+row.readyAdded-row.delivered,0);
  let remaining=openingStock;
  const current=entries.filter(row=>row.month===month);
  const byWeek=new Map(current.map(row=>[row.week,row]));
  const weeks=monthWeeks(month).map(range=>{
   const row=byWeek.get(range.week);
   const availableBefore=remaining;
   remaining+=row?.readyAdded??0;
   remaining-=row?.delivered??0;
   return {
    ...range,readyAdded:row?.readyAdded??0,delivered:row?.delivered??0,
    availableBefore,remainingStock:remaining,version:row?.version??0,
    note:row?.note??"",updatedAt:row?.updatedAt?.toISOString()??null,
    updatedBy:row?.updatedBy.displayName??null
   };
  });
  return {clientId,clientName:client.businessName,month,openingStock,
   readyThisMonth:current.reduce((n,row)=>n+row.readyAdded,0),
   deliveredThisMonth:current.reduce((n,row)=>n+row.delivered,0),
   remainingStock:remaining,weeks};
 }
 async saveWeek(actor:Principal,clientId:string,month:string,week:number,input:VideoWeekInput){
  await this.allowed(actor,clientId,true);
  if(!monthWeeks(month).some(row=>row.week===week))
   throw new AuthError(422,"INVALID_VIDEO_WEEK","Week is outside the selected month");
  try{
   return await this.db.$transaction(async tx=>{
    const rows=await tx.clientVideoWeek.findMany({
     where:{organizationId:actor.organizationId,clientId},
     orderBy:[{month:"asc"},{week:"asc"}],
     select:{id:true,month:true,week:true,readyAdded:true,delivered:true,version:true,note:true}
    });
    const previous=rows.find(row=>row.month===month&&row.week===week);
    if((previous?.version??0)!==input.version)throw conflict();
    const movements=[
     ...rows.filter(row=>row.month!==month||row.week!==week),
     {month,week,readyAdded:input.readyAdded,delivered:input.delivered}
    ].sort(ordered);
    let available=0;
    for(const row of movements){
     available+=row.readyAdded-row.delivered;
     if(available<0)throw new AuthError(422,"INSUFFICIENT_VIDEO_STOCK",
      "Delivered videos exceed ready stock, including a later week. Add ready videos first or correct the delivered count.");
    }
    const note=input.note?.trim()||null;
    const updated=previous
     ?await (async()=>{
       const changed=await tx.clientVideoWeek.updateMany({
        where:{id:previous.id,organizationId:actor.organizationId,version:input.version},
        data:{readyAdded:input.readyAdded,delivered:input.delivered,note,
         updatedById:actor.userId,version:{increment:1}}
       });
       if(changed.count!==1)throw conflict();
       return tx.clientVideoWeek.findUniqueOrThrow({where:{id:previous.id}});
      })()
     :await tx.clientVideoWeek.create({data:{
       organizationId:actor.organizationId,clientId,month,week,
       readyAdded:input.readyAdded,delivered:input.delivered,note,
       updatedById:actor.userId
      }});
    await tx.auditLog.create({data:{
     organizationId:actor.organizationId,actorId:actor.userId,
     action:"clients.video_readiness_saved",entityType:"Client",entityId:clientId,
     beforeRedacted:previous?{month,week,readyAdded:previous.readyAdded,
      delivered:previous.delivered,version:previous.version}:null,
     afterRedacted:{month,week,readyAdded:updated.readyAdded,delivered:updated.delivered,version:updated.version}
    }});
    return {month,week,version:updated.version,readyAdded:updated.readyAdded,
     delivered:updated.delivered};
   },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
  }catch(error){
   if(error instanceof AuthError)throw error;
   if(["P2002","P2034"].includes((error as {code?:string}).code??""))throw conflict();
   throw error;
  }
 }
}
