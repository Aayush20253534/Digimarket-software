import { Prisma, type PrismaClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { founderPolicy, isFounder } from "../approvals/founder";
import { AuthError, forbidden, invalid } from "../auth/errors";
import type { InvoiceDraftInput,InvoiceEditInput,InvoiceListInput,PaymentRecordInput,BillingScheduleInput } from "@digimarket/contracts";
import {calculateLines,D,dated,out} from "./math";

const need=(a:Principal,p:string)=>{if(!a.permissions.has(p))throw forbidden();};
const missing=()=>new AuthError(404,"NOT_FOUND","Billing record not found");
const clash=()=>new AuthError(409,"VERSION_CONFLICT","Billing record changed; reload");
const duplicate=()=>new AuthError(409,"DUPLICATE","Payment reference or idempotency key already exists");
const optional=(s?:string)=>s?.trim()||null;
const printable=(i:{total:Prisma.Decimal;paidTotal:Prisma.Decimal;dueOn:Date;status:string})=>{
 if(i.status==="DRAFT"||i.status==="VOID")return i.status;
 if(i.paidTotal.gte(i.total))return "PAID";
 if(i.paidTotal.gt(0))return "PARTIALLY_PAID";
 if(i.dueOn<dated(new Date().toISOString().slice(0,10)))return "OVERDUE";
 return "UNPAID";
};
const serial={isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000};
async function retry<T>(fn:()=>Promise<T>):Promise<T>{
 for(let i=0;i<4;i++)try{return await fn();}
 catch(e){if((e as {code?:string}).code!=="P2034"||i===3)throw e;}
 throw clash();
}
export class BillingService{
 constructor(private readonly db:PrismaClient){}
 private async client(a:Principal,clientId:string){
   const client=await this.db.client.findFirst({where:{id:clientId,organizationId:a.organizationId,status:{not:"ARCHIVED"}}});
   if(!client)throw missing();
   return client;
 }
 private async get(a:Principal,id:string){
  need(a,"invoices.read");
  const row=await this.db.invoice.findFirst({where:{id,organizationId:a.organizationId},
   include:{lines:{orderBy:{position:"asc"}},client:{select:{businessName:true}},
    allocations:{where:{payment:{status:"VERIFIED"}},select:{amount:true,paymentId:true}}}});
  if(!row)throw missing();
  return row;
 }
 async list(a:Principal,q:InvoiceListInput){
  need(a,"invoices.read");
  const rows=await this.db.invoice.findMany({where:{organizationId:a.organizationId,
   ...(q.clientId?{clientId:q.clientId}:{}),...(q.status?{status:q.status}:{})},
   orderBy:[{createdAt:"desc"},{id:"desc"}],take:q.limit+1,
   ...(q.cursor?{cursor:{id:q.cursor},skip:1}:{}),
   include:{client:{select:{businessName:true}}}});
  return {items:rows.slice(0,q.limit).map(i=>({...i,settlement:printable(i),balance:out(i.total.minus(i.paidTotal))})),
   nextCursor:rows.length>q.limit?rows[q.limit-1].id:null};
 }
 async detail(a:Principal,id:string){
  const row=await this.get(a,id);
  return {...row,settlement:printable(row),balance:out(row.total.minus(row.paidTotal))};
 }
 async create(a:Principal,input:InvoiceDraftInput){
  need(a,"invoices.draft");need(a,"invoices.read");await this.client(a,input.clientId);
  const org=await this.db.organization.findUniqueOrThrow({where:{id:a.organizationId}});
  if(org.defaultCurrency!=="INR")throw invalid("Billing supports INR workspaces only");
  let calc:ReturnType<typeof calculateLines>;
  try{calc=calculateLines(input.lines);}catch(e){throw invalid((e as Error).message);}
  return this.db.$transaction(async tx=>{
   const invoice=await tx.invoice.create({data:{
    organizationId:a.organizationId,clientId:input.clientId,createdById:a.userId,
    sellerName:input.sellerName,sellerAddress:input.sellerAddress,sellerTaxId:optional(input.sellerTaxId),
    buyerName:input.buyerName,buyerAddress:optional(input.buyerAddress),notes:optional(input.notes),
    dueOn:dated(input.dueOn),subtotal:calc.subtotal,taxTotal:calc.taxTotal,total:calc.total,
    lines:{create:calc.items},
   }});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"invoices.draft_created",entityType:"Invoice",entityId:invoice.id}});
   return invoice;
  });
 }
 async edit(a:Principal,id:string,input:InvoiceEditInput){
  need(a,"invoices.draft");const current=await this.get(a,id);
  if(current.status!=="DRAFT")throw invalid("Issued invoice lines are immutable");
  let calc:ReturnType<typeof calculateLines>;
  try{calc=calculateLines(input.lines);}catch(e){throw invalid((e as Error).message);}
  return this.db.$transaction(async tx=>{
   const changed=await tx.invoice.updateMany({where:{id,organizationId:a.organizationId,
    status:"DRAFT",version:input.version},data:{sellerName:input.sellerName,sellerAddress:input.sellerAddress,
    sellerTaxId:optional(input.sellerTaxId),buyerName:input.buyerName,buyerAddress:optional(input.buyerAddress),
    dueOn:dated(input.dueOn),notes:optional(input.notes),
    subtotal:calc.subtotal,taxTotal:calc.taxTotal,total:calc.total,version:{increment:1}}});
   if(changed.count!==1)throw clash();
   await tx.invoiceLine.deleteMany({where:{invoiceId:id}});
   await tx.invoiceLine.createMany({data:calc.items.map(item=>({...item,invoiceId:id}))});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"invoices.draft_updated",entityType:"Invoice",entityId:id}});
   return tx.invoice.findUniqueOrThrow({where:{id}});
  });
 }
 async issue(a:Principal,id:string,version:number){
  need(a,"invoices.issue");
  return retry(()=>this.db.$transaction(async tx=>{
   const invoice=await tx.invoice.findFirst({where:{id,organizationId:a.organizationId}});
   if(!invoice)throw missing();
   if(invoice.status!=="DRAFT"||invoice.version!==version)throw clash();
   const counter=await tx.invoiceCounter.upsert({where:{organizationId:a.organizationId},
     create:{organizationId:a.organizationId,nextNumber:1},
     update:{nextNumber:{increment:1}}});
   const settings=await tx.organizationBillingSettings.findUnique({where:{organizationId:a.organizationId}});
   const invoicePrefix=settings?.invoicePrefix??"INV";
   const number=invoicePrefix+"-"+String(new Date().getUTCFullYear())+"-"+String(counter.nextNumber).padStart(6,"0");
   const changed=await tx.invoice.updateMany({where:{id,organizationId:a.organizationId,status:"DRAFT",version},
     data:{number,status:"ISSUED",issuedOn:dated(new Date().toISOString().slice(0,10)),issuedById:a.userId,version:{increment:1}}});
   if(changed.count!==1)throw clash();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"invoices.issued",entityType:"Invoice",entityId:id,afterRedacted:{number}}});
   await tx.outboxEvent.create({data:{organizationId:a.organizationId,eventKey:"invoice.issued."+id,
    kind:"invoices.issued",aggregateType:"Invoice",aggregateId:id,payloadMinimal:{invoiceId:id}}});
   return tx.invoice.findUniqueOrThrow({where:{id}});
  },serial));
 }
 async void(a:Principal,id:string,version:number){
  need(a,"invoices.manage");
  return retry(()=>this.db.$transaction(async tx=>{
   const p=await tx.invoice.findFirst({where:{id,organizationId:a.organizationId}});
   if(!p)throw missing();
   if(p.paidTotal.gt(0)||p.status!=="ISSUED")throw invalid("Cannot void collected or non-issued invoice");
   if(await tx.revenueRecognition.count({where:{invoiceId:id}}))
     throw invalid("Invoice has revenue recognition history; reverse and use a correction workflow");
   const done=await tx.invoice.updateMany({where:{id,organizationId:a.organizationId,version,status:"ISSUED",
     paidTotal:0},data:{version:{increment:1},status:"VOID"}});
   if(done.count!==1)throw clash();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"invoices.voided",entityType:"Invoice",entityId:id}});
   return tx.invoice.findUniqueOrThrow({where:{id}});
  },serial));
 }
 async pdf(a:Principal,id:string){
  const row=await this.get(a,id);
  if(row.status==="DRAFT")throw invalid("Issue invoice before downloading PDF");
  const {invoicePdf}=await import("./pdf");
  const bytes=await invoicePdf(row);
  await this.db.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"invoices.pdf_downloaded",entityType:"Invoice",entityId:id}});
  return {filename:(row.number??"invoice")+".pdf",base64:Buffer.from(bytes).toString("base64"),mime:"application/pdf"};
 }
 async payments(a:Principal,clientId?:string){
  need(a,"payments.read");
  return this.db.payment.findMany({where:{organizationId:a.organizationId,...(clientId?{clientId}:{})},
   orderBy:{createdAt:"desc"},take:200,include:{client:{select:{businessName:true}},
    allocations:{select:{invoiceId:true,amount:true,invoice:{select:{number:true}}}}}});
 }
 async record(a:Principal,input:PaymentRecordInput){
  need(a,"payments.record");need(a,"payments.read");await this.client(a,input.clientId);
  const category=await this.db.financialCategory.findFirst({where:{id:input.categoryId,
   organizationId:a.organizationId,kind:"INCOME",active:true}});
  if(!category)throw invalid("Select an active INCOME category");
  const amount=D(input.amount);
  if(amount.lte(0)||!amount.isFinite())throw invalid("Invalid payment amount");
  const allocated=input.allocations.reduce((v,x)=>v.plus(D(x.amount)),D(0));
  if(!allocated.eq(amount)||input.allocations.some(x=>D(x.amount).lte(0)))
    throw invalid("Allocations must be positive and exactly match the received amount");
  const invoices=await this.db.invoice.findMany({where:{id:{in:input.allocations.map(x=>x.invoiceId)},
   organizationId:a.organizationId,clientId:input.clientId,status:"ISSUED"}});
  if(invoices.length!==input.allocations.length)throw missing();
  for(const i of invoices){
    const portion=D(input.allocations.find(x=>x.invoiceId===i.id)!.amount);
    if(portion.gt(i.total.minus(i.paidTotal)))throw invalid("Allocation exceeds invoice balance");
  }
  // Founders record and settle a verified payment atomically. Other roles
  // retain the two-person verification workflow.
  if(isFounder(a)){
   try{return await retry(()=>this.db.$transaction(async tx=>{
    const now=new Date();
    const payment=await tx.payment.create({data:{
     organizationId:a.organizationId,clientId:input.clientId,recordedById:a.userId,
     verifiedById:a.userId,verifiedAt:now,status:"VERIFIED",
     categoryId:category.id,idempotencyKey:input.idempotencyKey,
     amount:amount.toFixed(4),receivedOn:dated(input.receivedOn),method:input.method,
     reference:input.reference,allocations:{create:input.allocations.map(x=>({
      invoiceId:x.invoiceId,amount:x.amount,
     }))},
    }});
    for(const allocation of input.allocations){
     const invoice=await tx.invoice.findFirst({where:{
      id:allocation.invoiceId,organizationId:a.organizationId,
      clientId:input.clientId,status:"ISSUED",
     }});
     const portion=D(allocation.amount);
     if(!invoice||portion.gt(invoice.total.minus(invoice.paidTotal)))
      throw invalid("Invoice has insufficient outstanding balance");
     const changed=await tx.invoice.updateMany({where:{
      id:invoice.id,organizationId:a.organizationId,status:"ISSUED",version:invoice.version,
     },data:{paidTotal:{increment:portion},version:{increment:1}}});
     if(changed.count!==1)throw clash();
    }
    const policy=await founderPolicy(tx,a.organizationId,"FINANCE");
    const approval=await tx.approvalRequest.create({data:{
     organizationId:a.organizationId,policyId:policy.id,requesterId:a.userId,
     title:"Founder client payment",description:"Direct invoice settlement",
     referenceType:"FINANCE_ENTRY",status:"APPROVED",decidedAt:now,
     approverRoleKeys:policy.approverRoleKeys,
    }});
    await tx.approvalDecision.create({data:{
     requestId:approval.id,actorId:a.userId,outcome:"APPROVED",
     reason:"Founder payment posted without separate verification",
    }});
    const ledger=await tx.financialTransaction.create({data:{
     organizationId:a.organizationId,enteredById:a.userId,categoryId:category.id,
     approvalRequestId:approval.id,idempotencyKey:input.idempotencyKey,kind:"INCOME",
     amount:amount.toFixed(4),currencyCode:payment.currencyCode,
     occurredOn:dated(input.receivedOn),method:input.method,
     merchantOrSource:"Client invoice settlement",description:"Founder payment "+payment.id,
     status:"POSTED",postedAt:now,
    }});
    await tx.approvalRequest.update({where:{id:approval.id},data:{referenceId:ledger.id}});
    await tx.payment.update({where:{id:payment.id},data:{ledgerEntryId:ledger.id,version:{increment:1}}});
    await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
     action:"payments.founder_recorded_and_posted",entityType:"Payment",entityId:payment.id,
     afterRedacted:{status:"VERIFIED",ledgerId:ledger.id}}});
    await tx.outboxEvent.create({data:{organizationId:a.organizationId,
     eventKey:"payment.verified."+payment.id,kind:"payments.verified",
     aggregateType:"Payment",aggregateId:payment.id,
     payloadMinimal:{paymentId:payment.id,ledgerId:ledger.id}}});
    return tx.payment.findUniqueOrThrow({where:{id:payment.id}});
   },serial));}catch(e){if((e as {code?:string}).code==="P2002")throw duplicate();throw e;}
  }
  try{return await this.db.$transaction(async tx=>{
   const p=await tx.payment.create({data:{organizationId:a.organizationId,clientId:input.clientId,
    recordedById:a.userId,categoryId:category.id,idempotencyKey:input.idempotencyKey,
    amount:amount.toFixed(4),receivedOn:dated(input.receivedOn),method:input.method,reference:input.reference,
    allocations:{create:input.allocations.map(x=>({invoiceId:x.invoiceId,amount:x.amount}))}}});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"payments.recorded",entityType:"Payment",entityId:p.id,afterRedacted:{status:"PENDING"}}});
   return p;
  });}catch(e){if((e as {code?:string}).code==="P2002")throw duplicate();throw e;}
 }
 async verify(a:Principal,id:string,version:number){
  need(a,"payments.verify");need(a,"finance.approve");
  return retry(()=>this.db.$transaction(async tx=>{
   const p=await tx.payment.findFirst({where:{id,organizationId:a.organizationId},
    include:{allocations:{orderBy:{invoiceId:"asc"}}}});
   if(!p)throw missing();
   if(p.status!=="PENDING"||p.version!==version)throw clash();
   if(p.recordedById===a.userId)throw forbidden();
   const category=await tx.financialCategory.findFirst({where:{id:p.categoryId,organizationId:a.organizationId,
    kind:"INCOME",active:true}});
   if(!category)throw invalid("Payment income category inactive");
   const policy=await tx.approvalPolicy.findUnique({where:{
    organizationId_category:{organizationId:a.organizationId,category:"FINANCE"}}});
   if(!policy?.active||!policy.approverRoleKeys.some(x=>a.roles.includes(x)))
     throw invalid("Authorized FINANCE approval policy required for payment verification");
   for(const alloc of p.allocations){
    const invoice=await tx.invoice.findFirst({where:{id:alloc.invoiceId,organizationId:a.organizationId,
      clientId:p.clientId,status:"ISSUED"}});
    if(!invoice||alloc.amount.gt(invoice.total.minus(invoice.paidTotal)))throw invalid("Invoice has insufficient outstanding balance");
    const moved=await tx.invoice.updateMany({where:{id:invoice.id,organizationId:a.organizationId,
      status:"ISSUED",version:invoice.version},
      data:{paidTotal:{increment:alloc.amount},version:{increment:1}}});
    if(moved.count!==1)throw clash();
   }
   const now=new Date();
   const approved=await tx.approvalRequest.create({data:{
    organizationId:a.organizationId,policyId:policy.id,requesterId:p.recordedById,
    title:"Verified client payment",description:"Agency cash receipt confirmed against invoices",
    referenceType:"FINANCE_ENTRY",status:"APPROVED",decidedAt:now,
    approverRoleKeys:policy.approverRoleKeys,
   }});
   await tx.approvalDecision.create({data:{requestId:approved.id,actorId:a.userId,outcome:"APPROVED"}});
   const ledger=await tx.financialTransaction.create({data:{
    organizationId:a.organizationId,enteredById:p.recordedById,categoryId:p.categoryId,
    approvalRequestId:approved.id,idempotencyKey:p.idempotencyKey,kind:"INCOME",
    amount:p.amount,currencyCode:p.currencyCode,occurredOn:p.receivedOn,method:p.method,
    merchantOrSource:"Client invoice settlement",description:"Verified payment "+p.id,
    status:"POSTED",postedAt:now,
   }});
   await tx.approvalRequest.update({where:{id:approved.id},data:{referenceId:ledger.id}});
   const success=await tx.payment.updateMany({where:{id,organizationId:a.organizationId,status:"PENDING",version},
    data:{status:"VERIFIED",version:{increment:1},verifiedById:a.userId,verifiedAt:now,ledgerEntryId:ledger.id}});
   if(success.count!==1)throw clash();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"payments.verified_and_posted",entityType:"Payment",entityId:id,afterRedacted:{ledgerId:ledger.id}}});
   await tx.outboxEvent.create({data:{organizationId:a.organizationId,eventKey:"payment.verified."+id,
    kind:"payments.verified",aggregateType:"Payment",aggregateId:id,
    payloadMinimal:{paymentId:id,ledgerId:ledger.id}}});
   return tx.payment.findUniqueOrThrow({where:{id}});
  },serial));
 }
 async reject(a:Principal,id:string,version:number){
  need(a,"payments.verify");
  const payment=await this.db.payment.findFirst({where:{id,organizationId:a.organizationId}});
  if(!payment)throw missing();
  if(payment.recordedById===a.userId)throw forbidden();
  return this.db.$transaction(async tx=>{
   const update=await tx.payment.updateMany({where:{id,organizationId:a.organizationId,status:"PENDING",version},
    data:{status:"REJECTED",version:{increment:1},verifiedById:a.userId,verifiedAt:new Date()}});
   if(update.count!==1)throw clash();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"payments.rejected",entityType:"Payment",entityId:id}});
   return tx.payment.findUniqueOrThrow({where:{id}});
  });
 }
 async receivables(a:Principal){
  need(a,"invoices.read");
  const rows=await this.db.invoice.findMany({where:{organizationId:a.organizationId,status:"ISSUED"},
   select:{id:true,clientId:true,total:true,paidTotal:true,dueOn:true}});
  const total=rows.reduce((v,i)=>v.plus(i.total.minus(i.paidTotal)),D(0));
  const overdue=rows.filter(i=>i.dueOn<dated(new Date().toISOString().slice(0,10))&&i.paidTotal.lt(i.total));
  return {currency:"INR",openCount:rows.filter(i=>i.paidTotal.lt(i.total)).length,
   receivable:out(total),overdueCount:overdue.length,
   overdue:out(overdue.reduce((v,i)=>v.plus(i.total.minus(i.paidTotal)),D(0)))};
 }
 async createSchedule(a:Principal,input:BillingScheduleInput){
  need(a,"invoices.manage");need(a,"invoices.draft");await this.client(a,input.clientId);
  let calc:ReturnType<typeof calculateLines>;
  try{calc=calculateLines(input.lines);}catch(e){throw invalid((e as Error).message);}
  if(new Date(input.startAt)<new Date(Date.now()-30*86400000))throw invalid("Schedule starts too far in the past");
  return this.db.$transaction(async tx=>{
   const b=await tx.billingSchedule.create({data:{
    organizationId:a.organizationId,clientId:input.clientId,createdById:a.userId,
    sellerName:input.sellerName,sellerAddress:input.sellerAddress,sellerTaxId:optional(input.sellerTaxId),
    buyerName:input.buyerName,buyerAddress:optional(input.buyerAddress),notes:optional(input.notes),
    lines:calc.items,frequency:input.frequency,anchorAt:new Date(input.startAt),
    nextRunAt:new Date(input.startAt),dueAfterDays:input.dueAfterDays,
   }});
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:"billing.schedule_created",entityType:"BillingSchedule",entityId:b.id}});
   return b;
  });
 }
 async schedules(a:Principal){
  need(a,"invoices.manage");
  return this.db.billingSchedule.findMany({where:{organizationId:a.organizationId},
   orderBy:{createdAt:"desc"},take:100});
 }
 async toggleSchedule(a:Principal,id:string,version:number,enabled:boolean){
  need(a,"invoices.manage");
  return this.db.$transaction(async tx=>{
   const result=await tx.billingSchedule.updateMany({where:{id,organizationId:a.organizationId,version},
    data:{enabled,version:{increment:1}}});
   if(result.count!==1)throw clash();
   await tx.auditLog.create({data:{organizationId:a.organizationId,actorId:a.userId,
    action:enabled?"billing.schedule_resumed":"billing.schedule_paused",entityType:"BillingSchedule",entityId:id}});
   return tx.billingSchedule.findUniqueOrThrow({where:{id}});
  });
 }
}
