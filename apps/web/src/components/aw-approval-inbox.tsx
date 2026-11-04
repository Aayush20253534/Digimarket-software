"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {CheckCheck,ClipboardCheck,Clock3,RefreshCw,X} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

type RequestItem={
 id:string;title:string;status:string;createdAt:string;
 requester?:{displayName:string};
 policy?:{name:string;category:string};
};
export function AWApprovalInbox(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("approvals.read");
 const canDecide=!!session?.identity.permissions.includes("approvals.decide");
 const [open,setOpen]=useState(false);
 const [pending,setPending]=useState<RequestItem[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 const ref=useRef<HTMLDivElement>(null);
 const mode=canDecide?"queue":"mine";
 const refresh=useCallback(async()=>{
  if(!canRead)return;
  setLoading(true);setError("");
  try{
   const result=await request<RequestItem[]>("/approvals?view="+mode);
   if(!Array.isArray(result))throw new Error("Invalid approval response");
   setPending(result.filter(item=>item.status==="PENDING"));
  }catch(e){setError(e instanceof Error?e.message:"Approval inbox unavailable");}
  finally{setLoading(false);}
 },[canRead,request,mode]);
 useEffect(()=>{if(canRead)void refresh();},[canRead,refresh]);
 useEffect(()=>{
  if(!canRead)return;
  const interval=window.setInterval(()=>void refresh(),60000);
  return()=>window.clearInterval(interval);
 },[canRead,refresh]);
 useEffect(()=>{
  if(!open)return;
  const click=(e:MouseEvent)=>{if(!ref.current?.contains(e.target as Node))setOpen(false);};
  const key=(e:KeyboardEvent)=>{if(e.key==="Escape")setOpen(false);};
  document.addEventListener("mousedown",click);
  document.addEventListener("keydown",key);
  return()=>{document.removeEventListener("mousedown",click);document.removeEventListener("keydown",key);};
 },[open]);
 if(!canRead)return null;
 return <div className="aw-v2-inbox-wrap" ref={ref}>
  <button type="button" className="aw-work-icon aw-v2-inbox-trigger"
   aria-label="Approval inbox" aria-haspopup="dialog"
   aria-expanded={open} aria-controls="aw-approval-inbox-panel"
   title="Approval inbox" onClick={()=>{setOpen(v=>!v);if(!open)void refresh();}}>
   <ClipboardCheck size={19} aria-hidden="true"/>
   {pending.length>0&&<span className="aw-v2-inbox-count">{pending.length>99?"99+":pending.length}</span>}
  </button>
  {open&&<aside role="dialog" aria-label="Approval inbox panel" id="aw-approval-inbox-panel"
    className="aw-v2-inbox-panel">
   <header className="aw-v2-inbox-head">
    <div><h2>Approval inbox</h2><p>{canDecide?"Pending decisions":"Your pending requests"}</p></div>
    <button type="button" aria-label="Close approval inbox" onClick={()=>setOpen(false)}><X size={18}/></button>
   </header>
   <div className="aw-v2-inbox-actions">
    <span>{pending.length} pending</span>
    <button type="button" onClick={()=>void refresh()} disabled={loading} aria-label="Refresh approval inbox">
     <RefreshCw size={15} aria-hidden="true"/>{loading?"Refreshing…":"Refresh"}
    </button>
   </div>
   {error&&<p className="aw-v2-inbox-error" role="alert">{error}</p>}
   <div className="aw-v2-inbox-list" role="list" aria-label="Pending approval requests">
    {loading&&!pending.length?<p className="aw-v2-inbox-empty">Loading approvals…</p>:
     !pending.length?<p className="aw-v2-inbox-empty"><CheckCheck size={22} aria-hidden="true"/>No pending approvals.</p>:
     pending.slice(0,8).map(item=><article key={item.id} className="aw-v2-inbox-entry" role="listitem">
      <strong>{item.title}</strong>
      <p>{item.policy?.name??"Approval"} · {item.requester?.displayName??"Team member"}</p>
      <div><span><Clock3 size={12} aria-hidden="true"/>{new Date(item.createdAt).toLocaleDateString()}</span>
       <Link href={"/app/approvals?view="+mode+"&focus="+encodeURIComponent(item.id)} onClick={()=>setOpen(false)}>
        {canDecide?"Review":"View request"}
       </Link></div>
     </article>)}
   </div>
   <footer className="aw-v2-inbox-footer">
    <Link href={"/app/approvals?view="+mode} onClick={()=>setOpen(false)}>Open all approval workflows</Link>
   </footer>
  </aside>}
 </div>;
}
