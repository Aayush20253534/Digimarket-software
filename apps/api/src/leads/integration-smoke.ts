import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@digimarket/db";
import { leadCreateSchema, leadUpdateSchema } from "@digimarket/contracts";
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
 assert.equal(leadUpdateSchema.safeParse({version:1,googleMapsUrl:"https://maps.app.goo.gl/abcdEFG123"}).success,true);
 assert.equal(leadUpdateSchema.safeParse({version:1,googleMapsUrl:"https://www.google.com/maps/place/Test"}).success,true);
 for(const badUrl of ["javascript:alert(1)","https://evil.example/maps","https://google.com.attacker.io/maps","https://google.com/not-maps"])
   assert.equal(leadUpdateSchema.safeParse({version:1,googleMapsUrl:badUrl}).success,false);
 const first=await crm.create(founder,input);
 assert.equal(first.status,"PENDING");
 assert.equal(first.source,"COLD_CALL");
 assert.equal(first.phone,input.phone);
 assert.equal(first.contactName,null);
 assert.ok(first.businessName.startsWith("Lead "));
 assert.equal((await crm.list(employee,{limit:30})).items.length,1);
 assert.equal((await crm.detail(employee,first.id)).canEdit,true);
 await assert.rejects(()=>crm.create(employee,{phone:"919876543210"}),fail(409));
 await assert.rejects(()=>crm.detail(foreign,first.id),fail(404));
 await assert.rejects(()=>crm.update(foreign,first.id,{version:first.version,status:"APPROVED"}),fail(404));
 const yetToCall=await crm.update(employee,first.id,{version:first.version,status:"YET_TO_CALL",
  stageNote:"Outreach not started"});
 assert.equal(yetToCall.status,"YET_TO_CALL");
 const notContactedMetrics=await crm.metrics(founder);
 assert.equal(notContactedMetrics.yetToCall,1);
 assert.equal(notContactedMetrics.meetingProcess,0);
 assert.equal(notContactedMetrics.pending,0);
 assert.equal((await crm.list(founder,{stage:"YET_TO_CALL",limit:30})).items[0]?.id,first.id);
 assert.equal((await crm.detail(founder,first.id)).stageNote,"Outreach not started");
 const followUpOn=new Date().toISOString().slice(0,10);
 const otherDay=new Date(Date.now()+86400000).toISOString().slice(0,10);
 assert.equal(leadUpdateSchema.safeParse({version:yetToCall.version,status:"FOLLOW_UP",followUpOn}).success,true);
 assert.equal(leadUpdateSchema.safeParse({version:yetToCall.version,status:"FOLLOW_UP",followUpOn:"2026-99-99"}).success,false);
 await assert.rejects(()=>crm.update(employee,first.id,{version:yetToCall.version,status:"FOLLOW_UP"}),fail(422));
 await assert.rejects(()=>crm.update(employee,first.id,{version:yetToCall.version,status:"MEETING_PROCESS",followUpOn}),fail(422));
 const followUp=await crm.update(employee,first.id,{version:yetToCall.version,status:"FOLLOW_UP",
  followUpOn,stageNote:"Call again on Tuesday"});
 assert.equal(followUp.nextFollowUpAt?.toISOString().slice(0,10),followUpOn);
 assert.equal((await crm.followUpsOn(founder,followUpOn)).total,1);
 assert.equal((await crm.followUpsOn(founder,followUpOn)).items[0]?.id,first.id);
 const scheduled=await crm.scheduledFollowUps(founder,{limit:20});
 assert.equal(scheduled.items.length,1);
 assert.equal(scheduled.items[0]?.id,first.id);
 assert.equal(scheduled.items[0]?.phone,first.phone);
 assert.equal(scheduled.items[0]?.businessName,first.businessName);
 assert.equal(scheduled.items[0]?.contactName,null);
 assert.equal(scheduled.items[0]?.nextFollowUpAt?.toISOString().slice(0,10),followUpOn);
 assert.equal(scheduled.nextCursor,null);
 assert.equal((await crm.scheduledFollowUps(foreign,{limit:20})).items.length,0);
 await assert.rejects(()=>crm.scheduledFollowUps(actor(owner.id,org.id,[],[]),{limit:20}),fail(403));
 assert.equal((await crm.followUpsOn(founder,otherDay)).total,0);
 assert.equal((await crm.followUpsOn(foreign,followUpOn)).total,0);
 await assert.rejects(()=>crm.followUpsOn(actor(owner.id,org.id,[],[]),followUpOn),fail(403));
 assert.equal(followUp.status,"FOLLOW_UP");
 assert.equal((await crm.metrics(founder)).followUp,1);
 assert.equal((await crm.list(founder,{stage:"FOLLOW_UP",limit:10})).items[0]?.id,first.id);
 assert.equal((await crm.detail(founder,first.id)).stageNote,"Call again on Tuesday");
 const meetingOn="2026-10-25",meetingTime="00:15";
 assert.equal(leadUpdateSchema.safeParse({version:followUp.version,status:"MEETING_PROCESS",meetingOn,meetingTime}).success,true);
 for(const time of ["25:00","14:77","2:30","14:30Z"])
   assert.equal(leadUpdateSchema.safeParse({version:followUp.version,status:"MEETING_PROCESS",meetingOn,meetingTime:time}).success,false);
 await assert.rejects(()=>crm.update(employee,first.id,{version:followUp.version,status:"MEETING_PROCESS"}),fail(422));
 await assert.rejects(()=>crm.update(employee,first.id,{version:followUp.version,status:"MEETING_PROCESS",meetingOn}),fail(422));
 const meeting=await crm.update(employee,first.id,{version:followUp.version,status:"MEETING_PROCESS",
  meetingOn,meetingTime,stageNote:"Discussed the social media package",contactName:"Owner",businessName:"Big Mo Cafe",
  businessType:"Cafe",location:"12 Example Road, Prayagraj",googleMapsUrl:"https://maps.app.goo.gl/abcdEFG123"});
 assert.equal(meeting.status,"MEETING_PROCESS");
 assert.equal(meeting.nextFollowUpAt,null);
 assert.equal(meeting.meetingAt?.toISOString(),"2026-10-24T18:45:00.000Z");
 assert.equal((await crm.meetingsOn(founder,meetingOn)).total,1);
 assert.equal((await crm.meetingsOn(founder,meetingOn)).items[0]?.id,first.id);
 assert.equal((await crm.meetingsOn(founder,"2026-10-24")).total,0);
 assert.equal((await crm.meetingsOn(foreign,meetingOn)).total,0);
 await assert.rejects(()=>crm.meetingsOn(actor(owner.id,org.id,[],[]),meetingOn),fail(403));
 const unchangedMeeting=await crm.update(employee,first.id,{version:meeting.version,businessType:"Restaurant"});
 assert.equal(unchangedMeeting.meetingAt?.toISOString(),meeting.meetingAt?.toISOString());
 const rescheduled=await crm.update(employee,first.id,{version:unchangedMeeting.version,
  meetingOn:"2026-10-26",meetingTime:"15:45"});
 assert.equal((await crm.meetingsOn(founder,meetingOn)).total,0);
 assert.equal((await crm.meetingsOn(founder,"2026-10-26")).total,1);
 assert.equal((await crm.followUpsOn(founder,followUpOn)).total,0);
 assert.equal((await crm.scheduledFollowUps(founder,{limit:20})).items.length,0);
 const meetingMetrics=await crm.metrics(founder);
 assert.equal(meetingMetrics.yetToCall,0);
 assert.equal(meetingMetrics.followUp,0);
 assert.equal(meetingMetrics.meetingProcess,1);
 assert.equal(meeting.googleMapsUrl,"https://maps.app.goo.gl/abcdEFG123");
 assert.equal(meeting.location,"12 Example Road, Prayagraj");
 assert.equal((await crm.detail(founder,first.id)).location,"12 Example Road, Prayagraj");
 assert.equal((await crm.list(founder,{limit:30})).items[0]?.googleMapsUrl,meeting.googleMapsUrl);
 assert.equal((await crm.detail(founder,first.id)).googleMapsUrl,meeting.googleMapsUrl);
 assert.equal((await crm.list(founder,{limit:30})).items[0]?.stageNote,"Discussed the social media package");
 const autosaved=await crm.saveStageNote(employee,first.id,"Meeting on Friday");
 assert.equal(autosaved.stageNote,"Meeting on Friday");
 assert.equal(autosaved.version,rescheduled.version);
 assert.equal((await crm.detail(founder,first.id)).stageNote,"Meeting on Friday");
 const notes=(await crm.detail(founder,first.id)).activities.map(activity=>activity.note);
 assert.equal(notes[0],"Meeting on Friday");
 assert.ok(notes.includes("Discussed the social media package"));
 await assert.rejects(()=>crm.update(employee,first.id,{version:1,status:"APPROVED"}),fail(409));
 const decision=await crm.update(employee,first.id,{version:rescheduled.version,status:"DECISION_PENDING",
   stageNote:"Proposal sent; waiting for the client's decision"});
 assert.equal(decision.status,"DECISION_PENDING");
 assert.equal(decision.meetingAt,null);
 assert.equal((await crm.meetingsOn(founder,"2026-10-26")).total,0);
 assert.equal((await crm.metrics(founder)).decisionPending,1);
 assert.equal((await crm.metrics(founder)).meetingProcess,0);
 assert.equal((await crm.list(founder,{stage:"DECISION_PENDING",limit:10})).items[0]?.id,first.id);
 assert.equal((await crm.detail(founder,first.id)).stageNote,"Proposal sent; waiting for the client's decision");
 const agreement=await crm.update(employee,first.id,{version:decision.version,status:"AGREEMENT_PENDING",
   stageNote:"Contract sent for signature"});
  assert.equal(agreement.status,"AGREEMENT_PENDING");
  assert.equal((await crm.metrics(founder)).agreementPending,1);
  assert.equal((await crm.metrics(founder)).decisionPending,0);
  assert.equal((await crm.list(founder,{stage:"AGREEMENT_PENDING",limit:10})).items[0]?.id,first.id);
  assert.equal((await crm.detail(founder,first.id)).stageNote,"Contract sent for signature");
  assert.equal(await db.client.count({where:{sourceLeadId:agreement.id}}),0);
  const approved=await crm.update(employee,first.id,{version:agreement.version,status:"APPROVED",
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
 assert.equal((await db.lead.findUniqueOrThrow({where:{id:incoming.id}})).source,"META_LEADS");
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919999887766")).created,false);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919876543210")).created,false);
 const attributed=await db.lead.findUniqueOrThrow({where:{id:first.id}});
 assert.equal(attributed.source,"META_LEADS");
 assert.equal(attributed.businessName,"Big Mo Cafe");
 assert.equal(attributed.stageNote,"Agreement signed, ready to onboard");
 assert.equal(attributed.version,approved.version+1);
 assert.equal((await db.lead.count({where:{organizationId:org.id,normalizedPhone:"919999887766"}})),1);
 const batch=randomUUID();
 assert.equal((await crm.import(founder,batch,[{phone:"919111111111"},{phone:"919222222222",source:"META_LEADS"}])).count,2);
 await assert.rejects(()=>crm.import(founder,batch,[{phone:"919333333333"}]),fail(409));
 const before=await db.lead.count({where:{organizationId:org.id}});
 await assert.rejects(()=>crm.import(founder,randomUUID(),[{phone:"919444444444"},{phone:"invalid"}]),fail(422));
 assert.equal(await db.lead.count({where:{organizationId:org.id}}),before);
 const pendingPage=await crm.list(founder,{stage:"PENDING",limit:30});
 assert.equal(pendingPage.items.length,3);
 assert.equal(pendingPage.total,3);
 assert.equal((await crm.list(founder,{stage:"APPROVED",limit:30})).items.length,1);
 assert.equal((await crm.list(founder,{source:"META_LEADS",limit:30})).items.length,3);
 assert.equal((await crm.list(founder,{source:"COLD_CALL",limit:30})).items.length,1);
 assert.equal((await db.lead.count({where:{organizationId:org.id,source:"META_LEADS"}})),3);
 const pagination=await crm.list(founder,{limit:1});
 assert.equal(pagination.total,await db.lead.count({where:{organizationId:org.id,deletedAt:null}}));
 assert.ok(pagination.nextCursor);
 const next=await crm.list(founder,{limit:1,cursor:pagination.nextCursor!});
 assert.notEqual(next.items[0].id,pagination.items[0].id);
 assert.ok((await crm.export(founder)).csv.includes("919999887766"));
 assert.equal(Number.isNaN(new Date(pagination.items[0].createdAt).getTime()),false);
 assert.equal((await crm.detail(founder,first.id)).createdAt.toISOString(),first.createdAt.toISOString());

 // Rejection is a non-converted outcome and remains in the rate denominator.
 const rejectedDraft=await crm.create(employee,{phone:"919555001122"});
 const rejected=await crm.update(employee,rejectedDraft.id,{version:rejectedDraft.version,
   status:"REJECTED",source:"META_LEADS",stageNote:"Not interested after the meeting"});
 assert.equal(rejected.source,"META_LEADS");
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
 // Duplicate candidates may point to both lead roles; deletion clears them.
 const pair=[rejected.id,first.id].sort();
 await db.leadDuplicateCandidate.create({data:{
   organizationId:org.id,leadId:pair[0],candidateId:pair[1],reason:"BUSINESS_MATCH",
 }});
 assert.deepEqual(await crm.delete(admin,rejected.id,rejected.version),{id:rejected.id,deleted:true});
 assert.equal(await db.lead.count({where:{id:rejected.id}}),0);
 assert.equal(await db.leadActivity.count({where:{leadId:rejected.id}}),0);
 assert.equal(await db.leadDuplicateCandidate.count({where:{OR:[
   {leadId:rejected.id},{candidateId:rejected.id},
 ]}}),0);
 await assert.rejects(()=>crm.detail(founder,rejected.id),fail(404));
 await assert.rejects(()=>crm.delete(admin,rejected.id,rejected.version+1),fail(404));
 assert.equal((await crm.list(founder,{limit:50})).items.some(x=>x.id===rejected.id),false);
 const afterDelete=await crm.metrics(founder);
 assert.equal(afterDelete.rejected,0);
 assert.equal(afterDelete.total,beforeDelete.total-1);
 assert.equal(afterDelete.converted,1);
 // The deleted phone becomes reusable; subsequent WhatsApp attribution updates
 // the newly created lead rather than resurrecting the removed record.
 const again=await crm.create(founder,{phone:"919555001122",source:"COLD_CALL"});
 assert.notEqual(again.id,rejected.id);
 assert.equal((await crm.ingestWhatsApp(org.id,owner.id,"919555001122")).created,false);
 assert.equal((await db.lead.findUniqueOrThrow({where:{id:again.id}})).source,"META_LEADS");
 // A founder may remove an approved lead without deleting the client.
 const removedApproved=await crm.delete(founder,approved.id,attributed.version);
 assert.equal(removedApproved.deleted,true);
 const preservedClient=await db.client.findUniqueOrThrow({where:{id:client.id}});
 assert.equal(preservedClient.sourceLeadId,null);
 assert.equal(preservedClient.businessName,"Big Mo Cafe");
 assert.equal(await db.lead.count({where:{id:approved.id}}),0);
 assert.equal(await db.leadActivity.count({where:{leadId:approved.id}}),0);
 const knownClient=await crm.ingestWhatsApp(org.id,owner.id,"919876543210");
 assert.equal(knownClient.created,false);
 assert.equal(knownClient.id,client.id);
 assert.equal(await db.lead.count({where:{id:approved.id}}),0);
 assert.equal(await db.lead.count({where:{organizationId:org.id,normalizedPhone:"919876543210"}}),0);
 assert.equal((await crm.metrics(founder)).converted,0);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,action:"leads.deleted"}}))>=2);
 // Cold-call outcomes are real persisted statuses; pending notes survive reopening.
 const call=await crm.create(founder,{phone:"919555000111",source:"COLD_CALL"});
 const pendingNote=await crm.update(employee,call.id,{version:call.version,status:"PENDING",
  stageNote:"Call scheduled for tomorrow"});
 assert.equal(pendingNote.stageNote,"Call scheduled for tomorrow");
 assert.equal((await crm.detail(founder,call.id)).stageNote,"Call scheduled for tomorrow");
 const busyCall=await crm.update(employee,call.id,{version:pendingNote.version,
  status:"CALL_BUSY",stageNote:"Line busy, retry this evening"});
 assert.equal(busyCall.status,"CALL_BUSY");
 assert.equal((await crm.detail(founder,call.id)).stageNote,"Line busy, retry this evening");
 const notPicking=await crm.update(employee,call.id,{version:busyCall.version,
  status:"CALL_NOT_PICKING",stageNote:"No answer on follow-up"});
 assert.equal(notPicking.status,"CALL_NOT_PICKING");
 assert.equal((await crm.list(founder,{stage:"CALL_NOT_PICKING",limit:30})).items[0]?.id,call.id);

 // Verify server-side page boundaries with more than ten persisted leads.
 const batchRows=Array.from({length:12},(_,i)=>({phone:"91970000"+String(i+1).padStart(4,"0"),source:"COLD_CALL" as const}));
 assert.equal((await crm.import(founder,randomUUID(),batchRows)).count,12);
 const pageOne=await crm.list(founder,{limit:10,sort:"createdAt",direction:"desc"});
 assert.equal(pageOne.total,await db.lead.count({where:{organizationId:org.id,deletedAt:null}}));
 assert.ok(pageOne.total>10);
 assert.equal(pageOne.items.length,10);
 assert.ok(pageOne.nextCursor);
 const pageTwo=await crm.list(founder,{limit:10,sort:"createdAt",direction:"desc",cursor:pageOne.nextCursor!});
 assert.equal(pageTwo.total,pageOne.total);
 assert.ok(pageTwo.items.length>0&&pageTwo.items.length<=10);
 const firstIds=new Set(pageOne.items.map(x=>x.id));
 assert.ok(pageTwo.items.every(x=>!firstIds.has(x.id)));
 for(const entry of [...pageOne.items,...pageTwo.items]){
  assert.ok(entry.createdAt instanceof Date);
  assert.equal(Number.isNaN(entry.createdAt.getTime()),false);
 }

 // Sidebar meetings register uses a different, date-sorted paginated endpoint.
 const morningDraft=await crm.create(founder,{phone:"919812340501"});
 const afternoonDraft=await crm.create(founder,{phone:"919812340502"});
 const morning=await crm.update(founder,morningDraft.id,{version:morningDraft.version,
   status:"MEETING_PROCESS",meetingOn:"2026-10-27",meetingTime:"09:15",
   businessName:"Morning cafe",contactName:"Manager A",location:"17 Main Road, Prayagraj"});
 const afternoon=await crm.update(founder,afternoonDraft.id,{version:afternoonDraft.version,
   status:"MEETING_PROCESS",meetingOn:"2026-10-28",meetingTime:"15:45",
   businessName:"Afternoon hotel",contactName:"Manager B"});
 const firstMeetings=await crm.scheduledMeetings(founder,{limit:1});
 assert.equal(firstMeetings.total,2);
 assert.equal(firstMeetings.items.length,1);
 assert.equal(firstMeetings.items[0]?.id,morning.id);
 assert.equal(firstMeetings.items[0]?.location,"17 Main Road, Prayagraj");
 assert.equal(firstMeetings.items[0]?.meetingAt?.toISOString(),"2026-10-27T03:45:00.000Z");
 assert.ok(firstMeetings.nextCursor);
 const secondMeetings=await crm.scheduledMeetings(founder,{limit:1,cursor:firstMeetings.nextCursor!});
 assert.equal(secondMeetings.total,2);
 assert.equal(secondMeetings.items[0]?.id,afternoon.id);
 assert.equal(secondMeetings.items[0]?.location,null);
 assert.equal(secondMeetings.nextCursor,null);
 assert.equal((await crm.scheduledMeetings(foreign,{limit:20})).total,0);
 await assert.rejects(()=>crm.scheduledMeetings(actor(owner.id,org.id,[],[]),{limit:20}),fail(403));
 const removedMeeting=await crm.update(founder,morning.id,{version:morning.version,status:"DECISION_PENDING"});
 assert.equal(removedMeeting.meetingAt,null);
 assert.equal((await crm.scheduledMeetings(founder,{limit:20})).total,1);

 console.info("Module 7 PASS: phone-only lead, shared editing, atomic Approved conversion, history, webhook dedupe, tenant isolation and import.");
}finally{await db.$disconnect();}
