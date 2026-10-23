"use client";
import { FormEvent,useCallback,useEffect,useMemo,useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { TeamMultiSelect } from "@/components/team-multi-select";
import { Trash2 } from "lucide-react";
import { Card,PageHeader,Notice,Spinner,StatusBadge,EmptyState } from "@/components/ui";

type Status="TODO"|"IN_PROGRESS"|"BLOCKED"|"IN_REVIEW"|"DONE"|"CANCELLED";
type Priority="LOW"|"MEDIUM"|"HIGH"|"URGENT";
type User={id:string;displayName:string};
type Member={userId:string;user:{displayName:string}};
type Comment={id:string;body:string;author:{displayName:string};createdAt:string};
type Task={id:string;title:string;description:string|null;status:Status;priority:Priority;
 dueAt:string|null;createdAt:string;projectId:string|null;version:number;recurrenceId:string|null;
 assignees:Member[];project?:{id?:string;name:string}|null;comments?:Comment[]};
type Recurrence={id:string;title:string;frequency:"DAILY"|"WEEKLY"|"MONTHLY";interval:number;
 nextRunAt:string;enabled:boolean;version:number;timezone:string;assigneeIds:string[]};
type Project={id:string;name:string};
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
const priorities:Priority[]=["LOW","MEDIUM","HIGH","URGENT"];
const err=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Request failed";
const initial={title:"",description:"",priority:"MEDIUM" as Priority,projectId:"",dueAt:"",assigneeIds:[] as string[]};
const initialSchedule={title:"",description:"",priority:"MEDIUM" as Priority,projectId:"",
 assigneeIds:[] as string[],frequency:"DAILY" as "DAILY"|"WEEKLY"|"MONTHLY",interval:1,
 startAt:"",dueOffsetDays:0};

export default function TasksPage(){
 const {session,request}=useAuth();
 const grants=session?.identity.permissions??[];
 const isAdmin=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN");
 const canRead=grants.includes("tasks.read"),canCreate=isAdmin&&grants.includes("tasks.create");
 const canManage=isAdmin&&grants.includes("tasks.manage"),canRepeat=isAdmin&&grants.includes("tasks.recurrence.manage");
 const canWrite=grants.includes("tasks.update.own")||canManage;
 const [view,setView]=useState<"mine"|"team">("mine");
 const [tasks,setTasks]=useState<Task[]>([]);
 const [selected,setSelected]=useState<Task|null>(null);
 const [staff,setStaff]=useState<User[]>([]);
 const [projects,setProjects]=useState<Project[]>([]);
 const [recurrences,setRecurrences]=useState<Recurrence[]>([]);
 const [create,setCreate]=useState(initial);
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
   const params=new URLSearchParams({view:canManage?view:"mine",limit:"40"});
   if(search.trim())params.set("q",search.trim());
   if(statusFilter)params.set("status",statusFilter);
   if(cursor)params.set("cursor",cursor);
   const data=await request<Result<Task>>("/tasks?"+params);
   setTasks(data.items);setNextCursor(data.nextCursor);setError("");
  }catch(e){setError(err(e));}finally{setLoading(false);}
 },[canRead,canManage,view,request,search,statusFilter,cursor]);
 const open=useCallback(async(id:string)=>{
  try{setSelected(await request<Task>("/tasks/"+id));}catch(e){setError(err(e));}
 },[request]);
 const loadRecurrences=useCallback(async()=>{
  if(!canRepeat)return;
  try{setRecurrences(await request<Recurrence[]>("/task-recurrences"));}
  catch(e){setError(err(e));}
 },[canRepeat,request]);
 useEffect(()=>{void load();},[load]);
  useEffect(()=>{const params=new URLSearchParams(window.location.search);const id=params.get("focus")??params.get("task");if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);},[open]);
 useEffect(()=>{
  if(canCreate)void request<User[]>("/tasks/team").then(setStaff).catch(()=>{});
  if(grants.includes("projects.read"))void request<Result<Project>>("/projects?limit=100").then(r=>setProjects(r.items)).catch(()=>{});
  if(canRepeat)void loadRecurrences();
 },[canCreate,canRepeat,request,loadRecurrences,session?.identity.userId]);
 async function run(action:()=>Promise<unknown>,done:string,reopen=true){
  setBusy(true);setError("");setMessage("");
  try{
   await action();if(reopen&&selected)await open(selected.id);
   await Promise.all([load(),loadRecurrences()]);
   setMessage(done);
  }catch(e){setError(err(e));}finally{setBusy(false);}
 }
 async function deleteTask(){
  if(!canManage||!selected||busy)return;
  const task=selected;
  if(!window.confirm("Permanently delete task \""+task.title+"\" for everyone? This removes its assignments, comments and notifications. This cannot be undone."))return;
  setBusy(true);setError("");setMessage("");
  try{
   await request("/tasks/"+task.id,{method:"DELETE",body:{version:task.version}});
   setSelected(null);setComment("");
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
    ...create,projectId:create.projectId||null,dueAt:new Date(create.dueAt).toISOString()}});
   setCreate(initial);await open(task.id);
  },"Task created.",false);
 }
 async function submitRecurring(e:FormEvent){
  e.preventDefault();
  if(!schedule.assigneeIds.length){setError("Select at least one employee.");return;}
  if(!schedule.startAt)return;
  await run(async()=>{
   await request("/task-recurrences",{method:"POST",body:{
    ...schedule,projectId:schedule.projectId||null,
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
   {loading?<Spinner label="Loading tasks…"/>:tasks.length? <div className="space-y-2">
     {tasks.map(task=><button type="button" key={task.id} onClick={()=>void open(task.id)}
       className="flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-indigo-400">
       <div><p className="text-sm font-semibold">{task.title}</p>
         <p className="mt-1 text-xs text-slate-500">{task.project?.name||"General"} · {task.priority}
           {task.dueAt?" · Due "+new Date(task.dueAt).toLocaleString():""}</p></div>
       <span className={"aw-task-state"+(expired(task)?" aw-task-expired":"")}>{displayStatus(task)}</span>
     </button>)}
   </div>:<EmptyState title="No tasks found" description="Tasks assigned to you will appear here."/>}
   <div className="mt-4 flex justify-between">
    <button type="button" className="btn-secondary" disabled={!cursor||busy} onClick={()=>setCursor(null)}>First page</button>
    <button type="button" className="btn-secondary" disabled={!nextCursor||busy} onClick={()=>setCursor(nextCursor)}>Next page</button>
   </div>
  </Card>
  {canCreate&&<Card title="Create a task" description="Select one or more active employees. Project-linked tasks require project members.">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submitTask}>
     <label className="text-sm">Task title<input className="field mt-1 w-full" required minLength={2} maxLength={180}
       value={create.title} onChange={e=>setCreate(p=>({...p,title:e.target.value}))}/></label>
     <label className="text-sm">Priority<select className="field mt-1 w-full" value={create.priority}
       onChange={e=>setCreate(p=>({...p,priority:e.target.value as Priority}))}>
       {priorities.map(p=><option key={p}>{p}</option>)}</select></label>
     <label className="text-sm">Project<select className="field mt-1 w-full" value={create.projectId}
       onChange={e=>setCreate(p=>({...p,projectId:e.target.value}))}>
       <option value="">General task</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
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
       Admin: change task status
       <select aria-label="Admin task status" className="field" value={selected.status} disabled={busy}
        onChange={e=>{const status=e.target.value as Status;if(status===selected.status)return;
         void run(()=>request("/tasks/"+selected.id,{method:"PUT",
          body:{version:selected.version,status}}),
          status==="IN_PROGRESS"&&selected.status==="DONE"?"Task reopened in In Process.":"Task status updated.");}}>
        {editableStatuses.map(v=><option key={v.value} value={v.value}>{v.label}</option>)}
       </select>
       <span className="text-xs font-normal text-slate-500">Admins may reopen completed work or move tasks between any statuses.</span>
      </label>:selected.status==="TODO"||selected.status==="IN_PROGRESS"?
       <button type="button" className="btn-primary" disabled={busy} onClick={()=>void run(()=>request("/tasks/"+selected.id,{method:"PUT",body:{
        version:selected.version,status:selected.status==="TODO"?"IN_PROGRESS":"DONE"
       }}),selected.status==="TODO"?"Task moved to In Process.":"Task completed.")}>
        {selected.status==="TODO"?"✓ Move to In Process":"✓ Mark Completed"}
       </button>:<StatusBadge status={selected.status}/> )}
    </div>
    {canManage&&<div className="flex justify-end border-t border-slate-200/20 pt-3">
      <button type="button" className="btn-secondary inline-flex items-center gap-2 border-red-500/50 text-red-300"
        aria-label="Permanently delete task" disabled={busy} onClick={()=>void deleteTask()}>
        <Trash2 aria-hidden="true" className="h-4 w-4"/>Delete task permanently
      </button>
    </div>}
    {selected.dueAt&&<p className="text-sm">Expiry: <strong>{new Date(selected.dueAt).toLocaleString()}</strong> · <span className={expired(selected)?"text-red-400":""}>{displayStatus(selected)}</span></p>}
    {canManage&&<form className="flex flex-wrap items-end gap-3" onSubmit={e=>{
      e.preventDefault();
      const input=e.currentTarget.elements.namedItem("deadline") as HTMLInputElement|null;
      if(!input?.value)return;
      void run(()=>request("/tasks/"+selected.id,{method:"PUT",body:{version:selected.version,dueAt:new Date(input.value).toISOString()}}),"Task expiry updated.");
    }}><label className="text-sm">Update expiry date and time<input name="deadline" type="datetime-local" required className="field mt-1 w-full"
      defaultValue={selected.dueAt?new Date(new Date(selected.dueAt).getTime()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16):""}/></label>
      <button className="btn-secondary" type="submit" disabled={busy}>Save expiry</button></form>}
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
  {canRepeat&&<Card title="Recurring schedules" description="BullMQ generates task occurrences at the scheduled time. Scheduled work remains idempotent across retries.">
    <ul className="mb-5 space-y-2">{recurrences.map(x=><li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 text-sm">
     <div><b>{x.title}</b><p className="text-xs text-slate-500">{x.frequency} every {x.interval} · Next {new Date(x.nextRunAt).toLocaleString()} ({x.timezone})</p></div>
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
       onChange={e=>setSchedule(p=>({...p,projectId:e.target.value}))}>
       <option value="">General work</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
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
