import {businessCycle,agencyToday} from "@digimarket/contracts";
import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {AuthError,forbidden} from "../auth/errors";
import {monthWeeks,clientReadinessPlan,datedStoredWeek,compareStoredWeeks,shiftMonth,type StoredWeek} from "./readiness-weeks";
export {monthWeeks} from "./readiness-weeks";

const clientMissing=()=>new AuthError(404,"NOT_FOUND","Client not found");
const conflict=()=>new AuthError(409,"VIDEO_WEEK_CONFLICT","Video readiness changed. Refresh and retry.");
export const videoCycleSelect={id:true,month:true,week:true,periodFrom:true,periodTo:true,readyAdded:true,delivered:true,note:true,version:true,updatedAt:true,updatedBy:{select:{displayName:true}}} as const;
export type VideoCycleRow=Prisma.ClientVideoWeekGetPayload<{select:typeof videoCycleSelect}>;
export type VideoWeekInput={readyAdded:number;delivered:number;note?:string|null;version:number};

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
   select:{id:true,businessName:true,contractStartOn:true,contractEndOn:true,agreementEndedOn:true,currentAgreementStartOn:true}
  });
  if(!client)throw clientMissing();
  return client;
 }
 async monthly(actor:Principal,clientId:string,month:string){
  const client=await this.allowed(actor,clientId);
  const entries=await this.db.clientVideoWeek.findMany({
   where:{organizationId:actor.organizationId,clientId,month:{lte:month}},
   orderBy:[{month:"asc"},{week:"asc"}],
   select:{id:true,month:true,week:true,periodFrom:true,periodTo:true,readyAdded:true,delivered:true,note:true,
    version:true,updatedAt:true,updatedBy:{select:{displayName:true}}}
  });
  if(entries.some(row=>row.week>5)){
   const current=await this.clientCycle(actor,clientId,month);
   const previous=await this.clientCycle(actor,clientId,shiftMonth(month,-1));
   const prior=entries.filter(row=>datedStoredWeek(row,client).from<month+"-01");
   const openingStock=prior.reduce((n,r)=>n+r.readyAdded-r.delivered,0);
   
   const weeks=[...previous.weeks,...current.weeks].filter(w=>w.from.startsWith(month+"-")).map((w,i)=>({...w,week:i+1}));
   const readyThisMonth=weeks.reduce((n,w)=>n+w.readyAdded,0),deliveredThisMonth=weeks.reduce((n,w)=>n+w.delivered,0);
   
   return {...current,month,from:month+"-01",to:new Date(Date.parse(shiftMonth(month,1)+"-01T00:00:00Z")-86400000).toISOString().slice(0,10),weeks,openingStock,readyThisMonth,deliveredThisMonth,remainingStock:openingStock+readyThisMonth-deliveredThisMonth,
    
   };
  }
  const prior=entries.filter(row=>row.month<month);
  const openingStock=prior.reduce((total,row)=>total+row.readyAdded-row.delivered,0);
  let remaining=openingStock;
  const current=entries.filter(row=>row.month===month);
  const byWeek=new Map(current.map(row=>[row.week,row]));
  const weeks=monthWeeks(month,client.contractStartOn,client.contractEndOn).map(range=>{
   const row=byWeek.get(range.week);
   const availableBefore=remaining;
   remaining+=row?.readyAdded??0;
   remaining-=row?.delivered??0;
   return {
    ...range,storageMonth:month,storageWeek:range.week,legacy:true,readyAdded:row?.readyAdded??0,delivered:row?.delivered??0,
    availableBefore,remainingStock:remaining,version:row?.version??0,
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
   remainingStock:remaining,weeks};
 }
 // Re-group existing contract weeks for the agency cycle without changing
 // their persisted (month, week) identity or historical stock movements.
 async cycle(actor:Principal,clientId:string,month:string){
  const cycle=businessCycle(month+"-22"),next=cycle.endExclusive.slice(0,7);
  const first=await this.monthly(actor,clientId,month);
  const second=await this.monthly(actor,clientId,next);
  const all=[first,second].flatMap(data=>data.weeks.map(week=>({...week,
   storageMonth:week.storageMonth,storageWeek:week.storageWeek})));
  const weeks=all.filter(week=>week.from>=cycle.from&&week.from<cycle.endExclusive)
   .map((week,index)=>({...week,week:index+1}));
  const prior=all.filter(week=>week.from<cycle.from).at(-1);
  const openingStock=weeks[0]?.availableBefore??prior?.remainingStock??first.openingStock;
  return {...first,from:cycle.from,to:cycle.to,openingStock,weeks,
   readyThisMonth:weeks.reduce((sum,week)=>sum+week.readyAdded,0),
   deliveredThisMonth:weeks.reduce((sum,week)=>sum+week.delivered,0),
   remainingStock:weeks.at(-1)?.remainingStock??openingStock,
  };
 }
 async clientCycle(actor:Principal,clientId:string,month?:string,today=agencyToday()){
  const client=await this.allowed(actor,clientId);
  const where={organizationId:actor.organizationId,clientId,month:{lte:"9999-12"}};
  const [entries,other]=await Promise.all([
   this.db.clientVideoWeek.findMany({where,select:videoCycleSelect}),
   this.db.clientPostWeek.findMany({where,select:{month:true,week:true,periodFrom:true,periodTo:true}})
  ]);
  return this.calculateClientCycle(client,entries,other,month,today);
 }
 /** Pure calculation shared by single-client and batched reads; no storage writes. */
 calculateClientCycle(client:Awaited<ReturnType<ClientVideoReadinessService["allowed"]>>,entries:VideoCycleRow[],other:StoredWeek[],month:string|undefined,today:string){
  const clientId=client.id;
  const plan=clientReadinessPlan(client,[...entries,...other],month,today);
  const before=entries.filter(row=>!plan.from||datedStoredWeek(row,client).from<plan.from);
  const openingStock=before.reduce((n,r)=>n+r.readyAdded-r.delivered,0);
  let remaining=openingStock;
  
  const weeks=plan.weeks.map((range,index)=>{
   const row=entries.find(r=>r.month===range.storageMonth&&r.week===range.storageWeek);
   const availableBefore=remaining;remaining+=(row?.readyAdded??0)-(row?.delivered??0);
   
   return {...range,week:index+1,readyAdded:row?.readyAdded??0,delivered:row?.delivered??0,availableBefore,remainingStock:remaining,
    
    version:row?.version??0,note:row?.note??"",updatedAt:row?.updatedAt?.toISOString()??null,updatedBy:row?.updatedBy.displayName??null};
  });
  return {clientId,clientName:client.businessName,month:plan.month,from:plan.from,to:plan.to,legacyThrough:plan.legacyThrough,agreementAligned:plan.agreementAligned,
   contractStartOn:client.contractStartOn?.toISOString().slice(0,10)??null,contractEndOn:(client.agreementEndedOn??client.contractEndOn)?.toISOString().slice(0,10)??null,
   openingStock,readyThisMonth:weeks.reduce((n,w)=>n+w.readyAdded,0),deliveredThisMonth:weeks.reduce((n,w)=>n+w.delivered,0),remainingStock:remaining,weeks,
   totalStock:entries.reduce((n,r)=>n+r.readyAdded-r.delivered,0),
   
  };
 }
 async saveWeek(actor:Principal,clientId:string,month:string,week:number,input:VideoWeekInput,clientMode=false){
  await this.allowed(actor,clientId,true);
  try{
   return await this.db.$transaction(async tx=>{
    const client=await tx.client.findFirstOrThrow({where:{id:clientId,organizationId:actor.organizationId},select:{contractStartOn:true,contractEndOn:true,agreementEndedOn:true,currentAgreementStartOn:true}});
    const rows=await tx.clientVideoWeek.findMany({
     where:{organizationId:actor.organizationId,clientId},
     orderBy:[{month:"asc"},{week:"asc"}],
     select:{id:true,month:true,week:true,periodFrom:true,periodTo:true,readyAdded:true,delivered:true,version:true,note:true}
    });
    const previous=rows.find(row=>row.month===month&&row.week===week);
    if((previous?.version??0)!==input.version)throw conflict();
    const sibling=await tx.clientPostWeek.findMany({where:{organizationId:actor.organizationId,clientId},select:{month:true,week:true,periodFrom:true,periodTo:true}});
    const all=[...rows,...sibling];
    const existing=all.find(r=>r.month===month&&r.week===week);
    let slot=existing?datedStoredWeek(existing,client):null;
    if(!slot&&clientMode){
      // Storage keys are actual start month/day, not the display week number.
      for(const candidate of [month,shiftMonth(month,-1)]){
        const plan=clientReadinessPlan(client,all,candidate,agencyToday());
        slot=plan.weeks.find(w=>w.storageMonth===month&&w.storageWeek===week)??null;if(slot)break;
      }
    }else if(!slot&&!clientMode&&week<=5&&!all.some(r=>r.week>5)){
      const legacy=monthWeeks(month,client.contractStartOn,client.contractEndOn).find(r=>r.week===week);
      if(legacy)slot={storageMonth:month,storageWeek:week,from:legacy.from,to:legacy.to,legacy:true};
    }
    if(!slot||(!clientMode&&week>5))throw new AuthError(422,"INVALID_VIDEO_WEEK","Week is outside the client agreement schedule. Refresh the client cycle.");
    const dates={periodFrom:new Date(slot.from+"T00:00:00Z"),periodTo:new Date(slot.to+"T00:00:00Z")};
    const movements=[
     ...rows.filter(row=>row.month!==month||row.week!==week),
     {month,week,...dates,readyAdded:input.readyAdded,delivered:input.delivered}
    ].sort((a,b)=>compareStoredWeeks(a,b,client));
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
        data:{...dates,readyAdded:input.readyAdded,delivered:input.delivered,note,
         updatedById:actor.userId,version:{increment:1}}
       });
       if(changed.count!==1)throw conflict();
       return tx.clientVideoWeek.findUniqueOrThrow({where:{id:previous.id}});
      })()
     :await tx.clientVideoWeek.create({data:{
       organizationId:actor.organizationId,clientId,month,week,...dates,
       readyAdded:input.readyAdded,delivered:input.delivered,note,
       updatedById:actor.userId
      }});
    await tx.auditLog.create({data:{
     organizationId:actor.organizationId,actorId:actor.userId,
     action:"clients.video_readiness_saved",entityType:"Client",entityId:clientId,
     ...(previous?{beforeRedacted:{month,week,readyAdded:previous.readyAdded,
      delivered:previous.delivered,version:previous.version}}:{}),
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
