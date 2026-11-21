import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { FinanceService } from "./service";

const actor = {
  organizationId: "00000000-0000-4000-8000-000000000001",
  userId: "00000000-0000-4000-8000-000000000002",
  roles: ["FOUNDER"],
  permissions: new Set(["finance.entry.read.own"]),
} as unknown as Principal;

function fixture() {
  const categoryId = {
    meta: "00000000-0000-4000-8000-000000000003",
    travel: "00000000-0000-4000-8000-000000000004",
    ads: "00000000-0000-4000-8000-000000000005",
  };
  const findCategories = vi.fn().mockResolvedValue([
    { id: categoryId.meta, name: "Meta Ads" },
    { id: categoryId.travel, name: "Travel" },
    { id: categoryId.ads, name: "Meta Advertising" },
  ]);
  const findTransactions = vi.fn().mockResolvedValue([]);
  const groupTransactions = vi.fn().mockResolvedValue([]);
  const aggregateTransactions = vi.fn().mockResolvedValue({_sum:{amount:new Prisma.Decimal("8500.0000")},_count:{_all:9}});
  const salaryFundingAggregate=vi.fn().mockResolvedValue({_sum:{amount:null}});
  const salaryFundingFindMany=vi.fn().mockResolvedValue([]);
  const settlementFindMany=vi.fn().mockResolvedValue([]);
  const settlementFindFirst=vi.fn().mockResolvedValue(null);
  const settlementAggregate=vi.fn().mockResolvedValue({_sum:{amount:null}});
  const salaryPaymentAggregate=vi.fn().mockResolvedValue({_sum:{amount:null}});
  const db = {
    financialCategory: { findMany: findCategories },
    client:{findMany:vi.fn().mockResolvedValue([])},
    financialTransaction: { findMany: findTransactions, groupBy: groupTransactions,aggregate:aggregateTransactions },
    salaryFundingAllocation:{aggregate:salaryFundingAggregate,findMany:salaryFundingFindMany},
    salaryPayment:{aggregate:salaryPaymentAggregate},
    internalSettlement:{findMany:settlementFindMany,findFirst:settlementFindFirst,aggregate:settlementAggregate},
  } as unknown as PrismaClient;
  return {
    service: new FinanceService(db),
    findCategories, findTransactions, groupTransactions, aggregateTransactions,salaryFundingAggregate, salaryFundingFindMany,
    salaryPaymentAggregate,settlementAggregate,settlementFindFirst,categoryId,
  };
}

describe("Meta Ads register scopes", () => {
  it("only returns Meta advertising expenses for the combined register", async () => {
    const { service, findTransactions, categoryId } = fixture();
    await service.entries(actor, "mine", "meta_ads");
    const where = findTransactions.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId: actor.organizationId,
      enteredById: actor.userId,
      kind: "EXPENSE",
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
    expect(where).not.toHaveProperty("clientId");
  });

  it("counts client Meta Ads from my money-account ownership, not the recorder",async()=>{
    const {service,groupTransactions,categoryId}=fixture();
    groupTransactions.mockResolvedValueOnce([{
      clientId:"00000000-0000-4000-8000-000000000009",
      _sum:{amount:new Prisma.Decimal("8500.0000")},_count:{_all:9}
    }]);
    const result=await service.clientAdAccountSpend(actor,{from:"2026-10-22",to:"2026-11-21"});
    expect(result).toEqual({from:"2026-10-22",to:"2026-11-21",currency:"INR",
      posted:"8500.0000",entries:9,
      byClient:[{clientId:"00000000-0000-4000-8000-000000000009",
        name:"Archived client",posted:"8500.0000",entries:9}]});
    const where=groupTransactions.mock.calls[0][0].where;
    expect(where).toMatchObject({
      organizationId:actor.organizationId,kind:"EXPENSE",status:"POSTED",
      clientId:{not:null},categoryId:{in:[categoryId.meta,categoryId.ads]},
      moneyAccount:{is:{organizationId:actor.organizationId,ownerUserId:actor.userId}}
    });
    expect(where).not.toHaveProperty("enteredById");
    const unauthorized={...actor,permissions:new Set<string>()};
    await expect(service.clientAdAccountSpend(unauthorized,{from:"2026-10-22",to:"2026-11-21"}))
      .rejects.toMatchObject({status:403});
  });

  it("does not accidentally include unrelated client-attributed expenses", async () => {
    const { service, findTransactions, categoryId } = fixture();
    await service.entries(actor, "mine", "client_ads");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      kind: "EXPENSE",
      clientId: { not: null },
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("keeps existing agency transactions in the agency ledger", async () => {
    const { service, findTransactions, findCategories } = fixture();
    await service.entries(actor, "mine");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      organizationId: actor.organizationId,
      clientId: null,
    });
    expect(findTransactions.mock.calls[0][0].where).not.toHaveProperty("kind");
    expect(findCategories).not.toHaveBeenCalled();
  });

  it("calculates client spend using only Meta Ads categories", async () => {
    const { service, groupTransactions, categoryId } = fixture();
    const totals = await service.totals(actor, "mine");
    expect(totals.clientAdSpend.posted).toBe("0.0000");
    expect(groupTransactions).toHaveBeenCalledTimes(2);
    expect(groupTransactions.mock.calls[1][0].where).toMatchObject({
      kind: "EXPENSE",
      clientId: { not: null },
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("subtracts only posted client Meta Ads from net without double-counting agency expenses", async () => {
    const { service, groupTransactions, categoryId } = fixture();
    groupTransactions.mockImplementation(async ({ where }: { where: { clientId: unknown } }) =>
      where.clientId === null
        ? [
            { kind: "INCOME", status: "POSTED", _sum: { amount: new Prisma.Decimal("50000.1234") }, _count: { _all: 1 } },
            { kind: "EXPENSE", status: "POSTED", _sum: { amount: new Prisma.Decimal("10000.0234") }, _count: { _all: 1 } },
            { kind: "INCOME", status: "PENDING", _sum: { amount: new Prisma.Decimal("700.0000") }, _count: { _all: 1 } },
            { kind: "EXPENSE", status: "PENDING", _sum: { amount: new Prisma.Decimal("300.0000") }, _count: { _all: 1 } },
          ]
        : [
            { status: "POSTED", _sum: { amount: new Prisma.Decimal("15000.1000") }, _count: { _all: 2 } },
            { status: "PENDING", _sum: { amount: new Prisma.Decimal("2000.0000") }, _count: { _all: 1 } },
            { status: "REJECTED", _sum: { amount: new Prisma.Decimal("1000.0000") }, _count: { _all: 1 } },
            { status: "CANCELLED", _sum: { amount: new Prisma.Decimal("500.0000") }, _count: { _all: 1 } },
          ]);
    const totals = await service.totals(actor, "mine");
    expect(totals.postedIncome).toBe("50000.1234");
    expect(totals.postedExpense).toBe("10000.0234");
    expect(totals.clientAdSpend).toEqual({ posted: "15000.1000", pending: "2000.0000", count: 4 });
    expect(totals.pendingIncome).toBe("700.0000");
    expect(totals.pendingExpense).toBe("300.0000");
    expect(totals.postedNet).toBe("25000.0000");
    expect(groupTransactions.mock.calls[0][0].where).toMatchObject({
      organizationId: actor.organizationId, enteredById: actor.userId, clientId: null,
    });
    expect(groupTransactions.mock.calls[1][0].where).toMatchObject({
      organizationId: actor.organizationId, enteredById: actor.userId,
      kind: "EXPENSE", clientId: { not: null },
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("records settlements as transfers without clearing income or expense totals",async()=>{
    const {service,groupTransactions,salaryFundingAggregate,settlementAggregate,settlementFindFirst}=fixture();
    groupTransactions.mockImplementation(async ({where}:{where:{clientId:unknown}})=>
      where.clientId===null?[
        {kind:"INCOME",status:"POSTED",_sum:{amount:new Prisma.Decimal("5000.0000")},_count:{_all:1}},
        {kind:"EXPENSE",status:"POSTED",_sum:{amount:new Prisma.Decimal("3500.0000")},_count:{_all:1}}
      ]:[]);
    salaryFundingAggregate.mockResolvedValue({_sum:{amount:new Prisma.Decimal("700.0000")}});
    settlementAggregate.mockResolvedValue({_sum:{amount:new Prisma.Decimal("1200.5000")}});
    const personal=await service.totals(actor,"mine");
    expect(personal.personalSettlementResetAt).toBe(null);
    expect(personal.receivedInternalSettlement).toBe("1200.5000");
    expect(personal.postedExpenseBeforeSettlement).toBe("3500.0000");
    expect(personal.postedExpense).toBe("3500.0000");
    expect(personal.postedSalaryExpense).toBe("700.0000");
    expect(personal.postedExpenseIncludingSalary).toBe("4200.0000");
    expect(personal.postedIncome).toBe("5000.0000");
    expect(personal.postedNet).toBe("800.0000");
    expect(personal.groups).toHaveLength(2);
    expect(groupTransactions).toHaveBeenCalledTimes(2);
    expect(groupTransactions.mock.calls[1][0].where).not.toHaveProperty("OR");
    expect(salaryFundingAggregate.mock.calls[0][0].where.payment).not.toHaveProperty("createdAt");
    expect(settlementFindFirst).not.toHaveBeenCalled();
    expect(settlementAggregate.mock.calls[0][0].where).toEqual({
      organizationId:actor.organizationId,recipientId:actor.userId,voidedAt:null
    });
    const allActor={...actor,permissions:new Set(["finance.entry.read.own","finance.read.all"])};
    const agency=await service.totals(allActor,"all");
    expect(agency.postedExpense).toBe("3500.0000");
    expect(agency.postedNet).toBe("1500.0000");
    expect(agency.receivedInternalSettlement).toBe("0.0000");
    expect(settlementAggregate).toHaveBeenCalledTimes(1);
  });

  it("uses every entry in the selected work cycle regardless of settlement time",async()=>{
    const {service,groupTransactions,salaryFundingAggregate,settlementFindFirst}=fixture();
    groupTransactions.mockImplementation(async ({where}:{where:{clientId:unknown}})=>
      where.clientId!==null?[
        {status:"POSTED",_sum:{amount:new Prisma.Decimal("50")},_count:{_all:1}},
        {status:"PENDING",_sum:{amount:new Prisma.Decimal("12")},_count:{_all:1}}
      ]:[
        {kind:"INCOME",status:"POSTED",_sum:{amount:new Prisma.Decimal("10200")},_count:{_all:2}},
        {kind:"INCOME",status:"PENDING",_sum:{amount:new Prisma.Decimal("30")},_count:{_all:1}},
        {kind:"EXPENSE",status:"POSTED",_sum:{amount:new Prisma.Decimal("3040")},_count:{_all:2}},
        {kind:"EXPENSE",status:"PENDING",_sum:{amount:new Prisma.Decimal("7")},_count:{_all:1}}
      ]);
    salaryFundingAggregate.mockResolvedValue({_sum:{amount:new Prisma.Decimal("10")}});
    const current=await service.totals(actor,"mine");
    expect(current.postedIncome).toBe("10200.0000");
    expect(current.pendingIncome).toBe("30.0000");
    expect(current.postedExpense).toBe("3040.0000");
    expect(current.pendingExpense).toBe("7.0000");
    expect(current.postedSalaryExpense).toBe("10.0000");
    expect(current.postedExpenseIncludingSalary).toBe("3050.0000");
    expect(current.clientAdSpend).toEqual({posted:"50.0000",pending:"12.0000",count:2});
    expect(current.postedNet).toBe("7100.0000");
    expect(current.postedExpenseBeforeSettlement).toBe("3040.0000");
    expect(groupTransactions).toHaveBeenCalledTimes(2);
    expect(groupTransactions.mock.calls[1][0].where).not.toHaveProperty("OR");
    expect(settlementFindFirst).not.toHaveBeenCalled();
  });

  it("allows a negative net if posted client ad spend exceeds posted income", async () => {
    const { service, groupTransactions } = fixture();
    groupTransactions.mockImplementation(async ({ where }: { where: { clientId: unknown } }) =>
      where.clientId === null
        ? [{ kind: "INCOME", status: "POSTED", _sum: { amount: new Prisma.Decimal("100.0000") }, _count: { _all: 1 } }]
        : [{ status: "POSTED", _sum: { amount: new Prisma.Decimal("150.5000") }, _count: { _all: 1 } }]);
    const totals = await service.totals(actor, "mine");
    expect(totals.postedExpense).toBe("0.0000");
    expect(totals.clientAdSpend.posted).toBe("150.5000");
    expect(totals.postedNet).toBe("-50.5000");
  });

  it("deducts only the funding founder's salary from personal Net posted", async () => {
    const {service,groupTransactions,salaryFundingAggregate}=fixture();
    groupTransactions.mockImplementation(async ({where}:{where:{clientId:unknown}})=>
      where.clientId===null?
       [{kind:"INCOME",status:"POSTED",_sum:{amount:new Prisma.Decimal("5000.0000")},_count:{_all:1}}]:[]);
    salaryFundingAggregate.mockResolvedValue({_sum:{amount:new Prisma.Decimal("1200.0000")}});
    const result=await service.totals(actor,"mine");
    expect(result.postedNetBeforeSalary).toBe("5000.0000");
    expect(result.postedSalaryExpense).toBe("1200.0000");
    expect(result.postedNet).toBe("3800.0000");
    expect(salaryFundingAggregate.mock.calls[0][0].where.account.founderUserId).toBe(actor.userId);
  });

  it("exports only Meta Ads rows for the combined scope", async () => {
    const { service, findTransactions, categoryId } = fixture();
    const exported = await service.exportCsv(actor, "mine", "meta_ads");
    expect(exported.filename).toContain("meta_ads");
    expect(findTransactions.mock.calls[0][0].where).toMatchObject({
      kind: "EXPENSE",
      categoryId: { in: [categoryId.meta, categoryId.ads] },
    });
  });

  it("shows salary shares per funding founder and both shares in Agency, without duplicating ledger expenses",async()=>{
    const {service,salaryFundingFindMany,findTransactions}=fixture();
    const founderA=actor.userId;
    const founderB="00000000-0000-4000-8000-000000000009";
    const pay={id:"00000000-0000-4000-8000-000000000020",
      paidOn:new Date("2026-11-05T00:00:00.000Z"),
      createdAt:new Date("2026-11-05T11:00:00.000Z"),
      method:"UPI",status:"PAID",salaryMonth:"2026-11",
      reference:null,note:"November payroll",
      recipient:{displayName:"Employee C"},recorder:{displayName:"Founder A"}};
    const shares=[
      {id:"00000000-0000-4000-8000-000000000021",
        amount:new Prisma.Decimal("2000.00"),payment:pay,
        account:{name:"UPI A",founderUserId:founderA,
          founder:{displayName:"Founder A",loginId:"fa"}}},
      {id:"00000000-0000-4000-8000-000000000022",
        amount:new Prisma.Decimal("3000.00"),payment:pay,
        account:{name:"Bank B",founderUserId:founderB,
          founder:{displayName:"Founder B",loginId:"fb"}}},
    ];
    salaryFundingFindMany.mockImplementation(async ({where}:{
      where:{account:{founderUserId?:string}}
    })=>where.account.founderUserId
      ?shares.filter(share=>share.account.founderUserId===where.account.founderUserId)
      :shares);
    const aEntries=await service.entries(actor,"mine");
    expect(aEntries.filter(x=>x.sourceType==="SALARY").map(x=>x.amount)).toEqual(["2000.0000"]);
    const second={...actor,userId:founderB};
    const bEntries=await service.entries(second,"mine");
    expect(bEntries.filter(x=>x.sourceType==="SALARY").map(x=>x.amount)).toEqual(["3000.0000"]);
    const admin={...actor,permissions:new Set(["finance.read.all","finance.entry.read.own"])};
    const all=await service.entries(admin,"all");
    expect(all.filter(x=>x.sourceType==="SALARY")).toHaveLength(2);
    expect(all.filter(x=>x.sourceType==="SALARY").map(x=>x.category.name)).toEqual(["Salary","Salary"]);
    expect(all.filter(x=>x.sourceType==="SALARY").reduce((n,x)=>n.plus(x.amount),new Prisma.Decimal(0)).toFixed(2))
      .toBe("5000.00");
    expect(all.filter(x=>x.sourceType==="SALARY").map(x=>x.enteredById).sort()).toEqual([founderA,founderB].sort());
    expect(findTransactions).toHaveBeenCalledTimes(3);
    const csv=await service.exportCsv(admin,"all");
    expect(csv.csv).toContain("salary:00000000-0000-4000-8000-000000000021");
    expect(csv.csv).toContain("salary:00000000-0000-4000-8000-000000000022");
    pay.status="VOID";
    const voided=await service.entries(actor,"mine");
    expect(voided.find(x=>x.sourceType==="SALARY")?.status).toBe("CANCELLED");
  });


});
