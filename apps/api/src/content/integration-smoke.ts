import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {ContentService} from "./service";
import {ApprovalService} from "../approvals/service";
if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 12 requires isolated digimarket_ci PostgreSQL");

const db=createDatabaseClient(),content=new ContentService(db),approvals=new ApprovalService(db);
const actor=(id:string,org:string,keys:string[],roles:string[]=["ADMIN"]):Principal=>({
 userId:id,organizationId:org,sessionId:"ci",roles,permissions:new Set(keys),
});
const full=["content.read","content.create","content.edit","content.manage","content.publish","content.approve",
 "clients.read","assets.read","approvals.submit","approvals.read","approvals.decide"];
const fail=(n:number)=>(e:{status?:number})=>e.status===n;
const createInput=(clientId:string)=>({clientId,title:"Café opening teaser",caption:"Coming soon!",
 platform:"INSTAGRAM" as const,format:"REEL" as const,
 hashtags:["#opening"],publishAt:"2026-12-01T10:30:00+05:30",assetIds:[] as string[]});
try{
 const org=await db.organization.create({data:{name:"Content CI A"}});
 const foreignOrg=await db.organization.create({data:{name:"Content CI B"}});
 const [admin,writer,reviewer,other,foreigner]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"content-admin",displayName:"Admin",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"content-writer",displayName:"Writer",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"content-reviewer",displayName:"Reviewer",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"content-other",displayName:"Other",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:foreignOrg.id,loginId:"content-outside",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const lead=actor(admin.id,org.id,full);
 const author=actor(writer.id,org.id,["content.read","content.create","content.edit","clients.read",
    "assets.read","approvals.read","approvals.submit"],["EMPLOYEE"]);
 const review=actor(reviewer.id,org.id,["content.read","content.approve","approvals.read","approvals.decide"],["ADMIN"]);
 const outsider=actor(other.id,org.id,["content.read","content.edit","approvals.read"],["EMPLOYEE"]);
 const external=actor(foreigner.id,foreignOrg.id,full);
 const client=await db.client.create({data:{organizationId:org.id,createdById:admin.id,businessName:"Cafe A"}});
 const wrong=await db.client.create({data:{organizationId:foreignOrg.id,createdById:foreigner.id,businessName:"Cafe B"}});
 await assert.rejects(()=>content.create(lead,createInput(wrong.id)),fail(404));
 const draft=await content.create(author,createInput(client.id));
 assert.equal(draft.status,"IDEA");assert.equal(draft.revision,1);
 assert.equal((await content.list(author,{limit:50})).items.length,1);
 assert.equal((await content.list(outsider,{limit:50})).items.length,0);
 assert.equal((await content.list(external,{limit:50})).items.length,0);
 await assert.rejects(()=>content.detail(external,draft.id),fail(404));
 await assert.rejects(()=>content.detail(outsider,draft.id),fail(404));
 await assert.rejects(()=>content.update(outsider,draft.id,{version:1,title:"Change"}),fail(404));
 await assert.rejects(()=>content.submit(author,draft.id,1),fail(422));
 await assert.rejects(()=>content.create(author,{...createInput(client.id),ownerId:other.id}),fail(403));
 await assert.rejects(()=>content.create(lead,{...createInput(client.id),assetIds:[randomUUID()]}),fail(404));
 const intent=await db.assetUploadIntent.create({data:{
  organizationId:org.id,createdById:admin.id,clientId:client.id,publicId:"digimarket/ci/"+randomUUID(),
  filename:"opening.png",contentType:"image/png",resourceType:"IMAGE",expectedBytes:200,status:"CONFIRMED",
  expiresAt:new Date(Date.now()+60000),
 }});
 const asset=await db.asset.create({data:{
  organizationId:org.id,uploadedById:admin.id,clientId:client.id,uploadIntentId:intent.id,
  providerAssetId:randomUUID(),publicId:intent.publicId,filename:"opening.png",
  contentType:"image/png",resourceType:"IMAGE",format:"png",bytes:200,
 }});
 const edited=await content.update(author,draft.id,{version:1,assetIds:[asset.id],caption:"Teaser v2"});
 const fileBlind=actor(writer.id,org.id,["content.read"],["EMPLOYEE"]);
 assert.equal((await content.detail(fileBlind,draft.id)).assets.length,0);
 assert.equal(edited.status,"DRAFT");assert.equal(edited.revision,2);
 await assert.rejects(()=>content.update(author,draft.id,{version:1,caption:"Old"}),fail(409));
 const policy=await db.approvalPolicy.create({data:{organizationId:org.id,category:"CONTENT",
  name:"Content policy",active:true,approverRoleKeys:["ADMIN"]}});
 assert.ok(policy.id);
 const one=await content.submit(author,draft.id,2);
 assert.equal(one.status,"IN_REVIEW");
 assert.equal((await approvals.list(review,"queue")).length,1);
 assert.equal((await approvals.list(lead,"queue")).length,1);
 const nonReviewer=actor(other.id,org.id,["approvals.read","approvals.decide"],["ADMIN"]);
 assert.equal((await approvals.list(nonReviewer,"queue")).length,0);
 await assert.rejects(()=>approvals.get(nonReviewer,one.approvalId),fail(404));
 await assert.rejects(()=>approvals.decide(nonReviewer,one.approvalId,{outcome:"APPROVED"}),fail(403));
 await assert.rejects(()=>content.update(author,draft.id,{version:3,caption:"Review bypass"}),fail(422));
 await assert.rejects(()=>approvals.decide(author,one.approvalId,{outcome:"APPROVED"}),fail(403));
 await approvals.decide(review,one.approvalId,{outcome:"REJECTED",reason:"Change the opening frame"});
 const afterRejection=await content.detail(author,draft.id);
 assert.equal(afterRejection.status,"CHANGES_REQUESTED");
 assert.equal(afterRejection.version,4);
 const revised=await content.update(author,draft.id,{version:4,caption:"Revised opening frame"});
 assert.equal(revised.revision,3);assert.equal(revised.approvalRequestId,null);
 assert.equal(await db.contentPostRevision.count({where:{postId:draft.id}}),3);
 await assert.rejects(()=>approvals.decide(review,one.approvalId,{outcome:"APPROVED"}),fail(409));
 const two=await content.submit(author,draft.id,5);
 await approvals.decide(review,two.approvalId,{outcome:"APPROVED"});
 const approved=await content.detail(author,draft.id);
 assert.equal(approved.status,"APPROVED");
 // Any edit after approval invalidates previous approval for the modified revision.
 const changed=await content.update(author,draft.id,{version:7,caption:"Changed after approval"});
 assert.equal(changed.status,"DRAFT");assert.equal(changed.revision,4);
 assert.equal(changed.approvalRequestId,null);
 await assert.rejects(()=>content.publish(lead,draft.id,changed.version,"https://instagram.com/p/old"),fail(422));
 const three=await content.submit(author,draft.id,changed.version);
 await approvals.decide(review,three.approvalId,{outcome:"APPROVED"});
 const current=await content.detail(lead,draft.id);
 assert.equal(current.status,"APPROVED");
 assert.equal(current.revision,4);
 const scheduled=await content.schedule(lead,draft.id,current.version);
 assert.equal(scheduled.status,"SCHEDULED");
 const published=await content.publish(lead,draft.id,scheduled.version,"https://www.instagram.com/p/example");
 assert.equal(published.status,"PUBLISHED");assert.equal(published.publishedById,admin.id);
 await assert.rejects(()=>content.publish(lead,draft.id,published.version,"https://www.instagram.com/p/example"),fail(422));
 await assert.rejects(()=>content.update(author,draft.id,{version:published.version,caption:"No"}),fail(422));
 assert.equal((await db.contentPostRevision.count({where:{postId:draft.id}})),4);
 assert.equal((await db.approvalDecision.count({where:{requestId:{in:[one.approvalId,two.approvalId,three.approvalId]}}})),3);
 assert.equal((await content.list(lead,{limit:20,clientId:client.id,status:"PUBLISHED"})).items.length,1);
 assert.equal((await content.list(lead,{limit:20,start:"2026-12-01T00:00:00Z",end:"2026-12-02T00:00:00Z"})).items.length,1);
 assert.equal((await db.outboxEvent.count({where:{organizationId:org.id,kind:"content.published"}})),1);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"ContentPost"}}))>=8);
 console.info("Module 12 PASS: organization/owner scoping, assets, immutable revisions, review ACL and rejection, reapproval, scheduling, manual publish, audit and outbox.");
}finally{await db.$disconnect();}
