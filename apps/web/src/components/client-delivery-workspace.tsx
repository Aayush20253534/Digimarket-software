"use client";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, FormField, Notice } from "@/components/ui";
type Project={id:string;name:string;description:string|null;status:string;dueOn:string|null;
  _count?:{members:number;milestones:number;deliverables:number}};
type Result={items:Project[];nextCursor:string|null};
type Template="NONE"|"SOCIAL_MONTHLY"|"WEBSITE"|"SEO"|"PAID_ADS";
const initial={name:"",description:"",startOn:"",dueOn:"",template:"SOCIAL_MONTHLY" as Template};
export function ClientDeliveryWorkspace({clientId,canCreate}:{clientId:string;canCreate:boolean}){
  const {session,request}=useAuth();
  const canRead=!!session?.identity.permissions.includes("projects.read");
  const [projects,setProjects]=useState<Project[]>([]);
  const [form,setForm]=useState(initial);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busy,setBusy]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [more,setMore]=useState(false);
  const load=useCallback(async()=>{
    if(!canRead)return;
    try{
      const data=await request<Result>("/projects?"+new URLSearchParams({clientId,limit:"100"}));
      setProjects(data.items);setMore(!!data.nextCursor);setLoaded(true);
    }catch(e){setError(e instanceof Error?e.message:"Unable to load client projects");setLoaded(true);}
  },[clientId,canRead,request]);
  useEffect(()=>{void load();},[load]);
  async function create(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setNotice("");
    try{
      const saved=await request<Project>("/projects",{method:"POST",body:{clientId,...form}});
      setForm(initial);await load();
      setNotice("Project and delivery checklist created. Open the project to assign collaborators and track approvals.");
      // The new project is now in the shared client-linked register.
      if(!saved.id)throw Error("Project creation did not return an identifier");
    }catch(e){setError(e instanceof Error?e.message:"Could not create a delivery project");}
    finally{setBusy(false);}
  }
  if(!canRead)return <Card title="Projects & deliverables" description="Project information is restricted to authorized team members.">
    <p className="text-sm">This account does not have project access.</p>
  </Card>;
  return <Card title="Projects & deliverables" description="Client-linked delivery milestones, responsibilities and approvals. Tasks are created within these projects.">
    {error&&<Notice kind="error">{error}</Notice>}
    {notice&&<Notice kind="success">{notice}</Notice>}
    <div className="mb-4 flex items-center justify-between gap-2">
      <p className="text-sm text-slate-600">{loaded?projects.length+" accessible projects":"Loading projects…"}</p>
      <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={14}/>Refresh</button>
    </div>
    <div className="space-y-2" aria-label="Client projects">
      {projects.map(project=><div key={project.id} className="rounded-lg border border-slate-200 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{project.name}</p>
            <p className="text-xs text-slate-600">{project.status.replaceAll("_"," ")} · {project._count?.deliverables??0} deliverables{project.dueOn?" · Due "+project.dueOn.slice(0,10):""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&session.identity.permissions.includes("tasks.create")&&
              <Link href={"/app/tasks?projectId="+encodeURIComponent(project.id)} className="btn-secondary text-xs">Assign task</Link>}
            <Link href={"/app/projects?focus="+encodeURIComponent(project.id)} className="btn-secondary text-xs">Open <ArrowRight size={14}/></Link>
          </div>
        </div>
      </div>)}
      {loaded&&!projects.length&&<p className="text-sm text-slate-500">No projects yet. Create the first service-delivery project below.</p>}
      {more&&<p className="text-xs text-amber-700">Showing the first 100 projects. Open Projects to see more.</p>}
    </div>
    {canCreate&&<form className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2" onSubmit={create} aria-label="Create client delivery project">
      <h3 className="sm:col-span-2 font-semibold">Set up a delivery project</h3>
      <FormField id="delivery-project-name" label="Project name"><input id="delivery-project-name" className="field" required minLength={2} maxLength={180}
        placeholder="October marketing delivery" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></FormField>
      <FormField id="delivery-project-template" label="Service template"><select id="delivery-project-template" className="field" value={form.template} onChange={e=>setForm(v=>({...v,template:e.target.value as Template}))}>
        <option value="SOCIAL_MONTHLY">Social media: reels and posts</option>
        <option value="WEBSITE">Website build</option>
        <option value="SEO">SEO / AEO / GEO</option>
        <option value="PAID_ADS">Paid advertising</option>
        <option value="NONE">Blank project</option>
      </select></FormField>
      <FormField id="delivery-project-start" label="Start date"><input id="delivery-project-start" className="field" type="date" value={form.startOn}
        onChange={e=>setForm(v=>({...v,startOn:e.target.value}))}/></FormField>
      <FormField id="delivery-project-due" label="Due date"><input id="delivery-project-due" className="field" type="date" min={form.startOn||undefined} value={form.dueOn}
        onChange={e=>setForm(v=>({...v,dueOn:e.target.value}))}/></FormField>
      <FormField id="delivery-project-description" label="Delivery scope"><textarea id="delivery-project-description" className="field" rows={2} maxLength={2000} value={form.description}
        onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></FormField>
      <div className="sm:col-span-2"><button className="btn-primary" disabled={busy} type="submit">{busy?"Creating…":"Create delivery project"}</button></div>
      <p className="sm:col-span-2 text-xs text-slate-500">Templates create a milestone and draft deliverables. They do not automatically create staff tasks, publish content or repeat next month.</p>
    </form>}
  </Card>;
}
