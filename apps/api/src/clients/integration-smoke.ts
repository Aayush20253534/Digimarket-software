import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { ClientsService } from "./service";
import { LeadsService } from "../leads/service";

if(process.env.NODE_ENV!=="test" || !process.env.DATABASE_URL?.includes("digimarket_ci")){
 throw new Error("Module 8 integration requires isolated digimarket_ci PostgreSQL");
}
const db=createDatabaseClient(),clients=new ClientsService(db),leads=new LeadsService(db);
const actor=(id:string,org:string,grants:string[]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles:["ADMIN"],permissions:new Set(grants),
});
const grants=["clients.read","clients.create","clients.edit","leads.read","leads.create","leads.edit","leads.convert"];
try {
 const organization=await db.organization.create({data:{name:"Clients CI Organization A"}});
 const elsewhere=await db.organization.create({data:{name:"Clients CI Organization B"}});
 const owner=await db.user.create({data:{organizationId:organization.id,loginId:"client-owner",displayName:"Owner",status:"ACTIVE"}});
 const stranger=await db.user.create({data:{organizationId:elsewhere.id,loginId:"client-other",displayName:"Other",status:"ACTIVE"}});
 const admin=actor(owner.id,organization.id,grants);
 const external=actor(stranger.id,elsewhere.id,grants);
 const readonly=actor(owner.id,organization.id,["clients.read"]);
 const noConvert=actor(owner.id,organization.id,["clients.read","clients.create","leads.read"]);
 const fromLead=await leads.create(admin,{businessName:"First Cafe",phone:"9876543210",
   contactName:"Founder",location:"Prayagraj"});
 await assert.rejects(()=>clients.convert(admin,fromLead.id,fromLead.version),
   (e:{status?:number})=>e.status===422);
 const won=await leads.update(admin,fromLead.id,{version:1,status:"WON"});
 await assert.rejects(()=>clients.convert(noConvert,won.id,won.version),
   (e:{status?:number})=>e.status===403);
 await assert.rejects(()=>clients.convert(external,won.id,won.version),
   (e:{status?:number})=>e.status===404);
 await assert.rejects(()=>clients.convert(admin,won.id,1),
   (e:{status?:number})=>e.status===409);
 const converted=await clients.convert(admin,won.id,won.version);
 assert.equal(converted.sourceLeadId,won.id);
 assert.equal(converted.organizationId,organization.id);
 assert.equal(converted.businessName,"First Cafe");
 assert.equal((await clients.detail(admin,converted.id)).contacts.length,1);
 assert.equal((await db.lead.findUniqueOrThrow({where:{id:won.id}})).version,3);
 await assert.rejects(()=>clients.convert(admin,won.id,3),
   (e:{status?:number})=>e.status===409);
 assert.equal(await db.client.count({where:{sourceLeadId:won.id}}),1);
 const alone=await clients.create(admin,{businessName:"Direct Business",instagramUrl:"https://instagram.com/business"});
 assert.equal(alone.sourceLeadId,null);
 assert.equal((await clients.list(admin,{limit:30})).items.length,2);
 assert.equal((await clients.list(external,{limit:30})).items.length,0);
 await assert.rejects(()=>clients.detail(external,converted.id),(e:{status?:number})=>e.status===404);
 await assert.rejects(()=>clients.update(external,converted.id,{version:1,status:"PAUSED"}),
   (e:{status?:number})=>e.status===404);
 await assert.rejects(()=>clients.addContact(external,converted.id,{name:"Foreign",isPrimary:true}),
   (e:{status?:number})=>e.status===404);
 await assert.rejects(()=>clients.addService(readonly,converted.id,{name:"SEO",status:"ACTIVE"}),
   (e:{status?:number})=>e.status===403);
 const edited=await clients.update(admin,converted.id,{version:1,status:"PAUSED",businessName:"First Cafe Updated"});
 assert.equal(edited.version,2);assert.equal(edited.status,"PAUSED");
 await assert.rejects(()=>clients.update(admin,converted.id,{version:1,status:"ACTIVE"}),
   (e:{status?:number})=>e.status===409);
 const contact=await clients.addContact(admin,converted.id,{name:"Marketing head",role:"Manager",isPrimary:true});
 assert.ok(contact.id);
 const detail=await clients.detail(admin,converted.id);
 assert.equal(detail.contacts.filter(c=>c.isPrimary).length,1);
 assert.equal(detail.contacts.find(c=>c.isPrimary)?.name,"Marketing head");
 const service=await clients.addService(admin,converted.id,{name:"SEO",description:"Search optimization",status:"ACTIVE"});
 assert.equal(service.name,"SEO");
 const page=await clients.list(admin,{limit:1});
 assert.equal(page.items.length,1);assert.ok(page.nextCursor);
 const second=await clients.list(admin,{limit:1,cursor:page.nextCursor!});
 assert.equal(second.items.length,1);assert.notEqual(second.items[0].id,page.items[0].id);
 assert.equal((await clients.list(admin,{limit:30,status:"PAUSED"})).items.length,1);
 assert.equal((await clients.list(admin,{limit:30,q:"Updated"})).items.length,1);
 assert.equal((await clients.list(readonly,{limit:30})).items.length,2);
 await assert.rejects(()=>clients.create(readonly,{businessName:"Forbidden"}),(e:{status?:number})=>e.status===403);
 assert.ok((await db.auditLog.count({where:{organizationId:organization.id,entityType:"Client"}}))>=3);
 assert.equal((await db.outboxEvent.count({where:{organizationId:organization.id,kind:"lead.converted"}})),1);
 console.info("Module 8 PASS: won-only atomic conversion, uniqueness, organization isolation, grants, client CRUD, optimistic versions, contacts, services, pagination, outbox.");
}finally{await db.$disconnect();}
