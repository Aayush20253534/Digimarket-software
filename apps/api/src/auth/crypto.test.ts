import { describe, expect, it } from "vitest";
import {
  hashPassword, loadAuthConfig, decodeJwt, issueJwt, verifyPassword,
} from "./crypto";

const cfg = loadAuthConfig({
  JWT_ACCESS_SECRET: "this-is-a-long-unit-test-only-secret-value-001",
  JWT_CHALLENGE_SECRET: "independent-challenge-secret-value-for-test-002",
  NODE_ENV: "test",
} as NodeJS.ProcessEnv);

describe("auth cryptography", () => {
  it("hashes and verifies Argon2id passwords", async () => {
    const hashed = await hashPassword("test-only-SecurePassword2026");
    expect(hashed).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(hashed, "test-only-SecurePassword2026")).toBe(true);
    expect(await verifyPassword(hashed, "incorrect-password")).toBe(false);
  });
  it("requires independent strong server secrets", () => {
    expect(() => loadAuthConfig({ JWT_ACCESS_SECRET: "short" } as NodeJS.ProcessEnv)).toThrow();
  });
  it("separates access and challenge JWT purposes", async () => {
    const user = { id: "user-id", organizationId: "org-id", authVersion: 3 };
    const access = await issueJwt(cfg, "access", user, "session-id");
    expect((await decodeJwt(cfg, access, "access")).sessionId).toBe("session-id");
    await expect(decodeJwt(cfg, access, "change_password")).rejects.toThrow();
    const challenge = await issueJwt(cfg, "change_password", user);
    expect((await decodeJwt(cfg, challenge, "change_password")).userId).toBe("user-id");
    await expect(decodeJwt(cfg, challenge, "access")).rejects.toThrow();
  });

});
