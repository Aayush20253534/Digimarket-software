import {Prisma,type PrismaClient} from "@digimarket/db";
type Alert={organizationId:string;recipientId:string;dedupeKey:string;kind:string;
 title:string;body:string;href:string};
const key=(day:Date)=>day.toISOString().slice(0,10);
const start=(day:Date)=>new Date(day.toISOString().slice(0,10)+"T00:00:00Z");
const active="ACTIVE";
export async function sweepAlerts(db:PrismaClient,now=new Date()){
 const day=key(now),today=start(now);
 const [tasks,leads,invoices,approvals]=await Promise.all([
  db.task.findMany({where:{dueAt:{lt:now},status:{notIn:["DONE","CANCELLED"]}},
    orderBy:{dueAt:"asc"},take:100,select:{id:true,organizationId:true,createdById:true,
      assignees:{select:{userId:true}}}}),
  db.lead.findMany({where:{deletedAt:null,nextFollowUpAt:{lt:now},status:{in:["PENDING","MEETING_PROCESS"]}},
    orderBy:{nextFollowUpAt:"asc"},take:100,
    select:{id:true,organizationId:true,assignedToId:true,createdById:true}}),
  db.invoice.findMany({where:{status:"ISSUED",dueOn:{lt:today}},
    orderBy:{dueOn:"asc"},take:100,select:{id:true,organizationId:true,total:true,paidTotal:true}}),
  db.approvalRequest.findMany({where:{status:"PENDING"},orderBy:{createdAt:"asc"},take:100,
    select:{id:true,organizationId:true,requesterId:true,referenceType:true,
      approverRoleKeys:true}}),
 ]);
 const orgIds=[...new Set([...tasks,...leads,...invoices,...approvals].map(x=>x.organizationId))];
 const users=await db.user.findMany({where:{organizationId:{in:orgIds},status:active},
  select:{id:true,organizationId:true,roles:{select:{role:{select:{key:true,permissions:{
    select:{permissionKey:true}}}}}}}});
 const eligible=(org:string,permission:string)=>users.filter(u=>u.organizationId===org&&
  u.roles.some(r=>r.role.permissions.some(p=>p.permissionKey===permission)));
 const permitted=(org:string,uid:string,permission:string)=>
  eligible(org,permission).some(x=>x.id===uid);
 const alerts:Alert[]=[];
 for(const t of tasks){
  for(const uid of new Set(t.assignees.map(x=>x.userId))){
   if(!permitted(t.organizationId,uid,"tasks.read"))continue;
   alerts.push({organizationId:t.organizationId,recipientId:uid,dedupeKey:"task:"+t.id+":"+day,
    kind:"TASK_DUE",title:"Task needs attention",body:"An assigned task is overdue.",href:"/app/tasks"});
  }
 }
 for(const lead of leads){
  const uid=lead.assignedToId??lead.createdById;
  if(!permitted(lead.organizationId,uid,"leads.read"))continue;
  alerts.push({organizationId:lead.organizationId,recipientId:uid,
    dedupeKey:"lead:"+lead.id+":"+day,kind:"LEAD_FOLLOWUP",
    title:"Follow up with a lead",body:"A scheduled lead follow-up is due.",href:"/app/leads"});
 }
 for(const i of invoices){
  if(i.paidTotal.gte(i.total))continue;
  for(const user of eligible(i.organizationId,"invoices.read")){
   alerts.push({organizationId:i.organizationId,recipientId:user.id,
    dedupeKey:"invoice:"+i.id+":"+day,kind:"INVOICE_OVERDUE",
    title:"Invoice payment overdue",body:"An outstanding client invoice is overdue.",href:"/app/billing"});
  }
 }
 for(const request of approvals){
  for(const user of eligible(request.organizationId,"approvals.decide")){
   if(user.id===request.requesterId||!user.roles.some(r=>request.approverRoleKeys.includes(r.role.key)))continue;
   if(!permitted(request.organizationId,user.id,"approvals.read"))continue;
   if(request.referenceType==="CONTENT_POST"&&!permitted(request.organizationId,user.id,"content.approve"))continue;
   if(request.referenceType==="PROJECT_DELIVERABLE"&&!permitted(request.organizationId,user.id,"projects.review"))continue;
   alerts.push({organizationId:request.organizationId,recipientId:user.id,
     dedupeKey:"approval:"+request.id+":"+day,kind:"APPROVAL_PENDING",
     title:"Approval awaiting review",body:"A pending request needs a decision.",href:"/app/approvals"});
  }
 }
 if(alerts.length)await db.notification.createMany({data:alerts,skipDuplicates:true});
 return {candidates:alerts.length,seen:{tasks:tasks.length,leads:leads.length,
  invoices:invoices.length,approvals:approvals.length}};
}
// Read-only financial reconciliation: never changes invoice balances or ledger postings.
// A discrepancy creates a generic notice to privileged invoice/finance managers only.
export async function reconcileInvoices(db:PrismaClient,now=new Date()){
 const invoices=await db.invoice.findMany({where:{status:"ISSUED"},
  select:{id:true,organizationId:true,paidTotal:true,
    allocations:{where:{payment:{status:"VERIFIED"}},select:{amount:true}}},
  orderBy:{updatedAt:"desc"},take:150});
 const bad=invoices.filter(x=>!x.allocations.reduce((s,v)=>s.plus(v.amount),new Prisma.Decimal(0)).eq(x.paidTotal));
 if(!bad.length)return {checked:invoices.length,discrepancies:0};
 const orgs=[...new Set(bad.map(x=>x.organizationId))];
 const staff=await db.user.findMany({where:{organizationId:{in:orgs},status:"ACTIVE",
  roles:{some:{role:{permissions:{some:{permissionKey:"finance.read.all"}}}}}},
  select:{id:true,organizationId:true}});
 const notices=bad.flatMap(x=>staff.filter(u=>u.organizationId===x.organizationId).map(u=>({
  organizationId:x.organizationId,recipientId:u.id,kind:"RECONCILIATION",
  dedupeKey:"reconcile:"+x.id+":"+key(now),title:"Invoice reconciliation check",
  body:"A mismatch between verified allocations and invoice balance needs review.",
  href:"/app/billing",
 })));
 if(notices.length)await db.notification.createMany({data:notices,skipDuplicates:true});
 return {checked:invoices.length,discrepancies:bad.length};
}
