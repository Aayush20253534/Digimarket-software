import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {InternalSettlementService} from "./internal-settlements";
import {FinanceService} from "./service";
import {TotalExpenseService} from "./total-expenses";
import {founderLedgerBalances} from "./founder-balance";

if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Internal Settlement integration permitted only against isolated digimarket_ci");
const db=createDatabaseClient();
const finance=new FinanceService(db),settlements=new InternalSettlementService(db);
const principal=(userId:string,organizationId:string,roles:string[]):Principal=>({
 userId,organizationId,sessionId:"internal-settlement-ci",roles,
 permissions:new Set(["finance.entry.read.own","finance.entry.create","finance.read.all"])
});
const forbidden=(code:number)=>(err:unknown)=>(err as {status?:number}).status===code;

try{
 const organization=await db.organization.create({data:{name:"Internal settlements "+randomUUID()}});
 const outside=await db.organization.create({data:{name:"Other organization "+randomUUID()}});
 const [alice,bob,carol,employee,outsider]=await Promise.all([
  db.user.create({data:{organizationId:organization.id,loginId:"settlement-a",
   displayName:"Founder A",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:organization.id,loginId:"settlement-b",
   displayName:"Founder B",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:organization.id,loginId:"settlement-c",
   displayName:"Founder C",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:organization.id,loginId:"settlement-staff",
   displayName:"Staff",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:outside.id,loginId:"settlement-outsider",
   displayName:"Outside",status:"ACTIVE"}})
 ]);
 const role=await db.role.create({data:{organizationId:organization.id,key:"FOUNDER",
  label:"Founder",isSystem:true}});
 await db.userRole.createMany({data:[alice,bob,carol].map(u=>({userId:u.id,roleId:role.id}))});
 const a=principal(alice.id,organization.id,["FOUNDER"]);
 const b=principal(bob.id,organization.id,["FOUNDER"]);
 const c=principal(carol.id,organization.id,["FOUNDER"]);
 const staff=principal(employee.id,organization.id,["EMPLOYEE"]);
 const stranger=principal(outsider.id,outside.id,["FOUNDER"]);

 const category=await db.financialCategory.create({data:{
  organizationId:organization.id,kind:"INCOME",name:"Client retainers",normalizedName:"client retainers"
 }});
 const income=await finance.submit(a,{kind:"INCOME",categoryId:category.id,amount:"10000.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal(income.status,"POSTED");
 const expenseCategory=await db.financialCategory.create({data:{
  organizationId:organization.id,kind:"EXPENSE",name:"Operations",normalizedName:"operations"
 }});
 const oldA=await finance.submit(a,{kind:"EXPENSE",categoryId:expenseCategory.id,amount:"4500.00",
  occurredOn:"2026-11-05",method:"UPI",idempotencyKey:randomUUID()});
 const oldB=await finance.submit(b,{kind:"EXPENSE",categoryId:expenseCategory.id,amount:"3200.00",
  occurredOn:"2026-11-05",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal(oldA.status,"POSTED");assert.equal(oldB.status,"POSTED");
 const salaryAccount=await db.salaryFundingAccount.create({data:{
  organizationId:organization.id,founderUserId:a.userId,createdById:a.userId,
  name:"Founder A pool",normalizedName:"founder a pool",openingBalance:"2000.00",availableBalance:"2000.00"
 }});
 const salaryPayment=await db.salaryPayment.create({data:{
  organizationId:organization.id,recipientUserId:employee.id,createdById:a.userId,
  idempotencyKey:randomUUID(),amount:"800.00",salaryMonth:"2026-11",
  paidOn:new Date("2026-11-06T00:00:00Z"),method:"UPI",status:"PAID"
 }});
 await db.salaryFundingAllocation.create({data:{
  accountId:salaryAccount.id,paymentId:salaryPayment.id,amount:"800.00"
 }});
 const beforeAll=await finance.totals(a,"all");
 const beforeA=await finance.totals(a,"mine"),beforeB=await finance.totals(b,"mine");
 const beforeBalance=await founderLedgerBalances(db,organization.id,[a.userId,b.userId]);
 const transactions=await db.financialTransaction.count({where:{organizationId:organization.id}});

 assert.deepEqual((await settlements.founders(a)).map(x=>x.id).sort(),[bob.id,carol.id].sort());
 assert.equal((await settlements.founders(a)).some(x=>x.id===employee.id),false);
 await assert.rejects(()=>settlements.founders(staff),forbidden(403));
 await assert.rejects(()=>settlements.record(staff,{recipientId:bob.id,amount:"5.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()}),forbidden(403));
 await assert.rejects(()=>settlements.record(a,{recipientId:alice.id,amount:"100.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()}),forbidden(422));
 await assert.rejects(()=>settlements.record(a,{recipientId:employee.id,amount:"100.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()}),forbidden(422));
 await assert.rejects(()=>settlements.record(a,{recipientId:outsider.id,amount:"100.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()}),forbidden(422));
 const key=randomUUID();
 const input={recipientId:bob.id,amount:"2000.00",occurredOn:"2026-11-06",
  method:"UPI" as const,note:"Internal adjustment only",idempotencyKey:key};
 const saved=await settlements.record(a,input);
 assert.equal(saved.status,"RECORDED");
 await assert.rejects(()=>settlements.record(a,input),forbidden(409));
 assert.equal(await db.internalSettlement.count({where:{organizationId:organization.id}}),1);
 assert.equal(await db.financialTransaction.count({where:{organizationId:organization.id}}),transactions);
 assert.deepEqual(await finance.totals(a,"all"),beforeAll);
 const senderTotals=await finance.totals(a,"mine");
 const recipientTotals=await finance.totals(b,"mine");
 for(const [current,previous] of [[senderTotals,beforeA],[recipientTotals,beforeB]]){
  assert.equal(current.personalSettlementResetAt,null);
  for(const field of ["postedIncome","postedExpense","postedSalaryExpense","postedExpenseIncludingSalary","postedNet","pendingIncome","pendingExpense"] as const)
   assert.equal(current[field],previous[field]);
  assert.deepEqual(current.groups,previous.groups);
 }
 assert.equal(senderTotals.receivedInternalSettlement,"0.0000");
 assert.equal(recipientTotals.receivedInternalSettlement,"2000.0000");
 assert.equal(senderTotals.postedNet,beforeA.postedNet);
 assert.equal(recipientTotals.postedNet,beforeB.postedNet);
 // Date-selected summaries retain all transactions, even after settlement.
 const activeWindow={from:"2026-01-01",to:new Date(Date.now()+86_400_000).toISOString().slice(0,10)};
 const expenseReport=new TotalExpenseService(db);
 for(const founder of [a,b]){
  const prior=founder===a?beforeA:beforeB;
  const scoped=await finance.totals(founder,"mine",activeWindow);
  const combined=await expenseReport.summary(founder,{...activeWindow,view:"mine"});
  assert.equal(scoped.postedIncome,prior.postedIncome);
  assert.equal(scoped.postedExpense,prior.postedExpense);
  assert.equal(scoped.postedSalaryExpense,prior.postedSalaryExpense);
  assert.equal(scoped.postedNet,prior.postedNet);
  assert.equal(combined.postedIncome,prior.postedIncome);
  assert.equal(combined.postedTotalExpense,prior.postedExpenseIncludingSalary);
  assert.equal(combined.personalSettlementResetAt,null);
 }
 // Historical work cycles ending before settlement keep their original balances.
 const historyWindow={from:"2026-11-01",to:"2026-11-07"};
 assert.equal((await finance.totals(a,"mine",historyWindow)).postedExpense,"4500.0000");
 assert.equal((await expenseReport.summary(a,{...historyWindow,view:"mine"})).postedTotalExpense,"5300.0000");
 const historyRows=await expenseReport.records(a,{
  ...activeWindow,view:"mine",type:"ALL",q:"",page:1,limit:50
 });
 assert.ok(historyRows.total>0);
 assert.ok(Number(historyRows.matchingAmount)>0);
 assert.equal((await expenseReport.summary(a,{...activeWindow,view:"all"})).postedTotalExpense,
   (await expenseReport.summary(a,{...historyWindow,view:"all"})).postedTotalExpense);
 const afterBalance=await founderLedgerBalances(db,organization.id,[a.userId,b.userId]);
 assert.equal(afterBalance.get(a.userId)?.remaining.toFixed(4),beforeBalance.get(a.userId)?.remaining.minus(2000).toFixed(4));
 assert.equal(afterBalance.get(b.userId)?.remaining.toFixed(4),beforeBalance.get(b.userId)?.remaining.plus(2000).toFixed(4));
 const afterA=await settlements.cycleBalance(a,"mine",{from:"2026-10-22",to:"2026-11-21"});
 const afterB=await settlements.cycleBalance(b,"mine",{from:"2026-10-22",to:"2026-11-21"});
 assert.equal(Number(afterA.remaining)+Number(afterB.remaining),2300);
 const outgoing=(await finance.entries(a,"mine")).filter(x=>x.sourceType==="SETTLEMENT");
 const incoming=(await finance.entries(b,"mine")).filter(x=>x.sourceType==="SETTLEMENT");
 assert.equal(outgoing.length,1);
 assert.equal(incoming.length,1);
 assert.equal(outgoing[0].settlementDirection,"OUTGOING");
 assert.equal(incoming[0].settlementDirection,"INCOMING");
 assert.equal(outgoing[0].amount,"2000.0000");
 assert.equal(incoming[0].amount,"2000.0000");
 assert.equal(outgoing[0].merchantOrSource,"Founder B");
 assert.equal(incoming[0].merchantOrSource,"Founder A");
 assert.equal(outgoing[0].settlementId,incoming[0].settlementId);
 // The dedicated history API reads the same record from both founder accounts.
 const sentHistory=await settlements.projectMine(a);
 const receivedHistory=await settlements.projectMine(b);
 assert.equal(sentHistory.length,1);
 assert.equal(receivedHistory.length,1);
 assert.equal(sentHistory[0].id,receivedHistory[0].id);
 assert.equal(sentHistory[0].settlementId,saved.id);
 assert.equal(receivedHistory[0].settlementDirection,"INCOMING");
 assert.equal(sentHistory[0].settlementDirection,"OUTGOING");
 assert.equal(receivedHistory[0].enteredById,b.userId);
 assert.equal(receivedHistory[0].merchantOrSource,"Founder A");
 assert.equal(sentHistory[0].merchantOrSource,"Founder B");
 assert.equal(receivedHistory[0].status,"POSTED");
 const agencyWindow={from:"2026-10-22",to:"2026-11-21"};
 const agencyHistory=await settlements.projectAll(c,agencyWindow);
 assert.equal(agencyHistory.total,1);
 assert.equal(agencyHistory.postedCount,1);
 assert.equal(agencyHistory.voidedCount,0);
 assert.equal(agencyHistory.postedTotal,"2000.0000");
 assert.equal(agencyHistory.items[0].senderName,"Founder A");
 assert.equal(agencyHistory.items[0].recipientName,"Founder B");
 assert.equal(agencyHistory.items[0].status,"POSTED");
 assert.equal((await settlements.projectAll(c,agencyWindow,1,1)).items.length,1);
 await assert.rejects(()=>settlements.projectAll(
  {...staff,permissions:new Set(["finance.entry.read.own"])} as Principal,agencyWindow),forbidden(403));
 assert.equal((await settlements.projectAll(stranger,agencyWindow)).total,0);
 assert.deepEqual(await settlements.projectMine(c),[]);
 await assert.rejects(()=>settlements.projectMine(staff),forbidden(403));
 assert.deepEqual(await settlements.projectMine(stranger),[]);
 assert.equal((await finance.entries(a,"all")).some(x=>x.sourceType==="SETTLEMENT"),false);
 assert.equal((await finance.entries(a,"mine")).some(x=>x.id===oldA.id),true);
 assert.equal((await finance.entries(b,"mine")).some(x=>x.id===oldB.id),true);
 assert.equal((await finance.entries(c,"mine")).some(x=>x.sourceType==="SETTLEMENT"),false);
 assert.equal((await finance.entries(staff,"mine")).some(x=>x.sourceType==="SETTLEMENT"),false);
 assert.equal((await finance.entries(stranger,"mine")).some(x=>x.sourceType==="SETTLEMENT"),false);
 const csvA=(await finance.exportCsv(a,"mine")).csv;
 const csvB=(await finance.exportCsv(b,"mine")).csv;
 const csvAll=(await finance.exportCsv(a,"all")).csv;
 assert.ok(csvA.includes("settlement:"+saved.id));
 assert.ok(csvA.includes("OUTGOING"));
 assert.ok(csvB.includes("settlement:"+saved.id));
 assert.ok(csvB.includes("INCOMING"));
 assert.equal(csvAll.includes("settlement:"+saved.id),false);

 // New expenses must accrue after recording even when backdated.
 await new Promise(resolve=>setTimeout(resolve,15));
 const newA=await finance.submit(a,{kind:"EXPENSE",categoryId:expenseCategory.id,amount:"125.00",
  occurredOn:"2026-10-01",method:"UPI",idempotencyKey:randomUUID()});
 const newB=await finance.submit(b,{kind:"EXPENSE",categoryId:expenseCategory.id,amount:"600.00",
  occurredOn:"2026-10-01",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal(newA.status,"POSTED");assert.equal(newB.status,"POSTED");
 assert.equal((await finance.totals(a,"mine")).postedExpense,"4625.0000");
 assert.equal((await finance.totals(b,"mine")).postedExpense,"3800.0000");
 const newIncome=await finance.submit(a,{kind:"INCOME",categoryId:category.id,amount:"300.00",
  occurredOn:"2026-10-01",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal(newIncome.status,"POSTED");
 assert.equal((await finance.totals(a,"mine")).postedIncome,"10300.0000");
 assert.equal((await finance.totals(b,"mine")).postedIncome,"0.0000");
 assert.equal((await finance.totals(a,"mine")).postedNet,"4875.0000");
 const agencyAfterNew=await finance.totals(a,"all");
 assert.equal(agencyAfterNew.postedIncome,
  (Number(beforeAll.postedIncome)+300).toFixed(4));
 assert.equal(agencyAfterNew.postedExpense,
  (Number(beforeAll.postedExpense)+725).toFixed(4));
 assert.equal(agencyAfterNew.postedSalaryExpense,beforeAll.postedSalaryExpense);
 const second=await settlements.record(a,{recipientId:bob.id,amount:"250.00",
  occurredOn:"2026-11-06",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal((await finance.totals(a,"mine")).postedExpense,"4625.0000");
 assert.equal((await finance.totals(b,"mine")).postedExpense,"3800.0000");
 assert.deepEqual(await finance.totals(a,"all"),agencyAfterNew);
 const beforeSecondVoid=await settlements.projectAll(c,agencyWindow);
 assert.equal(beforeSecondVoid.postedTotal,"2250.0000");
 assert.equal(beforeSecondVoid.postedCount,2);
 assert.equal(beforeSecondVoid.total,2);
 await settlements.void(a,second.id,"Reverse second cycle closure");
 const afterSecondVoid=await settlements.projectAll(c,agencyWindow);
 assert.equal(afterSecondVoid.postedTotal,"2000.0000");
 assert.equal(afterSecondVoid.postedCount,1);
 assert.equal(afterSecondVoid.voidedCount,1);
 assert.equal(afterSecondVoid.total,2);
 assert.equal((await finance.totals(a,"mine")).postedExpense,"4625.0000");
 assert.equal((await finance.totals(b,"mine")).postedExpense,"3800.0000");
 await assert.rejects(()=>settlements.void(b,saved.id,"Invalid transfer"),forbidden(404));
 await assert.rejects(()=>settlements.void(stranger,saved.id,"Invalid transfer"),forbidden(404));
 const voided=await settlements.void(a,saved.id,"Entered twice in notes");
 assert.equal(voided.status,"VOID");
 const afterVoids=await settlements.projectAll(c,agencyWindow,1,1);
 assert.equal(afterVoids.postedTotal,"0.0000");
 assert.equal(afterVoids.postedCount,0);
 assert.equal(afterVoids.voidedCount,2);
 assert.equal(afterVoids.total,2);
 assert.equal(afterVoids.items.length,1);
 await assert.rejects(()=>settlements.void(a,saved.id,"Another void"),forbidden(409));
 assert.equal((await finance.entries(a,"mine")).find(x=>x.sourceType==="SETTLEMENT")?.status,"CANCELLED");
 assert.equal((await finance.entries(b,"mine")).find(x=>x.sourceType==="SETTLEMENT")?.status,"CANCELLED");
 assert.equal((await settlements.projectMine(b)).find(row=>row.settlementId===saved.id)?.status,"CANCELLED");
 assert.deepEqual(await finance.totals(a,"all"),agencyAfterNew);
 const restoredA=await finance.totals(a,"mine"),restoredB=await finance.totals(b,"mine");
 assert.equal(restoredA.personalSettlementResetAt,null);
 assert.equal(restoredB.personalSettlementResetAt,null);
 assert.equal(restoredA.postedIncome,(Number(beforeA.postedIncome)+300).toFixed(4));
 assert.equal(restoredA.postedExpense,(Number(beforeA.postedExpense)+125).toFixed(4));
 assert.equal(restoredB.postedExpense,(Number(beforeB.postedExpense)+600).toFixed(4));
 assert.equal(restoredA.postedExpenseIncludingSalary,(Number(beforeA.postedExpenseIncludingSalary)+125).toFixed(4));
 assert.equal(restoredB.postedExpenseIncludingSalary,(Number(beforeB.postedExpenseIncludingSalary)+600).toFixed(4));
 assert.equal(await db.financialTransaction.count({where:{organizationId:organization.id}}),transactions+3);
 assert.equal(await db.auditLog.count({where:{organizationId:organization.id,
  entityType:"InternalSettlement",entityId:saved.id}}),2);
 console.info("Internal Settlement PASS: balanced founder movements, no ledger reset, agency ledger untouched, void restores balances, privacy and CSV.");
}finally{await db.$disconnect();}
