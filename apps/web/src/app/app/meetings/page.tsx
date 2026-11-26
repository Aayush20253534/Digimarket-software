"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState,type FormEvent} from "react";
import {CalendarDays,ChevronLeft,ChevronRight,MapPin,RefreshCw,Search,PhoneCall,Ellipsis,List,History,Video,CalendarPlus} from "lucide-react";
import {agencyToday,meetingTypeSchema,meetingOutcomeSchema,type LeadTemperature} from "@digimarket/contracts";
import {SalesWorkspaceNav} from "@/components/sales-workspace-nav";
import {useAuth} from "@/components/auth-provider";
import {AWNotice} from "@/components/aw-ui";
import {DirectoryModal} from "@/components/directory-modal";

type Kind=typeof meetingTypeSchema.options[number];
type Outcome=typeof meetingOutcomeSchema.options[number];
type Bucket="all"|"overdue"|"today"|"upcoming";
type Meeting={id:string;meetingAt:string;businessName:string;contactName:string|null;phone:string|null;location:string|null;googleMapsUrl:string|null;stageNote:string;temperature:LeadTemperature;version:number;canEdit:boolean;meetingType:Kind;meetingJoinUrl:string|null;meetingDurationMinutes:number};
type Detail=Meeting&{status:string};
type EventRow={id:string;leadId:string;createdAt:string;note:string|null;metadata:{scheduledAt:string;meetingOutcome:string;meetingType?:Kind;toStatus:string;nextMeetingAt?:string|null};lead:{businessName:string;contactName:string|null;status:string}};
type Result={items:Meeting[];total:number;nextCursor:string|null;today:string;now:string;summary:Record<Bucket,number>;calendar:Record<string,number>};
type HistoryResult={items:EventRow[];total:number;nextCursor:string|null};
const temps:LeadTemperature[]=["UNCLASSIFIED","HOT","WARM","COLD"];
const tempLabels:Record<LeadTemperature,string>={UNCLASSIFIED:"Unclassified",HOT:"Hot",WARM:"Warm",COLD:"Cold"};
const kindLabels:Record<Kind,string>={UNSPECIFIED:"Not specified",PHYSICAL:"Physical meeting",GOOGLE_MEET:"Google Meet",PHONE:"Phone call"};
const outcomeLabels:Record<Outcome,string>={RESCHEDULED:"Reschedule meeting",NO_SHOW:"Client did not attend",DECISION_PENDING:"Decision pending",AGREEMENT_PENDING:"Agreement pending",FOLLOW_UP:"Further follow-up",APPROVED:"Approved",REJECTED:"Rejected"};
const bucketLabels:Record<Bucket,string>={all:"Total",overdue:"Outcome overdue",today:"Remaining today",upcoming:"Upcoming"};
const dayMs=86400000;
const datePlus=(day:string,n:number)=>new Date(new Date(day+"T12:00:00Z").getTime()+n*dayMs).toISOString().slice(0,10);
const dateText=(iso:string)=>new Date(iso).toLocaleDateString("en-IN",{timeZone:"Asia/Kolkata",day:"2-digit",month:"short",year:"numeric"});
const timeText=(iso:string)=>new Date(iso).toLocaleTimeString("en-IN",{timeZone:"Asia/Kolkata",hour:"numeric",minute:"2-digit",hour12:true});
const local=(iso:string)=>new Date(Date.parse(iso)+330*60000).toISOString();
const callHref=(phone:string)=>"tel:"+(phone.trim().startsWith("+")?"+":"")+phone.replace(/\D/g,"");
const monthShift=(month:string,n:number)=>new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7))-1+n,1)).toISOString().slice(0,7);
function monthDays(month:string){const first=month+"-01",length=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return {offset:(new Date(first+"T12:00:00Z").getUTCDay()+6)%7,days:Array.from({length},(_,i)=>datePlus(first,i))};}
const bucketOf=(iso:string,now:string,today:string):Bucket=>Date.parse(iso)<Date.parse(now)?"overdue":local(iso).slice(0,10)===today?"today":"upcoming";
function calendarHref(m:Meeting){
 const compact=(ms:number)=>new Date(ms).toISOString().replace(/[-:]/g,"").replace(/\.\d{3}/,"");
 const start=Date.parse(m.meetingAt);
 return "https://calendar.google.com/calendar/render?"+new URLSearchParams({action:"TEMPLATE",text:"Meeting: "+m.businessName,dates:compact(start)+"/"+compact(start+(m.meetingDurationMinutes??60)*60000),ctz:"Asia/Kolkata",location:m.meetingJoinUrl||m.location||""});
}
export default function MeetingsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read"),canConvert=!!session?.identity.permissions.includes("leads.convert");
 const isAdmin=!!session?.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN");
 const [rows,setRows]=useState<Meeting[]>([]),[events,setEvents]=useState<EventRow[]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[pages,setPages]=useState<(string|null)[]>([]),[nextCursor,setNextCursor]=useState<string|null>(null);
 const [total,setTotal]=useState<number|null>(null),[summary,setSummary]=useState<Record<Bucket,number>|null>(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [query,setQuery]=useState(""),[search,setSearch]=useState("");
 const [bucket,setBucket]=useState<Bucket>("all"),[temperature,setTemperature]=useState<""|LeadTemperature>(""),[kind,setKind]=useState<""|Kind>("");
 const [from,setFrom]=useState(""),[to,setTo]=useState("");
 const [mode,setMode]=useState<"list"|"calendar"|"history">("list"),[month,setMonth]=useState(()=>agencyToday().slice(0,7));
 const [calendar,setCalendar]=useState<Record<string,number>>({}),[today,setToday]=useState(agencyToday),[now,setNow]=useState(()=>new Date().toISOString());
 const [selected,setSelected]=useState<Detail|null>(null),[opening,setOpening]=useState(false),[saving,setSaving]=useState(false),[editError,setEditError]=useState("");
 const [outcome,setOutcome]=useState<""|Outcome>(""),[editOn,setEditOn]=useState(""),[editTime,setEditTime]=useState(""),[followOn,setFollowOn]=useState("");
 const [editKind,setEditKind]=useState<Kind>("UNSPECIFIED"),[join,setJoin]=useState(""),[duration,setDuration]=useState(60);
 const [note,setNote]=useState(""),[editTemp,setEditTemp]=useState<LeadTemperature>("UNCLASSIFIED"),[approval,setApproval]=useState(false);
 const [conflict,setConflict]=useState(0),[allowConflict,setAllowConflict]=useState(false);
 const sequence=useRef(0);
 const reset=()=>{setCursor(null);setPages([]);setNextCursor(null);};
 const rangeInvalid=!!(from&&to&&from>to);
 useEffect(()=>{const timer=window.setTimeout(()=>{setSearch(query.trim());setCursor(null);setPages([]);},200);return()=>window.clearTimeout(timer);},[query]);
 const load=useCallback(async(force=true)=>{
   if(!canRead||rangeInvalid){setLoading(false);return;}
   const seq=++sequence.current;setLoading(true);setError("");
   try{
     const q=new URLSearchParams({limit:"20"});if(cursor)q.set("cursor",cursor);if(search)q.set("q",search);if(from)q.set("from",from);if(to)q.set("to",to);
     if(mode==="history"){
       const data=await request<HistoryResult>("/leads/meetings/history?"+q,{cache:force?"reload":"prefer"});
       if(seq!==sequence.current)return;
       setEvents(data.items);setTotal(data.total);setNextCursor(data.nextCursor);
     }else{
       if(bucket!=="all")q.set("view",bucket);if(temperature)q.set("temperature",temperature);if(kind)q.set("type",kind);if(mode==="calendar")q.set("month",month);
       const data=await request<Result>("/leads/meetings?"+q,{cache:force?"reload":"prefer"});
       if(seq!==sequence.current)return;
       if(!data.summary||!data.now)throw Error("Meeting API update is not deployed yet. Refresh after the backend deployment.");
       setRows(data.items);setSummary(data.summary);setTotal(data.total);setNextCursor(data.nextCursor);setToday(data.today);setNow(data.now);setCalendar(data.calendar??{});
     }
   }catch(e){if(seq===sequence.current){setError(e instanceof Error?e.message:"Unable to load meetings.");setRows([]);setEvents([]);setSummary(null);setTotal(null);setNextCursor(null);setCalendar({});}}
   finally{if(seq===sequence.current)setLoading(false);}
 },[canRead,rangeInvalid,cursor,search,from,to,mode,bucket,temperature,kind,month,request]);
 useEffect(()=>{void load(false);return()=>{sequence.current++;};},[load]);
 useEffect(()=>{if(mode==="history")return;const refresh=()=>{if(!document.hidden)void load();};const timer=window.setInterval(refresh,60000);return()=>window.clearInterval(timer);},[load,mode]);
 const choose=(key:Bucket)=>{reset();setBucket(key);setFrom("");setTo("");};
 const chooseMode=(value:typeof mode)=>{if(mode===value)return;reset();setMode(value);setFrom("");setTo("");setBucket("all");setTemperature("");setKind("");};
 const clear=()=>{reset();setQuery("");setSearch("");setBucket("all");setTemperature("");setKind("");setFrom("");setTo("");};
 useEffect(()=>{setConflict(0);setAllowConflict(false);},[editOn,editTime,duration,outcome]);
 async function open(row:Meeting){
   if(opening||saving)return;setOpening(true);setEditError("");setError("");
   try{const d=await request<Detail>("/leads/"+row.id);if(d.status!=="MEETING_PROCESS"||!d.meetingAt){setError("This meeting is no longer scheduled.");await load();return;}
     if(!d.canEdit||isAdmin){setError("You do not have permission to edit this meeting.");return;}
     setSelected(d);setOutcome("");setEditOn(local(d.meetingAt).slice(0,10));setEditTime(local(d.meetingAt).slice(11,16));setFollowOn(datePlus(today,1));
     setEditKind(d.meetingType??"UNSPECIFIED");setJoin(d.meetingJoinUrl??"");setDuration(d.meetingDurationMinutes??60);setNote(d.stageNote??"");setEditTemp(d.temperature??"UNCLASSIFIED");setApproval(false);setConflict(0);setAllowConflict(false);
   }catch(e){setError(e instanceof Error?e.message:"Unable to open meeting.");}finally{setOpening(false);}
 }
 async function save(e:FormEvent){
   e.preventDefault();if(!selected||saving)return;setSaving(true);setEditError("");
   try{
     const status=outcome==="RESCHEDULED"||!outcome?"MEETING_PROCESS":outcome==="NO_SHOW"?"FOLLOW_UP":outcome;
     if(status==="APPROVED"&&(!canConvert||!approval))throw Error("Confirm client conversion before saving.");
     if(status==="MEETING_PROCESS"){
       const scheduleChanged=editOn!==local(selected.meetingAt).slice(0,10)||editTime!==local(selected.meetingAt).slice(11,16)||duration!==(selected.meetingDurationMinutes??60);
       if(scheduleChanged&&!allowConflict){
         const result=await request<{count:number}>("/leads/meetings/conflicts?"+new URLSearchParams({id:selected.id,on:editOn,time:editTime,duration:String(duration)}));
         if(result.count){setConflict(result.count);return;}
       }
     }
     await request("/leads/"+selected.id,{method:"PUT",body:{version:selected.version,status,
       ...(outcome?{meetingOutcome:outcome}:{}),
       ...(status==="MEETING_PROCESS"?{meetingOn:editOn,meetingTime:editTime,meetingType:editKind,meetingJoinUrl:editKind==="GOOGLE_MEET"?join:"",meetingDurationMinutes:duration}:{}),
       ...(status==="FOLLOW_UP"?{followUpOn:followOn}:{}),
       stageNote:note,temperature:editTemp}});
     setSelected(null);setMessage(status==="MEETING_PROCESS"?"Meeting updated.":"Meeting outcome saved to CRM and history.");
     if(cursor)reset();else await load();
   }catch(e){setEditError(e instanceof Error?e.message:"Unable to save meeting.");}finally{setSaving(false);}
 }
 const monthData=monthDays(month),active=mode!=="history";
 if(!session)return <p role="status" className="aw-meetings-loading">Checking meeting access…</p>;
 return <div className="aw-meetings-page aw-followups-v2 aw-meetings-v2" data-testid="meetings-page">
   <SalesWorkspaceNav/>
   <header className="aw-meetings-header"><div><p className="aw-eyebrow">LEADS CRM / SCHEDULE</p><h1 className="aw-meetings-title"><CalendarDays size={26}/>Meetings</h1><p className="aw-meetings-description">All acquisition cycles · Schedule and record outcomes · Indian Standard Time</p></div><button type="button" className="aw-meetings-refresh" aria-label="Refresh meetings" onClick={()=>void load()} disabled={loading||!canRead}><RefreshCw size={16}/>Refresh</button></header>
   {!canRead?<AWNotice tone="error">You do not have permission to view leads.</AWNotice>:<>
   {active&&<section className="aw-followup-metrics" aria-label="Meeting status across all cycles">{(["all","overdue","today","upcoming"] as const).map(key=><button type="button" key={key} className="aw-followup-metric" data-bucket={key} aria-pressed={bucket===key&&!from&&!to} onClick={()=>choose(key)}><span>{bucketLabels[key]}</span><strong>{loading?"…":summary?.[key]??"—"}</strong></button>)}</section>}
   <div className="aw-followup-tools">
     <div className="aw-followup-tool-row"><label className="aw-followup-search"><Search size={17}/><input aria-label="Search meetings" placeholder="Search business, contact, phone or location" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></label>
       {active&&<><select className="field" aria-label="Meeting temperature" value={temperature} onChange={e=>{reset();setTemperature(e.target.value as ""|LeadTemperature);}}><option value="">All temperatures</option>{temps.map(t=><option key={t} value={t}>{tempLabels[t]}</option>)}</select>
       <select className="field" aria-label="Meeting type filter" value={kind} onChange={e=>{reset();setKind(e.target.value as ""|Kind);}}><option value="">All meeting types</option>{meetingTypeSchema.options.map(t=><option key={t} value={t}>{kindLabels[t]}</option>)}</select></>}
       <div className="aw-followup-view" role="group" aria-label="Meeting view">{(["list","calendar","history"] as const).map(m=>{const Icon=m==="list"?List:m==="calendar"?CalendarDays:History;return <button key={m} className="btn-secondary" type="button" aria-pressed={mode===m} onClick={()=>chooseMode(m)}><Icon size={16}/>{m[0].toUpperCase()+m.slice(1)}</button>;})}</div>
     </div>
     <div className="aw-followup-tool-row">
       {active&&<div role="group" aria-label="Meeting date filter" className="aw-v3-chip-row">{(["all","overdue","today","upcoming"] as const).map(key=><button type="button" key={key} aria-pressed={bucket===key&&!from&&!to} onClick={()=>choose(key)}>{key==="all"?"All":key==="today"?"Today":key==="overdue"?"Overdue":"Upcoming"}</button>)}</div>}
       <label className="aw-followup-date">{active?"From":"Recorded from"} <input type="date" className="field" aria-label="Meetings from" value={from} onChange={e=>{reset();setFrom(e.target.value);setBucket("all");}}/></label>
       <label className="aw-followup-date">To <input type="date" className="field" aria-label="Meetings to" value={to} onChange={e=>{reset();setTo(e.target.value);setBucket("all");}}/></label>
       <button type="button" className="btn-secondary" onClick={clear}>Clear filters</button>
     </div>
   </div>
   {rangeInvalid&&<AWNotice tone="error">End date must be on or after start date.</AWNotice>}
   {error&&<AWNotice tone="error">{error}</AWNotice>}{message&&<AWNotice tone="success">{message}</AWNotice>}
   {mode==="calendar"&&<section className="aw-followup-calendar" aria-label="Meeting calendar">
     <div className="aw-followup-calendar-head"><button className="btn-secondary" aria-label="Previous month" onClick={()=>setMonth(v=>monthShift(v,-1))}><ChevronLeft size={17}/></button><strong>{new Date(month+"-01T12:00:00Z").toLocaleDateString("en-IN",{month:"long",year:"numeric",timeZone:"UTC"})}</strong><button className="btn-secondary" aria-label="Next month" onClick={()=>setMonth(v=>monthShift(v,1))}><ChevronRight size={17}/></button></div>
     <div className="aw-followup-calendar-grid">{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=><span className="aw-followup-weekday" key={x}>{x}</span>)}{Array.from({length:monthData.offset},(_,n)=><span key={"empty"+n}/>)}{monthData.days.map(day=><button type="button" key={day} className="aw-followup-day" aria-current={day===today?"date":undefined} aria-pressed={from===day&&to===day} aria-label={day+": "+(calendar[day]??0)+" meetings"} onClick={()=>{reset();setFrom(day);setTo(day);setBucket("all");}}><span>{Number(day.slice(8))}</span>{!!calendar[day]&&<small>{calendar[day]}</small>}</button>)}</div><p className="aw-followup-hint">Select a day to filter meetings. Counts include all dates in this month matching search, type and temperature.</p>
   </section>}
   <section className="aw-meetings-register" aria-label={active?"Scheduled meetings":"Meeting history"}>
     <div className="aw-followup-register-head"><strong>{active?"Meeting register":"Meeting history"}</strong><span>{loading?"Loading…":total===null?"Schedule unavailable":total+" matching "+(active?"meetings":"events")}</span></div>
     {!active&&<p className="aw-followup-hint aw-meetings-history-hint">Recorded outcomes and reschedules are retained here. Older meetings without recorded outcomes are not reconstructed.</p>}
     <div className="aw-meetings-scroll">{active?<table className="aw-meetings-table" aria-label="Meetings register" aria-busy={loading}><thead><tr>{["Date & time","Call","Business name","Contact name","Map / join","Short notes","Action"].map(t=><th scope="col" key={t}>{t}</th>)}</tr></thead><tbody>{!rangeInvalid&&rows.map(m=>{
       const temp=m.temperature??"UNCLASSIFIED",type=m.meetingType??"UNSPECIFIED",b=bucketOf(m.meetingAt,now,today);
       return <tr key={m.id}><td><time dateTime={m.meetingAt}>{dateText(m.meetingAt)}</time><time className="aw-meeting-time" dateTime={m.meetingAt}>{timeText(m.meetingAt)} IST</time><small className="aw-followup-due" data-bucket={b}>{b==="overdue"?"Outcome overdue":b==="today"?"Today":"Upcoming"}</small></td>
       <td>{m.phone?<a className="aw-followup-icon" href={callHref(m.phone)} aria-label={"Call "+m.phone} title={m.phone}><PhoneCall size={16}/></a>:"—"}</td>
       <td><Link className="aw-meetings-business aw-meeting-business" aria-label={m.businessName} href={"/app/leads?focus="+encodeURIComponent(m.id)}><span className="aw-followup-temp" data-temperature={temp} role="img" aria-label={"Lead temperature: "+tempLabels[temp]} title={tempLabels[temp]}/>{m.businessName}</Link><small className="aw-meeting-type">{kindLabels[type]} · {m.meetingDurationMinutes??60} min</small></td>
       <td>{m.contactName||"Not recorded"}</td><td><div className="aw-meeting-actions">{m.googleMapsUrl&&<a className="aw-followup-icon" href={m.googleMapsUrl} target="_blank" rel="noopener noreferrer" aria-label={"Open Google Maps for "+m.businessName} title={m.location??"Open map"}><MapPin size={16}/></a>}{type==="GOOGLE_MEET"&&m.meetingJoinUrl&&<a className="aw-followup-icon" href={m.meetingJoinUrl} target="_blank" rel="noopener noreferrer" aria-label={"Join meeting for "+m.businessName}><Video size={16}/></a>}{!m.googleMapsUrl&&!(type==="GOOGLE_MEET"&&m.meetingJoinUrl)&&<span title={m.location??"Location not recorded"}>—</span>}</div></td>
       <td className="aw-followup-note">{m.stageNote||"No notes yet"}</td><td><div className="aw-meeting-actions"><a className="aw-followup-icon" href={calendarHref(m)} target="_blank" rel="noopener noreferrer" aria-label={"Add "+m.businessName+" to Google Calendar"} title="Add to Google Calendar"><CalendarPlus size={16}/></a>{m.canEdit&&!isAdmin?<button type="button" className="aw-followup-icon" aria-label={"Actions for "+m.businessName} disabled={opening||loading} onClick={()=>void open(m)}><Ellipsis size={18}/></button>:<Link className="aw-followup-icon" href={"/app/leads?focus="+encodeURIComponent(m.id)} aria-label={"Open lead "+m.businessName}><ChevronRight size={16}/></Link>}</div></td></tr>;
     })}</tbody></table>:<table className="aw-meetings-table" aria-label="Meeting history register" aria-busy={loading}><thead><tr>{["Scheduled date & time","Business name","Outcome","Notes","Recorded"].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{!rangeInvalid&&events.map(e=><tr key={e.id}><td>{dateText(e.metadata.scheduledAt)} · {timeText(e.metadata.scheduledAt)}</td><td><Link href={"/app/leads?focus="+encodeURIComponent(e.leadId)}>{e.lead.businessName}</Link></td><td>{e.metadata.meetingOutcome==="STAGE_CHANGED"?"Stage changed to "+e.metadata.toStatus.replaceAll("_"," "):outcomeLabels[e.metadata.meetingOutcome as Outcome]??e.metadata.meetingOutcome}</td><td className="aw-followup-note">{e.note||"—"}</td><td>{dateText(e.createdAt)}</td></tr>)}</tbody></table>}</div>
     {!loading&&!error&&!rangeInvalid&&(active?rows.length:events.length)===0&&<p className="aw-meetings-empty">{active?"No scheduled meetings match these filters.":"No recorded meeting outcomes match these filters."}</p>}
     <nav className="aw-meetings-pagination" aria-label="Meetings pages"><button type="button" disabled={loading||!pages.length} onClick={()=>{setCursor(pages.at(-1)??null);setPages(v=>v.slice(0,-1));}}><ChevronLeft size={16}/>Previous</button><span>Page {pages.length+1} · {total??"—"} records</span><button type="button" disabled={loading||!nextCursor} onClick={()=>{setPages(v=>[...v,cursor]);setCursor(nextCursor);}}>Next<ChevronRight size={16}/></button></nav>
   </section></>}
   {selected&&<DirectoryModal title="Update meeting" description={selected.businessName+" · Updates the original CRM lead."} onClose={()=>{if(!saving)setSelected(null);}}>
     <form className="aw-followup-editor space-y-3" onSubmit={save}>
       {editError&&<AWNotice tone="error">{editError}</AWNotice>}
       {selected.location&&<p className="aw-followup-hint">Address: {selected.location}</p>}
       <label className="block">Meeting outcome<select className="field" value={outcome} onChange={e=>{setOutcome(e.target.value as ""|Outcome);setApproval(false);}}><option value="">Edit meeting details only</option>{meetingOutcomeSchema.options.filter(o=>o!=="APPROVED"||canConvert).map(o=><option key={o} value={o}>{outcomeLabels[o]}</option>)}</select></label>
       {(!outcome||outcome==="RESCHEDULED")&&<>
       {outcome==="RESCHEDULED"&&<div className="aw-followup-presets">{[["Tomorrow",1],["After 3 days",3],["Next week",7]].map(([label,n])=><button type="button" className="btn-secondary" key={label} onClick={()=>setEditOn(datePlus(today,Number(n)))}>{label}</button>)}</div>}
       <div className="aw-followup-tool-row"><label>Meeting date<input className="field" type="date" value={editOn} required onChange={e=>setEditOn(e.target.value)}/></label><label>Meeting time (IST)<input className="field" type="time" value={editTime} required onChange={e=>setEditTime(e.target.value)}/></label><label>Duration (min)<input className="field" type="number" min={15} max={480} step={1} required value={duration} onChange={e=>setDuration(Number(e.target.value))}/></label></div>
       <label className="block">Meeting type<select className="field" value={editKind} onChange={e=>setEditKind(e.target.value as Kind)}>{meetingTypeSchema.options.map(k=><option key={k} value={k}>{kindLabels[k]}</option>)}</select></label>
       {editKind==="GOOGLE_MEET"&&<label className="block">Google Meet link<input className="field" type="url" value={join} placeholder="https://meet.google.com/..." onChange={e=>setJoin(e.target.value)}/></label>}
       {conflict>0&&<div className="aw-meeting-conflict"><p>{conflict} other scheduled meeting(s) overlap this time. Check your schedule before proceeding.</p><label><input type="checkbox" checked={allowConflict} onChange={e=>setAllowConflict(e.target.checked)}/> Save anyway</label></div>}
       </>}
       {(outcome==="NO_SHOW"||outcome==="FOLLOW_UP")&&<label className="block">Follow-up date<input className="field" type="date" required value={followOn} onChange={e=>setFollowOn(e.target.value)}/></label>}
       {outcome==="APPROVED"&&<label><input type="checkbox" checked={approval} required onChange={e=>setApproval(e.target.checked)}/> Confirm creation of linked client</label>}
       <label className="block">Lead temperature<select className="field" value={editTemp} onChange={e=>setEditTemp(e.target.value as LeadTemperature)}>{temps.map(t=><option key={t} value={t}>{tempLabels[t]}</option>)}</select></label>
       <label className="block">Meeting notes<textarea className="field" rows={3} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label>
       <div className="aw-followup-tool-row"><button type="submit" className="btn-primary" disabled={saving||conflict>0&&!allowConflict}>{saving?"Saving…":"Save meeting"}</button><Link className="btn-secondary" href={"/app/leads?focus="+encodeURIComponent(selected.id)}>Open lead details</Link><button type="button" className="btn-secondary" disabled={saving} onClick={()=>setSelected(null)}>Cancel</button></div>
     </form>
   </DirectoryModal>}
 </div>;
}
