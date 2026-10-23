"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {ArrowLeft,ArrowRight,CheckCheck,Clock3,History,RefreshCw,Search} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {AWNotice,AWStatusBadge} from "@/components/aw-ui";

type HistoryTask={
 id:string;title:string;description:string|null;status:string;priority:string;
 completedAt:string|null;createdAt:string;dueAt:string|null;
 project:{name:string}|null;assignees:{userId:string;user:{displayName:string}}[];
 _count:{comments:number};
};
type HistoryPage={items:HistoryTask[];nextCursor:string|null};
type View="mine"|"team";
const formatDate=(value:string|null)=>value?
 new Date(value).toLocaleString("en-IN",{day:"2-digit",month:"short",year:"numeric",hour:"numeric",minute:"2-digit"}):"Completion time unavailable";

export default function TaskHistoryPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("tasks.read");
 const canManage=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN")&&
   !!session?.identity.permissions.includes("tasks.manage");
 const [view,setView]=useState<View>("mine");
 const [search,setSearch]=useState("");
 const [cursor,setCursor]=useState<string|null>(null);
 const [previous,setPrevious]=useState<(string|null)[]>([]);
 const [items,setItems]=useState<HistoryTask[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const sequence=useRef(0);

 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  const active=++sequence.current;
  setLoading(true);
  try{
   const params=new URLSearchParams({view:canManage?view:"mine",limit:"20"});
   if(search.trim())params.set("q",search.trim());
   if(cursor)params.set("cursor",cursor);
   const result=await request<HistoryPage>("/tasks/history?"+params.toString());
   if(active!==sequence.current)return;
   setItems(result.items);setNextCursor(result.nextCursor);setError("");
  }catch(e){
   if(active===sequence.current)setError(e instanceof Error?e.message:"Unable to load task history");
  }finally{if(active===sequence.current)setLoading(false);}
 },[canRead,canManage,view,search,cursor,request]);
 useEffect(()=>{void load();},[load]);
 const updateSearch=(value:string)=>{setSearch(value);setCursor(null);setPrevious([]);};
 const updateView=(value:View)=>{setView(value);setCursor(null);setPrevious([]);};
 const next=()=>{if(!nextCursor||loading)return;setPrevious(x=>[...x,cursor]);setCursor(nextCursor);};
 const back=()=>{if(!previous.length||loading)return;setCursor(previous[previous.length-1]);setPrevious(x=>x.slice(0,-1));};
 const recent=items.filter(t=>t.completedAt&&Date.parse(t.completedAt)>Date.now()-86400000).length;
 return <div className="aw-module-root min-w-0 space-y-6" data-aw-module="task-history" data-testid="task-history-page">
  <header className="flex flex-wrap items-end justify-between gap-4">
   <div>
    <p className="aw-eyebrow">DELIVERY / TASK ARCHIVE</p>
    <h1 className="aw-heading flex items-center gap-3"><History size={27} aria-hidden="true"/>Task History</h1>
    <p className="aw-description">Completed work stays accessible here. Overview shows only the last 24 hours of completed tasks.</p>
   </div>
   <div className="flex flex-wrap gap-2">
    <Link href="/app/tasks" className="aw-dashboard-refresh"><ArrowLeft size={16} aria-hidden="true"/>Tasks</Link>
    <button className="aw-dashboard-refresh" type="button" disabled={loading||!canRead} onClick={()=>void load()}>
     <RefreshCw size={16} aria-hidden="true"/>Refresh history</button>
   </div>
  </header>
  {!canRead&&<AWNotice tone="info">Your account does not have permission to view tasks.</AWNotice>}
  {error&&<AWNotice tone="error">{error}</AWNotice>}
  {canRead&&<section className="aw-personal-task-section space-y-4" aria-label="Completed task history">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex items-center gap-2"><CheckCheck size={18} className="text-[#77dfaa]" aria-hidden="true"/>
     <h2 className="font-bold">Completed tasks</h2></div>
    <span className="text-xs text-[#d6c3e6]" aria-live="polite">Page {previous.length+1} · {items.length} record{items.length===1?"":"s"} · {recent} in the past 24h on this page</span>
   </div>
   <div className="flex flex-wrap items-end gap-3">
    <label className="min-w-[190px] flex-1 text-xs font-semibold text-[#ddc9f0]">
     Search completed tasks
     <span className="mt-2 flex items-center gap-2 rounded border border-[#76508b] bg-[#180e24] px-3">
      <Search size={15} aria-hidden="true"/><input className="w-full min-w-0 bg-transparent py-3 text-sm text-white outline-none" type="search"
       value={search} maxLength={100} onChange={e=>updateSearch(e.target.value)}
       placeholder="Search by task title" aria-label="Search completed tasks"/>
     </span>
    </label>
    {canManage&&<label className="text-xs font-semibold text-[#ddc9f0]">History scope
     <select className="field mt-2 w-full sm:w-auto" aria-label="Task history scope" value={view}
      onChange={e=>updateView(e.target.value as View)}>
      <option value="mine">My tasks</option><option value="team">All team tasks</option>
     </select>
    </label>}
   </div>
   {loading&&<p role="status" className="text-sm text-[#d8c1eb]"><RefreshCw size={15} className="mr-2 inline animate-spin"/>Loading completed tasks…</p>}
   {!loading&&!error&&items.length===0&&
    <div className="rounded border border-dashed border-[#634279] p-8 text-center text-sm text-[#d6c3e6]">
     No completed tasks found for this view.
    </div>}
   <ol className="grid gap-3" aria-label="Completed task records" aria-busy={loading}>
    {items.map(t=><li key={t.id} className="min-w-0 rounded border border-[#654677] bg-[#1b1128] p-4">
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-2">
       <div className="flex flex-wrap items-center gap-2">
        <AWStatusBadge status={t.status}/>
        <span className="rounded border border-[#604875] bg-[#322141] px-2 py-1 text-xs font-semibold">{t.priority}</span>
       </div>
       <h3 className="break-words text-base font-bold text-white">{t.title}</h3>
       {t.description&&<p className="break-words text-sm text-[#cbb5db]">{t.description}</p>}
       <p className="text-xs text-[#e1cee9]">
        <Clock3 size={13} className="mr-1 inline" aria-hidden="true"/>Completed: <time dateTime={t.completedAt??undefined}>{formatDate(t.completedAt)}</time>
       </p>
       <p className="break-words text-xs text-[#bba4cf]">{t.project?.name||"General task"}
        {" · "}Assigned: {t.assignees.map(a=>a.user.displayName).join(", ")||"No current assignee"}
        {" · "}{t._count.comments} comment{t._count.comments===1?"":"s"}</p>
      </div>
      <Link className="aw-dashboard-refresh shrink-0" href={"/app/tasks?task="+t.id}
       aria-label={"Open completed task "+t.title}>View task <ArrowRight size={15} aria-hidden="true"/></Link>
     </div>
    </li>)}
   </ol>
   <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-[#523663] pt-4" aria-label="Task history pages">
    <button className="aw-dashboard-refresh" type="button" onClick={back} disabled={loading||previous.length===0}>Previous page</button>
    <span className="text-xs text-[#cab3de]">Page {previous.length+1}</span>
    <button className="aw-dashboard-refresh" type="button" onClick={next} disabled={loading||!nextCursor}>Next page <ArrowRight size={14}/></button>
   </nav>
  </section>}
 </div>;
}
