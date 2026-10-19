import { createCipheriv, createDecipheriv, createHmac, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";

export interface AuthConfig {
  accessSecret: Uint8Array;
  challengeSecret: Uint8Array;
  mfaEncryptionKey: Buffer;
  issuer: string;
  audience: string;
  secureCookies: boolean;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const access = env.JWT_ACCESS_SECRET ?? "";
  const challenge = env.JWT_CHALLENGE_SECRET ?? "";
  const rawMfaKey = env.MFA_ENCRYPTION_KEY_BASE64 ?? "";
  const key = Buffer.from(rawMfaKey, "base64");
  if (Buffer.byteLength(access) < 32 || Buffer.byteLength(challenge) < 32 || access === challenge || key.length !== 32) {
    throw new Error("Missing secure auth configuration: independent JWT secrets (>=32 bytes) and 32-byte MFA key required");
  }
  return {
    accessSecret: new TextEncoder().encode(access),
    challengeSecret: new TextEncoder().encode(challenge),
    mfaEncryptionKey: key,
    issuer: env.JWT_ISSUER ?? "digimarket-api",
    audience: env.JWT_AUDIENCE ?? "digimarket-web",
    secureCookies: env.NODE_ENV === "production",
  };
}

export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 3, parallelism: 1 });
export const verifyPassword = async (hash: string, password: string) => {
  try { return await argon2.verify(hash, password); } catch { return false; }
};
export const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
export const newRefreshSecret = () => randomBytes(40).toString("base64url");

export type TokenPurpose = "access" | "change_password" | "enroll_mfa" | "verify_mfa";
export async function issueJwt(config: AuthConfig, purpose: TokenPurpose, user: { id: string; organizationId: string; authVersion: number }, sessionId?: string) {
  const isAccess = purpose === "access";
  return new SignJWT({ org: user.organizationId, ver: user.authVersion, purpose, ...(sessionId ? { sid: sessionId } : {}) })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(user.id)
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setIssuedAt()
    .setExpirationTime(isAccess ? "10m" : "5m")
    .sign(isAccess ? config.accessSecret : config.challengeSecret);
}

export async function decodeJwt(config: AuthConfig, token: string, purpose: TokenPurpose) {
  const { payload } = await jwtVerify(token, purpose === "access" ? config.accessSecret : config.challengeSecret, {
    issuer: config.issuer, audience: config.audience, algorithms: ["HS256"],
  });
  if (payload.purpose !== purpose || typeof payload.sub !== "string" || typeof payload.org !== "string" || typeof payload.ver !== "number" || (purpose === "access" && typeof payload.sid !== "string")) {
    throw new Error("Invalid token purpose or claims");
  }
  return { userId: payload.sub, organizationId: payload.org, version: payload.ver, sessionId: typeof payload.sid === "string" ? payload.sid : undefined };
}

export function encryptSecret(key: Buffer, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const value = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), value].map((v) => v.toString("base64url")).join(".");
}
export function decryptSecret(key: Buffer, encrypted: string) {
  const parts = encrypted.split(".");
  if (parts.length !== 3) throw new Error("Malformed encrypted secret");
  const [iv, tag, value] = parts.map((v) => Buffer.from(v, "base64url"));
  const cipher = createDecipheriv("aes-256-gcm", key, iv);
  cipher.setAuthTag(tag);
  return Buffer.concat([cipher.update(value), cipher.final()]).toString("utf8");
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32(buffer: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const b of buffer) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];
  return out;
}
function decodeBase32(input: string) {
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, "")) {
    const digit = alphabet.indexOf(char);
    if (digit < 0) throw new Error("Invalid base32 secret");
    value = (value << 5) | digit;
    bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}
export function generateTotpSecret() { return base32(randomBytes(20)); }
export function totpCode(secret: string, clock = Date.now()): string {
  const count = Math.floor(clock / 30_000);
  const time = Buffer.alloc(8);
  time.writeBigUInt64BE(BigInt(count));
  const digest = createHmac("sha1", decodeBase32(secret)).update(time).digest();
  const offset = digest[digest.length - 1] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}
export function verifyTotp(secret: string, candidate: string, clock = Date.now()) {
  if (!/^\d{6}$/.test(candidate)) return false;
  for (const delta of [-1, 0, 1]) {
    const expected = totpCode(secret, clock + delta * 30_000);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(candidate))) return true;
  }
  return false;
}
