import {describe, expect, it} from "vitest";
import {describeStartupError} from "./startup-error";

describe("safe production startup error diagnostics",()=>{
 it("identifies missing-table migration failures without leaking credentials",()=>{
  const error={name:"PrismaClientKnownRequestError",code:"P2021",
   message:"Invalid database password p@ssw0rd, postgresql://user:password@neon.example/db",
   meta:{table:"Organization",connectionString:"postgresql://user:password@neon.example/db"}};
  const result=describeStartupError(error,"bootstrap");
  expect(result.code).toBe("P2021");
  expect(result.hint).toContain("migrations");
  expect(JSON.stringify(result)).not.toContain("password");
  expect(JSON.stringify(result)).not.toContain("Organization");
 });
 it("identifies invalid credentials without echoing supplied data",()=>{
  const result=describeStartupError({name:"PrismaClientInitializationError",code:"P1000",
    message:"secret API key"},"bootstrap");
  expect(result.code).toBe("P1000");
  expect(JSON.stringify(result)).not.toContain("secret API key");
 });
 it("does not reflect attacker-controlled names, messages or SQLSTATE codes",()=>{
  const result=describeStartupError({name:"password=secret",code:"42P01",message:"password=secret"},"server");
  expect(result.name).toBe("UNKNOWN");
  expect(result.code).toBe("UNKNOWN");
  expect(JSON.stringify(result)).not.toContain("secret");
 });
});
