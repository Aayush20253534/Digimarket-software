"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,MapPin,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {AWNotice} from "@/components/aw-ui";

type ScheduledMeeting={
 id:string;meetingAt:string;businessName:string;contactName:string|null;
 phone:string|null;location:string|null;googleMapsUrl:string|null;
};
type MeetingsPage={items:ScheduledMeeting[];nextCursor:string|null;total:number};
const PAGE_SIZE=20;
const dateText=(iso:string)=>new Date(iso).toLocaleDateString("en-IN",{
 timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric",
});
const timeText=(iso:string)=>new Date(iso).toLocaleTimeString("en-IN",{
 timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true,
});
const phoneHref=(value:string)=>"tel:"+(value.trim().startsWith("+")?"+":"")+value.replace(/\D/g,"");

export default function MeetingsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read");
 const [rows,setRows]=useState<ScheduledMeeting[]>([]);
 const [cursor,setCursor]=useState<string|null>(null);
 const [history,setHistory]=useState<(string|null)[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [total,setTotal]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const sequence=useRef(0);

 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   const active=++sequence.current;
   setLoading(true);setError("");
   try{
     const params=new URLSearchParams({limit:String(PAGE_SIZE)});
     if(cursor)params.set("cursor",cursor);
     const page=await request<MeetingsPage>("/leads/meetings?"+params.toString());
     if(active!==sequence.current)return;
     setRows(page.items);setNextCursor(page.nextCursor);setTotal(page.total);
   }catch(e){
     if(active===sequence.current){
       setRows([]);setTotal(null);setNextCursor(null);
       setError(e instanceof Error?e.message:"Unable to load meeting schedule.");
     }
   }finally{if(active===sequence.current)setLoading(false);}
 },[canRead,cursor,request]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);

 const pageNumber=history.length+1;
 const pageCount=Math.max(1,Math.ceil((total??0)/PAGE_SIZE));
 const first=total===0?0:(pageNumber-1)*PAGE_SIZE+1;
 const last=total===null?0:Math.min((pageNumber-1)*PAGE_SIZE+rows.length,total);
 const previous=()=>{
   if(loading||history.length===0)return;
   setCursor(history[history.length-1]);
   setHistory(h=>h.slice(0,-1));
 };
 const next=()=>{
   if(loading||!nextCursor)return;
   setHistory(h=>[...h,cursor]);setCursor(nextCursor);
 };
 if(!session)return <p role="status" className="aw-meetings-loading">Checking meeting access…</p>;
 return <div className="aw-meetings-page" data-testid="meetings-page">
   <header className="aw-meetings-header">
     <div>
       <p className="aw-eyebrow">LEADS CRM / SCHEDULE</p>
       <h1 className="aw-meetings-title"><CalendarDays size={26} aria-hidden="true"/>Meetings</h1>
       <p className="aw-meetings-description">Scheduled meetings, ordered by date and time. Times are shown in IST.</p>
     </div>
     <button type="button" className="aw-meetings-refresh" aria-label="Refresh meetings"
       disabled={loading||!canRead} onClick={()=>void load()}>
       <RefreshCw size={16} className={loading?"animate-spin":""} aria-hidden="true"/>Refresh
     </button>
   </header>
   {!canRead&&<AWNotice tone="error">You do not have permission to view leads.</AWNotice>}
   {canRead&&<section className="aw-meetings-register" aria-label="Scheduled meetings">
     {error&&<div className="aw-meetings-error"><AWNotice tone="error">{error}</AWNotice></div>}
     {loading&&<p className="aw-meetings-loading" role="status">Loading scheduled meetings…</p>}
     <div className="aw-meetings-scroll">
       <table className="aw-meetings-table" aria-label="Meetings register" aria-busy={loading}>
         <thead><tr>
           <th scope="col">Meeting date</th>
           <th scope="col">Meeting time</th>
           <th scope="col">Business name</th>
           <th scope="col">Contact name</th>
           <th scope="col">Phone number</th>
           <th scope="col">Address</th>
         </tr></thead>
         <tbody>{rows.map(meeting=><tr key={meeting.id}>
           <td><time dateTime={meeting.meetingAt}>{dateText(meeting.meetingAt)}</time></td>
           <td><time dateTime={meeting.meetingAt}>{timeText(meeting.meetingAt)}</time></td>
           <td><Link className="aw-meetings-business" href={"/app/leads?focus="+encodeURIComponent(meeting.id)}>
             {meeting.businessName}</Link></td>
           <td>{meeting.contactName||"Not recorded"}</td>
           <td>{meeting.phone?<a className="aw-meetings-number" href={phoneHref(meeting.phone)}>{meeting.phone}</a>:"Not recorded"}</td>
           <td><div className="aw-meetings-location">
             <span>{meeting.location||"Not recorded"}</span>
             {meeting.googleMapsUrl&&<a href={meeting.googleMapsUrl} target="_blank" rel="noopener noreferrer"
               className="aw-meetings-map" aria-label={"Open Google Maps for "+meeting.businessName}>
               <MapPin size={14} aria-hidden="true"/>View map</a>}
           </div></td>
         </tr>)}</tbody>
       </table>
     </div>
     {!loading&&!error&&rows.length===0&&
       <p className="aw-meetings-empty">No meetings are currently scheduled. Set a meeting date and time in Leads CRM.</p>}
     <nav className="aw-meetings-pagination" aria-label="Meetings pages">
       <button type="button" onClick={previous} disabled={loading||history.length===0}>
         <ChevronLeft size={16}/>Previous
       </button>
       <span aria-live="polite">{loading?"Loading page…":total===null?"Count unavailable":
         `Page ${pageNumber} of ${pageCount} · Meetings ${first}–${last} of ${total}`}</span>
       <button type="button" onClick={next} disabled={loading||!nextCursor}>
         Next<ChevronRight size={16}/>
       </button>
     </nav>
   </section>}
 </div>;
}
