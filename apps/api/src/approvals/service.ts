import type { PrismaClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import type { ApprovalCategory, ApprovalSubmission, ApprovalPolicyInput, ApprovalDecisionInput } from "@digimarket/contracts";

const notFound = () => new AuthError(404, "NOT_FOUND", "Approval not found");
const conflict = () => new AuthError(409, "ALREADY_RESOLVED", "Approval is no longer pending");
function grant(actor: Principal, permission: string) {
  if (!actor.permissions.has(permission)) throw forbidden();
}
function canDecide(actor: Principal, request: { requesterId: string; approverRoleKeys: string[] }) {
  return actor.permissions.has("approvals.decide") && actor.userId !== request.requesterId &&
    request.approverRoleKeys.some((role) => actor.roles.includes(role));
}

export class ApprovalService {
  constructor(private readonly db: PrismaClient) {}

  async policies(actor: Principal) {
    grant(actor, "approvals.read");
    return this.db.approvalPolicy.findMany({
      where: { organizationId: actor.organizationId }, orderBy: { category: "asc" },
    });
  }

  async policy(actor: Principal, category: ApprovalCategory, input: ApprovalPolicyInput) {
    grant(actor, "approvals.policy.manage");
    const roles = [...new Set(input.approverRoleKeys)];
    if (roles.some((role) => !["SUPER_ADMIN", "ADMIN", "FOUNDER"].includes(role))) throw invalid("Invalid approver role");
    return this.db.$transaction(async (tx) => {
      const result = await tx.approvalPolicy.upsert({
        where: { organizationId_category: { organizationId: actor.organizationId, category } },
        create: { organizationId: actor.organizationId, category, name: input.name, approverRoleKeys: roles, active: input.active },
        update: { name: input.name, approverRoleKeys: roles, active: input.active },
      });
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:"approvals.policy_saved",entityType:"ApprovalPolicy",entityId:result.id}});
      return result;
    });
  }

  async submit(actor: Principal, input: ApprovalSubmission) {
    grant(actor,"approvals.submit");
    const policy = await this.db.approvalPolicy.findUnique({
      where:{organizationId_category:{organizationId:actor.organizationId,category:input.category}},
    });
    if(!policy?.active || !policy.approverRoleKeys.length) throw invalid("Category has no active policy");
    return this.db.$transaction(async tx => {
      const result=await tx.approvalRequest.create({data:{
        organizationId:actor.organizationId,policyId:policy.id,requesterId:actor.userId,
        title:input.title,description:input.description,approverRoleKeys:policy.approverRoleKeys,
      }});
      await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
        action:"approvals.submitted",entityType:"ApprovalRequest",entityId:result.id}});
      await tx.outboxEvent.create({data:{organizationId:actor.organizationId,eventKey:"approval.created."+result.id,
        kind:"approvals.submitted",aggregateType:"ApprovalRequest",aggregateId:result.id,
        payloadMinimal:{approvalId:result.id,category:input.category}}});
      return result;
    });
  }

  async list(actor: Principal, view: "mine" | "queue" | "history") {
    grant(actor,"approvals.read");
    if(view==="queue"||view==="history") grant(actor,"approvals.decide");
    const reviewers = actor.permissions.has("projects.review") ?
      await this.db.projectDeliverable.findMany({
        where:{project:{organizationId:actor.organizationId,
          ...(actor.permissions.has("projects.assign")?{}:{members:{some:{userId:actor.userId,role:{in:["MANAGER","REVIEWER"]}}}})}},
        select:{id:true},take:10000,
      }) : [];
    return this.db.approvalRequest.findMany({
      where:{organizationId:actor.organizationId,
        ...(view!=="mine"?{OR:[
          {referenceType:null},{referenceType:{notIn:["PROJECT_DELIVERABLE","CONTENT_POST"]}},
          {referenceType:"PROJECT_DELIVERABLE",referenceId:{in:reviewers.map(row=>row.id)}},
          ...(actor.permissions.has("content.approve")?[{referenceType:"CONTENT_POST"}]:[]),
        ]}:{}),
        ...(view==="mine"
        ? {requesterId:actor.userId}
        : {status:view==="history"?{not:"PENDING" as const}:"PENDING" as const,
           requesterId:{not:actor.userId},approverRoleKeys:{hasSome:actor.roles},
           ...(view==="history"?{decision:{is:{actorId:actor.userId}}}:{})}),
      include:{policy:{select:{category:true,name:true}},requester:{select:{displayName:true}},
        decision:{select:{outcome:true,reason:true,createdAt:true,actor:{select:{displayName:true}}}}},
      orderBy:{createdAt:"desc"},take:100,
    });
  }

  async get(actor: Principal,id:string) {
    grant(actor,"approvals.read");
    const result=await this.db.approvalRequest.findFirst({
      where:{id,organizationId:actor.organizationId},
      include:{policy:{select:{category:true,name:true}},requester:{select:{displayName:true}},
        decision:{select:{outcome:true,reason:true,createdAt:true,actor:{select:{displayName:true}}}}},
    });
    if(!result || (result.requesterId!==actor.userId && !canDecide(actor,result))) throw notFound();
    if(result.referenceType==="PROJECT_DELIVERABLE" && result.requesterId!==actor.userId){
      const p=await this.db.projectDeliverable.findFirst({where:{
        id:result.referenceId??"",project:{organizationId:actor.organizationId,
          ...(actor.permissions.has("projects.assign")?{}:{
            members:{some:{userId:actor.userId,role:{in:["REVIEWER","MANAGER"]}}}})},
      }});
      if(!p || !actor.permissions.has("projects.review"))throw notFound();
    }
    if(result.referenceType==="CONTENT_POST"&&result.requesterId!==actor.userId){
      if(!actor.permissions.has("content.approve"))throw notFound();
      const post=await this.db.contentPost.findFirst({where:{
        id:result.referenceId??"",organizationId:actor.organizationId,approvalRequestId:id}});
      if(!post)throw notFound();
    }
    return result;
  }

  private async resolve(actor: Principal,id:string,outcome:"APPROVED"|"REJECTED"|"CANCELLED",reason?:string) {
    const record=await this.db.approvalRequest.findFirst({
      where:{id,organizationId:actor.organizationId},
      select:{id:true,requesterId:true,status:true,approverRoleKeys:true,referenceType:true,referenceId:true},
    });
    if(!record) throw notFound();
    if(outcome==="CANCELLED") {
      grant(actor,"approvals.submit");
      if(record.requesterId!==actor.userId) throw forbidden();
    } else if(!canDecide(actor,record)) throw forbidden();
    if(record.status!=="PENDING") throw conflict();
    if(record.referenceType==="FINANCE_ENTRY" && outcome!=="CANCELLED" && !actor.permissions.has("finance.approve")) throw forbidden();
    if(outcome==="REJECTED" && !reason?.trim()) throw invalid("Rejection reason is required");
    if(record.referenceType==="PROJECT_DELIVERABLE"){
      const item=await this.db.projectDeliverable.findFirst({where:{
        id:record.referenceId??"",approvalRequestId:id,status:"IN_REVIEW",
        project:{organizationId:actor.organizationId},
      },include:{project:{select:{members:{where:{userId:actor.userId},select:{role:true}}}},
        asset:{select:{status:true}}}});
      if(!item)throw conflict();
      if(outcome!=="CANCELLED"){
        grant(actor,"projects.review");
        if(!actor.permissions.has("projects.assign") &&
          !item.project.members.some(m=>m.role==="MANAGER"||m.role==="REVIEWER"))throw forbidden();
        if(outcome==="APPROVED"&&item.asset?.status==="ARCHIVED")throw invalid("Asset is archived");
      }
    }
    if(record.referenceType==="CONTENT_POST"){
      if(outcome!=="CANCELLED")grant(actor,"content.approve");
      const post=await this.db.contentPost.findFirst({where:{
        id:record.referenceId??"",organizationId:actor.organizationId,
        approvalRequestId:id,status:"IN_REVIEW"},
        include:{assets:{select:{asset:{select:{status:true,clientId:true}}}}}});
      if(!post)throw conflict();
      if(outcome==="APPROVED"&&post.assets.some(x=>x.asset.status!=="ACTIVE"||x.asset.clientId!==post.clientId))
        throw invalid("Referenced content asset has changed");
    }
    return this.db.$transaction(async tx=>{
      const now=new Date();
      const updated=await tx.approvalRequest.updateMany({
        where:{id,organizationId:actor.organizationId,status:"PENDING"},
        data:{status:outcome,decidedAt:now},
      });
      if(updated.count!==1) throw conflict();
      if(record.referenceType==="FINANCE_ENTRY"){
        if(!record.referenceId) throw conflict();
        const changed=await tx.financialTransaction.updateMany({
          where:{id:record.referenceId,approvalRequestId:id,organizationId:actor.organizationId,status:"PENDING"},
          data:{status:outcome==="APPROVED"?"POSTED":outcome,
            postedAt:outcome==="APPROVED"?now:null},
        });
        if(changed.count!==1)throw conflict();
        await tx.auditLog.create({data:{
          organizationId:actor.organizationId,actorId:actor.userId,
          action:"finance."+outcome.toLowerCase(),entityType:"FinancialTransaction",entityId:record.referenceId,
          afterRedacted:{status:outcome==="APPROVED"?"POSTED":outcome},
        }});
        await tx.outboxEvent.create({data:{
          organizationId:actor.organizationId,eventKey:"finance.resolved."+record.referenceId,
          kind:"finance.resolved",aggregateType:"FinancialTransaction",aggregateId:record.referenceId,
          payloadMinimal:{transactionId:record.referenceId,outcome},
        }});
      }
      if(record.referenceType==="PROJECT_DELIVERABLE"){
        const changed=await tx.projectDeliverable.updateMany({where:{
          id:record.referenceId??"",approvalRequestId:id,status:"IN_REVIEW",
          project:{organizationId:actor.organizationId},
        },data:{status:outcome==="APPROVED"?"APPROVED":
          outcome==="REJECTED"?"CHANGES_REQUESTED":"DRAFT",version:{increment:1}}});
        if(changed.count!==1)throw conflict();
        await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
          action:"projects.deliverable_"+outcome.toLowerCase(),entityType:"ProjectDeliverable",
          entityId:record.referenceId??"",afterRedacted:{outcome}}});
        await tx.outboxEvent.create({data:{organizationId:actor.organizationId,
          eventKey:"project.deliverable.resolved."+id,kind:"projects.deliverable_resolved",
          aggregateType:"ProjectDeliverable",aggregateId:record.referenceId??"",
          payloadMinimal:{deliverableId:record.referenceId,approvalId:id,outcome}}});
      }
      if(record.referenceType==="CONTENT_POST"){
        const changed=await tx.contentPost.updateMany({where:{
          id:record.referenceId??"",organizationId:actor.organizationId,
          approvalRequestId:id,status:"IN_REVIEW"},
          data:{status:outcome==="APPROVED"?"APPROVED":
            outcome==="REJECTED"?"CHANGES_REQUESTED":"DRAFT",version:{increment:1}}});
        if(changed.count!==1)throw conflict();
        await tx.auditLog.create({data:{organizationId:actor.organizationId,actorId:actor.userId,
          action:"content.review_"+outcome.toLowerCase(),entityType:"ContentPost",entityId:record.referenceId??"",
          afterRedacted:{outcome}}});
        await tx.outboxEvent.create({data:{organizationId:actor.organizationId,
          eventKey:"content.review."+id,kind:"content.review_resolved",
          aggregateType:"ContentPost",aggregateId:record.referenceId??"",
          payloadMinimal:{postId:record.referenceId,approvalId:id,outcome}}});
      }
      await tx.approvalDecision.create({data:{
        requestId:id,actorId:actor.userId,outcome,reason:reason?.trim() || null,
      }});
      await tx.auditLog.create({data:{
        organizationId:actor.organizationId,actorId:actor.userId,
        action:"approvals."+outcome.toLowerCase(),entityType:"ApprovalRequest",entityId:id,
        afterRedacted:{status:outcome},
      }});
      await tx.outboxEvent.create({data:{
        organizationId:actor.organizationId,eventKey:"approval.resolved."+id,
        kind:"approvals.resolved",aggregateType:"ApprovalRequest",aggregateId:id,
        payloadMinimal:{approvalId:id,outcome},
      }});
      return {id,status:outcome,decidedAt:now};
    });
  }

  async decide(actor:Principal,id:string,input:ApprovalDecisionInput) {
    grant(actor,"approvals.decide");
    return this.resolve(actor,id,input.outcome,input.reason);
  }

  async cancel(actor:Principal,id:string) {
    return this.resolve(actor,id,"CANCELLED");
  }
}
