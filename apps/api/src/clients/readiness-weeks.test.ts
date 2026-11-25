import {describe,expect,it} from "vitest";
import {monthWeeks,clientCycle,clientCycleKey,clientReadinessPlan} from "./readiness-weeks";

const date=(value:string)=>new Date(value+"T00:00:00Z");
const dates=(month:string,start:string,end:string)=>monthWeeks(month,date(start),date(end)).map(w=>[w.from,w.to]);

describe("contract-aligned content readiness weeks",()=>{
 it("anchors on agreement start, crosses month boundaries, and ends on agreement end",()=>{
  expect(dates("2026-11","2026-11-13","2026-12-12")).toEqual([
   ["2026-11-13","2026-11-19"],["2026-11-20","2026-11-26"],["2026-11-27","2026-12-03"]
  ]);
  expect(dates("2026-12","2026-11-13","2026-12-12")).toEqual([
   ["2026-12-04","2026-12-10"],["2026-12-11","2026-12-12"]
  ]);
  expect(dates("2026-10","2026-11-13","2026-12-12")).toEqual([]);
  expect(dates("2027-01","2026-11-13","2026-12-12")).toEqual([]);
 });
 it("handles the year boundary, leap days, and single-day contracts",()=>{
  expect(dates("2026-12","2026-12-30","2027-01-12")).toEqual([["2026-12-30","2027-01-05"]]);
  expect(dates("2027-01","2026-12-30","2027-01-12")).toEqual([["2027-01-06","2027-01-12"]]);
  expect(dates("2028-02","2028-02-29","2028-02-29")).toEqual([["2028-02-29","2028-02-29"]]);
 });
 it("keeps old calendar buckets for clients without start dates",()=>{
  expect(monthWeeks("2026-02").map(w=>[w.from,w.to])).toEqual([
   ["2026-02-01","2026-02-07"],["2026-02-08","2026-02-14"],
   ["2026-02-15","2026-02-21"],["2026-02-22","2026-02-28"]
  ]);
  expect(monthWeeks("2028-02")).toHaveLength(5);
  expect(monthWeeks("2026-11",null,date("2026-11-11")).at(-1)?.to).toBe("2026-11-11");
 });
});

describe("individual monthly client cycles",()=>{
 const schedule={contractStartOn:date("2026-11-25"),contractEndOn:null};
 it("starts on the 25th and restarts weekly numbering next month",()=>{
  expect(clientCycle("2026-11-25","2026-11")).toMatchObject({from:"2026-11-25",to:"2026-12-24"});
  const plan=clientReadinessPlan(schedule,[],undefined,"2026-12-10");
  expect(plan.weeks.map(w=>[w.from,w.to])).toEqual([["2026-11-25","2026-12-01"],["2026-12-02","2026-12-08"],["2026-12-09","2026-12-15"],["2026-12-16","2026-12-22"],["2026-12-23","2026-12-24"]]);
  expect(clientReadinessPlan(schedule,[],undefined,"2026-12-25").weeks[0]?.from).toBe("2026-12-25");
 });
 it("clamps the 31st without permanently shifting the anniversary",()=>{
  expect(clientCycle("2026-10-31","2027-01")).toMatchObject({from:"2027-01-31",to:"2027-02-27"});
  expect(clientCycle("2026-10-31","2027-02")).toMatchObject({from:"2027-02-28",to:"2027-03-30"});
  expect(clientCycleKey("2026-10-31","2027-03-30")).toBe("2027-02");
  expect(clientCycle("2026-10-31","2028-02").from).toBe("2028-02-29");
 });
 it("preserves cross-boundary history without duplicating or splitting a saved key",()=>{
  const legacy={month:"2026-12",week:4,periodFrom:date("2026-12-23"),periodTo:date("2026-12-29")};
  const previous=clientReadinessPlan(schedule,[legacy,legacy],"2026-11","2026-12-25");
  const next=clientReadinessPlan(schedule,[legacy,legacy],"2026-12","2026-12-25");
  expect(previous.weeks.filter(w=>w.storageMonth==="2026-12"&&w.storageWeek===4)).toEqual([{storageMonth:"2026-12",storageWeek:4,from:"2026-12-23",to:"2026-12-29",legacy:true}]);
  expect(next.weeks[0]).toMatchObject({from:"2026-12-30",to:"2026-12-31",storageMonth:"2026-12",storageWeek:35});
  expect(next.weeks.every(w=>w.from>"2026-12-29")).toBe(true);
  expect(new Set([...previous.weeks,...next.weeks].map(w=>w.storageMonth+":"+w.storageWeek)).size).toBe(previous.weeks.length+next.weeks.length);
 });
 it("respects an early end, missing dates and a previously saved shortened interval",()=>{
  expect(clientReadinessPlan({...schedule,agreementEndedOn:date("2026-12-05")},[],undefined,"2026-12-25").weeks.at(-1)?.to).toBe("2026-12-05");
  expect(clientReadinessPlan({...schedule,contractStartOn:null},[],undefined,"2026-12-25").weeks).toEqual([]);
  const saved={month:"2026-11",week:30,periodFrom:date("2026-11-25"),periodTo:date("2026-11-27")};
  expect(clientReadinessPlan(schedule,[saved],"2026-11","2026-12-05").weeks.slice(0,2).map(w=>[w.from,w.to])).toEqual([["2026-11-25","2026-11-27"],["2026-11-28","2026-12-01"]]);
 });
});
