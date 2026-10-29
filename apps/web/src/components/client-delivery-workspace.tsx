"use client";
import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {CalendarDays,Check,Plus,RefreshCw,UserRound} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

type Person={id:string;displayName:string};
type Service={id:string;name:string;status:string};
type Occurrence={id:string;scheduledOn:string;status:"PENDING"|"COMPLETED";completedAt:string|null;completedBy:{displayName:string}|null;version:number};
type Schedule={id:string;clientId:string;serviceId:string|null;title:string;startOn:string;endOn:string;weekdays:number[];repeatEveryDays:number|null;active:boolean;version:number;
 assigneeId:string;assignee:Person;client:{id:string;businessName:string};service:Service|null;occurrences:Occurrence[]};
type Draft={serviceId:string;title:string;startOn:string;endOn:string;assigneeId:string;weekdays:number[];repeat:boolean;repeatMode:"weekdays"|"interval";repeatEveryDays:number;active:boolean};
const days=["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const presets=["Video shooting","Video editing","Reels","Posts","Website","SEO","AEO / GEO","Meta ads","Google ads"];
const defaultDraft=(start="",end=""):Draft=>({serviceId:"",title:"Video shooting",startOn:start,endOn:end,assigneeId:"",weekdays:[],repeat:false,repeatMode:"weekdays",repeatEveryDays:2,active:true});
const ymd=(value:string)=>value.slice(0,10);
const format=(iso:string)=>new Date(ymd(iso)+"T12:00:00.000Z").toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric",weekday:"short",timeZone:"Asia/Kolkata"});
const today=()=>{const now=new Date(),parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Kolkata",day:"2-digit",month:"2-digit",year:"numeric"}).formatToParts(now);const pick=(key:string)=>parts.find(x=>x.type===key)?.value??"";return pick("year")+"-"+pick("month")+"-"+pick("day");};
export const scheduledDates=(start:string,end:string,weekdays:number[],repeatEveryDays:number|null=null)=>{
 if(!start||!end||start>end)return [] as string[];
 const selected=new Set(weekdays),from=Date.parse(start+"T00:00:00Z"),to=Date.parse(end+"T00:00:00Z");
 if(!Number.isFinite(from)||!Number.isFinite(to)||to-from>366*86400000)return [] as string[];
 if(repeatEveryDays!==null){
  if(weekdays.length||!Number.isInteger(repeatEveryDays)||repeatEveryDays<2||repeatEveryDays>31)return [];
  const dates:string[]=[];for(let t=from;t<=to;t+=repeatEveryDays*86400000)dates.push(new Date(t).toISOString().slice(0,10));
  return dates;
 }
 if(weekdays.length===0)return start===end?[start]:[];
 const dates:string[]=[];for(let t=from;t<=to;t+=86400000){const date=new Date(t);if(selected.has(date.getUTCDay()))dates.push(date.toISOString().slice(0,10));}
 return dates;
};
const weekStart=(value:string)=>{
 const date=new Date(ymd(value)+"T00:00:00Z");
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
 return date.toISOString().slice(0,10);
};
const plusDays=(value:string,days:number)=>new Date(Date.parse(value+"T00:00:00Z")+days*86400000).toISOString().slice(0,10);
const calendarWeeks=(start:string,end:string)=>{
 if(!start||!end||start>end)return [] as string[];
 const result:string[]=[];
 for(let week=weekStart(start);week<=end;week=plusDays(week,7))result.push(week);
 return result;
};
export function ClientDeliveryWorkspace({clientId,contractStartOn,contractEndOn,services=[]}:{
 clientId?:string;contractStartOn?:string|null;contractEndOn?:string|null;services?:Service[]
}){
 const {session,request}=useAuth();
 const manager=!!session?.identity.roles.some(x=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(x))&&!!session.identity.permissions.includes("clients.edit");
 const me=session?.identity.userId;
 const [plans,setPlans]=useState<Schedule[]>([]),[staff,setStaff]=useState<Person[]>([]);
 const [draft,setDraft]=useState<Draft>(()=>defaultDraft(ymd(contractStartOn??""),ymd(contractEndOn??"")));
 const [editing,setEditing]=useState<string|null>(null),[expanded,setExpanded]=useState(false);
 const [weekBySchedule,setWeekBySchedule]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  try{
   const params=new URLSearchParams();if(clientId)params.set("clientId",clientId);else params.set("mine","true");
   const result=await request<{items:Schedule[]}>("/service-deliveries?"+params);
   setPlans(result.items);setError("");
  }catch(e){setError(e instanceof Error?e.message:"Could not load delivery schedules");}
  finally{setLoaded(true);}
 },[clientId,request]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!manager||!clientId)return;void request<Person[]>("/projects/assignees").then(setStaff).catch(e=>setError(e instanceof Error?e.message:"Could not load employees"));},[manager,clientId,request]);
 const validDates=useMemo(()=>scheduledDates(draft.startOn,draft.repeat?draft.endOn:draft.startOn,draft.repeat&&draft.repeatMode==="weekdays"?draft.weekdays:[],draft.repeat&&draft.repeatMode==="interval"?draft.repeatEveryDays:null),[draft.startOn,draft.endOn,draft.weekdays,draft.repeat,draft.repeatMode,draft.repeatEveryDays]);
 const reset=()=>{setDraft(defaultDraft(ymd(contractStartOn??""),ymd(contractEndOn??"")));setExpanded(false);setEditing(null);};
 const save=async(e:FormEvent)=>{
  e.preventDefault();if(!clientId||!manager||validDates.length===0||busy)return;
  setBusy(true);setError("");setSuccess("");
  try{
   const body={serviceId:draft.serviceId||null,title:draft.title.trim(),assigneeId:draft.assigneeId,
    startOn:draft.startOn,endOn:draft.repeat?draft.endOn:draft.startOn,
    weekdays:draft.repeat&&draft.repeatMode==="weekdays"?draft.weekdays:[],
    repeatEveryDays:draft.repeat&&draft.repeatMode==="interval"?draft.repeatEveryDays:null};
   if(editing){const old=plans.find(p=>p.id===editing);if(!old)throw Error("Schedule no longer exists");
    await request("/service-deliveries/"+editing,{method:"PUT",body:{...body,active:draft.active,version:old.version}});
   }else await request("/service-deliveries",{method:"POST",body:{...body,clientId}});
   await load();reset();setSuccess(editing?"Delivery schedule updated. Completed dates were preserved.":"Service delivery scheduled.");
  }catch(e){setError(e instanceof Error?e.message:"Could not save the schedule");}
  finally{setBusy(false);}
 };
 const edit=(p:Schedule)=>{
  setEditing(p.id);setExpanded(true);
  setDraft({title:p.title,serviceId:p.serviceId??"",startOn:ymd(p.startOn),endOn:ymd(p.endOn),weekdays:p.weekdays,repeat:p.weekdays.length>0||p.repeatEveryDays!==null,
   repeatMode:p.repeatEveryDays!==null?"interval":"weekdays",repeatEveryDays:p.repeatEveryDays??2,
   assigneeId:p.assigneeId,active:p.active});
  setError("");setSuccess("");
 };
 const check=async(p:Schedule,o:Occurrence)=>{
  if(busy)return;
  const completed=o.status!=="COMPLETED";
  // Optimistic checkbox update, server remains authoritative.
  setPlans(all=>all.map(schedule=>schedule.id===p.id?{...schedule,
    occurrences:schedule.occurrences.map(item=>item.id===o.id?{...item,
      status:completed?"COMPLETED" as const:"PENDING" as const,
      completedAt:completed?new Date().toISOString():null,
      completedBy:completed?{displayName:"You"}:null,
    }:item),
  }:schedule));
  setBusy(true);setError("");setSuccess("");
  try{
   await request("/service-deliveries/"+p.id+"/occurrences/"+o.id,{method:"PUT",body:{version:o.version,completed}});
   await load();
  }catch(e){
   await load();setError(e instanceof Error?e.message:"Unable to update this delivery");
  }finally{setBusy(false);}
 };
 const toggleDay=(day:number)=>setDraft(p=>({...p,weekdays:p.weekdays.includes(day)?p.weekdays.filter(x=>x!==day):[...p.weekdays,day].sort()}));
 return <section className="aw-client-panel" aria-label="Service delivery schedules" data-testid="service-delivery-schedules">
  <div className="aw-client-panel-heading"><div>
   <p className="aw-client-kicker">SERVICE OCCURRENCES</p>
   <h2>{clientId?"Client deliveries":"My assigned deliveries"}</h2>
   <p>One checkbox for each scheduled service date. No project subdivisions or staff tasks are generated.</p>
  </div><div className="aw-client-actions"><button type="button" className="aw-client-btn" onClick={()=>void load()} disabled={busy}><RefreshCw size={15}/>Refresh</button>
   {manager&&clientId&&<button type="button" className="aw-client-primary" aria-label="Schedule service delivery" onClick={()=>{if(expanded)reset();else{reset();setExpanded(true);}}}><Plus size={16}/>{expanded?"Close form":"Schedule service"}</button>}
  </div></div>
  {error&&<div role="alert" className="aw-client-alert">{error}</div>}
  {success&&<div role="status" className="aw-client-success">{success}</div>}
  {manager&&clientId&&expanded&&<form className="aw-client-form aw-client-subform" aria-label="Service delivery schedule form" onSubmit={e=>void save(e)}>
   <h3>{editing?"Edit service schedule":"Schedule a service"}</h3>
   <div className="aw-client-form-grid">
    <label>Service type<select className="field" value={draft.serviceId||(presets.includes(draft.title)?"preset:"+draft.title:"custom")} onChange={e=>{
     const entry=services.find(x=>x.id===e.target.value);
     const name=e.target.value.startsWith("preset:")?e.target.value.slice(7):entry?.name;
     setDraft(v=>({...v,serviceId:entry?.id??"",title:name??v.title}));
    }}>
     <option value="custom">Custom service</option>
     {presets.map(name=><option key={name} value={"preset:"+name}>{name}</option>)}
     {services.filter(x=>x.status==="ACTIVE").map(s=><option key={s.id} value={s.id}>{s.name+" (agreed service)"}</option>)}
    </select></label>
    <label>Service name<input className="field" aria-label="Delivery service name" minLength={2} maxLength={180} required value={draft.title}
     onChange={e=>setDraft(v=>({...v,title:e.target.value}))}/></label>
    <label>Assigned employee<select className="field" aria-label="Delivery assigned employee" required value={draft.assigneeId}
     onChange={e=>setDraft(v=>({...v,assigneeId:e.target.value}))}>
     <option value="">Select employee</option>{staff.map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}
    </select></label>
    <label className="aw-client-wide aw-client-check"><input type="checkbox" checked={draft.repeat} onChange={e=>setDraft(v=>({...v,repeat:e.target.checked}))}/>Repeat this service</label>
    <label>{draft.repeat?"Start date":"Service date"}<input type="date" className="field" required value={draft.startOn} onChange={e=>setDraft(v=>({...v,startOn:e.target.value}))}/></label>
    {draft.repeat&&<label>End date<input type="date" className="field" required min={draft.startOn||undefined} value={draft.endOn} onChange={e=>setDraft(v=>({...v,endOn:e.target.value}))}/></label>}
    {draft.repeat&&<label className="aw-client-wide">Repeat pattern<select className="field" aria-label="Repeat pattern" value={draft.repeatMode} onChange={e=>setDraft(v=>({...v,repeatMode:e.target.value as Draft["repeatMode"]}))}>
     <option value="weekdays">Selected weekdays</option>
     <option value="interval">Every N days (alternate / day gaps)</option>
    </select></label>}
    {draft.repeat&&draft.repeatMode==="interval"&&<label className="aw-client-wide">Repeat every<select className="field" aria-label="Repeat every" value={draft.repeatEveryDays} onChange={e=>setDraft(v=>({...v,repeatEveryDays:Number(e.target.value)}))}>
     {Array.from({length:30},(_,i)=>i+2).map(n=><option value={n} key={n}>{n===2?"Alternate days (every 2 days)":n===3?"2-day gap (every 3 days)":n===4?"3-day gap (every 4 days)":"Every "+n+" days (skip "+(n-1)+" days)"}</option>)}
    </select></label>}
    {draft.repeat&&draft.repeatMode==="interval"&&<p className="aw-client-wide aw-client-muted">The first delivery is on the start date. Each next delivery is {draft.repeatEveryDays} calendar days later, even when its weekday changes.</p>}
    {draft.repeat&&draft.repeatMode==="weekdays"&&<fieldset className="aw-client-wide"><legend className="text-sm font-semibold mb-2">Repeat on weekdays</legend>
     <div className="aw-delivery-weekdays">{days.map((day,index)=><label key={day} className={draft.weekdays.includes(index)?"selected":""}>
      <input type="checkbox" checked={draft.weekdays.includes(index)} onChange={()=>toggleDay(index)}/>{day.slice(0,3)}
     </label>)}</div>
    </fieldset>}
    {editing&&<label className="aw-client-wide aw-client-check"><input type="checkbox" checked={draft.active} onChange={e=>setDraft(v=>({...v,active:e.target.checked}))}/>Schedule active</label>}
    <p className="aw-client-wide aw-delivery-preview" aria-live="polite">{validDates.length} service date{validDates.length===1?"":"s"} in this exact period{validDates.length>0?": "+validDates.slice(0,10).map(d=>new Date(d+"T12:00Z").toLocaleDateString("en-IN",{day:"numeric",month:"short",timeZone:"Asia/Kolkata"})).join(", ")+(validDates.length>10?" and "+(validDates.length-10)+" more":""):""}.</p>
    <div className="aw-client-actions"><button type="submit" className="aw-client-primary" disabled={busy||validDates.length===0||!draft.assigneeId}>{editing?"Save schedule changes":draft.repeat?"Create dated checklist":"Create one-time delivery"}</button>
     <button type="button" className="aw-client-btn" onClick={reset}>Cancel</button></div>
   </div>
  </form>}
  {!loaded&&<p role="status" className="aw-client-muted">Loading service deliveries…</p>}
  {loaded&&!plans.length&&<div className="aw-client-empty"><CalendarDays size={22}/><h3>No service deliveries scheduled</h3><p>{clientId?"Create a one-time delivery or recurring schedule above, and assign one responsible employee.":"No client delivery occurrences are currently assigned to you."}</p></div>}
  <div className="aw-delivery-schedule-list">{plans.map(p=>{
   const completed=p.occurrences.filter(x=>x.status==="COMPLETED").length;
   const overdue=p.occurrences.filter(x=>x.status==="PENDING"&&ymd(x.scheduledOn)<today()).length;
   const weeks=calendarWeeks(ymd(p.startOn),ymd(p.endOn));
   const currentWeek=weekStart(today());
   const upcoming=p.occurrences.find(o=>o.status==="PENDING"&&ymd(o.scheduledOn)>=today());
   const nextPending=p.occurrences.find(o=>o.status==="PENDING");
   const preferredWeek=weeks.includes(currentWeek)?currentWeek:weekStart(ymd((upcoming??nextPending)?.scheduledOn??p.endOn));
   const selectedWeek=weeks.includes(weekBySchedule[p.id])?weekBySchedule[p.id]:weeks.includes(preferredWeek)?preferredWeek:weeks.at(-1)??currentWeek;
   const weekIndex=weeks.indexOf(selectedWeek);
   const weeklyOccurrences=p.occurrences.filter(o=>weekStart(ymd(o.scheduledOn))===selectedWeek);
   return <article key={p.id} className="aw-delivery-schedule">
    <div className="aw-client-panel-heading"><div><h3>{p.title}</h3>
     <p>{p.client.businessName} · {p.weekdays.length||p.repeatEveryDays!==null?format(p.startOn)+" to "+format(p.endOn):format(p.startOn)+" (one-time)"}</p>
     <p className="aw-delivery-owner"><UserRound size={14}/>{p.assignee.displayName} · {p.repeatEveryDays!==null?"Every "+p.repeatEveryDays+" days":p.weekdays.length?p.weekdays.map(d=>days[d]).join(", "):"One-time delivery"}</p>
    </div><div className="aw-client-actions"><span className="aw-client-project-state">{p.active?"Active":"Paused"}</span>
     {manager&&clientId&&<button type="button" className="aw-client-btn" onClick={()=>edit(p)}>Edit schedule / reassign</button>}
    </div></div>
    <div className="aw-delivery-progress"><span>{completed}/{p.occurrences.length} completed</span><span>{overdue} overdue</span></div>
    <div className="aw-delivery-week-toolbar" aria-label={"Week navigation for "+p.title}>
     <button className="aw-client-btn" type="button" aria-label={"Previous week for "+p.title} disabled={weekIndex<=0} onClick={()=>setWeekBySchedule(v=>({...v,[p.id]:weeks[weekIndex-1]}))}>Previous week</button>
     <strong>Week: {format(selectedWeek)} to {format(plusDays(selectedWeek,6))}</strong>
     <button className="aw-client-btn" type="button" aria-label={"Next week for "+p.title} disabled={weekIndex>=weeks.length-1} onClick={()=>setWeekBySchedule(v=>({...v,[p.id]:weeks[weekIndex+1]}))}>Next week</button>
    </div>
    <div className="aw-delivery-occurrences" aria-label={"Dated checklist for "+p.title}>
     {weeklyOccurrences.map(o=>{
       const done=o.status==="COMPLETED",future=ymd(o.scheduledOn)>today();
       const authorized=manager||p.assigneeId===me;
       const canToggle=authorized&&!busy&&(!future||done)&&(p.active||manager)&&(manager||!done);
       return <label key={o.id} className={"aw-delivery-occurrence"+(done?" done":"")}>
        <input type="checkbox" aria-label={p.title+" "+format(o.scheduledOn)+" completed"} checked={done} disabled={!canToggle}
         onChange={()=>void check(p,o)}/>
        <span>{format(o.scheduledOn)}</span>
        <small>{done?<><Check size={13}/>Completed{ o.completedBy?" by "+o.completedBy.displayName:""}</>:future?"Upcoming":ymd(o.scheduledOn)<today()?"Overdue":"Due today"}</small>
       </label>;
     })}
     {weeklyOccurrences.length===0&&<p className="aw-client-muted">No service deliveries scheduled this week.</p>}
    </div>
   </article>;
  })}</div>
  {!clientId&&<p className="aw-client-muted mt-3">Only your assigned client deliveries appear here. Internal tasks remain in <Link href="/app/tasks">Tasks</Link>.</p>}
 </section>;
}
