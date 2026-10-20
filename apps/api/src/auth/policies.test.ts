import {describe,expect,it} from "vitest";
import {privilegedRole} from "./policies";

describe("authenticator enforcement",()=>{
 it("requires authenticator only for administrators",()=>{
  expect(privilegedRole(["SUPER_ADMIN"])).toBe(true);
  expect(privilegedRole(["ADMIN"])).toBe(true);
  expect(privilegedRole(["FOUNDER"])).toBe(false);
  expect(privilegedRole(["EMPLOYEE"])).toBe(false);
  expect(privilegedRole(["FOUNDER","EMPLOYEE"])).toBe(false);
 });
});
