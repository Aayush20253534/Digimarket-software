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
 await assert.rejects(()=>tasks.create(founder,{title:"Unauthorized creation",priority:"LOW",
   assigneeIds:[staff.id]}),failed(403));
 await assert.rejects(()=>tasks.createRecurrence(founder,{
   title:"Unauthorized recurring work",priority:"MEDIUM",frequency:"DAILY",interval:1,
   timezone:"UTC",startAt:new Date().toISOString(),dueOffsetDays:0,assigneeIds:[staff.id]
 }),failed(403));

 const staffActor=actor(staff.id,org.id,["tasks.read","tasks.update.own","tasks.comment"]);
 const readOnly=actor(other.id,org.id,["tasks.read","tasks.update.own","tasks.comment"]);
 const stranger=actor(foreign.id,outside.id,perms);
 const client=await db.client.create({data:{organizationId:org.id,createdById:admin.id,businessName:"Cafe"}});
 const project=await db.project.create({data:{organizationId:org.id,clientId:client.id,
   createdById:admin.id,name:"Website",
   members:{create:[{userId:admin.id,role:"MANAGER"},{userId:staff.id,role:"CONTRIBUTOR"}]}}});
 await assert.rejects(()=>tasks.create(mgr,{title:"Wrong org",priority:"MEDIUM",assigneeIds:[foreign.id]}),failed(422));
 await assert.rejects(()=>tasks.create(mgr,{title:"Wrong project assignee",priority:"MEDIUM",
   projectId:project.id,assigneeIds:[other.id]}),failed(422));
 const t=await tasks.create(mgr,{title:"Launch homepage",description:"Build first view",priority:"HIGH",
   projectId:project.id,assigneeIds:[staff.id]});
 assert.equal(t.organizationId,org.id);
 assert.equal((await tasks.list(mgr,{view:"team",limit:30})).items.length,1);
 assert.equal((await tasks.list(staffActor,{view:"mine",limit:30})).items.length,1);
 assert.equal((await tasks.list(readOnly,{view:"mine",limit:30})).items.length,0);
 await assert.rejects(()=>tasks.list(staffActor,{view:"team",limit:30}),failed(403));
 await assert.rejects(()=>tasks.detail(readOnly,t.id),failed(404));
 await assert.rejects(()=>tasks.detail(stranger,t.id),failed(404));
 await assert.rejects(()=>tasks.update(staffActor,t.id,{version:1,title:"Changed"}),failed(403));
 const checklist=await tasks.addChecklist(staffActor,t.id,"Check responsive layout");
 await assert.rejects(()=>tasks.update(staffActor,t.id,{version:1,status:"DONE"}),failed(422));
 const note=await tasks.comment(staffActor,t.id,"Implementing mobile layout");
 assert.equal(note.body,"Implementing mobile layout");
 await assert.rejects(()=>tasks.comment(readOnly,t.id,"Not assigned"),failed(404));
 await tasks.checklistStatus(staffActor,t.id,checklist.id,true);
 const started=await tasks.update(staffActor,t.id,{version:1,status:"IN_PROGRESS"});
 assert.equal(started.status,"IN_PROGRESS");
 const done=await tasks.update(staffActor,t.id,{version:2,status:"DONE"});
 assert.equal(done.status,"DONE");
 await assert.rejects(()=>tasks.update(staffActor,t.id,{version:1,status:"TODO"}),failed(409));
 await assert.rejects(()=>tasks.checklistStatus(staffActor,t.id,checklist.id,false),failed(422));
 const updated=await tasks.assign(mgr,t.id,3,[staff.id,admin.id]);
 assert.equal(updated.assignees.length,2);
 await assert.rejects(()=>tasks.assign(mgr,t.id,2,[staff.id]),failed(409));
 assert.equal((await tasks.detail(mgr,t.id)).comments.length,1);
 const start=new Date(Date.now()-120000).toISOString();
 const repeat=await tasks.createRecurrence(mgr,{title:"Daily campaign check",priority:"MEDIUM",
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
 console.info("Module 11 PASS: private task scope, assignments, checklist/comments, versions, recurrence, DST, monthly clamping, retry dedupe and auto-pause");
}finally{await db.$disconnect();}
