"use client";
import Link from "next/link";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {ArrowRight,CheckCircle2,FolderKanban,Plus,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
type Project={id:string;name:string;description:string|null;status:string;dueOn:string|null;_count?:{members:number;milestones:number;deliverables:number}};
type Result={items:Project[];nextCursor:string|null};
type Template="NONE"|"SOCIAL_MONTHLY"|"WEBSITE"|"SEO"|"PAID_ADS";
const fresh=()=>({name:"",description:"",startOn:"",dueOn:"",template:"SOCIAL_MONTHLY" as Template});
export function ClientDeliveryWorkspace({clientId,canCreate}:{clientId:string;canCreate:boolean}){
 const {session,request}=useAuth(),canRead=!!session?.identity.permissions.includes("projects.read");
 const [projects,setProjects]=useState<Project[]>([]),[form,setForm]=useState(fresh),[expanded,setExpanded]=useState(false);
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[more,setMore]=useState(false);
 const load=useCallback(async()=>{
  if(!canRead)return;
  try{const result=await request<Result>("/projects?"+new URLSearchParams({clientId,limit:"100"}));setProjects(result.items);setMore(!!result.nextCursor);setError("");}
  catch(e){setError(e instanceof Error?e.message:"Unable to load projects");}
  finally{setLoaded(true);}
 },[clientId,canRead,request]);
 useEffect(()=>{void load();},[load]);
 async function create(e:FormEvent){
  e.preventDefault();setBusy(true);setError("");setNotice("");
  try{
   const created=await request<Project>("/projects",{method:"POST",body:{clientId,...form}});
   if(!created.id)throw Error("Project creation did not return an identifier");
   setForm(fresh());await load();setExpanded(false);
   setNotice("Delivery project created. Open it to manage milestones, collaborators and approvals.");
  }catch(e){setError(e instanceof Error?e.message:"Project creation failed");}
  finally{setBusy(false);}
 }
 if(!canRead)return <section className="aw-client-panel"><h2>Projects & deliverables</h2><p className="aw-client-muted">You do not have permission to view client projects.</p></section>;
 const active=projects.filter(p=>p.status==="ACTIVE"||p.status==="PLANNED").length;
 const total=projects.reduce((n,p)=>n+(p._count?.deliverables||0),0);
 return <section className="aw-client-panel" aria-label="Projects and deliverables">
  <div className="aw-client-panel-heading">
   <div><p className="aw-client-kicker">DELIVERY PLANNING</p><h2>Projects & deliverables</h2><p>Each project is linked to this client. Templates create draft milestones and deliverables, not completed work.</p></div>
   <div className="aw-client-actions"><button type="button" disabled={busy} className="aw-client-btn" onClick={()=>void load()}><RefreshCw size={15}/>Refresh</button>
    {canCreate&&<button type="button" className="aw-client-primary" aria-label="Create client delivery project" aria-expanded={expanded}
      onClick={()=>setExpanded(v=>!v)}><Plus size={15}/>{expanded?"Close setup":"New delivery project"}</button>}
   </div>
  </div>
  {error&&<div role="alert" className="aw-client-alert">{error}</div>}
  {notice&&<div role="status" className="aw-client-success">{notice}</div>}
  <div className="aw-client-metrics">
   <div><span>Accessible projects</span><strong>{loaded?projects.length:"…"}</strong></div>
   <div><span>Planned / active</span><strong>{loaded?active:"…"}</strong></div>
   <div><span>Tracked deliverables</span><strong>{loaded?total:"…"}</strong></div>
  </div>
  <div className="aw-client-project-grid" aria-label="Client projects">
   {projects.map(item=><article key={item.id} className="aw-client-project">
    <div className="aw-client-panel-heading"><div><div className="aw-client-project-icon"><FolderKanban size={19}/></div><h3>{item.name}</h3><p>{item.description||"No project description"}</p></div>
     <span className="aw-client-project-state">{item.status.replaceAll("_"," ")}</span>
    </div>
    <div className="aw-client-project-details"><span><CheckCircle2 size={14}/>{item._count?.deliverables||0} deliverables</span><span>{item._count?.milestones||0} milestones</span>{item.dueOn&&<span>Due {item.dueOn.slice(0,10)}</span>}</div>
    <div className="aw-client-actions">
     <Link href={"/app/projects?focus="+encodeURIComponent(item.id)} className="aw-client-btn">Manage project <ArrowRight size={14}/></Link>
     {session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&session.identity.permissions.includes("tasks.create")&&
      <Link href={"/app/tasks?projectId="+encodeURIComponent(item.id)} className="aw-client-btn">Assign task</Link>}
    </div>
   </article>)}
  </div>
  {loaded&&!projects.length&&<div className="aw-client-empty"><FolderKanban size={23}/><h3>No delivery projects yet</h3><p>Add the agreed services, then start a project using the appropriate template. Work remains empty until a project is created.</p></div>}
  {more&&<p className="aw-client-muted">Showing the first 100 accessible projects. Agency-wide projects are available in the Projects module.</p>}
  {canCreate&&expanded&&<form className="aw-client-form aw-client-subform" onSubmit={create} aria-label="Create client delivery project">
   <h3>Set up delivery project</h3>
   <p className="aw-client-muted">Use a separate project for each meaningful workstream, such as monthly social content or a one-time website.</p>
   <div className="aw-client-form-grid">
    <label>Project name<input className="field" required minLength={2} maxLength={180} placeholder="October social media delivery" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
    <label>Service template<select className="field" value={form.template} onChange={e=>setForm(v=>({...v,template:e.target.value as Template}))}>
     <option value="SOCIAL_MONTHLY">Social media: reels & posts</option><option value="WEBSITE">Website development</option><option value="SEO">SEO / AEO / GEO</option><option value="PAID_ADS">Paid advertising</option><option value="NONE">Blank project</option>
    </select></label>
    <label>Start date<input className="field" type="date" value={form.startOn} onChange={e=>setForm(v=>({...v,startOn:e.target.value}))}/></label>
    <label>Due date<input className="field" type="date" min={form.startOn||undefined} value={form.dueOn} onChange={e=>setForm(v=>({...v,dueOn:e.target.value}))}/></label>
    <label className="aw-client-wide">Scope<textarea className="field" maxLength={2000} rows={3} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>
   </div>
   <div className="aw-client-actions"><button type="submit" className="aw-client-primary" disabled={busy}>{busy?"Creating…":"Create project and checklist"}</button><button type="button" className="aw-client-btn" onClick={()=>setExpanded(false)}>Cancel</button></div>
   <p className="aw-client-muted">Templates do not automatically assign staff tasks, publish content or renew every month.</p>
  </form>}
 </section>;
}