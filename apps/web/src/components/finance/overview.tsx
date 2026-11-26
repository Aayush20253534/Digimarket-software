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
// The opening balance predates the selected cycle. Its closing balance already
// contains current-cycle account movements, so adding those again would double count.
function agencyOperatingMoney(opening:string,income:string,expense:string):string|null {
  const units=(value:string):bigint|null=>{
    const match=/^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value);
    if(!match)return null;
    const absolute=BigInt(match[2])*10000n+BigInt((match[3]??"").padEnd(4,"0"));
    return match[1]==="-"?-absolute:absolute;
  };
  const start=units(opening),received=units(income),spent=units(expense);
  if(start===null||received===null||spent===null)return null;
  const net=start+received-spent;
  const absolute=net<0n?-net:net;
  return (net<0n?"-":"")+(absolute/10000n).toString()+"."+(absolute%10000n).toString().padStart(4,"0");
}

type MetaAdsTotals = {totalPosted:string};
type OwnClientSpend = {posted:string;entries:number};
type AgencySettlements = {postedTotal:string;postedCount:number;voidedCount:number;total:number};
type Settlement = Parameters<typeof calculatePersonalNet>[1][number];
type SettlementTotals = {net:string;received:string;sent:string};
type FinanceCard = {
  title:string;description:string;href:string;icon:LucideIcon;
  amount?:string|null;metricLabel?:string;metricDetail?:string;
};
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
export function FinanceOverview(){
  const w=useFinanceWindow();
  return <FinanceFrame overview title="Finance" description="Choose a card to open its records. All figures follow the selected work cycle." window={w}
    actions={<Link href={"/app/finance/entries?"+w.query} className="btn-primary">New entry / register</Link>}>
    <FinanceOverviewContent w={w}/>
  </FinanceFrame>;
}

// The same cards, server totals and destinations power the main dashboard
// and historical cycle inspection. A single parent owns the selected dates.
export function FinanceOverviewContent({w,refresh=0,cycleDetails=false}:{
  w:ReturnType<typeof useFinanceWindow>;refresh?:number;cycleDetails?:boolean;
}){
  const {session,request}=useAuth();
  const [totals, setTotals] = useState<Totals | null>(null),
    [balance, setBalance] = useState<Balance | null>(null),
    [totalExpense, setTotalExpense] = useState<TotalExpenseSummary | null>(null),
    [metaAds, setMetaAds] = useState<string|null|undefined>(undefined),
    [myClientSpend,setMyClientSpend] = useState<OwnClientSpend|null|undefined>(undefined),
    [agencySettlements,setAgencySettlements] = useState<AgencySettlements|null|undefined>(undefined),
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
  }, [w.ready, w.query, session, request,all,w.view,refresh]);
  useEffect(()=>{
    if(!w.ready||!session)return;
    let active=true;
    setMetaAds(undefined);setSettlements(undefined);setProjected(undefined);
    setMyClientSpend(undefined);setAgencySettlements(undefined);
    void request<MetaAdsTotals>("/finance/meta-ads-distribution?"+w.query)
      .then(result=>{if(active)setMetaAds(result.totalPosted)})
      .catch(()=>{if(active)setMetaAds(null)});
    if(w.view==="mine"){
      void request<OwnClientSpend>("/finance/client-ad-spend/mine?"+new URLSearchParams(w.period).toString())
        .then(result=>{if(active)setMyClientSpend(result)})
        .catch(()=>{if(active)setMyClientSpend(null)});
    }
    if(all){
      if(w.view==="all"){
        void request<AgencySettlements>("/finance/internal-settlements/all?"+
          new URLSearchParams({...w.period,page:"1",limit:"1"}).toString())
          .then(result=>{if(active)setAgencySettlements(result)})
          .catch(()=>{if(active)setAgencySettlements(null)});
      }
      if(w.view==="mine"){
        const query=new URLSearchParams({...w.period,view:"all"}).toString();
        void request<Totals>("/finance/summary?"+query)
          .then(result=>{if(active)setProjected(result.recurringIncome?.monthlyCombinedTotal??null)})
          .catch(()=>{if(active)setProjected(null)});
      }
    }
    if(founder&&w.view==="mine"){
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
  },[w.ready,w.query,w.view,w.period,session,request,all,founder,refresh]);
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
            description:w.view==="mine"?"Client Meta Ads paid from my account":"Total client Meta Ads spent across all founder accounts",
            href: "/app/finance/client-funds",
            amount:w.view==="mine"
              ?myClientSpend?.posted??(myClientSpend===null?null:undefined)
              :totals?.clientAdSpend?.posted,
            metricLabel:w.view==="mine"
              ?"Posted client ads paid from my account · this cycle"
              :"Posted client Meta Ads · all accounts · this cycle",
            metricDetail:w.view==="mine"&&myClientSpend
              ?myClientSpend.entries+" account-funded entries"
              :undefined,
            icon: Wallet,
          },
        ]
      : []),
    ...(founder || (all && w.view==="all")
      ? [
          {
            title: "Founder settlements",
            description: "Private settlement history and reimbursements",
            href: "/app/finance/settlements",
            amount:w.view==="all"
              ?agencySettlements?.postedTotal??(agencySettlements===null?null:undefined)
              :settlements?.net??(settlements===null?null:undefined),
            metricLabel:w.view==="all"?"All founders' transfers · this cycle":"My net transfers · this cycle",
            metricDetail:w.view==="all"
              ?agencySettlements
                ?agencySettlements.postedCount+" active settlements · "+
                  agencySettlements.voidedCount+" voided · company net effect ₹0.00"
                :undefined
              :settlements
                ?"Received "+money(settlements.received)+" · Sent "+money(settlements.sent)
                :undefined,
            icon: Users,
          },
          ...(!cycleDetails&&founder?[{
            title: "Salaries",
            description: "Payroll, funding and payment history",
            href: "/app/finance?tab=salary",
            amount: totals?.postedSalaryExpense,
            metricLabel:"Paid / funded this cycle",
            icon: ReceiptText,
          }]:[]),
        ]
      : []),
    ...(cycleDetails?[{
      title:"Salaries",description:"Salary expenses funded or paid in the selected cycle",
      href:"/app/finance/total-expenses?type=SALARY",
      amount:totalExpense?.breakdown?.SALARY,metricLabel:"Paid / funded this cycle",icon:ReceiptText,
    }]:[]),
    ...(all&&!cycleDetails
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
            description: "Verify income and expenses and manually close the cycle",
            href: "/app/finance/closing",
            icon: ShieldCheck,
          },
        ]
      : []),
    ...(!cycleDetails? [{
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
    }]:[]),
  ];
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {!cycleDetails&&<p className="text-sm text-slate-400">Posted totals follow your work cycle. Balances carry forward; settlements do not change agency income or expense totals.</p>}
      {!cycleDetails&&<div className="grid gap-3 sm:grid-cols-3" aria-label="Finance overview totals">
        {w.view==="mine"&&founder&&<PersonalNetAfterSettlements period={w.period}/>}
        {[
          [w.view==="mine"?"Operating net (before settlements)":"Net operating money",
            w.view==="all"&&all
              ? totalExpense ? balance ? agencyOperatingMoney(balance.opening,totalExpense.postedIncome,totalExpense.postedTotalExpense) : null : undefined
              : totalExpense?.netOperatingMoney],
          ...(w.view==="all"&&all
            ? [["Agency balance carried forward",balance?.opening??(totalExpense?null:undefined)] as const]
            : []),
          ["Pending income", totals?.pendingIncome],
          ["Pending expenses", totals?.pendingExpense],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="block mt-2 text-2xl">
              {value === undefined ? (error ? "Unavailable" : "…") : value===null ? "Unavailable" : money(value)}
            </strong>
          </Card>
        ))}
      </div>}
      {!cycleDetails&&totalExpense?.breakdown&&<section className="fc-breakdown" aria-label="Expense classification"><h2>Expense classification</h2><p>Posted costs · salary counted once · settlements excluded</p><div className="fc-class-grid">{([["Operating expenses","OTHER"],["Agency-funded Meta Ads","SELF_ADS"],["Client-funded Meta Ads","CLIENT_ADS"],["Salary paid / funded","SALARY"]] as const).map(([label,key])=><Link key={key} href={"/app/finance/total-expenses?type="+key+"&"+w.query}><span>{label}</span><strong>{totalExpense.breakdown[key]===undefined?"Unavailable":money(totalExpense.breakdown[key])}</strong></Link>)}</div><p>Internal settlements are transfers, not company expenses. Client-funded ads remain separately classified.</p></section>}
      <nav className="grid grid-cols-2 gap-4 xl:grid-cols-3" aria-label={cycleDetails?"Cycle finance categories":"Finance categories"}>
        {cards.map(({ title, description, href, amount, metricLabel, metricDetail, icon: Icon }) => (
          <Link
            key={title}
            href={href + (href.includes("?")?"&":"?") + w.query + (cycleDetails?"&cycle=1":"")}
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
        {w.view==="all"&&all&&!cycleDetails
          ?"Net operating money = agency balance carried forward + posted income this cycle − Total expense."
          :"Operating net = posted income − Total expense."} Total expense includes ordinary costs,
        self and client Meta Ads, and salaries counted once. Transfers and client fund deposits are
        separate.
      </p>
    </>
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
