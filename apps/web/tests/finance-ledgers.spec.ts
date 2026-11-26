import { expect, test, type Page } from "@playwright/test";
const categoryId = "00000000-0000-4000-8000-000000000001",
  accountId = "00000000-0000-4000-8000-000000000002",
  clientId = "00000000-0000-4000-8000-000000000003",
  fundId = "00000000-0000-4000-8000-000000000004";
async function workspace(page: Page, role = "FOUNDER") {
  const calls: { path: string; query: URLSearchParams; body: Record<string, unknown> | null }[] =
    [];
  let funded = false,
    reconciled = false,
    closed = false,
    reversed = false;
  await page.clock.setFixedTime(new Date("2026-11-30T12:00:00Z"));
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname.slice(7),
      body = req.postData() ? req.postDataJSON() : null;
    calls.push({ path, query: url.searchParams, body });
    let data: unknown = [];
    const all = role === "FOUNDER",
      q = url.searchParams;
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
        roles: [role],
        permissions: [
          "finance.entry.create",
          "finance.entry.read.own",
          "clients.read",
          ...(all ? ["finance.read.all", "finance.category.manage"] : []),
        ],
      };
    else if (path === "/notifications") data = { items: [], unreadCount: 0 };
    else if (path === "/notifications/push-key") data = { publicKey: null };
    else if (path === "/messages/users") data = { items: [] };
    else if (path === "/clients") data = { items: [], nextCursor: null };
    else if (path === "/approval-policies") data = [{ category: "FINANCE", active: true }];
    else if (path === "/finance/categories")
      data = [
        { id: categoryId, kind: "EXPENSE", name: "Travel", active: true, purpose: "GENERAL" },
      ];
    else if (path === "/salary/summary") data = { totalPaid: "0", founderFunding: [],monthly:[],founderBalances:[{founderUserId:"user",name:"Test Founder",financeNetBeforeSalary:"1200.0000",salaryFunded:"300.0000",remaining:"925.0000"}] };
    else if(path==="/finance/accounts")data=[{id:accountId,name:"Test Founder - personal clearing (unverified)",ownerName:"Test Founder",kind:"CASH",openingOn:"2026-10-22",openingBalance:"20758.51",opening:"20758.51",movement:"0",closing:"20758.51",isPersonalClearing:true},{id:"admin-account",name:"Platform Administrator - personal clearing (unverified)",ownerName:"Platform Administrator",kind:"CASH",openingOn:"2026-10-22",openingBalance:"0",opening:"0",movement:"0",closing:"0",isPersonalClearing:true}];
    else if (path === "/finance/summary")
      data = {
        currency: "INR",
        postedIncome: "100",
        postedExpense: "26",
        postedExpenseIncludingSalary: "26",
        clientAdSpend: { posted: "26.0000", pending: "0.0000" },
        postedSalaryExpense: "0",
        postedNet: "74",
        agencyOperatingNet: "74",
        pendingIncome: "0",
        pendingExpense: "0",
        groups: [],
      };
    else if (path === "/finance/cycle-balance")
      data = { opening: "0.0000", movement: "74.0000", remaining: "74.0000" };
    else if (path === "/finance/expenses/mine" && req.method() === "POST") data = { status: "POSTED" };
    else if (path === "/finance/client-ad-spend/mine")
      data = { posted: "12.0000", entries: 2, byClient: [] };
    else if (path === "/finance/category-summary")
      data = {
        ordinary: "26",
        total: "26",
        items: [
          { id: categoryId, name: "Travel", posted: "26", pending: "0", count: 26, active: true },
        ],
      };
    else if (path === "/finance/register") {
      const rows = Array.from({ length: 26 }, (_, i) => ({
        id: "entry-" + i,
        kind: "EXPENSE",
        status: "POSTED",
        amount: "1.0000",
        currencyCode: "INR",
        occurredOn: "2026-11-15",
        method: "UPI",
        description: i === 25 ? "Late entry beyond first page" : "Journey " + i,
        merchantOrSource: "Travel",
        createdAt: "2026-11-15T12:00:00Z",
        sourceType: "FINANCE",
        enteredById: "user",
        category: { id: categoryId, name: "Travel", active: true, purpose: "GENERAL" },
        enteredBy: { displayName: "Test User", loginId: "test" },
        submittedBy: { displayName: "Test User" },
        client: null,
        clientId: null,
        moneyAccount: { id: accountId, name: "Agency bank" },
        reversesId: null,
        reversedBy: null,
      }));
      const filtered = rows.filter(
        (r) => !q.get("q") || r.description.toLowerCase().includes(q.get("q")!.toLowerCase()),
      );
      const page = Number(q.get("page") ?? 1);
      data = {
        items: filtered.slice((page - 1) * 25, page * 25),
        total: filtered.length,
        page,
        limit: 25,
      };
    } else if (path === "/finance/register/export")
      data = { filename: "filtered.csv", csv: "ID,Amount\r\nentry-25,1.0000" };
    else if (path === "/finance/account-options") data = [{ id: accountId, name: "Agency bank" }];
    else if (path === "/finance/client-funds" && req.method() === "POST") {
      funded = true;
      data = { id: fundId };
    } else if (path === "/finance/client-funds")
      data = [
        {
          id: clientId,
          name: "Test Cafe",
          opening: "0",
          received: funded ? "100" : "0",
          refunded: "0",
          spent: "26",
          adjustments: reversed ? "-100" : "0",
          closing: funded && !reversed ? "74" : "-26",
        },
      ];
    else if (path === "/finance/client-funds/history")
      data = {
        items: funded
          ? [
              {
                id: fundId,
                source: "FUNDS",
                kind: "TOPUP",
                amount: "100",
                occurredOn: "2026-11-15",
                description: "Client ad budget",
                reversesId: null,
                reversedBy: reversed ? "reversal" : null,
              },
            ]
          : [],
        total: funded ? 1 : 0,
        page: 1,
        limit: 25,
      };
    else if (path === "/finance/reversals") {
      reversed = true;
      data = { id: "reversal" };
    } else if (path === "/finance/reconciliations") {
      reconciled = true;
      data = { difference: "0.0000" };
    } else if (path === "/finance/cycle-state") {
      data = { current: closed ? {from:"2026-11-22",to:"2026-12-21"} : {from:"2026-10-22",to:"2026-11-21"}, history: closed ? [{from:"2026-10-22",to:"2026-11-21",closedAt:"2026-11-30"}] : [], canClose: !closed };
    } else if (path === "/finance/cycle-confirmation") {
      data = { closePeriod: {from:"2026-10-22",to:"2026-11-21"}, current:{from:"2026-10-22",to:"2026-11-21"}, canClose:!closed, plannedThrough:"2026-11-21", postedIncome:"100",postedTotalExpense:"26",pending:0 };
    } else if (path === "/finance/cycle-close-simple") {
      closed = true; data = { id:"close" };
    } else if (path === "/finance/cycle-close") {
      closed = true;
      data = { id: "close" };
    } else if (path === "/finance/cycle-review")
      data = {
        from: q.get("from"),
        to: q.get("to"),
        closed: closed ? { closedAt: "2026-11-30T12:00:00Z", note: "Statements verified" } : null,
        accounts: [
          {
            id: accountId,
            name: "Agency bank",
            kind: "BANK",
            openingOn: "2026-10-22",
            opening: "0",
            movement: "100",
            closing: "100",
            matched: reconciled,
            statementBalance: reconciled ? "100" : null,
          },
        ],
        pending: 0,
        unassignedFinance: 0,
        unassignedSalary: 0,
        blockers: reconciled
          ? []
          : ["Every account needs a matching reconciliation for the cycle's last day."],
        canClose: reconciled && !closed,
      };
    await route.fulfill({ json: { data } });
  });
  return calls;
}
const cycle = "from=2026-10-22&to=2026-11-21&view=all";
test("category cards drill into paginated search and export the same filters", async ({ page }) => {
  const calls = await workspace(page);
  const browserExceptions:string[]=[];
  page.on("pageerror",error=>browserExceptions.push(error.stack??error.message));
  page.on("console",message=>{
    if(message.type()==="error")browserExceptions.push(message.text());
  });
  await page.goto("/app/finance/expenses?" + cycle);
  await page.getByRole("link", { name: /Travel/ }).click();
  await expect(page).toHaveURL(new RegExp("categoryId=" + categoryId));
  // Wait for the paginated data view, not merely a client-side URL transition.
  // Expose actionable diagnostics if an API or rendering regression blocks it.
  const pageSummary=page.getByRole("navigation",{name:"Finance pagination"})
    .getByText("Page 1 of 2 · 26 records",{exact:true});
  try {
    await expect(pageSummary).toBeVisible({timeout:15000});
  } catch (error) {
    const body=(await page.locator("body").innerText().catch(() => "")).slice(-5000);
    console.error("Finance category drilldown failed",JSON.stringify({
      url:page.url(),
      registerCalls:calls.filter(c=>c.path.includes("/finance/register"))
        .map(c=>({path:c.path,query:c.query.toString()})),
      pageContent:body,
      browserExceptions:browserExceptions.slice(-15)
    }));
    throw error;
  }
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Financial register", exact: true })
      .getByText("Late entry beyond first page", { exact: true }),
  ).toBeVisible();
  await page.getByRole("searchbox", { name: "Search financial entries" }).fill("Late entry");
  await expect(page.getByText("Page 1 of 1 · 1 records")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await download;
  const exported = calls.find((c) => c.path === "/finance/register/export")!;
  expect(exported.query.get("q")).toBe("Late entry");
  expect(exported.query.get("categoryId")).toBe(categoryId);
  expect(exported.query.get("from")).toBe("2026-10-22");
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(377);
});
test("agency client funds shows posted client ad spend from all accounts instead of negative deposits", async ({ page }) => {
  const calls = await workspace(page);
  await page.goto("/app/finance?" + cycle);
  await expect(page.getByTestId("finance-category-amount-client-ad-funds")).toHaveText("₹26.00");
  expect(calls.some((call) => call.path === "/finance/client-funds")).toBe(false);
  await page.getByRole("link", { name: /Client ad funds/ }).click();
  await expect(page.getByTestId("agency-client-ad-spend")).toHaveText("₹26.00");
  await expect(page.getByText("Remaining recorded funds: −₹26.00")).toBeVisible();
  await page.goto("/app/finance?" + cycle.replace("view=all", "view=mine"));
  await expect(page.getByTestId("finance-category-amount-client-ad-funds")).toHaveText("₹12.00");
});
test("client funds record an account and require a reason before reversal", async ({ page }) => {
  const calls = await workspace(page);
  await page.goto("/app/finance/client-funds?" + cycle);
  await page.getByRole("link", { name: /Test Cafe/ }).click();
  await page.getByText("Record top-up or refund", { exact: true }).click();
  await page.getByLabel("Received into account").selectOption(accountId);
  await page.getByLabel("Amount (INR)").fill("100");
  await page.getByLabel("Date", { exact: true }).fill("2026-11-15");
  await page.getByLabel("Note", { exact: true }).fill("Client ad budget");
  await page.getByRole("button", { name: "Record funds movement" }).click();
  await expect(page.getByText("Client funds recorded. Agency income is unchanged.")).toBeVisible();
  expect(calls.find((c) => c.path === "/finance/client-funds" && c.body)?.body).toMatchObject({
    clientId,
    accountId,
    kind: "TOPUP",
    amount: "100",
    occurredOn: "2026-11-15",
  });
  await page.getByRole("button", { name: "Reverse", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Reversal date").fill("2026-11-22");
  await dialog.getByLabel("Correction reason").fill("Duplicate bank receipt");
  await dialog.getByRole("button", { name: "Confirm reversal" }).click();
  await expect(dialog).not.toBeVisible();
  expect(calls.find((c) => c.path === "/finance/reversals")?.body).toMatchObject({
    source: "FUNDS",
    id: fundId,
    occurredOn: "2026-11-22",
    reason: "Duplicate bank receipt",
  });
  await expect(page.getByRole("cell", { name: "Reversed", exact: true })).toBeVisible();
});
test("cycle closing requires explicit verification of totals", async ({page}) => {
  const calls = await workspace(page);
  await page.goto("/app/finance/closing?" + cycle);
  await expect(page.getByText("₹100.00")).toBeVisible();
  await expect(page.getByText("₹26.00")).toBeVisible();
  await expect(page.getByRole("button", {name:"Close cycle",exact:true})).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", {name:"Close cycle",exact:true}).click();
  await expect(page).toHaveURL(/\/app\/finance(?:\?|$)/);
  expect(calls.find(c=>c.path==="/finance/cycle-close-simple")?.body).toMatchObject({from:"2026-10-22",to:"2026-11-21",income:"100",expense:"26",confirmed:true});
});
test("employee direct access does not request agency money ledgers", async ({ page }) => {
  const calls = await workspace(page, "EMPLOYEE");
  await page.goto("/app/finance/accounts");
  await expect(page.getByText("Finance access is not available for this account.")).toBeVisible();
  expect(calls.some((c) => c.path === "/finance/accounts")).toBe(false);
});

test("founder adds an expense automatically attributed to signed-in user", async ({ page }) => {
  const calls = await workspace(page);
  const browserExceptions:string[]=[];
  page.on("pageerror",error=>browserExceptions.push(error.stack??error.message));
  page.on("console",message=>{
    if(message.type()==="error")browserExceptions.push(message.text());
  });
  await page.goto("/app/finance/expenses?" + cycle);
  await page.getByRole("button", {name: "+ Add Expense"}).click();
  await expect(page.getByLabel("Entry type")).toBeDisabled();
  await expect(page.getByTestId("finance-owner-notice")).toContainText("signed-in user");
  await expect(page.locator("#finance-money-account")).toHaveCount(0);
  await page.getByLabel("Category", {exact:true}).selectOption(categoryId);
  await page.getByLabel("Amount (INR)").fill("12");
  await page.getByLabel("Transaction date").fill("2026-11-15");
  await page.getByRole("button", {name:"Save expense"}).click();
  await expect(page.getByText("Entry saved and included in posted totals.")).toBeVisible();
  const body=calls.find(c=>c.path==="/finance/expenses/mine")?.body;
  expect(body).toMatchObject({kind:"EXPENSE",categoryId,amount:"12",occurredOn:"2026-11-15"});
  expect(body).not.toHaveProperty("enteredById");
  expect(body).not.toHaveProperty("moneyAccountId");
  await expect(page).toHaveURL(/finance\/expenses/);
});

test("founder balances use salary funding ledger and keep legacy clearing separate",async({page})=>{
 const calls=await workspace(page);
 await page.goto("/app/finance/accounts?"+cycle);
 const balances=page.getByRole("region",{name:"Finance-linked founder balances"});
 await expect(balances.getByTestId("founder-finance-balance-user")).toContainText("₹925.00");
 await expect(balances).toContainText("₹25.00");
 await expect(balances).not.toContainText("20,758.51");
 await expect(balances).not.toContainText("Platform Administrator");
 await expect(page.getByText("₹20,758.51",{exact:true})).toBeHidden();
 const reconciliation=page.getByTestId("money-account-reconciliation");
 await reconciliation.locator("summary").click();
 await expect(reconciliation).toHaveAttribute("open","");
 await expect(reconciliation.getByText("₹20,758.51",{exact:true})).toBeVisible();
 expect(calls.some(c=>c.path==="/salary/summary")).toBe(true);
 await page.goto("/app/finance?tab=accounts&"+cycle);
 await expect(page.getByRole("region",{name:"Finance-linked founder balances"}).getByTestId("founder-finance-balance-user")).toContainText("₹925.00");
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
});
test("missing founder balance payload never substitutes legacy amounts",async({page})=>{
 await workspace(page);
 await page.route("**/api/v1/salary/summary?*",route=>route.fulfill({json:{data:{totalPaid:"0"}}}));
 await page.goto("/app/finance/accounts?"+cycle);
 await expect(page.getByText("Founder balances unavailable. No legacy balance will be substituted.")).toBeVisible();
 await expect(page.getByText("₹20,758.51",{exact:true})).toBeHidden();
});
