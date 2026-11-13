import {describe,expect,it} from "vitest";
import {monthWeeks} from "./readiness-weeks";

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
