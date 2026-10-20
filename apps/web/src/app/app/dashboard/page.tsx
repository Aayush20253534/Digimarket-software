"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, BriefcaseBusiness, CheckCircle2,
  CircleHelp, FileStack, FolderKanban, KeyRound, Layers, NotebookPen, RefreshCw, ShieldCheck,
  Sparkles, Users, Wallet, Workflow
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AWBadge, AWEmptyState, AWNotice, AWStatusBadge } from "@/components/aw-ui";
import { AWDataToolbar, AWLocalPagination, AWPanel, AWSortButton, AWStat } from "@/components/aw-data-patterns";
import { permittedGroups } from "@/components/workspace-navigation";
import { AWActionCenter } from "@/components/aw-action-center";
import { AWPersonalTasks } from "@/components/aw-personal-tasks";

type Source = "Clients" | "Leads" | "Projects";
type Entry = { id: string; name: string; status: string; source: Source; href: string; };
type ResponsePage<T> = { items: T[]; nextCursor: string | null };
type Client = { id: string; businessName: string; status: string };
type Lead = { id: string; businessName: string; status: string };
type Project = { id: string; name: string; status: string };
type Overview = { records: Entry[]; sources: Source[]; more: Source[]; errors: Source[] };

const paths: Record<Source,string> = { Clients:"/app/clients",Leads:"/app/leads",Projects:"/app/projects" };
const choices = [
  {label:"All record types",value:"all"},
  {label:"Clients",value:"Clients"},
  {label:"Leads",value:"Leads"},
  {label:"Projects",value:"Projects"},
];
const topics = [
  {label:"Leads CRM",permits:["leads.read"],href:"/app/leads",icon:BriefcaseBusiness,detail:"Pipeline, follow-ups, and conversions"},
  {label:"Clients",permits:["clients.read"],href:"/app/clients",icon:Users,detail:"Client contacts and service delivery"},
  {label:"Projects",permits:["projects.read"],href:"/app/projects",icon:FolderKanban,detail:"Milestones and deliverables"},
  {label:"Tasks",permits:["tasks.read"],href:"/app/tasks",icon:CheckCircle2,detail:"Assignments and recurring work"},
  {label:"Content calendar",permits:["content.read"],href:"/app/content",icon:Layers,detail:"Editorial planning and approvals"},
  {label:"Income & expenses",permits:["finance.entry.read.own","finance.read.all"],href:"/app/finance",icon:Wallet,detail:"Your permitted financial records"},
  {label:"Approval workflows",permits:["approvals.read"],href:"/app/approvals",icon:Workflow,detail:"Reviews and decisions"},
  {label:"Files & assets",permits:["assets.read"],href:"/app/assets",icon:FileStack,detail:"Protected brand resources"},
];

export default function Dashboard() {
  const {session,request}=useAuth();
  const [overview,setOverview]=useState<Overview | null>(null);
  const [busy,setBusy]=useState(false);
  const [query,setQuery]=useState("");
  const [source,setSource]=useState("all");
  const [descending,setDescending]=useState(false);
  const [page,setPage]=useState(1);
  const grants=session?.identity.permissions ?? [];
  const permitted=useMemo(()=>new Set(grants),[grants]);
  const available=useMemo(()=>topics.filter(x=>x.permits.some(p=>permitted.has(p))),[permitted]);
  const nav=useMemo(()=>permittedGroups(grants).flatMap(group=>group.items),[grants]);

  const load=useCallback(async()=>{
    if(!session||!session.identity.roles.some(role=>["ADMIN","SUPER_ADMIN"].includes(role)))return;
    const toLoad: Source[]=[];
    if(session.identity.permissions.includes("clients.read"))toLoad.push("Clients");
    if(session.identity.permissions.includes("leads.read"))toLoad.push("Leads");
    if(session.identity.permissions.includes("projects.read"))toLoad.push("Projects");
    if(!toLoad.length){setOverview({records:[],sources:[],more:[],errors:[]});return;}
    setBusy(true);
    const settled=await Promise.allSettled(toLoad.map(async(name)=>{
      if(name==="Clients"){
        const data=await request<ResponsePage<Client>>("/clients?limit=10");
        return {name,items:data.items.map(x=>({id:x.id,name:x.businessName,status:x.status,source:name,href:paths[name]})),hasMore:!!data.nextCursor};
      }
      if(name==="Leads"){
        const data=await request<ResponsePage<Lead>>("/leads?limit=10");
        return {name,items:data.items.map(x=>({id:x.id,name:x.businessName,status:x.status,source:name,href:paths[name]})),hasMore:!!data.nextCursor};
      }
      const data=await request<ResponsePage<Project>>("/projects?limit=10");
      return {name,items:data.items.map(x=>({id:x.id,name:x.name,status:x.status,source:name,href:paths[name]})),hasMore:!!data.nextCursor};
    }));
    const records:Entry[]=[];
    const sources:Source[]=[];
    const more:Source[]=[];
    const errors:Source[]=[];
    settled.forEach((result,index)=>{
      if(result.status==="fulfilled"){
        sources.push(result.value.name);
        if(result.value.hasMore)more.push(result.value.name);
        records.push(...result.value.items);
      }else{
        errors.push(toLoad[index]);
      }
    });
    setOverview({records,sources,more,errors});
    setBusy(false);
  },[request,session]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{setPage(1);},[query,source,descending]);

  const filtered=useMemo(()=>{
    const q=query.toLowerCase().trim();
    const selected=overview?.records.filter(item=>(source==="all"||item.source===source)
      &&(!q||[item.name,item.source,item.status].some(part=>part.toLowerCase().includes(q))))??[];
    return selected.sort((a,b)=>descending?b.name.localeCompare(a.name):a.name.localeCompare(b.name));
  },[overview,query,source,descending]);
  const pages=Math.max(1,Math.ceil(filtered.length/7));
  const visible=filtered.slice((Math.min(page,pages)-1)*7,Math.min(page,pages)*7);
  const firstName=session?.user.displayName.split(" ")[0]??"there";
  if(!session)return null;
  const leadership=session.identity.roles.some(role=>["ADMIN","SUPER_ADMIN"].includes(role));
  if(!leadership)return <AWPersonalTasks/>;
  const groupCounts:Record<Source,number>={Clients:0,Leads:0,Projects:0};
  overview?.records.forEach(x=>{groupCounts[x.source]++;});
  return <div className="aw-dashboard space-y-7" data-testid="amplifyworld-dashboard">
    <header className="aw-dashboard-hero">
      <div className="min-w-0">
        <p className="aw-eyebrow"><Sparkles size={14} className="mr-2 inline" aria-hidden="true"/>Agency command center</p>
        <h1 className="aw-dashboard-title">Welcome, <span className="aw-gradient-text">{firstName}</span></h1>
        <p className="aw-dashboard-subtitle">
          Your permissions, current workspace records and everyday tools in one place.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <AWStatusBadge status={session.user.status}/>
        <button type="button" className="aw-dashboard-refresh" onClick={()=>void load()} disabled={busy}
          aria-label="Refresh overview"><RefreshCw size={16} className={busy?"animate-spin":""} aria-hidden="true"/>
          {busy?"Updating…":"Refresh overview"}
        </button>
      </div>
    </header>

    {leadership&&<div className="aw-stat-grid" data-testid="dashboard-kpis">
      <AWStat label="Your session" value="Authenticated" description="Verified against the active API session"
        icon={<BadgeCheck size={21}/>} accent/>
      <AWStat label="Assigned roles" value={session.identity.roles.length} description={session.identity.roles.join(", ")||"No roles"}
        icon={<KeyRound size={21}/>}/>
      <AWStat label="Access grants" value={session.identity.permissions.length} description="Rights enforced by the backend"
        icon={<ShieldCheck size={21}/>}/>
      <AWStat label="Available modules" value={nav.length} description="Navigation destinations your role can open"
        icon={<Layers size={21}/>}/>
    </div>}

    {leadership&&<div className="aw-records-summary" aria-label="Loaded record summary">
      {(["Clients","Leads","Projects"] as const).filter(label=>{
        const permission=label==="Clients"?"clients.read":label==="Leads"?"leads.read":"projects.read";
        return permitted.has(permission);
      }).map(label=><Link key={label} href={paths[label]} className="aw-summary-item">
        <span className="aw-summary-number">{overview ? groupCounts[label] : "…"}</span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#EDE2FA]">{label}</span>
          <span className="block text-xs leading-5 text-[#A69ABD]">Recent page loaded · open module for full list</span>
        </span>
        <ArrowUpRight size={17} className="ml-auto shrink-0 text-[#BA80E8]" aria-hidden="true"/>
      </Link>)}
    </div>}

    {overview?.errors.length ? <AWNotice tone="error">
      Could not load recent {overview.errors.join(", ").toLowerCase()} records. Other workspace functions remain available.
    </AWNotice> : null}
    {overview?.more.length ? <AWNotice tone="info">
      These counts and rows show the first 10 records returned from each permitted module, not agency-wide totals.
      More records are available in: {overview.more.join(", ")}.
    </AWNotice> : null}

    <AWActionCenter />

    <div className="aw-dashboard-main-grid">
      <AWPanel title="Recent workspace records" description="Live data from modules your account can access. Results are limited to the first API page.">
        <AWDataToolbar query={query} onQuery={setQuery} placeholder="Search recent records"
          filter={source} onFilter={setSource} choices={choices} count={filtered.length}/>
        {busy && !overview ? <div className="aw-dashboard-wait" role="status">
          <RefreshCw size={17} className="animate-spin" aria-hidden="true"/> Loading your records…
        </div> : filtered.length ? <>
          <div className="aw-dashboard-table-wrap">
            <table className="aw-dashboard-table" aria-label="Recent workspace records">
              <thead><tr>
                <th scope="col"><AWSortButton label="Name" descending={descending} onClick={()=>setDescending(v=>!v)}/></th>
                <th scope="col">Module</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Open</span></th>
              </tr></thead>
              <tbody>{visible.map(entry=><tr key={entry.source+entry.id}>
                <td><span className="aw-row-name">{entry.name}</span></td>
                <td><AWBadge tone="neutral">{entry.source}</AWBadge></td>
                <td><AWStatusBadge status={entry.status}/></td>
                <td className="text-right"><Link href={entry.href} className="aw-row-open" aria-label={"Open "+entry.source+" module"}>
                  <ArrowUpRight size={17} aria-hidden="true"/></Link></td>
              </tr>)}</tbody>
            </table>
          </div>
          <AWLocalPagination page={Math.min(page,pages)} pages={pages} onPage={setPage}/>
        </> : <AWEmptyState title={overview?"No matching records":"No records loaded yet"}
          description={overview?"Try another filter or open the module to view its complete dataset.":"The data appears here once your allowed modules are loaded."}
          action={<Link className="aw-button aw-button-secondary aw-button-sm" href="/app/profile">View my access <ArrowRight size={15}/></Link>}/>}
      </AWPanel>

      <div className="space-y-5">
        <AWPanel title="Quick access" description="Only destinations your current role can use.">
          <div className="aw-quick-grid">
            <Link href="/app/profile" className="aw-quick-link">
              <span className="aw-quick-icon"><ShieldCheck size={18}/></span>
              <span className="min-w-0"><strong>View account and permissions</strong><small>Personal access and security</small></span>
              <ArrowUpRight size={17} className="ml-auto shrink-0"/>
            </Link>
            {available.map(({label,href,icon:Icon,detail})=><Link key={href} href={href} className="aw-quick-link">
              <span className="aw-quick-icon"><Icon size={18}/></span>
              <span className="min-w-0"><strong>{label}</strong><small>{detail}</small></span>
              <ArrowUpRight size={17} className="ml-auto shrink-0"/>
            </Link>)}
            {permitted.has("users.read")&&<Link href="/app/team/users" className="aw-quick-link">
              <span className="aw-quick-icon"><Users size={18}/></span>
              <span className="min-w-0"><strong>Team account management</strong><small>Accounts and assigned roles</small></span>
              <ArrowUpRight size={17} className="ml-auto shrink-0"/>
            </Link>}
          </div>
        </AWPanel>
        <AWPanel title="Access & scope" description="A concise view of the security context for this account.">
          <div className="aw-access-line"><span>Account status</span><AWStatusBadge status={session.user.status}/></div>
          <div className="aw-access-line"><span>Roles</span><span className="max-w-[58%] text-right text-sm text-[#E8D7FB]">{session.identity.roles.join(", ")||"None"}</span></div>
          <div className="aw-access-line"><span>Security</span><span className="inline-flex items-center gap-2 text-sm text-[#B9EDCF]"><CheckCircle2 size={15}/> Session active</span></div>
          <p className="mt-4 flex items-start gap-2 text-xs leading-6 text-[#9F91B1]">
            <CircleHelp size={16} className="mt-1 shrink-0" aria-hidden="true"/>
            Access and record visibility are enforced by the API. No business totals are inferred from partial list pages.
          </p>
        </AWPanel>
      </div>
    </div>
    <div className="mt-4 flex justify-end"><Link href="/app/notes" className="aw-dashboard-refresh"><NotebookPen size={16} aria-hidden="true"/> Open or save a note</Link></div>
    <footer className="aw-dashboard-footer">
      <Activity size={15} aria-hidden="true"/> AmplifyWorld Workspace · Live account context
    </footer>
  </div>;
}
