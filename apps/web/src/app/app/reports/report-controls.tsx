"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {agencyToday,businessCycle,reportingPreset,type ReportingPeriod} from "@digimarket/contracts";
import {useAuth} from "@/components/auth-provider";
import {RefreshCcw,ChevronLeft,ChevronRight} from "lucide-react";
export function ReportTabs({from,to}:ReportingPeriod){
 const {session}=useAuth(),pathname=usePathname(),grants=session?.identity.permissions??[];
 const tabs=[{label:"Overview",path:"",allowed:true},{label:"Leads",path:"/leads",allowed:grants.includes("leads.read")},{label:"Income",path:"/income",allowed:grants.includes("finance.read.all")},{label:"Expenses",path:"/expenses",allowed:grants.includes("finance.read.all")},{label:"Client Delivery",path:"/client-delivery",allowed:grants.includes("clients.read")}];
 return <nav className="rp-tabs" aria-label="Report views">{tabs.filter(x=>x.allowed).map(x=>{const href="/app/reports"+x.path;return <Link key={href} aria-current={pathname===href?"page":undefined} href={href+"?"+new URLSearchParams({from,to})}>{x.label}</Link>})}</nav>;
}
export function ReportToolbar({value,onChange,busy,onRefresh}:{value:ReportingPeriod;onChange:(v:ReportingPeriod)=>void;busy:boolean;onRefresh:()=>void}){
 const cycle=businessCycle(value.from),current=businessCycle(),exact=cycle.from===value.from&&cycle.to===value.to;
 return <section className="rp-toolbar" aria-label="Reporting period">
 <div className="rp-period"><button className="btn-secondary" type="button" aria-label="Previous cycle" disabled={value.from<="2026-10-22"||busy} onClick={()=>onChange(businessCycle(value.from,-1))}><ChevronLeft size={16}/></button>
 <label><span>From</span><input className="field" type="date" aria-label="Work cycle from" value={value.from} max={value.to} onChange={e=>{if(e.target.value)onChange({...value,from:e.target.value})}}/></label>
 <label><span>Through</span><input className="field" type="date" aria-label="Work cycle through" value={value.to} min={value.from} onChange={e=>{if(e.target.value)onChange({...value,to:e.target.value})}}/></label>
 <button className="btn-secondary" type="button" aria-label="Next cycle" disabled={value.from>=current.from||busy} onClick={()=>onChange(businessCycle(value.from,1))}><ChevronRight size={16}/></button></div>
 <div className="rp-period"><select className="field" aria-label="Reporting preset" value={exact&&cycle.from===current.from?"current":exact&&cycle.from===businessCycle(agencyToday(),-1).from?"previous":""} onChange={e=>{const v=e.target.value;if(v==="current"||v==="previous"||v==="three"||v==="year"||v==="all")onChange(reportingPreset(v))}}>
 <option value="">Custom / other period</option><option value="current">Current cycle</option><option value="previous">Previous cycle</option><option value="three">Last 3 cycles</option><option value="year">Work year</option><option value="all">Since start</option></select><button type="button" className="btn-secondary" disabled={busy} onClick={onRefresh}><RefreshCcw size={16}/>Refresh</button></div>
 </section>;
}
export function comparisonPeriod(period:ReportingPeriod,today=agencyToday()):{current:ReportingPeriod;previous:ReportingPeriod}|null{
 const cycle=businessCycle(period.from);
 if(cycle.from!==period.from||cycle.to!==period.to||period.from>today)return null;
 const previous=businessCycle(period.from,-1);
 if(previous.from<"2026-10-22")return null;
 if(period.to<=today)return {current:period,previous};
 const days=Math.round((Date.parse(today)-Date.parse(period.from))/86400000);
 const end=new Date(Date.parse(previous.from)+days*86400000).toISOString().slice(0,10);
 if(end>previous.to)return null;
 return {current:{from:period.from,to:today},previous:{from:previous.from,to:end}};
}
