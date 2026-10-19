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
  page.on("pageerror", (error) => console.log("PAGE ERROR:", error.name, error.message.slice(0, 300)));
  page.on("response", (response) => {
    if (response.url().includes("/api/v1/")) console.log("API RESULT", new URL(response.url()).pathname, response.status());
  });
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in to your workspace" })).toBeVisible();
  await page.getByLabel("Login ID").fill("admin-e2e");
  await page.getByLabel("Password", { exact: true }).fill(INITIAL);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Set your new password" })).toBeVisible().catch(async (error) => {
    console.log("LOGIN SCREEN HEADINGS:", await page.locator("h2").allTextContents());
    console.log("LOGIN ALERTS:", await page.locator('[role="alert"]').allTextContents());
    throw error;
  });
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
  await page.getByRole("link", { name: "Approvals" }).first().click();
  await expect(page.getByRole("heading", { name: "Approval workflows" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approval policy configuration" })).toBeVisible();
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByText("Routing policy saved.")).toBeVisible();
  await page.getByLabel("Title").fill("Office purchase request");
  await page.getByLabel("Description").fill("New standing desk for agency operations");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("heading", { name: "Office purchase request" })).toBeVisible();
  page.once("dialog", async (dialog) => { await dialog.accept(); });
  await page.getByRole("button", { name: "Cancel request" }).click();
  await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
  await page.getByLabel("Category", { exact: true }).last().selectOption("FINANCE");
  await page.getByRole("button", { name: "Save policy" }).click();
  await expect(page.getByText("Routing policy saved.")).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Income & expenses" }).click();
  await expect(page.getByRole("heading", { name: "Income & expenses" })).toBeVisible();
  await page.getByLabel("Category name").fill("Rapido");
  await page.getByRole("button", { name: "Add category" }).click();
  await expect(page.getByText("Category created for the whole agency.")).toBeVisible();
  await page.getByLabel("Type", { exact: true }).last().selectOption("INCOME");
  await page.getByLabel("Category name").fill("Client retainer");
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Amount (INR)").fill("150.2545");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Entry submitted for finance approval.")).toBeVisible();
  await expect(page.getByRole("cell", { name: "₹150.2545" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Leads CRM" }).click();
  await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
  await page.getByLabel("Business name", { exact: true }).fill("Cafe Demo Lead");
  await page.getByLabel("Phone", { exact: true }).fill("9876543210");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead: Cafe Demo Lead" })).toBeVisible();
  await page.getByLabel("Stage").selectOption("CONTACTED");
  await page.getByRole("button", { name: "Save details and stage" }).click();
  await expect(page.getByText("Lead updated and activity recorded.")).toBeVisible();
  await page.getByLabel("Activity note").fill("Followed up about digital campaigns.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Followed up about digital campaigns.")).toBeVisible();
  await page.getByLabel("Business name", { exact: true }).fill("Cafe Demo Lead Other");
  await page.getByLabel("Phone", { exact: true }).fill("98765 43210");
  await page.getByRole("button", { name: "Create lead" }).click();
  await page.getByRole("button", { name: "Load suspected duplicates" }).click();
  await expect(page.getByText("PHONE_MATCH")).toBeVisible();
  await page.getByRole("button", { name: "Confirm match" }).click();
  await expect(page.getByText("Duplicate signal reviewed.")).toBeVisible();
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
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Income & expenses" }).click();
  await expect(page.getByRole("heading", { name: "Income & expenses" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Agency totals" })).toHaveCount(0);
  await expect(page.getByLabel("Category name")).toHaveCount(0);
  await page.getByLabel("Entry type").selectOption("INCOME");
  await page.getByLabel("Amount (INR)").fill("1000.00");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expect(page.getByText("Entry submitted for finance approval.")).toBeVisible();
  await page.getByRole("link", { name: "Approvals" }).first().click();
  await expect(page.getByRole("heading", { name: "Approval workflows" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Approval policy configuration" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Decision queue" })).toHaveCount(0);
  await page.getByLabel("Title").fill("Employee reimbursement request");
  await page.getByLabel("Description").fill("Transport refund awaiting leadership approval");
  await page.getByRole("button", { name: "Submit request" }).click();
  await expect(page.getByRole("heading", { name: "Employee reimbursement request" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Leads CRM" }).click();
  await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Potential duplicates" })).toHaveCount(0);
  await page.getByLabel("Business name", { exact: true }).fill("Employee Prospect");
  await page.getByRole("button", { name: "Create lead" }).click();
  await expect(page.getByRole("heading", { name: "Lead: Employee Prospect" })).toBeVisible();
  await page.getByLabel("Stage").selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Save details and stage" }).click();
  await expect(page.getByText("Lead updated and activity recorded.")).toBeVisible();
  await page.goto("/app/team/users");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
});

test("signed-out visitors cannot read the dashboard", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => console.log("UNAUTH PAGE ERROR:", error.name, error.message.slice(0, 300)));
  page.on("response", (response) => { if (response.url().includes("/api/v1/")) console.log("UNAUTH API", new URL(response.url()).pathname, response.status()); });
  await page.goto("/app/dashboard");
  await expect(page).toHaveURL(/\/login/).catch(async (error) => {
    console.log("UNAUTH PAGE BODY:", (await page.locator("body").innerText()).slice(0, 480));
    throw error;
  });
  await context.close();
});
