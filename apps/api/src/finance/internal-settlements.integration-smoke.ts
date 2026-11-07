import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createDatabaseClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {InternalSettlementService} from "./internal-settlements";
import {FinanceService} from "./service";
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
 assert.deepEqual(await finance.totals(a,"mine"),beforeA);
 const recipientTotals=await finance.totals(b,"mine");
 assert.equal(recipientTotals.receivedInternalSettlement,"2000.0000");
 assert.equal(recipientTotals.postedExpenseBeforeSettlement,beforeB.postedExpense);
 assert.equal(recipientTotals.postedExpense,
  (Number(beforeB.postedExpense)-2000).toFixed(4));
 assert.equal(recipientTotals.postedExpenseIncludingSalary,
  (Number(beforeB.postedExpenseIncludingSalary)-2000).toFixed(4));
 assert.equal(recipientTotals.postedNet,
  (Number(beforeB.postedNet)+2000).toFixed(4));
 assert.equal(recipientTotals.postedNetBeforeSalary,
  (Number(beforeB.postedNetBeforeSalary)+2000).toFixed(4));
 assert.equal(recipientTotals.postedIncome,beforeB.postedIncome);
 assert.equal(recipientTotals.pendingExpense,beforeB.pendingExpense);
 assert.equal(recipientTotals.pendingIncome,beforeB.pendingIncome);
 assert.deepEqual(recipientTotals.groups,beforeB.groups);
 const afterBalance=await founderLedgerBalances(db,organization.id,[a.userId,b.userId]);
 for(const id of [a.userId,b.userId]){
  assert.equal(afterBalance.get(id)?.remaining.toFixed(4),beforeBalance.get(id)?.remaining.toFixed(4));
 }
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
 assert.equal((await finance.entries(a,"all")).some(x=>x.sourceType==="SETTLEMENT"),false);
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

 await assert.rejects(()=>settlements.void(b,saved.id,"Invalid transfer"),forbidden(404));
 await assert.rejects(()=>settlements.void(stranger,saved.id,"Invalid transfer"),forbidden(404));
 const voided=await settlements.void(a,saved.id,"Entered twice in notes");
 assert.equal(voided.status,"VOID");
 await assert.rejects(()=>settlements.void(a,saved.id,"Another void"),forbidden(409));
 assert.equal((await finance.entries(a,"mine")).find(x=>x.sourceType==="SETTLEMENT")?.status,"CANCELLED");
 assert.equal((await finance.entries(b,"mine")).find(x=>x.sourceType==="SETTLEMENT")?.status,"CANCELLED");
 assert.deepEqual(await finance.totals(a,"all"),beforeAll);
 assert.deepEqual(await finance.totals(a,"mine"),beforeA);
 assert.deepEqual(await finance.totals(b,"mine"),beforeB);
 assert.equal(await db.financialTransaction.count({where:{organizationId:organization.id}}),transactions);
 assert.equal(await db.auditLog.count({where:{organizationId:organization.id,
  entityType:"InternalSettlement",entityId:saved.id}}),2);
 console.info("Internal Settlement PASS: recipient-only expense credit, sender/agency unchanged, rollback on void, privacy and CSV.");
}finally{await db.$disconnect();}
