"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {AGENCY_START_DATE,businessCycle,reportingPreset,type ReportingPeriod} from "@digimarket/contracts";
import {useAuth} from "@/components/auth-provider";
import {RefreshCcw,ChevronLeft,ChevronRight} from "lucide-react";
export function ReportTabs({from,to}:ReportingPeriod){
 const {session}=useAuth(),pathname=usePathname(),grants=session?.identity.permissions??[];
 const tabs=[{label:"Overview",path:"",allowed:true},{label:"Leads",path:"/leads",allowed:grants.includes("leads.read")},{label:"Income",path:"/income",allowed:grants.includes("finance.read.all")},{label:"Expenses",path:"/expenses",allowed:grants.includes("finance.read.all")},{label:"Client Delivery",path:"/client-delivery",allowed:grants.includes("clients.read")}];
 return <nav className="rp-tabs" aria-label="Reporting breakdowns">{tabs.filter(x=>x.allowed).map(x=>{const href="/app/reports"+x.path;return <Link key={href} aria-current={pathname===href?"page":undefined} href={href+"?"+new URLSearchParams({from,to})}>{x.label}</Link>})}</nav>;
}
export function ReportToolbar({value,onChange,busy,onRefresh,fromLabel="Work cycle from",toLabel="Work cycle through"}:{value:ReportingPeriod;onChange:(v:ReportingPeriod)=>void;busy:boolean;onRefresh:()=>void;fromLabel?:string;toLabel?:string}){
 const current=businessCycle();
 const preset=(["current","previous","three","year","all"] as const).find(mode=>{const p=reportingPreset(mode);return p.from===value.from&&p.to===value.to})??"";
 return <section className="rp-toolbar" aria-label="Work cycle">
 <div className="rp-period"><button className="btn-secondary" type="button" aria-label="Previous cycle" disabled={value.from<=AGENCY_START_DATE||busy} onClick={()=>onChange(businessCycle(value.from,-1))}><ChevronLeft size={16}/></button>
 <label><span>From</span><input className="field" type="date" aria-label={fromLabel} value={value.from} max={value.to} onChange={e=>{if(e.target.value)onChange({...value,from:e.target.value})}}/></label>
 <label><span>Through</span><input className="field" type="date" aria-label={toLabel} value={value.to} min={value.from} onChange={e=>{if(e.target.value)onChange({...value,to:e.target.value})}}/></label>
 <button className="btn-secondary" type="button" aria-label="Next cycle" disabled={value.from>=current.from||busy} onClick={()=>onChange(businessCycle(value.from,1))}><ChevronRight size={16}/></button></div>
 <div className="rp-period"><select className="field" aria-label="Reporting preset" value={preset} onChange={e=>{const v=e.target.value;if(v==="current"||v==="previous"||v==="three"||v==="year"||v==="all")onChange(reportingPreset(v))}}>
 <option value="">Custom / other period</option><option value="current">Current cycle</option><option value="previous">Previous cycle</option><option value="three">Last 3 cycles</option><option value="year">Work year</option><option value="all">Since start</option></select><button type="button" className="btn-secondary" disabled={busy} onClick={onRefresh}><RefreshCcw size={16}/>Refresh</button></div>
 </section>;
}
