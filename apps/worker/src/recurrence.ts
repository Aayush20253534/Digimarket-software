import type { PrismaClient } from "@digimarket/db";
import {sendTaskPush} from "../../api/src/insights/push";

type Rule={frequency:"DAILY"|"WEEKLY"|"MONTHLY";interval:number;timezone:string;anchorAt:Date};
type Civil={year:number;month:number;day:number;hour:number;minute:number};
const formatterCache=new Map<string,Intl.DateTimeFormat>();
function local(t:Date,timezone:string):Civil {
 let fmt=formatterCache.get(timezone);
 if(!fmt){fmt=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,hourCycle:"h23",
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"});
    formatterCache.set(timezone,fmt);}
 const d=Object.fromEntries(fmt.formatToParts(t).filter(x=>x.type!=="literal").map(x=>[x.type,Number(x.value)]));
 return {year:d.year,month:d.month,day:d.day,hour:d.hour,minute:d.minute};
}
const naive=(x:Civil)=>Date.UTC(x.year,x.month-1,x.day,x.hour,x.minute);
const same=(a:Civil,b:Civil)=>naive(a)===naive(b);
function instant(x:Civil,tz:string):Date {
 const epoch=naive(x), offsets=new Set<number>();
 for(const shift of [-36,-12,0,12,36]){
   const ms=epoch+shift*3600000;
   offsets.add((naive(local(new Date(ms),tz))-ms)/60000);
 }
 const candidates=[...offsets].map(off=>new Date(epoch-off*60000));
 const exact=candidates.filter(d=>same(local(d,tz),x)).sort((a,b)=>+a-(+b));
 if(exact.length)return exact[0];
 // Spring DST gap: choose nearest later valid wall time, never run before requested local time.
 const later=candidates.filter(d=>naive(local(d,tz))>=epoch).sort((a,b)=>
   naive(local(a,tz))-naive(local(b,tz)));
 if(later.length)return later[0];
 throw new Error("Cannot resolve recurrence local time");
}
export function nextOccurrence(rule:Rule,after:Date):Date {
 const p=local(after,rule.timezone),anchor=local(rule.anchorAt,rule.timezone);
 let next:Civil;
 if(rule.frequency==="MONTHLY"){
   const first=new Date(Date.UTC(p.year,p.month-1+rule.interval,1));
   const last=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
   next={year:first.getUTCFullYear(),month:first.getUTCMonth()+1,
      day:Math.min(anchor.day,last),hour:anchor.hour,minute:anchor.minute};
 }else{
   const days=rule.frequency==="DAILY"?rule.interval:rule.interval*7;
   const u=new Date(Date.UTC(p.year,p.month-1,p.day+days));
   next={year:u.getUTCFullYear(),month:u.getUTCMonth()+1,day:u.getUTCDate(),
     hour:anchor.hour,minute:anchor.minute};
 }
 const nextAt=instant(next,rule.timezone);
 if(nextAt<=after)throw new Error("Recurrence must advance strictly forward");
 return nextAt;
}

// Redis may replay jobs, and multiple workers can run concurrently.
// A database compare-and-swap cursor AND unique (recurrenceId, scheduledFor) guarantee uniqueness.
export async function sweepRecurrences(db:PrismaClient,now=new Date(),limit=100){
 const due=await db.taskRecurrence.findMany({where:{enabled:true,nextRunAt:{lte:now}},
   take:Math.min(Math.max(1,limit),200),orderBy:[{nextRunAt:"asc"},{id:"asc"}]});
 let created=0,skipped=0,disabled=0;
 for(const entry of due){
   const result=await db.$transaction(async tx=>{
     const current=await tx.taskRecurrence.findFirst({where:{
       id:entry.id,enabled:true,nextRunAt:entry.nextRunAt}});
     if(!current||current.nextRunAt>now)return "skip" as const;
     const [staff,project]=await Promise.all([
       tx.user.count({where:{id:{in:current.assigneeIds},organizationId:current.organizationId,status:"ACTIVE"}}),
       current.projectId?tx.project.findFirst({where:{id:current.projectId,organizationId:current.organizationId},
         select:{status:true,members:{select:{userId:true}},createdById:true}}):Promise.resolve(null),
     ]);
     const members=project?new Set([project.createdById,...project.members.map(m=>m.userId)]):null;
     if(staff!==current.assigneeIds.length ||
         (current.projectId&&(!project||project.status==="ARCHIVED"||project.status==="COMPLETED"||
            current.assigneeIds.some(id=>!members?.has(id))))){
       const changed=await tx.taskRecurrence.updateMany({where:{
         id:current.id,enabled:true,nextRunAt:current.nextRunAt},
         data:{enabled:false,version:{increment:1}}});
       if(!changed.count)return "skip" as const;
       await tx.auditLog.create({data:{organizationId:current.organizationId,actorId:null,
         action:"tasks.recurrence_auto_paused",entityType:"TaskRecurrence",entityId:current.id}});
       return "disabled" as const;
     }
     const nextAt=nextOccurrence(current,current.nextRunAt);
     const moved=await tx.taskRecurrence.updateMany({where:{
       id:current.id,enabled:true,nextRunAt:current.nextRunAt},
       data:{nextRunAt:nextAt,version:{increment:1}}});
     if(moved.count!==1)return "skip" as const;
     const task=await tx.task.create({data:{
       organizationId:current.organizationId,projectId:current.projectId,createdById:current.createdById,
       recurrenceId:current.id,scheduledFor:current.nextRunAt,title:current.title,
       description:current.description,priority:current.priority,
       dueAt:new Date(current.nextRunAt.getTime()+current.dueOffsetDays*86400000),
       assignees:{create:current.assigneeIds.map(userId=>({userId}))},
     }});
     await tx.auditLog.create({data:{organizationId:current.organizationId,actorId:null,
       action:"tasks.recurrence_generated",entityType:"Task",entityId:task.id,
       afterRedacted:{recurrenceId:current.id}}});
     if(current.assigneeIds.length)await tx.notification.createMany({data:current.assigneeIds.map(recipientId=>({
       organizationId:current.organizationId,recipientId,
       dedupeKey:"task.assigned:"+task.id,kind:"TASK_ASSIGNED",
       title:"New recurring task assigned",body:"You have been assigned: "+task.title.slice(0,250),
       href:"/app/tasks?task="+task.id,
     })),skipDuplicates:true});
     await tx.outboxEvent.create({data:{
       organizationId:current.organizationId,eventKey:"task.recurrence."+current.id+"."+current.nextRunAt.toISOString(),
       kind:"tasks.recurrence_generated",aggregateType:"Task",aggregateId:task.id,
       payloadMinimal:{taskId:task.id,recurrenceId:current.id},
     }});
     return {kind:"created" as const,taskId:task.id,assignees:current.assigneeIds,organizationId:current.organizationId};
   });
   if(typeof result==="object"&&result.kind==="created"){
     created++;
     await sendTaskPush(db,result.organizationId,result.assignees);
   }
   else if(result==="disabled")disabled++;
   else skipped++;
 }
 return {created,skipped,disabled};
}
