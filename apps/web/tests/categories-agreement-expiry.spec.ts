import { expect, test, type Page } from "@playwright/test";
const clientId = "00000000-0000-4000-8000-000000000050";
async function workspace(page: Page, editable = true) {
  const calls: {
    path: string;
    method: string;
    query: URLSearchParams;
    body: Record<string, unknown> | null;
  }[] = [];
  const categories = [
    { id: "income", kind: "INCOME", name: "Service fees", active: true, purpose: "GENERAL" },
    { id: "expense", kind: "EXPENSE", name: "Travel", active: true, purpose: "GENERAL" },
  ];
  const client = {
    id: clientId,
    businessName: "Example Cafe",
    businessType: "Cafe",
    phone: "9000000000",
    email: null,
    location: "Prayagraj",
    notes: null,
    contractStartOn: "2026-10-22",
    contractEndOn: "2026-12-21",
    monthlyFee: "15000",
    monthlyAdBudget: "3000",
    status: "ACTIVE",
    version: 1,
    agreementExpired: false,
    agreementEndedOn: null as string | null,
    agreementEndReason: null as string | null,
    contacts: [],
    services: [],
    sourceLead: null,
    sourceLeadId: null,
    _count: { services: 0, contacts: 0 },
  };
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.slice(7),
      q = url.searchParams;
    const body = req.postData() ? req.postDataJSON() : null;
    calls.push({ path, method: req.method(), query: q, body });
    let data: unknown = [];
    if (path === "/auth/refresh")
      data = {
        next: "SIGNED_IN",
        accessToken: "test",
        user: {
          id: "user",
          organizationId: "org",
          loginId: "test",
          displayName: "Test User",
          status: "ACTIVE",
          mustChangePassword: false,
        },
      };
    else if (path === "/me")
      data = {
        userId: "user",
        organizationId: "org",
        roles: [editable ? "ADMIN" : "EMPLOYEE"],
        permissions: [
          "clients.read",
          "finance.entry.read.own",
          ...(editable ? ["clients.edit", "finance.read.all", "finance.category.manage"] : []),
        ],
      };
    else if (path === "/notifications") data = { items: [], unreadCount: 0 };
    else if (path === "/notifications/push-key") data = { publicKey: null };
    else if (path === "/messages/users") data = { items: [] };
    else if (path === "/finance/categories") {
      if (req.method() === "POST")
        categories.push({ ...body, id: String(categories.length), active: true });
      data = categories;
    } else if (path === "/clients/" + clientId + "/end-agreement") {
      Object.assign(client, {
        status: "EXPIRED",
        agreementExpired: true,
        agreementEndedOn: body.endedOn,
        agreementEndReason: body.reason,
        version: 2,
      });
      data = client;
    } else if (path === "/clients/" + clientId) data = client;
    else if (path === "/clients")
      data = {
        items: (q.get("section") === "expired") === client.agreementExpired ? [client] : [],
        nextCursor: null,
      };
    else if (path === "/finance/summary")
      data = {
        currency: "INR",
        postedIncome: "5000",
        postedExpense: "0",
        postedNet: "5000",
        pendingIncome: "0",
        pendingExpense: "0",
        groups: [],
        recurringIncome: {
          month: "2026-10",
          monthlyServiceTotal: client.agreementExpired ? "0" : "15000",
          monthlyAdBudgetTotal: client.agreementExpired ? "0" : "3000",
          monthlyCombinedTotal: client.agreementExpired ? "0" : "18000",
          items: client.agreementExpired
            ? []
            : [
                {
                  id: clientId,
                  businessName: client.businessName,
                  monthlyServiceCharge: "15000",
                  monthlyAdBudget: "3000",
                  monthlyCombined: "18000",
                  contractEndOn: client.contractEndOn,
                },
              ],
        },
      };
    await route.fulfill({ json: { data } });
  });
  return { calls, client };
}

test("category cards separate income and expenses and fix the type when creating", async ({
  page,
}) => {
  const { calls } = await workspace(page);
  await page.goto("/app/finance/categories");
  const directory = page.getByRole("navigation", { name: "Category types" });
  await expect(directory.getByRole("link")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Add category", exact: true })).toHaveCount(0);
  await directory.getByRole("link", { name: /Income categories/ }).click();
  await expect(page.getByRole("heading", { name: "Income categories", exact: true })).toBeVisible();
  const list = page.getByRole("region", { name: "Financial categories", exact: true });
  await expect(list.getByText("Service fees", { exact: true })).toBeVisible();
  await expect(list.getByText("Travel", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Category purpose")).toHaveCount(0);
  await page.getByLabel("Category name", { exact: true }).fill("Retainer");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(list.getByText("Retainer", { exact: true })).toBeVisible();
  expect(calls.find((c) => c.path === "/finance/categories" && c.method === "POST")?.body).toEqual({
    kind: "INCOME",
    name: "Retainer",
    purpose: "GENERAL",
  });
  await page
    .getByRole("navigation", { name: "Category management" })
    .getByRole("link", { name: "Expense categories", exact: true })
    .click();
  await expect(list.getByText("Travel", { exact: true })).toBeVisible();
  await expect(list.getByText("Retainer", { exact: true })).toHaveCount(0);
  await page.getByLabel("Category name", { exact: true }).fill("Client advertising");
  await page.getByLabel("Category purpose").selectOption("META_ADS");
  await page.getByRole("button", { name: "Add category", exact: true }).click();
  await expect(list.getByText("Client advertising", { exact: true })).toBeVisible();
  expect(
    calls.filter((c) => c.path === "/finance/categories" && c.method === "POST").at(-1)?.body,
  ).toEqual({ kind: "EXPENSE", name: "Client advertising", purpose: "META_ADS" });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);
});

test("ending an agreement moves the client to Expired and removes the projection", async ({
  page,
}) => {
  const { calls, client } = await workspace(page);
  await page.goto("/app/clients");
  await page.getByRole("link", { name: "Open workspace", exact: false }).click();
  await page.getByRole("tab", { name: "Agreement", exact: true }).click();
  await page.getByRole("button", { name: "End agreement early", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "End agreement early" });
  await expect(dialog.getByLabel("Actual end date")).toHaveAttribute("max", "2026-11-17");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(calls.some((c) => c.path.endsWith("/end-agreement"))).toBe(false);
  await page.getByRole("button", { name: "End agreement early", exact: true }).click();
  await dialog.getByLabel("Actual end date").fill("2026-11-15");
  await dialog.getByLabel("Reason for ending").fill("Client ended the service early");
  await dialog.getByRole("button", { name: "Confirm end agreement", exact: true }).click();
  await expect(
    page.getByText("Agreement ended. Client moved to Expired and removed from projected income.", {
      exact: true,
    }),
  ).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/end-agreement"))?.body).toEqual({
    version: 1,
    endedOn: "2026-11-15",
    reason: "Client ended the service early",
  });
  await expect(page.getByLabel("Agreement end", { exact: true })).toHaveValue("2026-12-21");
  await expect(page.getByRole("button", { name: "End agreement early", exact: true })).toHaveCount(
    0,
  );
  await page.getByRole("link", { name: "View expired agreements", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Past Clients", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("table", { name: "Clients directory" })).toContainText(
    client.businessName,
  );
  await expect(page.getByRole("table", { name: "Clients directory" })).toContainText("2026-11-15");
  expect(calls.some((c) => c.path === "/clients" && c.query.get("section") === "expired")).toBe(
    true,
  );
  await page
    .getByRole("navigation", { name: "Client sections" })
    .getByRole("link", { name: "Clients", exact: true })
    .click();
  await expect(
    page.getByRole("table", { name: "Clients directory" }).getByText(client.businessName),
  ).toHaveCount(0);
  await page.goto("/app/finance/agreements?from=2026-10-22&to=2026-11-21&view=all");
  await expect(
    page.getByRole("heading", { name: "Recurring income from client agreements", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(client.businessName, { exact: true })).toHaveCount(0);
});

test("read-only client access does not expose agreement termination", async ({ page }) => {
  await workspace(page, false);
  await page.goto("/app/clients/" + clientId);
  await page.getByRole("tab", { name: "Agreement", exact: true }).click();
  await expect(page.getByRole("button", { name: "End agreement early", exact: true })).toHaveCount(
    0,
  );
});

test("cycle-state completion cannot rewrite the category navigation URL",async({page})=>{
  await workspace(page);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  let requested!:()=>void;
  const started=new Promise<void>(resolve=>{requested=resolve;});
  let first=true;
  await page.route("**/api/v1/finance/cycle-state",async route=>{
    if(first){first=false;requested();await gate;}
    await route.fulfill({json:{data:{current:{from:"2026-10-22",to:"2026-11-21"},history:[],closePeriod:{from:"2026-10-22",to:"2026-11-21"},canClose:false,plannedThrough:"2026-11-21"}}}).catch(()=>{});
  });
  try{
    await page.goto("/app/finance/categories");
    await started;
    const link=page.getByRole("navigation",{name:"Category types"}).getByRole("link",{name:/Expense categories/});
    await expect(link).toContainText("1 active · 0 inactive");
    const href=await link.getAttribute("href");
    await link.click();
    await expect(page.getByRole("heading",{name:"Expense categories",exact:true})).toBeVisible();
    release();
    await expect(page.getByRole("region",{name:"Financial categories"}).getByText("Travel",{exact:true})).toBeVisible();
    await expect(page.getByRole("button",{name:"Add category",exact:true})).toBeVisible();
    expect(new URL(page.url()).pathname+new URL(page.url()).search).toBe(href);
    await page.getByLabel("Category name",{exact:true}).fill("Late-cycle regression");
    await page.getByRole("button",{name:"Add category",exact:true}).click();
    await expect(page.getByRole("region",{name:"Financial categories"}).getByText("Late-cycle regression",{exact:true})).toBeVisible();
  }finally{release();}
});
