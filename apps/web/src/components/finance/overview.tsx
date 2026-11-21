"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  Users,
  ReceiptText,
  ShieldCheck,
  Tags,
  Megaphone,
  CalendarRange,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, Spinner } from "@/components/ui";
import { FinanceFrame, money, useFinanceWindow } from "./shared";
import type { TotalExpenseSummary } from "./total-expenses";
import { FinanceSectionWorkspace } from "./section-workspace";
import { PreviousCycleNetPosted } from "./previous-cycle-carry";
import {PersonalNetAfterSettlements,calculatePersonalNet} from "./personal-net-after-settlements";
type Balance = {opening:string;movement:string;remaining:string};
type MetaAdsTotals = {totalPosted:string};
type ClientFundBalance = {closing:string};
type Settlement = Parameters<typeof calculatePersonalNet>[1][number];
type SettlementTotals = {net:string;received:string;sent:string};
type FinanceCard = {
  title:string;description:string;href:string;icon:LucideIcon;
  amount?:string|null;metricLabel?:string;metricDetail?:string;
};
/** Sum the server's exact four-decimal amounts. Do not round intermediate funds. */
function sumMoney(values:string[]):string {
  let total=0n;
  for(const value of values){
    const parts=/^(-?)(\\d+)(?:\\.(\\d{1,4}))?$/.exec(value);
    if(!parts)throw new Error("Invalid finance amount");
    const amount=BigInt(parts[2])*10000n+BigInt((parts[3]??"").padEnd(4,"0"));
    total+=parts[1]==="-"?-amount:amount;
  }
  const abs=total<0n?-total:total;
  return (total<0n?"-":"")+(abs/10000n).toString()+"."+(abs%10000n).toString().padStart(4,"0");
}
type Totals = {
  postedIncome: string;
  postedExpense: string;
  postedSalaryExpense: string;
  agencyOperatingNet: string;
  clientAdSpend?: { posted: string };
  recurringIncome?: {monthlyCombinedTotal:string};
  pendingIncome: string;
  pendingExpense: string;
};
export function FinanceOverview() {
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [totals, setTotals] = useState<Totals | null>(null),
    [balance, setBalance] = useState<Balance | null>(null),
    [totalExpense, setTotalExpense] = useState<TotalExpenseSummary | null>(null),
    [metaAds, setMetaAds] = useState<string|null|undefined>(undefined),
    [clientFunds, setClientFunds] = useState<string|null|undefined>(undefined),
    [settlements, setSettlements] = useState<SettlementTotals|null|undefined>(undefined),
    [projected, setProjected] = useState<string|null|undefined>(undefined),
    [error, setError] = useState("");
  const all = !!session?.identity.permissions.includes("finance.read.all"),
    founder = !!session?.identity.roles.includes("FOUNDER");
  useEffect(() => {
    if (!w.ready || !session) return;
    let active = true;
    setTotals(null);
    setTotalExpense(null);
    setBalance(null);
    setError("");
    void Promise.all([
      request<Totals>("/finance/summary?" + w.query),
      request<TotalExpenseSummary>("/finance/total-expenses/summary?" + w.query),
      w.view==="all"&&all
        ? request<Balance>("/finance/cycle-balance?" + w.query).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([r, expense, balanceValue]) => {
        if (active) {
          setTotals(r);
          setTotalExpense(expense);
          setBalance(balanceValue);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.ready, w.query, session, request,all,w.view]);
  useEffect(()=>{
    if(!w.ready||!session)return;
    let active=true;
    setMetaAds(undefined);setClientFunds(undefined);setSettlements(undefined);setProjected(undefined);
    void request<MetaAdsTotals>("/finance/meta-ads-distribution?"+w.query)
      .then(result=>{if(active)setMetaAds(result.totalPosted)})
      .catch(()=>{if(active)setMetaAds(null)});
    if(all){
      void request<ClientFundBalance[]>("/finance/client-funds?"+w.query)
        .then(rows=>{if(active)setClientFunds(sumMoney(rows.map(row=>row.closing)))})
        .catch(()=>{if(active)setClientFunds(null)});
      if(w.view==="mine"){
        const query=new URLSearchParams({...w.period,view:"all"}).toString();
        void request<Totals>("/finance/summary?"+query)
          .then(result=>{if(active)setProjected(result.recurringIncome?.monthlyCombinedTotal??null)})
          .catch(()=>{if(active)setProjected(null)});
      }
    }
    if(founder){
      const query=new URLSearchParams(w.query).toString();
      void request<Settlement[]>("/finance/internal-settlements/mine?"+query)
        .then(rows=>{
          if(!active)return;
          // The personal history route has a limit of 200. Never display a partial sum.
          if(rows.length>=200){setSettlements(null);return;}
          const result=calculatePersonalNet("0.0000",rows);
          setSettlements({net:result.after,received:result.received,sent:result.sent});
        })
        .catch(()=>{if(active)setSettlements(null)});
    }
    return()=>{active=false};
  },[w.ready,w.query,w.view,w.period,session,request,all,founder]);
  const cards:FinanceCard[] = [
    {
      title: "Income",
      description: "Receipts by category",
      href: "/app/finance/income",
      amount: totalExpense?.postedIncome,
      metricLabel:"Posted this cycle",
      icon: ArrowDownLeft,
    },
    {
      title: "Expenses",
      description: "Operating expenses by category",
      href: "/app/finance/expenses",
      amount: totals?.postedExpense,
      metricLabel:"Posted this cycle",
      icon: ArrowUpRight,
    },
    {
      title: "Total expense",
      description: "All expenses, Meta Ads and salaries",
      href: "/app/finance/total-expenses",
      amount: totalExpense?.postedTotalExpense,
      metricLabel:"Including salaries · this cycle",
      icon: ReceiptText,
    },
    {
      title: "Meta Ads",
      description: "Self and client campaign spending",
      href: "/app/finance/ads",
      amount:metaAds,
      metricLabel:"Posted Meta Ads spend · this cycle",
      icon: Megaphone,
    },
    ...(all
      ? [
          {
            title: "Client ad funds",
            description: "Top-ups, refunds and client balances",
            href: "/app/finance/client-funds",
            amount:clientFunds,
            metricLabel:"Net client fund balance · at cycle end",
            icon: Wallet,
          },
        ]
      : []),
    ...(founder
      ? [
          {
            title: "Founder settlements",
            description: "Private settlement history and reimbursements",
            href: "/app/finance/settlements",
            amount:settlements?.net??(settlements===null?null:undefined),
            metricLabel:"My net transfers · this cycle",
            metricDetail:settlements
              ? "Received "+money(settlements.received)+" · Sent "+money(settlements.sent)
              : undefined,
            icon: Users,
          },
          {
            title: "Salaries",
            description: "Payroll, funding and payment history",
            href: "/app/salary",
            amount: totals?.postedSalaryExpense,
            metricLabel:"Paid / funded this cycle",
            icon: ReceiptText,
          },
        ]
      : []),
    ...(all
      ? [
          {
            title: "Agreement projections",
            description: "Expected service fees and ad budgets",
            href: "/app/finance/agreements",
            amount:w.view==="all"?totals?.recurringIncome?.monthlyCombinedTotal:projected,
            metricLabel:"Projected monthly contracts · not posted income",
            icon: CalendarRange,
          },
          {
            title: "Cycle closing",
            description: "Reconcile accounts and lock completed cycles",
            href: "/app/finance/closing",
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      title: "Cycles",
      description: "Previous cycle income, expenses, salaries and settlement history",
      href: "/app/finance/cycles",
      icon: CalendarRange,
    },
    {
      title: "Categories",
      description: "Manage stable income and expense categories",
      href: "/app/finance/categories",
      icon: Tags,
    },
  ];
  return (
    <FinanceFrame
      overview
      title="Finance"
      description="Choose a card to open its records. All figures follow the selected work cycle."
      window={w}
      actions={
        <Link href={"/app/finance/entries?" + w.query} className="btn-primary">
          New entry / register
        </Link>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      <p className="text-sm text-slate-400">Work cycles restart transaction totals on the 22nd. Remaining balances carry over. Internal settlements debit and credit founder balances without changing agency income or expense totals.</p>
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Finance overview totals">
        {w.view==="mine"&&founder&&<PersonalNetAfterSettlements period={w.period}/>}
        {[
          [w.view==="mine"?"Operating net (before settlements)":"Net operating money", totalExpense?.netOperatingMoney],
          ...(w.view==="all"&&all
            ? [["Agency balance carried forward",balance?.remaining] as const]
            : []),
          ["Pending income", totals?.pendingIncome],
          ["Pending expenses", totals?.pendingExpense],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="block mt-2 text-2xl">
              {value === undefined ? (error ? "Unavailable" : "…") : money(value)}
            </strong>
          </Card>
        ))}
      </div>
      <nav className="grid grid-cols-2 gap-4 xl:grid-cols-3" aria-label="Finance categories">
        {cards.map(({ title, description, href, amount, metricLabel, metricDetail, icon: Icon }) => (
          <Link
            key={title}
            href={href + "?" + w.query}
            className="group min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:border-violet-400/60 hover:bg-violet-500/5 focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            <div className="flex items-center justify-between">
              <Icon size={23} className="text-violet-300" />
              <ArrowRight size={18} className="text-slate-500 group-hover:text-violet-300" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
            {metricLabel && <div className="mt-4">
              <p className="text-xl font-semibold" data-testid={"finance-category-amount-"+title.toLowerCase().replaceAll(" ","-")}>
                {amount===undefined?"…":amount===null?"Unavailable":money(amount)}
              </p>
              <p className="mt-1 text-xs text-slate-400">{metricLabel}</p>
              {metricDetail&&<p className="mt-1 text-xs text-slate-400">{metricDetail}</p>}
            </div>}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-slate-400">
        Net operating money = posted income − Total expense. Total expense includes ordinary costs,
        self and client Meta Ads, and salaries counted once. Transfers and client fund deposits are
        separate.
      </p>
    </FinanceFrame>
  );
}
export function FinanceCategorySummary({ kind }: { kind: "INCOME" | "EXPENSE" }) {
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [addingExpense, setAddingExpense] = useState(false);
  const [expenseRefresh, setExpenseRefresh] = useState(0);
  const canAddExpense = kind === "EXPENSE" && !!session?.identity.roles.includes("FOUNDER") &&
    !!session?.identity.permissions.includes("finance.entry.create");
  const [data, setData] = useState<{
      ordinary: string;
      total: string;
      items: {
        id: string;
        name: string;
        posted: string;
        pending: string;
        count: number;
        active: boolean;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!w.ready || !session) return;
    let active = true;
    setData(null);
    setError("");
    void request<typeof data>("/finance/category-summary?" + w.query + "&kind=" + kind)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.ready, w.query, request, session, kind, expenseRefresh]);
  return (
    <FinanceFrame
      title={kind === "INCOME" ? "Income categories" : "Expense categories"}
      description="Open a category to view, search and export its transactions."
      window={w}
      actions={
        <div className="flex flex-wrap gap-2">
          {canAddExpense && <button type="button" className="btn-primary" aria-expanded={addingExpense}
            onClick={() => setAddingExpense(value => !value)}>{addingExpense ? "Close expense form" : "+ Add Expense"}</button>}
          <Link className={canAddExpense ? "btn-secondary" : "btn-primary"} href={"/app/finance/entries?" + w.query + "&kind=" + kind}>
            New entry / all records
          </Link>
        </div>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      {canAddExpense && addingExpense && <FinanceSectionWorkspace section="entries" directExpense
        onExpenseSaved={() => setExpenseRefresh(value => value + 1)} />}
      {!data && !error ? (
        <Spinner label="Loading category balances…" />
      ) : (
        data && (
          <>
            {kind === "INCOME" && <section aria-label="Previous cycle net posted shown in income">
              <PreviousCycleNetPosted period={w.period} view={w.view} />
            </section>}
            <div className="grid gap-3 sm:grid-cols-3" aria-label="Category totals">
              <Card>
                <p>{kind === "INCOME" ? "New income this cycle" : "Operating expenses"}</p>
                <strong>{money(data.ordinary)}</strong>
              </Card>
            </div>
            <nav
              className="grid grid-cols-2 gap-4 xl:grid-cols-3"
              aria-label="Financial category cards"
            >
              {data.items.map((c) => (
                <Link
                  className="rounded-xl border border-white/10 p-5 hover:border-violet-400"
                  key={c.id}
                  href={"/app/finance/entries?" + w.query + "&kind=" + kind + "&categoryId=" + c.id}
                >
                  <h2 className="font-semibold">
                    {c.name}
                    {!c.active && " · archived"}
                  </h2>
                  <p className="mt-3 text-xl">{money(c.posted)}</p>
                  <p className="text-sm text-slate-400">
                    {c.count} posted entries · Pending {money(c.pending)}
                  </p>
                </Link>
              ))}
            </nav>
            {!data.items.length && <Notice>No categories yet. Create them in Categories.</Notice>}
          </>
        )
      )}
    </FinanceFrame>
  );
}
