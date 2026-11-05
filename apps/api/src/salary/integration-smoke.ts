import "dotenv/config";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import express,{type ErrorRequestHandler} from "express";
import http from "supertest";
import {createDatabaseClient} from "@digimarket/db";
import {registerSalaryRoutes} from "./routes";
import {FinanceService} from "../finance/service";
import type {AuthService,Principal} from "../auth/service";
import {AuthError} from "../auth/errors";
if(process.env.NODE_ENV!=="test"||!process.env.DATABASE_URL?.includes("digimarket_ci"))
 throw new Error("Salary integration permitted only against isolated digimarket_ci");
const db=createDatabaseClient();
const api=express();api.use(express.json());
const make=(userId:string,org:string,roles:string[]):Principal=>({
 userId,organizationId:org,roles,permissions:new Set(),sessionId:"salary-ci"
});
const who=new Map<string,Principal>();
const fakeAuth={database:db,authenticate:async(token:string)=>{
 const p=who.get(token);if(!p)throw new AuthError(401,"UNAUTHORIZED","Not authenticated");return p;
}} as unknown as AuthService;
registerSalaryRoutes(api,fakeAuth);
const onError:ErrorRequestHandler=(error:unknown,_req,res,_next)=>{
 void _next;
 const e=error as {status?:number;code?:string;message?:string};
 res.status(e.status||500).json({error:{code:e.code||"SERVER_ERROR",message:e.message||"Error"}});
};
api.use(onError);
const auth=(token:string)=>({"Authorization":"Bearer "+token});
try{
 const org=await db.organization.create({data:{name:"Salary Payroll Smoke "+randomUUID()}});
 const other=await db.organization.create({data:{name:"Other Salary Smoke "+randomUUID()}});
 const [f1,f2,employee,outsider]=await Promise.all([
  db.user.create({data:{organizationId:org.id,loginId:"funding-a",displayName:"Founder A",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"funding-b",displayName:"Founder B",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:org.id,loginId:"salary-staff",displayName:"Employee",status:"ACTIVE"}}),
  db.user.create({data:{organizationId:other.id,loginId:"salary-other",displayName:"Outside",status:"ACTIVE"}})
 ]);
 const founderRole=await db.role.create({data:{organizationId:org.id,key:"FOUNDER",label:"Founder",isSystem:true}});
 await db.userRole.createMany({data:[{userId:f1.id,roleId:founderRole.id},{userId:f2.id,roleId:founderRole.id}]});
 who.set("founder-a",make(f1.id,org.id,["FOUNDER"]));
 who.set("founder-b",make(f2.id,org.id,["FOUNDER"]));
 who.set("employee",make(employee.id,org.id,["EMPLOYEE"]));
 who.set("outsider",make(outsider.id,other.id,["EMPLOYEE"]));
 const finance=new FinanceService(db);
 const accountA=who.get("founder-a")!,accountB=who.get("founder-b")!;
 for(const actor of [accountA,accountB]){
  actor.permissions.add("finance.entry.create");
  actor.permissions.add("finance.entry.read.own");
  actor.permissions.add("finance.read.all");
 }
 const incomeCategory=await db.financialCategory.create({data:{organizationId:org.id,
  kind:"INCOME",name:"Service income",normalizedName:"service income"}});
 const expenseCategory=await db.financialCategory.create({data:{organizationId:org.id,
  kind:"EXPENSE",name:"Agency operations",normalizedName:"agency operations"}});
 const financeIncome=async(actor:Principal,amount:string)=>finance.submit(actor,{
  kind:"INCOME",categoryId:incomeCategory.id,amount,occurredOn:"2026-11-05",method:"UPI",idempotencyKey:randomUUID()
 });
 await financeIncome(accountA,"12000.0000");
 await financeIncome(accountB,"8000.0000");
 const c1=await http(api).post("/api/v1/salary/accounts").set(auth("founder-a"))
  .send({founderUserId:f1.id,name:"UPI"}).expect(201);
 const c2=await http(api).post("/api/v1/salary/accounts").set(auth("founder-b"))
  .send({founderUserId:f2.id,name:"Bank"}).expect(201);
 const a=c1.body.data.id as string,b=c2.body.data.id as string;
 // Salary sources cannot mint independent funds: Finance posted income is authoritative.
 await http(api).post("/api/v1/salary/accounts").set(auth("founder-a"))
  .send({founderUserId:f1.id,name:"Fake funds",openingBalance:"5000.00"}).expect(422);
 const c3=await http(api).post("/api/v1/salary/accounts").set(auth("founder-a"))
  .send({founderUserId:f1.id,name:"Cash"}).expect(201);
 const a2=c3.body.data.id as string;
 await http(api).get("/api/v1/salary/accounts").set(auth("employee")).expect(403);
 await http(api).post("/api/v1/salary/accounts").set(auth("employee"))
  .send({founderUserId:employee.id,name:"Fake"}).expect(403);
 await http(api).post("/api/v1/salary/accounts").set(auth("founder-a"))
  .send({founderUserId:employee.id,name:"Unauthorized"}).expect(422);
 const firstKey=randomUUID();
 const salary={idempotencyKey:firstKey,recipientUserId:employee.id,amount:"20000.00",
  salaryMonth:"2026-11",paidOn:"2026-11-05",method:"UPI",confirmedPaid:true,
  allocations:[{accountId:a,amount:"12000.00"},{accountId:b,amount:"8000.00"}]};
 await http(api).post("/api/v1/salary/payments").set(auth("founder-a"))
  .send({...salary,allocations:[{accountId:a,amount:"12000.00"},{accountId:b,amount:"7999.99"}]}).expect(422);
 const paid=await http(api).post("/api/v1/salary/payments").set(auth("founder-a")).send(salary).expect(201);
 const id=paid.body.data.id as string;
 await http(api).post("/api/v1/salary/payments").set(auth("founder-a")).send(salary).expect(409);
 let state=await http(api).get("/api/v1/salary/accounts").set(auth("founder-a")).expect(200);
 assert.equal(state.body.data.find((x:{id:string})=>x.id===a).availableBalance,"0.0000");
 assert.equal(state.body.data.find((x:{id:string})=>x.id===b).availableBalance,"0.0000");
 const summary=await http(api).get("/api/v1/salary/summary").set(auth("founder-b")).expect(200);
 assert.equal(summary.body.data.totalPaid,"20000.00");
 assert.equal(summary.body.data.paymentCount,1);
 assert.equal(summary.body.data.founderFunding.length,2);
 assert.equal(summary.body.data.founderFunding.find((x:{founderUserId:string})=>x.founderUserId===f1.id).amount,"12000.00");
 assert.equal(await db.financialTransaction.count({where:{organizationId:org.id}}),2);
 const postedF1=await finance.totals(accountA,"mine");
 const postedF2=await finance.totals(accountB,"mine");
 const postedAll=await finance.totals(accountA,"all");
 assert.equal(postedF1.postedNet,"0.0000");
 assert.equal(postedF2.postedNet,"0.0000");
 assert.equal(postedAll.postedNet,"0.0000");
 assert.equal(postedAll.postedSalaryExpense,"20000.0000");
 assert.equal(postedAll.postedNetBeforeSalary,"20000.0000");
 assert.equal(postedAll.postedExpenseIncludingSalary,"20000.0000");
 const mineA=await finance.entries(accountA,"mine");
 const mineB=await finance.entries(accountB,"mine");
 const agency=await finance.entries(accountA,"all");
 const salaryRows=(entries:Awaited<ReturnType<typeof finance.entries>>)=>
  entries.filter(row=>row.sourceType==="SALARY");
 assert.deepEqual(salaryRows(mineA).map(row=>row.amount),["12000.0000"]);
 assert.deepEqual(salaryRows(mineB).map(row=>row.amount),["8000.0000"]);
 assert.equal(salaryRows(agency).length,2);
 assert.deepEqual(salaryRows(agency).map(row=>row.amount).sort(),["12000.0000","8000.0000"].sort());
 assert.ok(salaryRows(agency).every(row=>row.category.name==="Salary"&&row.status==="POSTED"));
 assert.equal((await finance.exportCsv(accountA,"all")).csv.split("salary:").length,3);

 const self=await http(api).get("/api/v1/salary/payments").set(auth("employee")).expect(200);
 assert.equal(self.body.data.length,1);
 assert.equal(self.body.data[0].allocations.length,0);
 const stranger=await http(api).get("/api/v1/salary/payments").set(auth("outsider")).expect(200);
 assert.equal(stranger.body.data.length,0);
 await http(api).get("/api/v1/salary/summary").set(auth("employee")).expect(403);
 await http(api).post("/api/v1/salary/accounts/"+a+"/credits").set(auth("founder-b"))
  .send({recordedOn:"2026-11-05",amount:"5000.00",description:"Fake funds"}).expect(409);
 await financeIncome(accountA,"5000.0000");
 assert.equal((await finance.totals(accountA,"mine")).postedNet,"5000.0000");
 await http(api).post("/api/v1/salary/payments").set(auth("founder-a"))
  .send({...salary,idempotencyKey:randomUUID(),amount:"5000.01",
   allocations:[{accountId:a,amount:"2500.00"},{accountId:a2,amount:"2500.01"}]}).expect(422);
 const voided=await http(api).post("/api/v1/salary/payments/"+id+"/void").set(auth("founder-b"))
  .send({reason:"Original payment reversed"}).expect(200);
 assert.equal(voided.body.data.status,"VOID");
 await http(api).post("/api/v1/salary/payments/"+id+"/void").set(auth("founder-a"))
  .send({reason:"Duplicate reversal"}).expect(409);
 state=await http(api).get("/api/v1/salary/accounts").set(auth("founder-a")).expect(200);
 assert.equal(state.body.data.find((x:{id:string})=>x.id===a).availableBalance,"17000.0000");
 assert.equal(state.body.data.find((x:{id:string})=>x.id===b).availableBalance,"8000.0000");
 const afterVoid=await http(api).get("/api/v1/salary/summary").set(auth("founder-a")).expect(200);
 assert.equal(afterVoid.body.data.totalPaid,"0.00");
 assert.equal(salaryRows(await finance.entries(accountA,"mine"))[0]?.status,"CANCELLED");
 assert.equal((await finance.totals(accountA,"all")).postedSalaryExpense,"0.0000");
 assert.equal(await db.notification.count({where:{recipientId:employee.id,organizationId:org.id}}),2);
 // Later Finance spending updates salary funding availability without a salary wallet top-up.
 await finance.submit(accountA,{kind:"EXPENSE",categoryId:expenseCategory.id,
  amount:"1000.0000",occurredOn:"2026-11-05",method:"UPI",idempotencyKey:randomUUID()});
 assert.equal((await finance.totals(accountA,"mine")).postedNet,"16000.0000");
 const refreshed=await http(api).get("/api/v1/salary/accounts").set(auth("founder-a")).expect(200);
 assert.equal(refreshed.body.data.find((x:{id:string})=>x.id===a).availableBalance,"16000.0000");
 assert.equal(refreshed.body.data.find((x:{id:string})=>x.id===a2).availableBalance,"16000.0000");
 // Founder salary is a recipient entry, never a finance INCOME.
 await http(api).post("/api/v1/salary/payments").set(auth("founder-a")).send({
  ...salary,idempotencyKey:randomUUID(),recipientUserId:f2.id,amount:"500.00",
  allocations:[{accountId:a,amount:"500.00"}]
 }).expect(201);
 assert.equal(await db.financialTransaction.count({where:{organizationId:org.id}}),4);
 assert.equal((await http(api).get("/api/v1/salary/payments").set(auth("employee")).expect(200)).body.data.length,1);
 assert.equal((await http(api).get("/api/v1/salary/summary").set(auth("founder-a")).expect(200)).body.data.totalPaid,"500.00");
 assert.equal((await finance.totals(accountA,"mine")).postedNet,"15500.0000");
 assert.equal((await finance.totals(accountA,"all")).postedSalaryExpense,"500.0000");
 console.info("Salary integration PASS: founder RBAC, employee isolation, paise split, funding balances, idempotency, void reversal, founder salary, notifications and no finance income pollution.");
}finally{
 await db.$disconnect();
}
