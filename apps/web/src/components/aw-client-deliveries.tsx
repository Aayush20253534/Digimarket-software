"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarDays, ClipboardCheck, FolderKanban, RefreshCw, Users, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AWNotice } from "@/components/aw-ui";

type Target={id:string;name:string;monthlyTarget:number|null;deliveredThisMonth:number|null};
type Project={id:string;name:string;status:string;dueOn:string|null;totalDeliverables:number;approvedDeliverables:number};
type Delivery={id:string;businessName:string;status:string;contractEndOn:string|null;
  targets:Target[];projects:Project[];activeProjects:number;totalDeliverables:number;approvedDeliverables:number};
type Summary={items:Delivery[];truncated:boolean;month:string};
const shortDate=(date:string)=>new Date(date).toLocaleDateString(undefined,{day:"numeric",month:"short"});
export function AWClientDeliveries(){
  const {session,request}=useAuth();
  const allowed=!!session?.identity.permissions.includes("clients.read");
  const [summary,setSummary]=useState<Summary|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const reload=useCallback(async()=>{
    if(!allowed)return;
    setBusy(true);setError("");
    try{setSummary(await request<Summary>("/clients/deliveries"));}
    catch(e){setError(e instanceof Error?e.message:"Unable to load client deliveries");}
    finally{setBusy(false);}
  },[allowed,request]);
  useEffect(()=>{void reload();},[reload]);
  if(!allowed)return null;
  return <section className="space-y-4" data-testid="client-deliveries-overview" aria-label="Client deliveries">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="aw-eyebrow">DELIVERY OPERATIONS</p>
        <h2 className="aw-dashboard-title text-2xl font-bold text-white sm:text-3xl">Client Deliveries</h2>
        <p className="mt-1 text-sm text-[#BFAAD1]">Contract commitments and project progress. Team tasks stay in the delivery workspace.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href="/app/clients" className="aw-dashboard-refresh"><Users size={16}/>All clients</Link>
        {session?.identity.permissions.includes("projects.read")&&<Link href="/app/projects" className="aw-dashboard-refresh"><FolderKanban size={16}/>Projects</Link>}
        <button className="aw-dashboard-refresh" type="button" disabled={busy} onClick={()=>void reload()}><RefreshCw size={16} className={busy?"animate-spin":""}/>Refresh deliveries</button>
      </div>
    </div>
    {error&&<AWNotice tone="error">{error} The last successful data remains visible.</AWNotice>}
    {summary?.truncated&&<AWNotice tone="info">Showing the latest 100 clients. Open Clients for the full directory.</AWNotice>}
    {!summary&&!error?<p role="status" className="text-sm text-[#BFAAD1]">Loading client delivery records…</p>:
     summary?.items.length===0?<div className="rounded-xl border border-violet-500/30 bg-[#20162F] p-5">
       <p className="font-semibold text-white">No clients in delivery yet</p>
       <p className="mt-1 text-sm text-[#BFAAD1]">Approved leads appear in Clients. Set up their services and projects to track delivery here.</p>
       <Link href="/app/clients" className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline">Open Clients <ArrowRight size={15}/></Link>
     </div>:null}
    {summary&&summary.items.length>0&&<div className="grid gap-3 lg:grid-cols-2" data-testid="client-deliveries-list">
      {summary.items.map(client=><article key={client.id} className="min-w-0 rounded-xl border border-violet-500/30 bg-[#20162F] p-4 shadow-[0_4px_24px_rgba(112,58,160,0.13)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={"/app/clients/"+encodeURIComponent(client.id)} className="text-base font-bold text-white hover:underline">{client.businessName}</Link>
            <p className="mt-1 text-xs text-[#BFAAD1]">{client.activeProjects} planned / active projects · {client.status.toLowerCase()}</p>
          </div>
          <Link href={"/app/clients/"+encodeURIComponent(client.id)} className="shrink-0 rounded-lg border border-violet-500/40 p-2 text-purple-200" aria-label={"Open delivery for "+client.businessName}><ArrowRight size={18}/></Link>
        </div>
        {client.totalDeliverables>0?<div className="mt-3">
          <div className="flex justify-between gap-3 text-xs text-[#E7D8F6]">
            <span>Approved project deliverables</span><strong>{client.approvedDeliverables} / {client.totalDeliverables}</strong>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#41324F]"><div className="h-full rounded-full bg-violet-400" style={{width:(client.approvedDeliverables/client.totalDeliverables*100)+"%"}}/></div>
        </div>:<p className="mt-3 text-xs text-[#BFAAD1]">No tracked project deliverables yet. Set up delivery milestones in this client.</p>}
        {client.targets.length>0&&<div className="mt-3 flex flex-wrap gap-2">
          {client.targets.map(target=><span key={target.id} className="rounded-md border border-violet-500/30 bg-[#2B1D40] px-2 py-1 text-xs text-[#E8D7FA]">
            {target.name}: {target.deliveredThisMonth===null||target.monthlyTarget===null?"Target "+(target.monthlyTarget??"not set"):target.deliveredThisMonth+" / "+target.monthlyTarget+" this month"}
          </span>)}
        </div>}
        {client.contractEndOn&&<p className="mt-3 flex items-center gap-2 text-xs text-[#CBB9D9]"><CalendarDays size={14}/>Contract ends {shortDate(client.contractEndOn)}</p>}
      </article>)}
    </div>}
    <nav aria-label="Delivery quick access" className="aw-personal-quick">
      <h2>Quick access</h2>
      <div className="aw-personal-quick-grid">{[
        {title:"Leads CRM",desc:"Meetings and conversions",href:"/app/leads",perm:"leads.read",icon:BriefcaseBusiness,tone:"purple"},
        {title:"Clients",desc:"Client delivery workspace",href:"/app/clients",perm:"clients.read",icon:Users,tone:"pink"},
        {title:"Income & expenses",desc:"Financial entries",href:"/app/finance",perm:"finance.entry.read.own",icon:Wallet,tone:"cyan"},
        {title:"Tasks",desc:"Internal service work",href:"/app/tasks",perm:"tasks.read",icon:ClipboardCheck,tone:"orange"},
      ].filter(item=>session?.identity.permissions.includes(item.perm)||item.href==="/app/finance"&&session?.identity.permissions.includes("finance.read.all")).map(({title,desc,href,icon:Icon,tone})=>
        <Link key={href} href={href} className={"aw-personal-shortcut aw-personal-shortcut-"+tone}>
          <Icon size={19}/><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={16}/>
        </Link>)}</div>
    </nav>
  </section>;
}
