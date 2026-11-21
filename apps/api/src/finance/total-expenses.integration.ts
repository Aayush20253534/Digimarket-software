import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import request from "supertest";
import type { PrismaClient } from "@digimarket/db";
import type { AuthService, Principal } from "../auth/service";
import { createApp } from "../app";
import { FinanceService } from "./service";
import { FinanceLedgerService } from "./ledger-service";
import { TotalExpenseService, type TotalExpenseQuery } from "./total-expenses";

export async function verifyTotalExpenses(db: PrismaClient) {
  const finance = new FinanceService(db),
    report = new TotalExpenseService(db),
    ledger = new FinanceLedgerService(db);
  const org = await db.organization.create({ data: { name: "Total expense CI " + randomUUID() } });
  const other = await db.organization.create({
    data: { name: "Unrelated expense CI " + randomUUID() },
  });
  const users = await Promise.all(
    ["First founder", "Second founder", "Private payroll recipient"].map((name, i) =>
      db.user.create({
        data: {
          organizationId: org.id,
          displayName: name,
          loginId: "expense-" + i,
          status: "ACTIVE",
        },
      }),
    ),
  );
  const principal = (userId: string, roles = ["FOUNDER"]): Principal => ({
    organizationId: org.id,
    userId,
    roles,
    sessionId: "expense-ci",
    permissions: new Set([
      "finance.read.all",
      "finance.entry.read.own",
      "finance.category.manage",
      "finance.entry.create",
    ]),
  });
  const f = principal(users[0].id),
    second = principal(users[1].id),
    admin = principal(users[2].id, ["ADMIN"]);
  const employee = {
    ...admin,
    roles: ["EMPLOYEE"],
    permissions: new Set(["finance.entry.read.own"]),
  };
  const q: TotalExpenseQuery = {
    from: "2026-10-22",
    to: "2026-11-21",
    view: "all",
    page: 1,
    limit: 25,
    q: "",
    type: "ALL",
  };
  const income = await finance.addCategory(f, { kind: "INCOME", name: "Service fees" });
  const ordinary = await finance.addCategory(f, { kind: "EXPENSE", name: "Tools" });
  const ads = await finance.addCategory(f, {
    kind: "EXPENSE",
    name: "Paid social",
    purpose: "META_ADS",
  });
  const client = await db.client.create({
    data: {
      organizationId: org.id,
      businessName: "Example Cafe",
      phone: "9000000000",
      createdById: f.userId,
    },
  });
  const account = await ledger.createAccount(f, {
    name: "Cash",
    kind: "CASH",
    openingOn: q.from,
    openingBalance: "0",
  });
  const entry = (
    person: Principal,
    kind: "INCOME" | "EXPENSE",
    categoryId: string,
    amount: string,
    occurredOn = "2026-11-01",
    clientId?: string,
  ) =>
    finance.submit(person, {
      kind,
      categoryId,
      amount,
      occurredOn,
      method: "UPI",
      clientId,
      description: "=test export safety",
      moneyAccountId: occurredOn < q.from ? undefined : account.id,
      idempotencyKey: randomUUID(),
    });
  await entry(f, "INCOME", income.id, "1000");
  await entry(f, "EXPENSE", ordinary.id, "200", q.from);
  await entry(second, "EXPENSE", ordinary.id, "75", q.to);
  await entry(f, "EXPENSE", ads.id, "50");
  await entry(f, "EXPENSE", ads.id, "800", "2026-11-02", client.id);
  await entry(f, "EXPENSE", ordinary.id, "900", "2026-10-21");
  await entry(f, "EXPENSE", ordinary.id, "900", "2026-11-22");
  for (const status of ["PENDING", "CANCELLED", "REJECTED"] as const) {
    const row = await entry(f, "EXPENSE", ordinary.id, "900");
    await db.financialTransaction.update({
      where: { id: row.id },
      data: { status, postedAt: null },
    });
  }
  const funding = await Promise.all(
    users.slice(0, 2).map((u) =>
      db.salaryFundingAccount.create({
        data: {
          organizationId: org.id,
          founderUserId: u.id,
          createdById: f.userId,
          name: "Payroll",
          normalizedName: "payroll",
        },
      }),
    ),
  );
  const salary = await db.salaryPayment.create({
    data: {
      organizationId: org.id,
      recipientUserId: users[2].id,
      createdById: f.userId,
      idempotencyKey: randomUUID(),
      amount: "250",
      salaryMonth: "2026-10",
      paidOn: new Date("2026-11-03"),
      method: "UPI",
      status: "PAID",
      note: "Confidential payroll note",
      allocations: {
        create: [
          { accountId: funding[0].id, amount: "100", moneyAccountId: account.id },
          { accountId: funding[1].id, amount: "150", moneyAccountId: account.id },
        ],
      },
    },
  });
  const reversedExpense = await entry(f, "EXPENSE", ordinary.id, "60");
  await ledger.reverse(f, {
    source: "FINANCE",
    id: reversedExpense.id,
    occurredOn: "2026-11-04",
    reason: "Reversed duplicate cost",
    idempotencyKey: randomUUID(),
  });
  // Reversals in a later cycle affect that cycle, without rewriting prior totals.
  const later = await entry(f, "EXPENSE", ordinary.id, "40");
  await ledger.reverse(f, {
    source: "FINANCE",
    id: later.id,
    occurredOn: "2026-11-22",
    reason: "Later cycle reversal",
    idempotencyKey: randomUUID(),
  });
  const expected = {
    personalSettlementResetAt: null,
    postedIncome: "1000.0000",
    postedTotalExpense: "1415.0000",
    netOperatingMoney: "-415.0000",
    breakdown: {
      OTHER: "315.0000",
      SELF_ADS: "50.0000",
      CLIENT_ADS: "800.0000",
      SALARY: "250.0000",
    },
  };
  assert.deepEqual(await report.summary(f, q), expected);
  const all = await report.records(f, q);
  assert.deepEqual(all.summary, expected);
  assert.equal(all.matchingAmount, expected.postedTotalExpense);
  assert.equal(
    all.items.filter((r) => r.id === "salary:" + salary.id).length,
    1,
    "split funding is one agency payment",
  );
  assert.equal(all.items.find((r) => r.id === "salary:" + salary.id)?.amount, "250.0000");
  assert.ok(all.items.some((r) => r.reversal && r.amount === "-60.0000"));
  assert.deepEqual(await report.summary(f, { ...q, view: "mine" }), {
    personalSettlementResetAt: null,
    postedIncome: "1000.0000",
    postedTotalExpense: "1190.0000",
    netOperatingMoney: "-190.0000",
    breakdown: {
      OTHER: "240.0000",
      SELF_ADS: "50.0000",
      CLIENT_ADS: "800.0000",
      SALARY: "100.0000",
    },
  });
  const mine = await report.records(f, { ...q, view: "mine" });
  assert.equal(mine.items.find((r) => r.id === "salary:" + salary.id)?.amount, "100.0000");
  assert.equal((await report.records(second, { ...q, view: "mine" })).matchingAmount, "225.0000");
  assert.equal(
    (await finance.categorySummary(f, "mine", q, "EXPENSE")).total,
    "290.0000",
    "Expenses excludes salary while Total expense retains funded payroll",
  );
  const pages = await Promise.all(
    [1, 2].map((page) => report.records(f, { ...q, page, limit: 3 })),
  );
  assert.equal(new Set(pages.flatMap((p) => p.items.map((r) => r.id))).size, 6);
  const filtered = await report.records(f, { ...q, type: "CLIENT_ADS", q: "example cafe" });
  assert.equal(filtered.total, 1);
  assert.equal(filtered.matchingAmount, "800.0000");
  assert.deepEqual(filtered.summary, expected, "search does not change the cycle total");
  const csv = await report.export(f, { ...q, type: "CLIENT_ADS", q: "example cafe" });
  assert.equal(csv.csv.split("\r\n").length, 2);
  assert.ok(csv.csv.includes("800.0000"));
  assert.ok(csv.csv.includes("'=test export safety"));
  assert.equal((await report.records(f, { ...q, q: "%' OR true--" })).total, 0);
  assert.equal((await report.records(f, { ...q, page: 100 })).items.length, 0);
  const privateRows = await report.records(admin, q),
    privateCSV = await report.export(admin, q);
  for (const result of [JSON.stringify(privateRows), privateCSV.csv]) {
    assert.ok(!result.includes("Private payroll recipient"));
    assert.ok(!result.includes("Confidential payroll note"));
    assert.ok(!result.includes(salary.id));
  }
  assert.deepEqual(privateRows.summary, expected);
  assert.equal((await report.records(admin, { ...q, q: "Private payroll recipient" })).total, 0);
  assert.equal(
    (await report.summary(employee, { ...q, view: "mine" })).postedTotalExpense,
    "0.0000",
  );
  const denied = (e: unknown) => (e as { status: number }).status === 403;
  await assert.rejects(() => report.summary(employee, q), denied);
  await assert.rejects(() => report.records(employee, q), denied);
  await assert.rejects(() => report.export(employee, q), denied);
  const outsider = { ...f, organizationId: other.id };
  assert.equal((await report.summary(outsider, q)).postedTotalExpense, "0.0000");
  assert.equal((await report.records(outsider, q)).total, 0);
  assert.equal((await report.export(outsider, q)).csv.split("\r\n").length, 1);
  await ledger.reverse(f, {
    source: "SALARY",
    id: salary.id,
    occurredOn: "2026-11-05",
    reason: "Reversed salary test",
    idempotencyKey: randomUUID(),
  });
  assert.equal((await report.summary(f, q)).breakdown.SALARY, "0.0000");
  assert.equal((await report.summary(f, { ...q, view: "mine" })).breakdown.SALARY, "0.0000");
  assert.equal((await report.records(f, { ...q, type: "SALARY" })).total, 2);
  const auth = { database: db, config: {}, authenticate: async () => f } as unknown as AuthService;
  const app = createApp([], auth);
  const url = "/api/v1/finance/total-expenses";
  const response = await request(app)
    .get(
      url +
        "?" +
        new URLSearchParams({
          from: q.from,
          to: q.to,
          view: "mine",
          type: "CLIENT_ADS",
          q: "Example",
        }),
    )
    .set("Authorization", "Bearer test");
  assert.equal(response.status, 200);
  assert.equal(response.body.data.matchingAmount, "800.0000");
  assert.equal(
    (
      await request(app)
        .get(url + "?type=UNKNOWN")
        .set("Authorization", "Bearer test")
    ).status,
    422,
  );
  assert.equal(
    (
      await request(app)
        .get(url + "?page=0")
        .set("Authorization", "Bearer test")
    ).status,
    422,
  );
  assert.equal(
    (
      await request(app)
        .get(url + "?from=2026-11-22&to=2026-11-21")
        .set("Authorization", "Bearer test")
    ).status,
    422,
  );
  assert.equal((await request(app).get(url)).status, 401);
  console.log(
    "Total expense integration passed: complete totals, split salaries, reversals, cycles, pagination/export and privacy",
  );
}
