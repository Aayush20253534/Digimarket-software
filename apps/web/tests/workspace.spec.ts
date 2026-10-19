import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";

const INITIAL = process.env.E2E_ADMIN_INITIAL_PASSWORD ?? "";
const UPDATED = process.env.E2E_ADMIN_UPDATED_PASSWORD ?? "";
if (!INITIAL || !UPDATED) throw new Error("Missing CI-only administrator test credentials");

function decodeBase32(value: string) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let acc = 0, bits = 0;
  const out: number[] = [];
  for (const ch of value.replace(/\s|=/g, "").toUpperCase()) {
    const index = chars.indexOf(ch);
    if (index < 0) throw new Error("Bad base32");
    acc = (acc << 5) | index;
    bits += 5;
    if (bits >= 8) { out.push((acc >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}
function otp(secret: string, now = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

test("login, first password change, MFA, admin user management and employee permission boundary", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.getByLabel("Login ID").fill("admin-e2e");
  await page.getByLabel("Password", { exact: true }).fill(INITIAL);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set your new password" })).toBeVisible();
  await page.getByLabel("New password").fill(UPDATED);
  await page.getByRole("button", { name: "Change password" }).click();
  await expect(page.getByText("Password changed. Sign in using your new password.")).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(UPDATED);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Enable two-factor security" })).toBeVisible();
  await page.getByRole("button", { name: "Generate authenticator setup" }).click();
  const secret = await page.getByTestId("mfa-secret").innerText();
  await page.getByLabel("Six-digit authenticator code").fill(otp(secret));
  await page.getByRole("button", { name: "Enable MFA and sign in" }).click();

  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome,/ })).toBeVisible();
  await expect(page.getByText("Authenticated", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Team & accounts" }).click();
  await expect(page.getByRole("heading", { name: "People & accounts" })).toBeVisible();
  await page.getByRole("button", { name: "New account" }).click();
  await page.getByLabel("Display name").fill("Demo CI Employee");
  await page.getByLabel("Login ID", { exact: true }).fill("ci-employee");
  const generatedPassword = await page.getByLabel("Temporary password").inputValue();
  expect(generatedPassword.length).toBeGreaterThanOrEqual(12);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Demo CI Employee")).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Login ID").fill("ci-employee");
  await page.getByLabel("Password", { exact: true }).fill(generatedPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set your new password" })).toBeVisible();
  const employeePermanent = "Secure-Employee-Permanent-2026!";
  await page.getByLabel("New password").fill(employeePermanent);
  await page.getByRole("button", { name: "Change password" }).click();
  await page.getByLabel("Password", { exact: true }).fill(employeePermanent);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  await expect(page.getByRole("link", { name: "Team & accounts" })).toHaveCount(0);
  await page.goto("/app/team/users");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.getByRole("link", { name: "My account" }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
});

test("signed-out visitors cannot read the dashboard", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await context.close();
});
