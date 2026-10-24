"use client";

import {useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {ArrowUpRight,CalendarClock,PhoneCall,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

type Meeting={
 id:string;businessName:string;contactName:string|null;phone:string|null;
 stageNote:string|null;meetingAt:string|null;assignedToId:string|null;
 assignee:{displayName:string}|null;
};
type MeetingResponse={date:string;total:number;hasMore:boolean;items:Meeting[]};
const indiaToday=()=>new Intl.DateTimeFormat("en-CA",{
 timeZone:"Asia/Kolkata",year:"numeric",month:"2-digit",day:"2-digit",
}).format(new Date());
const displayDay=(date:string)=>new Date(date+"T12:00:00Z").toLocaleDateString("en-IN",{
 timeZone:"UTC",dateStyle:"long",
});
const displayTime=(timestamp:string)=>new Date(timestamp).toLocaleTimeString("en-IN",{
 timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true,
});
const phoneHref=(value:string)=>"tel:"+(value.trim().startsWith("+")?"+":"")+value.replace(/\D/g,"");

export function AWTodayMeetings(){
 const {session,request}=useAuth();
 const permitted=!!session?.identity.permissions.includes("leads.read");
 const [date,setDate]=useState("");
 const [report,setReport]=useState<MeetingResponse|null>(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState("");
 useEffect(()=>{
   const update=()=>setDate(indiaToday());
   update();
   const timer=window.setInterval(update,60_000);
   const visible=()=>{if(document.visibilityState==="visible")update();};
   document.addEventListener("visibilitychange",visible);
   return ()=>{window.clearInterval(timer);document.removeEventListener("visibilitychange",visible);};
 },[]);
 const refresh=useCallback(async()=>{
   if(!permitted||!date)return;
   setLoading(true);setError("");
   try{
     const result=await request<MeetingResponse>("/leads/meetings/today?"+
       new URLSearchParams({date}).toString());
     setReport(result);
   }catch(e){setReport(null);setError(e instanceof Error?e.message:"Meetings unavailable");}
   finally{setLoading(false);}
 },[date,permitted,request]);
 useEffect(()=>{void refresh();},[refresh]);
 if(!permitted||!date)return null;
 if(error)return <section className="aw-today-meetings" aria-label="Meeting schedule unavailable">
   <p role="alert">Unable to load today's meetings: {error}</p>
   <button className="aw-meeting-refresh" onClick={()=>void refresh()} type="button">Retry</button>
 </section>;
 // Meetings remain hidden until their exact local date; tomorrow's meeting never shows today.
 if(report?.date!==date||report.items.length===0)return null;
 return <section className="aw-today-meetings" aria-label="Today's scheduled meetings"
   data-testid="today-lead-meetings">
   <header className="aw-meeting-heading">
     <div>
       <p className="aw-meeting-kicker"><CalendarClock size={16}/>MEETINGS TODAY · {displayDay(date)}</p>
       <h2>Scheduled meetings</h2>
       <p>Meetings appear only on the date selected in Leads CRM. All times are IST.</p>
     </div>
     <div className="aw-meeting-actions">
       <span className="aw-meeting-count">{report.total} scheduled</span>
       <button className="aw-meeting-refresh" type="button" disabled={loading}
         aria-label="Refresh today's meetings" onClick={()=>void refresh()}>
         <RefreshCw size={17} className={loading?"animate-spin":""}/>
       </button>
     </div>
   </header>
   <div className="aw-meeting-grid">
     {report.items.map(item=><article className="aw-meeting-card" key={item.id}>
       <div className="aw-meeting-card-top"><span>MEETING TODAY</span><CalendarClock size={19}/></div>
       <h3>{item.businessName}</h3>
       <p>{item.contactName||"Contact name not recorded"} · {item.assignee?.displayName||"Unassigned"}</p>
       {item.meetingAt&&<p className="aw-meeting-time">
         <time dateTime={item.meetingAt}>{displayTime(item.meetingAt)} IST</time>
       </p>}
       {item.stageNote?.trim()&&<p className="aw-meeting-note">{item.stageNote}</p>}
       <div className="aw-meeting-card-links">
         <Link href={"/app/leads?focus="+encodeURIComponent(item.id)} aria-label={"Open lead "+item.businessName}>
           Open lead <ArrowUpRight size={16}/>
         </Link>
         {item.phone&&<a href={phoneHref(item.phone)} aria-label={"Call "+item.businessName}>
           <PhoneCall size={16}/>Call
         </a>}
       </div>
     </article>)}
   </div>
   {report.hasMore&&<p className="aw-meeting-overflow">Showing 100 of {report.total} meetings scheduled today. See Leads CRM for all.</p>}
 </section>;
}