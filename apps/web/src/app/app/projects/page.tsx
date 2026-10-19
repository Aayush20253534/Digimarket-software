"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FolderKanban, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Card, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type ProjectStatus="PLANNED"|"ACTIVE"|"ON_HOLD"|"COMPLETED"|"ARCHIVED";
type MemberRole="MANAGER"|"CONTRIBUTOR"|"REVIEWER";
type Member={userId:string;role:MemberRole;user:{id:string;displayName:string;status:string}};
type Milestone={id:string;title:string;dueOn:string|null;status:"OPEN"|"DONE";version:number};
type Deliverable={id:string;title:string;description:string|null;status:"DRAFT"|"IN_REVIEW"|"CHANGES_REQUESTED"|"APPROVED";
  version:number;revision:number;milestoneId:string|null;assetId:string|null;approvalRequestId:string|null;
  asset:{id:string;filename:string;status:string}|null;
  approvalRequest:{id:string;status:string;requesterId:string;decidedAt:string|null}|null};
type Project={id:string;clientId:string;name:string;description:string|null;status:ProjectStatus;
  startOn:string|null;dueOn:string|null;version:number;client:{id?:string;businessName:string;status?:string};
  _count?:{members:number;milestones:number;deliverables:number}};
type Detail=Project&{members:Member[];milestones:Milestone[];deliverables:Deliverable[]};
type List<T>={items:T[];nextCursor:string|null};
type Client={id:string;businessName:string};
type Asset={id:string;filename:string;status:string};
type User={id:string;displayName:string};
const states:ProjectStatus[]=["PLANNED","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"];
const message=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Request failed";
const dateString=(s:string|null)=>s?s.slice(0,10):"";
export default function ProjectsPage(){
  const {session,request}=useAuth();
  const grants=session?.identity.permissions??[];
  const canRead=grants.includes("projects.read");
  const canCreate=grants.includes("projects.create");
  const canUpdate=grants.includes("projects.update");
  const canAssign=grants.includes("projects.assign");
  const canWrite=grants.includes("projects.deliverables.write");
  const canAssets=grants.includes("assets.read");
  const [projects,setProjects]=useState<Project[]>([]);
  const [clients,setClients]=useState<Client[]>([]);
  const [people,setPeople]=useState<User[]>([]);
  const [assets,setAssets]=useState<Asset[]>([]);
  const [selected,setSelected]=useState<Detail|null>(null);
  const [q,setQ]=useState("");
  const [filter,setFilter]=useState("");
  const [cursor,setCursor]=useState<string|null>(null);
  const [nextCursor,setNextCursor]=useState<string|null>(null);
  const [createForm,setCreateForm]=useState({clientId:"",name:"",description:"",startOn:"",dueOn:""});
  const [status,setStatus]=useState<ProjectStatus>("PLANNED");
  const [member,setMember]=useState({userId:"",role:"CONTRIBUTOR" as MemberRole});
  const [milestone,setMilestone]=useState({title:"",dueOn:""});
  const [deliverable,setDeliverable]=useState({title:"",description:"",milestoneId:"",assetId:""});
  const [editing,setEditing]=useState<Deliverable|null>(null);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const load=useCallback(async()=>{
    if(!canRead){setLoading(false);return;}
    setLoading(true);
    try{
      const args=new URLSearchParams({limit:"50"});
      if(q.trim())args.set("q",q.trim());
      if(filter)args.set("status",filter);
      if(cursor)args.set("cursor",cursor);
      const data=await request<List<Project>>("/projects?"+args.toString());
      setProjects(data.items);setNextCursor(data.nextCursor);setError("");
    }catch(e){setError(message(e));}finally{setLoading(false);}
  },[canRead,request,q,filter,cursor]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{
    if(!canRead)return;
    void request<List<Client>>("/clients?limit=100").then(data=>setClients(data.items)).catch(()=>{});
    if(canAssign)void request<User[]>("/projects/assignees").then(setPeople).catch(()=>{});
  },[canRead,canAssign,request]);
  const open=useCallback(async(id:string)=>{
    try{
      const data=await request<Detail>("/projects/"+id);
      setSelected(data);setStatus(data.status);setError("");
      if(canAssets) {
        const result=await request<List<Asset>>("/assets?limit=100&status=ACTIVE&clientId="+data.clientId);
        setAssets(result.items);
      }else setAssets([]);
    }catch(e){setError(message(e));}
  },[request,canAssets]);
  const grouped=useMemo(()=>states.map(stage=>({stage,items:projects.filter(p=>p.status===stage)})),[projects]);
  async function mutate(action:()=>Promise<unknown>,confirmation:string,reopen=true){
    setBusy(true);setError("");setNotice("");
    try{
      await action();
      if(selected&&reopen)await open(selected.id);
      await load();setNotice(confirmation);
    }catch(e){setError(message(e));}finally{setBusy(false);}
  }
  async function createProject(e:FormEvent){
    e.preventDefault();
    await mutate(async()=>{
      const data=await request<Project>("/projects",{method:"POST",body:createForm});
      setCreateForm({clientId:"",name:"",description:"",startOn:"",dueOn:""});
      setCursor(null);await open(data.id);
    },"Project created.",false);
  }
  async function addMilestone(e:FormEvent){
    e.preventDefault();if(!selected)return;
    await mutate(()=>request("/projects/"+selected.id+"/milestones",{method:"POST",body:milestone}),
      "Milestone added.");
    setMilestone({title:"",dueOn:""});
  }
  async function addMember(e:FormEvent){
    e.preventDefault();if(!selected)return;
    await mutate(()=>request("/projects/"+selected.id+"/members",{method:"POST",body:member}),
      "Member assigned.");
  }
  async function saveDeliverable(e:FormEvent){
    e.preventDefault();if(!selected)return;
    const body={title:deliverable.title,description:deliverable.description,
      milestoneId:deliverable.milestoneId||null,assetId:deliverable.assetId||null};
    await mutate(()=>editing
      ? request("/projects/"+selected.id+"/deliverables/"+editing.id,
        {method:"PUT",body:{...body,version:editing.version}})
      : request("/projects/"+selected.id+"/deliverables",{method:"POST",body}),
      editing?"New deliverable revision saved. Previous approval no longer applies.":"Deliverable added.");
    setEditing(null);setDeliverable({title:"",description:"",milestoneId:"",assetId:""});
  }
  function edit(item:Deliverable){
    setEditing(item);
    setDeliverable({title:item.title,description:item.description??"",
      milestoneId:item.milestoneId??"",assetId:item.assetId??""});
  }
  if(!session)return <Spinner label="Loading projects…"/>;
  if(!canRead)return <><PageHeader title="Projects access denied"/><Notice kind="error">You do not have project read permission.</Notice></>;
  return <div className="space-y-7">
    <PageHeader eyebrow="Client delivery" title="Projects & deliverables"
      description="Client-linked projects, milestones, collaborators and revision-aware deliverable approvals."
      actions={<button className="btn-secondary" type="button" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/> Refresh</button>}/>
    {error&&<Notice kind="error">{error}</Notice>}
    {notice&&<Notice kind="success">{notice}</Notice>}
    {canCreate&&<Card title="Create project" description="Projects must be attached to an active client.">
      <form className="grid gap-3 md:grid-cols-2" onSubmit={createProject}>
        <label className="text-sm">Client
          <select required className="field mt-1 w-full" value={createForm.clientId}
            onChange={e=>setCreateForm(v=>({...v,clientId:e.target.value}))}>
            <option value="">Choose client</option>
            {clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
          </select>
        </label>
        <label className="text-sm">Project name
          <input required minLength={2} maxLength={180} className="field mt-1 w-full" value={createForm.name}
            onChange={e=>setCreateForm(v=>({...v,name:e.target.value}))}/>
        </label>
        <label className="text-sm">Start date
          <input type="date" className="field mt-1 w-full" value={createForm.startOn}
            onChange={e=>setCreateForm(v=>({...v,startOn:e.target.value}))}/>
        </label>
        <label className="text-sm">Due date
          <input type="date" className="field mt-1 w-full" value={createForm.dueOn}
            onChange={e=>setCreateForm(v=>({...v,dueOn:e.target.value}))}/>
        </label>
        <label className="text-sm md:col-span-2">Description
          <textarea className="field mt-1 w-full" maxLength={2000} rows={2} value={createForm.description}
            onChange={e=>setCreateForm(v=>({...v,description:e.target.value}))}/>
        </label>
        <button disabled={busy} className="btn-primary w-fit" type="submit">Create project</button>
      </form>
    </Card>}
    <Card title="Project board" description="Project status changes require authorized project management.">
      <div className="mb-4 flex flex-wrap gap-2">
        <input aria-label="Search projects" className="field min-w-[180px] flex-1" placeholder="Find project or client" value={q}
          onChange={e=>{setQ(e.target.value);setCursor(null);}}/>
        <select aria-label="Filter project status" className="field" value={filter}
          onChange={e=>{setFilter(e.target.value);setCursor(null);}}>
          <option value="">All statuses</option>
          {states.map(v=><option key={v}>{v}</option>)}
        </select>
      </div>
      {loading?<Spinner label="Loading project board…"/>:
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {grouped.map(({stage,items})=><section key={stage} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h2 className="mb-3 text-xs font-bold tracking-wide text-slate-600">{stage.replaceAll("_"," ")} ({items.length})</h2>
            <div className="space-y-2">{items.map(project=><button type="button" key={project.id}
              className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-indigo-400"
              onClick={()=>void open(project.id)}>
              <span className="block text-sm font-semibold text-slate-900">{project.name}</span>
              <span className="mt-1 block text-xs text-slate-500">{project.client.businessName}</span>
              <span className="mt-2 block text-xs text-slate-500">{project._count?.deliverables??0} deliverables</span>
            </button>)}</div>
          </section>)}
        </div>}
      {!loading&&!projects.length&&<p className="py-6 text-sm text-slate-500">No projects match these filters.</p>}
      <div className="mt-4 flex justify-between">
        <button className="btn-secondary" disabled={!cursor||busy} onClick={()=>setCursor(null)} type="button">First page</button>
        <button className="btn-secondary" disabled={!nextCursor||busy} onClick={()=>setCursor(nextCursor)} type="button">Next page</button>
      </div>
    </Card>
    {selected&&<div className="space-y-5">
      <Card title={selected.name} description={"Client: "+selected.client.businessName}>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={selected.status}/>
          <p className="text-sm text-slate-500">{selected.description||"No description"}</p>
          {selected.dueOn&&<p className="text-sm">Due {dateString(selected.dueOn)}</p>}
          {canUpdate&&<form className="flex gap-2" onSubmit={e=>{
            e.preventDefault();void mutate(()=>request("/projects/"+selected.id,
              {method:"PUT",body:{version:selected.version,status}}),"Project status saved.");
          }}>
            <select className="field" aria-label="Project status" value={status}
              onChange={e=>setStatus(e.target.value as ProjectStatus)}>
              {states.map(s=><option key={s}>{s}</option>)}
            </select>
            <button className="btn-primary" disabled={busy}>Save</button>
          </form>}
        </div>
      </Card>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Team members" description="Project membership determines employee visibility.">
          <ul className="mb-4 space-y-2">{selected.members.map(m=><li key={m.userId} className="flex justify-between text-sm">
            <span>{m.user.displayName}</span><span className="text-slate-500">{m.role}</span>
          </li>)}</ul>
          {canAssign&&<form className="space-y-2" onSubmit={addMember}>
            <label className="block text-sm">Staff member
              <select required className="field mt-1 w-full" value={member.userId}
                onChange={e=>setMember(v=>({...v,userId:e.target.value}))}>
                <option value="">Choose staff member</option>
                {people.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
              </select>
            </label>
            <label className="block text-sm">Responsibility
              <select className="field mt-1 w-full" value={member.role}
                onChange={e=>setMember(v=>({...v,role:e.target.value as MemberRole}))}>
                <option value="MANAGER">Manager</option><option value="CONTRIBUTOR">Contributor</option><option value="REVIEWER">Reviewer</option>
              </select>
            </label>
            <button className="btn-primary" disabled={busy}>Assign or update</button>
          </form>}
        </Card>
        <Card title="Milestones" description="A milestone can be completed only after all of its deliverables are approved.">
          <ul className="mb-4 space-y-3">{selected.milestones.map(m=><li key={m.id} className="rounded-lg border p-3 text-sm">
            <div className="flex justify-between"><b>{m.title}</b><StatusBadge status={m.status}/></div>
            {m.dueOn&&<span className="text-slate-500">Due {dateString(m.dueOn)}</span>}
            {canUpdate&&<button className="btn-secondary mt-2" disabled={busy} onClick={()=>void mutate(()=>
              request("/projects/"+selected.id+"/milestones/"+m.id,
                {method:"PUT",body:{version:m.version,status:m.status==="OPEN"?"DONE":"OPEN"}}),"Milestone updated.")}>
              Mark {m.status==="OPEN"?"done":"open"}
            </button>}
          </li>)}</ul>
          {canUpdate&&<form onSubmit={addMilestone} className="space-y-2">
            <input className="field w-full" required minLength={2} placeholder="New milestone" value={milestone.title}
              onChange={e=>setMilestone(v=>({...v,title:e.target.value}))}/>
            <input aria-label="Milestone due date" className="field w-full" type="date" value={milestone.dueOn}
              onChange={e=>setMilestone(v=>({...v,dueOn:e.target.value}))}/>
            <button className="btn-primary" disabled={busy}>Add milestone</button>
          </form>}
        </Card>
      </div>
      <Card title="Deliverables" description="Submit revisions to the DELIVERABLE approval policy; approvers decide in the Approvals queue.">
        <div className="space-y-3">{selected.deliverables.map(d=><div key={d.id} className="rounded-xl border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><b className="text-sm">{d.title}</b><p className="text-xs text-slate-500">Revision {d.revision} · {d.description||"No description"}</p></div>
            <StatusBadge status={d.status}/>
          </div>
          {d.asset&&<p className="mt-2 text-xs text-slate-600">Attached file: {d.asset.filename}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            {canWrite&&d.status!=="IN_REVIEW"&&<button type="button" className="btn-secondary" onClick={()=>edit(d)}>Revise</button>}
            {canWrite&&grants.includes("approvals.submit")&&(d.status==="DRAFT"||d.status==="CHANGES_REQUESTED")&&
              <button type="button" className="btn-primary" disabled={busy}
                onClick={()=>void mutate(()=>request("/projects/"+selected.id+"/deliverables/"+d.id+"/submit",
                  {method:"POST",body:{version:d.version}}),"Submitted for review.")}>Submit for approval</button>}
            {d.approvalRequestId&&<Link className="btn-secondary" href="/app/approvals">View approval queue</Link>}
          </div>
        </div>)}</div>
        {canWrite&&<form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={saveDeliverable}>
          <h3 className="text-sm font-bold md:col-span-2">{editing?"Edit deliverable revision":"New deliverable"}</h3>
          <label className="text-sm">Title
            <input className="field mt-1 w-full" required minLength={2} value={deliverable.title}
              onChange={e=>setDeliverable(v=>({...v,title:e.target.value}))}/>
          </label>
          <label className="text-sm">Milestone
            <select className="field mt-1 w-full" value={deliverable.milestoneId}
              onChange={e=>setDeliverable(v=>({...v,milestoneId:e.target.value}))}>
              <option value="">Unassigned</option>
              {selected.milestones.filter(m=>m.status==="OPEN").map(m=><option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
          <label className="text-sm">File from client asset manager
            <select className="field mt-1 w-full" disabled={!canAssets} value={deliverable.assetId}
              onChange={e=>setDeliverable(v=>({...v,assetId:e.target.value}))}>
              <option value="">No file</option>
              {assets.map(a=><option key={a.id} value={a.id}>{a.filename}</option>)}
            </select>
          </label>
          <label className="text-sm">Description
            <textarea className="field mt-1 w-full" rows={2} maxLength={2000} value={deliverable.description}
              onChange={e=>setDeliverable(v=>({...v,description:e.target.value}))}/>
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button className="btn-primary" disabled={busy}>{editing?"Save revision":"Add deliverable"}</button>
            {editing&&<button type="button" className="btn-secondary" onClick={()=>{
              setEditing(null);setDeliverable({title:"",description:"",milestoneId:"",assetId:""});
            }}>Cancel edit</button>}
          </div>
        </form>}
        {!selected.deliverables.length&&<p className="text-sm text-slate-500">No deliverables yet.</p>}
      </Card>
    </div>}
    <p className="text-xs text-slate-500">Project completion requires completed milestones and approved deliverables. Assets remain secured by the file access rules.</p>
    <FolderKanban className="sr-only" aria-hidden="true"/>
  </div>;
}
