"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {CalendarDays,Check,PackageCheck,RefreshCw,Send,Newspaper} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {Spinner} from "@/components/ui";

type PostWeek={
 week:number;from:number;to:number;readyAdded:number;delivered:number;
 availableBefore:number;remainingStock:number;version:number;note:string;
 updatedAt:string|null;updatedBy:string|null;
};
type Monthly={
 clientId:string;clientName:string;month:string;openingStock:number;
 readyThisMonth:number;deliveredThisMonth:number;remainingStock:number;weeks:PostWeek[];
};
type Draft={readyAdded:string;delivered:string;note:string};
const currentMonth=()=>{
 const date=new Date();
 return date.getFullYear()+"-"+String(date.getMonth()+1).padStart(2,"0");
};
const validCount=(value:string)=>/^(0|[1-9][0-9]{0,4})$/.test(value)&&Number(value)<=10000;
const count=(x:number)=>new Intl.NumberFormat("en-IN").format(x);
const draftsFrom=(value:Monthly)=>Object.fromEntries(value.weeks.map(w=>[w.week,{
 readyAdded:String(w.readyAdded),delivered:String(w.delivered),note:w.note
}]));
const range=(month:string,week:PostWeek)=>{
 const m=new Date(month+"-01T00:00:00Z").toLocaleString("en-IN",{month:"short",timeZone:"UTC"});
 return m+" "+week.from+"–"+week.to;
};

export function ClientPostReadiness({clientId,month:externalMonth,onMonthChange}:{
 clientId:string;month?:string;onMonthChange?:(month:string)=>void
}){
 const {session,request}=useAuth();
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const [internalMonth,setInternalMonth]=useState(currentMonth);
 const month=externalMonth??internalMonth;
 const [data,setData]=useState<Monthly|null>(null);
 const [drafts,setDrafts]=useState<Record<number,Draft>>({});
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState<number|null>(null);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  try{
   const result=await request<Monthly>("/clients/"+clientId+"/post-readiness?month="+encodeURIComponent(month));
   setData(result);setDrafts(draftsFrom(result));
  }catch(e){setError(e instanceof Error?e.message:"Could not load post stock");setData(null);}
  finally{setLoading(false);}
 },[clientId,month,request]);
 useEffect(()=>{if(session)void load();},[session,load]);
 const anyStock=useMemo(()=>data?.weeks.some(w=>w.version>0)??false,[data]);
 const changeMonth=(next:string)=>{
  if(externalMonth!==undefined)onMonthChange?.(next);
  else setInternalMonth(next);
  setSuccess("");
 };
 const update=(week:number,key:keyof Draft,value:string)=>setDrafts(previous=>({
  ...previous,[week]:{...(previous[week]??{readyAdded:"0",delivered:"0",note:""}),[key]:value}
 }));
 const isDirty=(w:PostWeek)=>{
  const v=drafts[w.week];
  return !!v&&(Number(v.readyAdded)!==w.readyAdded||Number(v.delivered)!==w.delivered||v.note.trim()!==w.note.trim());
 };
 async function save(w:PostWeek){
  const v=drafts[w.week];if(!v)return;
  if(!validCount(v.readyAdded)||!validCount(v.delivered)){setError("Post counts must be whole numbers from 0 to 10,000.");return;}
  setSaving(w.week);setError("");setSuccess("");
  try{
   await request("/clients/"+clientId+"/post-readiness/"+w.week,{method:"PUT",body:{
    month,readyAdded:Number(v.readyAdded),delivered:Number(v.delivered),
    note:v.note.trim(),version:w.version
   }});
   await load();
   setSuccess("Week "+w.week+" saved. Ready stock updated for later weeks and months.");
  }catch(e){setError(e instanceof Error?e.message:"Could not save this week. Refresh and retry.");}
  finally{setSaving(null);}
 }
 if(!session)return <Spinner label="Checking post readiness access…"/>;
 return <section className="aw-client-panel space-y-5" aria-label="Client post readiness">
  <div className="aw-client-panel-heading">
   <div><h2 className="flex items-center gap-2"><Newspaper size={21}/>Post Readiness</h2>
    <p>Track newly edited posts ready for future posting and posts delivered each week. Remaining stock carries forward into the next month.</p></div>
   <div className="flex items-end gap-2 flex-wrap">
    <label className="text-sm space-y-1"><span className="block">Select month</span>
     <input type="month" className="field" value={month} min="2000-01" max="2099-12" onChange={e=>changeMonth(e.target.value)}/></label>
    <button className="aw-client-btn" type="button" disabled={loading||saving!==null} onClick={()=>void load()}>
     <RefreshCw size={15}/>Refresh
    </button>
   </div>
  </div>
  {error&&<p className="aw-client-alert" role="alert">{error}</p>}
  {success&&<p className="aw-client-success" role="status">{success}</p>}
  {loading?<Spinner label="Loading weekly post status…"/>:data&&<>
   <div className="aw-client-statrow">
    <div className="aw-client-stat"><PackageCheck size={18}/><span>Ready stock for upcoming</span><strong>{count(data.remainingStock)}</strong></div>
    <div className="aw-client-stat"><Newspaper size={18}/><span>Ready added this month</span><strong>{count(data.readyThisMonth)}</strong></div>
    <div className="aw-client-stat"><Send size={18}/><span>Delivered this month</span><strong>{count(data.deliveredThisMonth)}</strong></div>
    <div className="aw-client-stat"><CalendarDays size={18}/><span>Carried from earlier months</span><strong>{count(data.openingStock)}</strong></div>
   </div>
   <div className="overflow-x-auto">
    <table className="aw-client-table w-full" aria-label={"Post readiness weeks for "+data.clientName+" "+month}>
     <thead><tr>
      <th>Week</th><th>Stock at start</th><th>New posts ready</th>
      <th>Posts delivered</th><th>Stock after week</th><th>Notes</th>{canEdit&&<th>Action</th>}
     </tr></thead>
     <tbody>{data.weeks.map(w=>{
      const draft=drafts[w.week]??{readyAdded:String(w.readyAdded),delivered:String(w.delivered),note:w.note};
      return <tr key={w.week}>
       <td className="min-w-28"><strong>Week {w.week}</strong>
        <small className="block opacity-70">{range(month,w)}</small></td>
       <td className="font-semibold">{count(w.availableBefore)}</td>
       <td>{canEdit?<input className="field w-24" aria-label={"Ready posts week "+w.week} type="number" min="0" max="10000" step="1"
        value={draft.readyAdded} onChange={e=>update(w.week,"readyAdded",e.target.value)}/>:count(w.readyAdded)}</td>
       <td>{canEdit?<input className="field w-24" aria-label={"Delivered posts week "+w.week} type="number" min="0" max="10000" step="1"
        value={draft.delivered} onChange={e=>update(w.week,"delivered",e.target.value)}/>:count(w.delivered)}</td>
       <td><strong>{count(w.remainingStock)}</strong><small className="block opacity-70">Saved balance</small></td>
       <td className="min-w-48">{canEdit?<textarea className="field w-full min-h-16" aria-label={"Post notes week "+w.week}
        maxLength={500} rows={2} placeholder="Editing, review or delivery notes" value={draft.note}
        onChange={e=>update(w.week,"note",e.target.value)}/>:w.note||"—"}
        {w.updatedBy&&<small className="block opacity-60">Updated by {w.updatedBy}</small>}</td>
       {canEdit&&<td><button className="aw-client-btn" type="button" disabled={saving!==null||!isDirty(w)||!validCount(draft.readyAdded)||!validCount(draft.delivered)}
        onClick={()=>void save(w)}><Check size={15}/>{saving===w.week?"Saving…":"Save week"}</button></td>}
      </tr>;
     })}</tbody>
    </table>
   </div>
   <div className="aw-client-muted text-sm space-y-1">
    <p>Weekly periods are days 1–7, 8–14, 15–21, 22–28 and, where applicable, 29–month end.</p>
    <p><strong>Stock calculation:</strong> Opening stock + newly ready posts − delivered posts. A post enters stock when its design or copy is complete and ready for use; delivering or publishing it reduces that stock. This tracker is manually maintained and does not automatically read content assets or social-media publishing status.</p>
    {!anyStock&&<p>No post quantities recorded for this month. Enter the first ready or delivered counts and save that week.</p>}
   </div>
  </>}
 </section>;
}
