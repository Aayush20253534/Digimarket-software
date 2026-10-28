import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { ClientsService } from "./service";
import { LeadsService } from "../leads/service";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Clients integration requires isolated digimarket_ci PostgreSQL");
const db=createDatabaseClient(),clients=new ClientsService(db),leads=new LeadsService(db);
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
 const updated=await clients.update(team,client.id,{version:1,businessName:"Agency Cafe Updated",businessType:"Hospitality"});
 assert.equal(updated.version,2);
 assert.equal(updated.businessType,"Hospitality");
 const agreement=await clients.update(team,client.id,{
   version:2,contractStartOn:"2026-10-29",contractEndOn:"2026-11-28",
   monthlyFee:"15000.00",monthlyAdBudget:"3000.00",
 });
 assert.equal(agreement.monthlyFee?.toFixed(4),"15000.0000");
 assert.equal(agreement.contractEndOn?.toISOString().slice(0,10),"2026-11-28");
 await assert.rejects(()=>clients.update(team,client.id,{version:agreement.version,
   contractStartOn:"2026-12-01",contractEndOn:"2026-11-01"}),fail(422));
 await assert.rejects(()=>clients.update(team,client.id,{version:agreement.version,
   contractEndOn:"2026-10-01"}),fail(422));
 await assert.rejects(()=>clients.update(manager,client.id,{version:1,status:"PAUSED"}),fail(409));
 const contact=await clients.addContact(team,client.id,{name:"Manager",role:"Marketing",isPrimary:true});
 assert.ok(contact.id);
 assert.equal((await clients.detail(team,client.id)).contacts.filter(c=>c.isPrimary).length,1);
 const service=await clients.addService(team,client.id,{name:"SEO",description:"Search",status:"ACTIVE",monthlyTarget:4});
 assert.equal(service.name,"SEO");
 assert.equal(service.monthlyTarget,4);
 const modified=await clients.updateService(team,client.id,service.id,{name:"SEO",description:"Search optimization",status:"ACTIVE",monthlyTarget:6});
 assert.equal(modified.monthlyTarget,6);
 await assert.rejects(()=>clients.updateService(external,client.id,service.id,{name:"Hijack",status:"ACTIVE"}),fail(404));
 await assert.rejects(()=>clients.updateService(team,client.id,outsider.id,{name:"Unknown",status:"ACTIVE"}),fail(404));
 const delivery=await clients.deliverySummary(team);
 assert.equal(delivery.items.length,1);
 assert.equal(delivery.items[0].businessName,"Agency Cafe Updated");
 assert.equal(delivery.items[0].targets[0].monthlyTarget,6);
 assert.equal(delivery.items[0].totalDeliverables,0);
 assert.equal((await clients.deliverySummary(external)).items.length,0);
 await assert.rejects(()=>clients.deliverySummary(actor(member.id,org.id,[])),fail(403));
 assert.equal((await clients.list(manager,{limit:30,q:"Updated"})).items.length,1);
 assert.equal((await clients.list(manager,{limit:30,status:"PAUSED"})).items.length,0);
 assert.equal((await db.client.count({where:{sourceLeadId:created.id}})),1);
 assert.equal((await db.outboxEvent.count({where:{eventKey:"lead-converted:"+created.id}})),1);
 console.info("Module 8 PASS: no manual clients, automatic lead approval, common tenant visibility and safe client editing.");
}finally{await db.$disconnect();}
