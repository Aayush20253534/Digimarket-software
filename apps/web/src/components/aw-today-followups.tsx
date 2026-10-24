"use client";

import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,CalendarCheck2,PhoneCall,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

type DueLead={
 id:string;businessName:string;contactName:string|null;phone:string|null;source:string|null;
 stageNote:string|null;nextFollowUpAt:string|null;assignedToId:string|null;
 assignee:{displayName:string}|null;
};
type DueResponse={date:string;total:number;hasMore:boolean;items:DueLead[]};

// This workspace operates in India. Use the agency calendar day, not UTC today
// or the server deployment's timezone, to decide when cards appear.
const agencyDay=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",
}).format(new Date());
const prettyDay=(value:string)=>new Date(value+"T12:00:00.000Z").toLocaleDateString("en-IN",{
 timeZone:"UTC",day:"numeric",month:"long",year:"numeric",
});
const phoneHref=(value:string)=>"tel:"+(value.trim().startsWith("+")?"+":"")+value.replace(/\D/g,"");

export function AWTodayFollowUps(){
 const {session,request}=useAuth();
 const permitted=!!session?.identity.permissions.includes("leads.read");
 const [date,setDate]=useState("");
 const [report,setReport]=useState<DueResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
   const update=()=>setDate(agencyDay());
   update();
   const tick=window.setInterval(update,60000);
   const visible=()=>{if(document.visibilityState==="visible")update();};
   document.addEventListener("visibilitychange",visible);
   return ()=>{window.clearInterval(tick);document.removeEventListener("visibilitychange",visible);};
 },[]);
 const refresh=useCallback(async()=>{
   if(!permitted||!date)return;
   setLoading(true);setError("");
   try{
     const response=await request<DueResponse>("/leads/follow-ups/today?"+
       new URLSearchParams({date}).toString());
     setReport(response);
   }catch(e){setReport(null);setError(e instanceof Error?e.message:"Unavailable");}
   finally{setLoading(false);}
 },[date,permitted,request]);
 useEffect(()=>{void refresh();},[refresh]);
 // Future follow-ups stay in CRM; the Overview card appears on the exact chosen day.
 if(!permitted||!date||report?.date!==date||report.items.length===0)return null;
 return <section className="aw-today-followups" aria-label="Today's lead follow-ups"
   data-testid="today-lead-followups">
   <div className="aw-today-followups-heading">
     <div>
       <p className="aw-today-followups-kicker"><CalendarCheck2 size={16}/>DUE TODAY · {prettyDay(date)}</p>
       <h2>Lead follow-ups</h2>
       <p>Only leads scheduled for today. Future dates appear on their selected day.</p>
     </div>
     <div className="aw-today-followups-heading-actions">
       <span className="aw-today-followups-count">{report.total} due</span>
       <button type="button" disabled={loading} aria-label="Refresh today's follow-ups"
         onClick={()=>void refresh()}><RefreshCw size={17} className={loading?"animate-spin":""}/></button>
     </div>
   </div>
   <div className="aw-today-followups-grid">
     {report.items.map(lead=><article key={lead.id} className="aw-today-followup-card">
       <div className="aw-today-followup-top"><span>FOLLOW UP TODAY</span><CalendarCheck2 size={20} aria-hidden="true"/></div>
       <h3>{lead.businessName}</h3>
       <p>{lead.contactName||"Contact name not recorded"} · {lead.assignee?.displayName||"Unassigned"}</p>
       {lead.stageNote?.trim()&&<p className="aw-today-followup-note">{lead.stageNote}</p>}
       <div className="aw-today-followup-actions">
         <Link href={"/app/leads?focus="+encodeURIComponent(lead.id)} aria-label={"Open lead "+lead.businessName}>
           Open lead <ArrowUpRight size={16}/>
         </Link>
         {lead.phone&&<a href={phoneHref(lead.phone)} aria-label={"Call "+lead.businessName}>
           <PhoneCall size={16}/>Call
         </a>}
       </div>
     </article>)}
   </div>
   {report.hasMore&&<p className="aw-today-followups-more">Showing 100 of {report.total} follow-ups due today. Open Leads CRM for more.</p>}
   {error&&<p role="alert">{error}</p>}
 </section>;
}
