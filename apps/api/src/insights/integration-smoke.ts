import "dotenv/config";
import assert from "node:assert/strict";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {InsightsService} from "./insights";
import {NotificationService} from "./notifications";
import {sweepAlerts,reconcileInvoices} from "../../../worker/src/alerts";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 16 tests require isolated digimarket_ci PostgreSQL");
const db=createDatabaseClient(),insights=new InsightsService(db),alerts=new NotificationService(db);
const p=(userId:string,organizationId:string,permissions:string[]):Principal=>({
 userId,organizationId,sessionId:"insights-ci",permissions:new Set(permissions),roles:["EMPLOYEE"],
});
const deny=(status:number)=>(e:{status?:number})=>e.status===status;
const now=new Date(),before=new Date(now.getTime()-72*3600_000);
const day=new Date(now.toISOString().slice(0,10)+"T00:00:00Z");
try{
 const [org,foreignOrg]=await Promise.all([
  db.organization.create({data:{name:"Insights test organization"}}),
  db.organization.create({data:{name:"Other insights organization"}}),
 ]);
 const [manager,worker,outsider]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"insights-manager",displayName:"Manager",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"insights-worker",displayName:"Worker",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:foreignOrg.id,loginId:"insights-outsider",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const all=["search.read","reports.business.read","notifications.read","leads.read","clients.read",
  "projects.read","projects.assign","tasks.read","tasks.manage","content.read","content.manage",
  "invoices.read","finance.read.all","approvals.read","approvals.decide"];
 const admin=p(manager.id,org.id,all);
 const employee=p(worker.id,org.id,["search.read","notifications.read","leads.read","clients.read",
  "projects.read","tasks.read","content.read","reports.business.read"]);
 const external=p(outsider.id,foreignOrg.id,all);
 await assert.rejects(()=>insights.search(p(worker.id,org.id,[]),"hidden"),deny(403));
 await assert.rejects(()=>alerts.list(p(worker.id,org.id,[])),deny(403));
 const client=await db.client.create({data:{organizationId:org.id,createdById:manager.id,businessName:"Sunrise Coffee"}});
 await db.client.create({data:{organizationId:foreignOrg.id,createdById:outsider.id,businessName:"Sunrise Hidden Foreign"}});
 const lead=await db.lead.create({data:{organizationId:org.id,createdById:manager.id,
  businessName:"Sunrise Lead",normalizedBusinessName:"sunrise lead",status:"NEW",
  assignedToId:worker.id,nextFollowUpAt:before}});
 const hiddenProject=await db.project.create({data:{organizationId:org.id,clientId:client.id,
  createdById:manager.id,name:"Sunrise Project Hidden",status:"ACTIVE"}});
 const visibleProject=await db.project.create({data:{organizationId:org.id,clientId:client.id,
  createdById:manager.id,name:"Sunrise Project Shared",status:"ACTIVE",
  members:{create:[{userId:worker.id}]}}});
 const hiddenTask=await db.task.create({data:{organizationId:org.id,createdById:manager.id,
  title:"Sunrise Admin Task",dueAt:before,status:"TODO"}});
 const visibleTask=await db.task.create({data:{organizationId:org.id,createdById:manager.id,
  title:"Sunrise Worker Task",status:"TODO",dueAt:before,
  assignees:{create:[{userId:worker.id}]}}});
 const hiddenContent=await db.contentPost.create({data:{
  organizationId:org.id,clientId:client.id,createdById:manager.id,ownerId:manager.id,
  title:"Sunrise Admin Post",caption:"Admin only",platform:"INSTAGRAM",format:"POST"}});
 const visibleContent=await db.contentPost.create({data:{
  organizationId:org.id,clientId:client.id,createdById:manager.id,ownerId:worker.id,
  title:"Sunrise Worker Post",caption:"Visible",platform:"INSTAGRAM",format:"POST"}});
 const invoice=await db.invoice.create({data:{
  organizationId:org.id,clientId:client.id,createdById:manager.id,issuedById:manager.id,
  number:"INV-TEST-16",status:"ISSUED",issuedOn:day,dueOn:before,
  sellerName:"Agency",sellerAddress:"Prayagraj",buyerName:"Sunrise Coffee",
  subtotal:"100.0000",total:"100.0000",paidTotal:"0",
 }});
 const publicHits=(await insights.search(employee,"Sunrise")).items;
 // Access to client lists does not expose other users' clients in personal search.
 assert.equal(publicHits.some(x=>x.id===client.id),false);
 assert.ok(publicHits.some(x=>x.id===lead.id));
 assert.ok(publicHits.some(x=>x.id===visibleProject.id));
 assert.ok(publicHits.some(x=>x.id===visibleTask.id));
 assert.ok(publicHits.some(x=>x.id===visibleContent.id));
 for(const bad of [hiddenProject.id,hiddenTask.id,hiddenContent.id,invoice.id])
  assert.equal(publicHits.some(x=>x.id===bad),false);
 const managedHits=(await insights.search(admin,"Sunrise")).items;
 for(const id of [client.id,lead.id,hiddenProject.id,hiddenTask.id,hiddenContent.id])
  assert.ok(managedHits.some(x=>x.id===id));
 assert.equal(managedHits.some(x=>x.id===invoice.id),false);
 assert.equal((await insights.search(external,"Sunrise")).items.some(x=>x.id===client.id),false);
 const report=await insights.report(employee,"2026-10-01","2026-11-30");
 assert.equal("invoices" in report.sections,false);
 assert.equal("cashLedger" in report.sections,false);
 assert.equal((report.sections.projects as {active:number}).active,1);
 assert.equal((report.sections.tasks as {open:number}).open,1);
 const privileged=await insights.report(admin,"2026-10-01","2026-11-30");
 assert.equal((privileged.sections.projects as {active:number}).active,2);
 assert.equal((privileged.sections.invoices as {unpaidCount:number}).unpaidCount,1);
 const privilegedForeign=await insights.report(external,"2026-10-01","2026-11-30");
 assert.equal((privilegedForeign.sections.invoices as {unpaidCount:number}).unpaidCount,0);
 const direct=await db.notification.create({data:{
  organizationId:org.id,recipientId:worker.id,kind:"TASK_DUE",dedupeKey:"manual-"+worker.id,
  title:"Private worker alert",body:"Task needs work",href:"/app/tasks",
 }});
 assert.equal((await alerts.list(employee)).unreadCount,1);
 assert.equal((await alerts.list(admin)).unreadCount,0);
 await assert.rejects(()=>alerts.markRead(admin,direct.id),deny(404));
 await assert.rejects(()=>alerts.markRead(external,direct.id),deny(404));
 await alerts.markRead(employee,direct.id);
 await alerts.markRead(employee,direct.id);
 assert.equal((await alerts.list(employee)).unreadCount,0);
 const queueRole=await db.role.create({data:{organizationId:org.id,key:"ADMIN",label:"Administrator",isSystem:true}});
 const workerRole=await db.role.create({data:{organizationId:org.id,key:"EMPLOYEE",label:"Employee",isSystem:true}});
 const keys=["tasks.read","leads.read","invoices.read","finance.read.all","approvals.read","approvals.decide"];
 await db.permission.createMany({data:keys.map(key=>({key,description:key})),skipDuplicates:true});
 await db.rolePermission.createMany({data:keys.map(permissionKey=>({roleId:queueRole.id,permissionKey}))});
 await db.rolePermission.createMany({data:["tasks.read","leads.read"].map(permissionKey=>({roleId:workerRole.id,permissionKey}))});
 await db.userRole.createMany({data:[{userId:manager.id,roleId:queueRole.id},{userId:worker.id,roleId:workerRole.id}]});
 const policy=await db.approvalPolicy.create({data:{
  organizationId:org.id,category:"GENERAL",name:"General policy",approverRoleKeys:["ADMIN"],active:true}});
 await db.approvalRequest.create({data:{organizationId:org.id,policyId:policy.id,requesterId:worker.id,
  title:"Review request",description:"Generic request",approverRoleKeys:["ADMIN"]}});
 const first=await sweepAlerts(db,now),second=await sweepAlerts(db,now);
 assert.ok(first.candidates>=3);assert.equal(second.candidates,first.candidates);
 const workList=await alerts.list(employee,100);
 assert.ok(workList.items.some(x=>x.kind==="TASK_DUE"));
 assert.ok(workList.items.some(x=>x.kind==="LEAD_FOLLOWUP"));
 assert.equal(workList.items.some(x=>x.kind==="INVOICE_OVERDUE"),false);
 assert.ok((await alerts.list(admin,100)).items.some(x=>x.kind==="INVOICE_OVERDUE"));
 assert.ok((await alerts.list(admin,100)).items.some(x=>x.kind==="APPROVAL_PENDING"));
 const after=await db.notification.count({where:{organizationId:org.id}});
 await sweepAlerts(db,now);
 assert.equal(await db.notification.count({where:{organizationId:org.id}}),after);
 await alerts.readAll(employee);
 assert.equal((await alerts.list(employee)).unreadCount,0);
 assert.equal((await reconcileInvoices(db,now)).discrepancies,0);
 await db.invoice.update({where:{id:invoice.id},data:{paidTotal:"1.0000"}});
 assert.equal((await reconcileInvoices(db,now)).discrepancies,1);
 const reconciliation=await alerts.list(admin,100);
 assert.ok(reconciliation.items.some(x=>x.kind==="RECONCILIATION"));
 assert.equal((await alerts.list(employee,100)).items.some(x=>x.kind==="RECONCILIATION"),false);
 const alertsAfter=await db.notification.count({where:{organizationId:org.id}});
 await reconcileInvoices(db,now);
 assert.equal(await db.notification.count({where:{organizationId:org.id}}),alertsAfter);
 console.info("Module 16 PASS: search isolation, record scopes, filtered reports, private notifications, retry-safe sweeps, invoice reconciliation.");
}finally{await db.$disconnect();}
