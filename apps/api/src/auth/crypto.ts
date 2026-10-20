import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { SignJWT, jwtVerify } from "jose";

export interface AuthConfig {
  accessSecret: Uint8Array;
  challengeSecret: Uint8Array;
  issuer: string;
  audience: string;
  secureCookies: boolean;
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const access = env.JWT_ACCESS_SECRET ?? "";
  const challenge = env.JWT_CHALLENGE_SECRET ?? "";
  if (Buffer.byteLength(access) < 32 || Buffer.byteLength(challenge) < 32 || access === challenge) {
    throw new Error("Missing secure auth configuration: independent JWT secrets (>=32 bytes) required");
  }
  return {
    accessSecret: new TextEncoder().encode(access),
    challengeSecret: new TextEncoder().encode(challenge),
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

export type TokenPurpose = "access" | "change_password";
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
