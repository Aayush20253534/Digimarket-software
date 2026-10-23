"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CalendarClock, CheckCircle2, ClipboardList, MessageSquarePlus, NotebookPen, RefreshCw, BriefcaseBusiness, Users, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AWNotice, AWStatusBadge } from "@/components/aw-ui";
type Task={id:string;version:number;title:string;description:string|null;status:string;dueAt:string|null;completedAt:string|null;project:{name:string}|null;assignees:{userId:string}[]};
type Page={items:Task[];nextCursor:string|null};
const done=new Set(["DONE","CANCELLED"]);
const due=(a:Task,b:Task)=>(a.dueAt?Date.parse(a.dueAt):Infinity)-(b.dueAt?Date.parse(b.dueAt):Infinity);
export function AWPersonalTasks(){
 const {session,request}=useAuth();
 const id=session?.identity.userId,allowed=!!session?.identity.permissions.includes("tasks.read");
 const [items,setItems]=useState<Task[]>([]),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 const [partial,setPartial]=useState(false),[error,setError]=useState(""),[clock,setClock]=useState(()=>Date.now());
 const [commentTaskId,setCommentTaskId]=useState<string|null>(null);
 const [commentDraft,setCommentDraft]=useState("");
 const [feedback,setFeedback]=useState("");
 const canComment=!!session?.identity.permissions.includes("tasks.comment");
 const load=useCallback(async()=>{
  if(!id||!allowed){setLoaded(true);return;}
  setBusy(true);setError("");
  try{
   const all:Task[]=[],seen=new Set<string>();let cursor:string|null=null,incomplete=false;
   for(let p=0;p<30;p++){
    const q=new URLSearchParams({view:"mine",limit:"100"});if(cursor)q.set("cursor",cursor);
    const result=await request<Page>("/tasks?"+q);
    all.push(...result.items.filter(t=>t.assignees.some(a=>a.userId===id)));
    if(!result.nextCursor){incomplete=false;break;}
    if(seen.has(result.nextCursor)){incomplete=true;break;}
    seen.add(result.nextCursor);cursor=result.nextCursor;incomplete=true;
   }
   setItems(all);setPartial(incomplete);setLoaded(true);
  }catch(e){setError(e instanceof Error?e.message:"Failed to load assigned tasks");setLoaded(true);}
  finally{setBusy(false);setClock(Date.now());}
 },[request,id,allowed]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),60000);return()=>clearInterval(timer);},[]);
 const progress=async(t:Task)=>{
  const status=t.status==="TODO"?"IN_PROGRESS":t.status==="IN_PROGRESS"?"DONE":null;
  if(!status||busy)return;
  setBusy(true);setError("");
  try{await request("/tasks/"+t.id,{method:"PUT",body:{version:t.version,status}});await load();}
  catch(e){setError(e instanceof Error?e.message:"Unable to update task");}
  finally{setBusy(false);}
 };
 const postProgressComment=async(task:Task)=>{
  const body=commentDraft.trim();
  if(!canComment||busy||!body)return;
  setBusy(true);setError("");setFeedback("");
  try{
   await request("/tasks/"+task.id+"/comments",{method:"POST",body:{body}});
   setCommentTaskId(null);setCommentDraft("");
   await load();
   setFeedback("Comment saved to "+task.title+".");
  }catch(e){setError(e instanceof Error?e.message:"Unable to save comment");}
  finally{setBusy(false);}
 };
 const lists=useMemo(()=>{
  const hasExpired=(t:Task)=>Boolean(t.dueAt)&&Date.parse(t.dueAt!)<clock&&!done.has(t.status);
  const pending=items.filter(t=>t.status==="TODO"&&!hasExpired(t)).sort(due);
  const inProgress=items.filter(t=>t.status==="IN_PROGRESS"&&!hasExpired(t)).sort(due);
  const outstanding=items.filter(t=>hasExpired(t)).sort(due);
  return [{title:"Pending tasks",test:"personal-pending",tone:"pending",icon:ClipboardList,rows:pending},
   {title:"In Process",test:"personal-in-process",tone:"pending",icon:RefreshCw,rows:inProgress},
   {title:"Expired / overdue tasks",test:"personal-overdue",tone:"overdue",icon:CalendarClock,rows:outstanding},
   {title:"Completed tasks",test:"personal-completed",tone:"completed",icon:CheckCircle2,
    rows:items.filter(t=>t.status==="DONE"&&t.completedAt&&
      Number.isFinite(Date.parse(t.completedAt))&&
      Date.parse(t.completedAt)<=clock&&Date.parse(t.completedAt)>clock-24*60*60*1000)
      .sort((a,b)=>Date.parse(b.completedAt!)-Date.parse(a.completedAt!))}];
 },[items,clock]);
 // Stack task sections independently. A tall Pending list should never leave
 // a blank grid-row gap beneath the shorter In Process section.
 const taskColumns=[[lists[0],lists[2]],[lists[1],lists[3]]];
 return <div className="aw-personal-dashboard space-y-6" data-testid="personal-task-dashboard">
  <header className="aw-dashboard-hero">
   <div><p className="aw-eyebrow">MY WORKSPACE</p><h1 className="aw-dashboard-title">My assignments</h1>
    <p className="aw-dashboard-subtitle">Pending, in-process, completed in the past 24 hours and overdue tasks assigned to {session?.user.displayName}.</p></div>
   <div className="flex flex-wrap gap-2">
    <Link href="/app/notes" className="aw-dashboard-refresh"><NotebookPen size={16}/>My notes</Link>
    <Link href="/app/task-history" className="aw-dashboard-refresh"><CheckCircle2 size={16}/>Task history</Link>
    <button type="button" className="aw-dashboard-refresh" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Refresh tasks</button>
   </div>
  </header>
  {error&&<AWNotice tone="error">{error}</AWNotice>}
  {feedback&&<AWNotice tone="success">{feedback}</AWNotice>}
  {partial&&<AWNotice tone="info">Additional records exist beyond the loaded pages. Open Tasks to see more.</AWNotice>}
  {!allowed&&<AWNotice tone="info">Your account does not have task access.</AWNotice>}
  <section className="aw-personal-quick" aria-label="Quick access"><h2>Quick access</h2>
   <div className="aw-personal-quick-grid">{[
    {title:"Leads CRM",desc:"Sales pipeline",href:"/app/leads",permits:["leads.read"],icon:BriefcaseBusiness,tone:"purple"},
    {title:"Clients",desc:"Relationships",href:"/app/clients",permits:["clients.read"],icon:Users,tone:"pink"},
    {title:"Income & expenses",desc:"Financial entries",href:"/app/finance",permits:["finance.entry.read.own","finance.read.all"],icon:Wallet,tone:"cyan"},
    {title:"Tasks",desc:"My assigned work",href:"/app/tasks",permits:["tasks.read"],icon:ClipboardList,tone:"orange"}
   ].filter(x=>x.permits.some(p=>session?.identity.permissions.includes(p))).map(({title,desc,href,icon:Icon,tone})=>
    <Link key={href} href={href} className={"aw-personal-shortcut aw-personal-shortcut-"+tone}>
      <Icon size={19}/><span><strong>{title}</strong><small>{desc}</small></span><ArrowRight size={16}/></Link>)}</div></section>
  <div className="aw-personal-task-grid">{taskColumns.map((groups,index)=><div className="aw-personal-task-column" key={index}>
   {groups.map(group=><section key={group.test} data-testid={group.test} className={"aw-personal-task-section aw-personal-"+group.tone}>
    <div className="aw-personal-task-heading"><span className="aw-personal-task-icon"><group.icon size={20}/></span>
     <h2>{group.title}</h2><strong className="aw-personal-task-count">{loaded?group.rows.length:"…"}</strong></div>
    {group.test==="personal-completed"&&<p className="mb-3 text-xs text-[#BFAAD1]">
      Completed within the last 24 hours. <Link href="/app/task-history" className="font-semibold text-[#E2B5FF] underline underline-offset-2">View full history</Link>
    </p>}
    {!loaded?<p role="status" className="aw-action-status">Loading assignments…</p>:
     group.rows.length?<ol className="aw-personal-task-list">{group.rows.map((t,index)=><li key={t.id} className="aw-personal-task-item">
      <span className="aw-personal-task-index">{index+1}</span><div className="min-w-0 flex-1">
      <Link className="aw-action-name aw-personal-task-link" href={"/app/tasks?task="+t.id}>{t.title}</Link>
      {t.description&&<p className="aw-personal-task-description">{t.description}</p>}
      <p className="aw-action-meta">{t.project?.name||"General task"} · {group.test==="personal-completed"&&t.completedAt
        ?"Completed "+new Date(t.completedAt).toLocaleString()
        :t.dueAt?new Date(t.dueAt).toLocaleString():"No deadline"}</p>
      <AWStatusBadge status={group.tone==="overdue"?"OVERDUE":t.status}/></div>
      {group.test==="personal-in-process"&&canComment&&<button type="button"
       className="aw-action-item-link" disabled={busy}
       aria-label={"Comment on "+t.title} title="Add progress comment"
       aria-expanded={commentTaskId===t.id}
       onClick={()=>{setCommentTaskId(current=>current===t.id?null:t.id);setCommentDraft("");setFeedback("");}}>
       <MessageSquarePlus size={18} aria-hidden="true"/></button>}
      {(group.test==="personal-pending"||group.test==="personal-in-process")&&<button type="button" className="aw-action-item-link" disabled={busy} aria-label={group.test==="personal-pending"?"Start "+t.title:"Complete "+t.title} title={group.test==="personal-pending"?"Move to In Process":"Mark completed"} onClick={()=>void progress(t)}><CheckCircle2 size={18}/></button>}
      <Link className="aw-action-item-link" href={"/app/tasks?task="+t.id} aria-label={"Open "+t.title}><ArrowRight size={16}/></Link>
      {group.test==="personal-in-process"&&commentTaskId===t.id&&canComment&&
       <form className="aw-personal-progress-comment" aria-label={"Progress comment for "+t.title}
        onSubmit={e=>{e.preventDefault();void postProgressComment(t);}}>
        <label htmlFor={"task-comment-"+t.id}>Progress update</label>
        <textarea id={"task-comment-"+t.id} className="aw-personal-comment-input"
          value={commentDraft} minLength={1} maxLength={2000} required rows={2}
          onChange={e=>setCommentDraft(e.target.value)}
          placeholder="Add an update for the assigned team…"/>
        <div className="aw-personal-comment-actions">
         <button type="button" className="aw-action-item-link" disabled={busy}
           onClick={()=>{setCommentTaskId(null);setCommentDraft("");}}>Cancel</button>
         <button type="submit" className="aw-personal-comment-save"
           disabled={busy||!commentDraft.trim()}>Post comment</button>
        </div>
       </form>}
     </li>)}</ol>:<p className="aw-action-status">{error?"Unable to verify tasks.":"No "+group.title.toLowerCase()+"."}</p>}
   </section>)}</div>)}</div>
  <div className="flex flex-wrap gap-2">
    <Link className="aw-dashboard-refresh w-fit" href="/app/tasks">Task management <ArrowRight size={16}/></Link>
    <Link className="aw-dashboard-refresh w-fit" href="/app/task-history">View task history <ArrowRight size={16}/></Link>
  </div>
 </div>;
}
