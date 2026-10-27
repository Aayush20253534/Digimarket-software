import "dotenv/config";
import assert from "node:assert/strict";
import { createDatabaseClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { FinanceService } from "./service";
import { ApprovalService } from "../approvals/service";
import { financeEntryInputSchema,financeBreakdownQuerySchema } from "@digimarket/contracts";
import {InsightsService} from "../insights/insights";
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

  // The breakdown must use the exact posted/occurredOn scope of Reports.
  // Pending transactions and other organizations cannot leak into totals.
  const reportingAdmin=principal(admin.id,org.id,["ADMIN"],[...adminKeys,"reports.business.read"]);
  const reportingOutsider=principal(outsider.id,other.id,["ADMIN"],[...adminKeys,"reports.business.read"]);
  const period={from:"2026-10-01",to:"2026-10-31",q:"",page:1,limit:20};
  assert.equal(financeBreakdownQuerySchema.safeParse({...period,kind:"EXPENSE"}).success,true);
  assert.equal(financeBreakdownQuerySchema.safeParse({...period,kind:"EXPENSE",from:"2026-11-01"}).success,false);
  await assert.rejects(()=>finance.breakdown(manager,{...period,kind:"EXPENSE"}),
    (error:{status?:number})=>error.status===403);
  const reportOnly=principal(admin.id,org.id,["ADMIN"],["reports.business.read"]);
  await assert.rejects(()=>finance.breakdown(reportOnly,{...period,kind:"EXPENSE"}),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>finance.exportBreakdown(staff,{...period,kind:"EXPENSE"}),
    (error:{status?:number})=>error.status===403);
  const expenseDetails=await finance.breakdown(reportingAdmin,{...period,kind:"EXPENSE"});
  assert.equal(expenseDetails.total,"150.2545");
  assert.equal(expenseDetails.transactionCount,1);
  assert.equal(expenseDetails.categories.length,1);
  assert.equal(expenseDetails.categories[0].name,"Rapido");
  assert.equal(expenseDetails.categories[0].total,expenseDetails.total);
  assert.deepEqual(expenseDetails.monthly.map(x=>x.month),["2026-10"]);
  assert.equal(expenseDetails.monthly[0].total,expenseDetails.total);
  assert.deepEqual(expenseDetails.daily,[{date:"2026-10-19",total:"150.2545",count:1}]);
  assert.equal(expenseDetails.people.length,1);
  assert.equal(expenseDetails.people[0].id,employee.id);
  assert.equal(expenseDetails.people[0].total,expenseDetails.total);
  assert.equal(expenseDetails.transactions.length,1);
  assert.equal(expenseDetails.transactions[0].amount,"150.2545");
  assert.equal(expenseDetails.transactions[0].method,"UPI");
  const incomeDetails=await finance.breakdown(reportingAdmin,{...period,kind:"INCOME"});
  assert.equal(incomeDetails.total,"1000.0000");
  assert.equal(incomeDetails.categories[0].name,"Agency retainer");
  assert.equal(incomeDetails.transactions[0].merchantOrSource,"Client payment");
  assert.equal((await finance.breakdown(reportingOutsider,{...period,kind:"INCOME"})).total,"0.0000");
  const reports=await new InsightsService(db).report(reportingAdmin,period.from,period.to);
  const reportLedger=(reports.sections.cashLedger as {posted:{kind:string;amount:string}[]}).posted;
  for(const [kind,total] of [["INCOME",incomeDetails.total],["EXPENSE",expenseDetails.total]]){
    // Reports displays 2 decimal places; the underlying finance ledger
    // retains 4. Match presentation precision without losing stored cents.
    assert.equal(reportLedger.find(x=>x.kind===kind)?.amount,Number(total).toFixed(2));
  }
  const searched=await finance.breakdown(reportingAdmin,{...period,kind:"EXPENSE",q:"Rapido"});
  assert.equal(searched.total,expenseDetails.total);
  assert.equal(searched.matchingCount,1);
  assert.equal(searched.matchingTotal,expenseDetails.total);
  assert.equal(searched.transactions.length,1);
  const unmatched=await finance.breakdown(reportingAdmin,{...period,kind:"EXPENSE",q:"nonexistent category"});
  assert.equal(unmatched.total,expenseDetails.total);
  assert.equal(unmatched.matchingCount,0);
  assert.deepEqual(unmatched.transactions,[]);
  assert.equal((await finance.breakdown(reportingAdmin,{...period,kind:"EXPENSE",page:2,limit:1})).transactions.length,0);
  assert.equal((await finance.breakdown(reportingAdmin,{...period,kind:"EXPENSE",
    from:"2026-09-01",to:"2026-09-30"})).total,"0.0000");
  const exportExpense=await finance.exportBreakdown(reportingAdmin,{...period,kind:"EXPENSE",q:"Rapido"});
  assert.equal(exportExpense.count,1);
  assert.ok(exportExpense.csv.includes('"150.2545"'));
  assert.ok(exportExpense.csv.includes('"Rapido"'));
  assert.ok(exportExpense.filename.includes("expense"));
  assert.equal((await finance.exportBreakdown(reportingAdmin,{...period,kind:"EXPENSE",q:"nonexistent category"})).count,0);
  // Admin can correct income submitted by another user. Never alter the original
  // approval requester, and never permit wrong-category or cross-org reassignment.
  const incomeEdit={categoryId:inc.id,amount:"1234.50",occurredOn:"2026-10-18",
    method:"CARD" as const,merchantOrSource:"Corrected client payment",description:"Income correction"};
  await assert.rejects(()=>finance.editEntry(staff,income.id,incomeEdit),
    (error:{status?:number})=>error.status===403);
  await assert.rejects(()=>finance.editEntry(stranger,income.id,incomeEdit),
    (error:{status?:number})=>error.status===404);
  await assert.rejects(()=>finance.editEntry(manager,income.id,{...incomeEdit,categoryId:exp.id}),
    (error:{status?:number})=>error.status===422);
  await assert.rejects(()=>finance.editEntry(manager,income.id,{...incomeEdit,enteredById:outsider.id}),
    (error:{status?:number})=>error.status===422);
  const adjustedIncome=await finance.editEntry(manager,income.id,{...incomeEdit,enteredById:admin.id});
  assert.equal(adjustedIncome.amount,"1234.5000");
  assert.equal(adjustedIncome.enteredById,admin.id);
  assert.equal((await finance.totals(manager,"all")).postedIncome,"1234.5000");
  const reassignedIncome=(await finance.entries(manager,"mine")).find(row=>row.id===income.id);
  assert.equal(reassignedIncome?.submittedBy.displayName,employee.displayName);
  assert.equal((await db.approvalRequest.findUniqueOrThrow({where:{id:income.approvalRequestId}})).requesterId,employee.id);
  assert.equal((await db.auditLog.count({where:{entityId:income.id,action:"finance.income_edited"}})),1);
  await finance.editEntry(manager,income.id,{
    ...incomeEdit,amount:"1000.0000",occurredOn:"2026-10-19",
    merchantOrSource:"Client payment",enteredById:employee.id,
  });
  assert.equal((await finance.totals(manager,"all")).postedIncome,"1000.0000");
  assert.ok((await finance.entries(staff,"mine")).some(row=>row.id===income.id));

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
  // Verify admin-only income cancellation without destroying its approval history.
  await assert.rejects(()=>finance.removeEntry(staff,income.id),(e:{status?:number})=>e.status===403);
  await assert.rejects(()=>finance.removeEntry(stranger,income.id),(e:{status?:number})=>e.status===404);
  const cancelledIncome=await finance.removeEntry(manager,income.id);
  assert.equal(cancelledIncome.kind,"INCOME");
  assert.equal(cancelledIncome.status,"CANCELLED");
  assert.equal((await finance.totals(manager,"all")).postedIncome,"0.0000");
  assert.equal((await finance.entries(manager,"all")).find(x=>x.id===income.id)?.status,"CANCELLED");
  assert.equal((await db.approvalDecision.count({where:{requestId:income.approvalRequestId}})),1);
  assert.equal((await db.auditLog.count({where:{organizationId:org.id,action:"finance.income_cancelled",entityId:income.id}})),1);
  await assert.rejects(()=>finance.removeEntry(manager,income.id),(e:{status?:number})=>e.status===409);
  await assert.rejects(()=>finance.editEntry(manager,income.id,incomeEdit),(e:{status?:number})=>e.status===409);
  
  // A founder can post direct finance entries without any FINANCE approval policy.
  const directOrg=await db.organization.create({data:{name:"Founder Finance CI"}});
  const founderUser=await db.user.create({data:{
    organizationId:directOrg.id,loginId:"founder-finance",displayName:"Founder",status:"ACTIVE",
  }});
  const newStaff=await db.user.create({data:{
    organizationId:directOrg.id,loginId:"finance-new-staff",displayName:"Staff",status:"ACTIVE",
  }});
  const founder=principal(founderUser.id,directOrg.id,["FOUNDER"],[
    "finance.entry.create","finance.entry.read.own","finance.read.all",
  ]);
  const regular=principal(newStaff.id,directOrg.id,["EMPLOYEE"],staffKeys);
  const fExpense=await db.financialCategory.create({data:{
    organizationId:directOrg.id,kind:"EXPENSE",name:"Founder expense",normalizedName:"founder expense",
  }});
  const fIncome=await db.financialCategory.create({data:{
    organizationId:directOrg.id,kind:"INCOME",name:"Founder income",normalizedName:"founder income",
  }});
  const directInput={kind:"EXPENSE" as const,categoryId:fExpense.id,amount:"21.0000",
    occurredOn:"2026-10-19",method:"CASH" as const,idempotencyKey:randomUUID()};
  const postedExpense=await finance.submit(founder,directInput);
  assert.equal(postedExpense.status,"POSTED");assert.ok(postedExpense.postedAt);
  const founderPostedIncome=await finance.submit(founder,{...directInput,kind:"INCOME",categoryId:fIncome.id,
    amount:"71.0000",idempotencyKey:randomUUID()});
  assert.equal(founderPostedIncome.status,"POSTED");
  assert.equal((await finance.totals(founder,"mine")).postedNet,"50.0000");
  const approval=await db.approvalRequest.findUniqueOrThrow({where:{id:postedExpense.approvalRequestId}});
  assert.equal(approval.status,"APPROVED");
  assert.equal((await db.approvalDecision.findUniqueOrThrow({where:{requestId:approval.id}})).outcome,"APPROVED");
  assert.equal((await db.approvalPolicy.findUniqueOrThrow({where:{organizationId_category:{
    organizationId:directOrg.id,category:"FINANCE",
  }}})).active,false);
  await assert.rejects(()=>finance.submit(regular,{
    ...directInput,idempotencyKey:randomUUID(),
  }),(e:{status?:number})=>e.status===422);
  await assert.rejects(()=>finance.submit(founder,directInput),(e:{status?:number})=>e.status===409);
  assert.equal((await finance.entries(founder,"mine")).length,2);
  // Month-to-day drill-down and person-scoped ledgers must reconcile exactly.
  const secondFounder=principal(newStaff.id,directOrg.id,["FOUNDER"],[
    "finance.entry.create","finance.entry.read.own","finance.read.all",
  ]);
  await finance.submit(secondFounder,{...directInput,occurredOn:"2026-10-20",
    amount:"10.2500",idempotencyKey:randomUUID()});
  await finance.submit(founder,{...directInput,occurredOn:"2026-09-30",
    amount:"20.7500",idempotencyKey:randomUUID()});
  const reportingFounder=principal(founderUser.id,directOrg.id,["FOUNDER"],[
    "reports.business.read","finance.read.all",
  ]);
  const dailyPeriod={kind:"EXPENSE" as const,from:"2026-09-01",to:"2026-10-31",q:"",page:1,limit:20};
  const drill=await finance.breakdown(reportingFounder,dailyPeriod);
  assert.equal(drill.total,"52.0000");
  assert.deepEqual(drill.monthly.map(x=>[x.month,x.total]),[
    ["2026-09","20.7500"],["2026-10","31.2500"]]);
  assert.deepEqual(drill.daily,[
    {date:"2026-09-30",total:"20.7500",count:1},
    {date:"2026-10-19",total:"21.0000",count:1},
    {date:"2026-10-20",total:"10.2500",count:1},
  ]);
  assert.equal(drill.people.length,2);
  assert.deepEqual(drill.people.map(p=>[p.id,p.total]),[
    [founderUser.id,"41.7500"],[newStaff.id,"10.2500"]]);
  assert.equal(drill.people.reduce((n,p)=>n+Number(p.total),0),52);
  const filtered=await finance.breakdown(reportingFounder,{
    ...dailyPeriod,personId:newStaff.id,day:"2026-10-20",
  });
  assert.equal(filtered.total,drill.total);
  assert.deepEqual(filtered.people,drill.people);
  assert.equal(filtered.matchingTotal,"10.2500");
  assert.equal(filtered.matchingCount,1);
  assert.equal(filtered.transactions.length,1);
  assert.equal(filtered.transactions[0].enteredBy,"Staff");
  assert.equal((await finance.breakdown(reportingFounder,{
    ...dailyPeriod,personId:newStaff.id,day:"2026-10-19",
  })).matchingCount,0);
  assert.equal((await finance.breakdown(reportingFounder,{
    ...dailyPeriod,personId:outsider.id,
  })).matchingCount,0);
  const scopedCsv=await finance.exportBreakdown(reportingFounder,{
    ...dailyPeriod,personId:newStaff.id,day:"2026-10-20",
  });
  assert.equal(scopedCsv.count,1);
  assert.ok(scopedCsv.csv.includes("10.2500"));
  assert.equal(financeBreakdownQuerySchema.safeParse({...dailyPeriod,day:"2026-11-01"}).success,false);
  assert.equal(financeBreakdownQuerySchema.safeParse({...dailyPeriod,personId:"not-uuid"}).success,false);
  console.info("Module 6 PASS: admin category rename/unused delete/referenced archive, other-user expense edits/cancellation, audit and tenant isolation.");
}finally{await db.$disconnect();}
