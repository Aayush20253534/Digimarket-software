import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabaseClient, Prisma } from "@digimarket/db";
import type { Principal } from "../auth/service";
import { FinanceService, type FinanceRegisterQuery } from "./service";
import { FinanceLedgerService } from "./ledger-service";
import { ApprovalService } from "../approvals/service";
import { verifyTotalExpenses } from "./total-expenses.integration";
import { TotalExpenseService } from "./total-expenses";

if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL?.includes("digimarket_ci"))
  throw new Error("Ledger integration requires an isolated digimarket_ci database");
const db = createDatabaseClient(),
  finance = new FinanceService(db),
  ledger = new FinanceLedgerService(db, () => "2026-12-02");
const period = { from: "2026-10-22", to: "2026-11-21" },
  next = { from: "2026-11-22", to: "2026-12-21" };
const query: FinanceRegisterQuery = {
  ...period,
  view: "all",
  scope: "agency",
  page: 1,
  limit: 25,
  q: "",
};
const checkStatus = (status: number) => (e: unknown) =>
  (e as { status?: number }).status === status;
const closed = (e: unknown) => String(e).includes("FINANCE_CYCLE_CLOSED");
try {
  await verifyTotalExpenses(db);
  const org = await db.organization.create({ data: { name: "Finance ledger CI " + randomUUID() } }),
    other = await db.organization.create({ data: { name: "Other ledger CI " + randomUUID() } });
  const [founder, admin, staff] = await Promise.all(
    ["founder", "admin", "staff"].map((name) =>
      db.user.create({
        data: {
          organizationId: org.id,
          loginId: name,
          displayName: name === "staff" ? "Private Salary Recipient" : name,
          status: "ACTIVE",
        },
      }),
    ),
  );
  const role = await db.role.create({
    data: { organizationId: org.id, key: "FOUNDER", label: "Founder", isSystem: true },
  });
  await db.userRole.create({ data: { userId: founder.id, roleId: role.id } });
  const keys = [
    "finance.read.all",
    "finance.entry.create",
    "finance.entry.read.own",
    "finance.category.manage",
    "approvals.submit",
    "approvals.policy.manage",
    "finance.approve",
    "approvals.decide",
  ];
  const actor = (id: string, roles: string[], organizationId = org.id): Principal => ({
    userId: id,
    organizationId,
    roles,
    permissions: new Set(keys),
    sessionId: "ledger-ci",
  });
  const f = actor(founder.id, ["FOUNDER"]),
    a = actor(admin.id, ["ADMIN"]),
    employee = actor(staff.id, ["EMPLOYEE"]);
  employee.permissions.delete("finance.read.all");
  const outsider = actor(admin.id, ["ADMIN"], other.id),
    reader = actor(staff.id, ["EMPLOYEE"]);
  const inc = await finance.addCategory(a, { kind: "INCOME", name: "Service fees" }),
    expense = await finance.addCategory(a, { kind: "EXPENSE", name: "Travel" }),
    ads = await finance.addCategory(a, { kind: "EXPENSE", name: "Meta Ads" });
  const bank = await ledger.createAccount(f, {
    name: "Agency bank",
    kind: "BANK",
    openingOn: period.from,
    openingBalance: "0",
  });
  const openingCash = await ledger.createAccount(f, {
    name: "Verified opening cash",
    kind: "CASH",
    openingOn: period.from,
    openingBalance: "500",
  });
  assert.equal(
    (await ledger.balances(f, period)).find((r) => r.id === openingCash.id)?.opening,
    "500.0000",
  );
  await ledger.correctAccount(f, {
    id: openingCash.id,
    name: openingCash.name,
    openingOn: period.from,
    openingBalance: "450",
    note: "Corrected from cash count",
  });
  assert.equal(
    (await ledger.balances(f, period)).find((r) => r.id === openingCash.id)?.closing,
    "450.0000",
  );
  const clearing = await ledger.createAccount(f, {
    name: "Founder clearing",
    kind: "FOUNDER",
    ownerUserId: founder.id,
    openingOn: period.from,
    openingBalance: "0",
  });
  await assert.rejects(
    () =>
      ledger.createAccount(f, {
        name: "Wrong founder",
        kind: "FOUNDER",
        ownerUserId: staff.id,
        openingOn: period.from,
        openingBalance: "0",
      }),
    checkStatus(422),
  );
  await assert.rejects(
    () =>
      ledger.createAccount(reader, {
        name: "Read only",
        kind: "CASH",
        openingOn: period.from,
        openingBalance: "0",
      }),
    checkStatus(403),
  );
  await assert.rejects(() => ledger.balances(employee, period), checkStatus(403));
  assert.deepEqual(await ledger.balances(outsider, period), []);
  const client = await db.client.create({
    data: {
      organizationId: org.id,
      businessName: "Client ad account",
      phone: "9000000000",
      createdById: founder.id,
    },
  });
  const makeEntry = (
    kind: "INCOME" | "EXPENSE",
    categoryId: string,
    amount: string,
    accountId?: string,
    clientId?: string,
  ) =>
    finance.submit(f, {
      kind,
      categoryId,
      amount,
      occurredOn: "2026-10-24",
      method: "UPI",
      moneyAccountId: accountId,
      clientId,
      idempotencyKey: randomUUID(),
    });
  await makeEntry("INCOME", inc.id, "2000", bank.id);
  const ownExpense = await makeEntry("EXPENSE", expense.id, "100", clearing.id);
  await makeEntry("EXPENSE", ads.id, "300", bank.id, client.id);
  const deposit = {
    clientId: client.id,
    accountId: bank.id,
    kind: "TOPUP" as const,
    amount: "1000",
    occurredOn: "2026-10-23",
    note: "Client advertising deposit",
    idempotencyKey: randomUUID(),
  };
  await ledger.recordFunds(f, deposit);
  await assert.rejects(
    () => ledger.recordFunds(f, deposit),
    (e: unknown) => (e as { code?: string }).code === "P2002",
  );
  const refund = await ledger.recordFunds(f, {
    ...deposit,
    kind: "REFUND",
    amount: "100",
    occurredOn: "2026-10-25",
    note: "Unused funds refund",
    idempotencyKey: randomUUID(),
  });
  await assert.rejects(
    () =>
      ledger.recordFunds(f, {
        ...deposit,
        kind: "REFUND",
        amount: "1000",
        occurredOn: "2026-10-26",
        idempotencyKey: randomUUID(),
      }),
    checkStatus(422),
  );
  await assert.rejects(
    () => ledger.recordFunds(outsider, { ...deposit, idempotencyKey: randomUUID() }),
    checkStatus(422),
  );
  await assert.rejects(
    () =>
      ledger.recordFunds(f, { ...deposit, occurredOn: "2026-10-21", idempotencyKey: randomUUID() }),
    checkStatus(422),
  );
  const transfer = await ledger.transfer(f, {
    fromAccountId: bank.id,
    toAccountId: clearing.id,
    amount: "100",
    occurredOn: "2026-10-26",
    note: "Founder reimbursement",
    idempotencyKey: randomUUID(),
  });
  const funding = await db.salaryFundingAccount.create({
    data: {
      organizationId: org.id,
      founderUserId: founder.id,
      createdById: founder.id,
      name: "Founder payroll attribution",
      normalizedName: "founder payroll attribution",
      openingBalance: 0,
      availableBalance: 0,
    },
  });
  const salary = await db.salaryPayment.create({
    data: {
      organizationId: org.id,
      recipientUserId: staff.id,
      createdById: founder.id,
      idempotencyKey: randomUUID(),
      amount: "200",
      salaryMonth: "2026-10",
      paidOn: new Date("2026-10-26"),
      method: "UPI",
      status: "PAID",
      allocations: { create: { accountId: funding.id, amount: "200" } },
    },
    include: { allocations: true },
  });
  await assert.rejects(
    () => ledger.link(a, { source: "salary", id: salary.allocations[0].id, accountId: bank.id }),
    checkStatus(403),
  );
  assert.equal(
    (await ledger.unassigned(a, period, { page: 1, limit: 25, q: "" })).salary.length,
    0,
    "admins cannot inspect recipient salary rows",
  );
  await ledger.link(f, { source: "salary", id: salary.allocations[0].id, accountId: bank.id });
  const unmapped = await makeEntry("EXPENSE", expense.id, "10");
  assert.equal((await ledger.review(f, period)).unassignedFinance, 1);
  await ledger.link(f, { source: "finance", id: unmapped.id, accountId: bank.id });
  let totals = await finance.totals(f, "all", period);
  assert.equal(totals.postedIncome, "2000.0000");
  assert.equal(totals.postedExpense, "110.0000");
  assert.equal(totals.postedSalaryExpense, "200.0000");
  assert.equal(totals.agencyOperatingNet, "1690.0000");
  for (const view of ["mine", "all"] as const) {
    const expenses = await finance.categorySummary(f, view, period, "EXPENSE");
    assert.equal(expenses.ordinary, "110.0000");
    assert.equal(expenses.total, "110.0000", "Expenses excludes salary");
    const combined = await new TotalExpenseService(db).summary(f, { ...period, view });
    assert.equal(combined.breakdown.SALARY, "200.0000");
    assert.equal(combined.postedTotalExpense, "610.0000");
    assert.equal(combined.netOperatingMoney, "1390.0000");
  }
  let accounts = await ledger.balances(f, period);
  assert.equal(accounts.find((x) => x.id === bank.id)?.closing, "2290.0000");
  assert.equal(accounts.find((x) => x.id === clearing.id)?.closing, "0.0000");
  assert.equal((await ledger.clientBalances(f, period))[0].closing, "600.0000");
  const adminHistory = await ledger.accountHistory(a, period, bank.id, {
    page: 1,
    limit: 25,
    q: "",
  });
  assert.ok(!JSON.stringify(adminHistory).includes("Private Salary Recipient"));
  assert.ok(adminHistory.items.some((r) => r.source === "SALARY_TOTAL"));
  assert.ok(
    (await ledger.accountHistory(f, period, bank.id, { page: 1, limit: 25, q: "" })).items.some(
      (r) => r.source === "SALARY" && r.sourceId === salary.id,
    ),
  );
  await finance.renameCategory(a, ads.id, "Paid social campaigns");
  assert.equal(
    (await finance.metaAdsDistribution(f, "all", period.from, period.to)).clientPosted,
    "300.0000",
    "renaming must preserve classification",
  );
  assert.equal(
    (await finance.register(f, { ...query, scope: "meta_ads", funding: "CLIENT" })).total,
    1,
  );
  // The register and export share all filters, including records after the former 200/5,000 limits.
  const batchCategory = await finance.addCategory(a, {
    kind: "EXPENSE",
    name: "Export pagination",
  });
  const policy = await db.approvalPolicy.findUniqueOrThrow({
    where: { organizationId_category: { organizationId: org.id, category: "FINANCE" } },
  });
  const ids = Array.from({ length: 5001 }, () => ({ id: randomUUID(), approval: randomUUID() }));
  await db.approvalRequest.createMany({
    data: ids.map((x) => ({
      id: x.approval,
      organizationId: org.id,
      policyId: policy.id,
      requesterId: founder.id,
      title: "Export batch",
      description: "Isolated export fixture",
      approverRoleKeys: ["FOUNDER"],
      status: "APPROVED" as const,
    })),
  });
  await db.financialTransaction.createMany({
    data: ids.map((x, i) => ({
      id: x.id,
      organizationId: org.id,
      enteredById: founder.id,
      categoryId: batchCategory.id,
      approvalRequestId: x.approval,
      idempotencyKey: randomUUID(),
      kind: "EXPENSE" as const,
      amount: "0.0001",
      currencyCode: "INR",
      occurredOn: new Date("2026-10-27"),
      method: "UPI" as const,
      status: "POSTED" as const,
      postedAt: new Date(),
      moneyAccountId: bank.id,
      description: i === 0 ? "=FORMULA()" : "Export row " + i,
      merchantOrSource: "export batch",
    })),
  });
  const filter = {
    ...query,
    categoryId: batchCategory.id,
    kind: "EXPENSE" as const,
    status: "POSTED" as const,
    q: "export batch",
  };
  const first = await finance.register(f, filter),
    second = await finance.register(f, { ...filter, page: 2 });
  assert.equal(first.total, 5001);
  assert.equal(first.items.length, 25);
  assert.equal(second.items.length, 25);
  assert.equal(new Set([...first.items, ...second.items].map((r) => r.id)).size, 50);
  assert.equal(first.matchingAmount, "0.5001");
  const csv = (await finance.exportRegister(f, filter)).csv;
  assert.equal(csv.split("\r\n").length, 5002);
  assert.ok(csv.includes("'=FORMULA()"));
  assert.ok(!csv.includes("Paid social campaigns"));
  const completeExpenseCSV = await new TotalExpenseService(db).export(f, {
    ...query, type: "OTHER", q: "Export pagination",
  });
  assert.equal(completeExpenseCSV.csv.split("\r\n").length, 5002, "total expense export has no 5,000-row cap");
  await assert.rejects(() => finance.register(employee, query), checkStatus(403));
  assert.equal((await finance.register(outsider, filter)).total, 0);
  assert.equal((await finance.register(f, { ...filter, q: "absent value" })).total, 0);
  assert.equal(
    (await finance.exportRegister(f, { ...filter, q: "absent value" })).csv.split("\r\n").length,
    1,
  );
  const creditClient = await db.client.create({
    data: { organizationId: org.id, businessName: "Unfunded campaign", createdById: founder.id },
  });
  await makeEntry("EXPENSE", ads.id, "5", bank.id, creditClient.id);
  // Pending entries, missing accounts and mismatched statements block closing.
  const approval = new ApprovalService(db);
  await approval.policy(a, "FINANCE", {
    name: "Finance CI",
    active: true,
    approverRoleKeys: ["ADMIN"],
  });
  const pending = await finance.submit(employee, {
    kind: "EXPENSE",
    categoryId: expense.id,
    amount: "12",
    occurredOn: "2026-10-27",
    method: "UPI",
    idempotencyKey: randomUUID(),
  });
  assert.equal((await ledger.review(f, period)).pending, 1);
  await finance.removeEntry(a, pending.id);
  await assert.rejects(
    () => ledger.close(f, period, "Attempt before statements"),
    checkStatus(409),
  );
  assert.ok((await ledger.review(f, next)).blockers.some((s) => s.includes("previous work cycle")));
  accounts = await ledger.balances(f, period);
  const mismatch = await ledger.reconcile(f, {
    accountId: bank.id,
    asOf: period.to,
    statementBalance: "0",
    note: "Deliberate mismatch",
  });
  assert.notEqual(mismatch.difference, "0.0000");
  for (const row of accounts)
    await ledger.reconcile(f, {
      accountId: row.id,
      asOf: period.to,
      statementBalance: row.closing,
      note: "Verified local test statement",
    });
  assert.equal((await ledger.review(f, period)).canClose, true);
  await assert.rejects(
    () => ledger.close(f, period, "Outstanding funding unreviewed"),
    (e: unknown) => (e as { code?: string }).code === "CLIENT_FUNDS_REVIEW_REQUIRED",
  );
  // Serialize closing and a concurrent posting; they can never both succeed with stale reconciliation.
  const race = await Promise.allSettled([
    ledger.close(f, period, "Verified close; client advance documented", true),
    makeEntry("EXPENSE", expense.id, "1", bank.id),
  ]);
  assert.ok(race.some((r) => r.status === "rejected"));
  if (race[0].status === "rejected") {
    for (const row of await ledger.balances(f, period))
      await ledger.reconcile(f, {
        accountId: row.id,
        asOf: period.to,
        statementBalance: row.closing,
        note: "Verified after concurrent entry",
      });
    await ledger.close(f, period, "Verified close after race; client advance documented", true);
  }
  await assert.rejects(
    () =>
      ledger.correctAccount(f, {
        id: openingCash.id,
        name: openingCash.name,
        openingOn: period.from,
        openingBalance: "999",
        note: "Cannot rewrite closed opening",
      }),
    checkStatus(409),
  );
  const closedBalances = await ledger.balances(f, period),
    closedTotals = await finance.totals(f, "all", period);
  await assert.rejects(
    () =>
      db.financialTransaction.update({
        where: { id: ownExpense.id },
        data: { occurredOn: new Date("2026-11-22") },
      }),
    closed,
  );
  await assert.rejects(
    () => db.salaryPayment.update({ where: { id: salary.id }, data: { status: "VOID" } }),
    closed,
  );
  await assert.rejects(
    () =>
      db.salaryFundingAllocation.update({
        where: { id: salary.allocations[0].id },
        data: { moneyAccountId: clearing.id },
      }),
    closed,
  );
  await assert.rejects(() => db.clientFundEntry.delete({ where: { id: refund.id } }), closed);
  await assert.rejects(
    () =>
      db.moneyTransfer.update({ where: { id: transfer.id }, data: { note: "Changed history" } }),
    closed,
  );
  await assert.rejects(
    () =>
      db.financePeriodClose.update({
        where: { organizationId_from: { organizationId: org.id, from: new Date(period.from) } },
        data: { note: "Rewrite" },
      }),
    closed,
  );
  await assert.rejects(
    () =>
      ledger.reconcile(f, {
        accountId: bank.id,
        asOf: period.to,
        statementBalance: "1",
        note: "Rewrite statement",
      }),
    checkStatus(409),
  );
  const reverse = (source: "FINANCE" | "SALARY" | "FUNDS" | "TRANSFER", id: string) =>
    ledger.reverse(f, {
      source,
      id,
      occurredOn: "2026-11-22",
      reason: "Documented correction",
      idempotencyKey: randomUUID(),
    });
  await assert.rejects(
    () =>
      ledger.reverse(a, {
        source: "SALARY",
        id: salary.id,
        occurredOn: "2026-11-22",
        reason: "Not a founder",
        idempotencyKey: randomUUID(),
      }),
    checkStatus(403),
  );
  await reverse("FINANCE", ownExpense.id);
  await reverse("SALARY", salary.id);
  await reverse("FUNDS", refund.id);
  await reverse("TRANSFER", transfer.id);
  await assert.rejects(() => reverse("FINANCE", ownExpense.id), checkStatus(422));
  assert.deepEqual(await ledger.balances(f, period), closedBalances);
  assert.deepEqual(await finance.totals(f, "all", period), closedTotals);
  totals = await finance.totals(f, "all", next);
  assert.equal(totals.postedExpense, "-100.0000");
  assert.equal(totals.postedSalaryExpense, "-200.0000");
  assert.equal(totals.agencyOperatingNet, "300.0000");
  assert.equal((await ledger.clientBalances(f, next))[0].closing, "700.0000");
  assert.equal(
    (await ledger.transfers(f, period, { page: 1, limit: 25, q: "" })).items[0].reversedBy !== null,
    true,
  );
  const carry = await ledger.balances(f, next);
  assert.equal(
    carry.find((x) => x.id === bank.id)?.opening,
    closedBalances.find((x) => x.id === bank.id)?.closing,
  );
  assert.equal(carry.find((x) => x.id === clearing.id)?.closing, "0.0000");
  const current = await finance.submit(f, {
    kind: "EXPENSE",
    categoryId: expense.id,
    amount: "1",
    occurredOn: "2026-11-25",
    method: "UPI",
    moneyAccountId: bank.id,
    idempotencyKey: randomUUID(),
  });
  await assert.rejects(
    () =>
      ledger.reverse(f, {
        source: "FINANCE",
        id: current.id,
        occurredOn: "2026-11-24",
        reason: "Cannot predate source",
        idempotencyKey: randomUUID(),
      }),
    checkStatus(422),
  );
  assert.equal(
    new Prisma.Decimal((await ledger.clientBalances(f, next))[0].opening).toFixed(4),
    "600.0000",
  );
  const directInput = {kind: "EXPENSE" as const, categoryId: expense.id, amount: "12", occurredOn: "2026-11-25", method: "UPI" as const, idempotencyKey: randomUUID()};
  await assert.rejects(() => finance.submit(f, {...directInput, moneyAccountId: bank.id}, true), checkStatus(422));
  await assert.rejects(() => finance.submit(f, {...directInput, enteredById: admin.id}, true), checkStatus(422));
  await assert.rejects(() => finance.submit(f, {...directInput, occurredOn: "2026-10-21"}, true), checkStatus(422));
  const direct = await finance.submit(f, directInput, true);
  const directRecord = await db.financialTransaction.findUniqueOrThrow({where:{id:direct.id}});
  // Personal clearing accounts are internal: user attribution is authoritative.
  assert.ok(directRecord.moneyAccountId);
  const personalClearing=await db.moneyAccount.findUniqueOrThrow({where:{id:directRecord.moneyAccountId!}});
  assert.equal(personalClearing.ownerUserId,founder.id);
  assert.equal(personalClearing.normalizedName,"personal-clearing-"+founder.id);
  assert.equal(directRecord.enteredById, founder.id);
  assert.equal(directRecord.status, "POSTED");
  console.info(
    "Finance ledger integration passed: balances, tenant/role isolation, stable categories, 5,001-row export, close/write race, immutable history and four reversal sources.",
  );
} finally {
  await db.$disconnect();
}
