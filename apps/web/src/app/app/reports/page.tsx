"use client";
import {useCallback,useEffect,useState} from "react";
import {Activity,ArrowUpRight,BarChart3,CalendarDays,ChartNoAxesCombined,RefreshCcw,ShieldCheck,TrendingUp,Users,Wallet} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Notice,PageHeader,Spinner} from "@/components/ui";
type MetricValue=number|string|{kind:string;amount:string}[];
type Section=Record<string,MetricValue>;
type Report={from:string;to:string;asOf:string;sections:Record<string,Section>;definitions:Record<string,string>};
const today=()=>new Date().toISOString().slice(0,10);
const first=()=>today().slice(0,7)+"-01";
const label=(s:string)=>s.replace(/([A-Z])/g," $1").replace(/_/g," ").replace(/^./,x=>x.toUpperCase());
const themes=["violet","cyan","coral","mint","amber","pink"] as const;
const icons=[ChartNoAxesCombined,Users,TrendingUp,Wallet,Activity,BarChart3];
const format=(value:MetricValue)=>Array.isArray(value)?value.map(v=>v.kind+": "+v.amount).join(" · "):typeof value==="number"?new Intl.NumberFormat("en-IN").format(value):String(value);
export default function ReportsPage(){
 const {session,request}=useAuth();
 const can=!!session?.identity.permissions.includes("reports.business.read");
 const [from,setFrom]=useState(first),[to,setTo]=useState(today),[report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!can)return;
  if(from>to){setError("The start date must be before the end date.");return;}
  setBusy(true);setError("");
  try{setReport(await request<Report>("/reports/overview?"+new URLSearchParams({from,to})));}
  catch(e){setError(e instanceof ApiError?e.message:"Report unavailable");}
  finally{setBusy(false);}
 },[can,request,from,to]);
 useEffect(()=>{void load();},[load]);
 if(!session)return <Spinner label="Checking reporting permissions…"/>;
 if(!can)return <Notice kind="error">Business reporting permission required.</Notice>;
 const cards=Object.entries(report?.sections??{});
 return <div className="aw-report-page space-y-6">
  <PageHeader eyebrow="Agency intelligence" title="Performance reports"
   description="A comprehensive view of your business, delivered from real records and enforced by the current API permissions."/>
  <section className="aw-report-toolbar" aria-label="Reporting period">
    <div className="aw-report-toolbar-title"><CalendarDays size={21}/><div><strong>Reporting period</strong>
     <p>Filter live activity across your agency</p></div></div>
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
   <div className="aw-report-sectionhead"><div><p>BUSINESS OVERVIEW</p><h2>Key performance indicators</h2></div>
    <span><ShieldCheck size={15}/> Live, role-protected metrics</span></div>
   <div className="aw-report-grid">
    {cards.map(([name,values],i)=>{
     const Icon=icons[i%icons.length],entries=Object.entries(values),spot=entries.find(([,v])=>!Array.isArray(v)&&
       (typeof v==="number"||(/^-?\d+(\.\d+)?$/.test(v)&&v.length<20)))??entries[0];
     return <article className={"aw-report-card aw-report-"+themes[i%themes.length]} key={name}>
      <div className="aw-report-card-top"><span className="aw-report-icon"><Icon size={22}/></span>
       <ArrowUpRight size={18} aria-hidden="true"/></div>
      <p className="aw-report-card-label">{label(name)}</p>
      {spot&&<><div className="aw-report-hero-value">{format(spot[1])}</div>
       <p className="aw-report-hero-label">{label(spot[0])}</p></>}
      <dl className="aw-report-details">{entries.filter(([key])=>key!==spot?.[0]).map(([key,value])=>
       <div key={key}><dt>{label(key)}</dt><dd>{format(value)}</dd></div>)}</dl>
     </article>;
    })}
   </div>
   {!cards.length&&<p className="aw-report-empty">No report sections are available for this period.</p>}
   <section className="aw-report-footnote"><ShieldCheck size={21}/><div>
    <h2>Data integrity and definitions</h2><p>Calculated {new Date(report.asOf).toLocaleString()} using current agency records. No estimated data.</p>
    <dl>{Object.entries(report.definitions).map(([k,v])=><div key={k}><dt>{label(k)}</dt><dd>{v}</dd></div>)}</dl>
   </div></section>
  </>}
 </div>;
}