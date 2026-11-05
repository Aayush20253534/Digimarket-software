import {describe,it,expect} from "vitest";
import {exactSplit,inr,paise} from "./math";

describe("salary funding uses exact paise",()=>{
 it("preserves cents and rounds nothing",()=>{
  expect(paise("12500.05")).toBe(1250005n);
  expect(paise("0.01")).toBe(1n);
  expect(inr(123456n)).toBe("1234.56");
  expect(inr(-12n)).toBe("-0.12");
 });
 it("accepts multiple founder contributions only when equal to salary",()=>{
  expect(exactSplit("20000.00",["5000.00","15000.00"])).toBe(true);
  expect(exactSplit("20000.00",["5000.00","14999.99"])).toBe(false);
  expect(exactSplit("0.01",["0.01"])).toBe(true);
  expect(exactSplit("1.00",["0.34","0.33","0.33"])).toBe(true);
 });
 it("rejects invalid, negative, zero and excessive precision",()=>{
  expect(exactSplit("150.00",["0","150.00"])).toBe(false);
  expect(exactSplit("150.00",["-1.00","151.00"])).toBe(false);
  expect(exactSplit("100.00",["33.333","66.667"])).toBe(false);
  expect(exactSplit("100.00",[])).toBe(false);
  expect(()=>paise("1e5")).toThrow();
 });
});
