"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {Bell,CheckCheck,RefreshCw,X} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
type Notification={id:string;title:string;body:string;kind:string;href:string;readAt:string|null;createdAt:string};
type Response={items:Notification[];unreadCount:number};
export function AWNotificationBell(){
 const {session,request}=useAuth();
 const [open,setOpen]=useState(false),[rows,setRows]=useState<Notification[]>([]),[unread,setUnread]=useState(0);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const panel=useRef<HTMLDivElement>(null);
 const allowed=!!session?.identity.permissions.includes("notifications.read");
 const load=useCallback(async()=>{
  if(!allowed){setLoading(false);return;}
  try{
   const data=await request<Response>("/notifications?limit=100");
   setRows(data.items);setUnread(data.unreadCount);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Notifications are unavailable");}
  finally{setLoading(false);}
 },[request,allowed]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!allowed)return;const poll=window.setInterval(()=>void load(),60000);return()=>window.clearInterval(poll);},[load,allowed]);
 useEffect(()=>{
  if(!open)return;
  const onKey=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};
  const onPointer=(e:MouseEvent)=>{if(panel.current&&!panel.current.contains(e.target as Node))setOpen(false);};
  document.addEventListener("keydown",onKey);document.addEventListener("mousedown",onPointer);
  return()=>{document.removeEventListener("keydown",onKey);document.removeEventListener("mousedown",onPointer);};
 },[open]);
 async function action(path:string){setBusy(true);setError("");try{await request(path,{method:"POST",body:{}});await load();}catch(e){setError(e instanceof Error?e.message:"Unable to mark notification as read");}finally{setBusy(false);}}
 if(!allowed)return null;
 return <div className="aw-bell-wrap" ref={panel}>
  <button type="button" className="aw-work-icon aw-bell-trigger" aria-label="Notifications" aria-expanded={open} aria-controls="aw-notification-panel" onClick={()=>{setOpen(o=>!o);if(!open)void load();}}>
   <Bell size={19}/>{unread>0&&<span className="aw-bell-unread">{unread>99?"99+":unread}</span>}
  </button>
  {open&&<aside role="dialog" aria-label="Notifications panel" id="aw-notification-panel" className="aw-bell-panel">
   <header className="aw-bell-head"><div><h2>Notifications</h2><p>{unread} unread alerts</p></div>
    <button type="button" aria-label="Close notifications" onClick={()=>setOpen(false)}><X size={19}/></button></header>
   <div className="aw-bell-actions">
    <button type="button" disabled={busy||!unread} onClick={()=>void action("/notifications/read-all")}><CheckCheck size={15}/> Mark all read</button>
    <button type="button" disabled={busy} aria-label="Refresh notifications" onClick={()=>void load()}><RefreshCw size={15}/> Refresh</button>
   </div>
   {error&&<p role="alert" className="aw-bell-error">{error}</p>}
   <div className="aw-bell-list" role="list" aria-label="Recent notifications">
    {loading&&!rows.length?<p className="aw-bell-empty">Loading notifications…</p>:
     !rows.length?<p className="aw-bell-empty">No notifications yet.</p>:
     rows.map(n=><article className={"aw-bell-item"+(!n.readAt?" unread":"")} key={n.id} role="listitem">
      <div className="aw-bell-item-head"><span className="aw-bell-dot" aria-hidden="true"/><strong>{n.title}</strong></div>
      <p>{n.body}</p><time dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
      <div className="aw-bell-item-actions"><Link onClick={()=>setOpen(false)} href={n.href.startsWith("/app/")?n.href:"/app/dashboard"}>Open</Link>
       {!n.readAt&&<button type="button" disabled={busy} onClick={()=>void action("/notifications/"+n.id+"/read")}>Mark read</button>}</div>
     </article>)}
   </div>
  </aside>}
 </div>;
}
