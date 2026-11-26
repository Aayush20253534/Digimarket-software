"use client";
import {useCallback,useEffect,useState} from "react";
import {reportingPreset} from "@digimarket/contracts";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {Notice,PageHeader,Spinner} from "@/components/ui";
import {ReportTabs} from "../report-controls";
type Row={id:string;name:string;from:string|null;to:string|null;agreementEnd:string|null;posts:number;videos:number;festival:number;postsDelivered:number|null;videosDelivered:number|null;festivalDelivered:number|null};
type Report={asOf:string;items:Row[]};
const n=(v:number|null)=>v===null?"—":v.toLocaleString("en-IN");
export default function ClientDelivery(){
 const {session,request}=useAuth(),allowed=!!session?.identity.permissions.includes("reports.business.read")&&!!session?.identity.permissions.includes("clients.read");
 const [report,setReport]=useState<Report|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[search,setSearch]=useState(""),[period,setPeriod]=useState(()=>reportingPreset("current"));
 useEffect(()=>{const q=new URLSearchParams(window.location.search),from=q.get("from"),to=q.get("to");if(from&&to&&/^\d{4}-\d{2}-\d{2}$/.test(from)&&/^\d{4}-\d{2}-\d{2}$/.test(to)&&from<=to)setPeriod({from,to})},[]);
 const load=useCallback(async(force=true)=>{if(!allowed)return;setBusy(true);setError("");try{setReport(await request<Report>(force?"/reports/client-delivery?fresh=1":"/reports/client-delivery",{cache:force?"reload":"prefer"}))}catch(e){setReport(null);setError(e instanceof Error?e.message:"Client report unavailable")}finally{setBusy(false)}},[allowed,request]);
 useEffect(()=>{void load(false)},[load]);
 if(!session)return <Spinner label="Checking access…"/>;if(!allowed)return <Notice kind="error">Business reporting and client reading permissions are required.</Notice>;
 const rows=report?.items.filter(x=>x.name.toLowerCase().includes(search.trim().toLowerCase()))??[];
 const total=(key:"posts"|"videos"|"festival"|"postsDelivered"|"videosDelivered"|"festivalDelivered")=>rows.reduce((sum,r)=>sum+(r[key]??0),0);
 const metrics=[["Posts delivered","postsDelivered"],["Videos delivered","videosDelivered"],["Festival posts delivered","festivalDelivered"],["Ready posts","posts"],["Ready videos","videos"],["Ready festival posts","festival"]] as const;
 const exportCsv=()=>{const cell=(v:unknown)=>{let s=String(v??"");if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const data=[["Client","Cycle start","Cycle end","Agreement ends","Posts delivered","Videos delivered","Festival delivered","Ready posts","Ready videos","Ready festival"],...rows.map(r=>[r.name,r.from,r.to,r.agreementEnd,r.postsDelivered,r.videosDelivered,r.festivalDelivered,r.posts,r.videos,r.festival])].map(r=>r.map(cell).join(",")).join("\r\n");const url=URL.createObjectURL(new Blob(["\ufeff"+data],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download="client-delivery-"+report?.asOf+".csv";a.click();URL.revokeObjectURL(url)};
 return <div className="rp-page space-y-5"><PageHeader eyebrow="Agency intelligence" title="Client delivery" description="Current individual agreement cycles and carried-forward ready stock."/><ReportTabs {...period}/>
 <section className="rp-toolbar"><p className="rp-muted">Each client follows their own agreement anniversary. Agency period filters do not change these cycles.</p><button className="btn-secondary" type="button" disabled={busy} onClick={()=>void load()}>Refresh</button></section>
 {error&&<Notice kind="error">{error}</Notice>}{busy&&!report&&<Spinner label="Calculating client readiness…"/>}
 {report&&<><div className="rp-kpis">{metrics.map(([label,key])=><article className="rp-kpi" key={key}><span className="rp-muted">{label}</span><strong>{key.endsWith("Delivered")&&rows.some(r=>r[key]===null)?n(total(key))+"*":n(total(key))}</strong></article>)}</div><section className="rp-panel"><div className="rp-line"><div><h2>Active client register</h2><p className="rp-muted">{rows.length} clients · As of {report.asOf} · * excludes clients without cycle dates</p></div><button type="button" className="btn-secondary" disabled={busy} onClick={exportCsv}>Export CSV</button></div><input className="field rp-search" type="search" aria-label="Search client delivery" placeholder="Search clients" value={search} onChange={e=>setSearch(e.target.value)}/>
 <div className="rp-table-scroll"><table className="rp-table"><thead><tr>{["Client","Client cycle","Agreement ends","Posts delivered","Videos delivered","Festival delivered","Ready posts","Ready videos","Ready festival"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><Link className="rp-link" href={"/app/clients/"+r.id}>{r.name}</Link></td><td>{r.from&&r.to?<>{r.from}<br/>{r.to}</>:"Start date needed"}</td><td>{r.agreementEnd??"—"}</td>{[r.postsDelivered,r.videosDelivered,r.festivalDelivered,r.posts,r.videos,r.festival].map((v,i)=><td key={i}>{n(v)}</td>)}</tr>)}</tbody></table></div>{!rows.length&&<p className="rp-muted">No matching active clients.</p>}<p className="rp-muted">Delivery targets are not inferred from old service labels. Stock and delivered counts use the existing readiness records.</p></section></>}
 </div>;
}
