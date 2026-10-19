import type { PrismaClient } from "@digimarket/db";
import {
  decryptSecret, encryptSecret, generateTotpSecret, hashPassword, hashToken,
  issueJwt, decodeJwt, newRefreshSecret, verifyPassword, verifyTotp, type AuthConfig,
} from "./crypto";
import { AuthError, forbidden, invalid, unauthorized } from "./errors";
import { privilegedRole, SYSTEM_ROLES, type SystemRole } from "./policies";

type Database = PrismaClient;
export interface Principal {
  userId: string;
  organizationId: string;
  sessionId: string;
  roles: string[];
  permissions: Set<string>;
}

const sessionDays = 7;
const sessionExpiry = () => new Date(Date.now() + sessionDays * 24 * 60 * 60 * 1000);
const publicUser = (user: { id: string; organizationId: string; loginId: string; displayName: string; status: string; mustChangePassword: boolean }) => ({
  id: user.id, organizationId: user.organizationId, loginId: user.loginId,
  displayName: user.displayName, status: user.status,
  mustChangePassword: user.mustChangePassword,
});
const normalizeLogin = (value: string) => value.trim().toLowerCase();

export class AuthService {
  constructor(private readonly db: Database, readonly config: AuthConfig) {}

  private async fullUser(id: string) {
    return this.db.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    });
  }

  private rolesFor(user: NonNullable<Awaited<ReturnType<AuthService["fullUser"]>>>) {
    // Roles from another organization do not grant power even if a cross-organization
    // row is accidentally created by a future service.
    return user.roles.filter(({ role }) => role.organizationId === user.organizationId).map(({ role }) => role);
  }

  private async challengeUser(token: string, purpose: "change_password" | "enroll_mfa" | "verify_mfa") {
    let claims;
    try { claims = await decodeJwt(this.config, token, purpose); } catch { throw unauthorized(); }
    const user = await this.fullUser(claims.userId);
    if (!user || user.organizationId !== claims.organizationId || user.authVersion !== claims.version || user.status === "DISABLED") throw unauthorized();
    return user;
  }

  async login(loginId: string, password: string) {
    const candidates = await this.db.user.findMany({
      where: { loginId: normalizeLogin(loginId) },
      take: 2,
      include: { roles: { include: { role: { include: { permissions: true } } } } },
    });
    // One-workspace login. Reject ambiguous login IDs across workspaces to avoid
    // authenticating into an unintended organization if multi-org is introduced.
    const user = candidates.length === 1 ? candidates[0] : null;
    if (!user || user.status === "DISABLED" || !user.passwordHash || !await verifyPassword(user.passwordHash, password)) throw unauthorized();
    if (user.mustChangePassword || user.status === "INVITED") {
      return { next: "CHANGE_PASSWORD" as const, challengeToken: await issueJwt(this.config, "change_password", user) };
    }
    if (privilegedRole(this.rolesFor(user).map((r) => r.key))) {
      const action = user.mfaSecretEncrypted ? "VERIFY_MFA" as const : "ENROLL_MFA" as const;
      return { next: action, challengeToken: await issueJwt(this.config, action === "VERIFY_MFA" ? "verify_mfa" : "enroll_mfa", user) };
    }
    return this.newSession(user, false);
  }

  private async newSession(user: { id: string; organizationId: string; authVersion: number; loginId: string; displayName: string; status: string; mustChangePassword: boolean }, mfaVerified: boolean) {
    const secret = newRefreshSecret();
    const session = await this.db.session.create({
      data: {
        userId: user.id,
        refreshTokenHash: hashToken(secret),
        expiresAt: sessionExpiry(),
        mfaVerifiedAt: mfaVerified ? new Date() : null,
      },
    });
    const accessToken = await issueJwt(this.config, "access", user, session.id);
    return { next: "SIGNED_IN" as const, accessToken, refreshToken: `${session.id}.${secret}`, user: publicUser(user) };
  }

  async changePassword(challengeToken: string, oldPassword: string, newPassword: string) {
    const user = await this.challengeUser(challengeToken, "change_password");
    if (!user.mustChangePassword || !user.passwordHash || !await verifyPassword(user.passwordHash, oldPassword)) throw unauthorized();
    if (await verifyPassword(user.passwordHash, newPassword)) throw invalid("New password must differ from previous password");
    const passwordHash = await hashPassword(newPassword);
    await this.db.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({ where: { id: user.id, authVersion: user.authVersion, mustChangePassword: true }, data: {
        passwordHash, mustChangePassword: false, status: "ACTIVE", authVersion: { increment: 1 }, mfaPendingEncrypted: null, mfaPendingExpiresAt: null,
      } });
      if (updated.count !== 1) throw unauthorized();
      await tx.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "auth.password_changed", entityType: "User", entityId: user.id } });
    });
    return { next: "LOGIN_AGAIN" as const };
  }

  async setupMfa(challengeToken: string) {
    const user = await this.challengeUser(challengeToken, "enroll_mfa");
    if (user.mustChangePassword || user.mfaSecretEncrypted || !privilegedRole(this.rolesFor(user).map((r) => r.key))) throw forbidden();
    let secret = user.mfaPendingEncrypted && user.mfaPendingExpiresAt && user.mfaPendingExpiresAt > new Date()
      ? decryptSecret(this.config.mfaEncryptionKey, user.mfaPendingEncrypted) : null;
    if (!secret) {
      secret = generateTotpSecret();
      await this.db.user.update({ where: { id: user.id }, data: {
        mfaPendingEncrypted: encryptSecret(this.config.mfaEncryptionKey, secret),
        mfaPendingExpiresAt: new Date(Date.now() + 10 * 60_000),
      } });
    }
    const uri = `otpauth://totp/${encodeURIComponent("DigiMarket:" + user.loginId)}?secret=${secret}&issuer=DigiMarket&algorithm=SHA1&digits=6&period=30`;
    return { secret, otpauthUrl: uri };
  }

  async confirmMfa(challengeToken: string, code: string) {
    const user = await this.challengeUser(challengeToken, "enroll_mfa");
    if (!user.mfaPendingEncrypted || !user.mfaPendingExpiresAt || user.mfaPendingExpiresAt <= new Date() || user.mfaSecretEncrypted) throw unauthorized();
    const secret = decryptSecret(this.config.mfaEncryptionKey, user.mfaPendingEncrypted);
    if (!verifyTotp(secret, code)) throw unauthorized();
    const result = await this.db.user.updateMany({
      where: { id: user.id, authVersion: user.authVersion, mfaSecretEncrypted: null, mfaPendingExpiresAt: { gt: new Date() } },
      data: { mfaSecretEncrypted: user.mfaPendingEncrypted, mfaPendingEncrypted: null, mfaPendingExpiresAt: null, lastMfaStep: Math.floor(Date.now() / 30_000) },
    });
    if (result.count !== 1) throw unauthorized();
    await this.db.auditLog.create({ data: { organizationId: user.organizationId, actorId: user.id, action: "auth.mfa_enrolled", entityType: "User", entityId: user.id } });
    return this.newSession(user, true);
  }

  async verifyMfa(challengeToken: string, code: string) {
    const user = await this.challengeUser(challengeToken, "verify_mfa");
    if (user.mustChangePassword || !user.mfaSecretEncrypted || !privilegedRole(this.rolesFor(user).map((r) => r.key))) throw unauthorized();
    const secret = decryptSecret(this.config.mfaEncryptionKey, user.mfaSecretEncrypted);
    if (!verifyTotp(secret, code)) throw unauthorized();
    const timeStep = Math.floor(Date.now() / 30_000);
    const updated = await this.db.user.updateMany({
      where: { id: user.id, authVersion: user.authVersion, OR: [{ lastMfaStep: null }, { lastMfaStep: { lt: timeStep } }] },
      data: { lastMfaStep: timeStep },
    });
    if (updated.count !== 1) throw unauthorized();
    return this.newSession(user, true);
  }

  async authenticate(accessToken: string): Promise<Principal> {
    let claims;
    try { claims = await decodeJwt(this.config, accessToken, "access"); } catch { throw unauthorized(); }
    const [user, session] = await Promise.all([this.fullUser(claims.userId), this.db.session.findUnique({ where: { id: claims.sessionId } })]);
    if (!user || !session || user.status !== "ACTIVE" || user.mustChangePassword ||
      user.organizationId !== claims.organizationId || user.authVersion !== claims.version ||
      session.userId !== user.id || session.revokedAt || session.expiresAt <= new Date()) throw unauthorized();
    const roles = this.rolesFor(user);
    if (privilegedRole(roles.map((role) => role.key)) && !session.mfaVerifiedAt) throw unauthorized();
    return {
      userId: user.id, organizationId: user.organizationId, sessionId: session.id,
      roles: roles.map((role) => role.key),
      permissions: new Set(roles.flatMap((role) => role.permissions.map((entry) => entry.permissionKey))),
    };
  }

  async refresh(refreshToken: string) {
    const [sessionId, secret, ...rest] = refreshToken.split(".");
    if (!sessionId || !secret || rest.length) throw unauthorized();
    const session = await this.db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || session.user.status !== "ACTIVE" || session.user.mustChangePassword) throw unauthorized();
    const digest = hashToken(secret);
    if (digest !== session.refreshTokenHash) {
      if (digest === session.previousRefreshTokenHash) {
        await this.db.session.updateMany({ where: { id: session.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      throw unauthorized();
    }
    const user = await this.fullUser(session.userId);
    if (!user) throw unauthorized();
    if (privilegedRole(this.rolesFor(user).map((r) => r.key)) && !session.mfaVerifiedAt) throw unauthorized();
    const nextSecret = newRefreshSecret();
    const rotated = await this.db.session.updateMany({
      where: { id: session.id, refreshTokenHash: digest, revokedAt: null },
      data: { previousRefreshTokenHash: digest, refreshTokenHash: hashToken(nextSecret), lastUsedAt: new Date() },
    });
    if (rotated.count !== 1) throw unauthorized();
    return {
      next: "SIGNED_IN" as const,
      accessToken: await issueJwt(this.config, "access", user, session.id),
      refreshToken: `${session.id}.${nextSecret}`,
      user: publicUser(user),
    };
  }

  async logout(refreshToken: string) {
    const [sessionId, secret] = refreshToken.split(".");
    if (!sessionId || !secret) return;
    const digest = hashToken(secret);
    await this.db.session.updateMany({ where: { id: sessionId, refreshTokenHash: digest, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  require(principal: Principal, permission: string) {
    if (!principal.permissions.has(permission)) throw forbidden();
  }

  async listUsers(principal: Principal) {
    this.require(principal, "users.read");
    const users = await this.db.user.findMany({
      where: { organizationId: principal.organizationId },
      select: { id: true, loginId: true, displayName: true, email: true, status: true, createdAt: true,
        roles: { select: { role: { select: { key: true } } } } },
      orderBy: { createdAt: "asc" },
    });
    return users.map((u) => ({ ...u, roles: u.roles.map(({ role }) => role.key) }));
  }

  async createUser(principal: Principal, input: {
    loginId: string; displayName: string; email?: string; temporaryPassword: string; role: SystemRole;
  }) {
    this.require(principal, "users.create");
    if (input.role === "SUPER_ADMIN" || (input.role !== "EMPLOYEE" && !principal.roles.includes("SUPER_ADMIN"))) throw forbidden();
    const role = await this.db.role.findUnique({ where: { organizationId_key: { organizationId: principal.organizationId, key: input.role } } });
    if (!role) throw invalid("Assigned role is not configured");
    const passwordHash = await hashPassword(input.temporaryPassword);
    const loginId = normalizeLogin(input.loginId);
    try {
      return await this.db.$transaction(async (tx) => {
        const user = await tx.user.create({ data: {
          organizationId: principal.organizationId, loginId, displayName: input.displayName.trim(),
          email: input.email?.toLowerCase(), passwordHash, status: "INVITED", mustChangePassword: true,
        } });
        await tx.userRole.create({ data: { userId: user.id, roleId: role.id } });
        await tx.auditLog.create({ data: { organizationId: principal.organizationId, actorId: principal.userId,
          action: "users.provisioned", entityType: "User", entityId: user.id } });
        return publicUser(user);
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new AuthError(409, "DUPLICATE_USER", "Login ID already exists");
      throw error;
    }
  }

  async resetPassword(principal: Principal, userId: string, temporaryPassword: string) {
    this.require(principal, "users.reset");
    const target = await this.fullUser(userId);
    if (!target || target.organizationId !== principal.organizationId) throw new AuthError(404, "NOT_FOUND", "User not found");
    if (target.id === principal.userId || (privilegedRole(this.rolesFor(target).map((r) => r.key)) && !principal.roles.includes("SUPER_ADMIN"))) throw forbidden();
    const hash = await hashPassword(temporaryPassword);
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { passwordHash: hash, mustChangePassword: true, authVersion: { increment: 1 }, mfaPendingEncrypted: null, mfaPendingExpiresAt: null } });
      await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: principal.organizationId, actorId: principal.userId, action: "users.password_reset", entityType: "User", entityId: target.id } });
    });
    return { updated: true };
  }

  async disableUser(principal: Principal, userId: string) {
    this.require(principal, "users.update");
    const target = await this.fullUser(userId);
    if (!target || target.organizationId !== principal.organizationId) throw new AuthError(404, "NOT_FOUND", "User not found");
    if (target.id === principal.userId || (privilegedRole(this.rolesFor(target).map((r) => r.key)) && !principal.roles.includes("SUPER_ADMIN"))) throw forbidden();
    await this.db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { status: "DISABLED", authVersion: { increment: 1 } } });
      await tx.session.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: principal.organizationId, actorId: principal.userId, action: "users.disabled", entityType: "User", entityId: target.id } });
    });
    return { updated: true };
  }

  async changeRole(principal: Principal, userId: string, roleKey: SystemRole) {
    if (!principal.roles.includes("SUPER_ADMIN") || !SYSTEM_ROLES.includes(roleKey) || roleKey === "SUPER_ADMIN" || userId === principal.userId) throw forbidden();
    const target = await this.fullUser(userId);
    if (!target || target.organizationId !== principal.organizationId) throw new AuthError(404, "NOT_FOUND", "User not found");
    if (this.rolesFor(target).some((r) => r.key === "SUPER_ADMIN")) throw forbidden();
    const role = await this.db.role.findUnique({ where: { organizationId_key: { organizationId: principal.organizationId, key: roleKey } } });
    if (!role) throw invalid("Role does not exist");
    await this.db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.create({ data: { userId, roleId: role.id } });
      await tx.user.update({ where: { id: userId }, data: { authVersion: { increment: 1 } } });
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.auditLog.create({ data: { organizationId: principal.organizationId, actorId: principal.userId, action: "users.role_changed", entityType: "User", entityId: userId, afterRedacted: { role: roleKey } } });
    });
    return { updated: true };
  }
}
