import {describe,expect,it,vi} from "vitest";
import type {PrismaClient} from "@digimarket/db";
import type {Principal} from "../auth/service";
import {ClientVideoReadinessService} from "./video-readiness-service";
import {ClientPostReadinessService} from "./post-readiness-service";
import {bulkClientReadiness} from "./bulk-readiness";
const actor={organizationId:"org",permissions:new Set(["clients.read"])} as Principal;
const movements=[
 {month:"2026-10",week:1,readyAdded:4,delivered:0,festivalReadyAdded:3,festivalDelivered:0},
 {month:"2026-10",week:2,readyAdded:0,delivered:3,festivalReadyAdded:0,festivalDelivered:0},
 {month:"2026-11",week:1,readyAdded:5,delivered:0,festivalReadyAdded:0,festivalDelivered:0},
 {month:"2026-11",week:2,readyAdded:0,delivered:2,festivalReadyAdded:0,festivalDelivered:1},
 {month:"2026-11",week:3,readyAdded:0,delivered:1,festivalReadyAdded:0,festivalDelivered:0},
 {month:"2026-11",week:4,readyAdded:3,delivered:0,festivalReadyAdded:0,festivalDelivered:0},
].map((row,i)=>({...row,id:String(i),note:"saved",festivalNote:"",version:2,updatedAt:null,updatedBy:{displayName:"Founder"}}));
function fixture(){
 const weeks={findMany:vi.fn(async({where}:{where:{month:{lte:string}}})=>movements.filter(row=>row.month<=where.month.lte))};
 return {client:{findFirst:vi.fn().mockResolvedValue({id:"client",businessName:"Cafe",contractStartOn:new Date("2026-10-22T00:00:00Z"),contractEndOn:null})},
  clientVideoWeek:weeks,clientPostWeek:weeks} as unknown as PrismaClient;
}
describe("client content work cycles",()=>{
 it("re-groups full contract weeks without renumbering their stored keys or losing carry-forward",async()=>{
  const service=new ClientVideoReadinessService(fixture());
  const october=await service.cycle(actor,"client","2026-10");
  expect(october.weeks.map(w=>[w.week,w.from,w.storageMonth,w.storageWeek])).toEqual([
   [1,"2026-10-22","2026-10",1],[2,"2026-10-29","2026-10",2],
   [3,"2026-11-05","2026-11",1],[4,"2026-11-12","2026-11",2],[5,"2026-11-19","2026-11",3],
  ]);
  expect(october).toMatchObject({openingStock:0,readyThisMonth:9,deliveredThisMonth:6,remainingStock:3});
  const november=await service.cycle(actor,"client","2026-11");
  expect(november).toMatchObject({openingStock:3,readyThisMonth:3,deliveredThisMonth:0,remainingStock:6});
  expect(november.weeks[0]).toMatchObject({from:"2026-11-26",storageMonth:"2026-11",storageWeek:4});
  expect(new Set([...october.weeks,...november.weeks].map(w=>w.storageMonth+":"+w.storageWeek)).size)
   .toBe(october.weeks.length+november.weeks.length);
 });
 it("keeps regular and festival post inventories independent across cycles",async()=>{
  const service=new ClientPostReadinessService(fixture());
  const october=await service.cycle(actor,"client","2026-10");
  expect(october).toMatchObject({remainingStock:3,festivalOpeningStock:0,festivalReadyThisMonth:3,festivalDeliveredThisMonth:1,festivalRemainingStock:2});
  expect(await service.cycle(actor,"client","2026-11")).toMatchObject({openingStock:3,festivalOpeningStock:2,festivalRemainingStock:2});
 });
});

describe("client anniversary stock preservation",()=>{
 it("counts every legacy movement exactly once, with a shared dated grid",async()=>{
  const db=fixture();
  const v=new ClientVideoReadinessService(db),p=new ClientPostReadinessService(db);
  const old=await v.clientCycle(actor,"client","2026-10","2026-11-25");
  const current=await v.clientCycle(actor,"client","2026-11","2026-11-25");
  expect(old).toMatchObject({from:"2026-10-22",to:"2026-11-21",remainingStock:3,totalStock:6});
  expect(current).toMatchObject({openingStock:3,remainingStock:6,totalStock:6});
  expect(current.weeks[0]).toMatchObject({from:"2026-11-26",storageMonth:"2026-11",storageWeek:4,legacy:true});
  expect(current.weeks[1]?.from).toBe("2026-12-03");
  expect(await p.clientCycle(actor,"client","2026-11","2026-11-25")).toMatchObject({festivalOpeningStock:2,festivalRemainingStock:2,festivalTotalStock:2});
 });
});

describe("bulk readiness parity",()=>{
 it("matches single-client reads and uses three queries for a batch",async()=>{
  const db=fixture();
  const client={id:"client",businessName:"Cafe",contractStartOn:new Date("2026-10-22T00:00:00Z"),contractEndOn:null};
  const second={...client,id:"other",businessName:"Other",contractStartOn:new Date("2026-10-25T00:00:00Z")};
  const v=await new ClientVideoReadinessService(db).clientCycle(actor,"client",undefined,"2026-11-25");
  const p=await new ClientPostReadinessService(db).clientCycle(actor,"client",undefined,"2026-11-25");
  const bulkDb={client:{findMany:vi.fn().mockResolvedValue([client,second])},
   clientVideoWeek:{findMany:vi.fn().mockResolvedValue(movements.map(row=>({...row,clientId:"client"})))},
   clientPostWeek:{findMany:vi.fn().mockResolvedValue(movements.map(row=>({...row,clientId:"client"})))}};
  const result=await bulkClientReadiness(bulkDb as unknown as PrismaClient,actor,["client","other"],"2026-11-25");
  expect(result.get("client")).toEqual({v,p});
  expect(result.get("other")?.v.totalStock).toBe(0);
  expect(result.get("other")?.p.festivalTotalStock).toBe(0);
  for(const model of Object.values(bulkDb))expect(model.findMany).toHaveBeenCalledTimes(1);
  expect(bulkDb.client.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{organizationId:"org",id:{in:["client","other"]}}}));
 });
 it("denies access before database reads",async()=>{
  await expect(bulkClientReadiness({} as PrismaClient,{...actor,permissions:new Set()},["client"],"2026-11-25")).rejects.toMatchObject({status:403});
 });
});
