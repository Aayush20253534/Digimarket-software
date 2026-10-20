"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CalendarClock, Clock3, FolderKanban, ListOrdered, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AWBadge, AWNotice } from "@/components/aw-ui";
import { AWPanel } from "@/components/aw-data-patterns";

type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "IN_REVIEW" | "DONE" | "CANCELLED";
type TaskItem = {
  id: string; title: string; status: TaskStatus; priority: string;
  dueAt: string | null; project?: {name: string} | null;
};
type ProjectItem = { id:string; name:string; status:"PLANNED"|"ACTIVE"|"ON_HOLD"|"COMPLETED"|"ARCHIVED"; dueOn:string|null; client?:{businessName:string} };
type Page<T> = { items:T[]; nextCursor:string|null };
type Feed = { tasks:TaskItem[]; projects:ProjectItem[]; moreTasks:boolean; moreProjects:boolean; errors:string[] };

const taskClosed = new Set(["DONE","CANCELLED"]);
const projectClosed = new Set(["COMPLETED","ARCHIVED"]);
const PAGE_LIMIT = 100;
const PAGE_CAP = 30; // Explicitly disclose any incomplete record set, rather than invent a complete total.

function localDateKey(date:Date):string {
  return [date.getFullYear(),String(date.getMonth()+1).padStart(2,"0"),String(date.getDate()).padStart(2,"0")].join("-");
}
function dateLabel(value:string):string {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined,{day:"numeric",month:"short",year:"numeric"}).format(d);
}
function compareByDue(a:TaskItem,b:TaskItem) {
  const ax=a.dueAt?new Date(a.dueAt).getTime():Number.POSITIVE_INFINITY;
  const bx=b.dueAt?new Date(b.dueAt).getTime():Number.POSITIVE_INFINITY;
  return ax-bx||a.title.localeCompare(b.title);
}

export function AWActionCenter() {
  const { session, request } = useAuth();
  const [feed,setFeed]=useState<Feed|null>(null);
  const [loading,setLoading]=useState(false);
  const [run,setRun]=useState(0);
  const [clock,setClock]=useState(()=>Date.now());
  const [pendingVisible,setPendingVisible]=useState(8);
  const [overdueVisible,setOverdueVisible]=useState(8);
  const canTasks=!!session?.identity.permissions.includes("tasks.read");
  const canProjects=!!session?.identity.permissions.includes("projects.read");
  const canTeam=!!session?.identity.permissions.includes("tasks.manage");

  const load=useCallback(async()=>{
    if(!session)return;
    if(!canTasks&&!canProjects){setFeed({tasks:[],projects:[],errors:[],moreTasks:false,moreProjects:false});return;}
    setLoading(true);
    const retrieve=async<T,>(path:string) => {
      const records:T[]=[];
      let cursor:string|null=null;
      let partial=false;
      const seen=new Set<string>();
      for(let p=0;p<PAGE_CAP;p++){
        const url=new URLSearchParams({limit:String(PAGE_LIMIT)});
        if(path==="/tasks")url.set("view",canTeam?"team":"mine");
        if(cursor)url.set("cursor",cursor);
        const response=await request<Page<T>>(path+"?"+url.toString());
        records.push(...response.items);
        if(!response.nextCursor)return {records,partial:false};
        if(seen.has(response.nextCursor)){partial=true;break;}
        seen.add(response.nextCursor);
        cursor=response.nextCursor;
        partial=true;
      }
      return {records,partial};
    };
    const results=await Promise.allSettled([
      canTasks?retrieve<TaskItem>("/tasks"):Promise.resolve({records:[] as TaskItem[],partial:false}),
      canProjects?retrieve<ProjectItem>("/projects"):Promise.resolve({records:[] as ProjectItem[],partial:false}),
    ]);
    const errors:string[]=[];
    const taskResult=results[0].status==="fulfilled"?results[0].value:null;
    const projectResult=results[1].status==="fulfilled"?results[1].value:null;
    if(results[0].status==="rejected")errors.push("Tasks could not be loaded");
    if(results[1].status==="rejected")errors.push("Projects could not be loaded");
    setFeed({tasks:taskResult?.records??[],projects:projectResult?.records??[],
      moreTasks:taskResult?.partial??false,moreProjects:projectResult?.partial??false,errors});
    setPendingVisible(8);setOverdueVisible(8);setLoading(false);
  },[session,request,canTasks,canProjects,canTeam]);

  useEffect(()=>{void load();},[load,run]);
  useEffect(()=>{const timer=window.setInterval(()=>setClock(Date.now()),60_000);
    return ()=>window.clearInterval(timer);},[]);
  const currentTime=clock,today=localDateKey(new Date(currentTime));
  const pending=useMemo(()=>feed?.tasks.filter(x=>!taskClosed.has(x.status)).sort(compareByDue)??[],[feed]);
  const overdue=useMemo(()=>{
    const tasks=feed?.tasks.filter(x=>!taskClosed.has(x.status)&&x.dueAt&&new Date(x.dueAt).getTime()<currentTime)
      .map(x=>({id:x.id,label:x.title,kind:"Task",href:"/app/tasks",date:x.dueAt!,status:x.status}))??[];
    const projects=feed?.projects.filter(x=>!projectClosed.has(x.status)&&x.dueOn&&x.dueOn.slice(0,10)<today)
      .map(x=>({id:x.id,label:x.name,kind:"Project",href:"/app/projects",date:x.dueOn!,status:x.status}))??[];
    return [...tasks,...projects].sort((a,b)=>a.date.localeCompare(b.date)||a.label.localeCompare(b.label));
  },[feed,currentTime,today]);

  if(!canTasks&&!canProjects)return null;
  const incomplete=feed?.moreTasks||feed?.moreProjects;
  return <section className="aw-action-center" aria-label="Action center" data-testid="dashboard-action-center">
    <div className="aw-action-center-heading">
      <div className="min-w-0">
        <p className="aw-eyebrow">PRIORITIES & DEADLINES</p>
        <h2 className="aw-action-heading">What needs your attention</h2>
        <p className="aw-panel-description">Live, permission-scoped tasks and project deadlines. Completed and cancelled work is excluded.</p>
      </div>
      <button type="button" className="aw-dashboard-refresh" onClick={()=>{setClock(Date.now());setRun(v=>v+1);}} disabled={loading}
        aria-label="Refresh priorities"><RefreshCw size={16} className={loading?"animate-spin":""} aria-hidden="true" />
        {loading?"Loading…":"Refresh priorities"}</button>
    </div>
    {feed?.errors.length ? <div className="mb-4"><AWNotice tone="error">{feed.errors.join(". ")}. Use the Tasks or Projects pages to check the latest data.</AWNotice></div> : null}
    {incomplete ? <div className="mb-4"><AWNotice tone="info">
      More records exist than this overview loaded. Lists and totals are partial; open the corresponding module for the full register.
    </AWNotice></div> : null}
    <div className="aw-action-grid">
      {canTasks && <AWPanel title="Pending tasks" description="All unfinished tasks visible to your role, ordered by deadline."
        action={<Link href="/app/tasks" className="aw-action-top-link">Open tasks <ArrowRight size={16} aria-hidden="true"/></Link>}>
        <div className="aw-action-total aw-action-total-orange">
          <ListOrdered size={19} aria-hidden="true"/>
          <strong data-testid="pending-task-count">{feed?pending.length:"…"}</strong>
          <span>{incomplete?"loaded pending tasks":"pending tasks"}</span>
        </div>
        {loading&&!feed?<p role="status" className="aw-action-status">Loading pending tasks…</p>:
          pending.length?<ol className="aw-action-items" aria-label="Numbered pending tasks">
            {pending.slice(0,pendingVisible).map((task,index)=><li key={task.id} className="aw-action-row">
              <span className="aw-action-number" aria-label={"Task number "+(index+1)}>{index+1}</span>
              <div className="min-w-0 flex-1">
                <p className="aw-action-name">{task.title}</p>
                <p className="aw-action-meta">{task.project?.name||"General task"} · {task.priority.toLowerCase()} priority
                  {task.dueAt?" · Due "+dateLabel(task.dueAt):" · No due date"}</p>
              </div>
              <AWBadge tone={task.status==="BLOCKED"?"warning":"neutral"}>{task.status.replaceAll("_"," ")}</AWBadge>
            </li>)}
          </ol>:<p className="aw-action-status">{feed?.errors.length?"Unable to verify pending tasks.":"No pending tasks in your available records."}</p>}
        {pending.length>pendingVisible && <button type="button" className="aw-action-more" onClick={()=>setPendingVisible(n=>n+20)}>
          Show more pending tasks ({pending.length-pendingVisible} remaining) <ArrowRight size={16} aria-hidden="true"/>
        </button>}
      </AWPanel>}
      <AWPanel title="Past deadline" description="Unfinished tasks and open projects whose deadlines have passed."
        action={<CalendarClock size={20} className="text-[#FF9C7A]" aria-hidden="true"/>}>
        <div className="aw-action-total aw-action-total-red">
          <AlertCircle size={19} aria-hidden="true"/>
          <strong data-testid="overdue-item-count">{feed?overdue.length:"…"}</strong>
          <span>{incomplete?"loaded overdue items":"overdue items"}</span>
        </div>
        {loading&&!feed?<p role="status" className="aw-action-status">Checking deadlines…</p>:
          overdue.length?<ol className="aw-action-items" aria-label="Overdue tasks and projects">
            {overdue.slice(0,overdueVisible).map((item)=><li className="aw-action-row" key={item.kind+item.id}>
              <span className="aw-action-overdue-icon"><Clock3 size={17} aria-hidden="true"/></span>
              <div className="min-w-0 flex-1">
                <p className="aw-action-name">{item.label}</p>
                <p className="aw-action-meta">{item.kind} · Deadline {dateLabel(item.date)}</p>
              </div>
              <Link href={item.href} className="aw-action-item-link" aria-label={"Open "+item.kind+" register"}>
                <ArrowRight size={17} aria-hidden="true"/>
              </Link>
            </li>)}
          </ol>:<p className="aw-action-status">{feed?.errors.length?"Unable to verify every deadline.":"Nothing is past deadline in your available records."}</p>}
        {overdue.length>overdueVisible&&<button type="button" className="aw-action-more" onClick={()=>setOverdueVisible(n=>n+20)}>
          Show more overdue items ({overdue.length-overdueVisible} remaining) <ArrowRight size={16} aria-hidden="true"/>
        </button>}
      </AWPanel>
    </div>
    {canTeam&&<p className="aw-action-footnote">Managers see organization-wide tasks. Other users see assigned or created tasks. All project results follow existing project visibility rules.</p>}
  </section>;
}
