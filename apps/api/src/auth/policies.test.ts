import { describe, expect, it } from "vitest";
import { privilegedRole } from "./policies";

describe("privileged account protection", () => {
  it("identifies administrators for permission checks without imposing authenticator MFA", () => {
    expect(privilegedRole(["SUPER_ADMIN"])).toBe(true);
    expect(privilegedRole(["ADMIN"])).toBe(true);
    expect(privilegedRole(["FOUNDER"])).toBe(false);
    expect(privilegedRole(["EMPLOYEE"])).toBe(false);
  });
});
