"use client";

import {useCallback,useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,EmptyState,Notice,PageHeader,Spinner} from "@/components/ui";
type Founder={id:string;displayName:string;title:string;responsibilities:string;sortOrder:number;
 userId:string|null;isActive:boolean;version:number;updatedAt:string};
type Staff={id:string;displayName:string;loginId:string};
type Draft={displayName:string;title:string;responsibilities:string;sortOrder:number;
 userId:string;isActive:boolean};
const empty=():Draft=>({displayName:"",title:"",responsibilities:"",sortOrder:0,userId:"",isActive:true});
const message=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Unable to save founder profile";
export default function FoundersPage(){
 const {request,session}=useAuth();
 const canRead=!!session?.identity.permissions.includes("founders.read");
 const canEdit=!!session?.identity.permissions.includes("founders.edit");
 const [rows,setRows]=useState<Founder[]>([]),[staff,setStaff]=useState<Staff[]>([]);
 const [draft,setDraft]=useState<Draft>(empty),[selected,setSelected]=useState<Founder|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);
  try{
   const [founders,people]=await Promise.all([
    request<Founder[]>("/founders"),
    canEdit?request<Staff[]>("/founders/eligible-staff"):Promise.resolve([]),
   ]);
   setRows(founders);setStaff(people);setError("");
  }catch(e){setError(message(e));}finally{setLoading(false);}
 },[canRead,canEdit,request]);
 useEffect(()=>{void load();},[load]);
 const edit=(v:Founder)=>{
  setSelected(v);setDraft({displayName:v.displayName,title:v.title,
   responsibilities:v.responsibilities,sortOrder:v.sortOrder,userId:v.userId??"",isActive:v.isActive});
  setError("");setSuccess("");
 };
 const clear=()=>{setSelected(null);setDraft(empty());};
 const save=async(e:FormEvent)=>{
  e.preventDefault();setBusy(true);setError("");setSuccess("");
  try{
   const body={displayName:draft.displayName,title:draft.title,
    responsibilities:draft.responsibilities,sortOrder:draft.sortOrder,userId:draft.userId||null};
   if(selected)await request("/founders/"+selected.id,{method:"PUT",body:{...body,
     version:selected.version,isActive:draft.isActive}});
   else await request("/founders",{method:"POST",body});
   clear();await load();setSuccess("Founder responsibilities saved. Login roles and permissions are unchanged.");
  }catch(e){setError(message(e));}finally{setBusy(false);}
 };
 if(!session)return <Spinner label="Checking founder access…"/>;
 if(!canRead)return <><PageHeader title="Founder directory"/><Notice kind="error">Founder directory access required.</Notice></>;
 return <div className="space-y-6">
  <PageHeader eyebrow="People & leadership" title="Founders & responsibilities"
   description="Define who owns marketing, delivery and business operations. These descriptions are separate from account roles and access permissions."/>
  {error&&<Notice kind="error">{error}</Notice>}
  {success&&<Notice kind="success">{success}</Notice>}
  <Card title="Leadership directory" description="Visible roles describe accountability, not system authorization.">
   {loading?<Spinner label="Loading founder responsibilities…"/>:rows.filter(x=>x.isActive).length===0?
    <EmptyState title="No founder profiles yet" description="An authorized manager can set up the leadership directory."/>:
    <div className="grid gap-4 md:grid-cols-2">{rows.filter(x=>x.isActive).map(x=>
     <article key={x.id} className="rounded-xl border border-slate-200 p-4">
      <p className="text-lg font-semibold text-slate-900">{x.displayName}</p>
      <p className="mt-1 text-sm font-medium text-indigo-700">{x.title}</p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{x.responsibilities}</p>
      {canEdit&&<div className="mt-4 border-t pt-3">
       <button type="button" className="btn-secondary" onClick={()=>edit(x)}>Edit responsibilities</button>
      </div>}
     </article>)}</div>}
  </Card>
  {canEdit&&<Card title={selected?"Edit founder profile":"Add founder"}
   description="Optionally link an existing active staff account for internal reference. This action never grants FOUNDER, ADMIN or any other permission.">
   <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
    <label className="text-sm">Display name
     <input className="field mt-1 w-full" required minLength={2} maxLength={160}
      value={draft.displayName} onChange={e=>setDraft(s=>({...s,displayName:e.target.value}))}/>
    </label>
    <label className="text-sm">Responsibility title
     <input className="field mt-1 w-full" required minLength={2} maxLength={160}
      placeholder="Business Growth & Client Delivery" value={draft.title}
      onChange={e=>setDraft(s=>({...s,title:e.target.value}))}/>
    </label>
    <label className="text-sm">Linked staff account (optional)
     <select className="field mt-1 w-full" value={draft.userId} onChange={e=>setDraft(s=>({...s,userId:e.target.value}))}>
      <option value="">Not linked</option>{staff.map(s=><option key={s.id} value={s.id}>{s.displayName} ({s.loginId})</option>)}
     </select>
    </label>
    <label className="text-sm">Display order
     <input className="field mt-1 w-full" type="number" min={0} max={10000}
      value={draft.sortOrder} onChange={e=>setDraft(s=>({...s,sortOrder:Number(e.target.value)}))}/>
    </label>
    <label className="text-sm md:col-span-2">Key responsibilities
     <textarea className="field mt-1 w-full" required minLength={4} maxLength={4000} rows={5}
      placeholder="Lead generation, client relations, campaign delivery, reporting..."
      value={draft.responsibilities} onChange={e=>setDraft(s=>({...s,responsibilities:e.target.value}))}/>
    </label>
    {selected&&<label className="flex items-center gap-2 text-sm md:col-span-2">
     <input type="checkbox" checked={draft.isActive} onChange={e=>setDraft(s=>({...s,isActive:e.target.checked}))}/>
     Visible in leadership directory
    </label>}
    <div className="flex flex-wrap gap-2 md:col-span-2">
     <button className="btn-primary" disabled={busy}>{busy?"Saving…":selected?"Save changes":"Add founder"}</button>
     {selected&&<button type="button" className="btn-secondary" onClick={clear}>Cancel edit</button>}
     {session.identity.permissions.includes("users.read")&&<Link className="btn-secondary" href="/app/team/users">
       Account access is managed separately
     </Link>}
    </div>
   </form>
  </Card>}
  {canEdit&&rows.some(x=>!x.isActive)&&<Card title="Hidden profiles">
   <div className="space-y-2">{rows.filter(x=>!x.isActive).map(x=>
    <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
     <span className="text-sm text-slate-600">{x.displayName} · {x.title}</span>
     <button className="btn-secondary" type="button" onClick={()=>edit(x)}>Restore or edit</button>
    </div>)}</div>
  </Card>}
 </div>;
}
