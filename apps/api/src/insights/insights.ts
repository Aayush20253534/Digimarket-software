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
  const org=a.organizationId,match={contains:q,mode:"insensitive" as const};
  const parts:Promise<SearchHit[]>[]=[];
  if(can(a,"leads.read"))parts.push(this.db.lead.findMany({
    where:{organizationId:org,businessName:match},orderBy:{updatedAt:"desc"},take:8,
    select:{id:true,businessName:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"lead",id:x.id,title:x.businessName,detail:"Lead · "+x.status,href:"/app/leads"}))));
  if(can(a,"clients.read"))parts.push(this.db.client.findMany({
    where:{organizationId:org,businessName:match},orderBy:{updatedAt:"desc"},take:8,
    select:{id:true,businessName:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"client",id:x.id,title:x.businessName,detail:"Client · "+x.status,href:"/app/clients"}))));
  if(can(a,"projects.read"))parts.push(this.db.project.findMany({
    where:{organizationId:org,name:match,...projectScope(a)},take:8,orderBy:{updatedAt:"desc"},
    select:{id:true,name:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"project",id:x.id,title:x.name,detail:"Project · "+x.status,href:"/app/projects"}))));
  if(can(a,"tasks.read"))parts.push(this.db.task.findMany({
    where:{organizationId:org,title:match,...taskScope(a)},take:8,orderBy:{updatedAt:"desc"},
    select:{id:true,title:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"task",id:x.id,title:x.title,detail:"Task · "+x.status,href:"/app/tasks"}))));
  if(can(a,"content.read"))parts.push(this.db.contentPost.findMany({
    where:{organizationId:org,title:match,...contentScope(a)},take:8,orderBy:{updatedAt:"desc"},
    select:{id:true,title:true,status:true},
  }).then(rows=>rows.map(x=>({kind:"content",id:x.id,title:x.title,detail:"Content · "+x.status,href:"/app/content"}))));
  if(can(a,"invoices.read"))parts.push(this.db.invoice.findMany({
    where:{organizationId:org,status:"ISSUED",
      OR:[{number:match},{client:{businessName:match}}]},take:8,orderBy:{updatedAt:"desc"},
    select:{id:true,number:true,status:true,client:{select:{businessName:true}}},
  }).then(rows=>rows.map(x=>({kind:"invoice",id:x.id,title:x.number??"Invoice",
    detail:"Invoice · "+x.client.businessName,href:"/app/billing"}))));
  const grouped=await Promise.all(parts);
  return {query:q,items:grouped.flat().slice(0,40)};
 }
 async report(a:Principal,from:string,to:string){
  requireGrant(a,"reports.business.read");
  const org=a.organizationId;
  const start=new Date(from+"T00:00:00.000Z"),end=new Date(to+"T23:59:59.999Z");
  const sections:Record<string,unknown>={};
  const work:Promise<void>[]=[];
  if(can(a,"leads.read"))work.push((async()=>{
    const [created,converted,overdue]=await Promise.all([
      this.db.lead.count({where:{organizationId:org,createdAt:{gte:start,lte:end}}}),
      this.db.lead.count({where:{organizationId:org,status:"WON",updatedAt:{gte:start,lte:end}}}),
      this.db.lead.count({where:{organizationId:org,nextFollowUpAt:{lt:new Date()},
        status:{notIn:["WON","LOST"]}}}),
    ]);sections.leads={created,wonCurrently:converted,overdueFollowUps:overdue};
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
      kind:v.kind,amount:v._sum.amount?.toFixed(4)??"0.0000"}))};
  })());
  await Promise.all(work);
  return {from,to,asOf:new Date().toISOString(),sections,
    definitions:{
      period:"UTC dates, inclusive",
      overdue:"Current outstanding records, not a historical snapshot",
      payments:"Verified receipts are included in the posted cash ledger only; invoices are not revenue",
      access:"Only permitted modules and record-level scopes are included",
    }};
 }
}
