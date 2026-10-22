import type { PrismaClient, Prisma } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import type { TaskCreateInput, TaskUpdateInput, TaskListInput, TaskRecurrenceCreateInput } from "@digimarket/contracts";
import {sendTaskPush} from "../insights/push";

const need=(a:Principal,k:string)=>{if(!a.permissions.has(k))throw forbidden();};
const notFound=()=>new AuthError(404,"NOT_FOUND","Task not found");
const conflict=()=>new AuthError(409,"VERSION_CONFLICT","Task changed; reload");
const clean=(s?:string)=>s?.trim()||null;
const date=(s?:string|null)=>s?new Date(s):null;
const adminRole=(a:Principal)=>a.roles.some(r=>r==="SUPER_ADMIN"||r==="ADMIN");
const requireAdministrator=(a:Principal)=>{if(!adminRole(a))throw forbidden();};
const manager=(a:Principal)=>adminRole(a)&&a.permissions.has("tasks.manage");
const own=(a:Principal):Prisma.TaskWhereInput=>({OR:[
  {createdById:a.userId},{assignees:{some:{userId:a.userId}}}
]});

export class TasksService {
  constructor(private readonly db:PrismaClient){}
  private async allowed(a:Principal,id:string){
    need(a,"tasks.read");
    const task=await this.db.task.findFirst({where:{
      id,organizationId:a.organizationId,...(manager(a)?{}:own(a)),
    }});
    if(!task)throw notFound();
    return task;
  }
  private async editable(a:Principal,id:string){
    const task=await this.allowed(a,id);
    if(!manager(a)){
      need(a,"tasks.update.own");
      if(!await this.db.taskAssignment.findUnique({where:{taskId_userId:{taskId:id,userId:a.userId}}}))throw forbidden();
    }
    return task;
  }
  private async ensureAssignment(a:Principal,projectId:string|null|undefined,assigneeIds:string[]){
    const unique=[...new Set(assigneeIds)];
    const staff=await this.db.user.findMany({where:{id:{in:unique},organizationId:a.organizationId,status:"ACTIVE"},select:{id:true}});
    if(staff.length!==unique.length)throw invalid("All assignees must be active agency staff");
    if(projectId){
      const project=await this.db.project.findFirst({where:{id:projectId,organizationId:a.organizationId,
        status:{notIn:["ARCHIVED","COMPLETED"]}},select:{id:true,createdById:true,members:{select:{userId:true}}}});
      if(!project)throw notFound();
      if(!manager(a) && project.createdById!==a.userId && !project.members.some(x=>x.userId===a.userId))throw notFound();
      // Project assignments must not grant information to users outside the project.
      const members=new Set([project.createdById,...project.members.map(x=>x.userId)]);
      if(unique.some(id=>!members.has(id)))throw invalid("Assign only existing project members");
    }
  }
  async list(a:Principal,input:TaskListInput){
    need(a,"tasks.read");
    if(input.view==="team")need(a,"tasks.manage");
    const where:Prisma.TaskWhereInput={
      organizationId:a.organizationId,
      ...(input.view==="team"&&manager(a)?{}:own(a)),
      ...(input.status==="EXPIRED"
        ?{dueAt:{lt:new Date()},status:{notIn:["DONE" as const,"CANCELLED" as const]}}
        :input.status
          ?{status:input.status,...(["TODO","IN_PROGRESS"].includes(input.status)
              ?{AND:[{OR:[{dueAt:null},{dueAt:{gte:new Date()}}]}]}:{})}
          :{}),
      ...(input.projectId?{projectId:input.projectId}:{}),
      ...(input.q?{title:{contains:input.q,mode:"insensitive"}}:{}),
    };
    const rows=await this.db.task.findMany({
      where,orderBy:[{createdAt:"desc"},{id:"desc"}],
      take:input.limit+1,...(input.cursor?{cursor:{id:input.cursor},skip:1}:{}),
      select:{id:true,title:true,description:true,status:true,priority:true,dueAt:true,
        version:true,createdAt:true,projectId:true,recurrenceId:true,scheduledFor:true,
        project:{select:{name:true}},assignees:{select:{userId:true,user:{select:{displayName:true}}}},
        _count:{select:{comments:true,checklist:true}}},
    });
    return {items:rows.slice(0,input.limit),nextCursor:rows.length>input.limit?rows[input.limit-1].id:null};
  }
  async detail(a:Principal,id:string){
    await this.allowed(a,id);
    return this.db.task.findFirstOrThrow({where:{id,organizationId:a.organizationId},include:{
      project:{select:{name:true,id:true}},assignees:{include:{user:{select:{id:true,displayName:true,status:true}}}},
      checklist:{orderBy:{createdAt:"asc"}},
      comments:{orderBy:{createdAt:"asc"},take:100,include:{author:{select:{id:true,displayName:true}}}},
    }});
  }
  async team(a:Principal){
    requireAdministrator(a);need(a,"tasks.create");
    return this.db.user.findMany({where:{organizationId:a.organizationId,status:"ACTIVE"},
      select:{id:true,displayName:true},take:500,orderBy:{displayName:"asc"}});
  }
  async create(a:Principal,input:TaskCreateInput){
    requireAdministrator(a);need(a,"tasks.create");need(a,"tasks.read");
    await this.ensureAssignment(a,input.projectId,input.assigneeIds);
    if(!input.dueAt||!Number.isFinite(Date.parse(input.dueAt))||Date.parse(input.dueAt)<=Date.now())
      throw invalid("A future expiry date and time are required for every assigned task");
    const task=await this.db.$transaction(async tx=>{
      const t=await tx.task.create({data:{
        organizationId:a.organizationId,projectId:input.projectId??null,createdById:a.userId,
        title:input.title,description:clean(input.description),priority:input.priority,
        dueAt:date(input.dueAt),assignees:{create:input.assigneeIds.map(userId=>({userId}))},
      }});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.created",entityType:"Task",entityId:t.id}});
      if(input.assigneeIds.length)await tx.notification.createMany({data:[...new Set(input.assigneeIds)].map(recipientId=>({
       organizationId:a.organizationId,recipientId,dedupeKey:"task.assigned:"+t.id,
       kind:"TASK_ASSIGNED",title:"New task assigned",
       body:"You have been assigned: "+t.title.slice(0,250),
       href:"/app/tasks?task="+t.id,
      })),skipDuplicates:true});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,
        eventKey:"task.created."+t.id,kind:"tasks.created",aggregateType:"Task",aggregateId:t.id,
        payloadMinimal:{taskId:t.id,projectId:t.projectId}}});
      return t;
    });
    await sendTaskPush(this.db,a.organizationId,input.assigneeIds);
    return task;
  }
  async update(a:Principal,id:string,input:TaskUpdateInput){
    const existing=await this.editable(a,id);
    if(!manager(a)&&(input.title!==undefined||input.description!==undefined||
      input.priority!==undefined||input.dueAt!==undefined))throw forbidden();
    if(!manager(a)&&input.status!==undefined){
      const permitted=existing.status==="TODO"&&input.status==="IN_PROGRESS" ||
        existing.status==="IN_PROGRESS"&&input.status==="DONE";
      if(!permitted)throw invalid("Assigned members can only progress Pending to In Progress to Completed");
    }
    if(input.dueAt!==undefined&&(!input.dueAt||!Number.isFinite(Date.parse(input.dueAt))))
      throw invalid("Task expiry date and time cannot be removed");
    if(existing.status==="CANCELLED"&&!manager(a))throw forbidden();
    return this.db.$transaction(async tx=>{
      const updated=await tx.task.updateMany({where:{id,organizationId:a.organizationId,version:input.version},data:{
        version:{increment:1},
        ...(input.title!==undefined?{title:input.title}:{}),
        ...(input.description!==undefined?{description:clean(input.description)}:{}),
        ...(input.priority!==undefined?{priority:input.priority}:{}),
        ...(input.dueAt!==undefined?{dueAt:date(input.dueAt)}:{}),
        ...(input.status!==undefined?{status:input.status,completedAt:input.status==="DONE"?new Date():null}:{}),
      }});
      if(updated.count!==1)throw conflict();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.updated",entityType:"Task",entityId:id,
        afterRedacted:{status:input.status??existing.status}}});
      await tx.outboxEvent.create({data:{organizationId:a.organizationId,
        eventKey:"task.updated."+id+"."+input.version,kind:"tasks.updated",
        aggregateType:"Task",aggregateId:id,payloadMinimal:{taskId:id,status:input.status??existing.status}}});
      return tx.task.findUniqueOrThrow({where:{id}});
    });
  }
  async assign(a:Principal,id:string,version:number,assigneeIds:string[]){
    requireAdministrator(a);need(a,"tasks.manage");
    const existing=await this.allowed(a,id);
    await this.ensureAssignment(a,existing.projectId,assigneeIds);
    if(!existing.dueAt)throw invalid("Set a task expiry date and time before assigning employees");
    const previous=await this.db.taskAssignment.findMany({where:{taskId:id},select:{userId:true}});
    const existingSet=new Set(previous.map(r=>r.userId));
    const newRecipients=[...new Set(assigneeIds)].filter(uid=>!existingSet.has(uid));
    const task=await this.db.$transaction(async tx=>{
      const changed=await tx.task.updateMany({where:{id,version,organizationId:a.organizationId},
        data:{version:{increment:1}}});
      if(changed.count!==1)throw conflict();
      await tx.taskAssignment.deleteMany({where:{taskId:id}});
      await tx.taskAssignment.createMany({data:assigneeIds.map(userId=>({taskId:id,userId}))});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.reassigned",entityType:"Task",entityId:id,
        afterRedacted:{assigneeCount:assigneeIds.length}}});
      if(newRecipients.length)await tx.notification.createMany({data:newRecipients.map(recipientId=>({
       organizationId:a.organizationId,recipientId,dedupeKey:"task.assigned:"+id,
       kind:"TASK_ASSIGNED",title:"New task assigned",
       body:"You have been assigned: "+existing.title.slice(0,250),
       href:"/app/tasks?task="+id,
      })),skipDuplicates:true});
      return tx.task.findUniqueOrThrow({where:{id},include:{assignees:true}});
    });
    await sendTaskPush(this.db,a.organizationId,newRecipients);
    return task;
  }
  async addChecklist(a:Principal,id:string,label:string){
    const task=await this.editable(a,id);
    if(task.status==="DONE"||task.status==="CANCELLED")throw invalid("Reopen task before adding checklist items");
    return this.db.$transaction(async tx=>{
      const item=await tx.taskChecklistItem.create({data:{taskId:id,label}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.checklist_added",entityType:"TaskChecklistItem",entityId:item.id}});
      return item;
    });
  }
  async checklistStatus(a:Principal,id:string,itemId:string,completed:boolean){
    const task=await this.editable(a,id);
    if(task.status==="CANCELLED"||task.status==="DONE")throw invalid("Reopen task to edit checklist");
    const item=await this.db.taskChecklistItem.findFirst({where:{id:itemId,taskId:id}});
    if(!item)throw notFound();
    return this.db.$transaction(async tx=>{
      const updated=await tx.taskChecklistItem.update({where:{id:itemId},data:{completed}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.checklist_updated",entityType:"TaskChecklistItem",entityId:itemId,afterRedacted:{completed}}});
      return updated;
    });
  }
  async comment(a:Principal,id:string,body:string){
    need(a,"tasks.comment");await this.allowed(a,id);
    return this.db.$transaction(async tx=>{
      const item=await tx.taskComment.create({data:{taskId:id,authorId:a.userId,body}});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.comment_added",entityType:"TaskComment",entityId:item.id}});
      return item;
    });
  }
  async createRecurrence(a:Principal,input:TaskRecurrenceCreateInput){
    requireAdministrator(a);need(a,"tasks.recurrence.manage");need(a,"tasks.read");
    await this.ensureAssignment(a,input.projectId,input.assigneeIds);
    try{new Intl.DateTimeFormat("en-US",{timeZone:input.timezone});}
    catch{throw invalid("Invalid IANA timezone");}
    const start=new Date(input.startAt);
    if(start.getTime()<Date.now()-30*86400000)throw invalid("Recurrence start is more than 30 days in the past");
    return this.db.$transaction(async tx=>{
      const recurrence=await tx.taskRecurrence.create({data:{
        organizationId:a.organizationId,createdById:a.userId,projectId:input.projectId??null,
        title:input.title,description:clean(input.description),priority:input.priority,
        assigneeIds:input.assigneeIds,frequency:input.frequency,interval:input.interval,
        anchorAt:start,nextRunAt:start,timezone:input.timezone,dueOffsetDays:input.dueOffsetDays,
      }});
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:"tasks.recurrence_created",entityType:"TaskRecurrence",entityId:recurrence.id}});
      return recurrence;
    });
  }
  async listRecurrences(a:Principal){
    requireAdministrator(a);need(a,"tasks.recurrence.manage");
    return this.db.taskRecurrence.findMany({where:{organizationId:a.organizationId},
      orderBy:{createdAt:"desc"},take:200});
  }
  async toggleRecurrence(a:Principal,id:string,version:number,enabled:boolean){
    requireAdministrator(a);need(a,"tasks.recurrence.manage");
    return this.db.$transaction(async tx=>{
      const count=await tx.taskRecurrence.updateMany({
        where:{id,organizationId:a.organizationId,version},
        data:{enabled,version:{increment:1}},
      });
      if(count.count!==1)throw conflict();
      await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
        action:enabled?"tasks.recurrence_resumed":"tasks.recurrence_paused",
        entityType:"TaskRecurrence",entityId:id}});
      return tx.taskRecurrence.findUniqueOrThrow({where:{id}});
    });
  }
}
