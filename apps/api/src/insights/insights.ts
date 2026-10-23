import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {forbidden} from "../auth/errors";

const can=(p:Principal,permission:string)=>p.permissions.has(permission);
const requireGrant=(p:Principal,permission:string)=>{if(!can(p,permission))throw forbidden();};
const taskScope=(a:Principal):Prisma.TaskWhereInput=>can(a,"tasks.manage")?{}:{
 OR:[{createdById:a.userId},{assignees:{some:{userId:a.userId}}}],
};
const projectScope=(a:Principal):Prisma.ProjectWhereInput=>can(a,"projects.assign")?{}:{
 OR:[{createdById:a.userId},{members:{some:{userId:a.userId}}}],
};
const contentScope=(a:Principal):Prisma.ContentPostWhereInput=>can(a,"content.manage")?{}:{
 OR:[{createdById:a.userId},{ownerId:a.userId}],
};
export type SearchHit={kind:string;id:string;title:string;detail:string;href:string};
export class InsightsService{
 constructor(private readonly db:PrismaClient){}
 async search(a:Principal,q:string){
  requireGrant(a,"search.read");
  const org=a.organizationId,me=a.userId,match={contains:q,mode:"insensitive" as const};
  const url=(module:string,id:string)=>"/app/"+module+"?focus="+encodeURIComponent(id);
  const parts:Promise<SearchHit[]>[]=[];
  // Personal-only index: creator, assignee, or owner. Broader module permissions
  // must never turn search into an organization-wide directory.
  if(can(a,"leads.read"))parts.push(this.db.lead.findMany({
   where:{organizationId:org,deletedAt:null,OR:[{createdById:me},{assignedToId:me}],AND:[{OR:[{businessName:match},{contactName:match},{phone:match},{businessType:match},{location:match},{source:match},{websiteUrl:match},{instagramUrl:match}]}]},
   take:8,orderBy:{updatedAt:"desc"},select:{id:true,businessName:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"lead",id:x.id,title:x.businessName,detail:"Lead · "+x.status,href:url("leads",x.id)}))));
  if(can(a,"clients.read"))parts.push(this.db.client.findMany({
   where:{organizationId:org,createdById:me,OR:[{businessName:match},{businessType:match},{phone:match},{email:match},{location:match},{websiteUrl:match},{instagramUrl:match},{facebookUrl:match},{notes:match}]},take:8,orderBy:{updatedAt:"desc"},
   select:{id:true,businessName:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"client",id:x.id,title:x.businessName,detail:"Client · "+x.status,href:url("clients",x.id)}))));
  if(can(a,"projects.read"))parts.push(this.db.project.findMany({
   where:{organizationId:org,OR:[{createdById:me},{members:{some:{userId:me}}}],AND:[{OR:[{name:match},{description:match}]}]},
   take:8,orderBy:{updatedAt:"desc"},select:{id:true,name:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"project",id:x.id,title:x.name,detail:"Project · "+x.status,href:url("projects",x.id)}))));
  if(can(a,"tasks.read"))parts.push(this.db.task.findMany({
   where:{organizationId:org,OR:[{createdById:me},{assignees:{some:{userId:me}}}],AND:[{OR:[{title:match},{description:match}]}]},
   take:8,orderBy:{updatedAt:"desc"},select:{id:true,title:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"task",id:x.id,title:x.title,detail:"Task · "+x.status,href:url("tasks",x.id)}))));
  if(can(a,"content.read"))parts.push(this.db.contentPost.findMany({
   where:{organizationId:org,OR:[{createdById:me},{ownerId:me}],AND:[{OR:[{title:match},{caption:match}]}]},
   take:8,orderBy:{updatedAt:"desc"},select:{id:true,title:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"content",id:x.id,title:x.title,detail:"Content · "+x.status,href:url("content",x.id)}))));
  if(can(a,"assets.read"))parts.push(this.db.asset.findMany({
   where:{organizationId:org,uploadedById:me,status:"ACTIVE",filename:match,
    publicId:{not:{startsWith:"digimarket/"+org+"/finance/"}},
    ...(can(a,"clients.read")?{}:{clientId:null})},
   take:8,orderBy:{createdAt:"desc"},select:{id:true,filename:true,contentType:true},
  }).then(rows=>rows.map(x=>({kind:"file",id:x.id,title:x.filename,detail:"File · "+x.contentType,href:url("assets",x.id)}))));
  // Finance search recognizes INR formatted amounts and checks the user's access.
  if(can(a,"finance.entry.read.own")||can(a,"finance.read.all")){
   const normalized=q.trim().replace(/^[₹\s]+/,"").replace(/,/g,"");
   const amount=/^\d{1,15}(?:\.\d{1,4})?$/.test(normalized)?new Prisma.Decimal(normalized):null;
   parts.push(this.db.financialTransaction.findMany({
    where:{organizationId:org,...(can(a,"finance.read.all")?{}:{enteredById:me}),
     OR:[{merchantOrSource:match},{description:match},{category:{name:match}},...(amount?[{amount}]:[])]},
    take:20,orderBy:[{createdAt:"desc"},{id:"desc"}],
    select:{id:true,kind:true,status:true,merchantOrSource:true,amount:true,category:{select:{name:true}},
      enteredBy:{select:{displayName:true}}},
   }).then(rows=>rows.map(x=>({kind:"finance",id:x.id,
    title:(x.kind==="INCOME"?"Income":"Expense")+" · ₹"+x.amount.toFixed(2),
    detail:x.category.name+" · "+(x.merchantOrSource||"No source")+" · "+x.status+" · "+x.enteredBy.displayName,
    href:url("finance",x.id)}))));
  }
  if(can(a,"approvals.read"))parts.push(this.db.approvalRequest.findMany({
   where:{organizationId:org,requesterId:me,OR:[{title:match},{description:match}]},
   take:8,orderBy:{createdAt:"desc"},select:{id:true,title:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"approval",id:x.id,title:x.title,detail:"Approval · "+x.status,href:url("approvals",x.id)}))));
  if(!a.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN"))
   parts.push(this.db.personalNote.findMany({
    where:{organizationId:org,ownerId:me,deletedAt:null,OR:[{title:match},{body:match}]},
    take:8,orderBy:{updatedAt:"desc"},select:{id:true,title:true},
   }).then(rows=>rows.map(x=>({kind:"note",id:x.id,title:x.title,detail:"Private note",
    href:"/app/notes?note="+encodeURIComponent(x.id)}))));
  const grouped=await Promise.all(parts);
  return {query:q,items:grouped.flat().slice(0,70)};
 }
 async report(a:Principal,from:string,to:string){
  requireGrant(a,"reports.business.read");
  const org=a.organizationId;
  const start=new Date(from+"T00:00:00.000Z"),end=new Date(to+"T23:59:59.999Z");
  const sections:Record<string,unknown>={};
  const work:Promise<void>[]=[];
  if(can(a,"leads.read"))work.push((async()=>{
    const scope={organizationId:org,deletedAt:null,createdAt:{gte:start,lte:end}};
    const [created,converted,rejected,approved,pending,meetingProcess,decisionPending,agreementPending,followUp,overdue]=await Promise.all([
      this.db.lead.count({where:scope}),
      this.db.client.count({where:{organizationId:org,sourceLead:{...scope,status:"APPROVED"}}}),
      this.db.lead.count({where:{...scope,status:"REJECTED"}}),
      this.db.lead.count({where:{...scope,status:"APPROVED"}}),
      this.db.lead.count({where:{...scope,status:"PENDING"}}),
      this.db.lead.count({where:{...scope,status:"MEETING_PROCESS"}}),
      this.db.lead.count({where:{...scope,status:"DECISION_PENDING"}}),
      this.db.lead.count({where:{...scope,status:"AGREEMENT_PENDING"}}),
      this.db.lead.count({where:{...scope,status:"FOLLOW_UP"}}),
      this.db.lead.count({where:{organizationId:org,deletedAt:null,nextFollowUpAt:{lt:new Date()},
        status:{in:["PENDING","MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","FOLLOW_UP"]}}}),
    ]);
    sections.leads={created,converted,approved,rejected,pending,meetingProcess,decisionPending,agreementPending,followUp,
      conversionRatePercent:created?Math.round(converted/created*10000)/100:0,
      overdueFollowUps:overdue};
  })());
  if(can(a,"clients.read"))work.push(this.db.client.count({where:{organizationId:org,status:"ACTIVE"}})
    .then(count=>{sections.clients={active:count};}));
  if(can(a,"projects.read"))work.push((async()=>{
    const scope={organizationId:org,...projectScope(a)};
    const [active,completed]=await Promise.all([
      this.db.project.count({where:{...scope,status:"ACTIVE"}}),
      this.db.project.count({where:{...scope,status:"COMPLETED"}}),
    ]);sections.projects={active,completedCurrent:completed};
  })());
  if(can(a,"tasks.read"))work.push((async()=>{
    const scope={organizationId:org,...taskScope(a)};
    const [open,overdue,completed]=await Promise.all([
      this.db.task.count({where:{...scope,status:{notIn:["DONE","CANCELLED"]}}}),
      this.db.task.count({where:{...scope,dueAt:{lt:new Date()},status:{notIn:["DONE","CANCELLED"]}}}),
      this.db.task.count({where:{...scope,completedAt:{gte:start,lte:end},status:"DONE"}}),
    ]);sections.tasks={open,overdue,completed};
  })());
  if(can(a,"content.read"))work.push((async()=>{
    const scope={organizationId:org,...contentScope(a)};
    const [scheduled,published,pending]=await Promise.all([
      this.db.contentPost.count({where:{...scope,status:"SCHEDULED",publishAt:{gte:start,lte:end}}}),
      this.db.contentPost.count({where:{...scope,status:"PUBLISHED",publishedAt:{gte:start,lte:end}}}),
      this.db.contentPost.count({where:{...scope,status:"IN_REVIEW"}}),
    ]);sections.content={scheduled,published,pendingReview:pending};
  })());
  if(can(a,"invoices.read"))work.push((async()=>{
    const invoices=await this.db.invoice.findMany({where:{organizationId:org,status:"ISSUED"},
      select:{dueOn:true,paidTotal:true,total:true}});
    const uncollected=invoices.filter(i=>i.total.gt(i.paidTotal));
    const overdue=uncollected.filter(i=>i.dueOn<new Date(new Date().toISOString().slice(0,10)+"T00:00:00Z"));
    sections.invoices={unpaidCount:uncollected.length,overdueCount:overdue.length,
      outstanding:uncollected.reduce((s,i)=>s.plus(i.total.minus(i.paidTotal)),new Prisma.Decimal(0)).toFixed(4)};
  })());
  if(can(a,"finance.read.all"))work.push((async()=>{
    const sums=await this.db.financialTransaction.groupBy({by:["kind"],where:{
      organizationId:org,status:"POSTED",occurredOn:{gte:start,lte:end}},
      _sum:{amount:true}});
    sections.cashLedger={currency:"INR",posted:sums.map(v=>({
      kind:v.kind,amount:v._sum.amount?.toFixed(2)??"0.00"}))};
  })());
  await Promise.all(work);
  return {from,to,asOf:new Date().toISOString(),sections,
    definitions:{
      period:"UTC dates, inclusive",
      leadConversion:"Approved leads with linked clients divided by all non-deleted leads created in the selected period; rejected leads are included in the denominator",
      overdue:"Current outstanding records, not a historical snapshot",
      payments:"Verified receipts are included in the posted cash ledger only; invoices are not revenue",
      access:"Only permitted modules and record-level scopes are included",
    }};
 }
}
