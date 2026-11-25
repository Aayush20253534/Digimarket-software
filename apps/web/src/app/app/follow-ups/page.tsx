"use client";

import Link from "next/link";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {CalendarClock,CalendarDays,ChevronLeft,ChevronRight,Search,RefreshCw,PhoneCall,Ellipsis,List} from "lucide-react";
import {agencyToday,leadStageSchema,type LeadTemperature} from "@digimarket/contracts";
import {SalesWorkspaceNav} from "@/components/sales-workspace-nav";
import {useAuth} from "@/components/auth-provider";
import {AWNotice} from "@/components/aw-ui";
import {DirectoryModal} from "@/components/directory-modal";

type Stage=typeof leadStageSchema.options[number];
type DateView="all"|"overdue"|"today"|"upcoming";
type FollowUp={id:string;nextFollowUpAt:string|null;phone:string|null;businessName:string;contactName:string|null;
 stageNote:string;temperature:LeadTemperature;version:number;canEdit?:boolean};
type LeadDetail=FollowUp&{status:Stage;meetingAt:string|null};
type Result={items:FollowUp[];nextCursor:string|null;total:number;today:string;summary:Record<DateView,number>;calendar:Record<string,number>;compatibilityMode?:boolean};
const temperatures:LeadTemperature[]=["UNCLASSIFIED","HOT","WARM","COLD"];
const labels:Record<LeadTemperature,string>={UNCLASSIFIED:"Unclassified",HOT:"Hot",WARM:"Warm",COLD:"Cold"};
const dateLabels:Record<DateView,string>={all:"Total",overdue:"Overdue",today:"Due today",upcoming:"Upcoming"};
const emptySummary={all:0,overdue:0,today:0,upcoming:0};
const dayMs=86400000;
const datePlus=(day:string,n:number)=>new Date(new Date(day+"T12:00:00Z").getTime()+n*dayMs).toISOString().slice(0,10);
const formatDay=(day:string)=>new Date(day.slice(0,10)+"T12:00:00Z").toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"});
const callHref=(phone:string)=>"tel:"+(phone.trim().startsWith("+")?"+":"")+phone.replace(/\D/g,"");
const dueStatus=(day:string,today:string):DateView=>day<today?"overdue":day===today?"today":"upcoming";
const dueLabel=(day:string,today:string)=>{
 const delta=Math.round((Date.parse(day)-Date.parse(today))/dayMs);
 return delta<0?(-delta)+" day"+(delta===-1?"":"s")+" overdue":delta===0?"Due today":delta===1?"Tomorrow":"In "+delta+" days";
};
function monthShift(month:string,n:number){const [y,m]=month.split("-").map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);}
function monthDays(month:string){const first=month+"-01",length=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return {offset:(new Date(first+"T12:00:00Z").getUTCDay()+6)%7,days:Array.from({length},(_,i)=>datePlus(first,i))};}
export default function FollowUpsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read");
 const isAdmin=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN");
 const canConvert=!!session?.identity.permissions.includes("leads.convert");
 const canEdit=!!session?.identity.permissions.some(p=>p==="leads.edit"||p==="leads.edit.own");
 const [rows,setRows]=useState<FollowUp[]>([]);
 const [cursor,setCursor]=useState<string|null>(null);
 const [history,setHistory]=useState<(string|null)[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [compatibilityMode,setCompatibilityMode]=useState(false);
 const [loaded,setLoaded]=useState(false);
 const [message,setMessage]=useState("");
 const [query,setQuery]=useState("");
 const [search,setSearch]=useState("");
 const [dateView,setDateView]=useState<DateView>("all");
 const [temperature,setTemperature]=useState<""|LeadTemperature>("");
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [today,setToday]=useState(agencyToday);
 const [summary,setSummary]=useState(emptySummary),[total,setTotal]=useState(0);
 const [view,setView]=useState<"list"|"calendar">("list");
 const [month,setMonth]=useState(()=>agencyToday().slice(0,7));
 const [calendar,setCalendar]=useState<Record<string,number>>({});
 const [selected,setSelected]=useState<LeadDetail|null>(null);
 const [opening,setOpening]=useState<string|null>(null);
 const [editStage,setEditStage]=useState<Stage>("FOLLOW_UP");
 const [editDate,setEditDate]=useState("");
 const [editNote,setEditNote]=useState("");
 const [editTemperature,setEditTemperature]=useState<LeadTemperature>("UNCLASSIFIED");
 const [meetingOn,setMeetingOn]=useState(""),[meetingTime,setMeetingTime]=useState("");
 const [saving,setSaving]=useState(false),[editError,setEditError]=useState("");
 const [confirmApproval,setConfirmApproval]=useState(false);
 const sequence=useRef(0);
 const resetPage=()=>{sequence.current++;setCursor(null);setHistory([]);setNextCursor(null);};
 useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(query.trim());setCursor(null);setHistory([]);},200);return()=>window.clearTimeout(timer);},[query]);
 const rangeInvalid=!!(from&&to&&from>to);
 const load=useCallback(async()=>{
   if(!canRead||rangeInvalid){setLoading(false);return;}
   const current=++sequence.current;
   setLoading(true);setError("");
   try{
     const q=new URLSearchParams({limit:"20"});
     if(dateView!=="all")q.set("view",dateView);
     if(cursor)q.set("cursor",cursor);
     if(search)q.set("q",search);
     if(temperature)q.set("temperature",temperature);
     if(from)q.set("from",from);if(to)q.set("to",to);
     if(view==="calendar")q.set("month",month);
     const data=await request<Result>("/leads/follow-ups?"+q);
     if(current!==sequence.current)return;
     if(!data.summary||!data.today)throw new Error("Follow-up API is not updated yet. Refresh after deployment.");
     setRows(data.items);setNextCursor(data.nextCursor);setTotal(data.total);
     setSummary(data.summary);setCalendar(data.calendar??{});setToday(data.today);setCompatibilityMode(!!data.compatibilityMode);setLoaded(true);
   }catch(e){
     if(current===sequence.current){setError(e instanceof Error?e.message:"Unable to load follow-ups.");setRows([]);setNextCursor(null);setTotal(0);setSummary(emptySummary);setCalendar({});setLoaded(false);}
   }finally{if(current===sequence.current)setLoading(false);}
 },[canRead,cursor,request,dateView,search,temperature,from,to,view,month,rangeInvalid]);
 useEffect(()=>{void load();return()=>{sequence.current++;};},[load]);
 useEffect(()=>{const refresh=()=>{if(agencyToday()!==today)void load();};const timer=window.setInterval(refresh,60_000);window.addEventListener("focus",refresh);return()=>{window.clearInterval(timer);window.removeEventListener("focus",refresh);};},[today,load]);
 const chooseDate=(key:DateView)=>{if(dateView===key&&!from&&!to)return;resetPage();setDateView(key);setFrom("");setTo("");};
 const clearFilters=()=>{if(!query&&!search&&!temperature&&!from&&!to&&dateView==="all")return;resetPage();setQuery("");setSearch("");setTemperature("");setFrom("");setTo("");setDateView("all");};
 const next=()=>{if(loading||!nextCursor)return;setHistory(v=>[...v,cursor]);setCursor(nextCursor);};
 const previous=()=>{if(loading||!history.length)return;setCursor(history[history.length-1]);setHistory(v=>v.slice(0,-1));};
 async function openEdit(row:FollowUp){
   if(opening||saving)return;
   setOpening(row.id);setError("");setEditError("");
   try{
     const detail=await request<LeadDetail>("/leads/"+row.id);
     if(detail.status!=="FOLLOW_UP"||!detail.nextFollowUpAt){setError("This lead is no longer scheduled. The register has been refreshed.");await load();return;}
     if(!detail.canEdit||isAdmin){setError("You do not have permission to edit this follow-up.");return;}
     setSelected(detail);setEditStage("FOLLOW_UP");setEditDate(detail.nextFollowUpAt.slice(0,10));
     setEditNote(detail.stageNote??"");setEditTemperature(detail.temperature??"UNCLASSIFIED");
     setMeetingOn("");setMeetingTime("");setConfirmApproval(false);
   }catch(e){setError(e instanceof Error?e.message:"Unable to open follow-up.");}finally{setOpening(null);}
 }
 async function save(event:FormEvent){
   event.preventDefault();if(!selected||saving)return;
   if(editStage==="APPROVED"&&(!canConvert||!confirmApproval)){setEditError("Confirm client conversion before saving.");return;}
   setSaving(true);setEditError("");
   try{
     await request("/leads/"+selected.id,{method:"PUT",body:{version:selected.version,status:editStage,
       ...(editStage==="FOLLOW_UP"?{followUpOn:editDate}:{}),
       ...(editStage==="MEETING_PROCESS"?{meetingOn,meetingTime}:{}),
       ...(editNote!==(selected.stageNote??"")?{stageNote:editNote}:{}),
       ...(editTemperature!==(selected.temperature??"UNCLASSIFIED")?{temperature:editTemperature}:{})}});
     setSelected(null);setMessage(editStage==="FOLLOW_UP"?"Follow-up updated.":"Lead stage updated. Removed from scheduled follow-ups.");
     if(cursor){resetPage();}else await load();
   }catch(e){setEditError(e instanceof Error?e.message:"Unable to save follow-up.");}finally{setSaving(false);}
 }
 const monthData=monthDays(month);
 if(!session)return <div role="status" className="aw-followups-loading">Checking follow-up access…</div>;
 return <div data-testid="follow-ups-page" className="aw-followups-page aw-followups-v2">
   <SalesWorkspaceNav/>
   <header className="aw-followups-header">
     <div><p className="aw-eyebrow">LEADS CRM / SCHEDULE</p>
       <h1 className="aw-followups-title"><CalendarClock size={25} aria-hidden="true"/>Follow Ups</h1>
       <p className="aw-followups-description">All acquisition cycles · Scheduled by due date, then lead temperature.</p></div>
     <button type="button" className="aw-followups-refresh" onClick={()=>void load()} disabled={loading||!canRead} aria-label="Refresh follow-ups"><RefreshCw size={16} className={loading?"animate-spin":""} aria-hidden="true"/>Refresh</button>
   </header>
   {!canRead&&<AWNotice tone="error">You do not have permission to view leads.</AWNotice>}
   {canRead&&<>
    <section className="aw-followup-metrics" aria-label="Follow-up status across all cycles">
     {(["all","overdue","today","upcoming"] as const).map(key=><button type="button" className="aw-followup-metric" data-bucket={key} key={key} aria-pressed={dateView===key&&!from&&!to} onClick={()=>chooseDate(key)}><span>{dateLabels[key]}</span><strong>{loading?"…":loaded?summary[key]:"—"}</strong></button>)}
    </section>
    <div className="aw-followup-tools">
     <div className="aw-followup-tool-row">
       <label className="aw-followup-search"><Search size={17} aria-hidden="true"/><input aria-label="Search follow-ups" maxLength={100} value={query} placeholder="Find business, contact or phone" onChange={e=>setQuery(e.target.value)}/></label>
       <select className="field" aria-label="Follow-up temperature" value={temperature} onChange={e=>{resetPage();setTemperature(e.target.value as ""|LeadTemperature);}}><option value="">All temperatures</option>{temperatures.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select>
       <div className="aw-followup-view" role="group" aria-label="Follow-up view"><button type="button" className="btn-secondary" aria-pressed={view==="list"} onClick={()=>setView("list")}><List size={16}/>List</button><button type="button" className="btn-secondary" aria-pressed={view==="calendar"} onClick={()=>setView("calendar")}><CalendarDays size={16}/>Calendar</button></div>
     </div>
     <div className="aw-followup-tool-row">
       <div role="group" aria-label="Follow-up date filter" className="aw-v3-chip-row">{(["all","overdue","today","upcoming"] as const).map(key=><button type="button" key={key} aria-pressed={dateView===key&&!from&&!to} onClick={()=>chooseDate(key)}>{key==="all"?"All":key==="today"?"Today":dateLabels[key]}</button>)}</div>
       <label className="aw-followup-date">From <input className="field" type="date" aria-label="Follow-ups from" value={from} onChange={e=>{resetPage();setFrom(e.target.value);setDateView("all");}}/></label>
       <label className="aw-followup-date">To <input className="field" type="date" aria-label="Follow-ups to" value={to} onChange={e=>{resetPage();setTo(e.target.value);setDateView("all");}}/></label>
       <button type="button" className="btn-secondary" onClick={clearFilters}>Clear filters</button>
     </div>
    </div>
    {rangeInvalid&&<AWNotice tone="error">End date must be on or after start date.</AWNotice>}
    {error&&<AWNotice tone="error">{error}</AWNotice>}
    {compatibilityMode&&loaded&&<p className="aw-followup-hint">Compatibility mode · Full schedule loaded from the existing Leads API while the backend updates.</p>}
    {message&&<AWNotice tone="success">{message}</AWNotice>}
    {view==="calendar"&&<section className="aw-followup-calendar" aria-label="Follow-up calendar">
      <div className="aw-followup-calendar-head"><button type="button" className="btn-secondary" aria-label="Previous month" onClick={()=>setMonth(m=>monthShift(m,-1))}><ChevronLeft size={17}/></button>
      <strong>{new Date(month+"-01T12:00:00Z").toLocaleDateString("en-IN",{month:"long",year:"numeric",timeZone:"UTC"})}</strong><button type="button" className="btn-secondary" aria-label="Next month" onClick={()=>setMonth(m=>monthShift(m,1))}><ChevronRight size={17}/></button></div>
      <div className="aw-followup-calendar-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=><span key={x} className="aw-followup-weekday">{x}</span>)}
      {Array.from({length:monthData.offset},(_,i)=><span key={"blank"+i}/>)}
      {monthData.days.map(day=><button type="button" key={day} className="aw-followup-day" aria-label={formatDay(day)+": "+(calendar[day]??0)+" follow-ups"} aria-current={day===today?"date":undefined} aria-pressed={from===day&&to===day} disabled={loading||rangeInvalid} onClick={()=>{if(from===day&&to===day&&dateView==="all")return;resetPage();setFrom(day);setTo(day);setDateView("all");}}><span>{Number(day.slice(8))}</span>{(calendar[day]??0)>0&&<small data-bucket={dueStatus(day,today)}>{calendar[day]}</small>}</button>)}</div>
      <p className="aw-followup-hint">Select a day to filter the register below. Calendar counts include all scheduled dates in this month, matching search and temperature.</p>
    </section>}
    <section className="aw-followups-register" aria-label="Scheduled follow-ups">
     <div className="aw-followup-register-head"><strong>Follow-up register</strong><span>{loading?"Loading…":loaded?total+" matching follow-ups · Oldest due first":"Schedule unavailable"}</span></div>
     {loading&&<p className="aw-followups-loading" role="status">Loading scheduled follow-ups…</p>}
     <div className="aw-followups-scroll"><table className="aw-followups-table" aria-label="Follow-up register" aria-busy={loading}><thead><tr>
       <th scope="col">Follow-up date</th><th scope="col">Call</th><th scope="col">Business name</th><th scope="col">Contact name</th><th scope="col">Short notes</th><th scope="col">Action</th>
     </tr></thead><tbody>{!rangeInvalid&&rows.map(lead=>{
       const day=lead.nextFollowUpAt?.slice(0,10)??today,temp=lead.temperature??"UNCLASSIFIED";
       return <tr key={lead.id}><td><time dateTime={day}>{formatDay(day)}</time><small className="aw-followup-due" data-bucket={dueStatus(day,today)}>{dueLabel(day,today)}</small></td>
       <td>{lead.phone?<a className="aw-followup-icon" href={callHref(lead.phone)} aria-label={"Call "+lead.phone} title={lead.phone}><PhoneCall size={17} aria-hidden="true"/></a>:"—"}</td>
       <td><Link className="aw-followups-business" aria-label={lead.businessName} href={"/app/leads?focus="+encodeURIComponent(lead.id)}><span className="aw-followup-temp" data-temperature={temp} role="img" aria-label={"Lead temperature: "+labels[temp]} title={labels[temp]}/>{lead.businessName}</Link></td>
       <td>{lead.contactName||"Not recorded"}</td><td className="aw-followup-note" title={lead.stageNote||undefined}>{lead.stageNote||"No notes yet"}</td>
       <td>{(lead.canEdit??canEdit)&&!isAdmin?<button type="button" className="aw-followup-icon" aria-label={"Actions for "+lead.businessName} disabled={!!opening||loading} onClick={()=>void openEdit(lead)}><Ellipsis size={19}/></button>:<Link className="aw-followup-icon" aria-label={"Open lead "+lead.businessName} href={"/app/leads?focus="+encodeURIComponent(lead.id)}><ChevronRight size={17}/></Link>}</td></tr>;
     })}</tbody></table></div>
     {!loading&&!error&&!rangeInvalid&&rows.length===0&&<p className="aw-followups-empty">No scheduled follow-ups match these filters.</p>}
     <nav className="aw-followups-pagination" aria-label="Follow-up pages"><button type="button" onClick={previous} disabled={loading||!history.length}><ChevronLeft size={16}/>Previous</button><span>Page {history.length+1} · {rows.length} of {total}</span><button type="button" onClick={next} disabled={loading||!nextCursor}>Next<ChevronRight size={16}/></button></nav>
    </section>
   </>}
   {selected&&<DirectoryModal title="Update follow-up" description={selected.businessName+" · Changes update the original CRM lead."} onClose={()=>{if(!saving)setSelected(null);}}>
     <form className="aw-followup-editor space-y-3" onSubmit={save}>
       {editError&&<AWNotice tone="error">{editError}</AWNotice>}
       <label className="block">Lead stage<select className="field" value={editStage} onChange={e=>{setEditStage(e.target.value as Stage);setConfirmApproval(false);}}>{leadStageSchema.options.filter(x=>x!=="EXPIRED"&&(x!=="APPROVED"||canConvert)).map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
       {editStage==="FOLLOW_UP"&&<><div className="aw-followup-presets">{[["Tomorrow",1],["After 3 days",3],["Next week",7]].map(([label,days])=><button key={label} type="button" className="btn-secondary" aria-pressed={editDate===datePlus(today,Number(days))} onClick={()=>setEditDate(datePlus(today,Number(days)))}>{label}</button>)}</div>
         <label className="block">Follow-up date<input className="field" type="date" required value={editDate} onChange={e=>setEditDate(e.target.value)}/></label></>}
       {editStage==="MEETING_PROCESS"&&<div className="aw-followup-tool-row"><label>Meeting date<input className="field" type="date" required value={meetingOn} onChange={e=>setMeetingOn(e.target.value)}/></label><label>Meeting time (IST)<input className="field" type="time" required value={meetingTime} onChange={e=>setMeetingTime(e.target.value)}/></label></div>}
       {editStage==="APPROVED"&&<label className="flex items-center gap-2"><input type="checkbox" required checked={confirmApproval} onChange={e=>setConfirmApproval(e.target.checked)}/>Confirm creation of the linked client record</label>}
       <label className="block">Lead temperature<select className="field" value={editTemperature} onChange={e=>setEditTemperature(e.target.value as LeadTemperature)}>{temperatures.map(x=><option key={x} value={x}>{labels[x]}</option>)}</select></label>
       <label className="block">Short notes<textarea className="field" rows={3} maxLength={2000} value={editNote} onChange={e=>setEditNote(e.target.value)}/></label>
       <div className="aw-followup-tool-row"><button className="btn-primary" type="submit" disabled={saving}>{saving?"Saving…":"Save follow-up"}</button><Link className="btn-secondary" href={"/app/leads?focus="+encodeURIComponent(selected.id)}>Open lead details</Link><button type="button" className="btn-secondary" disabled={saving} onClick={()=>setSelected(null)}>Cancel</button></div>
     </form>
   </DirectoryModal>}
 </div>;
}
