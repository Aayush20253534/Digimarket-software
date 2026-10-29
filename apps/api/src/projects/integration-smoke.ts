import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { ProjectsService } from "./service";
import { ApprovalService } from "../approvals/service";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
  throw new Error("Module 10 tests require disposable digimarket_ci PostgreSQL");
const db=createDatabaseClient();
const projects=new ProjectsService(db),approvals=new ApprovalService(db);
const principal=(id:string,org:string,permissions:string[],roles:string[]=["ADMIN"]):Principal=>({
  userId:id,organizationId:org,sessionId:"ci",roles,permissions:new Set(permissions),
});
const permissions=["projects.create","projects.read","projects.update","projects.assign",
  "projects.deliverables.write","projects.review","clients.read","assets.read",
  "approvals.read","approvals.submit","approvals.decide","approvals.policy.manage"];
const failure=(status:number)=>(error:{status?:number})=>error.status===status;
try{
  const org=await db.organization.create({data:{name:"Project CI A"}});
  const other=await db.organization.create({data:{name:"Project CI B"}});
  const makeUser=(organizationId:string,loginId:string)=>db.user.create({data:{
    organizationId,loginId,displayName:loginId,status:"ACTIVE",
  }});
  const [owner,reviewer,contributor,unknown,external]=await Promise.all([
    makeUser(org.id,"project-owner"),makeUser(org.id,"project-reviewer"),
    makeUser(org.id,"project-contributor"),makeUser(org.id,"project-unassigned"),
    makeUser(other.id,"project-external"),
  ]);
  const admin=principal(owner.id,org.id,permissions);
  const approver=principal(reviewer.id,org.id,[
    "projects.read","projects.review","approvals.read","approvals.decide"]);
  const contributorActor=principal(contributor.id,org.id,[
    "projects.read","projects.deliverables.write","assets.read","approvals.read","approvals.submit"],["EMPLOYEE"]);
  const readonly=principal(unknown.id,org.id,["projects.read"],["EMPLOYEE"]);
  const outside=principal(external.id,other.id,permissions);
  const client=await db.client.create({data:{organizationId:org.id,createdById:owner.id,businessName:"Agency Client"}});
  const foreignClient=await db.client.create({data:{organizationId:other.id,createdById:external.id,businessName:"Foreign client"}});
  await assert.rejects(()=>projects.create(admin,{clientId:foreignClient.id,name:"Invalid"}),failure(404));
  const project=await projects.create(admin,{clientId:client.id,name:"Website launch",startOn:"2026-10-20",dueOn:"2026-11-20"});
  assert.equal(project.organizationId,org.id);
  assert.equal((await projects.detail(admin,project.id)).members.length,1);
  assert.equal((await projects.list(admin,{limit:10})).items.length,1);
  assert.equal((await projects.list(outside,{limit:10})).items.length,0);
  assert.equal((await projects.list(readonly,{limit:10})).items.length,0);
  assert.equal((await projects.list(principal(contributor.id,org.id,["projects.read"],["EMPLOYEE"]),{limit:10,q:"Website"})).items.length,0);
  await assert.rejects(()=>projects.detail(readonly,project.id),failure(404));
  await assert.rejects(()=>projects.detail(outside,project.id),failure(404));
  await assert.rejects(()=>projects.create(readonly,{clientId:client.id,name:"No"}),failure(403));
  await assert.rejects(()=>projects.setMember(admin,project.id,{userId:external.id,role:"CONTRIBUTOR"}),failure(404));
  await projects.setMember(admin,project.id,{userId:contributor.id,role:"CONTRIBUTOR"});
  await projects.setMember(admin,project.id,{userId:reviewer.id,role:"REVIEWER"});
  assert.equal((await projects.list(contributorActor,{limit:10,q:"Website"})).items.length,1);
  assert.equal((await projects.list(contributorActor,{limit:10})).items.length,1);
  assert.equal((await projects.detail(approver,project.id)).members.length,3);
  await assert.rejects(()=>projects.setMember(admin,project.id,{userId:owner.id,role:"CONTRIBUTOR"}),failure(422));
  const m=await projects.milestone(admin,project.id,{title:"Homepage approved",dueOn:"2026-11-01"});
  await assert.rejects(()=>projects.milestoneStatus(admin,project.id,m.id,1,"DONE"),failure(422));
  await assert.rejects(()=>projects.update(admin,project.id,{version:1,status:"COMPLETED"}),failure(422));
  const foreignAssetId=randomUUID();
  await assert.rejects(()=>projects.deliverable(contributorActor,project.id,{
    title:"Unsafe file",assetId:foreignAssetId}),failure(404));
  const intent=await db.assetUploadIntent.create({data:{
    organizationId:org.id,createdById:owner.id,clientId:client.id,
    publicId:"digimarket/ci/"+randomUUID(),filename:"landing.png",
    contentType:"image/png",resourceType:"IMAGE",expectedBytes:100,
    status:"CONFIRMED",expiresAt:new Date(Date.now()+60000),
  }});
  const asset=await db.asset.create({data:{
    organizationId:org.id,uploadedById:owner.id,clientId:client.id,
    uploadIntentId:intent.id,providerAssetId:randomUUID(),
    publicId:intent.publicId,filename:"landing.png",contentType:"image/png",
    resourceType:"IMAGE",format:"png",bytes:100,
  }});
  const deliverable=await projects.deliverable(contributorActor,project.id,{
    title:"Landing screen",description:"Visual review",milestoneId:m.id,assetId:asset.id,
  });
  await assert.rejects(()=>projects.deliverable(readonly,project.id,{title:"Not permitted"}),failure(403));
  const policy=await db.approvalPolicy.create({data:{
    organizationId:org.id,category:"DELIVERABLE",name:"Project deliverables",
    active:true,approverRoleKeys:["ADMIN"],
  }});
  assert.ok(policy.id);
  const submission=await projects.submit(contributorActor,project.id,deliverable.id,1);
  assert.equal(submission.status,"IN_REVIEW");
  await assert.rejects(()=>projects.submit(contributorActor,project.id,deliverable.id,1),failure(409));
  assert.equal((await approvals.list(approver,"queue")).length,1);
  assert.equal((await approvals.get(admin,submission.approvalId)).id,submission.approvalId);
  await assert.rejects(()=>approvals.decide(contributorActor,submission.approvalId,{outcome:"APPROVED"}),failure(403));
  const noProjectReviewer=principal(unknown.id,org.id,["approvals.read","approvals.decide","projects.review"]);
  assert.equal((await approvals.list(noProjectReviewer,"queue")).length,0);
  await assert.rejects(()=>approvals.decide(noProjectReviewer,submission.approvalId,{outcome:"APPROVED"}),failure(403));
  await approvals.decide(approver,submission.approvalId,{outcome:"REJECTED",reason:"Revise layout"});
  assert.equal((await projects.detail(admin,project.id)).deliverables[0].status,"CHANGES_REQUESTED");
  const revision=await projects.revise(contributorActor,project.id,deliverable.id,{
    version:3,description:"Revised layout",
  });
  assert.equal(revision.revision,2);
  assert.equal(revision.status,"DRAFT");
  await assert.rejects(()=>projects.revise(contributorActor,project.id,deliverable.id,{version:3,title:"Stale"}),failure(409));
  const second=await projects.submit(contributorActor,project.id,deliverable.id,revision.version);
  await assert.rejects(()=>approvals.decide(approver,submission.approvalId,{outcome:"APPROVED"}),failure(409));
  await approvals.decide(approver,second.approvalId,{outcome:"APPROVED"});
  assert.equal((await projects.detail(admin,project.id)).deliverables[0].status,"APPROVED");
  assert.equal((await projects.milestoneStatus(admin,project.id,m.id,1,"DONE")).status,"DONE");
  await assert.rejects(()=>projects.milestoneStatus(admin,project.id,m.id,1,"DONE"),failure(409));
  const closed=await projects.update(admin,project.id,{version:1,status:"COMPLETED"});
  assert.equal(closed.status,"COMPLETED");
  await assert.rejects(()=>projects.deliverable(contributorActor,project.id,{title:"Late deliverable"}),failure(422));
  await assert.rejects(()=>projects.update(admin,project.id,{version:1,status:"ACTIVE"}),failure(409));
  assert.equal(await db.projectDeliverable.count({where:{projectId:project.id,status:"APPROVED"}}),1);
  assert.equal(await db.approvalDecision.count({where:{requestId:{in:[submission.approvalId,second.approvalId]}}}),2);
  assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"ProjectDeliverable"}}))>=4);
  assert.ok((await db.outboxEvent.count({where:{organizationId:org.id,kind:"projects.deliverable_resolved"}}))>=2);

  // Founder deliverables move directly from DRAFT to APPROVED without a reviewer or policy.
  const founderOrg=await db.organization.create({data:{name:"Founder Project CI"}});
  const founderUser=await db.user.create({data:{
    organizationId:founderOrg.id,loginId:"project-founder",displayName:"Founder",status:"ACTIVE",
  }});
  const founder=principal(founderUser.id,founderOrg.id,permissions,["FOUNDER"]);
  const fClient=await db.client.create({data:{
    organizationId:founderOrg.id,createdById:founderUser.id,businessName:"Founder client",
  }});
  const fProject=await projects.create(founder,{clientId:fClient.id,name:"Founder launch"});
  const fDeliverable=await projects.deliverable(founder,fProject.id,{title:"Founder deliverable"});
  const fDecision=await projects.submit(founder,fProject.id,fDeliverable.id,fDeliverable.version);
  assert.equal(fDecision.status,"APPROVED");
  assert.equal((await projects.detail(founder,fProject.id)).deliverables[0].status,"APPROVED");
  const fApproval=await db.approvalRequest.findUniqueOrThrow({where:{id:fDecision.approvalId}});
  assert.equal(fApproval.status,"APPROVED");
  assert.equal((await db.approvalDecision.findUniqueOrThrow({where:{requestId:fApproval.id}})).outcome,"APPROVED");
  assert.equal((await approvals.list(founder,"queue")).length,0);
  assert.equal((await db.approvalPolicy.findUniqueOrThrow({where:{
    organizationId_category:{organizationId:founderOrg.id,category:"DELIVERABLE"},
  }})).active,false);
  // Monthly social templates initialize real deliverables from client commitments.
  await db.clientService.createMany({data:[
    {clientId:fClient.id,name:"Reels",monthlyTarget:8},
    {clientId:fClient.id,name:"Posts",monthlyTarget:8},
  ]});
  const monthly=await projects.create(founder,{clientId:fClient.id,name:"Monthly content",
    template:"SOCIAL_MONTHLY",startOn:"2026-10-29",dueOn:"2026-11-28"});
  const detail=await projects.detail(founder,monthly.id);
  assert.equal(detail.milestones.length,1);
  assert.equal(detail.deliverables.length,16);
  assert.equal(detail.deliverables.filter(x=>x.title.startsWith("Reel")).length,8);
  assert.equal(detail.deliverables.filter(x=>x.title.startsWith("Post")).length,8);
  const videoProject=await projects.create(founder,{clientId:fClient.id,name:"October video shoot",
    template:"VIDEO_SHOOTING",assigneeIds:[reviewer.id,contributor.id]});
  const videoDetail=await projects.detail(founder,videoProject.id);
  assert.equal(videoDetail.deliverables.length,5);
  assert.ok(videoDetail.deliverables.some(x=>x.title==="Video shoot and footage capture"));
  assert.equal(videoDetail.members.length,3);
  assert.equal(videoDetail.members.find(x=>x.userId===reviewer.id)?.role,"CONTRIBUTOR");
  assert.equal((await projects.list(founder,{clientId:fClient.id,limit:20})).items
    .find(x=>x.id===videoProject.id)?.members.length,3);
  assert.equal(await db.notification.count({where:{organizationId:founderOrg.id,
    recipientId:reviewer.id,kind:"PROJECT_ASSIGNED",dedupeKey:"project.assigned:"+videoProject.id}}),1);
  await assert.rejects(()=>projects.create(founder,{clientId:fClient.id,name:"Bad assignment",
    template:"VIDEO_SHOOTING",assigneeIds:[external.id]}),failure(422));
  await assert.rejects(()=>projects.create(founder,{clientId:fClient.id,name:"Duplicate assignment",
    template:"VIDEO_SHOOTING",assigneeIds:[reviewer.id,reviewer.id]}),failure(422));
  // Assignment updates must be visible immediately and revoke access when removed.
  await projects.setMember(founder,videoProject.id,{userId:unknown.id,role:"CONTRIBUTOR"});
  assert.equal((await projects.detail(founder,videoProject.id)).members.length,4);
  await projects.removeMember(founder,videoProject.id,unknown.id);
  assert.equal((await projects.detail(founder,videoProject.id)).members.length,3);
  const seoProject=await projects.create(founder,{clientId:fClient.id,name:"SEO delivery",template:"SEO"});
  assert.equal((await projects.detail(founder,seoProject.id)).deliverables.length,4);
  console.info("Module 10 PASS: project/client isolation, membership, roles, milestones, asset scope, review rejection/revision/approval, atomic states, versions, audit/outbox.");
}finally{await db.$disconnect();}
