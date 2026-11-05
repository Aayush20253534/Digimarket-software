"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {Activity,ArrowUpRight,BarChart3,CalendarDays,ChartNoAxesCombined,RefreshCcw,ShieldCheck,TrendingUp,Users,Wallet,ArrowDownLeft} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Notice,PageHeader,Spinner} from "@/components/ui";
type MetricValue=number|string|{kind:string;amount:string}[];
type Section=Record<string,MetricValue>;
type Report={from:string;to:string;asOf:string;sections:Record<string,Section>;definitions:Record<string,string>};
type SalaryReport={totalPaid:string;paymentCount:number;founderFunding:{founderUserId:string;name:string;amount:string}[]};
const today=()=>new Date().toISOString().slice(0,10);
const first=()=>today().slice(0,7)+"-01";
const label=(s:string)=>s.replace(/([A-Z])/g," $1").replace(/_/g," ").replace(/^./,x=>x.toUpperCase());
const themes=["violet","cyan","coral","mint","amber","pink"] as const;
const icons=[ChartNoAxesCombined,Users,TrendingUp,Wallet,Activity,BarChart3];
const format=(value:MetricValue)=>Array.isArray(value)?value.map(v=>v.kind+": "+v.amount).join(" · "):typeof value==="number"?new Intl.NumberFormat("en-IN").format(value):String(value);
const numeric=(v:MetricValue|undefined)=>typeof v==="number"?v:
 typeof v==="string"&&Number.isFinite(Number(v))?Number(v):0;
export default function ReportsPage(){
 const {session,request}=useAuth();
 const can=!!session?.identity.permissions.includes("reports.business.read");
 const founder=!!session?.identity.roles.includes("FOUNDER");
 const [from,setFrom]=useState(()=>{
   if(typeof window==="undefined")return first();
   const candidate=new URLSearchParams(window.location.search).get("from");
   return candidate&&/^\d{4}-\d{2}-\d{2}$/.test(candidate)?candidate:first();
 }),[to,setTo]=useState(()=>{
   if(typeof window==="undefined")return today();
   const candidate=new URLSearchParams(window.location.search).get("to");
   return candidate&&/^\d{4}-\d{2}-\d{2}$/.test(candidate)?candidate:today();
 }),[report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const [salaryReport,setSalaryReport]=useState<SalaryReport|null>(null),[salaryWarning,setSalaryWarning]=useState("");
 const reportSequence=useRef(0);
 const applyPreset=(preset:"month"|"last30"|"year")=>{
  const end=today();
  const start=preset==="month"?end.slice(0,7)+"-01":
   preset==="year"?end.slice(0,4)+"-01-01":
   (()=>{const date=new Date(end+"T12:00:00Z");
    date.setUTCDate(date.getUTCDate()-29);return date.toISOString().slice(0,10);})();
  setFrom(start);setTo(end);
  const url=new URL(window.location.href);
  url.searchParams.set("from",start);url.searchParams.set("to",end);
  window.history.replaceState(null,"",url.pathname+url.search+url.hash);
 };
 const load=useCallback(async()=>{
  const sequence=++reportSequence.current;
  if(!can)return;
  if(from>to){setError("The start date must be before the end date.");return;}
  setBusy(true);setError("");
  try{
   const next=await request<Report>("/reports/overview?"+new URLSearchParams({from,to}));
   if(sequence===reportSequence.current)setReport(next);
  }
  catch(e){if(sequence===reportSequence.current)
   setError(e instanceof ApiError?e.message:"Report unavailable");}
  finally{if(sequence===reportSequence.current)setBusy(false);}
 },[can,request,from,to]);
 useEffect(()=>{void load();return()=>{reportSequence.current+=1;};},[load]);
 useEffect(()=>{
  if(!founder||!can||from>to)return;
  let active=true;
  void request<SalaryReport>("/salary/summary?"+new URLSearchParams({from,to})).then(data=>{
   if(active){setSalaryReport(data);setSalaryWarning("");}
  }).catch(e=>{if(active){setSalaryReport(null);setSalaryWarning(e instanceof Error?e.message:"Salary data unavailable");}});
  return()=>{active=false;};
 },[founder,can,from,to,request]);
 if(!session)return <Spinner label="Checking reporting permissions…"/>;
 if(!can)return <Notice kind="error">Business reporting permission required.</Notice>;
 const cards=Object.entries(report?.sections??{}).filter(([key])=>key!=="invoices");
 const leadStages=report?.sections.leads?[
   {name:"Pending",value:numeric(report.sections.leads.pending)},
   {name:"Follow-up",value:numeric(report.sections.leads.followUp)},
   {name:"Meeting",value:numeric(report.sections.leads.meetingProcess)},
   {name:"Decision",value:numeric(report.sections.leads.decisionPending)},
   {name:"Agreement",value:numeric(report.sections.leads.agreementPending)},
   {name:"Approved",value:numeric(report.sections.leads.approved)},
  ]:[];
 const ledger=report?.sections.cashLedger?.posted;
 const financeBars=Array.isArray(ledger)?(["INCOME","EXPENSE"] as const).map(kind=>({
   name:kind==="INCOME"?"Income":"Expenses",
   value:Math.max(0,Number(ledger.find(item=>item.kind===kind)?.amount??"0")),
 } )):[];
 const leadMax=Math.max(1,...leadStages.map(x=>x.value));
 const financeMax=Math.max(1,...financeBars.map(x=>x.value));
 const leadConversionRate=report?.sections.leads?.conversionRatePercent;
 const leadConversionValue=typeof leadConversionRate==="number" ? leadConversionRate:
   typeof leadConversionRate==="string" ? Number(leadConversionRate):null;
 return <div className="aw-report-page aw-v5-reports-page space-y-6" data-aw-module="reports">
  <PageHeader eyebrow="Agency intelligence" title="Performance reports"
   description="A comprehensive view of your business, delivered from real records and enforced by the current API permissions."/>
  <nav className="aw-v5-report-jump" aria-label="Reporting breakdowns">
    <Link href={"/app/reports/leads?"+new URLSearchParams({from,to})}><Users size={16} aria-hidden="true"/>Leads analytics</Link>
    <Link href={"/app/reports/income?"+new URLSearchParams({from,to})}><ArrowDownLeft size={16} aria-hidden="true"/>Income breakdown</Link>
    <Link href={"/app/reports/expenses?"+new URLSearchParams({from,to})}><ArrowUpRight size={16} aria-hidden="true"/>Expense breakdown</Link>
   </nav>
  <section className="aw-report-toolbar" aria-label="Reporting period">
    <div className="aw-report-toolbar-title"><CalendarDays size={21}/><div><strong>Reporting period</strong>
     <p>Filter live activity across your agency</p></div></div>
    <div className="aw-v5-date-presets" role="group" aria-label="Quick report periods">
      <button type="button" onClick={()=>applyPreset("month")}
        aria-pressed={from===today().slice(0,7)+"-01"&&to===today()}>This month</button>
      <button type="button" onClick={()=>applyPreset("last30")}>Last 30 days</button>
      <button type="button" onClick={()=>applyPreset("year")}
        aria-pressed={from===today().slice(0,4)+"-01-01"&&to===today()}>This year</button>
    </div>
    <div className="aw-report-dates">
     <label>From<input type="date" className="field" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label>
     <label>Through<input type="date" className="field" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label>
     <button className="aw-report-refresh" disabled={busy} type="button" onClick={()=>void load()}>
      <RefreshCcw size={17} className={busy?"animate-spin":""}/> {busy?"Refreshing…":"Refresh insights"}</button>
    </div>
  </section>
  {error&&<Notice kind="error">{error}</Notice>}
  {busy&&!report&&<Spinner label="Calculating permitted metrics…"/>}
  {report&&<>
   <div className="aw-v5-report-period-note" role="status">
    <span>Reporting window</span><strong>{report.from} to {report.to}</strong>
    <small>Last calculated {new Date(report.asOf).toLocaleString("en-IN")}</small>
   </div>
   <div id="report-kpis" className="aw-report-sectionhead"><div><p>BUSINESS OVERVIEW</p><h2>Key performance indicators</h2></div>
    <span><ShieldCheck size={15}/> Live, role-protected metrics</span></div>
   {(leadStages.length>0||financeBars.length>0)&&<section id="report-charts" className="aw-report-visuals" aria-label="Operational charts">
    {leadStages.length>0&&<div className="aw-insights-card">
     <div className="aw-insights-head">
      <div><h3 className="aw-insights-title">Lead pipeline by current stage</h3>
       <p className="aw-insights-hint">Leads created in the reporting period</p></div>
      <BarChart3 className="text-violet-400" size={19} aria-hidden="true"/>
     </div>
     <div className="aw-insights-bar-list" role="img" aria-label={leadStages.map(x=>x.name+": "+x.value).join("; ")}>
      {leadStages.map(item=><div key={item.name}>
       <div className="aw-insights-label"><span>{item.name}</span><strong>{item.value.toLocaleString("en-IN")}</strong></div>
       <div className="aw-insights-track"><div className="aw-insights-fill" style={{width:item.value/leadMax*100+"%"}}/></div>
      </div>)}
     </div>
     <p className="aw-insights-chart-note">Current stage counts, not a chronological conversion funnel.</p>
    </div>}
    {financeBars.length>0&&<div className="aw-insights-card">
     <div className="aw-insights-head">
      <div><h3 className="aw-insights-title">Posted income versus expenses</h3>
       <p className="aw-insights-hint">Actual agency ledger entries in the selected period</p></div>
      <Wallet className="text-violet-400" size={19} aria-hidden="true"/>
     </div>
     <div className="aw-insights-bar-list" role="img"
       aria-label={financeBars.map(x=>x.name+": "+new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(x.value)).join("; ")}>
      {financeBars.map(item=><div key={item.name}>
       <div className="aw-insights-label"><span>{item.name}</span><strong>{new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(item.value)}</strong></div>
       <div className="aw-insights-track"><div className="aw-insights-fill" style={{width:item.value/financeMax*100+"%"}}/></div>
      </div>)}
     </div>
     <p className="aw-insights-chart-note">Client-funded Meta Ads spending is excluded from agency expenses.</p>
    </div>}
   </section>}
   {founder&&<section className="aw-insights-card space-y-3" aria-label="Separate founder salary expenses">
    <div className="aw-insights-head"><div><h3 className="aw-insights-title">Founder-paid salaries</h3>
     <p className="aw-insights-hint">Paid salary expenses by founder funding source; excluded from ordinary ledger income and expenses.</p></div>
     <Link href="/app/salary" className="underline text-sm">Open Salary</Link></div>
    {salaryWarning&&<p role="status" className="text-sm text-amber-400">Salary reporting unavailable: {salaryWarning}</p>}
    <p className="text-lg font-bold">Total paid: {new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(salaryReport?.totalPaid||0))}</p>
    <div className="aw-insights-bar-list">{(salaryReport?.founderFunding||[]).map(x=><div key={x.founderUserId}>
     <div className="aw-insights-label"><span>{x.name}</span><strong>{new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(x.amount))}</strong></div>
     <div className="aw-insights-track"><div className="aw-insights-fill" style={{width:Number(x.amount)/Math.max(1,...(salaryReport?.founderFunding||[]).map(y=>Number(y.amount)))*100+"%"}}/></div>
    </div>)}</div>
    <p className="aw-insights-chart-note">Founder contributions and received salaries never appear as new agency income. The total cost is counted once per salary payment, regardless of how many founder accounts funded it.</p>
   </section>}
   <div className="aw-report-grid" id="report-breakdown-cards">
    {leadConversionValue!==null&&Number.isFinite(leadConversionValue)&&
     <article className="aw-report-card aw-report-mint" aria-label="Lead conversion rate">
       <div className="aw-report-card-top"><span className="aw-report-icon"><TrendingUp size={22}/></span>
         <ArrowUpRight size={18} aria-hidden="true"/></div>
       <p className="aw-report-card-label">LEAD CONVERSION RATE</p>
       <div className="aw-report-hero-value">{leadConversionValue.toLocaleString("en-IN",{maximumFractionDigits:2})}%</div>
       <p className="aw-report-hero-label">Approved leads converted into clients</p>
       <p className="mt-3 text-xs text-[#c8b6d4]">For leads created during the selected reporting period.</p>
     </article>}
    {cards.map(([name,values],i)=>{
     const Icon=icons[i%icons.length],entries=Object.entries(values).filter(([key])=>!(name==="leads"&&key==="conversionRatePercent")),ledger=name==="cashLedger"&&Array.isArray(values.posted)?values.posted:null,spot=entries.find(([,v])=>!Array.isArray(v)&&
       (typeof v==="number"||(/^-?\d+(\.\d+)?$/.test(v)&&v.length<20)))??entries[0];
     return <article className={"aw-report-card aw-report-"+themes[i%themes.length]+(name==="leads"?" relative":"")} key={name}>
      {name==="leads"&&<Link href={"/app/reports/leads?"+new URLSearchParams({from:report.from,to:report.to})} className="absolute inset-0 z-10 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-300" aria-label="Open complete Leads analytics breakdown"><span className="sr-only">View leads breakdown</span></Link>}
      <div className="aw-report-card-top"><span className="aw-report-icon"><Icon size={22}/></span>
       <ArrowUpRight size={18} aria-hidden="true"/></div>
      <p className="aw-report-card-label">{label(name)}</p>
      {ledger?<div className="aw-cash-ledger" aria-label="Posted income and expenses">
       <p className="aw-cash-ledger-currency">Currency · INR</p>
       {(["INCOME","EXPENSE"] as const).map(kind=>{
        const row=ledger.find(item=>item.kind===kind);
        const amount=Number(row?.amount??0);
        const detailPath="/app/reports/"+(kind==="INCOME"?"income":"expenses")+"?"+new URLSearchParams({from:report.from,to:report.to}).toString();
        return <Link key={kind} href={detailPath}
         aria-label={"View "+(kind==="INCOME"?"Income":"Expenses")+" breakdown"}
         className={"aw-cash-ledger-line aw-cash-"+kind.toLowerCase()+" aw-report-ledger-link"}>
         <span>{kind==="INCOME"?"Income":"Expense"} <ArrowUpRight size={14} className="inline" aria-hidden="true"/></span>
         <strong>{new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",minimumFractionDigits:2,maximumFractionDigits:2}).format(amount)}</strong>
        </Link>;
       })}
      </div>:<>
       {spot&&<><div className="aw-report-hero-value">{format(spot[1])}</div>
        <p className="aw-report-hero-label">{label(spot[0])}</p></>}
       <dl className="aw-report-details">{entries.filter(([key])=>key!==spot?.[0]).map(([key,value])=>
        <div key={key}><dt>{label(key)}</dt><dd>{format(value)}</dd></div>)}</dl>
      </>}
     </article>;
    })}
   </div>
   {!cards.length&&<p className="aw-report-empty">No report sections are available for this period.</p>}
   <section id="report-definitions" className="aw-report-footnote"><ShieldCheck size={21}/><div>
    <h2>Data integrity and definitions</h2><p>Calculated {new Date(report.asOf).toLocaleString()} using current agency records. No estimated data.</p>
    <dl>{Object.entries(report.definitions).map(([k,v])=><div key={k}><dt>{label(k)}</dt><dd>{v}</dd></div>)}</dl>
   </div></section>
  </>}
 </div>;
}