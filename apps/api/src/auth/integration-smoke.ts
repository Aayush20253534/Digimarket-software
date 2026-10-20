import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import request from "supertest";
import { createDatabaseClient } from "@digimarket/db";
import { createApp } from "../app";
import { bootstrapFirstAdmin } from "./bootstrap";
import { loadAuthConfig } from "./crypto";
import { AuthService } from "./service";

if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL?.includes("digimarket_ci")) {
  throw new Error("Auth integration only allowed on ephemeral digimarket_ci database");
}

const password = () => randomBytes(22).toString("base64url") + "a1";
const initialAdmin = password(), permanentAdmin = password();
const initialEmployee = password(), permanentEmployee = password();
process.env.BOOTSTRAP_ORG_NAME = "Agency CI " + randomUUID();
process.env.BOOTSTRAP_ADMIN_LOGIN = "owner-test";
process.env.BOOTSTRAP_ADMIN_PASSWORD = initialAdmin;

const db = createDatabaseClient();
const app = createApp(["http://localhost:3000"], new AuthService(db, loadAuthConfig()));
const login = (loginId: string, pass: string) => request(app).post("/api/v1/auth/login").send({ loginId, password: pass });
const change = (token: string, oldPassword: string, newPassword: string) =>
  request(app).post("/api/v1/auth/change-password").send({ challengeToken: token, oldPassword, newPassword });
const authHeader = (token: string) => "Bearer " + token;
const cookie = (response: request.Response): string => {
  const setCookie = response.headers["set-cookie"] as unknown as string[];
  assert.ok(Array.isArray(setCookie) && setCookie.length > 0);
  return setCookie[0].split(";")[0];
};

try {
  const { organizationId } = await bootstrapFirstAdmin();
  assert.ok(organizationId);
  await assert.rejects(() => bootstrapFirstAdmin(), /organization already exists/);

  const adminFirst = await login("OWNER-TEST", initialAdmin);
  assert.equal(adminFirst.body.data.next, "CHANGE_PASSWORD");
  assert.equal((await change(adminFirst.body.data.challengeToken, initialAdmin, permanentAdmin)).status, 200);
  assert.equal((await login("owner-test", initialAdmin)).status, 401);

  const adminSignedIn = await login("owner-test", permanentAdmin);
  assert.equal(adminSignedIn.body.data.next, "SIGNED_IN");
  const adminAccess = adminSignedIn.body.data.accessToken as string;
  const adminCookie = cookie(adminSignedIn);
  // The obsolete MFA API no longer exists and cannot enroll an authenticator.
  for(const action of ["setup","verify","confirm"]){
    assert.equal((await request(app).post("/api/v1/auth/mfa/"+action).send({challengeToken:"legacy",code:"123456"})).status,404);
  }
  const profile = await request(app).get("/api/v1/me").set("Authorization", authHeader(adminAccess));
  assert.equal(profile.status, 200);
  assert.ok(profile.body.data.roles.includes("SUPER_ADMIN"));
  assert.ok(profile.body.data.permissions.includes("users.create"));
  assert.equal((await request(app).get("/api/v1/users")).status, 401);

  const created = await request(app).post("/api/v1/users").set("Authorization", authHeader(adminAccess)).send({
    loginId: "staff-test", displayName: "Test Staff", temporaryPassword: initialEmployee, role: "EMPLOYEE",
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "INVITED");
  assert.equal(created.body.data.passwordHash, undefined);
  const staffId = created.body.data.id as string;

  const staffFirst = await login("staff-test", initialEmployee);
  assert.equal(staffFirst.body.data.next, "CHANGE_PASSWORD");
  assert.equal((await change(staffFirst.body.data.challengeToken, initialEmployee, permanentEmployee)).status, 200);
  const staff = await login("staff-test", permanentEmployee);
  assert.equal(staff.body.data.next, "SIGNED_IN");
  const staffAccess = staff.body.data.accessToken as string;
  const staffCookie = cookie(staff);
  assert.equal((await request(app).get("/api/v1/users").set("Authorization", authHeader(staffAccess))).status, 403);
  assert.equal((await request(app).post("/api/v1/users").set("Authorization", authHeader(staffAccess)).send({
    loginId: "elevate-test", displayName: "Unauthorized", temporaryPassword: password(), role: "ADMIN",
  })).status, 403);
  assert.equal((await request(app).post("/api/v1/auth/refresh").set("Origin", "https://other.example").set("Cookie", staffCookie)).status, 403);
  const refreshed = await request(app).post("/api/v1/auth/refresh").set("Origin", "http://localhost:3000").set("Cookie", staffCookie);
  assert.equal(refreshed.status, 200);
  const rotatedCookie = cookie(refreshed);
  assert.equal((await request(app).post("/api/v1/auth/refresh").set("Origin", "http://localhost:3000").set("Cookie", staffCookie)).status, 401);
  assert.equal((await request(app).post("/api/v1/auth/refresh").set("Origin", "http://localhost:3000").set("Cookie", rotatedCookie)).status, 401);

  const newStaffLogin = await login("staff-test", permanentEmployee);
  assert.equal(newStaffLogin.status, 200);
  const reset = await request(app).post("/api/v1/users/" + staffId + "/reset-password")
    .set("Authorization", authHeader(adminAccess)).send({ temporaryPassword: password() });
  assert.equal(reset.status, 200);
  assert.equal((await request(app).get("/api/v1/me").set("Authorization", authHeader(newStaffLogin.body.data.accessToken))).status, 401);

  const roleChanged = await request(app).put("/api/v1/users/" + staffId + "/role")
    .set("Authorization", authHeader(adminAccess)).send({ role: "FOUNDER" });
  assert.equal(roleChanged.status, 200);
  const disabled = await request(app).post("/api/v1/users/" + staffId + "/disable")
    .set("Authorization", authHeader(adminAccess));
  assert.equal(disabled.status, 200);
  assert.equal((await request(app).get("/api/v1/users").set("Authorization", authHeader(adminAccess))).status, 200);

  const nextAdmin = await login("owner-test", permanentAdmin);
  assert.equal(nextAdmin.body.data.next, "SIGNED_IN");
  assert.ok(cookie(nextAdmin));
  assert.ok(adminCookie);
  console.info("Module 3 auth integration PASS: bootstrap, password change, password-only administrator login, JWT, RBAC, staff provisioning, refresh replay and revocation.");
} finally {
  await db.$disconnect();
}
