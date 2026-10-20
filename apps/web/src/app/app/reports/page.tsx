"use client";
import {useCallback,useEffect,useState} from "react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,Notice,PageHeader,Spinner} from "@/components/ui";
type Section=Record<string,number|string|{kind:string;amount:string}[]>;
type Report={from:string;to:string;asOf:string;sections:Record<string,Section>;
 definitions:Record<string,string>};
const today=()=>new Date().toISOString().slice(0,10);
const first=()=>today().slice(0,7)+"-01";
const label=(s:string)=>s.replace(/([A-Z])/g," $1").replace(/_/g," ").replace(/^./,x=>x.toUpperCase());
export default function ReportsPage(){
 const {session,request}=useAuth();const can=!!session?.identity.permissions.includes("reports.business.read");
 const [from,setFrom]=useState(first),[to,setTo]=useState(today),[report,setReport]=useState<Report|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!can)return;setBusy(true);setError("");
  try{setReport(await request<Report>("/reports/overview?"+new URLSearchParams({from,to})));}
  catch(e){setError(e instanceof ApiError?e.message:"Report unavailable");}finally{setBusy(false);}
 },[can,request,from,to]);
 useEffect(()=>{void load();},[load]);
 if(!session)return <Spinner label="Checking reporting permissions…"/>;
 if(!can)return <Notice kind="error">Business reporting permission required.</Notice>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Agency performance" title="Reports"
   description="A permission-filtered view of leads, clients, projects, workload, content, invoices and verified cash ledger. No synthetic metrics."/>
  <Card title="Reporting period">
   <div className="flex flex-wrap items-end gap-3">
    <label className="text-sm">From<input type="date" className="field mt-1 block" value={from}
      onChange={e=>setFrom(e.target.value)}/></label>
    <label className="text-sm">Through<input type="date" className="field mt-1 block" value={to}
      onChange={e=>setTo(e.target.value)}/></label>
    <button className="btn-secondary" disabled={busy} onClick={()=>void load()} type="button">Refresh report</button>
   </div>
  </Card>
  {error&&<Notice kind="error">{error}</Notice>}
  {busy&&<Spinner label="Calculating permitted metrics…"/>}
  {report&&<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
   {Object.entries(report.sections).map(([name,values])=><Card title={label(name)} key={name}>
    <dl className="space-y-3">{Object.entries(values).map(([key,value])=>
     <div className="flex flex-wrap items-start justify-between gap-2 text-sm" key={key}>
      <dt className="text-slate-500">{label(key)}</dt>
      <dd className="font-semibold tabular-nums">
       {Array.isArray(value)?value.map(v=>v.kind+": "+v.amount).join(" · "):String(value)}
      </dd>
     </div>)}</dl>
   </Card>)}
  </div>}
  {report&&<Card title="About these numbers">
   <p className="mb-2 text-xs text-slate-500">Last calculated {new Date(report.asOf).toLocaleString()}. Records are fetched from the API, not cached screenshots.</p>
   <dl className="space-y-2 text-sm text-slate-600">{Object.entries(report.definitions).map(([k,v])=>
    <div key={k}><b>{label(k)}:</b> {v}</div>)}</dl>
  </Card>}
 </div>;
}
