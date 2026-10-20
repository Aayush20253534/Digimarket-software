import { Prisma, type PrismaClient } from "@digimarket/db";
import { nextOccurrence } from "./recurrence";

type Item={position:number;description:string;quantity:string;unitPrice:string;taxRate:string;net:string;tax:string;total:string};
const dateUTC=(d:Date)=>new Date(d.toISOString().slice(0,10)+"T00:00:00.000Z");
export async function sweepBillingSchedules(db:PrismaClient,now=new Date(),limit=100){
 const due=await db.billingSchedule.findMany({where:{enabled:true,nextRunAt:{lte:now}},
  take:Math.min(Math.max(limit,1),200),orderBy:[{nextRunAt:"asc"},{id:"asc"}]});
 let created=0,skipped=0,paused=0;
 for(const s of due){
  try{
   const result=await db.$transaction(async tx=>{
    const current=await tx.billingSchedule.findFirst({where:{
      id:s.id,enabled:true,nextRunAt:s.nextRunAt}});
    if(!current||current.nextRunAt>now)return "skipped";
    const client=await tx.client.findFirst({where:{
      id:current.clientId,organizationId:current.organizationId,status:{not:"ARCHIVED"}}});
    if(!client){
      const update=await tx.billingSchedule.updateMany({where:{id:current.id,nextRunAt:current.nextRunAt,enabled:true},
       data:{enabled:false,version:{increment:1}}});
      if(!update.count)return "skipped";
      await tx.auditLog.create({data:{organizationId:current.organizationId,actorId:null,
       action:"billing.schedule_auto_paused",entityType:"BillingSchedule",entityId:current.id}});
      return "paused";
    }
    const source=current.lines;
    if(!Array.isArray(source)||source.length===0)throw new Error("Invalid billing schedule lines");
    const lines=source as Item[];
    const subtotal=lines.reduce((v,x)=>v.plus(x.net),new Decimal(0));
    const taxTotal=lines.reduce((v,x)=>v.plus(x.tax),new Decimal(0));
    const total=subtotal.plus(taxTotal);
    if(!total.isFinite()||total.lte(0))throw new Error("Invalid recurring invoice total");
    const period=current.frequency==="MONTHLY"?1:current.frequency==="QUARTERLY"?3:12;
    const next=nextOccurrence({frequency:"MONTHLY",interval:period,timezone:"UTC",
      anchorAt:current.anchorAt},current.nextRunAt);
    const reserved=await tx.billingSchedule.updateMany({where:{
      id:current.id,enabled:true,nextRunAt:current.nextRunAt},
      data:{nextRunAt:next,version:{increment:1}}});
    if(reserved.count!==1)return "skipped";
    const dueOn=dateUTC(new Date(current.nextRunAt.getTime()+current.dueAfterDays*86400000));
    const invoice=await tx.invoice.create({data:{
      organizationId:current.organizationId,clientId:current.clientId,createdById:current.createdById,
      scheduleId:current.id,scheduledFor:current.nextRunAt,
      sellerName:current.sellerName,sellerAddress:current.sellerAddress,sellerTaxId:current.sellerTaxId,
      buyerName:current.buyerName,buyerAddress:current.buyerAddress,notes:current.notes,
      dueOn,subtotal:subtotal.toFixed(4),taxTotal:taxTotal.toFixed(4),total:total.toFixed(4),
      lines:{create:lines.map(({position,description,quantity,unitPrice,taxRate,net,tax,total})=>({
        position,description,quantity,unitPrice,taxRate,net,tax,total}))},
    }});
    await tx.auditLog.create({data:{organizationId:current.organizationId,actorId:null,
      action:"billing.draft_generated",entityType:"Invoice",entityId:invoice.id}});
    await tx.outboxEvent.create({data:{organizationId:current.organizationId,
      eventKey:"billing.draft."+current.id+"."+current.nextRunAt.toISOString(),
      kind:"billing.draft_generated",aggregateType:"Invoice",aggregateId:invoice.id,
      payloadMinimal:{invoiceId:invoice.id,scheduleId:current.id}}});
    return "created";
   },{isolationLevel:"Serializable",timeout:15000});
   if(result==="created")created++;else if(result==="paused")paused++;else skipped++;
  }catch(error){
   if((error as {code?:string}).code==="P2034"||(error as {code?:string}).code==="P2002"){skipped++;continue;}
   throw error;
  }
 }
 return {created,skipped,paused};
}
// Imported separately to keep worker program independent of the API's auth/runtime environment.
const Decimal=Prisma.Decimal;
