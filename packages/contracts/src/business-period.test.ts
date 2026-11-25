import {afterEach,describe,expect,it,vi} from "vitest";
import {agencyToday,agencyTimestampRange,businessCycle,leadCycles,leadCycleTimestampRange,leadCycleQuerySchema,dateOnlyRange,reportingPeriodQuerySchema,reportingPreset} from "./business-period";
import {leadBulkDeleteSchema} from "./index";

afterEach(()=>vi.useRealTimers());
describe("22nd-to-22nd agency work cycles",()=>{
 it("keeps the first work month together across calendar months",()=>{
  for(const date of ["2026-10-22","2026-10-31","2026-11-01","2026-11-21"])
   expect(businessCycle(date)).toEqual({key:"2026-10",from:"2026-10-22",to:"2026-11-21",endExclusive:"2026-11-22"});
 });
 it("assigns the closing 22nd once, to the next cycle",()=>{
  expect(businessCycle("2026-11-22").from).toBe("2026-11-22");
  expect(businessCycle("2026-11-22",-1).endExclusive).toBe(businessCycle("2026-11-22").from);
 });
 it("handles year rollover, February and leap years",()=>{
  expect(businessCycle("2027-01-05")).toMatchObject({from:"2026-12-22",endExclusive:"2027-01-22"});
  expect(businessCycle("2028-02-29")).toMatchObject({from:"2028-02-22",to:"2028-03-21"});
  expect(businessCycle("2027-02-22",-1).to).toBe("2027-02-21");
 });
 it("changes cycles at midnight in India rather than UTC",()=>{
  expect(businessCycle(agencyToday(new Date("2026-11-21T18:29:59Z"))).key).toBe("2026-10");
  expect(businessCycle(agencyToday(new Date("2026-11-21T18:30:00Z"))).key).toBe("2026-11");
  expect(agencyTimestampRange({from:"2026-10-22",to:"2026-11-21"})).toEqual({
   gte:new Date("2026-10-21T18:30:00Z"),lt:new Date("2026-11-21T18:30:00Z")});
 });
 it("does not shift stored date-only transactions into another date",()=>{
  expect(dateOnlyRange({from:"2026-10-22",to:"2026-11-21"})).toEqual({
   gte:new Date("2026-10-22T00:00:00Z"),lte:new Date("2026-11-21T00:00:00Z")});
 });
 it("starts history and work-year presets on the agency launch date",()=>{
  const now=new Date("2026-11-17T12:00:00Z");
  for(const kind of ["current","three","year","all"] as const)
   expect(reportingPreset(kind,now)).toEqual({from:"2026-10-22",to:"2026-11-21"});
  expect(reportingPreset("previous",new Date("2027-01-24T12:00:00Z"))).toEqual({from:"2026-12-22",to:"2027-01-21"});
 });
 it("defaults API reads to the current cycle and validates custom ranges",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
  expect(reportingPeriodQuerySchema.parse({view:"all"})).toEqual({from:"2026-10-22",to:"2026-11-21"});
  expect(reportingPeriodQuerySchema.safeParse({from:"2026-11-22",to:"2026-11-21"}).success).toBe(false);
  expect(reportingPeriodQuerySchema.safeParse({from:"2026-02-30"}).success).toBe(false);
 });
});
describe("bulk lead delete contract",()=>{
 const lead={id:"00000000-0000-4000-8000-000000000001",version:1};
 it("requires an explicit bounded selection and optimistic versions",()=>{
  expect(leadBulkDeleteSchema.safeParse({leads:[lead]}).success).toBe(true);
  for(const leads of [[],[lead,lead],[{...lead,version:0}],[{...lead,id:"all"}],Array(101).fill(lead)])
   expect(leadBulkDeleteSchema.safeParse({leads}).success).toBe(false);
 });
});

describe("lead acquisition cycles",()=>{
 it("offers only cycles already started, newest first",()=>{
  expect(leadCycles(new Date("2026-11-21T18:29:59Z")).map(c=>c.key)).toEqual(["2026-10"]);
  expect(leadCycles(new Date("2026-11-21T18:30:00Z")).map(c=>c.key)).toEqual(["2026-11","2026-10"]);
  expect(leadCycles(new Date("2026-12-21T18:30:00Z")).map(c=>c.key)).toEqual(["2026-12","2026-11","2026-10"]);
  expect(leadCycles(new Date("2026-10-20T00:00:00Z"))).toEqual([]);
 });
 it("uses exclusive Indian-midnight boundaries and validates cycle keys",()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-11-25T12:00:00Z"));
  expect(leadCycleTimestampRange("2026-10")).toEqual({gte:new Date("2026-10-21T18:30:00Z"),lt:new Date("2026-11-21T18:30:00Z")});
  expect(leadCycleQuerySchema.parse({})).toEqual({});
  for(const cycle of ["2026-09","2026-12","2026-13","total"])expect(leadCycleQuerySchema.safeParse({cycle}).success).toBe(false);
  expect(leadCycleQuerySchema.parse({cycle:"2026-10"})).toEqual({cycle:"2026-10"});
 });
});
