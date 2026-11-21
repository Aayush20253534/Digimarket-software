import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page, role = "FOUNDER", closed=false) {
  let updated=false;
  const calls: { path: string; query: URLSearchParams; method: string; body?: Record<string,unknown> }[] = [];
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.slice(7),
      q = url.searchParams;
    calls.push({ path, query: q, method: route.request().method(),
      body: route.request().postDataJSON() ?? undefined });
    const all = q.get("view") === "all";
    const summary = {
      postedIncome: all ? "300" : "100",
      postedTotalExpense: all ? "316" : "176",
      netOperatingMoney: all ? "-16" : "-76",
      breakdown: {
        OTHER: all ? "46" : "16",
        SELF_ADS: all ? "20" : "10",
        CLIENT_ADS: all ? "150" : "100",
        SALARY: all ? "100" : "50",
      },
    };
    let data: unknown = [];
    if (path === "/auth/refresh")
      data = {
        next: "SIGNED_IN",
        accessToken: "test",
        user: {
          id: "founder",
          organizationId: "org",
          loginId: "test",
          displayName: "Test Founder",
          status: "ACTIVE",
          mustChangePassword: false,
        },
      };
    else if (path === "/me")
      data = {
        userId: "founder",
        organizationId: "org",
        roles: [role],
        permissions: [
          "finance.entry.read.own",
          ...(["FOUNDER", "SUPER_ADMIN"].includes(role) ? ["finance.read.all", "finance.category.manage"] : []),
        ],
      };
    else if (path === "/notifications") data = { items: [], unreadCount: 0 };
    else if (path === "/notifications/push-key") data = { publicKey: null };
    else if (path === "/messages/users") data = { items: [] };
    else if (path === "/finance/summary")
      data = {
        postedIncome: summary.postedIncome,
        postedExpense: all ? "66" : "26",
        postedSalaryExpense: summary.breakdown.SALARY,
        postedExpenseIncludingSalary: all ? "166" : "76",
        agencyOperatingNet: all ? "134" : "24",
        pendingIncome: "0",
        pendingExpense: "0",
      };
    else if (path === "/finance/category-summary")
      data = {
        kind: "EXPENSE",
        ordinary: all ? "66" : "26",
        total: all ? "66" : "26",
        items: [
          {
            id: "travel",
            name: "Travel",
            posted: all ? "66" : "26",
            pending: "0",
            count: 1,
            active: true,
          },
        ],
      };
    else if (path === "/finance/categories") data = [
      {id:"travel",name:"Travel",kind:"EXPENSE",purpose:"GENERAL",active:true},
      {id:"meta",name:"Meta Ads",kind:"EXPENSE",purpose:"META_ADS",active:true},
    ];
    else if (path === "/finance/assignees") data = [
      {id:"founder",displayName:"Test Founder",loginId:"founder"},
      {id:"dev",displayName:"Dev Raj",loginId:"dev"},
    ];
    else if (path === "/finance/meta-ad-clients") data = [
      {id:"cafe",businessName:"Test Cafe"},
    ];
    else if (path === "/finance/cycle-state") data = closed ? {current:{from:"2026-11-22",to:"2026-12-21"},history:[{from:"2026-10-22",to:"2026-11-21",closedAt:"2026-11-22"}],plannedThrough:"2026-12-21",canClose:false} : {current:{from:"2026-10-22",to:"2026-11-21"},history:[],plannedThrough:"2026-11-21",canClose:false};
    else if (path === "/finance/entries/expense-0/edit") data = {id:"expense-0",categoryId:"travel",enteredById:"founder",clientId:null,amount:"1.0000",occurredOn:"2026-11-15",method:"UPI",merchantOrSource:"",description:"Journey 0"};
    else if (path === "/finance/entries/expense-0" && route.request().method()==="PUT") {updated=true;data={id:"expense-0"};}
    else if (path === "/finance/cycle-balance") data = {opening:"0",movement:"0",remaining:"0"};
    else if (path === "/finance/register") data = {
      items: [{
        id:"expense-0",kind:"EXPENSE",status:"POSTED",category:{id:"travel",name:"Travel"},enteredBy:{displayName:updated?"Dev Raj":"Test Founder"},enteredById:"founder",clientId:null,
        amount:"0.5000",occurredOn:"2026-11-15",method:"UPI",
        merchantOrSource:"",description:"Journey 0",
      }], total:1, page:1, limit:100,
    };
    else if (path === "/finance/total-expenses/summary") data = summary;
    else if (path === "/finance/total-expenses") {
      const rows = [
        ...Array.from({ length: all ? 46 : 32 }, (_, i) => ({
          id: "finance:expense-" + i,
          type: "OTHER",
          category: "Travel",
          amount: updated&&i===0 ? "25" : all ? "1" : "0.50",
          description: "Journey " + i,
          person: updated&&i===0 ? "Dev Raj" : "Test Founder",
          client: "",
        })),
        {
          id: "finance:self-ad",
          type: "SELF_ADS",
          category: "Meta Ads",
          amount: summary.breakdown.SELF_ADS,
          description: "Agency campaign",
          person: "Test Founder",
          client: "",
        },
        {
          id: "finance:client-ad",
          type: "CLIENT_ADS",
          category: "Meta Ads",
          amount: summary.breakdown.CLIENT_ADS,
          description: "Cafe campaign",
          person: "Test Founder",
          client: "Test Cafe",
        },
        {
          id: "salary:salary",
          type: "SALARY",
          category: "Salary",
          amount: summary.breakdown.SALARY,
          description: "Salary funded",
          person: "Test recipient",
          client: "",
        },
      ].filter(
        (r) =>
          (!q.get("type") || q.get("type") === "ALL" || r.type === q.get("type")) &&
          (!q.get("q") ||
            (r.description + " " + r.client).toLowerCase().includes(q.get("q")!.toLowerCase())),
      );
      const page = Number(q.get("page") ?? 1);
      data = {
        summary,
        items: rows
          .slice((page - 1) * 25, page * 25)
          .map((r) => ({ ...r, date: "2026-11-15", reversal: false })),
        total: rows.length,
        matchingAmount: String(rows.reduce((sum, r) => sum + Number(r.amount), 0)),
        page,
        limit: 25,
      };
    } else if (path === "/finance/total-expenses/export")
      data = { filename: "total-expense.csv", csv: "Type,Amount\r\nCLIENT_ADS,100" };
    await route.fulfill({ json: { data } });
  });
  return calls;
}

test("Total expense includes every type and drives the negative operating-money headline", async ({
  page,
}) => {
  const calls = await workspace(page);
  const cycle = "from=2026-10-22&to=2026-11-21&view=mine";
  await page.goto("/app/finance?" + cycle);
  const cards = page.getByRole("navigation", { name: "Finance categories" });
  await expect(cards.getByRole("link", { name: /^Expenses / })).toContainText("₹26.00");
  await expect(cards.getByRole("link", { name: /^Salaries / })).toContainText("₹50.00");
  await cards.getByRole("link", { name: /^Expenses / }).click();
  await expect(page.getByLabel("Category totals")).toContainText("₹26.00");
  await expect(page.getByLabel("Category totals")).not.toContainText("₹50.00");
  await expect(page.getByText("Salaries", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Total expenses including salary", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "← Finance overview", exact: true }).click();
  const totalCard = cards.getByRole("link", { name: /^Total expense / });
  await expect(totalCard).toContainText("₹176.00");
  await expect(page.getByLabel("Finance overview totals")).toContainText("Operating net (before settlements)");
  await expect(page.getByLabel("Finance overview totals")).toContainText("−₹76.00");
  await expect(page.getByLabel("Finance overview totals")).not.toContainText("₹24.00");
  await totalCard.click();
  await expect(page).toHaveURL(/finance\/total-expenses/);
  await expect(page.getByLabel("Work cycle from")).toHaveValue("2026-10-22");
  await expect(page.getByLabel("Total expense summary")).toContainText("₹176.00");
  await expect(page.getByText("Page 1 of 2 · 35 records")).toBeVisible();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const records = page.getByRole("region", { name: "All expense records" });
  await expect(records.getByRole("cell", { name: "Agency campaign", exact: true })).toBeVisible();
  await expect(records.getByRole("cell", { name: "Cafe campaign", exact: true })).toBeVisible();
  await expect(records.getByRole("cell", { name: "Salary funded", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Expense type" }).selectOption("CLIENT_ADS");
  await page.getByRole("searchbox", { name: "Search expenses" }).fill("Cafe");
  await expect(page.getByText("Page 1 of 1 · 1 records")).toBeVisible();
  await expect(page.getByLabel("Total expense summary")).toContainText("₹176.00");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await download;
  const exported = calls.find((c) => c.path === "/finance/total-expenses/export")!;
  expect(Object.fromEntries(exported.query)).toMatchObject({
    from: "2026-10-22",
    to: "2026-11-21",
    view: "mine",
    type: "CLIENT_ADS",
    q: "Cafe",
  });
  await page.getByRole("button", { name: "Agency totals & register", exact: true }).click();
  await expect(page.getByLabel("Total expense summary")).toContainText("₹316.00");
  await expect(page.getByLabel("Total expense summary")).toContainText("−₹16.00");
  await expect(records.getByRole("cell", { name: "₹150.00", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);
  await page.getByRole("link", { name: "← Finance overview", exact: true }).click();
  await expect(cards.getByRole("link", { name: /^Expenses / })).toContainText("₹66.00");
  await expect(cards.getByRole("link", { name: /^Salaries / })).toContainText("₹100.00");
  await expect(cards.getByRole("link", { name: /^Total expense / })).toContainText("₹316.00");
  await expect(page.getByLabel("Finance overview totals")).toContainText("−₹16.00");
  await cards.getByRole("link", { name: /^Expenses / }).click();
  await expect(page.getByLabel("Category totals")).toContainText("₹66.00");
  await expect(page.getByText("Salaries", { exact: true })).toHaveCount(0);
});

test("personal-only users cannot request agency expense totals from the page", async ({ page }) => {
  const calls = await workspace(page, "EMPLOYEE");
  await page.goto("/app/finance/total-expenses?from=2026-10-22&to=2026-11-21&view=all");
  await expect(page.getByRole("heading", { name: "Total expense", exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Agency totals & register", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(() => calls.filter((c) => c.path === "/finance/total-expenses").length)
    .toBeGreaterThan(0);
  expect(
    calls
      .filter((c) => c.path === "/finance/total-expenses")
      .every((c) => c.query.get("view") === "mine"),
  ).toBe(true);
});

test("super admin edits expense owner directly from mobile Total Expense, salaries remain protected", async ({page}) => {
  const calls=await workspace(page,"SUPER_ADMIN");
  await page.setViewportSize({width:375,height:812});
  await page.goto("/app/finance/total-expenses?from=2026-10-22&to=2026-11-21&view=all");
  const records=page.getByRole("region",{name:"All expense records"});
  await expect(records.getByRole("button",{name:"Edit expense"}).first()).toBeVisible();
  await records.getByRole("button",{name:"Edit expense"}).first().click();
  const modal=page.getByRole("dialog",{name:"Edit expense"});
  await expect(modal).toBeVisible();
  await modal.getByLabel("Assigned user").selectOption("dev");
  await modal.getByRole("button",{name:"Save changes"}).click();
  await expect(modal).toHaveCount(0);
  await expect(page.getByText(/User-wise totals reflect the assigned user/)).toBeVisible();
  expect(calls.some(call=>call.path==="/finance/entries/expense-0/edit")).toBe(false);
  expect(calls.some(call=>call.path==="/finance/register")).toBe(true);
  const updated=calls.find(call=>call.path==="/finance/entries/expense-0" && call.method==="PUT");
  expect(updated?.body).toMatchObject({enteredById:"dev",amount:"0.5000",categoryId:"travel"});
  await page.getByRole("combobox",{name:"Expense type"}).selectOption("SALARY");
  await expect(records.getByRole("button",{name:"Edit expense"})).toHaveCount(0);
  await expect(records.getByRole("link",{name:"View salary workflow"})).toBeVisible();
});

test("non-admin cannot edit Total Expense rows", async ({page}) => {
  await workspace(page,"EMPLOYEE");
  await page.goto("/app/finance/total-expenses?from=2026-10-22&to=2026-11-21&view=mine");
  await expect(page.getByRole("button",{name:"Edit expense"})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Edit",exact:true})).toHaveCount(0);
});

test("cycle expense editing saves a real entry id and refreshes the cycle register",async({page})=>{
  const calls=await workspace(page,"SUPER_ADMIN");
  await page.goto("/app/finance/cycles?from=2026-10-22&to=2026-11-21&view=all");
  const rows=page.getByRole("region",{name:"Cycle expense details"});
  const row=rows.getByRole("row").filter({hasText:"Journey 0"});
  await row.getByRole("button",{name:"Edit expense"}).click();
  const editor=page.getByRole("dialog",{name:"Edit expense"});
  await editor.getByLabel("Amount (INR)").fill("25");
  await editor.getByLabel("Assigned user").selectOption("dev");
  await editor.getByRole("button",{name:"Save changes"}).click();
  await expect(editor).toHaveCount(0);
  await expect(row).toContainText("₹25.00");
  await expect(row).toContainText("Dev Raj");
  expect(calls.find(c=>c.path==="/finance/entries/expense-0"&&c.method==="PUT")?.body).toMatchObject({amount:"25",enteredById:"dev"});
  expect(calls.filter(c=>c.path==="/finance/total-expenses/summary").length).toBeGreaterThan(1);
});
test("closed cycle rows cannot be edited by an administrator",async({page})=>{
  await workspace(page,"SUPER_ADMIN",true);
  await page.goto("/app/finance/cycles?from=2026-10-22&to=2026-11-21&view=all");
  const rows=page.getByRole("region",{name:"Cycle expense details"});
  await expect(rows.getByText("Journey 0",{exact:true})).toBeVisible();
  await expect(rows.getByRole("button",{name:"Edit expense"})).toHaveCount(0);
});
