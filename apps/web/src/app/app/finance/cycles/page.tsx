"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {AGENCY_START_DATE,agencyToday,businessCycle,cycleLabel} from "@digimarket/contracts";
import {useAuth} from "@/components/auth-provider";
import {Card,Notice,Spinner} from "@/components/ui";
import {FinanceFrame,FinancePager,money,useFinanceWindow} from "@/components/finance/shared";
import {PreviousCycleNetPosted} from "@/components/finance/previous-cycle-carry";
import {PersonalNetAfterSettlements} from "@/components/finance/personal-net-after-settlements";

type Summary={postedIncome:string;postedExpense:string;postedSalaryExpense:string;postedExpenseIncludingSalary:string;postedNet:string;clientAdSpend?:{posted:string};pendingIncome:string;pendingExpense:string};
type ExpenseSummary={postedTotalExpense:string;breakdown:{OTHER:string;SELF_ADS:string;CLIENT_ADS:string;SALARY:string}};
type Balance={opening:string;movement:string;remaining:string};
type FinanceRow={id:string;occurredOn:string;kind:string;status:string;amount:string;category:{name:string};description:string|null;merchantOrSource:string|null;enteredBy?:{displayName:string}};
type ExpensesRow={id:string;date:string;type:string;category:string;person:string;client:string;description:string;amount:string};
type Register<T>={items:T[];total:number;page:number;limit:number};
type Settlement={id:string;occurredOn:string;status:string;settlementDirection:"OUTGOING"|"INCOMING";amount:string;merchantOrSource:string;description:string};
const cycles=Array.from({length:120},(_,index)=>businessCycle(agencyToday(),-index)).filter(c=>c.from>=AGENCY_START_DATE);

export default function FinanceCyclesPage(){
 const w=useFinanceWindow(),{session,request}=useAuth();
 const [page,setPage]=useState(1),[expensePage,setExpensePage]=useState(1);
 const [summary,setSummary]=useState<Summary|null>(null),[expenseSummary,setExpenseSummary]=useState<ExpenseSummary|null>(null);
 const [balance,setBalance]=useState<Balance|null>(null),[register,setRegister]=useState<Register<FinanceRow>|null>(null);
 const [expenses,setExpenses]=useState<Register<ExpensesRow>|null>(null),[settlements,setSettlements]=useState<Settlement[]>([]);
 const [error,setError]=useState(""),[loading,setLoading]=useState(false);
 const founder=!!session?.identity.roles.includes("FOUNDER");
 const selected=cycles.find(c=>c.from===w.period.from&&c.to===w.period.to);
 useEffect(()=>{setPage(1);setExpensePage(1);},[w.period.from,w.period.to,w.view]);
 useEffect(()=>{
  if(!w.ready||!session)return;
  let active=true;setLoading(true);setError("");setSummary(null);setExpenseSummary(null);setBalance(null);
  const base=new URLSearchParams({...w.period,view:w.view}).toString();
  void Promise.all([
   request<Summary>("/finance/summary?"+base),
   request<ExpenseSummary>("/finance/total-expenses/summary?"+base),
   w.view==="all"?request<Balance>("/finance/cycle-balance?"+base).catch(()=>null):Promise.resolve(null),
   request<Register<FinanceRow>>("/finance/register?"+base+"&scope=agency&limit=25&page="+page),
   request<{items:ExpensesRow[];total:number;page:number;limit:number}>("/finance/total-expenses?"+base+"&type=ALL&limit=25&page="+expensePage),
   founder&&w.view==="mine"?request<Settlement[]>("/finance/internal-settlements/mine?"+base):Promise.resolve([] as Settlement[])
  ]).then(([a,b,c,d,e,f])=>{if(!active)return;setSummary(a);setExpenseSummary(b);setBalance(c);setRegister(d);setExpenses(e);setSettlements(f);})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:"Unable to read cycle history.");})
   .finally(()=>{if(active)setLoading(false);});
  return()=>{active=false};
 },[w.ready,w.query,w.view,w.period.from,w.period.to,session,request,page,expensePage,founder]);
 return <FinanceFrame title="Cycles" window={w}
  description="Current and previous 22nd-to-21st agency work cycles. Each cycle keeps its full financial history, while the remaining bookkeeping balance carries forward.">
  <section aria-label="Choose a financial cycle" className="space-y-3">
   <h2 className="text-lg font-semibold">Work cycles</h2>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
    {cycles.map((c,i)=><button type="button" key={c.from}
     className={"rounded-xl border p-4 text-left transition "+(selected?.from===c.from?"border-violet-400 bg-violet-500/10":"border-white/10 hover:border-violet-400/50")}
     onClick={()=>w.setPeriod({from:c.from,to:c.to})}>
     <span className="block text-sm font-semibold">{cycleLabel(c.key)}</span>
     <span className="mt-1 block text-xs text-slate-400">{i===0?"Current cycle":"Historical cycle"} · {c.from} to {c.to}</span>
    </button>)}
   </div>
  </section>
  {error&&<Notice kind="error">{error}</Notice>}
  {loading&&!summary&&<Spinner label="Loading cycle records…"/>}
  <section aria-label="Cycle financial summary" className="space-y-3">
   <h2 className="text-lg font-semibold">{selected?cycleLabel(selected.key):w.period.from+" to "+w.period.to} · {w.view==="mine"?"My entries":"Company entries"}</h2>
   <PreviousCycleNetPosted period={w.period} view={w.view} />
   {w.view==="mine"&&<PersonalNetAfterSettlements period={w.period}/>}
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {([
     ...(w.view==="all"?[
      ["Agency opening balance",balance?.opening] as const
     ]:[]),
     ["Income this cycle",summary?.postedIncome],
     ["Total expenses including salaries",expenseSummary?.postedTotalExpense],
     ...(w.view==="all"?[
      ["Agency net balance remaining",balance?.remaining] as const,
      ["Agency account movement this cycle",balance?.movement] as const
     ]:[]),
     ["Meta Ads client spending",summary?.clientAdSpend?.posted],
     ["Pending income",summary?.pendingIncome],
     ["Pending expenses",summary?.pendingExpense]
    ] as const).map(([label,value])=><Card key={label}><p className="text-sm text-slate-400">{label}</p>
     <strong className="mt-2 block text-xl">{value===undefined?(loading?"…":"Unavailable until backend deploy"):money(value)}</strong></Card>)}
   </div>
   <p className="text-sm text-slate-400">New-cycle income and expenses restart at zero. Agency account balances carry forward from the previous cycle. Settlement transfers change founders' personal balances, not company profit. Account balances are bookkeeping figures, not verified bank balances.</p>
   {expenseSummary&&<Card title="Expense breakdown"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {Object.entries(expenseSummary.breakdown).map(([name,value])=><div key={name}><p className="text-sm text-slate-400">{name.replaceAll("_"," ")}</p><strong>{money(value)}</strong></div>)}
   </div></Card>}
  </section>
  <section className="space-y-3" aria-label="Cycle income and expense transactions">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Income and expense register</h2>
    <Link className="btn-secondary" href={"/app/finance/entries?"+w.query}>Open register and exports</Link></div>
   <div className="overflow-x-auto"><table className="aw-finance-register"><thead><tr>
    {["Date","Type","Status","Category","Assigned to","Amount","Description"].map(x=><th key={x}>{x}</th>)}</tr></thead>
    <tbody>{register?.items.map(x=><tr key={x.id}><td>{x.occurredOn.slice(0,10)}</td><td>{x.kind}</td><td>{x.status}</td>
     <td>{x.category.name}</td><td>{x.enteredBy?.displayName??""}</td><td>{money(x.amount)}</td>
     <td>{x.description||x.merchantOrSource||""}</td></tr>)}</tbody>
   </table></div>
   {!register?.total&&!loading&&<p className="text-sm text-slate-400">No income or expense transactions in this cycle.</p>}
   {register&&<FinancePager page={page} total={register.total} limit={25} onChange={setPage}/>}
  </section>
  <section className="space-y-3" aria-label="Cycle expense details">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">All expenses, salaries and client ads</h2>
    <Link className="btn-secondary" href={"/app/finance/total-expenses?"+w.query}>Detailed expense report and CSV</Link></div>
   <div className="overflow-x-auto"><table className="aw-finance-register"><thead><tr>
    {["Date","Type","Category","Person","Client","Amount","Description"].map(x=><th key={x}>{x}</th>)}</tr></thead>
    <tbody>{expenses?.items.map(x=><tr key={x.id}><td>{x.date.slice(0,10)}</td><td>{x.type}</td><td>{x.category}</td>
     <td>{x.person}</td><td>{x.client}</td><td>{money(x.amount)}</td><td>{x.description}</td></tr>)}</tbody>
   </table></div>
   {!expenses?.total&&!loading&&<p className="text-sm text-slate-400">No recorded expenses for this cycle.</p>}
   {expenses&&<FinancePager page={expensePage} total={expenses.total} limit={25} onChange={setExpensePage}/>}
  </section>
  {founder&&w.view==="mine"&&<section className="space-y-3" aria-label="Internal settlements in this cycle">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Internal settlements</h2>
    <Link className="btn-secondary" href={"/app/finance/settlements?"+w.query}>Settlement history</Link></div>
   {settlements.map(s=><div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 p-3" key={s.id}>
    <div><p>{s.settlementDirection==="OUTGOING"?"Sent to ":"Received from "}{s.merchantOrSource}</p>
    <p className="text-xs text-slate-400">{s.occurredOn} · {s.status} · {s.description}</p></div>
    <strong>{s.settlementDirection==="OUTGOING"?"−":"+"}{money(s.amount)}</strong></div>)}
   {!settlements.length&&!loading&&<p className="text-sm text-slate-400">No settlements in this cycle.</p>}
  </section>}
 </FinanceFrame>;
}
