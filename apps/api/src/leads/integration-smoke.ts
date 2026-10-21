import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@digimarket/db";
import { leadCreateSchema } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { LeadsService } from "./service";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("CRM tests require isolated digimarket_ci PostgreSQL");
const db=createDatabaseClient(),crm=new LeadsService(db);
const actor=(id:string,org:string,roles:string[],grants:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles,permissions:new Set(grants),
});
const grants=["leads.read","leads.create","leads.edit","leads.convert","leads.assign","leads.bulk","leads.duplicates.review"];
const fail=(status:number)=>(error:{status?:number})=>error.status===status;
try{
 const org=await db.organization.create({data:{name:"Shared Leads CI"}});
 const other=await db.organization.create({data:{name:"Other CRM CI"}});
 const [owner,member,outsider]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"crm-owner",displayName:"Owner",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"crm-member",displayName:"Member",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:other.id,loginId:"crm-outsider",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const founder=actor(owner.id,org.id,["FOUNDER"],grants);
 const employee=actor(member.id,org.id,["EMPLOYEE"],["leads.read","leads.create","leads.edit.own","leads.convert"]);
 const foreign=actor(outsider.id,other.id,["EMPLOYEE"],grants);
 const input={phone:"+91 98765 43210"};
 assert.equal(leadCreateSchema.safeParse({phone:"+91 98765 43210"}).success,true);
 assert.equal(leadCreateSchema.safeParse({businessName:"Not allowed"}).success,false);
 assert.equal(leadCreateSchema.safeParse({phone:"1"}).success,false);
 const first=await crm.create(founder,input);
 assert.equal(first.status,"PENDING");
 assert.equal(first.phone,input.phone);
 assert.equal(first.contactName,null);
 assert.ok(first.businessName.startsWith("Lead "));
 assert.equal((await crm.list(employee,{limit:30})).items.length,1);
 assert.equal((await crm.detail(employee,first.id)).canEdit,true);
 await assert.rejects(()=>crm.create(employee,{phone:"919876543210"}),fail(409));
 await assert.rejects(()=>crm.detail(foreign,first.id),fail(404));
 await assert.rejects(()=>crm.update(foreign,first.id,{version:first.version,status:"APPROVED"}),fail(404));
 const meeting=await crm.update(employee,first.id,{version:first.version,status:"MEETING_PROCESS",
  stageNote:"Discussed the social media package",contactName:"Owner",businessName:"Big Mo Cafe",businessType:"Cafe"});
 assert.equal(meeting.status,"MEETING_PROCESS");
 assert.equal((await crm.detail(founder,first.id)).activities[0]?.note,"Discussed the social media package");
 await assert.rejects(()=>crm.update(employee,first.id,{version:1,status:"APPROVED"}),fail(409));
 const approved=await crm.update(employee,first.id,{version:meeting.version,status:"APPROVED",
  stageNote:"Agreement signed, ready to onboard"});
 assert.equal(approved.status,"APPROVED");
 assert.equal(await db.client.count({where:{sourceLeadId:approved.id}}),1);
 const client=await db.client.findUniqueOrThrow({where:{sourceLeadId:approved.id}});
 assert.equal(client.businessName,"Big Mo Cafe");
 assert.equal(client.organizationId,org.id);
 assert.equal(client.phone,input.phone);
 assert.equal((await db.clientContact.count({where:{clientId:client.id}})),1);
 assert.equal(await db.outboxEvent.count({where:{eventKey:"lead-converted:"+first.id}}),1);
 await assert.rejects(()=>crm.update(employee,first.id,{version:approved.version,status:"PENDING"}),fail(409));
 const elsewhere=await crm.create(foreign,{phone:input.phone});
 assert.notEqual(elsewhere.organizationId,first.organizationId);
 const incoming=await crm.ingestWhatsApp(org.id,owner.id,"919999887766");
 assert.equal(incoming.created,true);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919999887766")).created,false);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919876543210")).created,false);
 assert.equal((await db.lead.count({where:{organizationId:org.id,normalizedPhone:"919999887766"}})),1);
 const batch=randomUUID();
 assert.equal((await crm.import(founder,batch,[{phone:"919111111111"},{phone:"919222222222"}])).count,2);
 await assert.rejects(()=>crm.import(founder,batch,[{phone:"919333333333"}]),fail(409));
 const before=await db.lead.count({where:{organizationId:org.id}});
 await assert.rejects(()=>crm.import(founder,randomUUID(),[{phone:"919444444444"},{phone:"invalid"}]),fail(422));
 assert.equal(await db.lead.count({where:{organizationId:org.id}}),before);
 assert.equal((await crm.list(founder,{stage:"PENDING",limit:30})).items.length,3);
 assert.equal((await crm.list(founder,{stage:"APPROVED",limit:30})).items.length,1);
 const pagination=await crm.list(founder,{limit:1});
 assert.ok(pagination.nextCursor);
 const next=await crm.list(founder,{limit:1,cursor:pagination.nextCursor!});
 assert.notEqual(next.items[0].id,pagination.items[0].id);
 assert.ok((await crm.export(founder)).csv.includes("919999887766"));

 // Rejection is a non-converted outcome and remains in the rate denominator.
 const rejectedDraft=await crm.create(employee,{phone:"919555001122"});
 const rejected=await crm.update(employee,rejectedDraft.id,{version:rejectedDraft.version,
   status:"REJECTED",stageNote:"Not interested after the meeting"});
 assert.equal(rejected.status,"REJECTED");
 assert.equal((await crm.detail(founder,rejected.id)).activities[0]?.note,"Not interested after the meeting");
 assert.equal(await db.client.count({where:{sourceLeadId:rejected.id}}),0);
 const beforeDelete=await crm.metrics(founder);
 assert.equal(beforeDelete.rejected,1);
 assert.equal(beforeDelete.converted,1);
 assert.equal(beforeDelete.approved,1);
 assert.equal(beforeDelete.conversionRatePercent,Math.round(10000/beforeDelete.total)/100);
 const admin=actor(owner.id,org.id,["ADMIN"],grants);
 await assert.rejects(()=>crm.delete(employee,rejected.id,rejected.version),fail(403));
 await assert.rejects(()=>crm.delete(admin,rejected.id,rejected.version-1),fail(409));
 assert.deepEqual(await crm.delete(admin,rejected.id,rejected.version),{id:rejected.id,deleted:true});
 await assert.rejects(()=>crm.detail(founder,rejected.id),fail(404));
 await assert.rejects(()=>crm.delete(admin,rejected.id,rejected.version+1),fail(404));
 assert.equal((await crm.list(founder,{limit:50})).items.some(x=>x.id===rejected.id),false);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919555001122")).created,false);
 await assert.rejects(()=>crm.create(founder,{phone:"919555001122"}),fail(409));
 const afterDelete=await crm.metrics(founder);
 assert.equal(afterDelete.rejected,0);
 assert.equal(afterDelete.total,beforeDelete.total-1);
 assert.equal(afterDelete.converted,1);
 // A founder may remove an approved lead without deleting a client, FK or history.
 const removedApproved=await crm.delete(founder,approved.id,approved.version);
 assert.equal(removedApproved.deleted,true);
 assert.equal((await db.client.findUniqueOrThrow({where:{sourceLeadId:approved.id}})).id,client.id);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919876543210")).created,false);
 assert.equal((await crm.metrics(founder)).converted,0);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,action:"leads.deleted"}}))>=2);

 console.info("Module 7 PASS: phone-only lead, shared editing, atomic Approved conversion, history, webhook dedupe, tenant isolation and import.");
}finally{await db.$disconnect();}
