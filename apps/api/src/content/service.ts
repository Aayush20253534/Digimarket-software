import type { Prisma, PrismaClient } from "@digimarket/db";
import type { ContentCreateInput, ContentUpdateInput, ContentListQuery } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
const grant=(a:Principal,key:string)=>{if(!a.permissions.has(key))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Content not found");
const stale=()=>new AuthError(409,"VERSION_CONFLICT","Content changed; reload before editing");
const managing=(a:Principal)=>a.permissions.has("content.manage");
const visible=(a:Principal):Prisma.ContentPostWhereInput=>managing(a)?{}:
  {OR:[{ownerId:a.userId},{createdById:a.userId}]};
const snapshot=(p:{title:string;caption:string;hashtags:string[];platform:string;format:string;publishAt:Date|null;projectId:string|null;ownerId:string},assetIds:string[])=>({
  title:p.title,caption:p.caption,hashtags:p.hashtags,platform:p.platform,format:p.format,
  publishAt:p.publishAt?.toISOString()??null,projectId:p.projectId,ownerId:p.ownerId,assetIds,
});
export class ContentService {
  constructor(private readonly db:PrismaClient){}
  private async existing(a:Principal,id:string){
    grant(a,"content.read");
    const post=await this.db.contentPost.findFirst({where:{id,organizationId:a.organizationId,...visible(a)}});
    if(!post)throw missing();
    return post;
  }
  private async editable(a:Principal,id:string){
    grant(a,"content.edit");
    const p=await this.existing(a,id);
    if(!managing(a)&&p.ownerId!==a.userId)throw forbidden();
    return p;
  }
  private async refs(a:Principal,clientId:string,projectId:string|null|undefined,ownerId:string,assetIds:string[]){
    grant(a,"clients.read");
    const [client,owner]=await Promise.all([
      this.db.client.findFirst({where:{id:clientId,organizationId:a.organizationId,status:{not:"ARCHIVED"}}}),
      this.db.user.findFirst({where:{id:ownerId,organizationId:a.organizationId,status:"ACTIVE"}}),
    ]);
    if(!client||!owner)throw missing();
    if(projectId){
      const project=await this.db.project.findFirst({where:{
        id:projectId,organizationId:a.organizationId,clientId,status:{notIn:["ARCHIVED","COMPLETED"]}},
        select:{createdById:true,members:{select:{userId:true}}}});
      if(!project)throw missing();
      if(!managing(a)&&project.createdById!==a.userId&&!project.members.some(x=>x.userId===a.userId))throw missing();
      if(ownerId!==project.createdById&&!project.members.some(x=>x.userId===ownerId))
        throw invalid("Content owner must belong to the selected project");
    }
    if(assetIds.length){
      grant(a,"assets.read");
      const count=await this.db.asset.count({where:{
        id:{in:assetIds},organizationId:a.organizationId,clientId,status:"ACTIVE"}});
      if(count!==assetIds.length)throw missing();
    }
  }
  async list(a:Principal,input:ContentListQuery){
    grant(a,"content.read");
    const where:Prisma.ContentPostWhereInput={organizationId:a.organizationId,...visible(a),
      ...(input.clientId?{clientId:input.clientId}:{}),...(input.ownerId?{ownerId:input.ownerId}:{}),
      ...(input.status?{status:input.status}:{}),...(input.platform?{platform:input.platform}:{}),
      ...(input.q?{title:{contains:input.q,mode:"insensitive"}}:{}),
      ...((input.start||input.end)?{publishAt:{...(input.start?{gte:new Date(input.start)}:{}),
        ...(input.end?{lt:new Date(input.end)}:{})}}:{})};
    const rows=await this.db.contentPost.findMany({where,
      take:input.limit+1,...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
      orderBy:[{publishAt:"asc"},{id:"asc"}],select:{
        id:true,title:true,platform:true,format:true,status:true,publishAt:true,version:true,revision:true,
        clientId:true,ownerId:true,projectId:true,approvalRequestId:true,
        client:{select:{businessName:true}},owner:{select:{displayName:true}},
        assets:{select:{assetId:true}},
      }});
    const items=rows.slice(0,input.limit);
    return {items,nextCursor:rows.length>input.limit?items.at(-1)?.id??null:null};
  }
  async detail(a:Principal,id:string){
    await this.existing(a,id);
    const post=await this.db.contentPost.findFirstOrThrow({where:{id,organizationId:a.organizationId},
      include:{client:{select:{businessName:true}},owner:{select:{displayName:true}},
        assets:{orderBy:{sortOrder:"asc"},select:{assetId:true,
          asset:{select:{filename:true,status:true}}}},
        approvalRequest:{select:{id:true,status:true,decidedAt:true,
          decision:{select:{outcome:true,reason:true}}}},
        revisions:{orderBy:{revision:"desc"},take:30,select:{revision:true,createdAt:true,actorId:true}},
      }});
    // Content access does not imply Cloudinary asset access.
    return a.permissions.has("assets.read")?post:{...post,assets:[]};
  }
  async create(a:Principal,input:ContentCreateInput){
    grant(a,"content.create");grant(a,"content.read");
    if(input.ownerId&&input.ownerId!==a.userId&&!managing(a))throw forbidden();
    const ownerId=input.ownerId??a.userId;
    await this.refs(a,input.clientId,input.projectId,ownerId,input.assetIds);
    return this.db.$transaction(async tx=>{
      const p=await tx.contentPost.create({data:{
        organizationId:a.organizationId,clientId:input.clientId,createdById:a.userId,ownerId,
        title:input.title,caption:input.caption,hashtags:input.hashtags,platform:input.platform,
        format:input.format,projectId:input.projectId??null,
        publishAt:input.publishAt?new Date(input.publishAt):null,
        assets:{create:input.assetIds.map((assetId,sortOrder)=>({assetId,sortOrder}))},
      }});
      await tx.contentPostRevision.create({data:{postId:p.id,revision:1,actorId:a.userId,
        snapshot:snapshot(p,input.assetIds)}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.created",entityType:"ContentPost",entityId:p.id}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,eventKey:"content.created."+p.id,
        kind:"content.created",aggregateType:"ContentPost",aggregateId:p.id,
        payloadMinimal:{postId:p.id,clientId:p.clientId}}});
      return p;
    });
  }
  async update(a:Principal,id:string,input:ContentUpdateInput){
    const p=await this.editable(a,id);
    if(["IN_REVIEW","PUBLISHED","CANCELLED"].includes(p.status))
      throw invalid("Review must be resolved before editing; published content is immutable");
    if(input.ownerId!==undefined&&input.ownerId!==p.ownerId&&!managing(a))throw forbidden();
    const ownerId=input.ownerId??p.ownerId;
    const projectId=input.projectId===undefined?p.projectId:input.projectId;
    const assets=input.assetIds??(await this.db.contentPostAsset.findMany({
      where:{postId:id},orderBy:{sortOrder:"asc"},select:{assetId:true}})).map(x=>x.assetId);
    await this.refs(a,p.clientId,projectId,ownerId,assets);
    return this.db.$transaction(async tx=>{
      const changed=await tx.contentPost.updateMany({
        where:{id,organizationId:a.organizationId,version:input.version,
          status:{in:["IDEA","DRAFT","CHANGES_REQUESTED","APPROVED","SCHEDULED"]}},
        data:{version:{increment:1},revision:{increment:1},status:"DRAFT",approvalRequestId:null,
          ...(input.title!==undefined?{title:input.title}:{}),
          ...(input.caption!==undefined?{caption:input.caption}:{}),
          ...(input.hashtags!==undefined?{hashtags:input.hashtags}:{}),
          ...(input.platform!==undefined?{platform:input.platform}:{}),
          ...(input.format!==undefined?{format:input.format}:{}),
          ...(input.publishAt!==undefined?{publishAt:input.publishAt?new Date(input.publishAt):null}:{}),
          ...(input.projectId!==undefined?{projectId:input.projectId}:{}),
          ...(input.ownerId!==undefined?{ownerId:input.ownerId}:{}),
      }});
      if(changed.count!==1)throw stale();
      if(input.assetIds!==undefined){
        await tx.contentPostAsset.deleteMany({where:{postId:id}});
        await tx.contentPostAsset.createMany({data:assets.map((assetId,sortOrder)=>({postId:id,assetId,sortOrder}))});
      }
      const updated=await tx.contentPost.findUniqueOrThrow({where:{id}});
      await tx.contentPostRevision.create({data:{postId:id,revision:updated.revision,actorId:a.userId,
        snapshot:snapshot(updated,assets)}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.revised",entityType:"ContentPost",entityId:id,
        afterRedacted:{revision:updated.revision,invalidatedPriorApproval:!!p.approvalRequestId}}});
      return updated;
    });
  }
  async submit(a:Principal,id:string,version:number){
    const p=await this.editable(a,id);grant(a,"approvals.submit");
    if(!["DRAFT","CHANGES_REQUESTED"].includes(p.status))throw invalid("Save a draft before submitting");
    const policy=await this.db.approvalPolicy.findUnique({
      where:{organizationId_category:{organizationId:a.organizationId,category:"CONTENT"}}});
    if(!policy?.active||!policy.approverRoleKeys.length)throw invalid("Configure an active CONTENT approval policy");
    const assets=await this.db.contentPostAsset.findMany({where:{postId:id},select:{assetId:true}});
    if(assets.length){
      const active=await this.db.asset.count({where:{
        id:{in:assets.map(x=>x.assetId)},status:"ACTIVE",organizationId:a.organizationId,clientId:p.clientId}});
      if(active!==assets.length)throw invalid("Content attachments must be active and client-specific");
    }
    return this.db.$transaction(async tx=>{
      const changed=await tx.contentPost.updateMany({where:{id,organizationId:a.organizationId,
        version,status:{in:["DRAFT","CHANGES_REQUESTED"]}},
        data:{status:"IN_REVIEW",version:{increment:1}}});
      if(changed.count!==1)throw stale();
      const request=await tx.approvalRequest.create({data:{
        organizationId:a.organizationId,policyId:policy.id,requesterId:a.userId,
        title:("Content review: "+p.title).slice(0,180),
        description:"Review content revision "+p.revision+" for "+p.platform,
        approverRoleKeys:policy.approverRoleKeys,referenceType:"CONTENT_POST",referenceId:id,
      }});
      await tx.contentPost.update({where:{id},data:{approvalRequestId:request.id}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.submitted",entityType:"ContentPost",entityId:id,
        afterRedacted:{revision:p.revision,approvalId:request.id}}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,
        eventKey:"content.submitted."+request.id,kind:"content.submitted",
        aggregateType:"ContentPost",aggregateId:id,payloadMinimal:{postId:id,approvalId:request.id}}});
      return {approvalId:request.id,status:"IN_REVIEW" as const};
    });
  }
  async schedule(a:Principal,id:string,version:number){
    const p=await this.editable(a,id);
    if(p.status!=="APPROVED"||!p.publishAt)throw invalid("Approved content with a publish time is required");
    if(p.publishAt<=new Date())throw invalid("Scheduled publish time must be in the future");
    return this.db.$transaction(async tx=>{
      const changed=await tx.contentPost.updateMany({where:{id,organizationId:a.organizationId,
        version,status:"APPROVED"},data:{status:"SCHEDULED",version:{increment:1}}});
      if(changed.count!==1)throw stale();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.scheduled",entityType:"ContentPost",entityId:id}});
      return tx.contentPost.findUniqueOrThrow({where:{id}});
    });
  }
  async publish(a:Principal,id:string,version:number,publishedUrl:string|null|undefined){
    grant(a,"content.publish");
    const p=await this.existing(a,id);
    if(!["APPROVED","SCHEDULED"].includes(p.status)||!p.approvalRequestId)
      throw invalid("Only approved content can be manually marked published");
    const approval=await this.db.approvalRequest.findFirst({where:{
      id:p.approvalRequestId,organizationId:a.organizationId,status:"APPROVED"}});
    if(!approval)throw invalid("This revision is not approved");
    const linked=await this.db.contentPostAsset.findMany({where:{postId:id},select:{assetId:true}});
    if(linked.length){
      const valid=await this.db.asset.count({where:{organizationId:a.organizationId,
        clientId:p.clientId,status:"ACTIVE",id:{in:linked.map(x=>x.assetId)}}});
      if(valid!==linked.length)throw invalid("Attached asset is unavailable");
    }
    return this.db.$transaction(async tx=>{
      const done=await tx.contentPost.updateMany({where:{id,organizationId:a.organizationId,version,
        approvalRequestId:p.approvalRequestId,status:{in:["APPROVED","SCHEDULED"]}},
        data:{status:"PUBLISHED",version:{increment:1},publishedAt:new Date(),
          publishedById:a.userId,publishedUrl:publishedUrl??null}});
      if(done.count!==1)throw stale();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.published_manual",entityType:"ContentPost",entityId:id,
        afterRedacted:{revision:p.revision,hasUrl:!!publishedUrl}}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,
        eventKey:"content.published."+id,kind:"content.published",
        aggregateType:"ContentPost",aggregateId:id,
        payloadMinimal:{postId:id,revision:p.revision,publishedManually:true}}});
      return tx.contentPost.findUniqueOrThrow({where:{id}});
    });
  }
  async cancel(a:Principal,id:string,version:number){
    grant(a,"content.manage");
    const p=await this.existing(a,id);
    if(p.status==="IN_REVIEW"||p.status==="PUBLISHED")throw invalid("Resolve review first; published posts cannot be cancelled");
    return this.db.$transaction(async tx=>{
      const changed=await tx.contentPost.updateMany({where:{id,organizationId:a.organizationId,
        version,status:{notIn:["IN_REVIEW","PUBLISHED","CANCELLED"]}},
        data:{status:"CANCELLED",version:{increment:1},approvalRequestId:null}});
      if(changed.count!==1)throw stale();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"content.cancelled",entityType:"ContentPost",entityId:id}});
      return tx.contentPost.findUniqueOrThrow({where:{id}});
    });
  }
  async staff(a:Principal){
    grant(a,"content.manage");
    return this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
      select:{id:true,displayName:true},take:500,orderBy:{displayName:"asc"}});
  }
}
