import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { ClientsService } from "./service";
import { ServiceDeliveryService,datesInRange } from "./delivery-service";
import { ClientVideoReadinessService,monthWeeks } from "./video-readiness-service";
import { ClientPostReadinessService } from "./post-readiness-service";
import { LeadsService } from "../leads/service";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Clients integration requires isolated digimarket_ci PostgreSQL");
const db=createDatabaseClient(),clients=new ClientsService(db),leads=new LeadsService(db),deliveries=new ServiceDeliveryService(db),videos=new ClientVideoReadinessService(db),posts=new ClientPostReadinessService(db);
const actor=(id:string,org:string,grants:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles:["FOUNDER"],permissions:new Set(grants),
});
const full=["clients.read","clients.create","clients.edit","leads.read","leads.create","leads.edit","leads.convert"];
const fail=(status:number)=>(error:{status?:number})=>error.status===status;
try{
 const org=await db.organization.create({data:{name:"Clients Shared CI"}});
 const other=await db.organization.create({data:{name:"Other Clients CI"}});
 const [owner,member,outsider]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"client-owner",displayName:"Owner",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"client-member",displayName:"Member",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:other.id,loginId:"client-outside",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const manager=actor(owner.id,org.id,full),team=actor(member.id,org.id,["clients.read","clients.edit","leads.read","leads.edit.own","leads.convert"]),external=actor(outsider.id,other.id,full);
 await assert.rejects(()=>clients.create(manager,{businessName:"Manual client"}),fail(405));
 const created=await leads.create(manager,{phone:"919876543210"});
 assert.equal((await clients.list(manager,{limit:30})).items.length,0);
 const approved=await leads.update(team,created.id,{version:created.version,status:"APPROVED",
  businessName:"Agency Cafe",contactName:"Owner",businessType:"Cafe",stageNote:"Meeting successful"});
 assert.equal(approved.status,"APPROVED");
 const client=await db.client.findUniqueOrThrow({where:{sourceLeadId:created.id}});
 assert.equal(client.businessName,"Agency Cafe");
 assert.equal(client.phone,"919876543210");
 assert.equal((await clients.detail(team,client.id)).contacts.length,1);
 assert.equal((await clients.list(team,{limit:30})).items.length,1);
 assert.equal((await clients.list(external,{limit:30})).items.length,0);
 await assert.rejects(()=>clients.convert(manager,created.id,approved.version),fail(405));
 await assert.rejects(()=>clients.update(external,client.id,{version:1,businessName:"Wrong tenant"}),fail(404));
 await assert.rejects(()=>clients.detail(external,client.id),fail(404));
 // Weekly client video readiness: ready stock is produced once and delivered
 // once, with carry-over between months and no future negative stock.
 assert.equal(monthWeeks("2026-02").length,4);
 assert.equal(monthWeeks("2028-02").length,5);
 const emptyVideos=await videos.monthly(manager,client.id,"2026-11");
 assert.equal(emptyVideos.remainingStock,0);
 assert.equal(emptyVideos.weeks.length,5);
 const ready=await videos.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:6,delivered:0,note:"Six edited reels in stock",version:0});
 assert.equal(ready.version,1);
 await assert.rejects(()=>videos.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:7,delivered:0,version:0}),fail(409));
 await videos.saveWeek(team,client.id,"2026-11",2,
  {readyAdded:0,delivered:3,note:"Three client deliveries",version:0});
 let stock=await videos.monthly(manager,client.id,"2026-11");
 assert.equal(stock.readyThisMonth,6);
 assert.equal(stock.deliveredThisMonth,3);
 assert.equal(stock.remainingStock,3);
 assert.equal(stock.weeks[0].remainingStock,6);
 assert.equal(stock.weeks[1].availableBefore,6);
 assert.equal(stock.weeks[1].remainingStock,3);
 const dec=await videos.monthly(manager,client.id,"2026-12");
 assert.equal(dec.openingStock,3);
 assert.equal(dec.remainingStock,3);
 await videos.saveWeek(team,client.id,"2026-12",1,
  {readyAdded:2,delivered:4,note:"Four delivered in December",version:0});
 stock=await videos.monthly(manager,client.id,"2026-12");
 assert.equal(stock.openingStock,3);
 assert.equal(stock.remainingStock,1);
 await assert.rejects(()=>videos.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:4,delivered:0,note:"Backdated shortage",version:1}),fail(422));
 await assert.rejects(()=>videos.saveWeek(manager,client.id,"2026-11",2,
  {readyAdded:0,delivered:8,version:1}),fail(422));
 await assert.rejects(()=>videos.saveWeek(manager,client.id,"2026-02",5,
  {readyAdded:1,delivered:0,version:0}),fail(422));
 const corrected=await videos.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:7,delivered:0,note:"Corrected stock",version:1});
 assert.equal(corrected.version,2);
 assert.equal((await videos.monthly(team,client.id,"2026-12")).remainingStock,2);
 const viewer=actor(member.id,org.id,["clients.read"]);
 await assert.rejects(()=>videos.saveWeek(viewer,client.id,"2026-11",3,
  {readyAdded:1,delivered:0,version:0}),fail(403));
 await assert.rejects(()=>videos.monthly(external,client.id,"2026-11"),fail(404));
 await assert.rejects(()=>videos.saveWeek(external,client.id,"2026-11",3,
  {readyAdded:10,delivered:0,version:0}),fail(404));
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,
  action:"clients.video_readiness_saved",entityId:client.id}}))>=4);
 
 // Post readiness is an independent stock ledger. Post edits never change videos.
 const initialPosts=await posts.monthly(manager,client.id,"2026-11");
 assert.equal(initialPosts.remainingStock,0);
 assert.equal(initialPosts.weeks.length,5);
 const firstPost=await posts.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:10,delivered:0,note:"Ten completed graphics",version:0});
 assert.equal(firstPost.version,1);
 await posts.saveWeek(team,client.id,"2026-11",2,
  {readyAdded:2,delivered:6,note:"Six posts delivered",version:0});
 const novPosts=await posts.monthly(manager,client.id,"2026-11");
 assert.equal(novPosts.readyThisMonth,12);
 assert.equal(novPosts.deliveredThisMonth,6);
 assert.equal(novPosts.remainingStock,6);
 assert.equal(novPosts.weeks[1].availableBefore,10);
 assert.equal((await posts.monthly(manager,client.id,"2026-12")).openingStock,6);
 await posts.saveWeek(team,client.id,"2026-12",1,
  {readyAdded:1,delivered:4,note:"Four December deliveries",version:0});
 assert.equal((await posts.monthly(manager,client.id,"2026-12")).remainingStock,3);
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:11,delivered:0,version:0}),fail(409));
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:5,delivered:0,version:1}),fail(422));
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-11",2,
  {readyAdded:0,delivered:15,version:1}),fail(422));
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-02",5,
  {readyAdded:1,delivered:0,version:0}),fail(422));
 const postUpdated=await posts.saveWeek(manager,client.id,"2026-11",1,
  {readyAdded:11,delivered:0,note:"Updated stock",version:1});
 assert.equal(postUpdated.version,2);
 assert.equal((await posts.monthly(team,client.id,"2026-12")).remainingStock,4);
 assert.equal((await videos.monthly(team,client.id,"2026-12")).remainingStock,2);
 await assert.rejects(()=>posts.saveWeek(viewer,client.id,"2026-11",3,
  {readyAdded:1,delivered:0,version:0}),fail(403));
 await assert.rejects(()=>posts.monthly(external,client.id,"2026-11"),fail(404));
 await assert.rejects(()=>posts.saveWeek(external,client.id,"2026-11",3,
  {readyAdded:2,delivered:0,version:0}),fail(404));
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,
  action:"clients.post_readiness_saved",entityId:client.id}}))>=4);

 // Festival posts are counted separately and must never consume regular stock.
 const festivalWeek=await posts.saveWeek(manager,client.id,"2026-11",3,{
  readyAdded:0,delivered:0,festivalReadyAdded:3,festivalDelivered:1,
  festivalNote:"Chhath creative",version:0
 });
 assert.equal(festivalWeek.festivalReadyAdded,3);
 await posts.saveWeek(team,client.id,"2026-11",4,{
  readyAdded:0,delivered:0,festivalReadyAdded:0,festivalDelivered:1,
  festivalNote:"Festival post published",version:0
 });
 let festivalMonth=await posts.monthly(manager,client.id,"2026-11");
 assert.equal(festivalMonth.festivalReadyThisMonth,3);
 assert.equal(festivalMonth.festivalDeliveredThisMonth,2);
 assert.equal(festivalMonth.festivalRemainingStock,1);
 assert.equal(festivalMonth.remainingStock,7);
 assert.equal(festivalMonth.weeks[2].festivalAvailableBefore,0);
 assert.equal(festivalMonth.weeks[2].festivalRemainingStock,2);
 assert.equal((await posts.monthly(manager,client.id,"2026-12")).festivalOpeningStock,1);
 // December already has a regular post movement at version 1.
 await posts.saveWeek(manager,client.id,"2026-12",1,{
  readyAdded:1,delivered:4,festivalReadyAdded:0,festivalDelivered:1,version:1
 });
 const decemberPosts=await posts.monthly(manager,client.id,"2026-12");
 assert.equal(decemberPosts.festivalRemainingStock,0);
 assert.equal(decemberPosts.remainingStock,4);
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-11",3,{
  readyAdded:0,delivered:0,festivalReadyAdded:1,festivalDelivered:1,version:1
 }),fail(422));
 await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-11",4,{
  readyAdded:0,delivered:0,festivalReadyAdded:0,festivalDelivered:10,version:1
 }),fail(422));
 // Older apps that omit festival fields must preserve the existing inventory.
 await posts.saveWeek(manager,client.id,"2026-11",3,{
  readyAdded:0,delivered:0,note:"Legacy regular post update",version:1
 });
 festivalMonth=await posts.monthly(manager,client.id,"2026-11");
 assert.equal(festivalMonth.festivalRemainingStock,1);
 assert.equal(festivalMonth.weeks[2].festivalNote,"Chhath creative");
 assert.equal((await posts.monthly(manager,client.id,"2026-12")).festivalRemainingStock,0);


 const updated=await clients.update(team,client.id,{version:1,businessName:"Agency Cafe Updated",businessType:"Hospitality"});
 assert.equal(updated.version,2);
 assert.equal(updated.businessType,"Hospitality");
 const agreement=await clients.update(team,client.id,{
   version:2,contractStartOn:"2026-10-29",contractEndOn:"2026-11-28",
   monthlyFee:"15000.00",monthlyAdBudget:"3000.00",
 });
 assert.equal(agreement.monthlyFee?.toFixed(4),"15000.0000");
 assert.equal(agreement.contractEndOn?.toISOString().slice(0,10),"2026-11-28");
  // Both trackers must share the same dates and reject weeks outside contract.
  const firstContractVideo=await videos.monthly(manager,client.id,"2026-10");
  assert.deepEqual(firstContractVideo.weeks.map(w=>[w.from,w.to]),[["2026-10-29","2026-11-04"]]);
  const contractPosts=await posts.monthly(manager,client.id,"2026-11");
  assert.deepEqual(contractPosts.weeks.map(w=>[w.from,w.to]),[
   ["2026-11-05","2026-11-11"],["2026-11-12","2026-11-18"],
   ["2026-11-19","2026-11-25"],["2026-11-26","2026-11-28"]
  ]);
  assert.equal((await videos.monthly(manager,client.id,"2026-12")).weeks.length,0);
  assert.equal((await posts.monthly(manager,client.id,"2026-12")).weeks.length,0);
  await assert.rejects(()=>videos.saveWeek(manager,client.id,"2026-12",2,
   {readyAdded:1,delivered:0,version:0}),fail(422));
  await assert.rejects(()=>posts.saveWeek(manager,client.id,"2026-12",2,
   {readyAdded:1,delivered:0,version:0}),fail(422));
 await assert.rejects(()=>clients.update(team,client.id,{version:agreement.version,
   contractStartOn:"2026-12-01",contractEndOn:"2026-11-01"}),fail(422));
 await assert.rejects(()=>clients.update(team,client.id,{version:agreement.version,
   contractEndOn:"2026-10-01"}),fail(422));
 await assert.rejects(()=>clients.update(manager,client.id,{version:1,status:"PAUSED"}),fail(409));
 const contact=await clients.addContact(team,client.id,{name:"Manager",role:"Marketing",isPrimary:true});
 assert.ok(contact.id);
 assert.equal((await clients.detail(team,client.id)).contacts.filter(c=>c.isPrimary).length,1);
 const service=await clients.addService(team,client.id,{name:"SEO",description:"Search",status:"ACTIVE"});
 assert.equal(service.name,"SEO");
 assert.equal(service.monthlyTarget,null);
 const modified=await clients.updateService(team,client.id,service.id,{name:"SEO",description:"Search optimization",status:"ACTIVE"});
 assert.equal(modified.monthlyTarget,null);
 await assert.rejects(()=>clients.updateService(external,client.id,service.id,{name:"Hijack",status:"ACTIVE"}),fail(404));
 await assert.rejects(()=>clients.updateService(team,client.id,outsider.id,{name:"Unknown",status:"ACTIVE"}),fail(404));
 const thursdays=datesInRange("2026-10-28","2026-11-28",[4]);
 assert.deepEqual(thursdays,["2026-10-29","2026-11-05","2026-11-12","2026-11-19","2026-11-26"]);
 assert.equal(datesInRange("2026-10-28","2026-11-28",[1]).length,4);
 assert.deepEqual(datesInRange("2026-11-07","2026-11-07",[]),["2026-11-07"]);
 assert.deepEqual(datesInRange("2026-11-07","2026-11-28",[]),[]);
 assert.deepEqual(datesInRange("2026-10-28","2026-11-08",[],2),
  ["2026-10-28","2026-10-30","2026-11-01","2026-11-03","2026-11-05","2026-11-07"]);
 assert.deepEqual(datesInRange("2026-10-28","2026-11-08",[],3),
  ["2026-10-28","2026-10-31","2026-11-03","2026-11-06"]);
 assert.deepEqual(datesInRange("2026-10-28","2026-11-08",[],4),
  ["2026-10-28","2026-11-01","2026-11-05"]);
 assert.deepEqual(datesInRange("2026-10-28","2026-11-08",[4],3),[]);
 const managerSchedule=await deliveries.create(manager,{
  clientId:client.id,title:"Weekly video shooting",assigneeId:member.id,
  startOn:"2025-10-28",endOn:"2025-11-28",weekdays:[4],
 });
 const assignee={...team,roles:["EMPLOYEE"],permissions:new Set(["clients.read"])};
 const plan=await deliveries.list(assignee,{mine:"true"});
 assert.equal(plan.items.length,1);
 assert.equal(plan.items[0].occurrences.length,5);
 assert.equal((await deliveries.list(manager,{clientId:client.id})).items.length,1);
 assert.equal((await deliveries.list(external,{})).items.length,0);
 const occurrence=plan.items[0].occurrences[0];
 const completed=await deliveries.complete(assignee,managerSchedule.id,occurrence.id,{version:occurrence.version,completed:true});
 assert.equal(completed.status,"COMPLETED");
 await assert.rejects(()=>deliveries.complete(assignee,managerSchedule.id,occurrence.id,{version:occurrence.version,completed:true}),fail(409));
 await assert.rejects(()=>deliveries.complete(external,managerSchedule.id,occurrence.id,{version:completed.version,completed:false}),fail(404));
 const changed=await deliveries.update(manager,managerSchedule.id,{
  version:managerSchedule.version,title:"Video editing",assigneeId:owner.id,
  serviceId:null,startOn:"2025-10-28",endOn:"2025-11-28",weekdays:[4],active:true,
 });
 assert.equal(changed.assigneeId,owner.id);
 assert.equal((await deliveries.list(assignee,{mine:"true"})).items.length,0);
 assert.equal((await deliveries.list(manager,{clientId:client.id})).items[0].occurrences.filter(x=>x.status==="COMPLETED").length,1);
 const oneTime=await deliveries.create(manager,{clientId:client.id,title:"One-time website delivery",assigneeId:member.id,
  startOn:"2025-11-07",endOn:"2025-11-07",weekdays:[]});
 const single=await deliveries.list(manager,{clientId:client.id});
 assert.equal(single.items.find(x=>x.id===oneTime.id)?.occurrences.length,1);
 const onceOccurrence=single.items.find(x=>x.id===oneTime.id)?.occurrences[0];
 assert.ok(onceOccurrence);
 assert.equal((await deliveries.complete(assignee,oneTime.id,onceOccurrence.id,{version:onceOccurrence.version,completed:true})).status,"COMPLETED");
 await assert.rejects(()=>deliveries.create(manager,{clientId:client.id,title:"Invalid one-time range",assigneeId:member.id,
  startOn:"2025-11-07",endOn:"2025-11-08",weekdays:[]}),fail(422));
 assert.equal(await db.task.count({where:{organizationId:org.id}}),0);
 await assert.rejects(()=>deliveries.create(assignee,{clientId:client.id,title:"Unauthorized",assigneeId:member.id,
  startOn:"2026-10-28",endOn:"2026-11-28",weekdays:[4]}),fail(403));
 await assert.rejects(()=>deliveries.create(manager,{clientId:client.id,title:"Invalid owner",assigneeId:outsider.id,
  startOn:"2026-10-28",endOn:"2026-11-28",weekdays:[4]}),fail(422));
 const delivery=await clients.deliverySummary(team);
 assert.equal(delivery.items.length,1);
 assert.equal(delivery.items[0].businessName,"Agency Cafe Updated");
 assert.ok(!("targets" in delivery.items[0]));
 assert.equal(delivery.items[0].scheduledOccurrences,6);
 assert.equal(delivery.items[0].completedOccurrences,2);
 assert.equal(delivery.items[0].totalDeliverables,0);
 const interval=await deliveries.create(manager,{clientId:client.id,title:"Three-day reel editing",assigneeId:member.id,
  startOn:"2025-10-28",endOn:"2025-11-08",weekdays:[],repeatEveryDays:3});
 const intervalItems=(await deliveries.list(manager,{clientId:client.id})).items.find(x=>x.id===interval.id);
 assert.equal(intervalItems?.repeatEveryDays,3);
 assert.deepEqual(intervalItems?.occurrences.map(o=>o.scheduledOn.toISOString().slice(0,10)),
  ["2025-10-28","2025-10-31","2025-11-03","2025-11-06"]);
 assert.ok(intervalItems);
 const firstInterval=intervalItems.occurrences[0];
 assert.equal((await deliveries.complete(assignee,interval.id,firstInterval.id,{version:firstInterval.version,completed:true})).status,"COMPLETED");
 await assert.rejects(()=>deliveries.create(manager,{clientId:client.id,title:"Conflicting recurrence",assigneeId:member.id,
  startOn:"2026-11-01",endOn:"2026-11-20",weekdays:[2],repeatEveryDays:3}),fail(422));
 const updatedStart=new Date(Date.now()+3*86_400_000).toISOString().slice(0,10);
 const updatedStartTime=Date.parse(updatedStart+"T00:00:00Z");
 const updatedEnd=new Date(updatedStartTime+12*86_400_000).toISOString().slice(0,10);
 const expectedUpdatedDates=Array.from({length:7},(_,index)=>
  new Date(updatedStartTime+index*2*86_400_000).toISOString().slice(0,10));
 const intervalUpdated=await deliveries.update(manager,interval.id,{
  version:interval.version,title:"Every other day reel editing",assigneeId:member.id,serviceId:null,
  startOn:updatedStart,endOn:updatedEnd,weekdays:[],repeatEveryDays:2,active:true,
 });
 assert.equal(intervalUpdated.repeatEveryDays,2);
 const afterInterval=(await deliveries.list(manager,{clientId:client.id})).items.find(x=>x.id===interval.id);
 assert.equal(afterInterval?.occurrences.filter(o=>o.status==="COMPLETED").length,1);
 assert.deepEqual(afterInterval?.occurrences.filter(o=>o.scheduledOn>=new Date(updatedStartTime)).map(o=>o.scheduledOn.toISOString().slice(0,10)),
  expectedUpdatedDates);
 assert.equal((await clients.deliverySummary(external)).items.length,0);
 await assert.rejects(()=>clients.deliverySummary(actor(member.id,org.id,[])),fail(403));
 assert.equal((await clients.list(manager,{limit:30,q:"Updated"})).items.length,1);
 assert.equal((await clients.list(manager,{limit:30,status:"PAUSED"})).items.length,0);
 assert.equal((await db.client.count({where:{sourceLeadId:created.id}})),1);
 assert.equal((await db.outboxEvent.count({where:{eventKey:"lead-converted:"+created.id}})),1);
 console.info("Module 8 PASS: no manual clients, automatic lead approval, common tenant visibility and safe client editing.");
}finally{await db.$disconnect();}
