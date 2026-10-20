import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import { ApprovalService } from "./service";
import type { Principal } from "../auth/service";

if(process.env.NODE_ENV!=="test" || !process.env.DATABASE_URL?.includes("digimarket_ci")) {
  throw new Error("Module 5 integration requires isolated digimarket_ci PostgreSQL");
}
const db=createDatabaseClient();
const svc=new ApprovalService(db);
const principal=(userId:string,organizationId:string,roles:string[],permissions:string[]):Principal=>({
  userId,organizationId,sessionId:"ci",roles,permissions:new Set(permissions),
});
const all=["approvals.read","approvals.submit","approvals.decide","approvals.policy.manage"];
try {
  const org=await db.organization.create({data:{name:"Approval Integration A"}});
  const other=await db.organization.create({data:{name:"Approval Integration B"}});
  const worker=await db.user.create({data:{organizationId:org.id,loginId:"m05-worker",displayName:"Worker",status:"ACTIVE"}});
  const manager=await db.user.create({data:{organizationId:org.id,loginId:"m05-admin",displayName:"Manager",status:"ACTIVE"}});
  const outsider=await db.user.create({data:{organizationId:other.id,loginId:"m05-other",displayName:"Outsider",status:"ACTIVE"}});
  const employee=principal(worker.id,org.id,["EMPLOYEE"],["approvals.read","approvals.submit"]);
  const administrator=principal(manager.id,org.id,["ADMIN"],all);
  const elsewhere=principal(outsider.id,other.id,["ADMIN"],all);
  const policy=await svc.policy(administrator,"GENERAL",{name:"General",active:true,approverRoleKeys:["ADMIN"]});
  assert.equal(policy.active,true);
  assert.equal((await svc.policies(employee)).length,1);
  const original=await svc.submit(employee,{category:"GENERAL",title:"New equipment",description:"Approval for a new microphone"});
  assert.equal(original.status,"PENDING");
  assert.equal((await svc.list(employee,"mine")).length,1);
  assert.equal((await svc.list(administrator,"queue")).length,1);
  await assert.rejects(()=>svc.list(employee,"queue"),(error:{status?:number})=>error.status===403);
  await assert.rejects(()=>svc.get(elsewhere,original.id),(error:{status?:number})=>error.status===404);
  await assert.rejects(()=>svc.decide(elsewhere,original.id,{outcome:"APPROVED"}),(error:{status?:number})=>error.status===404);
  await assert.rejects(()=>svc.decide(employee,original.id,{outcome:"APPROVED"}),(error:{status?:number})=>error.status===403);
  const outcomes=await Promise.allSettled([
    svc.decide(administrator,original.id,{outcome:"APPROVED"}),
    svc.decide(administrator,original.id,{outcome:"REJECTED",reason:"Different reviewer decision"}),
  ]);
  assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
  assert.equal((await svc.list(administrator,"queue")).some(x=>x.id===original.id),false);
  assert.ok((await svc.list(administrator,"history")).some(x=>x.id===original.id));
  assert.ok((await svc.list(employee,"mine")).some(x=>x.id===original.id));
  await assert.rejects(()=>svc.list(employee,"history"),(error:{status?:number})=>error.status===403);
  assert.equal((await db.approvalDecision.count({where:{requestId:original.id}})),1);
  assert.equal((await db.outboxEvent.count({where:{organizationId:org.id,aggregateId:original.id}})),2);
  await assert.rejects(()=>svc.cancel(employee,original.id),(error:{status?:number})=>error.status===409);
  const own=await svc.submit(administrator,{category:"GENERAL",title:"My own request",description:"Manager submission for review"});
  await assert.rejects(()=>svc.decide(administrator,own.id,{outcome:"APPROVED"}),(error:{status?:number})=>error.status===403);
  assert.equal((await svc.cancel(administrator,own.id)).status,"CANCELLED");
  const submitted=await svc.submit(employee,{category:"GENERAL",title:"Another request",description:"Waiting for a reasoned rejection"});
  await assert.rejects(()=>svc.decide(administrator,submitted.id,{outcome:"REJECTED"}),(error:{status?:number})=>error.status===422);
  await svc.policy(administrator,"GENERAL",{name:"Paused",active:false,approverRoleKeys:["FOUNDER"]});
  assert.deepEqual((await svc.get(administrator,submitted.id)).approverRoleKeys,["ADMIN"]);
  assert.equal((await svc.decide(administrator,submitted.id,{outcome:"REJECTED",reason:"Budget pending"})).status,"REJECTED");
  await assert.rejects(()=>svc.submit(employee,{category:"GENERAL",title:"Blocked request",description:"Policy is no longer active"}),(error:{status?:number})=>error.status===422);
  assert.equal((await db.auditLog.count({where:{organizationId:org.id,entityType:"ApprovalRequest"}})),6);
  console.info("Module 5 integration PASS: policy, tenant isolation, authorization, snapshot routing, atomic decision, no self approval, cancellation and audit/outbox.");
} finally { await db.$disconnect(); }
