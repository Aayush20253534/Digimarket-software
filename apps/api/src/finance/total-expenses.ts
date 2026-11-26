import { Prisma, type PrismaClient } from "@digimarket/db";
import type { ReportingPeriod } from "@digimarket/contracts";
import type { Principal } from "../auth/service";
import { forbidden } from "../auth/errors";
import { isFounder } from "../approvals/founder";

export type ExpenseType = "OTHER" | "SELF_ADS" | "CLIENT_ADS" | "SALARY";
export type TotalExpenseQuery = ReportingPeriod & {
  view: "mine" | "all";
  page: number;
  limit: number;
  q: string;
  type: "ALL" | ExpenseType;
};
export type ActivityQuery=Omit<TotalExpenseQuery,"type">&{type:"ALL"|ExpenseType|"INCOME"|"SETTLEMENT";status:"ALL"|"POSTED"|"PENDING"|"REJECTED"|"CANCELLED"};
type ActivityRow=Omit<ExpenseRow,"type">&{type:Exclude<ActivityQuery["type"],"ALL">;status:string;method:string;direction:string};
type ExpenseRow = {
  id: string;
  date: Date;
  type: ExpenseType;
  category: string;
  person: string;
  client: string;
  description: string;
  amount: Prisma.Decimal;
  reversal: boolean;
};
type DB = Prisma.TransactionClient;
const money = (value: Prisma.Decimal | string) => new Prisma.Decimal(value).toFixed(4);
const csvCell = (value: string) =>
  '"' + value.replace(/^[=+@\-\t\r]/, "'$&").replaceAll('"', '""') + '"';

/** Posted expenses only. Salary recipients remain private to founders. */
export class TotalExpenseService {
  constructor(private readonly db: PrismaClient) {}

  private source(a: Principal, q: ReportingPeriod & { view: "mine" | "all" }, resetAt: Date | null = null) {
    if (!a.permissions.has(q.view === "all" ? "finance.read.all" : "finance.entry.read.own"))
      throw forbidden();
    const from = new Date(q.from + "T00:00:00Z"),
      to = new Date(q.to + "T00:00:00Z");
    const afterSettlementExpense = resetAt
      ? Prisma.sql`AND (t."postedAt" > ${resetAt} OR (t."postedAt" IS NULL AND t."createdAt" > ${resetAt}))`
      : Prisma.empty;
    const afterSettlementSalary = resetAt
      ? Prisma.sql`AND p."createdAt" > ${resetAt}`
      : Prisma.empty;
    // My entries uses the amount funded by this founder, not the salary received.
    // In Agency, each payment appears once even when several founders funded it.
    const salaries =
      q.view === "mine"
        ? Prisma.sql`SELECT 'salary:' || p.id::text AS id, p."paidOn" AS date, 'SALARY'::text AS type,
          'Salary'::text AS category, ${isFounder(a) ? Prisma.sql`u."displayName"` : Prisma.sql`''::text`} AS person,
          ''::text AS client, ${isFounder(a) ? Prisma.sql`COALESCE(p.note, 'Salary funded')` : Prisma.sql`'Salary funded'::text`} AS description,
          SUM(f.amount) AS amount, p."reversesId" IS NOT NULL AS reversal
        FROM "SalaryPayment" p JOIN "SalaryFundingAllocation" f ON f."paymentId"=p.id
        JOIN "SalaryFundingAccount" account ON account.id=f."accountId"
        JOIN "User" u ON u.id=p."recipientUserId"
        WHERE p."organizationId"=${a.organizationId}::uuid AND account."organizationId"=${a.organizationId}::uuid
          AND account."founderUserId"=${a.userId}::uuid AND p.status='PAID' AND p."paidOn" BETWEEN ${from} AND ${to}
          ${afterSettlementSalary}
        GROUP BY p.id, u."displayName"`
        : isFounder(a)
          ? Prisma.sql`SELECT 'salary:' || p.id::text AS id, p."paidOn" AS date, 'SALARY'::text AS type,
            'Salary'::text AS category, u."displayName" AS person, ''::text AS client,
            COALESCE(p.note, 'Salary paid') AS description, p.amount, p."reversesId" IS NOT NULL AS reversal
          FROM "SalaryPayment" p JOIN "User" u ON u.id=p."recipientUserId"
          WHERE p."organizationId"=${a.organizationId}::uuid AND p.status='PAID' AND p."paidOn" BETWEEN ${from} AND ${to}`
          : Prisma.sql`SELECT 'salary-day:' || p."paidOn"::text AS id, p."paidOn" AS date, 'SALARY'::text AS type,
            'Salary'::text AS category, ''::text AS person, ''::text AS client,
            'Daily salary total (including reversals)'::text AS description, SUM(p.amount) AS amount, false AS reversal
          FROM "SalaryPayment" p WHERE p."organizationId"=${a.organizationId}::uuid
            AND p.status='PAID' AND p."paidOn" BETWEEN ${from} AND ${to} GROUP BY p."paidOn"`;
    return Prisma.sql`WITH expenses AS (
      SELECT 'finance:' || t.id::text AS id, t."occurredOn" AS date,
        CASE WHEN c.purpose='META_ADS' THEN CASE WHEN t."clientId" IS NULL THEN 'SELF_ADS' ELSE 'CLIENT_ADS' END ELSE 'OTHER' END AS type,
        c.name AS category, u."displayName" AS person, COALESCE(client."businessName", '') AS client,
        COALESCE(t.description, t."merchantOrSource", '') AS description, t.amount, t."reversesId" IS NOT NULL AS reversal
      FROM "FinancialTransaction" t JOIN "FinancialCategory" c ON c.id=t."categoryId"
      JOIN "User" u ON u.id=t."enteredById" LEFT JOIN "Client" client ON client.id=t."clientId"
      WHERE t."organizationId"=${a.organizationId}::uuid AND t.kind='EXPENSE' AND t.status='POSTED'
        AND t."occurredOn" BETWEEN ${from} AND ${to}
        ${q.view === "mine" ? Prisma.sql`AND t."enteredById"=${a.userId}::uuid` : Prisma.empty}
        ${afterSettlementExpense}
      UNION ALL ${salaries}
    )`;
  }

  // Read-only classification across the existing ledgers. The expense CTE
  // remains the single source for posted salary attribution and payroll privacy.
  private activitySource(a:Principal,q:ActivityQuery){
    const from=new Date(q.from+"T00:00:00Z"),to=new Date(q.to+"T00:00:00Z");
    const scope=q.view==="mine"?Prisma.sql`AND t."enteredById"=${a.userId}::uuid`:Prisma.empty;
    const settlements=q.view==="all"||isFounder(a)?Prisma.sql`
      UNION ALL SELECT 'settlement:'||s.id::text,s."occurredOn",'SETTLEMENT'::text,'Internal settlement'::text,
        concat(sender."displayName",' → ',recipient."displayName"),''::text,COALESCE(s.note,''),s.amount,false,
        CASE WHEN s."voidedAt" IS NULL THEN 'POSTED' ELSE 'CANCELLED' END,s.method::text,
        ${q.view==="mine"?Prisma.sql`CASE WHEN s."senderId"=${a.userId}::uuid THEN 'OUTGOING' ELSE 'INCOMING' END`:Prisma.sql`'TRANSFER'::text`}
      FROM "InternalSettlement" s JOIN "User" sender ON sender.id=s."senderId" JOIN "User" recipient ON recipient.id=s."recipientId"
      WHERE s."organizationId"=${a.organizationId}::uuid AND s."occurredOn" BETWEEN ${from} AND ${to}
        ${q.view==="mine"?Prisma.sql`AND (s."senderId"=${a.userId}::uuid OR s."recipientId"=${a.userId}::uuid)`:Prisma.empty}
    `:Prisma.empty;
    return Prisma.sql`${this.source(a,q)}, activity AS (
      SELECT e.*, 'POSTED'::text AS status, COALESCE(t.method::text,'') AS method,'OUTGOING'::text AS direction
        FROM expenses e LEFT JOIN "FinancialTransaction" t ON e.id='finance:'||t.id::text AND t."organizationId"=${a.organizationId}::uuid
      UNION ALL SELECT 'finance:'||t.id::text,t."occurredOn",
        CASE WHEN t.kind='INCOME' THEN 'INCOME' WHEN c.purpose='META_ADS' THEN CASE WHEN t."clientId" IS NULL THEN 'SELF_ADS' ELSE 'CLIENT_ADS' END ELSE 'OTHER' END,
        c.name,u."displayName",COALESCE(client."businessName",''),COALESCE(t.description,t."merchantOrSource",''),t.amount,t."reversesId" IS NOT NULL,
        t.status::text,t.method::text,CASE WHEN t.kind='INCOME' THEN 'INCOMING' ELSE 'OUTGOING' END
      FROM "FinancialTransaction" t JOIN "FinancialCategory" c ON c.id=t."categoryId" JOIN "User" u ON u.id=t."enteredById" LEFT JOIN "Client" client ON client.id=t."clientId"
      WHERE t."organizationId"=${a.organizationId}::uuid AND t."occurredOn" BETWEEN ${from} AND ${to}
        AND (t.kind='INCOME' OR t.status<>'POSTED') ${scope}
      ${settlements}
    )`;
  }
  private activityFilter(q:ActivityQuery){
    return Prisma.sql`WHERE true
      ${q.type==="ALL"?Prisma.empty:Prisma.sql`AND type=${q.type}`}
      ${q.status==="ALL"?Prisma.empty:Prisma.sql`AND status=${q.status}`}
      ${q.q?Prisma.sql`AND strpos(lower(concat_ws(' ',category,person,client,description,type,method)),lower(${q.q}))>0`:Prisma.empty}`;
  }
  async activity(a:Principal,q:ActivityQuery){
    const source=this.activitySource(a,q),filter=this.activityFilter(q);
    return this.db.$transaction(async tx=>{
      const [[count],rows]=await Promise.all([
        tx.$queryRaw<{count:bigint}[]>(Prisma.sql`${source} SELECT COUNT(*) AS count FROM activity ${filter}`),
        tx.$queryRaw<ActivityRow[]>(Prisma.sql`${source} SELECT * FROM activity ${filter} ORDER BY date DESC,id DESC LIMIT ${q.limit} OFFSET ${(q.page-1)*q.limit}`)
      ]);
      return {items:rows.map(r=>({...r,date:r.date.toISOString().slice(0,10),amount:money(r.amount)})),total:Number(count.count),page:q.page,limit:q.limit};
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead});
  }
  async exportActivity(a:Principal,q:ActivityQuery){
    const source=this.activitySource(a,q),filter=this.activityFilter(q);
    const csv=await this.db.$transaction(async tx=>{
      const lines=["ID,Date,Type,Category,Person,Client,Description,Amount,Direction,Status,Method,Reversal"];
      for(let skip=0;;skip+=1000){
        const rows=await tx.$queryRaw<ActivityRow[]>(Prisma.sql`${source} SELECT * FROM activity ${filter} ORDER BY date DESC,id DESC LIMIT 1000 OFFSET ${skip}`);
        for(const r of rows)lines.push([r.id,r.date.toISOString().slice(0,10),r.type,r.category,r.person,r.client,r.description,money(r.amount),r.direction,r.status,r.method,r.reversal?"Yes":"No"].map(csvCell).join(","));
        if(rows.length<1000)break;
      }
      return lines.join("\r\n");
    },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:60000});
    return {csv,filename:"financial-activity-"+q.from+"-"+q.to+".csv"};
  }

  private filter(q: TotalExpenseQuery) {
    return Prisma.sql`WHERE true
      ${q.type === "ALL" ? Prisma.empty : Prisma.sql`AND type=${q.type}`}
      ${q.q ? Prisma.sql`AND strpos(lower(concat_ws(' ', category, person, client, description, type)), lower(${q.q})) > 0` : Prisma.empty}`;
  }

  private async readSummary(db: DB, a: Principal, q: ReportingPeriod & { view: "mine" | "all" }) {
    // Settlement transfers affect personal balances, not expense categorization.
    const [row] = await db.$queryRaw<{
      postedIncome:string;postedTotalExpense:string;other:string;selfAds:string;clientAds:string;salary:string;
    }[]>(Prisma.sql`${this.source(a,q)} SELECT
      COALESCE(SUM(amount),0)::text AS "postedTotalExpense",
      COALESCE(SUM(amount) FILTER(WHERE type='OTHER'),0)::text AS other,
      COALESCE(SUM(amount) FILTER(WHERE type='SELF_ADS'),0)::text AS "selfAds",
      COALESCE(SUM(amount) FILTER(WHERE type='CLIENT_ADS'),0)::text AS "clientAds",
      COALESCE(SUM(amount) FILTER(WHERE type='SALARY'),0)::text AS salary,
      (SELECT COALESCE(SUM(t.amount),0)::text FROM "FinancialTransaction" t
       WHERE t."organizationId"=${a.organizationId}::uuid AND t.kind='INCOME' AND t.status='POSTED'
       AND t."occurredOn" BETWEEN ${new Date(q.from+"T00:00:00Z")} AND ${new Date(q.to+"T00:00:00Z")}
       ${q.view==="mine"?Prisma.sql`AND t."enteredById"=${a.userId}::uuid`:Prisma.empty}) AS "postedIncome"
     FROM expenses`);
    return {personalSettlementResetAt:null,postedIncome:money(row.postedIncome),
      postedTotalExpense:money(row.postedTotalExpense),
      netOperatingMoney:money(new Prisma.Decimal(row.postedIncome).minus(row.postedTotalExpense)),
      breakdown:{OTHER:money(row.other),SELF_ADS:money(row.selfAds),CLIENT_ADS:money(row.clientAds),SALARY:money(row.salary)}};
  }

  async summary(a: Principal, q: ReportingPeriod & { view: "mine" | "all" }) {
    return this.readSummary(this.db, a, q);
  }

  async records(a: Principal, q: TotalExpenseQuery) {
    const source = this.source(a, q),
      filter = this.filter(q);
    return this.db.$transaction(
      async (tx) => {
        const [summary, [count], rows] = await Promise.all([
          this.readSummary(tx, a, q),
          tx.$queryRaw<{ count: bigint; amount: string }[]>(Prisma.sql`${source}
          SELECT COUNT(*) AS count, COALESCE(SUM(amount),0)::text AS amount FROM expenses ${filter}`),
          tx.$queryRaw<ExpenseRow[]>(Prisma.sql`${source} SELECT * FROM expenses ${filter}
          ORDER BY date DESC, id DESC LIMIT ${q.limit} OFFSET ${(q.page - 1) * q.limit}`),
        ]);
        return {
          summary,
          items: rows.map((r) => ({
            ...r,
            date: r.date.toISOString().slice(0, 10),
            amount: money(r.amount),
          })),
          total: Number(count.count),
          matchingAmount: money(count.amount),
          page: q.page,
          limit: q.limit,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }

  async export(a: Principal, q: TotalExpenseQuery) {
    const source = this.source(a, q),
      filter = this.filter(q);
    const csv = await this.db.$transaction(
      async (tx) => {
        const lines = ["ID,Date,Type,Category,Person,Client,Description,Amount,Reversal"];
        for (let skip = 0; ; skip += 1000) {
          const rows = await tx.$queryRaw<
            ExpenseRow[]
          >(Prisma.sql`${source} SELECT * FROM expenses ${filter}
          ORDER BY date DESC, id DESC LIMIT 1000 OFFSET ${skip}`);
          for (const r of rows)
            lines.push(
              [
                r.id,
                r.date.toISOString().slice(0, 10),
                r.type,
                r.category,
                r.person,
                r.client,
                r.description,
                money(r.amount),
                r.reversal ? "Yes" : "No",
              ]
                .map(csvCell)
                .join(","),
            );
          if (rows.length < 1000) break;
        }
        return lines.join("\r\n");
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60_000 },
    );
    return { csv, filename: `total-expense-${q.from}-${q.to}.csv` };
  }
}
