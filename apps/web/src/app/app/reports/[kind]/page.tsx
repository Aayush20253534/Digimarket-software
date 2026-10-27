"use client";
import Link from "next/link";
import {useParams} from "next/navigation";
import {useAuth} from "@/components/auth-provider";
import {Notice,PageHeader,Spinner} from "@/components/ui";
import {ArrowDownToLine,ArrowLeft,ArrowRight,CalendarRange,Filter,RefreshCcw,Search,TrendingUp,Wallet} from "lucide-react";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";

type Kind="INCOME"|"EXPENSE";
type Transaction={id:string;occurredOn:string;amount:string;method:string;merchantOrSource:string|null;
 description:string|null;postedAt:string|null;category:string;enteredBy:string};
type Breakdown={kind:Kind;from:string;to:string;currency:string;total:string;
 transactionCount:number;categories:{id:string;name:string;total:string;count:number}[];
 monthly:{month:string;total:string;count:number}[];
 daily:{date:string;total:string;count:number}[];
 people:{id:string;name:string;loginId:string;total:string;count:number}[];
 search:string;matchingTotal:string;
 matchingCount:number;page:number;limit:number;hasMore:boolean;transactions:Transaction[]};
const today=()=>new Date().toISOString().slice(0,10);
const currentMonth=()=>today().slice(0,7)+"-01";
const money=(value:string)=>{
 const isNegative=value.startsWith("-"),raw=isNegative?value.slice(1):value;
 const [whole,dec=""]=raw.split("."),padded=dec.padEnd(3,"0");
 const cents=BigInt(whole||"0")*100n+BigInt(padded.slice(0,2))+(Number(padded[2])>=5?1n:0n);
 const digits=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",");
 return (isNegative?"−":"")+"₹"+digits+"."+(cents%100n).toString().padStart(2,"0");
};
const pretty=(value:string)=>new Date(value+"T00:00:00Z").toLocaleDateString("en-IN",
 {timeZone:"UTC",day:"2-digit",month:"short",year:"numeric"});
const monthTitle=(month:string)=>new Date(month+"-01T00:00:00Z").toLocaleDateString("en-IN",
 {timeZone:"UTC",month:"short",year:"2-digit"});
const errorMessage=(error:unknown)=>error instanceof Error?error.message:"Unable to load financial records.";
export default function FinanceBreakdownPage(){
 const raw=useParams<{kind:string}>().kind;
 const kind:Kind|null=raw==="income"?"INCOME":raw==="expenses"?"EXPENSE":null;
 const isIncome=kind==="INCOME";
 const {session,request}=useAuth();
 const allowed=!!session?.identity.permissions.includes("reports.business.read")&&
  !!session?.identity.permissions.includes("finance.read.all");
 const [from,setFrom]=useState(currentMonth),[to,setTo]=useState(today);
 const [ready,setReady]=useState(false);
 const [query,setQuery]=useState("");
 const [page,setPage]=useState(1);
 const [selectedMonth,setSelectedMonth]=useState<string|null>(null);
 const [selectedDay,setSelectedDay]=useState<string|null>(null);
 const [selectedPersonId,setSelectedPersonId]=useState<string|null>(null);
 const [records,setRecords]=useState<Breakdown|null>(null);
 const [busy,setBusy]=useState(false);
 const [exporting,setExporting]=useState(false);
 const [error,setError]=useState("");
 const seq=useRef(0);
 useEffect(()=>{
   const params=new URLSearchParams(window.location.search);
   const a=params.get("from"),b=params.get("to");
   if(a&&b&&/^\d{4}-\d{2}-\d{2}$/.test(a)&&/^\d{4}-\d{2}-\d{2}$/.test(b)&&a<=b){
     setFrom(a);setTo(b);
   }
   setReady(true);
 },[]);
 const params=useMemo(()=>new URLSearchParams({
   kind:kind??"INCOME",from,to,q:query,page:String(page),limit:"20",
   ...(selectedDay?{day:selectedDay}:{}),
   ...(selectedPersonId?{personId:selectedPersonId}:{}),
 }),[kind,from,to,query,page,selectedDay,selectedPersonId]);
 const refresh=useCallback(async()=>{
   if(!ready||!session||!allowed||!kind)return;
   if(!from||!to||from>to){setError("Select a valid start and end date.");return;}
   const current=++seq.current;setBusy(true);setError("");
   try{
     const data=await request<Breakdown>("/finance/report-breakdown?"+params.toString());
     if(current===seq.current)setRecords(data);
   }catch(e){if(current===seq.current)setError(errorMessage(e));}
   finally{if(current===seq.current)setBusy(false);}
 },[ready,session,allowed,kind,from,to,params,request]);
 useEffect(()=>{void refresh();return()=>{seq.current+=1;};},[refresh]);
 const changePeriod=(start:string,end:string)=>{
   setFrom(start);setTo(end);setPage(1);
   setSelectedMonth(null);setSelectedDay(null);setSelectedPersonId(null);
 };
 const preset=(mode:"current"|"three"|"year"|"all")=>{
   const current=new Date(),origin=new Date(Date.UTC(current.getFullYear(),current.getMonth(),1));
   if(mode==="current")changePeriod(currentMonth(),today());
   else if(mode==="three"){origin.setUTCMonth(origin.getUTCMonth()-2);changePeriod(origin.toISOString().slice(0,10),today());}
   else if(mode==="year")changePeriod(today().slice(0,4)+"-01-01",today());
   else changePeriod("1970-01-01",today());
 };
 const exportCsv=async()=>{
  if(!records||!allowed||!kind||exporting||from>to)return;
  setExporting(true);setError("");
  try{
   const exportQuery=new URLSearchParams(params);
   exportQuery.delete("page");exportQuery.delete("limit");
   const result=await request<{filename:string;csv:string;count:number}>(
     "/finance/report-breakdown/export?"+exportQuery.toString());
   const blob=new Blob([result.csv],{type:"text/csv;charset=utf-8"});
   const url=URL.createObjectURL(blob);
   const anchor=document.createElement("a");
   anchor.href=url;anchor.download=result.filename;
   document.body.appendChild(anchor);anchor.click();anchor.remove();
   URL.revokeObjectURL(url);
  }catch(e){setError(errorMessage(e));}
  finally{setExporting(false);}
 };
 const chartMonths=(records?.monthly??[]).slice(-18);
 const maxMonth=Math.max(1,...chartMonths.map(x=>Number(x.total)));
 const categoryMax=Math.max(1,...(records?.categories??[]).map(x=>Number(x.total)));
 const personMax=Math.max(1,...(records?.people??[]).map(x=>Number(x.total)));
 const activePerson=records?.people.find(p=>p.id===selectedPersonId);
 const dailyForMonth:Breakdown["daily"]=[];
 if(records&&selectedMonth){
   const firstDay=selectedMonth+"-01";
   const [year,month]=selectedMonth.split("-").map(Number);
   const finalDay=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
   const start=records.from>firstDay?records.from:firstDay;
   const end=records.to<finalDay?records.to:finalDay;
   const byDate=new Map(records.daily.map(entry=>[entry.date,entry]));
   if(start<=end){
     const cursor=new Date(start+"T00:00:00.000Z");
     for(let i=0;i<31&&cursor.toISOString().slice(0,10)<=end;i++){
       const date=cursor.toISOString().slice(0,10);
       dailyForMonth.push(byDate.get(date)??{date,total:"0.0000",count:0});
       cursor.setUTCDate(cursor.getUTCDate()+1);
     }
   }
 }
 const dayMax=Math.max(1,...dailyForMonth.map(x=>Number(x.total)));
 const back="/app/reports?"+new URLSearchParams({from,to}).toString();
 if(!session)return <Spinner label="Checking report permissions…"/>;
 if(!kind)return <Notice kind="error">Unknown financial report.</Notice>;
 if(!allowed)return <Notice kind="error">Business reporting and full finance reading permissions are required.</Notice>;
 return <div className="aw-report-page aw-finance-breakdown space-y-5" data-testid="finance-breakdown-page" data-aw-module="finance-breakdown">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <Link href={back} className="aw-report-back"><ArrowLeft size={16}/>Back to Reports</Link>
   <Link href="/app/finance" className="aw-report-back"><Wallet size={16}/>Finance register</Link>
  </div>
  <PageHeader eyebrow="AGENCY FINANCIAL INTELLIGENCE"
    title={isIncome?"Income Breakdown":"Expense Breakdown"}
    description="Verified posted transactions, matched to the selected Reports period. Pending, rejected and cancelled entries are excluded."/>
  <section className="aw-report-breakdown-filter" aria-label="Financial breakdown filters">
   <div className="flex items-center gap-2 font-bold"><CalendarRange size={17}/>Reporting period</div>
   <div className="aw-report-preset-row">
    <button type="button" onClick={()=>preset("current")}>This month</button>
    <button type="button" onClick={()=>preset("three")}>Last 3 months</button>
    <button type="button" onClick={()=>preset("year")}>This year</button>
    <button type="button" onClick={()=>preset("all")}>All time</button>
   </div>
   <div className="aw-report-breakdown-fields">
    <label>From<input aria-label="Breakdown from date" className="field" type="date"
      value={from} max={to} onChange={e=>changePeriod(e.target.value,to)}/></label>
    <label>Through<input aria-label="Breakdown to date" className="field" type="date"
      value={to} min={from} onChange={e=>changePeriod(from,e.target.value)}/></label>
    <button type="button" className="aw-report-primary" disabled={busy}
      onClick={()=>void refresh()}><RefreshCcw size={16}/>Refresh</button>
   </div>
  </section>
  {error&&<Notice kind="error">{error}</Notice>}
  {busy&&!records&&<Spinner label="Calculating financial breakdown…"/>}
  {records&&<>
   <section className="aw-finance-summary" aria-label="Finance summary">
    <article className="aw-finance-stat">
      <p>TOTAL {kind}</p>
      <strong data-testid="finance-breakdown-total">{money(records.total)}</strong>
      <span>All posted transactions in this period</span>
    </article>
    <article className="aw-finance-stat"><p>POSTED TRANSACTIONS</p>
      <strong>{records.transactionCount.toLocaleString("en-IN")}</strong>
      <span>Unique financial entries, excluding pending</span>
    </article>
    <article className="aw-finance-stat"><p>DATE RANGE</p>
      <strong className="aw-finance-stat-range">{pretty(records.from)} → {pretty(records.to)}</strong>
      <span>Same inclusive UTC dates as Reports</span>
    </article>
   </section>
   <div className="aw-finance-panels">
    <section className="aw-finance-panel" aria-label="Monthly financial trend">
      <div className="aw-finance-panel-heading"><TrendingUp size={17}/><h2>Monthly {isIncome?"income":"expenses"}</h2></div>
      <p className="aw-finance-panel-caption">{records.monthly.length>18
        ?"Latest 18 months shown. Select any month to inspect its days."
        :"Select a month to inspect its day-wise totals and transactions."}</p>
      <div className="aw-finance-trend" role="list">
       {chartMonths.map(m=><div role="listitem" className="aw-finance-trend-item" key={m.month}>
         <button type="button" className="aw-finance-trend-trigger"
          aria-label={"Open day-wise breakdown for "+monthTitle(m.month)}
          aria-expanded={selectedMonth===m.month}
          aria-controls="aw-finance-daily"
          onClick={()=>{
            setSelectedMonth(month=>month===m.month?null:m.month);
            setSelectedDay(null);setPage(1);
          }}>
          <span className="aw-finance-trend-column">
           <span className="aw-finance-trend-bar" style={{height:Math.max(2,Number(m.total)/maxMonth*100)+"%"}}
            title={monthTitle(m.month)+": "+money(m.total)}/>
          </span>
          <span>{monthTitle(m.month)}</span><small>{money(m.total)}</small>
         </button>
       </div>)}
      </div>
    </section>
    <section className="aw-finance-panel" aria-label="Category financial breakdown">
      <div className="aw-finance-panel-heading"><Filter size={17}/><h2>Category-wise breakdown</h2></div>
      <p className="aw-finance-panel-caption">Every category contributes to the total above, including archived categories.</p>
      <div className="aw-finance-categories">
       {records.categories.length===0&&<p>No posted entries in this period.</p>}
       {records.categories.map(c=><div className="aw-finance-category" key={c.id}>
        <div className="aw-finance-category-head"><strong>{c.name}</strong>
         <span>{money(c.total)} · {c.count} transaction{c.count===1?"":"s"}</span></div>
        <div className="aw-finance-category-track"><div style={{width:Math.min(100,Number(c.total)/categoryMax*100)+"%"}}/></div>
       </div>)}
      </div>
    </section>
   </div>
   <div className="aw-finance-drill-panels">
    {selectedMonth&&<section id="aw-finance-daily" className="aw-finance-panel" aria-label="Day-wise financial breakdown">
      <div className="aw-finance-drill-heading">
       <div><h2>Day-wise breakdown · {monthTitle(selectedMonth)}</h2>
        <p className="aw-finance-panel-caption">All days in the selected reporting window, including days with no transactions. Select a day to filter the ledger.</p></div>
       <button type="button" className="aw-finance-clear" onClick={()=>{setSelectedMonth(null);setSelectedDay(null);setPage(1);}}>Close days</button>
      </div>
      <div className="aw-finance-days">
       {dailyForMonth.map(d=><button key={d.date} type="button"
        className={"aw-finance-day"+(selectedDay===d.date?" is-selected":"")}
        aria-label={"Filter ledger to "+pretty(d.date)}
        aria-pressed={selectedDay===d.date}
        onClick={()=>{setSelectedDay(day=>day===d.date?null:d.date);setPage(1);}}>
        <span>{d.date.slice(-2)}</span>
        <span className="aw-finance-day-track"><span style={{height:Math.max(2,Number(d.total)/dayMax*100)+"%"}}/></span>
        <strong>{money(d.total)}</strong>
        <small>{d.count} entr{d.count===1?"y":"ies"}</small>
       </button>)}
      </div>
    </section>}
    <section className="aw-finance-panel" aria-label="Person-wise financial breakdown">
     <div className="aw-finance-drill-heading">
      <div><h2>Person-wise {isIncome?"income":"expenses"}</h2>
       <p className="aw-finance-panel-caption">Totals grouped by assigned person, including members no longer active. Select a person to filter the ledger and CSV.</p></div>
      {selectedPersonId&&<button type="button" className="aw-finance-clear" onClick={()=>{setSelectedPersonId(null);setPage(1);}}>All people</button>}
     </div>
     <div className="aw-finance-people">
      {records.people.length===0&&<p className="aw-finance-empty">No posted entries in this period.</p>}
      {records.people.map(p=><button type="button" key={p.id}
       aria-pressed={selectedPersonId===p.id}
       aria-label={"Filter ledger by "+p.name}
       className={"aw-finance-person"+(selectedPersonId===p.id?" is-selected":"")}
       onClick={()=>{setSelectedPersonId(id=>id===p.id?null:p.id);setPage(1);}}>
       <span className="aw-finance-person-title"><strong>{p.name}</strong><small>{p.loginId}</small></span>
       <span className="aw-finance-person-total">{money(p.total)}<small>{p.count} transaction{p.count===1?"":"s"}</small></span>
       <span className="aw-finance-category-track"><span style={{width:Math.min(100,Number(p.total)/personMax*100)+"%"}}/></span>
      </button>)}
     </div>
    </section>
   </div>
   <section className="aw-finance-panel" aria-label="Financial transactions ledger">
     <div className="aw-finance-ledger-heading">
      <div><h2>Transaction ledger</h2>
       <p>20 transactions per page. Search and day/person selection filter this ledger and CSV, not overall totals.</p>
       {(selectedDay||selectedPersonId)&&<p className="aw-finance-active-filters">
        {selectedDay&&<span>Day: {pretty(selectedDay)}</span>}
        {selectedPersonId&&<span>Person: {activePerson?.name??"Selected member"}</span>}
        <button type="button" onClick={()=>{setSelectedDay(null);setSelectedPersonId(null);setPage(1);}}>Clear ledger filters</button>
       </p>}</div>
      <button type="button" className="aw-report-primary" disabled={exporting||busy}
        onClick={()=>void exportCsv()}><ArrowDownToLine size={16}/>{exporting?"Exporting…":"Export filtered CSV"}</button>
     </div>
     <div className="aw-finance-ledger-tools">
       <label className="aw-finance-search"><Search size={17} aria-hidden="true"/>
        <input aria-label="Search financial transactions" type="search" maxLength={100}
         placeholder="Source, category, method, description, or person"
         value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}}/></label>
       <span>{records.matchingCount} matching · {money(records.matchingTotal)}</span>
     </div>
     <div className="aw-finance-table-scroller"><table className="aw-finance-table" aria-label="Financial breakdown transactions" aria-busy={busy}>
      <thead><tr><th>Date</th><th>Source / description</th><th>Category</th><th>Payment</th><th>Recorded by</th><th>Amount</th></tr></thead>
      <tbody>{records.transactions.map(t=><tr key={t.id}>
        <td><time dateTime={t.occurredOn}>{pretty(t.occurredOn)}</time></td>
        <td><strong>{t.merchantOrSource||"Not recorded"}</strong>
          {t.description&&<small>{t.description}</small>}</td>
        <td>{t.category}</td><td>{t.method.replaceAll("_"," ")}</td>
        <td>{t.enteredBy}</td><td className="aw-finance-amount">{money(t.amount)}</td>
      </tr>)}</tbody>
     </table></div>
     {!busy&&!records.transactions.length&&<p className="aw-finance-empty">No posted transactions match these filters.</p>}
     <nav className="aw-finance-pagination" aria-label="Financial breakdown pages">
       <button type="button" disabled={busy||page===1} onClick={()=>setPage(n=>Math.max(1,n-1))}>
         <ArrowLeft size={15}/>Previous</button>
       <span>Page {page} · {records.transactions.length} record{records.transactions.length===1?"":"s"}</span>
       <button type="button" disabled={busy||!records.hasMore} onClick={()=>setPage(n=>n+1)}>
         Next<ArrowRight size={15}/></button>
     </nav>
   </section>
  </>}
 </div>;
}
