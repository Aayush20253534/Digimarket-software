import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {BillingService} from "../billing/service";
import {ProfitabilityService} from "./service";
import {costAllocationUpdateSchema,revenueRecognitionCreateSchema} from "@digimarket/contracts";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Module 14 runs only against disposable digimarket_ci PostgreSQL");
const db=createDatabaseClient(),service=new ProfitabilityService(db),billing=new BillingService(db);
const rights=["profitability.read","profitability.manage","finance.read.all","clients.read","invoices.read",
 "invoices.draft","invoices.issue","finance.approve","payments.read","payments.record","payments.verify"];
const principal=(userId:string,organizationId:string,permissions=rights):Principal=>({
 userId,organizationId,sessionId:"module14-ci",roles:["ADMIN"],permissions:new Set(permissions)});
const fail=(code:number)=>(e:{status?:number})=>e.status===code;
const when=new Date().toISOString().slice(0,10);
try{
 const org=await db.organization.create({data:{name:"Profit Org"}});
 const otherOrg=await db.organization.create({data:{name:"Other Profit Org"}});
 const [manager,reviewer,staff,foreign]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"profit-manager",displayName:"Manager",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"profit-reviewer",displayName:"Reviewer",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"profit-staff",displayName:"Employee",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:otherOrg.id,loginId:"profit-other",displayName:"Outside",status:"ACTIVE"}}),
 ]);
 const admin=principal(manager.id,org.id),checker=principal(reviewer.id,org.id),
  worker=principal(staff.id,org.id,["clients.read","finance.entry.create"]),
  external=principal(foreign.id,otherOrg.id);
 const [first,second,outside]=await Promise.all([
  db.client.create({data:{organizationId:org.id,createdById:manager.id,businessName:"Cafe Alpha"}}),
  db.client.create({data:{organizationId:org.id,createdById:manager.id,businessName:"Shop Beta"}}),
  db.client.create({data:{organizationId:otherOrg.id,createdById:foreign.id,businessName:"Another Org"}}),
 ]);
 const project=await db.project.create({data:{organizationId:org.id,clientId:first.id,
  createdById:manager.id,name:"Marketing Retainer"}});
 const policy=await db.approvalPolicy.create({data:{organizationId:org.id,name:"Finance approvals",
  category:"FINANCE",active:true,approverRoleKeys:["ADMIN"]}});
 const costCategory=await db.financialCategory.create({data:{organizationId:org.id,
  kind:"EXPENSE",name:"Production costs",normalizedName:"production costs"}});
 const incomeCategory=await db.financialCategory.create({data:{organizationId:org.id,
  kind:"INCOME",name:"Client payments",normalizedName:"client payments"}});
 const approval=await db.approvalRequest.create({data:{organizationId:org.id,policyId:policy.id,
  requesterId:staff.id,title:"Approved production expense",
  description:"Video shoot",referenceType:"FINANCE_ENTRY",status:"APPROVED",decidedAt:new Date(),
  approverRoleKeys:["ADMIN"]}});
 const exp=await db.financialTransaction.create({data:{
  organizationId:org.id,enteredById:staff.id,categoryId:costCategory.id,
  approvalRequestId:approval.id,idempotencyKey:randomUUID(),kind:"EXPENSE",amount:"100.0000",
  currencyCode:"INR",occurredOn:new Date(when+"T00:00:00Z"),method:"UPI",
  status:"POSTED",postedAt:new Date()}});
 await db.approvalRequest.update({where:{id:approval.id},data:{referenceId:exp.id}});
 assert.equal(costAllocationUpdateSchema.safeParse({
  version:0,allocations:[{clientId:first.id,amount:"10.12345"}]}).success,false);
 await assert.rejects(()=>service.report(worker,{from:when,to:when}),fail(403));
 await assert.rejects(()=>service.setExpenseAllocations(external,exp.id,{
  version:0,allocations:[{clientId:outside.id,amount:"5"}]}),fail(404));
 await assert.rejects(()=>service.setExpenseAllocations(admin,exp.id,{
  version:0,allocations:[{clientId:first.id,amount:"110"}]}),fail(422));
 await assert.rejects(()=>service.setExpenseAllocations(admin,exp.id,{
  version:0,allocations:[{clientId:outside.id,amount:"30"}]}),fail(404));
 await assert.rejects(()=>service.setExpenseAllocations(admin,exp.id,{
  version:0,allocations:[{clientId:second.id,projectId:project.id,amount:"10"}]}),fail(422));
 const allocation=await service.setExpenseAllocations(admin,exp.id,{
  version:0,allocations:[{clientId:first.id,projectId:project.id,amount:"30.0000"},
   {clientId:second.id,amount:"20.0000"}]});
 assert.equal(allocation.unallocated,"50.0000");
 await assert.rejects(()=>service.setExpenseAllocations(admin,exp.id,{
  version:0,allocations:[{clientId:first.id,amount:"30"}]}),fail(409));
 const expRows=await service.expenses(admin,when,when);
 assert.equal(expRows[0].costAllocationVersion,1);
 assert.equal(expRows[0].costAllocations.length,2);
 const draft=await billing.create(admin,{clientId:first.id,sellerName:"Studio Agency",
  sellerAddress:"Prayagraj",buyerName:first.businessName,dueOn:when,
  lines:[{description:"Monthly marketing",quantity:"1",unitPrice:"150.0000",taxRate:"10"}]});
 const issued=await billing.issue(admin,draft.id,1);
 assert.equal(issued.subtotal.toFixed(4),"150.0000");
 assert.equal(issued.total.toFixed(4),"165.0000");
 const initial=await service.report(admin,{from:when,to:when});
 assert.equal(initial.clients.find(c=>c.clientId===first.id)?.billedNet,"150.0000");
 assert.equal(initial.clients.find(c=>c.clientId===first.id)?.billedTax,"15.0000");
 assert.equal(initial.totals.unallocatedExpense,"50.0000");
 assert.equal(initial.totals.recognizedRevenue,"0.0000");
 assert.equal(initial.clients.find(c=>c.clientId===first.id)?.marginPercent,null);
 const recorded=await billing.record(admin,{clientId:first.id,categoryId:incomeCategory.id,
  amount:"40.0000",receivedOn:when,method:"UPI",reference:"profit-"+randomUUID(),
  idempotencyKey:randomUUID(),allocations:[{invoiceId:draft.id,amount:"40.0000"}]});
 await billing.verify(checker,recorded.id,1);
 const noRecognition=await service.report(admin,{from:when,to:when});
 assert.equal(noRecognition.clients.find(c=>c.clientId===first.id)?.collectedCash,"40.0000");
 assert.equal(noRecognition.totals.recognizedRevenue,"0.0000");
 assert.equal(revenueRecognitionCreateSchema.safeParse({invoiceId:draft.id,
  recognizedOn:when,amount:"1e3",note:"Milestone complete",idempotencyKey:randomUUID()}).success,false);
 await assert.rejects(()=>service.recognize(worker,{invoiceId:draft.id,recognizedOn:when,
  amount:"20",note:"Invalid permission",idempotencyKey:randomUUID()}),fail(403));
 const recKey=randomUUID();
 const rec=await service.recognize(admin,{invoiceId:draft.id,recognizedOn:when,
  amount:"120.0000",note:"Delivered monthly campaign",idempotencyKey:recKey});
 assert.equal(rec.amount.toFixed(4),"120.0000");
 await assert.rejects(()=>service.recognize(admin,{invoiceId:draft.id,recognizedOn:when,
  amount:"5",note:"Duplicate key",idempotencyKey:recKey}),fail(409));
 await assert.rejects(()=>service.recognize(admin,{invoiceId:draft.id,recognizedOn:when,
  amount:"40",note:"Above subtotal",idempotencyKey:randomUUID()}),fail(422));
 await assert.rejects(()=>billing.void(admin,draft.id,issued.version+2),fail(422));
 const report=await service.report(admin,{from:when,to:when});
 const alpha=report.clients.find(c=>c.clientId===first.id)!;
 assert.equal(alpha.recognizedRevenue,"120.0000");
 assert.equal(alpha.collectedCash,"40.0000");
 assert.equal(alpha.directCosts,"30.0000");
 assert.equal(alpha.contribution,"90.0000");
 assert.equal(alpha.marginPercent,"75.00");
 assert.equal(report.totals.directCosts,"50.0000");
 assert.equal(report.totals.unallocatedExpense,"50.0000");
 assert.equal((await service.report(external,{from:when,to:when})).totals.billedGross,"0.0000");
 await assert.rejects(()=>service.report(external,{from:when,to:when,clientId:first.id}),fail(404));
 const csv=await service.csv(admin,{from:when,to:when});
 assert.ok(csv.csv.includes("Cafe Alpha"));assert.ok(csv.csv.includes("90.0000"));
 const reverse=await service.reverse(admin,rec.id,{recognizedOn:when,
  note:"Correction to recorded delivery",idempotencyKey:randomUUID()});
 assert.equal(reverse.amount.toFixed(4),"-120.0000");
 await assert.rejects(()=>service.reverse(admin,rec.id,{recognizedOn:when,
  note:"Double correction",idempotencyKey:randomUUID()}),fail(409));
 assert.equal((await service.report(admin,{from:when,to:when})).totals.recognizedRevenue,"0.0000");
 assert.equal((await service.report(admin,{from:when,to:when})).totals.collectedCash,"40.0000");
 await service.setExpenseAllocations(admin,exp.id,{version:1,allocations:[]});
 assert.equal((await service.report(admin,{from:when,to:when})).totals.unallocatedExpense,"100.0000");
 assert.equal(await db.costAllocation.count({where:{expenseId:exp.id}}),0);
 const races=await Promise.allSettled([
   service.setExpenseAllocations(admin,exp.id,{version:2,allocations:[
     {clientId:first.id,amount:"35"}]}),
   service.setExpenseAllocations(admin,exp.id,{version:2,allocations:[
     {clientId:second.id,amount:"45"}]}),
 ]);
 assert.equal(races.filter(x=>x.status==="fulfilled").length,1);
 assert.equal(await db.costAllocation.count({where:{expenseId:exp.id}}),1);
 assert.equal((await db.financialTransaction.findUniqueOrThrow({where:{id:exp.id}})).costAllocationVersion,3);
 assert.equal(await db.revenueRecognition.count({where:{invoiceId:draft.id}}),2);
 assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"RevenueRecognition"}}))>=2);
 console.info("Module 14 PASS: scoped profit, billed/cash/recognition separation, tax, reallocation caps and CAS, reversals, cross-org isolation, audit and CSV");
}finally{await db.$disconnect();}
