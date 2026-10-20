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
  test.setTimeout(420_000); // End-to-end isolated CI covers login, finance, Notes and six viewport widths.
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

  // Phase 7: notes persist as private server records, including handwritten strokes.
  await page.goto("/app/notes");
  await expect(page.getByRole("heading", { name: "My notes" })).toBeVisible();
  await expect(page.locator(".aw-workspace")).toHaveAttribute("data-restyled", "true");
  await page.getByRole("button", { name: "New note" }).click();
  await page.getByRole("textbox", { name: "Note title" }).fill("CI note for design review");
  await page.getByRole("textbox", { name: "Typed notes" }).fill("## Brief\\n**Approve** the violet layout.");
  const noteCanvas=page.locator("canvas.aw-notes-canvas");
  await expect(noteCanvas).toBeVisible();
  const bounds=await noteCanvas.boundingBox();
  if(!bounds)throw new Error("Note canvas did not render");
  await page.mouse.move(bounds.x+bounds.width*.2,bounds.y+bounds.height*.2);
  await page.mouse.down();
  await page.mouse.move(bounds.x+bounds.width*.3,bounds.y+bounds.height*.35,{steps:6});
  await page.mouse.up();
  await expect(page.getByText("All changes saved")).toBeVisible({timeout:20000});
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Note title" })).toHaveValue("CI note for design review");
  await expect(page.getByRole("textbox", { name: "Typed notes" })).toHaveValue(/Approve/);
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByText("Approve", {exact:false}).first()).toBeVisible();
  await page.getByRole("button", { name: "Write" }).click();
  page.once("dialog", dialog=>void dialog.accept());
  await page.getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("No saved notes. Create one to begin.")).toBeVisible();
  // Phase 8: small/mobile/tablet/desktop overflow and functional navigation gates.
  for(const width of [320,375,390,768,1024,1440]){
    await page.setViewportSize({width,height:850});
    for(const route of ["notes","finance","billing","settings"]){
      await page.goto("/app/"+route);
      await expect(page.locator(".aw-workspace")).toHaveAttribute("data-restyled","true");
      const sizes=await page.evaluate(()=>({
        content:document.documentElement.scrollWidth,
        viewport:document.documentElement.clientWidth,
      }));
      expect(sizes.content,"No page overflow for "+route+" at "+width+"px").toBeLessThanOrEqual(sizes.viewport+1);
    }
  }
  await page.setViewportSize({width:1280,height:800});
  await page.goto("/app/dashboard");
  await expect(page.getByTestId("amplifyworld-dashboard")).toBeVisible();


  // Dashboard action-center regression uses scoped, read-only API fixtures.
  await expect(page.getByTestId("dashboard-action-center")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pending tasks" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Past deadline" })).toBeVisible();
  const mockTasks = "**/api/v1/tasks?*";
  const mockProjects = "**/api/v1/projects?*";
  await page.route(mockTasks, route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { items: [
      { id: "00000000-0000-4000-8000-000000000041", title: "Urgent overdue design", status: "IN_PROGRESS", priority: "URGENT",
        dueAt: "2001-01-01T08:00:00.000Z", project: {name:"Example project"} },
      { id: "00000000-0000-4000-8000-000000000042", title: "Upcoming marketing plan", status: "TODO", priority: "MEDIUM",
        dueAt: "2099-01-01T08:00:00.000Z", project: null },
      { id: "00000000-0000-4000-8000-000000000043", title: "Finished old task", status: "DONE", priority: "LOW",
        dueAt: "2000-01-01T08:00:00.000Z", project: null }
    ], nextCursor: null } }) }));
  await page.route(mockProjects, route => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ data: { items: [
      { id: "00000000-0000-4000-8000-000000000044", name: "Delayed example project", status: "ACTIVE",
        dueOn: "2000-02-02T00:00:00.000Z", client: {businessName:"Test client"} }
    ], nextCursor: null } }) }));
  await expect(page.getByRole("button", { name: "Refresh priorities" })).toBeEnabled();
  await page.getByRole("button", { name: "Refresh priorities" }).click();
  await expect(page.getByTestId("pending-task-count")).toHaveText("2");
  await expect(page.getByTestId("overdue-item-count")).toHaveText("2");
  await expect(page.getByText("Urgent overdue design").first()).toBeVisible();
  await expect(page.getByText("Delayed example project")).toBeVisible();
  await expect(page.getByLabel("Task number 1")).toBeVisible();
  await expect(page.locator(".aw-action-number").first()).toHaveCSS("color", "rgb(255, 192, 138)");
  await page.unroute(mockTasks);
  await page.unroute(mockProjects);


  // Phase 4: the overview is driven by the signed-in user's real permissions.
  await expect(page.getByTestId("amplifyworld-dashboard")).toBeVisible();
  await expect(page.getByTestId("dashboard-kpis")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent workspace records" })).toBeVisible();
  await page.getByRole("textbox", { name: "Search recent records" }).fill("does-not-exist-in-ci");
  await expect(page.getByText("No matching records")).toBeVisible();
  await page.getByRole("textbox", { name: "Search recent records" }).fill("");
  await page.getByRole("combobox", { name: "Filter by type" }).selectOption("Clients");
  await page.getByRole("combobox", { name: "Filter by type" }).selectOption("all");
  await expect(page.getByRole("button", { name: "Refresh overview" })).toBeVisible();

  // Phase 3: shell controls must remain usable without altering any API state.
  await expect(page.getByRole("button", { name: "Collapse sidebar" })).toBeVisible();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator(".aw-workspace")).toHaveAttribute("data-collapsed", "true");
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.locator(".aw-workspace")).toHaveAttribute("data-collapsed", "false");
  await expect(page.getByRole("link", { name: "Search workspace" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Workspace mobile navigation" });
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole("link", { name: "Leads CRM" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Open menu" })).toBeFocused();
  await page.getByRole("button", { name: "Open menu" }).click();
  await drawer.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Overview", exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page).toHaveURL(/\/app\/dashboard/);
  const mobileWidth = await page.evaluate(() => ({
    full: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth
  }));
  expect(mobileWidth.full).toBeLessThanOrEqual(mobileWidth.viewport + 1);

  // Phase 5 mobile check: retain every live module and route while changing only presentation.
  for (const route of ["leads", "clients", "projects", "tasks", "content", "approvals"]) {
    await page.goto("/app/" + route);
    await expect(page.locator('[data-aw-module="' + route + '"]')).toBeVisible();
    await expect(page.locator(".aw-workspace")).toHaveAttribute("data-workstream", "true");
    const dimensions = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth
    }));
    expect(dimensions.documentWidth, "No horizontal overflow in " + route + " at 375px").toBeLessThanOrEqual(dimensions.viewportWidth + 1);
    if (route === "content") {
      await expect(page.locator(".aw-mobile-agenda")).toBeVisible();
      await expect(page.locator(".aw-calendar-grid")).toBeHidden();
      await page.getByRole("button", { name: "List", exact: true }).click();
      await expect(page.locator(".aw-mobile-agenda")).toBeHidden();
      await page.getByRole("button", { name: "Month", exact: true }).click();
      await expect(page.locator(".aw-mobile-agenda")).toBeVisible();
    }
  }
  await page.goto("/app/dashboard");
  await expect(page.getByTestId("amplifyworld-dashboard")).toBeVisible();

  await page.setViewportSize({ width: 1280, height: 720 });

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
  await page.getByLabel("Stage", { exact: true }).selectOption("CONTACTED");
  await page.getByRole("button", { name: "Save details and stage" }).click();
  await expect(page.getByText("Lead updated and activity recorded.")).toBeVisible();
  await page.getByLabel("Activity note").fill("Followed up about digital campaigns.");
  await page.getByRole("button", { name: "Add note" }).click();
  await expect(page.getByText("Followed up about digital campaigns.")).toBeVisible();
  // Note input is cleared after saving, so its submit button stays disabled by design.
  // Wait for the shared in-flight operation to finish before editing the lead stage.
  await expect(page.getByRole("button", { name: "Save details and stage" })).toBeEnabled();
  await page.getByLabel("Stage", { exact: true }).selectOption("WON");
  await expect(page.getByLabel("Stage", { exact: true })).toHaveValue("WON");
  const wonUpdate = page.waitForResponse(response =>
    response.url().includes("/api/v1/leads/") &&
    response.request().method() === "PUT" &&
    response.status() === 200,
  );
  await page.getByRole("button", { name: "Save details and stage" }).click();
  const wonResponse = await wonUpdate;
  const wonPayload = await wonResponse.json() as { data: { status: string } };
  expect(wonPayload.data.status).toBe("WON");
  await expect(page.getByRole("button", { name: "Convert to client" })).toBeVisible();
  await page.getByRole("button", { name: "Convert to client" }).click();
  await expect(page.getByText("Won lead converted into a client.")).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Clients" }).click();
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Cafe Demo Lead/ }).first().click();
  await expect(page.getByRole("heading", { name: "Client: Cafe Demo Lead" })).toBeVisible();
  await page.getByLabel("Service name").fill("Social Media Management");
  await page.getByRole("button", { name: "Add service" }).click();
  await expect(page.getByText("Service added to client.")).toBeVisible();
  await page.getByLabel("Contact name").fill("Agency Contact");
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page.getByText("Client contact saved.")).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Files & assets" }).click();
  await expect(page.getByRole("heading", { name: "Files & assets" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Secure upload" })).toBeVisible();
  await page.getByRole("navigation", { name: "Workspace navigation" }).getByRole("link", { name: "Leads CRM" }).click();
  await expect(page.getByRole("heading", { name: "Leads CRM" })).toBeVisible();
  await page.locator("#new-businessName").fill("Cafe Demo Lead Other");
  await page.locator("#new-phone").fill("98765 43210");
  const createdDuplicateLead=page.waitForResponse(response =>
    response.url().endsWith("/api/v1/leads") && response.request().method()==="POST" && response.status()===201);
  await page.getByRole("button", { name: "Create lead" }).click();
  await createdDuplicateLead;
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
  await expect(page.getByRole("link", { name: "Files & assets" })).toHaveCount(0);
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
  await page.getByLabel("Stage", { exact: true }).selectOption("QUALIFIED");
  await page.getByRole("button", { name: "Save details and stage" }).click();
  await expect(page.getByText("Lead updated and activity recorded.")).toBeVisible();
  await page.goto("/app/team/users");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await page.getByRole("link", { name: "My account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My profile" })).toBeVisible();
});

test("login proxy rejects requests from an unrelated browser origin", async ({ request }) => {
  const response = await request.post("/api/v1/auth/login", {
    headers: { origin: "https://untrusted-origin.invalid" },
    data: { loginId: "not-a-user", password: "not-a-real-password" },
  });
  expect(response.status()).toBe(403);
  const payload = await response.json() as { error: { code: string } };
  expect(payload.error.code).toBe("ORIGIN_DENIED");
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
