import {describe,expect,it,vi} from "vitest";
import {Prisma,type PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {FinanceService} from "./service";

const org="00000000-0000-4000-8000-000000000001";
const alice="00000000-0000-4000-8000-000000000002";
const bob="00000000-0000-4000-8000-000000000003";
const clientOne="00000000-0000-4000-8000-000000000004";
const clientTwo="00000000-0000-4000-8000-000000000005";
const category="00000000-0000-4000-8000-000000000006";
const travel="00000000-0000-4000-8000-000000000007";
const actor=(all:boolean):Principal=>({
  organizationId:org,userId:alice,roles:["FOUNDER"],
  permissions:new Set(all?["finance.entry.read.own","finance.read.all"]:["finance.entry.read.own"]),
} as unknown as Principal);

type Status="POSTED"|"PENDING"|"REJECTED"|"CANCELLED";
type Row={date:string;person:string;client:string|null;status:Status;amount:string;categoryId?:string;organizationId?:string};
const rows:Row[]=[
  {date:"2026-10-31",person:alice,client:null,status:"POSTED",amount:"10.0100"},
  {date:"2026-11-01",person:alice,client:clientOne,status:"POSTED",amount:"120.0000"},
  {date:"2026-11-01",person:bob,client:null,status:"POSTED",amount:"30.0000"},
  {date:"2026-11-02",person:bob,client:clientOne,status:"PENDING",amount:"20.0000"},
  {date:"2026-11-02",person:bob,client:clientTwo,status:"POSTED",amount:"70.0000"},
  {date:"2026-11-02",person:alice,client:clientTwo,status:"REJECTED",amount:"9.0000"},
  {date:"2026-11-02",person:bob,client:null,status:"CANCELLED",amount:"15.0000"},
  {date:"2026-11-03",person:alice,client:clientOne,status:"POSTED",amount:"5.0001"},
  {date:"2026-11-02",person:alice,client:null,status:"POSTED",amount:"9999.0000",categoryId:travel},
  {date:"2026-11-02",person:alice,client:null,status:"POSTED",amount:"9998.0000",organizationId:"another-organization"},
];
function fixture(){
  const groupBy=vi.fn(async ({where}:{where:{
    organizationId:string;enteredById?:string;categoryId?:{in:string[]};
    occurredOn?:{gte?:Date;lte?:Date};
  }})=>{
    const filtered=rows.filter(r=>(r.organizationId??org)===where.organizationId
      &&(!where.enteredById||r.person===where.enteredById)
      &&(!where.categoryId||where.categoryId.in.includes(r.categoryId??category))
      &&(!where.occurredOn?.gte||r.date>=where.occurredOn.gte.toISOString().slice(0,10))
      &&(!where.occurredOn?.lte||r.date<=where.occurredOn.lte.toISOString().slice(0,10)));
    const grouped=new Map<string,{occurredOn:Date;clientId:string|null;enteredById:string;status:Status;
      _sum:{amount:Prisma.Decimal};_count:{_all:number}}>();
    for(const r of filtered){
      const key=[r.date,r.client??"SELF",r.person,r.status].join("|");
      const current=grouped.get(key)??{
        occurredOn:new Date(r.date+"T00:00:00.000Z"),
        clientId:r.client,enteredById:r.person,status:r.status,
        _sum:{amount:new Prisma.Decimal(0)},_count:{_all:0},
      };
      current._sum.amount=current._sum.amount.plus(r.amount);
      current._count._all+=1;
      grouped.set(key,current);
    }
    return [...grouped.values()];
  });
  const db={
    financialCategory:{findMany:vi.fn().mockResolvedValue([
      {id:category,name:"Meta Ads"},{id:travel,name:"Travel"},
    ])},
    financialTransaction:{groupBy},
    client:{findMany:vi.fn().mockResolvedValue([
      {id:clientOne,businessName:"Cafe One"},{id:clientTwo,businessName:"Dental Two"},
    ])},
    user:{findMany:vi.fn().mockResolvedValue([
      {id:alice,displayName:"Alice"},{id:bob,displayName:"Bob"},
    ])},
  } as unknown as PrismaClient;
  return {service:new FinanceService(db),groupBy};
}

describe("Meta Ads distribution reconciliation",()=>{
  it("reconciles agency totals against dates, categories, people and statuses",async()=>{
    const {service,groupBy}=fixture();
    const result=await service.metaAdsDistribution(actor(true),"all");
    expect(result.view).toBe("all");
    expect(result.totalPosted).toBe("235.0101");
    expect(result.totalPending).toBe("20.0000");
    expect(result.total).toBe("255.0101");
    expect(result.selfPosted).toBe("40.0100");
    expect(result.clientPosted).toBe("195.0001");
    expect(result.clientPending).toBe("20.0000");
    expect(result.excludedAmount).toBe("24.0000");
    expect(result.excludedCount).toBe(2);
    expect(result.transactionCount).toBe(6);
    expect(result.categories.find(c=>c.clientId===clientOne)).toMatchObject({
      name:"Cafe One",posted:"125.0001",pending:"20.0000",total:"145.0001",
    });
    expect(result.categories.find(c=>c.clientId===null)?.posted).toBe("40.0100");
    expect(result.individuals.find(p=>p.userId===alice)?.posted).toBe("135.0101");
    expect(result.individuals.find(p=>p.userId===bob)?.posted).toBe("100.0000");
    expect(result.individuals.find(p=>p.userId===bob)?.categories.find(c=>c.clientId===clientOne)?.pending).toBe("20.0000");
    expect(result.daily.map(d=>d.date)).toEqual(["2026-11-03","2026-11-02","2026-11-01","2026-10-31"]);
    expect(result.monthly.map(d=>d.date)).toEqual(["2026-11","2026-10"]);
    for(const field of ["posted","pending","total"] as const){
      const sum=(values:{[key:string]:unknown}[])=>values.reduce(
        (acc,row)=>acc.plus(String(row[field])),new Prisma.Decimal(0)).toFixed(4);
      expect(sum(result.daily)).toBe(result[field==="posted"?"totalPosted":field==="pending"?"totalPending":"total"]);
      expect(sum(result.monthly)).toBe(result[field==="posted"?"totalPosted":field==="pending"?"totalPending":"total"]);
      expect(sum(result.categories)).toBe(result[field==="posted"?"totalPosted":field==="pending"?"totalPending":"total"]);
      expect(sum(result.individuals)).toBe(result[field==="posted"?"totalPosted":field==="pending"?"totalPending":"total"]);
    }
    expect(groupBy.mock.calls[0][0].where).not.toHaveProperty("enteredById");
  });

  it("applies an inclusive occurredOn date range to My entries without counting another person",async()=>{
    const {service,groupBy}=fixture();
    const mine=await service.metaAdsDistribution(actor(false),"mine","2026-11-01","2026-11-02");
    expect(mine.totalPosted).toBe("120.0000");
    expect(mine.totalPending).toBe("0.0000");
    expect(mine.excludedAmount).toBe("9.0000");
    expect(mine.daily.map(d=>d.date)).toEqual(["2026-11-02","2026-11-01"]);
    expect(groupBy.mock.calls[0][0].where).toMatchObject({
      organizationId:org,enteredById:alice,
      occurredOn:{gte:new Date("2026-11-01T00:00:00.000Z"),lte:new Date("2026-11-02T00:00:00.000Z")},
      categoryId:{in:[category]},
    });
    const day=await service.metaAdsDistribution(actor(true),"all","2026-11-02","2026-11-02");
    expect(day.totalPosted).toBe("70.0000");
    expect(day.totalPending).toBe("20.0000");
    expect(day.total).toBe("90.0000");
    expect(day.excludedAmount).toBe("24.0000");
  });

  it("returns zero-valued totals and empty breakdowns for an empty range",async()=>{
    const result=await fixture().service.metaAdsDistribution(actor(false),"mine","2027-01-01","2027-01-31");
    expect(result.totalPosted).toBe("0.0000");
    expect(result.total).toBe("0.0000");
    expect(result.daily).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.individuals).toEqual([]);
  });
});
