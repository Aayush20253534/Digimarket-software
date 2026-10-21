import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { FinanceService } from "./service";
import { ApprovalService } from "../approvals/service";
import { financeEntryInputSchema } from "@digimarket/contracts";
import { randomUUID } from "node:crypto";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci")) {
  throw new Error("Finance integration is permitted only on isolated digimarket_ci");
}
const db=createDatabaseClient();
const finance=new FinanceService(db), approvals=new ApprovalService(db);
const principal=(userId:string,organizationId:string,roles:string[],keys:string[]):Principal=>({
  userId,organizationId,sessionId:"finance-ci",roles,permissions:new Set(keys),
});
const adminKeys=["finance.entry.create","finance.entry.read.own","finance.read.all","finance.category.manage","finance.approve",
  "approvals.read","approvals.submit","approvals.decide","approvals.policy.manage"];
const staffKeys=["finance.entry.create","finance.entry.read.own","approvals.read","approvals.submit"];
try{
  const org=await db.organization.create({data:{name:"Finance Org"}});
  const other=await db.organization.create({data:{name:"Other Finance Org"}});
  const employee=await db.user.create({data:{organizationId:org.id,loginId:"fin-employee",displayName:"Employee",status:"ACTIVE"}});
  const admin=await db.user.create({data:{organizationId:org.id,loginId:"fin-admin",displayName:"Manager",status:"ACTIVE"}});
  const outsider=await db.user.create({data:{organizationId:other.id,loginId:"fin-outsider",displayName:"Outsider",status:"ACTIVE"}});
  const staff=principal(employee.id,org.id,["EMPLOYEE"],staffKeys);
  const manager=principal(admin.id,org.id,["ADMIN"],adminKeys);
  const stranger=principal(outsider.id,other.id,["ADMIN"],adminKeys);
  await assert.rejects(()=>finance.submit(staff,{
    kind:"EXPENSE",categoryId:randomUUID(),amount:"20.00",occurredOn:"2026-10-19",
    method:"UPI",idempotencyKey:randomUUID(),
  }),(error:{status?:number})=>error.status===422);
  const exp=await finance.addCategory(manager,{kind:"EXPENSE",name:"Rapido"});
  const inc=await finance.addCategory(manager,{kind:"INCOME",name:"Agency retainer"});
  assert.equal((await finance.categories(staff)).length,2);
  await assert.rejects(()=>finance.addCategory(manager,{kind:"EXPENSE",name:"  RAPIDO  "}),
    (error:{status?:number})=>error.status===409);
  await assert.rejects(()=>finance.addCategory(staff,{kind:"EXPENSE",name:"Outside"}),
    (error:{status?:number})=>error.status===403);
  await approvals.policy(manager,"FINANCE",{name:"Finance approvals",active:true,approverRoleKeys:["ADMIN"]});
  const input={kind:"EXPENSE" as const,categoryId:exp.id,amount:"150.2545",occurredOn:"2026-10-19",
    method:"UPI" as const,merchantOrSource:"Rapido",idempotencyKey:randomUUID()};
  assert.equal(financeEntryInputSchema.safeParse({...input,amount:"1e4"}).success,false);
  assert.equal(financeEntryInputSchema.safeParse({...input,amount:"-1"}).success,false);
  assert.equal(financeEntryInputSchema.safeParse({...input,amount:"0.00001"}).success,false);
  const pending=await finance.submit(staff,input);
  assert.equal(pending.status,"PENDING");
  assert.equal(pending.amount,"150.2545");
  await assert.rejects(()=>finance.submit(staff,input),(error:{status?:number})=>error.status===409);
  await assert.rejects(()=>finance.submit(staff,{...input,idempotencyKey:randomUUID(),categoryId:randomUUID()}),
    (error:{status?:number})=>error.status===422);
  assert.equal((await finance.entries(staff,"mine")).length,1);
  assert.equal((await finance.entries(manager,"mine")).length,0);
  assert.equal((await finance.entries(manager,"all")).length,1);
  await assert.rejects(()=>finance.entries(staff,"all"),(error:{status?:number})=>error.status===403);
  assert.equal((await finance.entries(stranger,"all")).length,0);
  assert.equal((await finance.totals(manager,"all")).postedNet,"0.0000");
  assert.equal((await finance.totals(manager,"all")).pendingExpense,"150.2545");
  await assert.rejects(()=>approvals.decide(staff,pending.approvalRequestId,{outcome:"APPROVED"}),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>approvals.decide(stranger,pending.approvalRequestId,{outcome:"APPROVED"}),
    (error:{status?:number})=>error.status===404);
  const noFinanceGrant=principal(admin.id,org.id,["ADMIN"],adminKeys.filter(k=>k!=="finance.approve"));
  await assert.rejects(()=>approvals.decide(noFinanceGrant,pending.approvalRequestId,{outcome:"APPROVED"}),
    (error:{status?:number})=>error.status===403);
  const races=await Promise.allSettled([
    approvals.decide(manager,pending.approvalRequestId,{outcome:"APPROVED"}),
    approvals.decide(manager,pending.approvalRequestId,{outcome:"APPROVED"}),
  ]);
  assert.equal(races.filter(x=>x.status==="fulfilled").length,1);
  const after=await finance.entries(manager,"all");
  assert.equal(after[0].status,"POSTED");
  assert.equal((await db.approvalDecision.count({where:{requestId:pending.approvalRequestId}})),1);
  assert.equal((await finance.totals(manager,"all")).postedExpense,"150.2545");
  const income=await finance.submit(staff,{kind:"INCOME",categoryId:inc.id,amount:"1000.0000",occurredOn:"2026-10-19",
    method:"BANK_TRANSFER",merchantOrSource:"Client payment",idempotencyKey:randomUUID()});
  await approvals.decide(manager,income.approvalRequestId,{outcome:"APPROVED"});
  const postedIncome=(await finance.totals(manager,"all")).postedIncome;
  assert.equal(postedIncome,"1000.0000");
  const rejected=await finance.submit(staff,{...input,idempotencyKey:randomUUID(),amount:"23.50"});
  await approvals.decide(manager,rejected.approvalRequestId,{outcome:"REJECTED",reason:"Missing receipt"});
  const cancelled=await finance.submit(staff,{...input,idempotencyKey:randomUUID(),amount:"11"});
  await approvals.cancel(staff,cancelled.approvalRequestId);
  const last=await finance.totals(manager,"all");
  assert.equal(last.pendingExpense,"0.0000");
  assert.equal(last.postedIncome,"1000.0000");
  assert.equal(last.postedExpense,"150.2545");
  assert.equal(last.postedNet,"849.7455");
  await finance.setCategoryActive(manager,exp.id,false);
  await assert.rejects(()=>finance.submit(staff,{...input,idempotencyKey:randomUUID()}),
    (error:{status?:number})=>error.status===422);
  assert.equal((await finance.entries(staff,"mine")).length,4);
  const csv=(await finance.exportCsv(manager,"all")).csv;
  assert.ok(csv.includes('"150.2545"'));
  assert.ok(csv.includes('"1000.0000"'));
  assert.equal((await finance.exportCsv(stranger,"all")).csv.split("\r\n").length,2);
  assert.ok((await db.auditLog.count({where:{organizationId:org.id,entityType:"FinancialTransaction"}}))>=4);
  // Admin-only finance lifecycle must never be available to employees or a foreign organization.
  await assert.rejects(()=>finance.renameCategory(staff,exp.id,"Renamed"),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>finance.removeCategory(staff,exp.id),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>finance.removeExpense(staff,pending.id),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>finance.removeExpense(stranger,pending.id),
    (error:{status?:number})=>error.status===404);
  const renamed=await finance.renameCategory(manager,exp.id,"Agency Transport");
  assert.equal(renamed.name,"Agency Transport");
  const unused=await finance.addCategory(manager,{kind:"EXPENSE",name:"Disposable Expense"});
  assert.equal((await finance.removeCategory(manager,unused.id)).archived,false);
  assert.equal((await db.financialCategory.findUnique({where:{id:unused.id}})),null);
  assert.equal((await finance.removeCategory(manager,exp.id)).archived,true);
  assert.equal((await db.financialCategory.findUniqueOrThrow({where:{id:exp.id}})).active,false);
  const editCategory=await finance.addCategory(manager,{kind:"EXPENSE",name:"New Expense Category"});
  // Only finance administrators may enumerate active colleagues or transfer an expense.
  assert.ok((await finance.assignees(manager)).some(x=>x.id===employee.id));
  assert.equal((await finance.assignees(manager)).some(x=>x.id===outsider.id),false);
  await assert.rejects(()=>finance.assignees(staff),(error:{status?:number})=>error.status===403);
  const disabled=await db.user.create({data:{organizationId:org.id,loginId:"fin-disabled",
    displayName:"Disabled member",status:"DISABLED"}});
  assert.equal((await finance.assignees(manager)).some(x=>x.id===disabled.id),false);
  const originalSubmittedBy=(await db.approvalRequest.findUniqueOrThrow({
    where:{id:pending.approvalRequestId},select:{requesterId:true}})).requesterId;
  const ownerEdit={categoryId:exp.id,amount:"150.2545",occurredOn:"2026-10-19",
    method:"UPI" as const,merchantOrSource:"Rapido",description:"Owner reassignment"};
  await assert.rejects(()=>finance.editExpense(manager,pending.id,{...ownerEdit,enteredById:outsider.id}),
    (error:{status?:number})=>error.status===422);
  await assert.rejects(()=>finance.editExpense(manager,pending.id,{...ownerEdit,enteredById:disabled.id}),
    (error:{status?:number})=>error.status===422);
  assert.equal((await finance.editExpense(manager,pending.id,{...ownerEdit,enteredById:admin.id})).enteredById,admin.id);
  assert.ok((await finance.entries(manager,"mine")).some(x=>x.id===pending.id));
  assert.equal((await finance.entries(staff,"mine")).some(x=>x.id===pending.id),false);
  const moved=(await finance.entries(manager,"mine")).find(x=>x.id===pending.id);
  assert.equal(moved?.submittedBy.displayName,employee.displayName);
  assert.equal((await db.approvalRequest.findUniqueOrThrow({
    where:{id:pending.approvalRequestId},select:{requesterId:true}})).requesterId,originalSubmittedBy);
  assert.equal((await finance.totals(manager,"all")).postedExpense,"150.2545");
  assert.equal((await finance.editExpense(manager,pending.id,{...ownerEdit,enteredById:employee.id})).enteredById,employee.id);
  assert.ok((await finance.entries(staff,"mine")).some(x=>x.id===pending.id));
  assert.ok((await db.auditLog.count({
    where:{organizationId:org.id,action:"finance.expense_edited",entityId:pending.id}
  }))>=2);
  await assert.rejects(()=>finance.editExpense(staff,pending.id,{
    categoryId:editCategory.id,amount:"199.50",occurredOn:"2026-10-18",
    method:"CARD",merchantOrSource:"Updated",description:"Admin correction",
  }), (error:{status?:number})=>error.status===403);
  const updated=await finance.editExpense(manager,pending.id,{
    categoryId:editCategory.id,amount:"199.50",occurredOn:"2026-10-18",
    method:"CARD",merchantOrSource:"Updated",description:"Admin correction",
  });
  assert.equal(updated.amount,"199.5000");
  assert.equal((await finance.totals(manager,"all")).postedExpense,"199.5000");
  assert.equal((await finance.removeExpense(manager,pending.id)).status,"CANCELLED");
  assert.equal((await finance.totals(manager,"all")).postedExpense,"0.0000");
  await assert.rejects(()=>finance.removeExpense(manager,pending.id),
    (error:{status?:number})=>error.status===409);
  assert.ok((await db.auditLog.count({where:{organizationId:org.id,action:"finance.expense_cancelled"}}))===1);
  console.info("Module 6 PASS: admin category rename/unused delete/referenced archive, other-user expense edits/cancellation, audit and tenant isolation.");
}finally{await db.$disconnect();}
