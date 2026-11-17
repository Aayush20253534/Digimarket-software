import { expect, test, type Page } from "@playwright/test";

async function workspace(page: Page, role = "FOUNDER") {
  const calls: { path: string; query: URLSearchParams }[] = [];
  await page.clock.setFixedTime(new Date("2026-11-17T12:00:00Z"));
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname.slice(7),
      q = url.searchParams;
    calls.push({ path, query: q });
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
          ...(role === "FOUNDER" ? ["finance.read.all", "finance.category.manage"] : []),
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
    else if (path === "/finance/total-expenses/summary") data = summary;
    else if (path === "/finance/total-expenses") {
      const rows = [
        ...Array.from({ length: all ? 46 : 32 }, (_, i) => ({
          id: "expense-" + i,
          type: "OTHER",
          category: "Travel",
          amount: all ? "1" : "0.50",
          description: "Journey " + i,
          person: "Test Founder",
          client: "",
        })),
        {
          id: "self-ad",
          type: "SELF_ADS",
          category: "Meta Ads",
          amount: summary.breakdown.SELF_ADS,
          description: "Agency campaign",
          person: "Test Founder",
          client: "",
        },
        {
          id: "client-ad",
          type: "CLIENT_ADS",
          category: "Meta Ads",
          amount: summary.breakdown.CLIENT_ADS,
          description: "Cafe campaign",
          person: "Test Founder",
          client: "Test Cafe",
        },
        {
          id: "salary",
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
  await expect(cards.getByRole("link", { name: /^Expenses / })).toContainText("₹76.00");
  const totalCard = cards.getByRole("link", { name: /^Total expense / });
  await expect(totalCard).toContainText("₹176.00");
  await expect(page.getByLabel("Finance overview totals")).toContainText("Net operating money");
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
  await expect(cards.getByRole("link", { name: /^Expenses / })).toContainText("₹166.00");
  await expect(cards.getByRole("link", { name: /^Total expense / })).toContainText("₹316.00");
  await expect(page.getByLabel("Finance overview totals")).toContainText("−₹16.00");
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
