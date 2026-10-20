"use client";
import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,EmptyState,Notice,PageHeader,Spinner} from "@/components/ui";
type NoticeItem={id:string;kind:string;title:string;body:string;href:string;readAt:string|null;createdAt:string};
type Notices={items:NoticeItem[];unreadCount:number};
export default function NotificationsPage(){
 const {session,request}=useAuth();
 const can=!!session?.identity.permissions.includes("notifications.read");
 const [items,setItems]=useState<NoticeItem[]>([]),[unread,setUnread]=useState(0);
 const [onlyUnread,setOnlyUnread]=useState(false),[busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true),[error,setError]=useState("");
 const [live,setLive]=useState(false);
 const load=useCallback(async()=>{
  if(!can){setLoading(false);return;}
  try{const data=await request<Notices>("/notifications?limit=100"+(onlyUnread?"&unread=true":""));
   setItems(data.items);setUnread(data.unreadCount);setError("");
  }catch(e){setError(e instanceof ApiError?e.message:"Notifications unavailable");}
  finally{setLoading(false);}
 },[can,onlyUnread,request]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!can||!session?.accessToken)return;
  const controller=new AbortController();
  let closed=false;
  const poll=setInterval(()=>{if(!closed)void load();},60000);
  const connect=async()=>{
   try{
    const response=await fetch("/api/v1/notifications/stream",{
     headers:{authorization:"Bearer "+session.accessToken,accept:"text/event-stream"},
     signal:controller.signal,cache:"no-store",
    });
    if(!response.ok||!response.body)throw Error("Live updates unavailable");
    setLive(true);
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer="";
    while(!closed){
     const next=await reader.read();if(next.done)break;
     buffer+=decoder.decode(next.value,{stream:true});
     const blocks=buffer.split("\n\n");buffer=blocks.pop()??"";
     if(blocks.some(b=>b.includes("event: change")))void load();
    }
   }catch{if(!closed)setLive(false);}
   finally{if(!closed)setLive(false);}
  };
  void connect();
  return ()=>{closed=true;controller.abort();clearInterval(poll);setLive(false);};
 },[can,session?.accessToken,load]);
 const act=async(cb:()=>Promise<unknown>)=>{
  setBusy(true);setError("");
  try{await cb();await load();}
  catch(e){setError(e instanceof ApiError?e.message:"Could not update notification");}finally{setBusy(false);}
 };
 if(!session)return <Spinner label="Checking notification access…"/>;
 if(!can)return <Notice kind="error">Notification access required.</Notice>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Your workspace" title="Notifications"
   description="Only your own alerts appear here. Live updates are streamed when available; the view also checks for changes periodically."/>
  {error&&<Notice kind="error">{error}</Notice>}
  <Card title={unread+" unread"} description={live?"Live updates connected":"Live stream offline; periodic refresh active"}>
   <div className="mb-4 flex flex-wrap gap-2">
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={onlyUnread}
      onChange={e=>setOnlyUnread(e.target.checked)}/>Unread only</label>
    <button type="button" className="btn-secondary" onClick={()=>void load()}>Refresh</button>
    <button type="button" className="btn-secondary" disabled={!unread||busy}
     onClick={()=>void act(()=>request("/notifications/read-all",{method:"POST",body:{}}))}>Mark all read</button>
   </div>
   {loading?<Spinner label="Loading your alerts…"/>:items.length===0?
    <EmptyState title="No notifications" description="Alerts for due work, follow-ups, reviews and overdue invoices appear here."/>:
    <div className="space-y-2">{items.map(n=><article key={n.id} className={
      "rounded-lg border p-4 "+(n.readAt?"bg-white":"bg-indigo-50/50")}>
     <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-sm font-semibold">{n.title}</p>
       <p className="mt-1 text-sm text-slate-600">{n.body}</p>
       <p className="mt-2 text-xs text-slate-500">{new Date(n.createdAt).toLocaleString()}</p></div>
      <div className="flex gap-2">
       <Link className="btn-secondary" href={n.href}>Open</Link>
       {!n.readAt&&<button type="button" disabled={busy} className="btn-secondary"
        onClick={()=>void act(()=>request("/notifications/"+n.id+"/read",{method:"POST",body:{}}))}>Mark read</button>}
      </div>
     </div>
    </article>)}</div>}
  </Card>
 </div>;
}
