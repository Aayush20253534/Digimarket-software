"use client";
import Link from "next/link";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {ArrowRight,CheckCircle2,FolderKanban,Plus,RefreshCw,Pencil,UserRoundPlus,Trash2} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {TeamMultiSelect} from "@/components/team-multi-select";
type Member={userId:string;role:"MANAGER"|"CONTRIBUTOR"|"REVIEWER";user:{displayName:string}};
type Project={id:string;createdById:string;version:number;name:string;description:string|null;status:string;
 startOn:string|null;dueOn:string|null;members:Member[];_count?:{members:number;milestones:number;deliverables:number}};
type Person={id:string;displayName:string};
type Result={items:Project[];nextCursor:string|null};
type Template="NONE"|"SOCIAL_MONTHLY"|"WEBSITE"|"SEO"|"PAID_ADS"|"VIDEO_SHOOTING";
const fresh=()=>({name:"",description:"",startOn:"",dueOn:"",template:"SOCIAL_MONTHLY" as Template,assigneeIds:[] as string[]});
const statuses=["PLANNED","ACTIVE","ON_HOLD","COMPLETED","ARCHIVED"];
const shortDate=(value:string|null)=>value?.slice(0,10)??"";
export function ClientDeliveryWorkspace({clientId,canCreate}:{clientId:string;canCreate:boolean}){
 const {session,request}=useAuth();
 const perms=session?.identity.permissions??[];
 const canRead=perms.includes("projects.read"),canAssign=perms.includes("projects.assign");
 const privileged=!!session?.identity.roles.some(role=>["ADMIN","SUPER_ADMIN","FOUNDER"].includes(role));
 const canEdit=privileged&&perms.includes("projects.update");
 const [projects,setProjects]=useState<Project[]>([]),[staff,setStaff]=useState<Person[]>([]);
 const [form,setForm]=useState(fresh),[expanded,setExpanded]=useState(false);
 const [editing,setEditing]=useState<string|null>(null);
 const [draft,setDraft]=useState({name:"",description:"",status:"PLANNED",startOn:"",dueOn:""});
 const [member,setMember]=useState({userId:"",role:"CONTRIBUTOR" as Member["role"]});
 const [loaded,setLoaded]=useState(false),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[more,setMore]=useState(false);
 const load=useCallback(async()=>{
  if(!canRead)return;
  try{
   const result=await request<Result>("/projects?"+new URLSearchParams({clientId,limit:"100"}));
   setProjects(result.items);setMore(!!result.nextCursor);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Unable to load projects");}
  finally{setLoaded(true);}
 },[clientId,canRead,request]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!privileged||!canAssign)return;
  void request<Person[]>("/projects/assignees").then(setStaff).catch(e=>setError(e instanceof Error?e.message:"Unable to load employees"));
 },[privileged,canAssign,request]);
 async function execute(action:()=>Promise<unknown>,success:string){
  setBusy(true);setError("");setNotice("");
  try{await action();await load();setNotice(success);}
  catch(e){setError(e instanceof Error?e.message:"Unable to save project changes");}
  finally{setBusy(false);}
 }
 async function create(e:FormEvent){
  e.preventDefault();
  await execute(async()=>{
   const created=await request<Project>("/projects",{method:"POST",body:{clientId,...form}});
   if(!created.id)throw Error("Project creation did not return an identifier");
   setForm(fresh());setExpanded(false);
  },"Delivery project created and assigned. Selected staff can view it in Projects.");
 }
 function editProject(item:Project){
  setEditing(item.id);setError("");setNotice("");
  setDraft({name:item.name,description:item.description??"",status:item.status,startOn:shortDate(item.startOn),dueOn:shortDate(item.dueOn)});
  setMember({userId:"",role:"CONTRIBUTOR"});
 }
 async function saveProject(e:FormEvent,item:Project){
  e.preventDefault();
  await execute(async()=>{
   await request("/projects/"+item.id,{method:"PUT",body:{...draft,version:item.version}});
  },"Project details saved.");
 }
 async function addMember(e:FormEvent,item:Project){
  e.preventDefault();if(!member.userId)return;
  await execute(async()=>{
   await request("/projects/"+item.id+"/members",{method:"POST",body:member});
   setMember({userId:"",role:"CONTRIBUTOR"});
  },"Project member assigned or updated.");
 }
 async function removeMember(item:Project,user:Member){
  if(!window.confirm("Remove "+user.user.displayName+" from this project? Their assigned tasks must be reassigned first."))return;
  await execute(()=>request("/projects/"+item.id+"/members/"+user.userId+"/remove",{method:"POST"}),
   "Project member removed.");
 }
 if(!canRead)return <section className="aw-client-panel"><h2>Projects & deliverables</h2><p className="aw-client-muted">You do not have permission to view client projects.</p></section>;
 const active=projects.filter(p=>p.status==="ACTIVE"||p.status==="PLANNED").length;
 const total=projects.reduce((n,p)=>n+(p._count?.deliverables||0),0);
 return <section className="aw-client-panel" aria-label="Projects and deliverables">
  <div className="aw-client-panel-heading">
   <div><p className="aw-client-kicker">DELIVERY PLANNING</p><h2>Projects & deliverables</h2><p>Each project belongs to this client. Templates produce draft milestones and deliverables, while team assignments determine who can work on them.</p></div>
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
    <div className="aw-client-project-details"><span><CheckCircle2 size={14}/>{item._count?.deliverables||0} deliverables</span><span>{item._count?.milestones||0} milestones</span>{item.dueOn&&<span>Due {shortDate(item.dueOn)}</span>}</div>
    <p className="aw-client-project-team"><strong>Assigned team:</strong> {item.members?.map(m=>m.user.displayName).join(", ")||"No team assigned"}</p>
    <div className="aw-client-actions">
     <Link href={"/app/projects?focus="+encodeURIComponent(item.id)} className="aw-client-btn">Manage project <ArrowRight size={14}/></Link>
     {canEdit&&<button type="button" className="aw-client-btn" aria-label={"Edit "+item.name} onClick={()=>editing===item.id?setEditing(null):editProject(item)}><Pencil size={14}/>{editing===item.id?"Close editor":"Edit & assign"}</button>}
     {session?.identity.roles.some(role=>["ADMIN","SUPER_ADMIN","FOUNDER"].includes(role))&&perms.includes("tasks.create")&&
      <Link href={"/app/tasks?projectId="+encodeURIComponent(item.id)} className="aw-client-btn">Assign task</Link>}
    </div>
    {canEdit&&editing===item.id&&<div className="aw-client-project-editor">
     <form className="aw-client-form" onSubmit={e=>void saveProject(e,item)} aria-label={"Edit project "+item.name}>
      <h3>Project details</h3>
      <div className="aw-client-form-grid">
       <label>Project name<input required minLength={2} maxLength={180} className="field" value={draft.name} onChange={e=>setDraft(v=>({...v,name:e.target.value}))}/></label>
       <label>Status<select className="field" value={draft.status} onChange={e=>setDraft(v=>({...v,status:e.target.value}))}>{statuses.map(s=><option key={s} value={s}>{s.replaceAll("_"," ")}</option>)}</select></label>
       <label>Start date<input type="date" className="field" value={draft.startOn} onChange={e=>setDraft(v=>({...v,startOn:e.target.value}))}/></label>
       <label>Due date<input type="date" className="field" min={draft.startOn||undefined} value={draft.dueOn} onChange={e=>setDraft(v=>({...v,dueOn:e.target.value}))}/></label>
       <label className="aw-client-wide">Scope<textarea className="field" rows={3} maxLength={2000} value={draft.description} onChange={e=>setDraft(v=>({...v,description:e.target.value}))}/></label>
      </div>
      <button className="aw-client-primary" disabled={busy} type="submit">Save project changes</button>
     </form>
     {canAssign&&<div className="aw-client-member-editor">
      <h3>Assigned employees</h3>
      <p className="aw-client-muted">Add contributors, change responsibilities, or remove members after their active tasks are reassigned. The project creator stays manager.</p>
      <ul className="aw-client-member-list">{item.members?.map(m=><li key={m.userId}><span>{m.user.displayName} <small>{m.role}</small></span>
       {m.userId!==item.createdById&&<button type="button" className="aw-client-btn" aria-label={"Remove "+m.user.displayName} disabled={busy} onClick={()=>void removeMember(item,m)}><Trash2 size={14}/>Remove</button>}
      </li>)}</ul>
      <form className="aw-client-form aw-client-form-grid" aria-label="Assign project employee" onSubmit={e=>void addMember(e,item)}>
       <label>Employee<select className="field" required value={member.userId} onChange={e=>setMember(v=>({...v,userId:e.target.value}))}><option value="">Choose an employee</option>{staff.map(s=><option key={s.id} value={s.id}>{s.displayName}</option>)}</select></label>
       <label>Responsibility<select className="field" value={member.role} onChange={e=>setMember(v=>({...v,role:e.target.value as Member["role"]}))}><option value="CONTRIBUTOR">Contributor</option><option value="REVIEWER">Reviewer</option><option value="MANAGER">Manager</option></select></label>
       <div className="aw-client-actions"><button className="aw-client-primary" type="submit" disabled={busy||!member.userId}><UserRoundPlus size={15}/>Assign / update employee</button></div>
      </form>
     </div>}
    </div>}
   </article>)}
  </div>
  {loaded&&!projects.length&&<div className="aw-client-empty"><FolderKanban size={23}/><h3>No delivery projects yet</h3><p>Add the agreed services, then start a project using the appropriate template. Work remains empty until a project is created.</p></div>}
  {more&&<p className="aw-client-muted">Showing the first 100 accessible projects. Agency-wide projects are available in the Projects module.</p>}
  {canCreate&&expanded&&<form className="aw-client-form aw-client-subform" onSubmit={create} aria-label="Create client delivery project">
   <h3>Set up delivery project</h3>
   <p className="aw-client-muted">Choose the service template and assign the employees responsible for delivery. The project creator is automatically added as manager.</p>
   <div className="aw-client-form-grid">
    <label>Project name<input className="field" required minLength={2} maxLength={180} placeholder="Video shooting for client" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))}/></label>
    <label>Service template<select className="field" value={form.template} onChange={e=>setForm(v=>({...v,template:e.target.value as Template}))}>
     <option value="SOCIAL_MONTHLY">Social media: reels & posts</option><option value="VIDEO_SHOOTING">Video shooting</option><option value="WEBSITE">Website development</option><option value="SEO">SEO / AEO / GEO</option><option value="PAID_ADS">Paid advertising</option><option value="NONE">Blank project</option>
    </select></label>
    <label>Start date<input className="field" type="date" value={form.startOn} onChange={e=>setForm(v=>({...v,startOn:e.target.value}))}/></label>
    <label>Due date<input className="field" type="date" min={form.startOn||undefined} value={form.dueOn} onChange={e=>setForm(v=>({...v,dueOn:e.target.value}))}/></label>
    {canAssign&&<div className="aw-client-wide"><TeamMultiSelect label="Assign project employees" options={staff} value={form.assigneeIds} onChange={ids=>setForm(v=>({...v,assigneeIds:ids}))}/></div>}
    <label className="aw-client-wide">Scope<textarea className="field" maxLength={2000} rows={3} value={form.description} onChange={e=>setForm(v=>({...v,description:e.target.value}))}/></label>
   </div>
   <div className="aw-client-actions"><button type="submit" className="aw-client-primary" disabled={busy}>{busy?"Creating…":"Create project and checklist"}</button><button type="button" className="aw-client-btn" onClick={()=>setExpanded(false)}>Cancel</button></div>
   <p className="aw-client-muted">Templates add draft deliverables. They do not automatically assign individual staff tasks or publish content.</p>
  </form>}
 </section>;
}
