import { Prisma, type PrismaClient } from "@digimarket/db";
import {
  AGENCY_START_DATE,
  agencyToday,
  businessCycle,
  dateOnlyRange,
  type ReportingPeriod,
} from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { AuthError, forbidden, invalid } from "../auth/errors";
import { founderPolicy } from "../approvals/founder";
type DB = Prisma.TransactionClient;
export type MoneyPage = { page: number; limit: number; q: string };
const day = (s: string) => new Date(s + "T00:00:00Z");
const textDay = (d: Date) => d.toISOString().slice(0, 10);
const decimal = (x: Prisma.Decimal | string | number | null) => new Prisma.Decimal(x ?? 0);
const missing = () => new AuthError(404, "NOT_FOUND", "Financial record not found");
export function ledgerRead(a: Principal) {
  if (!a.permissions.has("finance.read.all")) throw forbidden();
}
export function ledgerWrite(a: Principal) {
  ledgerRead(a);
  if (!a.roles.some((r) => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r))) throw forbidden();
}
export async function financeLock(db: DB, org: string) {
  await db.$queryRaw`SELECT 1 FROM (SELECT pg_advisory_xact_lock(hashtextextended(${org + ":finance-close"},0))) AS financial_lock`;
}
export async function openPeriod(db: DB, org: string, date: string) {
  if (
    await db.financePeriodClose.findFirst({
      where: { organizationId: org, from: { lte: day(date) }, to: { gte: day(date) } },
    })
  )
    throw new AuthError(
      409,
      "FINANCE_CYCLE_CLOSED",
      "This work cycle is closed. Record a reversal in an open cycle.",
    );
}
async function account(db: DB, org: string, id: string, date?: string) {
  const found = await db.moneyAccount.findFirst({
    where: { id, organizationId: org, active: true },
  });
  if (!found) throw invalid("Choose an active account in this workspace");
  if (date && textDay(found.openingOn) > date)
    throw invalid("The account opening date is after this transaction");
  return found;
}
async function audit(
  db: DB,
  a: Principal,
  action: string,
  id: string,
  data: Prisma.InputJsonValue = {},
) {
  await db.auditLog.create({
    data: {
      organizationId: a.organizationId,
      actorId: a.userId,
      action,
      entityType: "FinanceLedger",
      entityId: id,
      afterRedacted: data,
    },
  });
}
type Balance = {
  id: string;
  name: string;
  kind: string;
  ownerUserId: string | null;
  ownerName: string | null;
  openingOn: Date;
  openingBalance: string;
  opening: string;
  movement: string;
  closing: string;
};
// A user's clearing account records attribution, not a verified cash/bank balance.
export async function ensurePersonalMoneyAccount(db: DB, organizationId: string, userId: string): Promise<string> {
  const normalizedName = "personal-clearing-" + userId;
  const existing = await db.moneyAccount.findUnique({
    where: { organizationId_normalizedName: { organizationId, normalizedName } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const user = await db.user.findFirst({
    where: { id: userId, organizationId, status: "ACTIVE" },
    select: { id: true, displayName: true },
  });
  if (!user) throw invalid("Signed-in user has no active account in this workspace");
  const row = await db.moneyAccount.upsert({
    where: { organizationId_normalizedName: { organizationId, normalizedName } },
    create: {
      organizationId, normalizedName,
      name: (user.displayName + " - personal clearing (unverified)").slice(0,120),
      kind: "CASH", ownerUserId: userId, createdById: userId,
      openingOn: day(AGENCY_START_DATE), openingBalance: "0",
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}
export class FinanceLedgerService {
  constructor(
    private readonly db: PrismaClient,
    private readonly today: () => string = agencyToday,
  ) {}
  async owners(a: Principal) {
    ledgerRead(a);
    return this.db.user.findMany({
      where: {
        organizationId: a.organizationId,
        status: "ACTIVE",
      },
      select: { id: true, displayName: true },
      orderBy: { displayName: "asc" },
    });
  }

  async options(a: Principal) {
    if (!a.permissions.has("finance.read.all") && !a.permissions.has("finance.entry.create"))
      throw forbidden();
    return this.db.moneyAccount.findMany({
      where: { organizationId: a.organizationId, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, kind: true, ownerUserId: true, openingOn: true },
    });
  }
  async createAccount(
    a: Principal,
    input: {
      name: string;
      kind: "BANK" | "CASH" | "UPI" | "FOUNDER";
      ownerUserId?: string;
      openingOn: string;
      openingBalance: string;
    },
  ) {
    ledgerWrite(a);
    if (input.kind === "FOUNDER" && !input.ownerUserId)
      throw invalid("Founder clearing accounts require a founder owner");
    if (input.openingOn < AGENCY_START_DATE || input.openingOn > this.today())
      throw invalid("Opening date must be between agency start and today");
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      await openPeriod(tx, a.organizationId, input.openingOn);
      if (
        input.ownerUserId &&
        !(await tx.user.findFirst({
          where: {
            id: input.ownerUserId,
            organizationId: a.organizationId,
            status: "ACTIVE",
            ...(input.kind === "FOUNDER"
              ? { roles: { some: { role: { key: "FOUNDER" } } } }
              : {}),
          },
        }))
      )
        throw invalid(input.kind === "FOUNDER"
          ? "Select an active founder in this workspace"
          : "Select an active user in this workspace");
      const row = await tx.moneyAccount.create({
        data: {
          ...input,
          organizationId: a.organizationId,
          createdById: a.userId,
          normalizedName: input.name.trim().toLowerCase().replace(/\s+/g, " "),
          openingOn: day(input.openingOn),
        },
      });
      await audit(tx, a, "finance.account_created", row.id, {
        openingBalance: input.openingBalance,
        openingOn: input.openingOn,
      });
      return row;
    });
  }
  async correctAccount(
    a: Principal,
    input: { id: string; name: string; openingOn: string; openingBalance: string; note: string },
  ) {
    ledgerWrite(a);
    if (input.openingOn < AGENCY_START_DATE || input.openingOn > this.today())
      throw invalid("Opening date must be between agency start and today");
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      const old = await account(tx, a.organizationId, input.id);
      await openPeriod(tx, a.organizationId, textDay(old.openingOn));
      await openPeriod(tx, a.organizationId, input.openingOn);
      const [before] = await tx.$queryRaw<
        { count: bigint }[]
      >`SELECT count(*) FROM "FinanceMoneyMovement" WHERE "moneyAccountId"=${old.id}::uuid AND "occurredOn"<${day(input.openingOn)}`;
      if (Number(before.count))
        throw invalid("Opening date cannot be after existing account movements");
      const row = await tx.moneyAccount.update({
        where: { id: old.id },
        data: {
          name: input.name,
          normalizedName: input.name.toLowerCase().replace(/\s+/g, " "),
          openingOn: day(input.openingOn),
          openingBalance: input.openingBalance,
        },
      });
      await audit(tx, a, "finance.account_corrected", row.id, {
        oldName: old.name,
        oldOpeningOn: textDay(old.openingOn),
        oldOpeningBalance: old.openingBalance.toFixed(4),
        name: row.name,
        openingOn: input.openingOn,
        openingBalance: input.openingBalance,
        note: input.note,
      });
      return row;
    });
  }
  async balances(a: Principal, p: ReportingPeriod, db: DB = this.db) {
    ledgerRead(a);
    const rows = await db.$queryRaw<
      Balance[]
    >`SELECT a."id",a."name",a."kind"::text,a."ownerUserId",u."displayName" AS "ownerName",a."openingOn",a."openingBalance"::text,
   (CASE WHEN a."openingOn"<=${day(p.from)} THEN a."openingBalance" ELSE 0 END+COALESCE(SUM(m."amount") FILTER(WHERE m."occurredOn"<${day(p.from)}),0))::text AS "opening",
   (CASE WHEN a."openingOn">${day(p.from)} AND a."openingOn"<=${day(p.to)} THEN a."openingBalance" ELSE 0 END+COALESCE(SUM(m."amount") FILTER(WHERE m."occurredOn">=${day(p.from)}),0))::text AS "movement",
   (CASE WHEN a."openingOn"<=${day(p.to)} THEN a."openingBalance" ELSE 0 END+COALESCE(SUM(m."amount"),0))::text AS "closing"
   FROM "MoneyAccount" a LEFT JOIN "User" u ON u."id"=a."ownerUserId"
   LEFT JOIN "FinanceMoneyMovement" m ON m."moneyAccountId"=a."id" AND m."organizationId"=a."organizationId" AND m."occurredOn">=a."openingOn" AND m."occurredOn"<=${day(p.to)}
   WHERE a."organizationId"=${a.organizationId}::uuid AND a."active"=true AND a."openingOn"<=${day(p.to)} GROUP BY a."id",u."displayName" ORDER BY a."name"`;
    return rows.map((r) => ({
      ...r,
      openingOn: textDay(r.openingOn),
      opening: decimal(r.opening).toFixed(4),
      movement: decimal(r.movement).toFixed(4),
      closing: decimal(r.closing).toFixed(4),
    }));
  }
  async accountHistory(a: Principal, p: ReportingPeriod, id: string, q: MoneyPage) {
    ledgerRead(a);
    await account(this.db, a.organizationId, id);
    const founder = a.roles.includes("FOUNDER");
    // Settlement details are private to the sending and receiving founders.
    // Agency account totals still include both sides of the transfer.
    const source = founder
      ? Prisma.sql`(SELECT m.* FROM "FinanceMoneyMovement" m
         WHERE m."source"<>'SETTLEMENT' OR EXISTS (
           SELECT 1 FROM "InternalSettlement" s WHERE s."id"=m."sourceId"
             AND s."organizationId"=${a.organizationId}::uuid
             AND (s."senderId"=${a.userId}::uuid OR s."recipientId"=${a.userId}::uuid)
         )) movement`
      : Prisma.sql`(
   SELECT * FROM "FinanceMoneyMovement" WHERE "source" NOT IN ('SALARY','SETTLEMENT')
   UNION ALL SELECT 'salary-total:'||"moneyAccountId"||':'||"occurredOn", "organizationId","moneyAccountId","occurredOn",'SALARY_TOTAL',NULL::uuid,SUM("amount"),'Salary funding (daily total)',MAX("createdAt"),NULL::uuid,NULL::uuid
   FROM "FinanceMoneyMovement" WHERE "source"='SALARY' GROUP BY "organizationId","moneyAccountId","occurredOn"
  ) movement`;
    const where = Prisma.sql`"organizationId"=${a.organizationId}::uuid AND "moneyAccountId"=${id}::uuid AND "occurredOn">=${day(p.from)} AND "occurredOn"<=${day(p.to)} AND "description" ILIKE ${"%" + q.q + "%"}`;
    const rows = await this.db.$queryRaw<
      {
        key: string;
        occurredOn: Date;
        source: string;
        sourceId: string | null;
        amount: string;
        description: string;
        reversesId: string | null;
        reversedBy: string | null;
      }[]
    >`SELECT "key","occurredOn","source","sourceId","amount"::text,"description","reversesId","reversedBy" FROM ${source} WHERE ${where} ORDER BY "occurredOn" DESC,"createdAt" DESC,"key" DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`;
    const [total] = await this.db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM ${source} WHERE ${where}`;
    return {
      items: rows.map((r) => ({ ...r, occurredOn: textDay(r.occurredOn) })),
      total: Number(total.count),
      page: q.page,
      limit: q.limit,
    };
  }
  async unassigned(a: Principal, p: ReportingPeriod, page: MoneyPage) {
    ledgerRead(a);
    const period = dateOnlyRange(p);
    const [finance, salary, financeCount, salaryCount] = await Promise.all([
      this.db.financialTransaction.findMany({
        where: {
          organizationId: a.organizationId,
          status: "POSTED",
          moneyAccountId: null,
          occurredOn: period,
        },
        include: { category: true, enteredBy: { select: { displayName: true } } },
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.db.salaryFundingAllocation.findMany({
        where: {
          moneyAccountId: null,
          payment: { organizationId: a.organizationId, status: "PAID", paidOn: period },
        },
        include: {
          payment: { include: { recipient: { select: { displayName: true } } } },
          account: { include: { founder: { select: { displayName: true } } } },
        },
        orderBy: { id: "desc" },
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.db.financialTransaction.count({
        where: {
          organizationId: a.organizationId,
          status: "POSTED",
          moneyAccountId: null,
          occurredOn: period,
        },
      }),
      this.db.salaryFundingAllocation.count({
        where: {
          moneyAccountId: null,
          payment: { organizationId: a.organizationId, status: "PAID", paidOn: period },
        },
      }),
    ]);
    return {
      finance: finance.map((r) => ({
        id: r.id,
        date: textDay(r.occurredOn),
        amount: r.amount.toFixed(4),
        label: r.category.name + " · " + r.enteredBy.displayName,
      })),
      salary: a.roles.includes("FOUNDER")
        ? salary.map((r) => ({
            id: r.id,
            date: textDay(r.payment.paidOn),
            amount: r.amount.toFixed(4),
            label:
              r.payment.recipient.displayName + " · funded by " + r.account.founder.displayName,
          }))
        : [],
      financeCount,
      salaryCount,
      page: page.page,
      limit: page.limit,
    };
  }
  async link(a: Principal, input: { source: "finance" | "salary"; id: string; accountId: string }) {
    ledgerWrite(a);
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      if (input.source === "finance") {
        const row = await tx.financialTransaction.findFirst({
          where: {
            id: input.id,
            organizationId: a.organizationId,
            status: { in: ["POSTED", "PENDING"] },
          },
          include: { reversedBy: true },
        });
        if (!row) throw missing();
        if (row.reversesId || row.reversedBy)
          throw invalid("Reversed records keep their original accounts");
        await account(tx, a.organizationId, input.accountId, textDay(row.occurredOn));
        await openPeriod(tx, a.organizationId, textDay(row.occurredOn));
        await tx.financialTransaction.update({
          where: { id: row.id },
          data: { moneyAccountId: input.accountId },
        });
      } else {
        if (!a.roles.includes("FOUNDER")) throw forbidden();
        const row = await tx.salaryFundingAllocation.findFirst({
          where: { id: input.id, payment: { organizationId: a.organizationId, status: "PAID" } },
          include: { payment: { include: { reversedBy: true } } },
        });
        if (!row) throw missing();
        if (row.payment.reversesId || row.payment.reversedBy)
          throw invalid("Reversed salary records keep their original accounts");
        await account(tx, a.organizationId, input.accountId, textDay(row.payment.paidOn));
        await openPeriod(tx, a.organizationId, textDay(row.payment.paidOn));
        await tx.salaryFundingAllocation.update({
          where: { id: row.id },
          data: { moneyAccountId: input.accountId },
        });
      }
      await audit(tx, a, "finance.account_linked", input.id, {
        source: input.source,
        accountId: input.accountId,
      });
      return { linked: true };
    });
  }
  async clientBalances(a: Principal, p: ReportingPeriod, db: DB = this.db) {
    ledgerRead(a);
    return db.$queryRaw<
      {
        id: string;
        name: string;
        opening: string;
        received: string;
        refunded: string;
        spent: string;
        adjustments: string;
        closing: string;
      }[]
    >`
   WITH movement AS (
    SELECT "clientId","occurredOn","amount",CASE WHEN "kind"='TOPUP' THEN "amount" ELSE 0 END AS received,CASE WHEN "kind"='REFUND' THEN -"amount" ELSE 0 END AS refunded,0::numeric AS spent,CASE WHEN "kind"='REVERSAL' THEN "amount" ELSE 0 END AS adjustments FROM "ClientFundEntry" WHERE "organizationId"=${a.organizationId}::uuid
    UNION ALL SELECT "clientId","occurredOn",-"amount",0,0,"amount",0 FROM "FinancialTransaction" WHERE "organizationId"=${a.organizationId}::uuid AND "clientId" IS NOT NULL AND "status"='POSTED'
   ) SELECT c."id",c."businessName" AS name,COALESCE(SUM(m.amount) FILTER(WHERE m."occurredOn"<${day(p.from)}),0)::text AS opening,
    COALESCE(SUM(m.received) FILTER(WHERE m."occurredOn">=${day(p.from)}),0)::text AS received,COALESCE(SUM(m.refunded) FILTER(WHERE m."occurredOn">=${day(p.from)}),0)::text AS refunded,
    COALESCE(SUM(m.spent) FILTER(WHERE m."occurredOn">=${day(p.from)}),0)::text AS spent,COALESCE(SUM(m.adjustments) FILTER(WHERE m."occurredOn">=${day(p.from)}),0)::text AS adjustments,COALESCE(SUM(m.amount),0)::text AS closing
    FROM "Client" c LEFT JOIN movement m ON m."clientId"=c."id" AND m."occurredOn"<=${day(p.to)} WHERE c."organizationId"=${a.organizationId}::uuid GROUP BY c."id" ORDER BY c."businessName"`;
  }
  async clientHistory(a: Principal, p: ReportingPeriod, clientId: string, page: MoneyPage) {
    ledgerRead(a);
    if (
      !(await this.db.client.findFirst({
        where: { id: clientId, organizationId: a.organizationId },
      }))
    )
      throw missing();
    const data = Prisma.sql`(SELECT "id",'FUNDS'::text AS source,"kind"::text,"amount","occurredOn","note" AS description,"createdAt","reversesId",(SELECT r."id" FROM "ClientFundEntry" r WHERE r."reversesId"="ClientFundEntry"."id") AS "reversedBy" FROM "ClientFundEntry" WHERE "organizationId"=${a.organizationId}::uuid AND "clientId"=${clientId}::uuid
   UNION ALL SELECT "id",'FINANCE',CASE WHEN "reversesId" IS NULL THEN 'SPEND' ELSE 'SPEND_REVERSAL' END,-"amount","occurredOn",COALESCE("description",'Meta Ads spend'),"createdAt","reversesId",(SELECT r."id" FROM "FinancialTransaction" r WHERE r."reversesId"="FinancialTransaction"."id") FROM "FinancialTransaction" WHERE "organizationId"=${a.organizationId}::uuid AND "clientId"=${clientId}::uuid AND "status"='POSTED') history`;
    const where = Prisma.sql`"occurredOn">=${day(p.from)} AND "occurredOn"<=${day(p.to)} AND description ILIKE ${"%" + page.q + "%"}`;
    const items = await this.db.$queryRaw<
      {
        id: string;
        source: string;
        kind: string;
        amount: string;
        occurredOn: Date;
        description: string;
        reversesId: string | null;
      }[]
    >`SELECT id,source,kind,amount::text,"occurredOn",description,"reversesId","reversedBy" FROM ${data} WHERE ${where} ORDER BY "occurredOn" DESC,"createdAt" DESC,id DESC LIMIT ${page.limit} OFFSET ${(page.page - 1) * page.limit}`;
    const [total] = await this.db.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*) FROM ${data} WHERE ${where}`;
    return {
      items: items.map((r) => ({ ...r, occurredOn: textDay(r.occurredOn) })),
      total: Number(total.count),
      page: page.page,
      limit: page.limit,
    };
  }
  async recordFunds(
    a: Principal,
    input: {
      clientId: string;
      accountId: string;
      kind: "TOPUP" | "REFUND";
      amount: string;
      occurredOn: string;
      note: string;
      reference?: string;
      idempotencyKey: string;
    },
  ) {
    ledgerWrite(a);
    const amount = decimal(input.amount);
    if (amount.lte(0)) throw invalid("Amount must be positive");
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      await openPeriod(tx, a.organizationId, input.occurredOn);
      await account(tx, a.organizationId, input.accountId, input.occurredOn);
      if (
        !(await tx.client.findFirst({
          where: { id: input.clientId, organizationId: a.organizationId },
        }))
      )
        throw missing();
      if (input.kind === "REFUND") {
        const balance = (
          await this.clientBalances(a, { from: AGENCY_START_DATE, to: input.occurredOn }, tx)
        ).find((c) => c.id === input.clientId);
        if (!balance || decimal(balance.closing).lt(amount))
          throw invalid("Refund exceeds recorded client funds on that date");
      }
      const row = await tx.clientFundEntry.create({
        data: {
          organizationId: a.organizationId,
          clientId: input.clientId,
          moneyAccountId: input.accountId,
          recordedById: a.userId,
          idempotencyKey: input.idempotencyKey,
          kind: input.kind,
          amount: input.kind === "TOPUP" ? amount : amount.negated(),
          occurredOn: day(input.occurredOn),
          note: input.note,
          reference: input.reference,
        },
      });
      await audit(tx, a, "finance.client_funds_recorded", row.id, {
        kind: row.kind,
        amount: row.amount.toFixed(4),
        clientId: row.clientId,
      });
      return row;
    });
  }
  async transfer(
    a: Principal,
    input: {
      fromAccountId: string;
      toAccountId: string;
      amount: string;
      occurredOn: string;
      note: string;
      idempotencyKey: string;
    },
  ) {
    ledgerWrite(a);
    if (input.fromAccountId === input.toAccountId || decimal(input.amount).lte(0))
      throw invalid("Choose two different accounts and a positive amount");
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      await openPeriod(tx, a.organizationId, input.occurredOn);
      await account(tx, a.organizationId, input.fromAccountId, input.occurredOn);
      await account(tx, a.organizationId, input.toAccountId, input.occurredOn);
      const row = await tx.moneyTransfer.create({
        data: {
          ...input,
          organizationId: a.organizationId,
          recordedById: a.userId,
          occurredOn: day(input.occurredOn),
        },
      });
      await audit(tx, a, "finance.transfer_recorded", row.id, {
        fromAccountId: row.fromAccountId,
        toAccountId: row.toAccountId,
        amount: row.amount.toFixed(4),
      });
      return row;
    });
  }
  async transfers(a: Principal, p: ReportingPeriod, page: MoneyPage) {
    ledgerRead(a);
    const where = {
      organizationId: a.organizationId,
      occurredOn: dateOnlyRange(p),
      note: { contains: page.q, mode: "insensitive" as const },
    };
    const [items, total] = await Promise.all([
      this.db.moneyTransfer.findMany({
        where,
        include: {
          fromAccount: { select: { name: true } },
          toAccount: { select: { name: true } },
          reversedBy: { select: { id: true } },
        },
        orderBy: [{ occurredOn: "desc" }, { id: "desc" }],
        skip: (page.page - 1) * page.limit,
        take: page.limit,
      }),
      this.db.moneyTransfer.count({ where }),
    ]);
    return { items, total, page: page.page, limit: page.limit };
  }
  async reconcile(
    a: Principal,
    input: { accountId: string; asOf: string; statementBalance: string; note: string },
  ) {
    ledgerWrite(a);
    if (input.asOf >= this.today()) throw invalid("Reconcile a completed business day");
    return this.db.$transaction(async (tx) => {
      await financeLock(tx, a.organizationId);
      await openPeriod(tx, a.organizationId, input.asOf);
      await account(tx, a.organizationId, input.accountId, input.asOf);
      const row = (
        await this.balances(a, { from: businessCycle(input.asOf).from, to: input.asOf }, tx)
      ).find((x) => x.id === input.accountId)!;
      const data = {
        organizationId: a.organizationId,
        reconciledById: a.userId,
        statementBalance: input.statementBalance,
        expectedBalance: row.closing,
        note: input.note,
      };
      const result = await tx.moneyReconciliation.upsert({
        where: { moneyAccountId_asOf: { moneyAccountId: row.id, asOf: day(input.asOf) } },
        create: { ...data, moneyAccountId: row.id, asOf: day(input.asOf) },
        update: { ...data, createdAt: new Date() },
      });
      await audit(tx, a, "finance.account_reconciled", result.id, {
        accountId: row.id,
        asOf: input.asOf,
        statementBalance: input.statementBalance,
        expectedBalance: row.closing,
      });
      return {
        ...result,
        difference: decimal(input.statementBalance).minus(row.closing).toFixed(4),
      };
    });
  }
  async review(a: Principal, p: ReportingPeriod, db: DB = this.db) {
    ledgerRead(a);
    const [
      accounts,
      closed,
      reconciliations,
      pending,
      unassignedFinance,
      unassignedSalary,
      clientFunds,
    ] = await Promise.all([
      this.balances(a, p, db),
      db.financePeriodClose.findUnique({
        where: { organizationId_from: { organizationId: a.organizationId, from: day(p.from) } },
      }),
      db.moneyReconciliation.findMany({
        where: { organizationId: a.organizationId, asOf: day(p.to) },
      }),
      db.financialTransaction.count({
        where: {
          organizationId: a.organizationId,
          occurredOn: dateOnlyRange(p),
          status: "PENDING",
        },
      }),
      db.financialTransaction.count({
        where: {
          organizationId: a.organizationId,
          occurredOn: dateOnlyRange(p),
          status: "POSTED",
          moneyAccountId: null,
        },
      }),
      db.salaryFundingAllocation.count({
        where: {
          moneyAccountId: null,
          payment: { organizationId: a.organizationId, paidOn: dateOnlyRange(p), status: "PAID" },
        },
      }),
      this.clientBalances(a, p, db),
    ]);
    const cycle = businessCycle(p.from),
      blockers: string[] = [];
    if (cycle.from !== p.from || cycle.to !== p.to || p.from < AGENCY_START_DATE)
      blockers.push("Select one complete work cycle starting on the 22nd.");
    if (p.to >= this.today()) blockers.push("The selected cycle has not ended.");
    const priorDate = day(p.from);
    priorDate.setUTCDate(priorDate.getUTCDate() - 1);
    const previous = businessCycle(textDay(priorDate));
    if (
      p.from > AGENCY_START_DATE &&
      !(await db.financePeriodClose.findUnique({
        where: {
          organizationId_from: { organizationId: a.organizationId, from: day(previous.from) },
        },
      }))
    )
      blockers.push("Close the previous work cycle first so opening balances are fixed.");
    if (pending) blockers.push(pending + " financial entries await approval.");
    if (unassignedFinance + unassignedSalary)
      blockers.push(
        unassignedFinance +
          unassignedSalary +
          " transactions or salary allocations need an account.",
      );
    const eligible = accounts.filter((x) => x.openingOn <= p.to);
    if (!eligible.length)
      blockers.push("Create and reconcile at least one cash, bank or founder clearing account.");
    const checked = eligible.map((row) => {
      const record = reconciliations.find((r) => r.moneyAccountId === row.id);
      const matched =
        !!record &&
        decimal(record.statementBalance).eq(row.closing) &&
        decimal(record.expectedBalance).eq(row.closing);
      return { ...row, matched, statementBalance: record?.statementBalance.toFixed(4) ?? null };
    });
    if (checked.some((r) => !r.matched))
      blockers.push("Every account needs a matching reconciliation for the cycle's last day.");
    return {
      from: p.from,
      to: p.to,
      closed,
      accounts: checked,
      clientFunds,
      clientDeficits: clientFunds
        .filter((r) => decimal(r.closing).lt(0))
        .map((r) => ({ id: r.id, name: r.name, closing: r.closing })),
      pending,
      unassignedFinance,
      unassignedSalary,
      blockers,
      canClose: !closed && !blockers.length,
    };
  }
  async close(a: Principal, p: ReportingPeriod, note: string, confirmClientDeficits = false) {
    ledgerWrite(a);
    return this.db.$transaction(
      async (tx) => {
        await financeLock(tx, a.organizationId);
        const review = await this.review(a, p, tx);
        if (review.closed)
          throw new AuthError(409, "ALREADY_CLOSED", "This cycle is already closed");
        if (review.blockers.length)
          throw new AuthError(409, "CLOSE_BLOCKED", review.blockers.join(" "));
        if (review.clientDeficits.length && !confirmClientDeficits)
          throw new AuthError(
            409,
            "CLIENT_FUNDS_REVIEW_REQUIRED",
            "Review and explicitly confirm outstanding client ad balances before closing.",
          );
        const row = await tx.financePeriodClose.create({
          data: {
            organizationId: a.organizationId,
            from: day(p.from),
            to: day(p.to),
            closedById: a.userId,
            note,
            snapshot: JSON.parse(JSON.stringify({ ...review, confirmClientDeficits })),
          },
        });
        await audit(tx, a, "finance.cycle_closed", row.id, { from: p.from, to: p.to });
        return row;
      },
      { timeout: 30_000 },
    );
  }
  async reverse(
    a: Principal,
    input: {
      source: "FINANCE" | "SALARY" | "FUNDS" | "TRANSFER";
      id: string;
      occurredOn: string;
      reason: string;
      idempotencyKey: string;
    },
  ) {
    ledgerWrite(a);
    return this.db.$transaction(
      async (tx) => {
        await financeLock(tx, a.organizationId);
        await openPeriod(tx, a.organizationId, input.occurredOn);
        const occurredOn = day(input.occurredOn);
        let result: { id: string };
        const checkDate = (original: Date) => {
          if (occurredOn < original) throw invalid("A reversal cannot predate its original entry");
        };
        if (input.source === "FINANCE") {
          const old = await tx.financialTransaction.findFirst({
            where: { id: input.id, organizationId: a.organizationId, status: "POSTED" },
            include: {
              reversedBy: true,
              verifiedPayment: true,
              _count: { select: { costAllocations: true } },
            },
          });
          if (!old) throw missing();
          if (old.reversedBy || old.reversesId)
            throw invalid("This entry is already a reversal or has been reversed");
          if (old.verifiedPayment || old._count.costAllocations)
            throw invalid(
              "Resolve the linked billing receipt or project allocation before reversing this entry",
            );
          if (!old.moneyAccountId)
            throw invalid("Assign a money account to the original entry before reversing it");
          checkDate(old.occurredOn);
          await account(tx, a.organizationId, old.moneyAccountId, input.occurredOn);
          const policy = await founderPolicy(tx, a.organizationId, "FINANCE");
          const approval = await tx.approvalRequest.create({
            data: {
              organizationId: a.organizationId,
              policyId: policy.id,
              requesterId: a.userId,
              title: "Reversal of " + old.id,
              description: input.reason,
              referenceType: "FINANCE_ENTRY",
              approverRoleKeys: policy.approverRoleKeys,
              status: "APPROVED",
              decidedAt: new Date(),
            },
          });
          result = await tx.financialTransaction.create({
            data: {
              organizationId: a.organizationId,
              enteredById: old.enteredById,
              categoryId: old.categoryId,
              approvalRequestId: approval.id,
              clientId: old.clientId,
              moneyAccountId: old.moneyAccountId,
              idempotencyKey: input.idempotencyKey,
              kind: old.kind,
              amount: old.amount.negated(),
              currencyCode: old.currencyCode,
              occurredOn,
              method: old.method,
              merchantOrSource: old.merchantOrSource,
              description: "Reversal of " + old.id + ": " + input.reason,
              status: "POSTED",
              postedAt: new Date(),
              reversesId: old.id,
            },
          });
          await tx.approvalRequest.update({
            where: { id: approval.id },
            data: { referenceId: result.id },
          });
          await tx.approvalDecision.create({
            data: {
              requestId: approval.id,
              actorId: a.userId,
              outcome: "APPROVED",
              reason: input.reason,
            },
          });
        } else if (input.source === "SALARY") {
          if (!a.roles.includes("FOUNDER")) throw forbidden();
          const old = await tx.salaryPayment.findFirst({
            where: { id: input.id, organizationId: a.organizationId, status: "PAID" },
            include: { allocations: true, reversedBy: true },
          });
          if (!old) throw missing();
          if (old.reversedBy || old.reversesId)
            throw invalid("This salary has already been reversed");
          checkDate(old.paidOn);
          if (old.allocations.some((r) => !r.moneyAccountId))
            throw invalid("Assign money accounts to every salary allocation before reversing it");
          const row = await tx.salaryPayment.create({
            data: {
              organizationId: a.organizationId,
              recipientUserId: old.recipientUserId,
              createdById: a.userId,
              idempotencyKey: input.idempotencyKey,
              amount: old.amount.negated(),
              salaryMonth: businessCycle(input.occurredOn).key,
              paidOn: occurredOn,
              method: old.method,
              note: input.reason,
              status: "PAID",
              reversesId: old.id,
            },
          });
          for (const allocation of old.allocations) {
            if (allocation.moneyAccountId)
              await account(tx, a.organizationId, allocation.moneyAccountId, input.occurredOn);
            await tx.salaryFundingAllocation.create({
              data: {
                paymentId: row.id,
                accountId: allocation.accountId,
                moneyAccountId: allocation.moneyAccountId,
                amount: allocation.amount.negated(),
              },
            });
          }
          result = row;
        } else if (input.source === "FUNDS") {
          const old = await tx.clientFundEntry.findFirst({
            where: { id: input.id, organizationId: a.organizationId },
            include: { reversedBy: true },
          });
          if (!old) throw missing();
          if (old.reversedBy || old.reversesId)
            throw invalid("This client-funds entry has already been reversed");
          checkDate(old.occurredOn);
          await account(tx, a.organizationId, old.moneyAccountId, input.occurredOn);
          result = await tx.clientFundEntry.create({
            data: {
              organizationId: a.organizationId,
              clientId: old.clientId,
              moneyAccountId: old.moneyAccountId,
              recordedById: a.userId,
              idempotencyKey: input.idempotencyKey,
              kind: "REVERSAL",
              amount: old.amount.negated(),
              occurredOn,
              note: input.reason,
              reversesId: old.id,
            },
          });
        } else {
          const old = await tx.moneyTransfer.findFirst({
            where: { id: input.id, organizationId: a.organizationId },
            include: { reversedBy: true },
          });
          if (!old) throw missing();
          if (old.reversedBy || old.reversesId)
            throw invalid("This transfer has already been reversed");
          checkDate(old.occurredOn);
          await account(tx, a.organizationId, old.fromAccountId, input.occurredOn);
          await account(tx, a.organizationId, old.toAccountId, input.occurredOn);
          result = await tx.moneyTransfer.create({
            data: {
              organizationId: a.organizationId,
              fromAccountId: old.toAccountId,
              toAccountId: old.fromAccountId,
              recordedById: a.userId,
              idempotencyKey: input.idempotencyKey,
              amount: old.amount,
              occurredOn,
              note: input.reason,
              reversesId: old.id,
            },
          });
        }
        await audit(tx, a, "finance.reversal_recorded", result.id, {
          source: input.source,
          originalId: input.id,
          date: input.occurredOn,
          reason: input.reason,
        });
        return result;
      },
      { timeout: 30_000 },
    );
  }
}
