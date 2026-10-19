import { describe, expect, it } from "vitest";
import {
  decryptSecret, encryptSecret, generateTotpSecret, hashPassword, loadAuthConfig,
  decodeJwt, issueJwt, totpCode, verifyPassword, verifyTotp,
} from "./crypto";

const cfg = loadAuthConfig({
  JWT_ACCESS_SECRET: "this-is-a-long-unit-test-only-secret-value-001",
  JWT_CHALLENGE_SECRET: "independent-challenge-secret-value-for-test-002",
  MFA_ENCRYPTION_KEY_BASE64: Buffer.alloc(32, 7).toString("base64"),
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
    await expect(decodeJwt(cfg, access, "verify_mfa")).rejects.toThrow();
    const challenge = await issueJwt(cfg, "enroll_mfa", user);
    expect((await decodeJwt(cfg, challenge, "enroll_mfa")).userId).toBe("user-id");
    await expect(decodeJwt(cfg, challenge, "access")).rejects.toThrow();
  });
  it("encrypts TOTP secrets and checks codes with bounded clock skew", () => {
    const secret = generateTotpSecret();
    const encrypted = encryptSecret(cfg.mfaEncryptionKey, secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptSecret(cfg.mfaEncryptionKey, encrypted)).toBe(secret);
    const now = Date.now();
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, "1234", now)).toBe(false);
  });
});
