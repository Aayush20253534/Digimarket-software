"use client";
import {reportingPreset,comparisonPeriod} from "@digimarket/contracts";
import {useCallback,useEffect,useRef,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,Download} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {Notice,PageHeader,Spinner} from "@/components/ui";
import {ReportTabs,ReportToolbar} from "./report-controls";
type Metric=number|string|{kind:string;amount:string}[];
type Report={from:string;to:string;asOf:string;sections:Record<string,Record<string,Metric>>;definitions:Record<string,string>;cashTrend?:{date:string;income:string;expense:string}[]};
type Salary={totalPaid:string;paymentCount:number;founderFunding:{founderUserId:string;name:string;amount:string}[]};
const money=(n:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:2}).format(n);
const count=(n:number)=>n.toLocaleString("en-IN",{maximumFractionDigits:2});
const val=(r:Report|null,s:string,k:string)=>{const v=r?.sections[s]?.[k];return typeof v==="number"||typeof v==="string"&&Number.isFinite(Number(v))?Number(v):null};
const cash=(r:Report|null,k:string)=>{const v=r?.sections.cashLedger?.posted;return Array.isArray(v)?Number(v.find(x=>x.kind===k)?.amount??0):null};
const net=(r:Report|null)=>{const a=cash(r,"INCOME"),b=cash(r,"EXPENSE");return a===null||b===null?null:Math.round((a-b)*100)/100};
const title=(s:string)=>s.replace(/([A-Z])/g," $1").replace(/^./,v=>v.toUpperCase());
function Bars({rows}:{rows:{label:string;value:number}[]}){
 const max=Math.max(1,...rows.map(x=>x.value));
 return <div className="rp-bars">{rows.map(x=><div key={x.label}><div className="rp-line"><span>{x.label}</span><strong>{count(x.value)}</strong></div><div className="rp-track"><span style={{width:x.value/max*100+"%"}}/></div></div>)}</div>;
}
export default function ReportsPage(){
 const {session,request}=useAuth(),can=!!session?.identity.permissions.includes("reports.business.read"),founder=!!session?.identity.roles.includes("FOUNDER");
 const [period,setPeriod]=useState(()=>reportingPreset("current")),[ready,setReady]=useState(false),[report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const [comparison,setComparison]=useState<{current:Report;previous:Report}|null>(null),[salary,setSalary]=useState<Salary|null>(null),[salaryWarning,setSalaryWarning]=useState("");
 const sequence=useRef(0);
 useEffect(()=>{const q=new URLSearchParams(window.location.search),from=q.get("from"),to=q.get("to");if(from&&to&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to)setPeriod({from,to});setReady(true)},[]);
 const load=useCallback(async()=>{if(!can||!ready)return;const id=++sequence.current;setBusy(true);setError("");setComparison(null);setSalary(null);setSalaryWarning("");
  try{
   const result=await request<Report>("/reports/overview?"+new URLSearchParams(period));
   if(id!==sequence.current)return;setReport(result);
   const pair=comparisonPeriod(period);
   await Promise.all([
    pair?Promise.all([pair.current.to===period.to?Promise.resolve(result):request<Report>("/reports/overview?"+new URLSearchParams(pair.current)),request<Report>("/reports/overview?"+new URLSearchParams(pair.previous))]).then(([current,previous])=>{if(id===sequence.current)setComparison({current,previous})}).catch(()=>{}):Promise.resolve(),
    founder?request<Salary>("/salary/summary?"+new URLSearchParams(period)).then(data=>{if(id===sequence.current)setSalary(data)}).catch(()=>{if(id===sequence.current)setSalaryWarning("Salary reporting unavailable.")}):Promise.resolve()
   ]);
  }catch(e){if(id===sequence.current){setReport(null);setError(e instanceof Error?e.message:"Report unavailable")}}
  finally{if(id===sequence.current)setBusy(false)}
 },[can,ready,period,request,founder]);
 useEffect(()=>{void load();return()=>{sequence.current++}},[load]);
 const change=(v:typeof period)=>{setPeriod({from:v.from,to:v.to});setReport(null);setComparison(null);setSalary(null);const url=new URL(window.location.href);url.searchParams.set("from",v.from);url.searchParams.set("to",v.to);window.history.replaceState(null,"",url.pathname+url.search)};
 if(!session)return <Spinner label="Checking reporting permissions…"/>;
 if(!can)return <Notice kind="error">Business reporting permission required.</Notice>;
 const query="?"+new URLSearchParams(period);
 const kpis=[{label:"Agency income",get:(r:Report|null)=>cash(r,"INCOME"),format:money,href:"/app/reports/income",compare:true},{label:"Agency expenses",get:(r:Report|null)=>cash(r,"EXPENSE"),format:money,href:"/app/reports/expenses",compare:true},{label:"Net cash flow",get:net,format:money,href:null,compare:true},{label:"Active clients",get:(r:Report|null)=>val(r,"clients","active"),format:count,href:"/app/clients",compare:false},{label:"New leads",get:(r:Report|null)=>val(r,"leads","created"),format:count,href:"/app/reports/leads",compare:true},{label:"Lead conversion rate",get:(r:Report|null)=>val(r,"leads","conversionRatePercent"),format:(n:number)=>count(n)+"%",href:"/app/reports/leads",compare:true}];
 const pipeline=[["Pending","pending"],["Follow-up","followUp"],["Meeting","meetingProcess"],["Decision","decisionPending"],["Agreement","agreementPending"],["Approved","approved"]];
 const attention=[["Overdue follow-ups","leads","overdueFollowUps"],["Decisions pending","leads","decisionPending"],["Agreements pending","leads","agreementPending"],["Content in review","content","pendingReview"]];
 const trend=report?.cashTrend??[],max=Math.max(1,...trend.flatMap(x=>[Number(x.income),Number(x.expense)]));
 return <div className="rp-page space-y-5" data-aw-module="reports">
 <PageHeader eyebrow="Agency intelligence" title="Performance reports" description="Agency performance, acquisition and posted cash flow."/>
 <ReportTabs {...period}/>
 <ReportToolbar value={period} onChange={change} busy={busy} onRefresh={()=>void load()}/>
 <div className="rp-line"><span className="rp-muted">{report?"Calculated "+new Date(report.asOf).toLocaleString("en-IN"):""}{busy?" · Updating…":""}</span><button type="button" className="btn-secondary rp-no-print" disabled={busy||!report} onClick={()=>window.print()}><Download size={16}/>Print / Save PDF</button></div>
 {error&&<Notice kind="error">{error}</Notice>}{busy&&!report&&<Spinner label="Calculating permitted metrics…"/>}
 {report&&<>
 <section id="report-kpis" className="rp-kpis" aria-label="Key performance indicators">{kpis.map(k=>{const value=k.get(report);if(value===null)return null;const a=comparison&&k.compare?k.get(comparison.current):null,b=comparison&&k.compare?k.get(comparison.previous):null;const delta=a!==null&&b!==null?a-b:null;const content=<><div className="rp-line"><span className="rp-muted">{k.label}</span>{k.href&&<ArrowUpRight size={16}/>}</div><strong>{k.format(value)}</strong><small>{delta!==null?(delta>0?"+":"")+(k.label==="Lead conversion rate"?count(delta)+" percentage points":k.format(delta))+" vs previous comparable cycle":k.label==="Active clients"?"Current snapshot":k.label==="Net cash flow"?"Posted income less expenses":"Selected reporting period"}</small></>;return k.href?<Link key={k.label} className="rp-kpi" href={k.href+(k.href.startsWith("/app/reports")?query:"")}>{content}</Link>:<article key={k.label} className="rp-kpi">{content}</article>})}</section>
 {comparison&&<p className="rp-muted">Comparison: {comparison.current.from} – {comparison.current.to} vs {comparison.previous.from} – {comparison.previous.to}. Conversion reflects current cohort outcomes.</p>}
 {report.sections.cashLedger&&<section className="rp-panel"><div className="rp-line"><div><h2>Financial performance</h2><p className="rp-muted">Posted agency ledger only · client-funded ads excluded · dates with recorded activity</p></div><div className="rp-legend"><span>Income</span><span>Expenses</span></div></div>
 {trend.length?<div className="rp-chart-scroll"><div className="rp-chart" style={{minWidth:Math.max(320,trend.length*36)}}>{trend.map(d=><div className="rp-chart-day" key={d.date}><div className="rp-chart-bars" role="img" aria-label={d.date+": income "+money(Number(d.income))+", expenses "+money(Number(d.expense))}><span title={money(Number(d.income))} style={{height:Number(d.income)/max*100+"%"}}/><span title={money(Number(d.expense))} style={{height:Number(d.expense)/max*100+"%"}}/></div><small>{d.date.slice(5)}</small></div>)}</div></div>:<p className="rp-muted">No posted transactions in this period.</p>}
 <div className="rp-line rp-finance-links"><Link href={"/app/reports/income"+query}>Income breakdown <ArrowUpRight size={15}/></Link><Link href={"/app/reports/expenses"+query}>Expense breakdown <ArrowUpRight size={15}/></Link></div></section>}
 <div className="rp-grid">{report.sections.leads&&<section className="rp-panel"><h2>Lead pipeline</h2><p className="rp-muted">Current stages of leads created in the selected period; not a chronological funnel.</p><Bars rows={pipeline.map(([label,key])=>({label,value:val(report,"leads",key)??0}))}/><Link className="rp-link" href={"/app/reports/leads"+query}>Leads analytics <ArrowUpRight size={15}/></Link></section>}
 {attention.some(([,s,k])=>val(report,s,k)!==null)&&<section className="rp-panel"><h2>Needs attention</h2><p className="rp-muted">Current outstanding items; decisions and agreements use the selected lead cohort.</p>{attention.map(([label,s,k])=>{const value=val(report,s,k);return value===null?null:<div className="rp-list-row" key={label}><span>{label}</span><strong>{count(value)}</strong></div>})}</section>}</div>
 {founder&&<section className="rp-panel"><div className="rp-line"><div><h2>Founder-paid salaries</h2><p className="rp-muted">Separate from ordinary agency ledger income and expenses.</p></div><Link className="rp-link" href="/app/salary">Open Salary <ArrowUpRight size={15}/></Link></div>{salaryWarning&&<p role="status">{salaryWarning}</p>}{salary?<><strong className="rp-big">{money(Number(salary.totalPaid))}</strong>{salary.founderFunding.map(x=><div key={x.founderUserId} className="rp-list-row"><span>{x.name}</span><strong>{money(Number(x.amount))}</strong></div>)}</>:<p className="rp-muted">{busy?"Loading salary data…":"Salary data unavailable."}</p>}</section>}
 {(report.sections.projects||report.sections.content)&&<section className="rp-panel"><h2>Operations</h2>{Object.entries(report.sections).filter(([k])=>k==="projects"||k==="content").map(([k,values])=><div key={k}><h3>{title(k)}</h3>{Object.entries(values).map(([key,value])=>typeof value==="number"?<div className="rp-list-row" key={key}><span>{key==="completedCurrent"?"Completed (all time)":title(key)}</span><strong>{count(value)}</strong></div>:null)}</div>)}</section>}
 <details className="rp-panel" id="report-definitions"><summary>Metric definitions and data integrity</summary><dl>{Object.entries(report.definitions).map(([k,v])=><div key={k} className="rp-list-row"><dt>{title(k)}</dt><dd>{v}</dd></div>)}</dl></details>
 </>}
 </div>;
}
