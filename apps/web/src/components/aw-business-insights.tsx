"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {Activity,ArrowUpRight,ChartColumnIncreasing,Clock3,Target,Users,Wallet} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {AWStat} from "@/components/aw-data-patterns";

type Stage = {name:string;count:number};
type OverviewReport = {
 from:string;to:string;asOf:string;
 sections:{
  leads?:{created:number;converted:number;approved:number;pending:number;meetingProcess:number;
   decisionPending:number;agreementPending:number;followUp:number;conversionRatePercent:number};
  clients?:{active:number};
  tasks?:{open:number;overdue:number;completed:number};
  cashLedger?:{currency:string;posted:{kind:string;amount:string}[]};
 };
};
const num=(x:number)=>new Intl.NumberFormat("en-IN").format(x);
const inr=(x:number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",maximumFractionDigits:0}).format(x);
const today=()=>{
 const now=new Date();
 const year=now.getFullYear(),month=String(now.getMonth()+1).padStart(2,"0");
 return {from:year+"-"+month+"-01",to:year+"-"+month+"-"+String(now.getDate()).padStart(2,"0")};
};

/** Permission-scoped live reports. Charts never infer agency totals from partial pages. */
export function AWBusinessInsights(){
 const {session,request}=useAuth();
 const allowed=!!session?.identity.permissions.includes("reports.business.read");
 const [report,setReport]=useState<OverviewReport|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!allowed)return;
  setBusy(true);setError("");
  try{
   const period=today();
   const result=await request<OverviewReport>("/reports/overview?"+new URLSearchParams(period));
   setReport(result);
  }catch{
   setError("Business insights could not be loaded. The rest of the dashboard remains available.");
  }finally{setBusy(false);}
 },[allowed,request]);
 useEffect(()=>{void load();},[load]);
 const lead=report?.sections.leads,clients=report?.sections.clients,
  tasks=report?.sections.tasks,cash=report?.sections.cashLedger;
 const postedIncome=cash?.posted.find(x=>x.kind==="INCOME");
 const metrics=[
  lead?{label:"Leads this month",value:num(lead.created),description:"Created in the reporting period",icon:<Target size={20}/>} :null,
  clients?{label:"Active clients",value:num(clients.active),description:"Active clients in the workspace",icon:<Users size={20}/>} :null,
  tasks?{label:"Open tasks",value:num(tasks.open),description:num(tasks.overdue)+" overdue",icon:<Clock3 size={20}/>} :null,
  postedIncome?{label:"Posted income",value:inr(Number(postedIncome.amount)),description:"Agency income this month",icon:<Wallet size={20}/>} :null,
 ].filter((item):item is NonNullable<typeof item>=>item!==null);
 const stages=useMemo<Stage[]>(()=>{
  if(lead)return[
   {name:"Pending",count:lead.pending},
   {name:"Follow-up",count:lead.followUp},
   {name:"Meeting process",count:lead.meetingProcess},
   {name:"Decision pending",count:lead.decisionPending},
   {name:"Agreement pending",count:lead.agreementPending},
   {name:"Approved",count:lead.approved},
  ];
  if(tasks)return[
   {name:"Open tasks",count:tasks.open},
   {name:"Overdue tasks",count:tasks.overdue},
   {name:"Completed this month",count:tasks.completed},
  ];
  if(clients)return[{name:"Active clients",count:clients.active}];
  return [];
 },[lead,tasks,clients]);
 if(!allowed)return null;
 const max=Math.max(1,...stages.map(x=>x.count));
 return <section className="aw-live-insights" aria-label="Live business insights">
  <div className="aw-insights-section-header">
   <div><p className="aw-insights-eyebrow"><Activity size={14} aria-hidden="true"/> LIVE WORKSPACE</p>
    <h2>Business insights</h2><p>Verified activity for the current month, from your permitted records.</p></div>
   <button type="button" className="aw-dashboard-refresh" onClick={()=>void load()} disabled={busy}
    aria-label="Refresh business insights"><Activity size={15} aria-hidden="true"/>{busy?"Updating…":"Refresh insights"}</button>
  </div>
  {error&&<p className="aw-insights-error" role="status">{error}</p>}
  {!report&&busy?<div className="aw-insights-card" role="status" aria-busy="true">Loading business analytics…</div>:report&&<>
   {metrics.length>0&&<div className="aw-stat-grid aw-insights-metrics" aria-label="Business metrics">
    {metrics.map((metric,i)=><AWStat key={metric.label} {...metric} accent={i===0}/>)}
   </div>}
   <div className="aw-insights-grid">
    <div className="aw-insights-card">
     <div className="aw-insights-head">
      <div><h3 className="aw-insights-title">{lead?"Lead pipeline":tasks?"Team task activity":"Client activity"}</h3>
       <p className="aw-insights-hint">{lead?"Current stages of leads created this month":tasks?"Open, overdue and completed task counts":"Active clients in your workspace"}</p></div>
      <div className="aw-insights-icon"><ChartColumnIncreasing size={18} aria-hidden="true"/></div>
     </div>
     {stages.length?<div className="aw-insights-bar-list" role="img"
       aria-label={stages.map(x=>x.name+": "+num(x.count)).join("; ")}>
       {stages.map(item=><div key={item.name}>
        <div className="aw-insights-label"><span>{item.name}</span><strong>{num(item.count)}</strong></div>
        <div className="aw-insights-track"><div className="aw-insights-fill" style={{width:(item.count/max*100)+"%"}}/></div>
       </div>)}
      </div>:<p className="aw-insights-hint">No activity metrics are available for your reporting permissions.</p>}
    </div>
    <div className="aw-insights-card">
     <div className="aw-insights-head">
      <div><h3 className="aw-insights-title">Performance snapshot</h3>
       <p className="aw-insights-hint">{report.from} to {report.to}</p></div>
      <div className="aw-insights-icon"><Target size={18} aria-hidden="true"/></div>
     </div>
     <div className="aw-insights-overline">{lead?"Client conversion rate":tasks?"Completed tasks":"Active clients"}</div>
     <div className="aw-insights-number">{lead?lead.conversionRatePercent.toLocaleString("en-IN",{maximumFractionDigits:1})+"%":tasks?num(tasks.completed):clients?num(clients.active):"—"}</div>
     <p className="aw-insights-hint">{lead?"Of leads created this month":tasks?"Completed during this reporting period":"Current active client records"}</p>
     <div className="aw-insights-divider"/>
     <div className="aw-insights-overline"><Activity size={14} aria-hidden="true"/> Directly sourced from reporting APIs</div>
     <p className="aw-insights-hint">These figures are scoped to your permissions. Missing sections are not estimated.</p>
     <div className="mt-5">
      <Link href="/app/reports" className="aw-insights-link">View complete reports <ArrowUpRight size={14} className="inline" aria-hidden="true"/></Link>
     </div>
    </div>
   </div>
  </>}
 </section>;
}
