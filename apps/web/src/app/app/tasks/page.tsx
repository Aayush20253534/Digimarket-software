"use client";
import { FormEvent,useCallback,useEffect,useMemo,useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { TeamMultiSelect } from "@/components/team-multi-select";
import { Pencil, Trash2 } from "lucide-react";
import { Card,PageHeader,Notice,Spinner,StatusBadge,EmptyState } from "@/components/ui";

type Status="TODO"|"IN_PROGRESS"|"BLOCKED"|"IN_REVIEW"|"DONE"|"CANCELLED";
type Priority="LOW"|"MEDIUM"|"HIGH"|"URGENT";
type User={id:string;displayName:string};
type Member={userId:string;user:{displayName:string}};
type Comment={id:string;body:string;author:{displayName:string};createdAt:string};
type Task={id:string;title:string;description:string|null;status:Status;priority:Priority;
 dueAt:string|null;createdAt:string;projectId:string|null;serviceId:string|null;version:number;recurrenceId:string|null;
 assignees:Member[];project?:{id?:string;name:string}|null;service?:{id?:string;name:string;clientId?:string;client:{businessName:string}}|null;comments?:Comment[]};
type Recurrence={id:string;title:string;frequency:"DAILY"|"WEEKLY"|"MONTHLY";interval:number;
 nextRunAt:string;enabled:boolean;version:number;timezone:string;assigneeIds:string[];service?:{name:string;client:{businessName:string}}|null};
type Project={id:string;name:string;clientId:string};
type Result<T>={items:T[];nextCursor:string|null};
const visibleStatuses=[{value:"TODO",label:"Pending"},{value:"IN_PROGRESS",label:"In Process"},{value:"DONE",label:"Completed"},{value:"EXPIRED",label:"Expired"}] as const;
const editableStatuses:{value:Status;label:string}[]=[
 {value:"TODO",label:"Pending"},
 {value:"IN_PROGRESS",label:"In Process"},
 {value:"BLOCKED",label:"Blocked"},
 {value:"IN_REVIEW",label:"In Review"},
 {value:"DONE",label:"Completed"},
 {value:"CANCELLED",label:"Cancelled"},
];
const expired=(task:Task)=>task.status!=="DONE"&&task.status!=="CANCELLED"&&Boolean(task.dueAt)&&new Date(task.dueAt!).getTime()<Date.now();
const displayStatus=(task:Task)=>expired(task)?"Expired":task.status==="TODO"?"Pending":task.status==="IN_PROGRESS"?"In Process":task.status==="DONE"?"Completed":task.status;
// Only non-admin task cards use the role-specific status palette.
const taskCardTone=(task:Task)=>expired(task)?"expired":task.status==="DONE"?"completed":task.status==="TODO"?"pending":task.status==="IN_PROGRESS"?"in-process":"";
const priorities:Priority[]=["LOW","MEDIUM","HIGH","URGENT"];
const err=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Request failed";
const initial={title:"",description:"",priority:"MEDIUM" as Priority,projectId:"",clientId:"",serviceId:"",dueAt:"",assigneeIds:[] as string[]};
type EditDraft=typeof initial;
const localDeadline=(value:string|null)=>{
 if(!value)return "";
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return "";
 return new Date(date.getTime()-date.getTimezoneOffset()*60_000).toISOString().slice(0,16);
};
const initialSchedule={title:"",description:"",priority:"MEDIUM" as Priority,projectId:"",clientId:"",serviceId:"",
 assigneeIds:[] as string[],frequency:"DAILY" as "DAILY"|"WEEKLY"|"MONTHLY",interval:1,
 startAt:"",dueOffsetDays:0};

export default function TasksPage(){
 const {session,request}=useAuth();
 const grants=session?.identity.permissions??[];
 const isAdmin=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN");
 const isManager=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN"||r==="FOUNDER");
 const canRead=grants.includes("tasks.read"),canCreate=isManager&&grants.includes("tasks.create");
 const canManage=isManager&&grants.includes("tasks.manage"),canRepeat=isManager&&grants.includes("tasks.recurrence.manage");
 const canWrite=grants.includes("tasks.update.own")||canManage;
 const [view,setView]=useState<"mine"|"team">("mine");
 const [tasks,setTasks]=useState<Task[]>([]);
 const [selected,setSelected]=useState<Task|null>(null);
 const [staff,setStaff]=useState<User[]>([]);
 const [projects,setProjects]=useState<Project[]>([]);
 const [recurrences,setRecurrences]=useState<Recurrence[]>([]);
 const [create,setCreate]=useState(initial);
 const [editing,setEditing]=useState(false);
 const [editDraft,setEditDraft]=useState<EditDraft>(initial);
 const [schedule,setSchedule]=useState(initialSchedule);
 const [search,setSearch]=useState("");
 const [statusFilter,setStatusFilter]=useState("");
 const [cursor,setCursor]=useState<string|null>(null);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [comment,setComment]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const browserTimezone=useMemo(()=>Intl.DateTimeFormat().resolvedOptions().timeZone||"Asia/Kolkata",[]);
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);
  try{
   const params=new URLSearchParams({view:canManage?view:"mine",limit:isAdmin?"5":"40"});
   if(search.trim())params.set("q",search.trim());
   if(statusFilter)params.set("status",statusFilter);
   if(cursor)params.set("cursor",cursor);
  
   const data=await request<Result<Task>>("/tasks?"+params);
   setTasks(data.items);setNextCursor(data.nextCursor);setError("");
  }catch(e){setError(err(e));}finally{setLoading(false);}
 },[canRead,canManage,isAdmin,view,request,search,statusFilter,cursor]);
 const open=useCallback(async(id:string)=>{
  try{
   const detail=await request<Task>("/tasks/"+id);
   setSelected(detail);setEditing(false);
  }catch(e){setError(err(e));}
 },[request]);
 const loadRecurrences=useCallback(async()=>{
  if(!canRepeat)return;
  try{setRecurrences(await request<Recurrence[]>("/task-recurrences"));}
  catch(e){setError(err(e));}
 },[canRepeat,request]);
 useEffect(()=>{void load();},[load]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const id=params.get("focus")??params.get("task");if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);},[open]);
 useEffect(()=>{
  if(!canCreate)return;
  const projectId=new URLSearchParams(window.location.search).get("projectId");
  if(projectId&&projects.some(project=>project.id===projectId)){
    const project=projects.find(x=>x.id===projectId)!;
    setCreate(previous=>previous.projectId===projectId?previous:{...previous,projectId,clientId:project.clientId,serviceId:""});
  }
 },[canCreate,projects]);
 useEffect(()=>{
  if(!canCreate)return;
  const q=new URLSearchParams(window.location.search);
  const clientId=q.get("clientId"),serviceId=q.get("serviceId");
  if(clientId&&/^[0-9a-f-]{36}$/i.test(clientId)){
   setCreate(v=>v.clientId===clientId&&v.serviceId===(serviceId??"")?v:{...v,clientId,serviceId:serviceId&&/^[0-9a-f-]{36}$/i.test(serviceId)?serviceId:""});
   setSchedule(v=>v.clientId===clientId&&v.serviceId===(serviceId??"")?v:{...v,clientId,serviceId:serviceId&&/^[0-9a-f-]{36}$/i.test(serviceId)?serviceId:""});
  }
 },[canCreate]);
 useEffect(()=>{
  if(canCreate||canManage)void request<User[]>("/tasks/team").then(setStaff).catch(()=>{});
  if(grants.includes("projects.read"))void request<Result<Project>>("/projects?limit=100").then(r=>setProjects(r.items)).catch(()=>{});
  if(canRepeat)void loadRecurrences();
 },[canCreate,canManage,canRepeat,request,loadRecurrences,session?.identity.userId]);
 async function run(action:()=>Promise<unknown>,done:string,reopen=true){
  setBusy(true);setError("");setMessage("");
  try{
   await action();if(reopen&&selected)await open(selected.id);
   await Promise.all([load(),loadRecurrences()]);
   setMessage(done);
  }catch(e){setError(err(e));}finally{setBusy(false);}
 }
 function beginEdit(task:Task){
  if(!canManage||busy)return;
  setError("");setMessage("");
  setEditDraft({
   title:task.title,description:task.description??"",priority:task.priority,
   projectId:task.projectId??"",clientId:task.service?.clientId??"",serviceId:task.serviceId??"",dueAt:localDeadline(task.dueAt),
   assigneeIds:task.assignees.map(a=>a.userId),
  });
  setEditing(true);
 }
 async function saveEdit(e:FormEvent){
  e.preventDefault();
  if(!canManage||!selected||busy)return;
  if(!editDraft.assigneeIds.length){setError("Select at least one employee.");return;}
  const due=new Date(editDraft.dueAt);
  if(!editDraft.dueAt||!Number.isFinite(due.getTime())){
   setError("A valid task expiry date and time is required.");return;
  }
  const task=selected;
  await run(()=>request("/tasks/"+task.id+"/edit",{method:"PUT",body:{
   version:task.version,title:editDraft.title.trim(),description:editDraft.description.trim(),
   priority:editDraft.priority,dueAt:due.toISOString(),
   projectId:editDraft.projectId||null,serviceId:editDraft.serviceId||null,assigneeIds:editDraft.assigneeIds,
  }}),"Task edited successfully. Assigned team members have been updated.");
 }
 async function deleteTask(){
  if(!canManage||!selected||busy)return;
  const task=selected;
  if(!window.confirm("Permanently delete task \""+task.title+"\" for everyone? This removes its assignments, comments and notifications. This cannot be undone."))return;
  setBusy(true);setError("");setMessage("");
  try{
   await request("/tasks/"+task.id,{method:"DELETE",body:{version:task.version}});
   setSelected(null);setComment("");setEditing(false);
   setTasks(current=>current.filter(item=>item.id!==task.id));
   setCursor(null);
   const url=new URL(window.location.href);
   if(url.searchParams.get("task")===task.id||url.searchParams.get("focus")===task.id){
    url.searchParams.delete("task");url.searchParams.delete("focus");
    window.history.replaceState(null,"",url.pathname+url.search+url.hash);
   }
   setMessage("Task permanently deleted from all workspaces.");
   await load();
  }catch(e){setError(err(e));}finally{setBusy(false);}
 }
 async function submitTask(e:FormEvent){
  e.preventDefault();
  if(!create.assigneeIds.length){setError("Select at least one employee.");return;}
  if(!create.dueAt||!Number.isFinite(new Date(create.dueAt).getTime())||new Date(create.dueAt).getTime()<=Date.now()){
   setError("Choose a future task expiry date and time.");return;
  }
  await run(async()=>{
   const task=await request<Task>("/tasks",{method:"POST",body:{
    ...create,clientId:undefined,projectId:create.projectId||null,serviceId:create.serviceId||null,dueAt:new Date(create.dueAt).toISOString()}});
   setCreate(initial);await open(task.id);
  },"Task created.",false);
 }
 async function submitRecurring(e:FormEvent){
  e.preventDefault();
  if(!schedule.assigneeIds.length){setError("Select at least one employee.");return;}
  if(!schedule.startAt)return;
  await run(async()=>{
   await request("/task-recurrences",{method:"POST",body:{
    ...schedule,clientId:undefined,projectId:schedule.projectId||null,serviceId:schedule.serviceId||null,
    timezone:browserTimezone,startAt:new Date(schedule.startAt).toISOString()}});
   setSchedule(initialSchedule);
  },"Recurring schedule created.",false);
 }
 if(!session)return <Spinner label="Checking task permissions…"/>;
 if(!canRead)return <><PageHeader title="Task access denied"/><Notice kind="error">Task read permission required.</Notice></>;
 return <div data-aw-module="tasks" className="aw-module-root space-y-6">
  <PageHeader eyebrow="Delivery operations" title="Tasks & recurring work"
   description="Assign team work, track progress through comments and schedule automatic occurrences."/>
  {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Task management</span><span className="aw-module-count">{tasks.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{view==="mine"?"My tasks":"Team tasks"}</span></div>}
  {error&&<Notice kind="error">{error}</Notice>}
  {message&&<Notice kind="success">{message}</Notice>}
  <Card title="Task register" description="Your tasks are private to participants. Team-wide access requires management permissions.">
   <div className="mb-4 flex flex-wrap gap-2">
    {canManage&&<select className="field" aria-label="Task view" value={view} onChange={e=>{setView(e.target.value as "mine"|"team");setCursor(null);}}>
      <option value="mine">My tasks</option><option value="team">Team tasks</option></select>}
    <input className="field min-w-[175px] flex-1" aria-label="Search tasks" placeholder="Search title" value={search}
      onChange={e=>{setSearch(e.target.value);setCursor(null);}}/>
    <select className="field" aria-label="Task status filter" value={statusFilter}
      onChange={e=>{setStatusFilter(e.target.value);setCursor(null);}}>
     <option value="">All statuses</option>{visibleStatuses.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
    </select>
   </div>
   {loading?<Spinner label="Loading tasks…"/>:tasks.length? <div className="space-y-2" data-testid="task-register-list">
     {tasks.map(task=><button type="button" key={task.id} onClick={()=>void open(task.id)}
       className={"flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400"+(!isAdmin&&taskCardTone(task)?" aw-assignee-task-card aw-assignee-task-"+taskCardTone(task):"")}>
       <div><p className="text-sm font-semibold">{task.title}</p>
         <p className="mt-1 text-xs text-slate-500">{task.service?task.service.client.businessName+" / "+task.service.name:task.project?.name||"General"} · {task.priority}
           {task.dueAt?" · Due "+new Date(task.dueAt).toLocaleString():""}</p></div>
       <span className={"aw-task-state"+(expired(task)?" aw-task-expired":"")}>{displayStatus(task)}</span>
     </button>)}
   </div>:<EmptyState title="No tasks found" description="Tasks assigned to you will appear here."/>}
   <div className="mt-4 flex justify-between">
    <button type="button" className="btn-secondary" disabled={!cursor||busy} onClick={()=>setCursor(null)}>First page</button>
    <button type="button" className="btn-secondary" disabled={!nextCursor||busy} onClick={()=>setCursor(nextCursor)}>Next page</button>
   </div>
  </Card>
  {canCreate&&<Card title="Create a task" description="For independent internal work. Client service deliveries are scheduled separately.">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submitTask}>
     <label className="text-sm">Task title<input className="field mt-1 w-full" required minLength={2} maxLength={180}
       value={create.title} onChange={e=>setCreate(p=>({...p,title:e.target.value}))}/></label>
     <label className="text-sm">Priority<select className="field mt-1 w-full" value={create.priority}
       onChange={e=>setCreate(p=>({...p,priority:e.target.value as Priority}))}>
       {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
  
     <label className="text-sm">Project<select className="field mt-1 w-full" value={create.projectId}
       onChange={e=>{const project=projects.find(p=>p.id===e.target.value);setCreate(p=>({...p,projectId:e.target.value,clientId:project?.clientId??p.clientId,serviceId:project&&project.clientId!==p.clientId?"":p.serviceId}));}}>
       <option value="">General task</option>{projects.filter(p=>!create.clientId||p.clientId===create.clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label className="text-sm">Expiry date and time <span className="text-red-400">*</span><input type="datetime-local" required className="field mt-1 w-full" aria-label="Task expiry date and time"
       value={create.dueAt} onChange={e=>setCreate(p=>({...p,dueAt:e.target.value}))}/></label>
     <div className="md:col-span-2"><TeamMultiSelect label="Assign employees" options={staff} value={create.assigneeIds}
       onChange={ids=>setCreate(p=>({...p,assigneeIds:ids}))}/></div>
     <label className="text-sm md:col-span-2">Description
      <textarea className="field mt-1 w-full" maxLength={2000} rows={2} value={create.description}
       onChange={e=>setCreate(p=>({...p,description:e.target.value}))}/></label>
     <button className="btn-primary w-fit" disabled={busy}>Create task</button>
    </form>
   </Card>}
  {selected&&<Card title={selected.title} description={selected.description||"Task details and activity"}>
   <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
     <span className="text-sm text-slate-500">Assigned: {selected.assignees.map(a=>a.user.displayName).join(", ")}</span>
     {canWrite&&(canManage?<label className="flex flex-col gap-1 text-sm font-semibold">
       Manager: change task status
       <select aria-label="Admin task status" className="field" value={selected.status} disabled={busy}
        onChange={e=>{const status=e.target.value as Status;if(status===selected.status)return;
         void run(()=>request("/tasks/"+selected.id,{method:"PUT",
          body:{version:selected.version,status}}),
          status==="IN_PROGRESS"&&selected.status==="DONE"?"Task reopened in In Process.":"Task status updated.");}}>
        {editableStatuses.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
       </select>
       <span className="text-xs font-normal text-slate-500">Admins and Founders may reopen completed work or change task status.</span>
      </label>:selected.status==="TODO"||selected.status==="IN_PROGRESS"?
       <button type="button" className="btn-primary" disabled={busy} onClick={()=>void run(()=>request("/tasks/"+selected.id,{method:"PUT",body:{
        version:selected.version,status:selected.status==="TODO"?"IN_PROGRESS":"DONE"
       }}),selected.status==="TODO"?"Task moved to In Process.":"Task completed.")}>
        {selected.status==="TODO"?"✓ Move to In Process":"✓ Mark Completed"}
       </button>:<StatusBadge status={selected.status}/> )}
    </div>
    {canManage&&<div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/20 pt-3">
      <button type="button" className="btn-primary inline-flex items-center gap-2"
        aria-label="Edit task" disabled={busy||editing} onClick={()=>beginEdit(selected)}>
        <Pencil aria-hidden="true" className="h-4 w-4"/>Edit task
      </button>
      <button type="button" className="btn-secondary inline-flex items-center gap-2 border-red-500/50 text-red-300"
        aria-label="Permanently delete task" disabled={busy} onClick={()=>void deleteTask()}>
        <Trash2 aria-hidden="true" className="h-4 w-4"/>Delete task permanently
      </button>
    </div>}
    {canManage&&editing&&<form className="grid gap-3 rounded-xl border border-violet-500/30 bg-violet-950/10 p-4 md:grid-cols-2"
      aria-label="Edit task details" onSubmit={e=>void saveEdit(e)}>
      <h3 className="text-base font-bold md:col-span-2">Edit task details</h3>
      <label className="text-sm font-semibold">Task title
        <input aria-label="Edit task title" className="field mt-1 w-full" required minLength={2} maxLength={180}
          value={editDraft.title} onChange={e=>setEditDraft(x=>({...x,title:e.target.value}))}/>
      </label>
      <label className="text-sm font-semibold">Priority
        <select aria-label="Edit task priority" className="field mt-1 w-full" value={editDraft.priority}
          onChange={e=>setEditDraft(x=>({...x,priority:e.target.value as Priority}))}>
          {priorities.map(p=><option key={p} value={p}>{p}</option>)}
        </select>
      </label>

      <label className="text-sm font-semibold">Project
        <select aria-label="Edit task project" className="field mt-1 w-full" value={editDraft.projectId}
          onChange={e=>{const p=projects.find(p=>p.id===e.target.value);setEditDraft(x=>({...x,projectId:e.target.value,clientId:p?.clientId??x.clientId,serviceId:p&&p.clientId!==x.clientId?"":x.serviceId}));}}>
          <option value="">General task</option>
          {editDraft.projectId&&!projects.some(p=>p.id===editDraft.projectId)&&
            <option value={editDraft.projectId}>{selected.project?.name||"Current project"}</option>}
          {projects.filter(p=>!editDraft.clientId||p.clientId===editDraft.clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-semibold">Expiry date and time
        <input aria-label="Edit task expiry date and time" className="field mt-1 w-full" type="datetime-local"
          required value={editDraft.dueAt}
          onChange={e=>setEditDraft(x=>({...x,dueAt:e.target.value}))}/>
      </label>
      <label className="text-sm font-semibold md:col-span-2">Description
        <textarea aria-label="Edit task description" className="field mt-1 w-full" rows={3} maxLength={2000}
          value={editDraft.description}
          onChange={e=>setEditDraft(x=>({...x,description:e.target.value}))}/>
      </label>
      <div className="md:col-span-2">
        <TeamMultiSelect label="Edit task assignees"
          options={[...staff,...selected.assignees.filter(a=>!staff.some(u=>u.id===a.userId))
            .map(a=>({id:a.userId,displayName:a.user.displayName}))]}
          value={editDraft.assigneeIds}
          onChange={ids=>setEditDraft(x=>({...x,assigneeIds:ids}))}/>
      </div>
      <p className="text-xs text-slate-500 md:col-span-2">Changes are saved together. Newly assigned staff receive a task notification. Existing comments and task status are preserved.</p>
      <div className="flex flex-wrap items-center gap-2 md:col-span-2">
        <button className="btn-primary" type="submit" disabled={busy||!editDraft.assigneeIds.length}>Save task changes</button>
        <button className="btn-secondary" type="button" disabled={busy} onClick={()=>setEditing(false)}>Cancel editing</button>
      </div>
    </form>}
    {selected.dueAt&&<p className="text-sm">Expiry: <strong>{new Date(selected.dueAt).toLocaleString()}</strong> · <span className={expired(selected)?"text-red-400":""}>{displayStatus(selected)}</span></p>}
    <section><h3 className="text-sm font-bold">Task comments and progress updates</h3>
     <p className="mt-1 text-xs text-slate-500">Add updates while a task is In Process. Comments stay with the task when an admin reopens it.</p>
     <ul className="my-3 space-y-3">{selected.comments?.map(c=><li key={c.id} className="rounded-lg bg-slate-50 p-3 text-sm">
       <b>{c.author.displayName}</b><span className="ml-2 text-xs text-slate-500">{new Date(c.createdAt).toLocaleString()}</span>
       <p className="mt-1 whitespace-pre-wrap">{c.body}</p></li>)}</ul>
     {grants.includes("tasks.comment")&&<form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void run(async()=>{
       await request("/tasks/"+selected.id+"/comments",{method:"POST",body:{body:comment}});setComment("");
     },"Comment added.");}}>
      <textarea className="field min-w-[210px] flex-1" required aria-label="New comment" maxLength={2000}
       rows={2} value={comment} onChange={e=>setComment(e.target.value)}
       placeholder="Share progress, blockers, or next steps"/>
      <button className="btn-secondary" type="submit" disabled={busy||!comment.trim()}>Post comment</button>
     </form>}
    </section>
   </div>
  </Card>}
  {canRepeat&&<Card title="Recurring service allocations" description="The database-backed scheduler creates recurring task occurrences. Schedules can be paused or resumed by Admins and Founders.">
    <ul className="mb-5 space-y-2">{recurrences.map(x=><li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
     <div><b>{x.title}</b>{x.service&&<p className="text-xs text-purple-300">{x.service.client.businessName} / {x.service.name}</p>}<p className="text-xs text-slate-500">{x.frequency} every {x.interval} · Next {new Date(x.nextRunAt).toLocaleString()} ({x.timezone})</p></div>
     <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void run(()=>
       request("/task-recurrences/"+x.id,{method:"PUT",body:{version:x.version,enabled:!x.enabled}}),
       x.enabled?"Schedule paused.":"Schedule resumed.",false)}>{x.enabled?"Pause":"Resume"}</button>
    </li>)}</ul>
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submitRecurring}>
     <label className="text-sm">Recurring task title<input className="field mt-1 w-full" required minLength={2}
       value={schedule.title} onChange={e=>setSchedule(p=>({...p,title:e.target.value}))}/></label>
     <label className="text-sm">Frequency<select className="field mt-1 w-full" value={schedule.frequency}
       onChange={e=>setSchedule(p=>({...p,frequency:e.target.value as typeof schedule.frequency}))}>
       <option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option>
       </select></label>
     <label className="text-sm">Repeat every (interval)<input type="number" min={1} max={12} className="field mt-1 w-full"
       value={schedule.interval} onChange={e=>setSchedule(p=>({...p,interval:Number(e.target.value)}))}/></label>
     <label className="text-sm">First occurrence (your local time)<input className="field mt-1 w-full" type="datetime-local"
       required value={schedule.startAt} onChange={e=>setSchedule(p=>({...p,startAt:e.target.value}))}/></label>

     <label className="text-sm">Project<select className="field mt-1 w-full" value={schedule.projectId}
       onChange={e=>{const project=projects.find(p=>p.id===e.target.value);setSchedule(p=>({...p,projectId:e.target.value,clientId:project?.clientId??p.clientId,serviceId:project&&project.clientId!==p.clientId?"":p.serviceId}));}}>
       <option value="">General work</option>{projects.filter(p=>!schedule.clientId||p.clientId===schedule.clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
     <label className="text-sm">Days until due<input className="field mt-1 w-full" type="number" min={0} max={30}
       value={schedule.dueOffsetDays} onChange={e=>setSchedule(p=>({...p,dueOffsetDays:Number(e.target.value)}))}/></label>
     <div className="md:col-span-2"><TeamMultiSelect label="Assign recurring employees" options={staff} value={schedule.assigneeIds}
       onChange={ids=>setSchedule(p=>({...p,assigneeIds:ids}))}/></div>
     <label className="text-sm md:col-span-2">Description<textarea className="field mt-1 w-full" maxLength={2000}
       value={schedule.description} onChange={e=>setSchedule(p=>({...p,description:e.target.value}))}/></label>
     <p className="text-xs text-slate-500 md:col-span-2">Timezone: {browserTimezone}. Schedules automatically pause if their staff or project becomes unavailable.</p>
     <button className="btn-primary w-fit" disabled={busy}>Create recurring schedule</button>
    </form>
   </Card>}
 </div>;
}
