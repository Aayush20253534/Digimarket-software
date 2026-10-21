import type { PrismaClient, Prisma } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { founderPolicy, isFounder } from "../approvals/founder";
import { AuthError, forbidden, invalid } from "../auth/errors";
import type { ProjectCreateInput,ProjectUpdateInput,ProjectListInput,ProjectMemberInput,
  ProjectMilestoneInput,ProjectDeliverableInput,ProjectDeliverableUpdateInput } from "@digimarket/contracts";

const missing=()=>new AuthError(404,"NOT_FOUND","Project resource not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Record changed; reload before updating");
const need=(actor:Principal,permission:string)=>{if(!actor.permissions.has(permission))throw forbidden();};
const date=(s?:string)=>s?new Date(s+"T00:00:00.000Z"):null;
const text=(s?:string)=>s?.trim()||null;
const managing=(a:Principal)=>a.permissions.has("projects.assign");
const visible=(a:Principal):Prisma.ProjectWhereInput=>managing(a)?{}:{
  OR:[{createdById:a.userId},{members:{some:{userId:a.userId}}}],
};
export class ProjectsService {
  constructor(private readonly db:PrismaClient){}
  private async access(a:Principal,id:string){
    need(a,"projects.read");
    const project=await this.db.project.findFirst({where:{id,organizationId:a.organizationId,...visible(a)},
      include:{members:{where:{userId:a.userId},select:{role:true}}}});
    if(!project)throw missing();
    return project;
  }
  private async manager(a:Principal,id:string){
    need(a,"projects.update");
    const project=await this.access(a,id);
    if(!managing(a) && project.createdById!==a.userId && !project.members.some(m=>m.role==="MANAGER"))throw forbidden();
    return project;
  }
  private async writer(a:Principal,id:string){
    need(a,"projects.deliverables.write");
    const project=await this.access(a,id);
    if(!managing(a) && project.createdById!==a.userId &&
      !project.members.some(m=>m.role==="MANAGER"||m.role==="CONTRIBUTOR"))throw forbidden();
    if(project.status==="COMPLETED"||project.status==="ARCHIVED")throw invalid("Project is closed");
    return project;
  }
  async list(a:Principal,input:ProjectListInput){
    need(a,"projects.read");
    const where:Prisma.ProjectWhereInput={organizationId:a.organizationId,...visible(a),
      ...(input.status?{status:input.status}:{}),
      ...(input.clientId?{clientId:input.clientId}:{}),
      ...(input.q?{OR:[{name:{contains:input.q,mode:"insensitive"}},
        {client:{businessName:{contains:input.q,mode:"insensitive"}}}]}:{})};
    // Keep membership filter even when searching by a different OR clause.
    if(!managing(a) && input.q){
      where.AND=[visible(a),{OR:[{name:{contains:input.q,mode:"insensitive"}},
        {client:{businessName:{contains:input.q,mode:"insensitive"}}}]}];
      delete where.OR;
    }
    const rows=await this.db.project.findMany({where,take:input.limit+1,
      ...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
      orderBy:[{createdAt:"desc"},{id:"desc"}],
      select:{id:true,name:true,description:true,status:true,startOn:true,dueOn:true,version:true,
        createdAt:true,updatedAt:true,clientId:true,client:{select:{businessName:true}},
        _count:{select:{members:true,milestones:true,deliverables:true}}}});
    return {items:rows.slice(0,input.limit),nextCursor:rows.length>input.limit?rows[input.limit-1].id:null};
  }
  async detail(a:Principal,id:string){
    await this.access(a,id);
    return this.db.project.findFirstOrThrow({where:{id,organizationId:a.organizationId},
      include:{client:{select:{id:true,businessName:true,status:true}},
        members:{select:{userId:true,role:true,user:{select:{id:true,displayName:true,status:true}}}},
        milestones:{orderBy:[{dueOn:"asc"},{createdAt:"asc"}]},
        deliverables:{orderBy:{createdAt:"asc"},
          select:{id:true,title:true,description:true,status:true,version:true,revision:true,
            milestoneId:true,assetId:true,approvalRequestId:true,createdAt:true,
            asset:a.permissions.has("assets.read")?{select:{id:true,filename:true,status:true}}:false,
            approvalRequest:{select:{id:true,status:true,requesterId:true,decidedAt:true}}}}}});
  }
  async create(a:Principal,input:ProjectCreateInput){
    need(a,"projects.create");need(a,"clients.read");need(a,"projects.read");
    const client=await this.db.client.findFirst({where:{id:input.clientId,organizationId:a.organizationId,status:{not:"ARCHIVED"}}});
    if(!client)throw missing();
    return this.db.$transaction(async tx=>{
      const result=await tx.project.create({data:{
        organizationId:a.organizationId,clientId:input.clientId,createdById:a.userId,
        name:input.name,description:text(input.description),startOn:date(input.startOn),dueOn:date(input.dueOn),
        members:{create:{userId:a.userId,role:"MANAGER"}},
      }});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,action:"projects.created",entityType:"Project",entityId:result.id}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,eventKey:"project.created."+result.id,
        kind:"projects.created",aggregateType:"Project",aggregateId:result.id,payloadMinimal:{projectId:result.id,clientId:result.clientId}}});
      return result;
    });
  }
  async update(a:Principal,id:string,input:ProjectUpdateInput){
    const p=await this.manager(a,id);
    if(p.status==="ARCHIVED" && input.status!=="ACTIVE")throw invalid("Archived project cannot be edited except to reopen");
    const nextStart=input.startOn===undefined?p.startOn:date(input.startOn);
    const nextDue=input.dueOn===undefined?p.dueOn:date(input.dueOn);
    if(nextStart&&nextDue&&nextStart>nextDue)throw invalid("Start date must be before due date");
    if(input.status==="COMPLETED"){
      const [total,unfinished,milestones]=await Promise.all([
        this.db.projectDeliverable.count({where:{projectId:id}}),
        this.db.projectDeliverable.count({where:{projectId:id,status:{not:"APPROVED"}}}),
        this.db.projectMilestone.count({where:{projectId:id,status:"OPEN"}}),
      ]);
      if(!total||unfinished||milestones)throw invalid("All deliverables must be approved and milestones completed");
    }
    return this.db.$transaction(async tx=>{
      const changed=await tx.project.updateMany({where:{id,organizationId:a.organizationId,version:input.version},data:{
        version:{increment:1},...(input.name!==undefined?{name:input.name}:{}),
        ...(input.description!==undefined?{description:text(input.description)}:{}),
        ...(input.status!==undefined?{status:input.status}:{}),
        ...(input.startOn!==undefined?{startOn:date(input.startOn)}:{}),
        ...(input.dueOn!==undefined?{dueOn:date(input.dueOn)}:{})}});
      if(changed.count!==1)throw conflict();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.updated",entityType:"Project",entityId:id,afterRedacted:{status:input.status??p.status}}});
      return tx.project.findUniqueOrThrow({where:{id}});
    });
  }
  async assignees(a:Principal){
    need(a,"projects.assign");
    return this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
      select:{id:true,displayName:true},orderBy:{displayName:"asc"},take:500});
  }
  async setMember(a:Principal,id:string,input:ProjectMemberInput){
    need(a,"projects.assign"); const p=await this.manager(a,id);
    if(p.status==="ARCHIVED")throw invalid("Archived project");
    const user=await this.db.user.findFirst({where:{id:input.userId,organizationId:a.organizationId,status:"ACTIVE"}});
    if(!user)throw missing();
    return this.db.$transaction(async tx=>{
      const member=await tx.projectMember.upsert({where:{projectId_userId:{projectId:id,userId:input.userId}},
        create:{projectId:id,userId:input.userId,role:input.role},update:{role:input.role}});
      if(input.userId===p.createdById&&input.role!=="MANAGER")throw invalid("Project creator must remain a manager");
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.member_set",entityType:"Project",entityId:id,
        afterRedacted:{userId:input.userId,role:input.role}}});
      return member;
    });
  }
  async removeMember(a:Principal,id:string,userId:string){
    need(a,"projects.assign");const p=await this.manager(a,id);
    if(userId===p.createdById)throw invalid("Project creator cannot be removed");
    const changed=await this.db.$transaction(async tx=>{
      const existing=await tx.projectMember.findUnique({where:{projectId_userId:{projectId:id,userId}}});
      if(!existing)throw missing();
      await tx.projectMember.delete({where:{projectId_userId:{projectId:id,userId}}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.member_removed",entityType:"Project",entityId:id,afterRedacted:{userId}}});
      return {removed:true};
    });
    return changed;
  }
  async milestone(a:Principal,id:string,input:ProjectMilestoneInput){
    const p=await this.manager(a,id);if(p.status==="ARCHIVED"||p.status==="COMPLETED")throw invalid("Project closed");
    return this.db.$transaction(async tx=>{
      const row=await tx.projectMilestone.create({data:{projectId:id,title:input.title,dueOn:date(input.dueOn)}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.milestone_created",entityType:"ProjectMilestone",entityId:row.id}});
      return row;
    });
  }
  async milestoneStatus(a:Principal,id:string,milestoneId:string,version:number,status:"OPEN"|"DONE"){
    await this.manager(a,id);
    const found=await this.db.projectMilestone.findFirst({where:{id:milestoneId,projectId:id}});
    if(!found)throw missing();
    if(status==="DONE"){
      const [total,unfinished]=await Promise.all([
        this.db.projectDeliverable.count({where:{projectId:id,milestoneId}}),
        this.db.projectDeliverable.count({where:{projectId:id,milestoneId,status:{not:"APPROVED"}}}),
      ]);
      if(!total||unfinished)throw invalid("Milestone requires approved deliverables");
    }
    return this.db.$transaction(async tx=>{
      const updated=await tx.projectMilestone.updateMany({where:{id:milestoneId,projectId:id,version},
        data:{status,version:{increment:1}}});
      if(updated.count!==1)throw conflict();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.milestone_status",entityType:"ProjectMilestone",entityId:milestoneId,afterRedacted:{status}}});
      return tx.projectMilestone.findUniqueOrThrow({where:{id:milestoneId}});
    });
  }
  private async refs(p:{id:string;clientId:string},input:{assetId?:string|null;milestoneId?:string|null}){
    if(input.milestoneId){
      const milestone=await this.db.projectMilestone.findFirst({where:{id:input.milestoneId,projectId:p.id,status:"OPEN"}});
      if(!milestone)throw missing();
    }
    if(input.assetId){
      const asset=await this.db.asset.findFirst({where:{id:input.assetId,organizationId:(await this.db.project.findUniqueOrThrow({where:{id:p.id}})).organizationId,
        status:"ACTIVE",clientId:p.clientId}});
      if(!asset)throw missing();
    }
  }
  async deliverable(a:Principal,id:string,input:ProjectDeliverableInput){
    const p=await this.writer(a,id);
    if(input.assetId)need(a,"assets.read");
    await this.refs(p,input);
    return this.db.$transaction(async tx=>{
      const row=await tx.projectDeliverable.create({data:{projectId:id,title:input.title,
        description:text(input.description),milestoneId:input.milestoneId??null,assetId:input.assetId??null}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.deliverable_created",entityType:"ProjectDeliverable",entityId:row.id}});
      return row;
    });
  }
  async revise(a:Principal,id:string,deliverableId:string,input:ProjectDeliverableUpdateInput){
    const p=await this.writer(a,id);
    if(input.assetId)need(a,"assets.read");
    const original=await this.db.projectDeliverable.findFirst({where:{id:deliverableId,projectId:id}});
    if(!original)throw missing();
    if(original.status==="IN_REVIEW")throw invalid("Cancel current review before editing");
    if(original.milestoneId){
      const milestone=await this.db.projectMilestone.findUniqueOrThrow({where:{id:original.milestoneId}});
      if(milestone.status==="DONE")throw invalid("Reopen the milestone before revising linked deliverables");
    }
    await this.refs(p,input);
    return this.db.$transaction(async tx=>{
      const result=await tx.projectDeliverable.updateMany({where:{id:deliverableId,projectId:id,version:input.version,status:{not:"IN_REVIEW"}},
        data:{version:{increment:1},revision:{increment:1},status:"DRAFT",approvalRequestId:null,
          ...(input.title!==undefined?{title:input.title}:{}),
          ...(input.description!==undefined?{description:text(input.description)}:{}),
          ...(input.milestoneId!==undefined?{milestoneId:input.milestoneId}:{}),
          ...(input.assetId!==undefined?{assetId:input.assetId}:{})}});
      if(result.count!==1)throw conflict();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"projects.deliverable_revised",entityType:"ProjectDeliverable",entityId:deliverableId}});
      return tx.projectDeliverable.findUniqueOrThrow({where:{id:deliverableId}});
    });
  }
  async submit(a:Principal,id:string,deliverableId:string,version:number){
    await this.writer(a,id);
    const founder=isFounder(a);
    if(!founder)need(a,"approvals.submit");
    const policy=founder?null:await this.db.approvalPolicy.findUnique({where:{organizationId_category:{organizationId:a.organizationId,category:"DELIVERABLE"}}});
    if(!founder&&(!policy?.active||!policy.approverRoleKeys.length))throw invalid("Configure an active DELIVERABLE approval policy");
    return this.db.$transaction(async tx=>{
      const item=await tx.projectDeliverable.findFirst({where:{id:deliverableId,projectId:id}});
      if(!item)throw missing();
      if(item.milestoneId){
        const ms=await tx.projectMilestone.findUniqueOrThrow({where:{id:item.milestoneId}});
        if(ms.status!=="OPEN")throw invalid("Milestone is already completed");
      }
      if(item.assetId){
        const asset=await tx.asset.findUniqueOrThrow({where:{id:item.assetId}});
        if(asset.status!=="ACTIVE")throw invalid("Referenced asset is archived");
      }
      const changed=await tx.projectDeliverable.updateMany({where:{id:deliverableId,projectId:id,version,
        status:{in:["DRAFT","CHANGES_REQUESTED"]}},data:{version:{increment:1},status:founder?"APPROVED":"IN_REVIEW"}});
      if(changed.count!==1)throw conflict();
      const applied=founder?await founderPolicy(tx,a.organizationId,"DELIVERABLE"):policy!;
      const approval=await tx.approvalRequest.create({data:{
        organizationId:a.organizationId,policyId:applied.id,requesterId:a.userId,
        title:("Deliverable: "+item.title).slice(0,180),description:item.description||"Review project deliverable",
        approverRoleKeys:applied.approverRoleKeys,referenceType:"PROJECT_DELIVERABLE",referenceId:deliverableId,
        ...(founder?{status:"APPROVED" as const,decidedAt:new Date()}:{}),
      }});
      await tx.projectDeliverable.update({where:{id:deliverableId},data:{approvalRequestId:approval.id}});
      if(founder)await tx.approvalDecision.create({data:{
        requestId:approval.id,actorId:a.userId,outcome:"APPROVED",reason:"Founder deliverable requires no review",
      }});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:founder?"projects.deliverable_founder_approved":"projects.deliverable_submitted",
        entityType:"ProjectDeliverable",entityId:deliverableId,
        afterRedacted:{approvalId:approval.id,revision:item.revision}}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,
        eventKey:(founder?"project.deliverable.resolved.":"project.deliverable.submitted.")+approval.id,
        kind:founder?"projects.deliverable_resolved":"projects.deliverable_submitted",
        aggregateType:"ProjectDeliverable",aggregateId:deliverableId,
        payloadMinimal:founder?{projectId:id,deliverableId,approvalId:approval.id,outcome:"APPROVED"}:{projectId:id,deliverableId,approvalId:approval.id}}});
      return {approvalId:approval.id,status:founder?"APPROVED":"IN_REVIEW"};
    });
  }
}
