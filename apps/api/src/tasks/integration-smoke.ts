import "dotenv/config";
import assert from "node:assert/strict";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {TasksService} from "./service";
import {nextOccurrence,sweepRecurrences} from "../../../worker/src/recurrence";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 11 requires disposable digimarket_ci PostgreSQL");
const db=createDatabaseClient(),tasks=new TasksService(db);
const actor=(id:string,org:string,permissions:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles:["ADMIN"],permissions:new Set(permissions),
});
const perms=["tasks.create","tasks.read","tasks.manage","tasks.recurrence.manage",
 "tasks.update.own","tasks.comment","projects.read","projects.assign"];
const failed=(n:number)=>(e:{status?:number})=>e.status===n;
try{
 const org=await db.organization.create({data:{name:"Task integration A"}});
 const outside=await db.organization.create({data:{name:"Task integration B"}});
 const [admin,staff,other,foreign]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"tasks-admin",displayName:"Manager",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"tasks-staff",displayName:"Staff",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"tasks-bystander",displayName:"Other",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:outside.id,loginId:"tasks-outsider",displayName:"Elsewhere",status:"ACTIVE"}}),
 ]);
 const mgr=actor(admin.id,org.id,perms);
 const founder=actor(other.id,org.id,perms);
 founder.roles=["FOUNDER"];
 const limitedFounder=actor(other.id,org.id,["tasks.read"]);
 limitedFounder.roles=["FOUNDER"];
 await assert.rejects(()=>tasks.create(limitedFounder,{title:"Unauthorized creation",priority:"LOW",
   assigneeIds:[staff.id]}),failed(403));
 await assert.rejects(()=>tasks.createRecurrence(limitedFounder,{
   title:"Unauthorized recurring work",priority:"MEDIUM",frequency:"DAILY",interval:1,
   timezone:"UTC",startAt:new Date().toISOString(),dueOffsetDays:0,assigneeIds:[staff.id]
 }),failed(403));

 const staffActor=actor(staff.id,org.id,["tasks.read","tasks.update.own","tasks.comment"]);
 const readOnly=actor(other.id,org.id,["tasks.read","tasks.update.own","tasks.comment"]);
 const stranger=actor(foreign.id,outside.id,perms);
 const client=await db.client.create({data:{organizationId:org.id,createdById:admin.id,businessName:"Cafe"}});
 const clientService=await db.clientService.create({data:{clientId:client.id,name:"Social media reels",monthlyTarget:8}});
 const project=await db.project.create({data:{organizationId:org.id,clientId:client.id,
   createdById:admin.id,name:"Website",
   members:{create:[{userId:admin.id,role:"MANAGER"},{userId:staff.id,role:"CONTRIBUTOR"}]}}});
 await assert.rejects(()=>tasks.create(mgr,{title:"Wrong org",priority:"MEDIUM",assigneeIds:[foreign.id]}),failed(422));
 await assert.rejects(()=>tasks.create(mgr,{title:"Wrong project assignee",priority:"MEDIUM",
   projectId:project.id,assigneeIds:[other.id]}),failed(422));
 const deadline=new Date(Date.now()+86400000).toISOString();
 const founderTask=await tasks.create(founder,{title:"Founder campaign allocation",priority:"MEDIUM",
   serviceId:clientService.id,dueAt:deadline,assigneeIds:[staff.id]});
 assert.equal(founderTask.serviceId,clientService.id);
 assert.equal((await tasks.list(founder,{view:"team",serviceId:clientService.id,limit:10})).items.length,1);
 assert.equal((await tasks.detail(founder,founderTask.id)).service?.clientId,client.id);
 await tasks.delete(founder,founderTask.id,founderTask.version);
 const foreignClient=await db.client.create({data:{organizationId:outside.id,createdById:foreign.id,businessName:"Other tenant"}});
 const foreignService=await db.clientService.create({data:{clientId:foreignClient.id,name:"Hidden service"}});
 await assert.rejects(()=>tasks.create(mgr,{title:"Foreign service task",priority:"MEDIUM",
   serviceId:foreignService.id,dueAt:deadline,assigneeIds:[staff.id]}),failed(422));
 const unrelated=await db.client.create({data:{organizationId:org.id,createdById:admin.id,businessName:"Different client"}});
 const unrelatedService=await db.clientService.create({data:{clientId:unrelated.id,name:"SEO"}});
 await assert.rejects(()=>tasks.create(mgr,{title:"Mismatched client project",priority:"MEDIUM",
   serviceId:unrelatedService.id,projectId:project.id,dueAt:deadline,assigneeIds:[staff.id]}),failed(422));
 const founderSchedule=await tasks.createRecurrence(founder,{
   title:"Founder weekly social schedule",priority:"LOW",serviceId:clientService.id,
   frequency:"WEEKLY",interval:1,timezone:"Asia/Kolkata",
   startAt:new Date(Date.now()+3600000).toISOString(),dueOffsetDays:1,assigneeIds:[staff.id]});
 assert.equal(founderSchedule.serviceId,clientService.id);
 await tasks.toggleRecurrence(founder,founderSchedule.id,founderSchedule.version,false);
 await assert.rejects(()=>tasks.create(mgr,{title:"Missing expiry",priority:"MEDIUM",assigneeIds:[staff.id]}),failed(422));
 await assert.rejects(()=>tasks.create(mgr,{title:"Expired at assignment",priority:"MEDIUM",dueAt:new Date(Date.now()-60000).toISOString(),assigneeIds:[staff.id]}),failed(422));
 const t=await tasks.create(mgr,{title:"Launch homepage",description:"Build first view",priority:"HIGH",
   projectId:project.id,dueAt:deadline,assigneeIds:[staff.id]});
 assert.equal(t.organizationId,org.id);
 assert.equal(await db.notification.count({where:{organizationId:org.id,recipientId:staff.id,
   kind:"TASK_ASSIGNED",href:"/app/tasks?task="+t.id}}),1);

 assert.equal((await tasks.list(mgr,{view:"team",limit:30})).items.length,1);
 assert.equal((await tasks.list(staffActor,{view:"mine",limit:30})).items.length,1);
 assert.equal((await tasks.list(readOnly,{view:"mine",limit:30})).items.length,0);
 await assert.rejects(()=>tasks.list(staffActor,{view:"team",limit:30}),failed(403));
 await assert.rejects(()=>tasks.detail(readOnly,t.id),failed(404));
 await assert.rejects(()=>tasks.detail(stranger,t.id),failed(404));
 await assert.rejects(()=>tasks.update(staffActor,t.id,{version:1,title:"Changed"}),failed(403));
 const checklist=await tasks.addChecklist(staffActor,t.id,"Check responsive layout");
 const note=await tasks.comment(staffActor,t.id,"Implementing mobile layout");
 assert.equal(note.body,"Implementing mobile layout");
 await assert.rejects(()=>tasks.comment(readOnly,t.id,"Not assigned"),failed(404));
 await tasks.checklistStatus(staffActor,t.id,checklist.id,true);
 const started=await tasks.update(staffActor,t.id,{version:1,status:"IN_PROGRESS"});
 assert.equal(started.status,"IN_PROGRESS");
 const progressComment=await tasks.comment(staffActor,t.id,"In progress: final review of landing page");
 assert.equal(progressComment.body,"In progress: final review of landing page");
 assert.equal((await tasks.detail(staffActor,t.id)).comments.length,2);
 const done=await tasks.update(staffActor,t.id,{version:2,status:"DONE"});
 assert.equal(done.status,"DONE");
 assert.ok(done.completedAt,"Completion must be timestamped");
 const historicCompletion=new Date(Date.now()-49*60*60*1000);
 await db.task.update({where:{id:t.id},data:{completedAt:historicCompletion}});
 const storedForOverview=await tasks.list(staffActor,{view:"mine",status:"DONE",limit:10});
 assert.equal(storedForOverview.items[0]?.completedAt?.toISOString(),historicCompletion.toISOString());
 const fresh=await tasks.create(mgr,{title:"Fresh completed archive entry",
   priority:"LOW",dueAt:deadline,assigneeIds:[other.id]});
 const finishedFresh=await tasks.update(mgr,fresh.id,{version:fresh.version,status:"DONE"});
 assert.ok(finishedFresh.completedAt);
 const firstHistory=await tasks.history(mgr,{view:"team",limit:1});
 assert.equal(firstHistory.items[0]?.id,fresh.id);
 assert.ok(firstHistory.nextCursor);
 const nextHistory=await tasks.history(mgr,{view:"team",cursor:firstHistory.nextCursor!,limit:1});
 assert.equal(nextHistory.items[0]?.id,t.id);
 assert.equal(nextHistory.items[0]?.completedAt?.toISOString(),historicCompletion.toISOString());
 assert.equal((await tasks.history(staffActor,{view:"mine",limit:20})).items[0]?.id,t.id);
 assert.equal((await tasks.history(readOnly,{view:"mine",limit:20})).items[0]?.id,fresh.id);
 assert.deepEqual((await tasks.history(stranger,{view:"mine",limit:20})).items,[]);
 assert.equal((await tasks.history(mgr,{view:"team",q:"Fresh completed",limit:20})).items.length,1);
 await assert.rejects(()=>tasks.history(staffActor,{view:"team",limit:20}),failed(403));
 await assert.rejects(()=>tasks.history(limitedFounder,{view:"team",limit:20}),failed(403));
 await tasks.delete(mgr,fresh.id,finishedFresh.version);
 assert.equal((await tasks.history(mgr,{view:"team",limit:20})).items.length,1);
 await assert.rejects(()=>tasks.update(staffActor,t.id,{version:1,status:"TODO"}),failed(422));
 await assert.rejects(()=>tasks.checklistStatus(staffActor,t.id,checklist.id,false),failed(422));
 const updated=await tasks.assign(mgr,t.id,3,[staff.id,admin.id]);
 assert.equal(updated.assignees.length,2);
 assert.equal(await db.notification.count({where:{organizationId:org.id,recipientId:admin.id,
   kind:"TASK_ASSIGNED",href:"/app/tasks?task="+t.id}}),1);

 await assert.rejects(()=>tasks.assign(mgr,t.id,2,[staff.id]),failed(409));
 assert.equal((await tasks.detail(mgr,t.id)).comments.length,2);
 // A completed task may only be reopened by an administrator with tasks.manage.
 await assert.rejects(()=>tasks.update(staffActor,t.id,
   {version:updated.version,status:"IN_PROGRESS"}),failed(422));
 await assert.rejects(()=>tasks.update(limitedFounder,t.id,
   {version:updated.version,status:"IN_PROGRESS"}),failed(404));
 // An assigned admin without tasks.manage has only ordinary assignee rights.
 const limitedAssignee=actor(admin.id,org.id,["tasks.read","tasks.update.own"]);
 await assert.rejects(()=>tasks.update(limitedAssignee,t.id,
   {version:updated.version,status:"IN_PROGRESS"}),failed(422));
 let statusTask=await tasks.update(mgr,t.id,{version:updated.version,status:"IN_PROGRESS"});
 assert.equal(statusTask.status,"IN_PROGRESS");
 assert.equal(statusTask.completedAt,null);
 for(const state of ["TODO","BLOCKED","IN_REVIEW","CANCELLED","DONE","IN_PROGRESS"] as const){
  statusTask=await tasks.update(mgr,t.id,{version:statusTask.version,status:state});
  assert.equal(statusTask.status,state);
 }
 assert.equal(statusTask.completedAt,null);
 assert.equal((await tasks.history(mgr,{view:"team",limit:20})).items.length,0);
 assert.equal((await tasks.detail(staffActor,t.id)).comments.length,2);
 await assert.rejects(()=>tasks.update(mgr,t.id,
   {version:updated.version,status:"TODO"}),failed(409));

 // Only an authorized admin may atomically edit all task details and assignees.
 const nextDeadline=new Date(Date.now()+7*86400000).toISOString();
 const editedInput={
   version:statusTask.version,title:"Launch redesigned homepage",
   description:"Updated scope and review checklist",priority:"URGENT" as const,
   dueAt:nextDeadline,projectId:null,assigneeIds:[staff.id,other.id],
 };
 await assert.rejects(()=>tasks.edit(staffActor,t.id,editedInput),failed(403));
 await assert.rejects(()=>tasks.edit(limitedFounder,t.id,editedInput),failed(403));
 await assert.rejects(()=>tasks.edit(stranger,t.id,editedInput),failed(404));
 await assert.rejects(()=>tasks.edit(mgr,t.id,{...editedInput,
   projectId:project.id,assigneeIds:[foreign.id]}),failed(422));
 const edited=await tasks.edit(mgr,t.id,editedInput);
 assert.equal(edited.title,"Launch redesigned homepage");
 assert.equal(edited.description,"Updated scope and review checklist");
 assert.equal(edited.priority,"URGENT");
 assert.equal(edited.projectId,null);
 assert.equal(edited.status,"IN_PROGRESS");
 assert.equal(edited.dueAt?.toISOString(),nextDeadline);
 assert.deepEqual(edited.assignees.map(a=>a.userId).sort(),[other.id,staff.id].sort());
 assert.equal(edited.version,statusTask.version+1);
 assert.equal((await tasks.detail(staffActor,t.id)).comments.length,2);
 assert.equal(await db.notification.count({where:{
   organizationId:org.id,recipientId:admin.id,kind:"TASK_ASSIGNED",dedupeKey:"task.assigned:"+t.id,
 }}),0);
 assert.equal(await db.notification.count({where:{
   organizationId:org.id,recipientId:other.id,kind:"TASK_ASSIGNED",dedupeKey:"task.assigned:"+t.id,
 }}),1);
 assert.equal(await db.auditLog.count({where:{organizationId:org.id,entityId:t.id,
   action:"tasks.edited"}}),1);
 await assert.rejects(()=>tasks.edit(mgr,t.id,editedInput),failed(409));
 assert.equal((await tasks.detail(mgr,t.id)).title,"Launch redesigned homepage");
 statusTask=edited;
 // Only a tenant admin with task management can delete a shared task.
 await assert.rejects(()=>tasks.delete(staffActor,t.id,statusTask.version),failed(403));
 await assert.rejects(()=>tasks.delete(limitedFounder,t.id,statusTask.version),failed(403));
 await assert.rejects(()=>tasks.delete(stranger,t.id,statusTask.version),failed(404));
 const limitedAdmin=actor(admin.id,org.id,["tasks.read"]);
 await assert.rejects(()=>tasks.delete(limitedAdmin,t.id,statusTask.version),failed(403));
 await assert.rejects(()=>tasks.delete(mgr,t.id,statusTask.version-1),failed(409));
 const start=new Date(Date.now()-120000).toISOString();
 const repeat=await tasks.createRecurrence(mgr,{title:"Daily campaign check",priority:"MEDIUM",serviceId:clientService.id,
   frequency:"DAILY",interval:1,timezone:"Asia/Kolkata",startAt:start,
   dueOffsetDays:0,assigneeIds:[staff.id]});
 await assert.rejects(()=>tasks.createRecurrence(mgr,{title:"Impossible zone",priority:"MEDIUM",
   frequency:"DAILY",interval:1,timezone:"Mars/Olympus",startAt:start,
   dueOffsetDays:0,assigneeIds:[staff.id]}),failed(422));
 const first=await sweepRecurrences(db,new Date(),100);
 assert.equal(first.created,1);
 assert.equal((await sweepRecurrences(db,new Date(),100)).created,0);
 const generated=await db.task.findMany({where:{recurrenceId:repeat.id}});
 assert.equal(generated.length,1);
 assert.equal(generated[0].serviceId,clientService.id);
 assert.equal(await db.notification.count({where:{organizationId:org.id,recipientId:staff.id,
   kind:"TASK_ASSIGNED",href:"/app/tasks?task="+generated[0].id}}),1);

 assert.equal(generated[0].scheduledFor?.toISOString(),new Date(start).toISOString());
 const anchor=new Date("2026-01-31T10:00:00.000Z");
 const feb=nextOccurrence({frequency:"MONTHLY",interval:1,timezone:"UTC",anchorAt:anchor},anchor);
 assert.equal(feb.toISOString(),"2026-02-28T10:00:00.000Z");
 const mar=nextOccurrence({frequency:"MONTHLY",interval:1,timezone:"UTC",anchorAt:anchor},feb);
 assert.equal(mar.toISOString(),"2026-03-31T10:00:00.000Z");
 const spring=new Date("2026-03-07T07:30:00.000Z");
 assert.equal(nextOccurrence({frequency:"DAILY",interval:1,timezone:"America/New_York",anchorAt:spring},spring).toISOString(),
   "2026-03-08T07:30:00.000Z");
 const fall=new Date("2026-10-31T05:30:00.000Z");
 assert.equal(nextOccurrence({frequency:"DAILY",interval:1,timezone:"America/New_York",anchorAt:fall},fall).toISOString(),
   "2026-11-01T05:30:00.000Z");
 const turned=await tasks.toggleRecurrence(mgr,repeat.id,2,false);
 assert.equal(turned.enabled,false);
 await assert.rejects(()=>tasks.toggleRecurrence(mgr,repeat.id,2,true),failed(409));
 const pausedScan=await sweepRecurrences(db,new Date(Date.now()+3*86400000),100);
 assert.equal(pausedScan.created,0);
 const auto=await tasks.createRecurrence(mgr,{title:"Soon disabled",priority:"LOW",
   frequency:"WEEKLY",interval:1,timezone:"UTC",startAt:start,dueOffsetDays:0,assigneeIds:[other.id]});
 await db.user.update({where:{id:other.id},data:{status:"DISABLED"}});
 const paused=await sweepRecurrences(db,new Date(),100);
 assert.equal(paused.disabled,1);
 assert.equal((await db.taskRecurrence.findUniqueOrThrow({where:{id:auto.id}})).enabled,false);
 assert.equal(await db.task.count({where:{recurrenceId:auto.id}}),0);
 assert.equal(await db.task.count({where:{recurrenceId:repeat.id}}),1);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"Task"}}))>=4);
 assert.equal(await db.outboxEvent.count({where:{kind:"tasks.recurrence_generated",organizationId:org.id}}),1);
 // A deleted task disappears from every assignee's list, notifications, and
 // the task tables. Audit evidence remains without an active task record.
 assert.deepEqual(await tasks.delete(mgr,t.id,statusTask.version),{id:t.id,deleted:true});
 assert.equal(await db.task.count({where:{id:t.id}}),0);
 assert.equal(await db.taskAssignment.count({where:{taskId:t.id}}),0);
 assert.equal(await db.taskChecklistItem.count({where:{taskId:t.id}}),0);
 assert.equal(await db.taskComment.count({where:{taskId:t.id}}),0);
 assert.equal(await db.notification.count({where:{href:"/app/tasks?task="+t.id}}),0);
 assert.equal(await db.outboxEvent.count({where:{aggregateType:"Task",aggregateId:t.id}}),0);
 assert.equal((await tasks.list(staffActor,{view:"mine",limit:30})).items.length,1);
 assert.equal((await tasks.list(mgr,{view:"team",limit:30})).items.length,1);
 await assert.rejects(()=>tasks.detail(staffActor,t.id),failed(404));
 await assert.rejects(()=>tasks.delete(mgr,t.id,statusTask.version),failed(404));
 assert.equal(await db.auditLog.count({where:{entityType:"Task",entityId:t.id,action:"tasks.deleted"}}),1);
 // Generated occurrences may be removed without deleting the recurrence rule.
 assert.deepEqual(await tasks.delete(mgr,generated[0].id,generated[0].version),{id:generated[0].id,deleted:true});
 assert.equal((await tasks.list(staffActor,{view:"mine",limit:30})).items.length,0);
 assert.equal((await tasks.list(mgr,{view:"team",limit:30})).items.length,0);
 assert.equal(await db.notification.count({where:{href:"/app/tasks?task="+generated[0].id}}),0);
 assert.equal(await db.outboxEvent.count({where:{aggregateType:"Task",aggregateId:generated[0].id}}),0);
 assert.equal(await db.taskRecurrence.count({where:{id:repeat.id}}),1);
 console.info("Module 11 PASS: tenant-safe client service tasks, founder management, assignments, recurring generation and idempotency");
}finally{await db.$disconnect();}
