import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@digimarket/db";
import { leadCreateSchema } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { LeadsService } from "./service";

if(process.env.NODE_ENV!=="test" || !process.env.DATABASE_URL?.includes("digimarket_ci")){
 throw new Error("Module 7 integration needs isolated digimarket_ci PostgreSQL");
}
const db=createDatabaseClient(),crm=new LeadsService(db);
const actor=(id:string,org:string,roles:string[],grants:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles,permissions:new Set(grants),
});
const all=["leads.read","leads.create","leads.edit","leads.assign","leads.bulk","leads.duplicates.review"];
try{
 const org=await db.organization.create({data:{name:"CRM Org A"}});
 const other=await db.organization.create({data:{name:"CRM Org B"}});
 const alice=await db.user.create({data:{organizationId:org.id,loginId:"crm-alice",displayName:"Alice",status:"ACTIVE"}});
 const bob=await db.user.create({data:{organizationId:org.id,loginId:"crm-bob",displayName:"Bob",status:"ACTIVE"}});
 const distant=await db.user.create({data:{organizationId:other.id,loginId:"crm-external",displayName:"External",status:"ACTIVE"}});
 const admin=actor(alice.id,org.id,["ADMIN"],all);
 const employee=actor(bob.id,org.id,["EMPLOYEE"],["leads.read","leads.create","leads.edit.own"]);
 const outside=actor(distant.id,other.id,["ADMIN"],all);
 const initial=await crm.create(admin,{businessName:"Big Mo's Café",phone:"+91 98765 43210",contactName:"Owner",
   businessType:"Cafe",location:"Prayagraj",source:"Google Maps",note:"Call tomorrow"});
 assert.equal(initial.status,"NEW");
 assert.equal((await crm.list(employee,{limit:30})).items.length,1);
 const publicView=await crm.detail(employee,initial.id);
 assert.equal(publicView.activities.length,0);
 assert.equal(publicView.canEdit,false);
 await assert.rejects(()=>crm.note(employee,initial.id,"Confidential"),(e:{status?:number})=>e.status===403);
 await assert.rejects(()=>crm.update(employee,initial.id,{version:1,status:"CONTACTED"}),(e:{status?:number})=>e.status===403);
 await assert.rejects(()=>crm.detail(outside,initial.id),(e:{status?:number})=>e.status===404);
 await assert.rejects(()=>crm.assign(outside,initial.id,1,bob.id),(e:{status?:number})=>e.status===404);
 await assert.rejects(()=>crm.assign(admin,initial.id,1,distant.id),(e:{status?:number})=>e.status===422);
 assert.equal((await crm.assignees(admin)).length,2);
 await assert.rejects(()=>crm.assignees(employee),(e:{status?:number})=>e.status===403);
 const assigned=await crm.assign(admin,initial.id,1,bob.id);
 assert.equal(assigned.version,2);
 const edited=await crm.update(employee,initial.id,{version:2,status:"CONTACTED",
   nextFollowUpAt:"2026-10-20T10:30:00+05:30"});
 assert.equal(edited.version,3);
 assert.equal(edited.status,"CONTACTED");
 assert.equal(edited.nextFollowUpAt?.toISOString(),"2026-10-20T05:00:00.000Z");
 await assert.rejects(()=>crm.update(employee,initial.id,{version:2,status:"PROPOSAL"}),
   (e:{status?:number})=>e.status===409);
 await crm.note(employee,initial.id,"Called the manager about their social media");
 const privateView=await crm.detail(employee,initial.id);
 assert.ok(privateView.activities.some(a=>a.note?.includes("Called the manager")));
 const match=await crm.create(employee,{businessName:"BIG MO'S CAFÉ",phone:"98765-43210",location:"Prayagraj"});
 const signals=await crm.duplicates(admin);
 assert.equal(signals.length,1);
 assert.equal(signals[0].reason,"PHONE_MATCH");
 assert.equal(signals[0].resolution,"OPEN");
 await assert.rejects(()=>crm.duplicates(employee),(e:{status?:number})=>e.status===403);
 assert.equal((await crm.resolveDuplicate(admin,signals[0].id,"CONFIRMED")).resolution,"CONFIRMED");
 await assert.rejects(()=>crm.resolveDuplicate(admin,signals[0].id,"DISMISSED"),
   (e:{status?:number})=>e.status===409);
 assert.equal(await db.lead.count({where:{organizationId:org.id}}),2);
 const lead=await crm.create(outside,{businessName:"Other org",phone:"9876543210"});
 assert.equal((await crm.list(admin,{limit:30})).items.length,2);
 assert.equal((await crm.list(outside,{limit:30})).items.length,1);
 assert.notEqual(lead.organizationId,initial.organizationId);
 const browse=await crm.list(admin,{limit:1});
 assert.equal(browse.items.length,1);
 assert.ok(browse.nextCursor);
 const rest=await crm.list(admin,{limit:1,cursor:browse.nextCursor!});
 assert.equal(rest.items.length,1);
 assert.notEqual(rest.items[0].id,browse.items[0].id);
 assert.equal((await crm.list(admin,{stage:"CONTACTED",limit:30})).items.length,1);
 assert.equal((await crm.list(admin,{q:"Café",limit:30})).items.length,2);
 assert.equal(leadCreateSchema.safeParse({businessName:"",phone:"1"}).success,false);
 const batch=randomUUID();
 const imported=await crm.import(admin,batch,[{businessName:"Prospect A"},{businessName:"Prospect B"}]);
 assert.equal(imported.count,2);
 await assert.rejects(()=>crm.import(admin,batch,[{businessName:"Prospect A"}]),
   (e:{status?:number})=>e.status===409);
 assert.equal(await db.lead.count({where:{organizationId:org.id}}),4);
 await assert.rejects(()=>crm.import(employee,randomUUID(),[{businessName:"Forbidden import"}]),
   (e:{status?:number})=>e.status===403);
 const before=await db.lead.count({where:{organizationId:org.id}});
 await assert.rejects(()=>crm.import(admin,randomUUID(),[
  {businessName:"Rollback test 1"},{businessName:"Rollback test 2",phone:"not digits"}
 ]),(e:{status?:number})=>e.status===422);
 assert.equal(await db.lead.count({where:{organizationId:org.id}}),before);
 const csv=await crm.export(admin);
 assert.ok(csv.csv.includes("BIG MO'S CAFÉ"));
 await assert.rejects(()=>crm.export(employee),(e:{status?:number})=>e.status===403);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"Lead"}}))>=5);
 console.info("Module 7 PASS: isolation, optimistic version, private activity, follow-up TZ, duplicate review, owner validation, cursor, bulk idempotency, export.");
}finally{await db.$disconnect();}
