"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {CalendarClock,ChevronLeft,ChevronRight,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {AWNotice} from "@/components/aw-ui";

type FollowUp={
 id:string;nextFollowUpAt:string|null;phone:string|null;
 businessName:string;contactName:string|null;
};
type FollowUpPage={items:FollowUp[];nextCursor:string|null};
const formatDay=(timestamp:string|null)=>{
 if(!timestamp)return "Not scheduled";
 // nextFollowUpAt is stored at UTC noon for a date-only follow-up.
 const date=new Date(timestamp.slice(0,10)+"T12:00:00.000Z");
 return date.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
};
const callHref=(phone:string)=>"tel:"+(phone.trim().startsWith("+")?"+":"")+phone.replace(/\D/g,"");

export default function FollowUpsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read");
 const [rows,setRows]=useState<FollowUp[]>([]);
 const [cursor,setCursor]=useState<string|null>(null);
 const [history,setHistory]=useState<(string|null)[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const sequence=useRef(0);

 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   const current=++sequence.current;
   setLoading(true);setError("");
   try{
     const q=new URLSearchParams({limit:"20"});
     if(cursor)q.set("cursor",cursor);
     const data=await request<FollowUpPage>("/leads/follow-ups?"+q.toString());
     if(current!==sequence.current)return;
     setRows(data.items);setNextCursor(data.nextCursor);
   }catch(e){
     if(current===sequence.current){
       setError(e instanceof Error?e.message:"Unable to load follow-ups.");
       setRows([]);setNextCursor(null);
     }
   }finally{if(current===sequence.current)setLoading(false);}
 },[canRead,cursor,request]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);
 const next=()=>{
   if(loading||!nextCursor)return;
   setHistory(value=>[...value,cursor]);
   setCursor(nextCursor);
 };
 const previous=()=>{
   if(loading||!history.length)return;
   setCursor(history[history.length-1]);
   setHistory(value=>value.slice(0,-1));
 };

 if(!session)return <div role="status" className="aw-followups-loading">Checking follow-up access…</div>;
 return <div data-testid="follow-ups-page" className="aw-followups-page">
   <header className="aw-followups-header">
     <div>
       <p className="aw-eyebrow">LEADS CRM / SCHEDULE</p>
       <h1 className="aw-followups-title"><CalendarClock size={25} aria-hidden="true"/>Follow Ups</h1>
       <p className="aw-followups-description">Scheduled follow-ups, ordered by follow-up date. Changes made in Leads CRM appear here.</p>
     </div>
     <button type="button" className="aw-followups-refresh" onClick={()=>void load()}
       disabled={loading||!canRead} aria-label="Refresh follow-ups">
       <RefreshCw size={16} className={loading?"animate-spin":""} aria-hidden="true"/>Refresh
     </button>
   </header>

   {!canRead&&<AWNotice tone="error">You do not have permission to view leads.</AWNotice>}
   {canRead&&<section className="aw-followups-register" aria-label="Scheduled follow-ups">
     {error&&<div className="aw-followups-error"><AWNotice tone="error">{error}</AWNotice></div>}
     {loading&&<p className="aw-followups-loading" role="status">Loading scheduled follow-ups…</p>}
     <div className="aw-followups-scroll">
       <table className="aw-followups-table" aria-label="Follow-up register" aria-busy={loading}>
         <thead><tr>
           <th scope="col">Follow-up date</th>
           <th scope="col">Phone number</th>
           <th scope="col">Business name</th>
           <th scope="col">Contact name</th>
         </tr></thead>
         <tbody>{rows.map(lead=><tr key={lead.id}>
           <td><time dateTime={lead.nextFollowUpAt?.slice(0,10)}>{formatDay(lead.nextFollowUpAt)}</time></td>
           <td>{lead.phone?<a className="aw-followups-number" href={callHref(lead.phone)}>{lead.phone}</a>:"Not recorded"}</td>
           <td><Link className="aw-followups-business" href={"/app/leads?focus="+encodeURIComponent(lead.id)}>{lead.businessName}</Link></td>
           <td>{lead.contactName||"Not recorded"}</td>
         </tr>)}</tbody>
       </table>
     </div>
     {!loading&&!error&&rows.length===0&&
       <p className="aw-followups-empty">No leads currently have a scheduled Follow Up status.</p>}
     <nav className="aw-followups-pagination" aria-label="Follow-up pages">
       <button type="button" onClick={previous} disabled={loading||!history.length}>
         <ChevronLeft size={16}/>Previous
       </button>
       <span>Page {history.length+1}</span>
       <button type="button" onClick={next} disabled={loading||!nextCursor}>
         Next<ChevronRight size={16}/>
       </button>
     </nav>
   </section>}
 </div>;
}
