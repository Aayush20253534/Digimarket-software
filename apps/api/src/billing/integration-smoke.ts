import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {BillingService} from "./service";
import {FinanceService} from "../finance/service";
import {sweepBillingSchedules} from "../../../worker/src/billing-recurrence";
import {invoiceDraftSchema,paymentRecordSchema} from "@digimarket/contracts";
if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 13 requires disposable digimarket_ci PostgreSQL");
const db=createDatabaseClient(),billing=new BillingService(db),finance=new FinanceService(db);
const principal=(userId:string,organizationId:string,permissions:string[],roles=["ADMIN"]):Principal=>
 ({userId,organizationId,sessionId:"ci",roles,permissions:new Set(permissions)});
const all=["invoices.read","invoices.draft","invoices.issue","invoices.manage","payments.read",
 "payments.record","payments.verify","finance.approve","finance.read.all","clients.read"];
const fail=(status:number)=>(e:{status?:number})=>e.status===status;
try{
 const a=await db.organization.create({data:{name:"Billing CI A"}});
 const b=await db.organization.create({data:{name:"Billing CI B"}});
 const [writer,approver,observer,external]=await Promise.all([
  db.user.create({data:{organizationId:a.id,loginId:"billing-writer",displayName:"Writer",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:a.id,loginId:"billing-approver",displayName:"Approver",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:a.id,loginId:"billing-observer",displayName:"Observer",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:b.id,loginId:"billing-outsider",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const admin=principal(writer.id,a.id,all);
 const verifier=principal(approver.id,a.id,all);
 const noApproval=principal(observer.id,a.id,["invoices.read","payments.read"]);
 const foreign=principal(external.id,b.id,all);
 const client=await db.client.create({data:{organizationId:a.id,createdById:writer.id,businessName:"Cafe"}});
 const otherClient=await db.client.create({data:{organizationId:b.id,createdById:external.id,businessName:"Outside"}});
 const income=await db.financialCategory.create({data:{organizationId:a.id,kind:"INCOME",
   name:"Client settlement",normalizedName:"client settlement"}});
 const policy=await db.approvalPolicy.create({data:{organizationId:a.id,category:"FINANCE",name:"Finance approval",
  active:true,approverRoleKeys:["ADMIN"]}});
 assert.ok(policy.id);
 const draftInput={clientId:client.id,sellerName:"BrandSpace Agency",sellerAddress:"Civil Lines, Prayagraj",
  buyerName:"Cafe",dueOn:"2026-11-30",lines:[{description:"Marketing services",quantity:"1.00",
   unitPrice:"100.0000",taxRate:"0"}]};
 await assert.rejects(()=>billing.create(admin,{...draftInput,clientId:otherClient.id}),fail(404));
 invoiceDraftSchema.parse(draftInput);
 paymentRecordSchema.parse({clientId:client.id,categoryId:income.id,amount:"40.0000",
  receivedOn:"2026-10-20",method:"UPI",reference:"receipt-xxxx",idempotencyKey:randomUUID(),
  allocations:[{invoiceId:randomUUID(),amount:"40.0000"}]});
 const draft=await billing.create(admin,draftInput);
 assert.equal(draft.status,"DRAFT");assert.equal(draft.total.toFixed(4),"100.0000");
 assert.equal((await billing.list(foreign,{limit:20})).items.length,0);
 await assert.rejects(()=>billing.detail(foreign,draft.id),fail(404));
 const issue=await billing.issue(admin,draft.id,1);
 assert.equal(issue.number?.startsWith("INV-"),true);
 assert.equal(issue.status,"ISSUED");
 const second=await billing.create(admin,draftInput);
 const secondIssued=await billing.issue(admin,second.id,1);
 assert.notEqual(secondIssued.number,issue.number);
 const pdf=await billing.pdf(admin,draft.id);
 assert.equal(pdf.mime,"application/pdf");
 assert.ok(Buffer.from(pdf.base64,"base64").subarray(0,5).toString()==="%PDF-");
 await assert.rejects(()=>billing.edit(admin,draft.id,{version:2,sellerName:draftInput.sellerName,
 sellerAddress:draftInput.sellerAddress,buyerName:draftInput.buyerName,dueOn:draftInput.dueOn,
 lines:draftInput.lines}),fail(422));
 await assert.rejects(()=>billing.void(admin,draft.id,1),fail(409));
 const serialKey=randomUUID();
 const one=await billing.record(admin,{clientId:client.id,categoryId:income.id,amount:"40.0000",
  receivedOn:"2026-10-20",method:"UPI",reference:"receipt-"+randomUUID(),
  idempotencyKey:serialKey,allocations:[{invoiceId:draft.id,amount:"40.0000"}]});
 assert.equal(one.status,"PENDING");
 assert.equal((await billing.detail(admin,draft.id)).paidTotal.toFixed(4),"0.0000");
 assert.equal((await finance.totals(admin,"all")).postedIncome,"0.0000");
 await assert.rejects(()=>billing.record(admin,{clientId:client.id,categoryId:income.id,amount:"40.0000",
  receivedOn:"2026-10-20",method:"UPI",reference:"receipt-"+randomUUID(),
  idempotencyKey:serialKey,allocations:[{invoiceId:draft.id,amount:"40.0000"}]}),fail(409));
 await assert.rejects(()=>billing.verify(admin,one.id,1),fail(403));
 await assert.rejects(()=>billing.verify(noApproval,one.id,1),fail(403));
 const verified=await billing.verify(verifier,one.id,1);
 assert.equal(verified.status,"VERIFIED");
 assert.ok(verified.ledgerEntryId);
 assert.equal((await billing.detail(admin,draft.id)).settlement,"PARTIALLY_PAID");
 assert.equal((await finance.totals(admin,"all")).postedIncome,"40.0000");
 await assert.rejects(()=>billing.verify(verifier,one.id,1),fail(409));
 const two=await billing.record(admin,{clientId:client.id,categoryId:income.id,amount:"160.0000",
  receivedOn:"2026-10-20",method:"BANK_TRANSFER",reference:"receipt-"+randomUUID(),
  idempotencyKey:randomUUID(),allocations:[
   {invoiceId:draft.id,amount:"60.0000"},{invoiceId:second.id,amount:"100.0000"}]});
 const ended=await billing.verify(verifier,two.id,1);
 assert.equal(ended.status,"VERIFIED");
 assert.equal((await billing.detail(admin,draft.id)).settlement,"PAID");
 assert.equal((await billing.detail(admin,second.id)).settlement,"PAID");
 assert.equal((await finance.totals(admin,"all")).postedIncome,"200.0000");
 assert.equal((await billing.receivables(admin)).receivable,"0.0000");
 assert.equal(await db.financialTransaction.count({where:{organizationId:a.id,kind:"INCOME",status:"POSTED"}}),2);
 await assert.rejects(()=>billing.void(admin,draft.id,4),fail(422));
 const third=await billing.create(admin,draftInput),issuedThird=await billing.issue(admin,third.id,1);
 const declined=await billing.record(admin,{clientId:client.id,categoryId:income.id,amount:"20",
  receivedOn:"2026-10-20",method:"CARD",reference:"receipt-"+randomUUID(),
  idempotencyKey:randomUUID(),allocations:[{invoiceId:third.id,amount:"20"}]});
 await billing.reject(verifier,declined.id,1);
 assert.equal((await billing.detail(admin,third.id)).paidTotal.toFixed(4),"0.0000");
 assert.equal((await finance.totals(admin,"all")).postedIncome,"200.0000");
 await billing.void(admin,third.id,issuedThird.version);
 assert.equal((await billing.detail(admin,third.id)).status,"VOID");
 const overdue=await billing.create(admin,{...draftInput,dueOn:"2026-10-01"});
 await billing.issue(admin,overdue.id,1);
 assert.equal((await billing.detail(admin,overdue.id)).settlement,"OVERDUE");
 const sched=await billing.createSchedule(admin,{...draftInput,frequency:"MONTHLY",
  startAt:new Date(Date.now()-120000).toISOString(),dueAfterDays:10});
 assert.equal(sched.enabled,true);
 assert.equal((await sweepBillingSchedules(db,new Date(),100)).created,1);
 assert.equal((await sweepBillingSchedules(db,new Date(),100)).created,0);
 assert.equal(await db.invoice.count({where:{scheduleId:sched.id}}),1);
 const generated=await db.invoice.findFirstOrThrow({where:{scheduleId:sched.id}});
 assert.equal(generated.status,"DRAFT");assert.equal(generated.number,null);
 const paused=await billing.toggleSchedule(admin,sched.id,2,false);
 assert.equal(paused.enabled,false);
 assert.equal((await sweepBillingSchedules(db,new Date(Date.now()+40*86400000),100)).created,0);
 assert.equal(await db.payment.count({where:{organizationId:a.id,status:"VERIFIED"}}),2);
 assert.ok((await db.outboxEvent.count({where:{organizationId:a.id,kind:"payments.verified"}}))===2);
 assert.ok((await db.auditLog.count({where:{organizationId:a.id,entityType:"Invoice"}}))>=5);

 const founderOrg=await db.organization.create({data:{name:"Founder Billing CI"}});
 const founderUser=await db.user.create({data:{
  organizationId:founderOrg.id,loginId:"billing-founder",displayName:"Founder",status:"ACTIVE",
 }});
 const founder=principal(founderUser.id,founderOrg.id,all,["FOUNDER"]);
 const fClient=await db.client.create({data:{
  organizationId:founderOrg.id,createdById:founderUser.id,businessName:"Founder client",
 }});
 const fCategory=await db.financialCategory.create({data:{
  organizationId:founderOrg.id,kind:"INCOME",name:"Founder settlement",normalizedName:"founder settlement",
 }});
 const fDraft=await billing.create(founder,{...draftInput,clientId:fClient.id});
 await billing.issue(founder,fDraft.id,fDraft.version);
 const founderPaymentKey=randomUUID();
 const fPayment=await billing.record(founder,{
  clientId:fClient.id,categoryId:fCategory.id,amount:"30.0000",
  receivedOn:"2026-10-20",method:"UPI",reference:"founder-"+randomUUID(),
  idempotencyKey:founderPaymentKey,allocations:[{invoiceId:fDraft.id,amount:"30.0000"}],
 });
 assert.equal(fPayment.status,"VERIFIED");assert.ok(fPayment.ledgerEntryId);
 assert.equal((await billing.detail(founder,fDraft.id)).paidTotal.toFixed(4),"30.0000");
 assert.equal((await finance.totals(founder,"all")).postedIncome,"30.0000");
 const fLedger=await db.financialTransaction.findUniqueOrThrow({where:{id:fPayment.ledgerEntryId!}});
 assert.equal(fLedger.status,"POSTED");
 assert.equal((await db.approvalRequest.findUniqueOrThrow({where:{id:fLedger.approvalRequestId}})).status,"APPROVED");
 assert.equal((await db.approvalPolicy.findUniqueOrThrow({where:{
  organizationId_category:{organizationId:founderOrg.id,category:"FINANCE"},
 }})).active,false);
 await assert.rejects(()=>billing.record(founder,{
  clientId:fClient.id,categoryId:fCategory.id,amount:"30.0000",
  receivedOn:"2026-10-20",method:"UPI",reference:"founder-"+randomUUID(),
  idempotencyKey:founderPaymentKey,allocations:[{invoiceId:fDraft.id,amount:"30.0000"}],
 }),fail(409));
 console.info("Module 13 PASS: invoice numbering, PDF, locked issue, cross-org, partial allocations, ledger once, self-verification, idempotency, void, overdue and recurring drafts");
}finally{await db.$disconnect();}
