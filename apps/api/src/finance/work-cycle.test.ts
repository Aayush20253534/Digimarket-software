import request from "supertest";
import {afterEach,describe,expect,it,vi} from "vitest";
import {Prisma,type PrismaClient} from "@digimarket/db";
import type {AuthService,Principal} from "../auth/service";
import {createApp} from "../app";
import {FinanceService} from "./service";
const period={from:"2026-10-22",to:"2026-11-21"};
const range={gte:new Date("2026-10-22T00:00:00Z"),lte:new Date("2026-11-21T00:00:00Z")};
const actor:Principal={organizationId:"org",userId:"founder",sessionId:"test",roles:["FOUNDER"],
 permissions:new Set(["finance.read.all","finance.entry.read.own"])};
function fixture(){
 const groupBy=vi.fn().mockResolvedValueOnce([
  {kind:"INCOME",status:"POSTED",_sum:{amount:new Prisma.Decimal(1000)},_count:{_all:1}},
  {kind:"EXPENSE",status:"POSTED",_sum:{amount:new Prisma.Decimal(200)},_count:{_all:1}},
 ]).mockResolvedValue([{status:"POSTED",_sum:{amount:new Prisma.Decimal(100)},_count:{_all:1}}]);
 const salary={aggregate:vi.fn().mockResolvedValue({_sum:{amount:new Prisma.Decimal(50)}})};
 const db={financialTransaction:{groupBy,findMany:vi.fn().mockResolvedValue([])},
  financialCategory:{findMany:vi.fn().mockResolvedValue([{id:"meta",name:"Meta Ads"}])},
  salaryPayment:salary,salaryFundingAllocation:{...salary,findMany:vi.fn().mockResolvedValue([])},
  client:{findMany:vi.fn().mockResolvedValue([])},
  internalSettlement:{findFirst:vi.fn(),findMany:vi.fn().mockResolvedValue([]),aggregate:vi.fn().mockResolvedValue({_sum:{amount:new Prisma.Decimal(10)}})},
 };
 return {db,service:new FinanceService(db as unknown as PrismaClient)};
}
afterEach(()=>vi.useRealTimers());
describe("finance work-cycle reconciliation",()=>{
 it.each(["mine","all"] as const)("uses one date range for %s totals, ads and salaries without settlement resets",async view=>{
  const {service,db}=fixture();const totals=await service.totals(actor,view,period);
  expect(totals).toMatchObject({from:period.from,to:period.to,postedIncome:"1000.0000",postedExpense:"200.0000",
   postedSalaryExpense:"50.0000",postedExpenseIncludingSalary:"250.0000",agencyOperatingNet:"750.0000",postedNet:"650.0000",
   personalSettlementResetAt:null});
  expect(db.internalSettlement.findFirst).not.toHaveBeenCalled();
  for(const [query] of db.financialTransaction.groupBy.mock.calls)
   expect(query.where).toMatchObject({organizationId:actor.organizationId,occurredOn:range});
  expect(db.financialTransaction.groupBy.mock.calls[0][0].where).toMatchObject({clientId:null,...(view==="mine"?{enteredById:actor.userId}:{})});
  expect(db.salaryPayment.aggregate).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining(
   view==="all"?{paidOn:range}:{payment:expect.objectContaining({paidOn:range}),account:expect.objectContaining({founderUserId:actor.userId})})}));
 });
 it("filters entries and CSV before the database row limits",async()=>{
  const {service,db}=fixture();
  await service.entries(actor,"mine","agency",period);
  await service.exportCsv(actor,"mine","agency",period);
  for(const [query] of db.financialTransaction.findMany.mock.calls)
   expect(query.where).toMatchObject({organizationId:actor.organizationId,enteredById:actor.userId,occurredOn:range});
  for(const [query] of db.internalSettlement.findMany.mock.calls)expect(query.where).toMatchObject({occurredOn:range});
  for(const [query] of db.salaryFundingAllocation.findMany.mock.calls)expect(query.where.payment).toMatchObject({paidOn:range});
 });
 it("defaults HTTP summary requests to the agency cycle and rejects reversed dates",async()=>{
  vi.useFakeTimers({toFake:["Date"]});vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  const {db}=fixture();const auth={database:db,config:{},authenticate:vi.fn().mockResolvedValue(actor)} as unknown as AuthService;
  const app=createApp([],auth);
  const response=await request(app).get("/api/v1/finance/summary?view=all").set("Authorization","Bearer test");
  expect(response.status).toBe(200);expect(response.body.data).toMatchObject(period);
  const invalid=await request(app).get("/api/v1/finance/entries?from=2026-11-22&to=2026-11-21").set("Authorization","Bearer test");
  expect(invalid.status).toBe(422);
  expect((await request(app).get("/api/v1/tasks").set("Authorization","Bearer test")).status).toBe(404);
 });
});
