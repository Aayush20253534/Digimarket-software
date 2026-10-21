"use client";

import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ChevronLeft,ChevronRight,RefreshCw} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,Notice,PageHeader,Spinner,StatusBadge,EmptyState} from "@/components/ui";

type Stage="IDEA"|"DRAFT"|"IN_REVIEW"|"CHANGES_REQUESTED"|"APPROVED"|"SCHEDULED"|"PUBLISHED"|"CANCELLED";
type Platform="INSTAGRAM"|"FACEBOOK"|"LINKEDIN"|"YOUTUBE"|"GOOGLE_BUSINESS"|"WEBSITE"|"OTHER";
type Format="REEL"|"POST"|"STORY"|"CAROUSEL"|"VIDEO"|"BLOG"|"OTHER";
type User={id:string;displayName:string};
type Client={id:string;businessName:string};
type Project={id:string;name:string;clientId:string};
type Asset={id:string;filename:string};
type Summary={id:string;title:string;clientId:string;projectId:string|null;ownerId:string;platform:Platform;format:Format;
 status:Stage;publishAt:string|null;version:number;revision:number;approvalRequestId:string|null;
 client:{businessName:string};owner:{displayName:string};assets:{assetId:string}[]};
type Detail=Omit<Summary,"assets">&{caption:string;hashtags:string[];createdById:string;publishedAt:string|null;publishedUrl:string|null;
 assets:{assetId:string;asset:{filename:string;status:string}}[];
 approvalRequest:{status:string;decision:{outcome:string;reason:string|null}|null}|null;
 revisions:{revision:number;createdAt:string;actorId:string}[]};
type List<T>={items:T[];nextCursor:string|null};
type Draft={clientId:string;projectId:string;ownerId:string;title:string;caption:string;hashtags:string;
 platform:Platform;format:Format;publishAt:string;assetIds:string[]};
const platforms:Platform[]=["INSTAGRAM","FACEBOOK","LINKEDIN","YOUTUBE","GOOGLE_BUSINESS","WEBSITE","OTHER"];
const formats:Format[]=["REEL","POST","STORY","CAROUSEL","VIDEO","BLOG","OTHER"];
const stages:Stage[]=["IDEA","DRAFT","IN_REVIEW","CHANGES_REQUESTED","APPROVED","SCHEDULED","PUBLISHED","CANCELLED"];
const empty:Draft={clientId:"",projectId:"",ownerId:"",title:"",caption:"",hashtags:"",platform:"INSTAGRAM",format:"POST",publishAt:"",assetIds:[]};
const errorMessage=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Content request failed";
const dateKey=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
const localTime=(v:string|null)=>v?new Date(v).toLocaleString():"Not scheduled";
const editTime=(v:string|null)=>v?new Date(new Date(v).getTime()-new Date(v).getTimezoneOffset()*60000).toISOString().slice(0,16):"";
const toInput=(d:Detail):Draft=>({
 clientId:d.clientId,projectId:d.projectId||"",ownerId:d.ownerId,title:d.title,caption:d.caption,
 hashtags:d.hashtags.join(" "),platform:d.platform,format:d.format,publishAt:editTime(d.publishAt),
 assetIds:d.assets.map(x=>x.assetId),
});
const asHashtags=(s:string)=>s.split(/[\s,]+/).filter(Boolean).map(x=>x.startsWith("#")?x:"#"+x);
function range(day:string,view:"month"|"week"|"list"){
 const d=new Date(day+"T12:00:00");
 const start=new Date(d);
 if(view==="month"){start.setDate(1);start.setDate(start.getDate()-((start.getDay()+6)%7));}
 else if(view==="week")start.setDate(start.getDate()-((start.getDay()+6)%7));
 else start.setDate(start.getDate()-14);
 const end=new Date(start);end.setDate(end.getDate()+(view==="month"?42:view==="week"?7:45));
 return {from:start,to:end};
}
export default function ContentPage(){
 const {session,request}=useAuth();
 const rights=session?.identity.permissions??[];
 const canRead=rights.includes("content.read"),canCreate=rights.includes("content.create");
 const canEdit=rights.includes("content.edit"),canManage=rights.includes("content.manage");
 const canSubmit=rights.includes("approvals.submit"),canPublish=rights.includes("content.publish");
 const canAssets=rights.includes("assets.read");
 const [view,setView]=useState<"month"|"week"|"list">("month");
 const [day,setDay]=useState(dateKey(new Date()));
 const [rows,setRows]=useState<Summary[]>([]);
 const [cursor,setCursor]=useState<string|null>(null),[nextCursor,setNextCursor]=useState<string|null>(null);
 const [clients,setClients]=useState<Client[]>([]),[projects,setProjects]=useState<Project[]>([]);
 const [staff,setStaff]=useState<User[]>([]),[assets,setAssets]=useState<Asset[]>([]);
 const [filterClient,setFilterClient]=useState(""),[filterStatus,setFilterStatus]=useState("");
 const [selected,setSelected]=useState<Detail|null>(null);
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState<Draft>(empty);
 const [publishUrl,setPublishUrl]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const period=useMemo(()=>range(day,view),[day,view]);
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);
  try{
   const q=new URLSearchParams({limit:"100"});
   if(view!=="list"){q.set("start",period.from.toISOString());q.set("end",period.to.toISOString());}
   if(filterClient)q.set("clientId",filterClient);if(filterStatus)q.set("status",filterStatus);
   if(cursor)q.set("cursor",cursor);
   const data=await request<List<Summary>>("/content?"+q);
   setRows(data.items);setNextCursor(data.nextCursor);setError("");
  }catch(e){setError(errorMessage(e));}finally{setLoading(false);}
 },[request,period,view,filterClient,filterStatus,cursor,canRead]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!canRead)return;
  if(rights.includes("clients.read"))void request<List<Client>>("/clients?limit=100").then(x=>setClients(x.items)).catch(()=>{});
  if(rights.includes("projects.read"))void request<List<Project>>("/projects?limit=100").then(x=>setProjects(x.items)).catch(()=>{});
  if(canManage)void request<User[]>("/content/staff").then(setStaff).catch(()=>{});
 },[canRead,canManage,request,session?.identity.userId]);
 const open=useCallback(async(id:string)=>{
  try{
   const d=await request<Detail>("/content/"+id);
   setSelected(d);setEditing(false);setDraft(toInput(d));setPublishUrl(d.publishedUrl||"");
   setError("");
  }catch(e){setError(errorMessage(e));}
 },[request]);
 useEffect(()=>{
  if(!canRead)return;
  const id=new URLSearchParams(window.location.search).get("focus");
  if(id&&/^[0-9a-f-]{36}$/i.test(id))void open(id);
 },[canRead,open]);
 useEffect(()=>{
  if(!canAssets||!draft.clientId){setAssets([]);return;}
  void request<List<Asset>>("/assets?status=ACTIVE&limit=100&clientId="+draft.clientId)
   .then(x=>setAssets(x.items)).catch(()=>setAssets([]));
 },[canAssets,draft.clientId,request]);
 const change=(months:number)=>{
  const d=new Date(day+"T12:00:00");
  if(view==="month")d.setMonth(d.getMonth()+months,1);
  else d.setDate(d.getDate()+months*(view==="week"?7:30));
  setDay(dateKey(d));setCursor(null);
 };
 const perform=async(op:()=>Promise<unknown>,message:string,reopen=true)=>{
  setBusy(true);setError("");setSuccess("");
  try{
   await op();
   if(reopen&&selected)await open(selected.id);
   await load();setSuccess(message);
  }catch(e){setError(errorMessage(e));}finally{setBusy(false);}
 };
 const cardFor=(p:Summary)=> <button key={p.id} type="button"
  className="aw-calendar-item block w-full rounded-lg border border-slate-200 bg-white p-2 text-left shadow-sm hover:border-indigo-400"
  onClick={()=>void open(p.id)}>
    <b className="block truncate text-xs">{p.title}</b>
    <span className="block truncate text-[11px] text-slate-500">{p.client.businessName} · {p.platform}</span>
    <span className="mt-1 block text-[10px] font-medium text-indigo-700">{p.status.replaceAll("_"," ")}</span>
  </button>;
 const save=async(e:FormEvent)=>{
  e.preventDefault();
  const body={...draft,projectId:draft.projectId||null,
    hashtags:asHashtags(draft.hashtags),publishAt:draft.publishAt?new Date(draft.publishAt).toISOString():null,
    assetIds:draft.assetIds};
  if(editing&&selected){
   const {clientId:unused,ownerId,...fields}=body;
   void unused;
   await perform(()=>request("/content/"+selected.id,{method:"PUT",body:{
     ...fields,...(canManage?{ownerId}:{}),version:selected.version}}),
    "Revision saved. Any previous approval is invalid for the new revision.");
  }else{
   await perform(async()=>{
    const data=await request<Detail>("/content",{method:"POST",body:{
      ...body,...(!canManage?{ownerId:undefined}:{}),
    }});
    await open(data.id);
    setEditing(false);
   },"Content idea created.",false);
  }
 };
 const editAllowed=!!selected&&canEdit&&(canManage||selected.ownerId===session?.identity.userId)
  &&!["IN_REVIEW","PUBLISHED","CANCELLED"].includes(selected.status);
 const calendarDays=useMemo(()=>Array.from({length:view==="week"?7:42},(_,i)=>{
  const d=new Date(period.from);d.setDate(d.getDate()+i);return dateKey(d);
 }),[period,view]);
 if(!session)return <Spinner label="Checking content access…"/>;
 if(!canRead)return <><PageHeader title="Content calendar access denied"/><Notice kind="error">Content read permission required.</Notice></>;
 return <div data-aw-module="content" className="aw-module-root space-y-6">
  <PageHeader eyebrow="Campaign planning" title="Content calendar"
    description="Plan content without leaving the workspace. Founder submissions are approved immediately; publishing remains a separate action."
    actions={<button type="button" className="btn-secondary" onClick={()=>void load()}>
      <RefreshCw className="h-4 w-4"/> Refresh</button>}/>
  {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Editorial planning</span><span className="aw-module-count">{rows.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{view==="list"?"All content":view==="week"?"Week view":"Month view"}</span></div>}
  {error&&<Notice kind="error">{error}</Notice>}
  {success&&<Notice kind="success">{success}</Notice>}
  <Card title="Editorial schedule" description="Browse month, week or all content in a list. Draft ideas without publish dates appear in the list view.">
   <div className="aw-editorial-controls">
    <div className="aw-view-switch inline-flex overflow-hidden rounded-lg border">
     {(["month","week","list"] as const).map(v=><button key={v} className={"px-3 py-2 text-sm "+(view===v?"bg-indigo-600 text-white":"bg-white")}
       type="button" onClick={()=>{setView(v);setCursor(null);}}>{v[0].toUpperCase()+v.slice(1)}</button>)}
    </div>
    <button className="btn-secondary" type="button" aria-label="Previous period" onClick={()=>change(-1)}><ChevronLeft className="h-4 w-4"/></button>
    <input className="field" aria-label="Selected calendar date" type="date" value={day} onChange={e=>{setDay(e.target.value);setCursor(null);}}/>
    <button className="btn-secondary" type="button" aria-label="Next period" onClick={()=>change(1)}><ChevronRight className="h-4 w-4"/></button>
    <select className="field" aria-label="Filter content by client" value={filterClient}
     onChange={e=>{setFilterClient(e.target.value);setCursor(null);}}>
      <option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
    </select>
    <select className="field" aria-label="Filter content status" value={filterStatus}
     onChange={e=>{setFilterStatus(e.target.value);setCursor(null);}}>
      <option value="">All statuses</option>{stages.map(s=><option key={s}>{s}</option>)}
    </select>
   </div>
   {loading?<Spinner label="Loading editorial schedule…"/>:view==="list"?
    <div className="mt-5 space-y-2">{rows.length?rows.map(cardFor):
      <EmptyState title="No scheduled content" description="Choose another date or create a draft."/>}</div>:
    <><div className="aw-calendar-grid mt-5">
      {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(x=><div key={x} className="aw-calendar-weekday">{x}</div>)}
      {calendarDays.map(d=><div key={d} className="aw-calendar-day">
        <span className={"text-xs "+(d===dateKey(new Date())?"font-bold text-indigo-600":"text-slate-600")}>{Number(d.slice(8))}</span>
        <div className="mt-2 space-y-1">{rows.filter(p=>p.publishAt&&dateKey(new Date(p.publishAt))===d).map(cardFor)}</div>
      </div>)}
    </div>
    <div className="aw-mobile-agenda mt-5" aria-label="Content agenda">
     {calendarDays.some(d=>rows.some(p=>p.publishAt&&dateKey(new Date(p.publishAt))===d)) ?
      calendarDays.filter(d=>rows.some(p=>p.publishAt&&dateKey(new Date(p.publishAt))===d))
       .map(d=><section key={d} className="aw-agenda-group">
        <h3 className="aw-agenda-heading">{new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"})}</h3>
        <div className="space-y-2">{rows.filter(p=>p.publishAt&&dateKey(new Date(p.publishAt))===d).map(cardFor)}</div>
       </section>) :
      <EmptyState title="Nothing scheduled in this period" description="Drafts without publish dates can be found in List view."/>}
    </div></>}
   {nextCursor&&<button className="btn-secondary mt-4" type="button" onClick={()=>setCursor(nextCursor)}>Next page</button>}
  </Card>
  {canCreate&&<Card title={editing?"Revise content":"Create content idea"}
   description="Captions, hashtags, media assets and planned dates remain editable until review. Editing approved content requires another approval.">
   <form className="grid gap-3 md:grid-cols-2" onSubmit={save}>
    <label className="text-sm">Client<select required className="field mt-1 w-full" value={draft.clientId} disabled={editing}
     onChange={e=>setDraft(x=>({...x,clientId:e.target.value,projectId:"",assetIds:[]}))}>
      <option value="">Choose client</option>{clients.map(x=><option key={x.id} value={x.id}>{x.businessName}</option>)}
    </select></label>
    <label className="text-sm">Platform<select className="field mt-1 w-full" value={draft.platform}
      onChange={e=>setDraft(x=>({...x,platform:e.target.value as Platform}))}>
      {platforms.map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-sm">Content title<input required minLength={2} maxLength={180} className="field mt-1 w-full"
     value={draft.title} onChange={e=>setDraft(x=>({...x,title:e.target.value}))}/></label>
    <label className="text-sm">Format<select className="field mt-1 w-full" value={draft.format}
     onChange={e=>setDraft(x=>({...x,format:e.target.value as Format}))}>
      {formats.map(x=><option key={x}>{x}</option>)}</select></label>
    <label className="text-sm">Linked project<select className="field mt-1 w-full" value={draft.projectId}
     onChange={e=>setDraft(x=>({...x,projectId:e.target.value}))}>
      <option value="">No project</option>{projects.filter(x=>x.clientId===draft.clientId).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}
    </select></label>
    <label className="text-sm">Planned publish time<input className="field mt-1 w-full" type="datetime-local"
     value={draft.publishAt} onChange={e=>setDraft(x=>({...x,publishAt:e.target.value}))}/></label>
    {canManage&&<label className="text-sm">Owner<select className="field mt-1 w-full" value={draft.ownerId}
     onChange={e=>setDraft(x=>({...x,ownerId:e.target.value}))}>
      <option value="">Me</option>{staff.map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}
    </select></label>}
    <label className="text-sm md:col-span-2">Caption<textarea className="field mt-1 w-full" rows={4} maxLength={10000}
     value={draft.caption} onChange={e=>setDraft(x=>({...x,caption:e.target.value}))}/></label>
    <label className="text-sm md:col-span-2">Hashtags, separated by spaces<input className="field mt-1 w-full"
     placeholder="#branding #newlaunch" value={draft.hashtags}
     onChange={e=>setDraft(x=>({...x,hashtags:e.target.value}))}/></label>
    {canAssets&&<label className="text-sm md:col-span-2">Media from client asset manager (up to 10)
      <select multiple size={Math.min(Math.max(assets.length,2),6)} className="field mt-1 w-full"
       value={draft.assetIds} onChange={e=>setDraft(x=>({...x,assetIds:Array.from(e.target.selectedOptions).map(o=>o.value)}))}>
       {assets.map(x=><option key={x.id} value={x.id}>{x.filename}</option>)}
      </select>
    </label>}
    <div className="flex flex-wrap gap-2 md:col-span-2">
      <button className="btn-primary" disabled={busy}>{editing?"Save new revision":"Create idea"}</button>
      {editing&&<button type="button" className="btn-secondary" onClick={()=>{setEditing(false);setDraft(empty);}}>Cancel editing</button>}
    </div>
   </form>
  </Card>}
  {selected&&<Card title={selected.title} description={selected.client.businessName+" · "+selected.platform+" · "+selected.format}>
    <div className="space-y-4">
     <div className="flex flex-wrap gap-3 items-center"><StatusBadge status={selected.status}/>
      <span className="text-xs text-slate-500">Revision {selected.revision} · {localTime(selected.publishAt)}</span>
      <span className="text-xs text-slate-500">Owner: {selected.owner.displayName}</span>
     </div>
     <p className="whitespace-pre-wrap text-sm">{selected.caption||"No caption"}</p>
     <p className="text-xs text-indigo-700">{selected.hashtags.join(" ")}</p>
     {selected.assets.length>0&&<p className="text-xs text-slate-600">Attachments: {selected.assets.map(x=>x.asset.filename).join(", ")}</p>}
     {selected.approvalRequest?.decision?.reason&&<Notice kind="info">Review: {selected.approvalRequest.decision.reason}</Notice>}
     <div className="flex flex-wrap gap-2">
      {editAllowed&&<button type="button" className="btn-secondary"
        onClick={()=>{setDraft(toInput(selected));setEditing(true);}}>Edit / new revision</button>}
      {editAllowed&&canSubmit&&["DRAFT","CHANGES_REQUESTED"].includes(selected.status)&&
        <button disabled={busy} className="btn-primary" type="button" onClick={()=>void perform(()=>
          request("/content/"+selected.id+"/submit",{method:"POST",body:{version:selected.version}}),session?.identity.roles.includes("FOUNDER")?"Content approved.":"Submitted for content approval.")}>{session?.identity.roles.includes("FOUNDER")?"Approve content":"Submit for review"}</button>}
      {editAllowed&&selected.status==="APPROVED"&&selected.publishAt&&
        <button disabled={busy} className="btn-secondary" type="button" onClick={()=>void perform(()=>
          request("/content/"+selected.id+"/schedule",{method:"POST",body:{version:selected.version}}),"Content scheduled for manual publishing.")}>Schedule</button>}
      {canPublish&&["APPROVED","SCHEDULED"].includes(selected.status)&&
        <form className="flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();void perform(()=>
          request("/content/"+selected.id+"/publish",{method:"POST",body:{
            version:selected.version,publishedUrl:publishUrl.trim()||null}}),"Publication recorded.");}}>
          <input className="field" aria-label="Published post URL" type="url" placeholder="https://published-post-link"
            value={publishUrl} onChange={e=>setPublishUrl(e.target.value)}/>
          <button className="btn-primary" disabled={busy}>Record as published</button>
        </form>}
      {canManage&&["IDEA","DRAFT","CHANGES_REQUESTED","APPROVED","SCHEDULED"].includes(selected.status)&&
        <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void perform(()=>
          request("/content/"+selected.id+"/cancel",{method:"POST",body:{version:selected.version}}),"Content cancelled.")}>Cancel content</button>}
      {selected.approvalRequestId&&selected.status==="IN_REVIEW"&&<Link className="btn-secondary" href="/app/approvals">Review in Approvals</Link>}
     </div>
     {selected.status==="IN_REVIEW"&&<p className="text-xs text-slate-500">Editing is locked during review. Reject or cancel the request in Approvals before changing this revision.</p>}
     {selected.status==="PUBLISHED"&&<p className="text-sm text-slate-500">
       Published {selected.publishedAt?localTime(selected.publishedAt):""}
       {selected.publishedUrl&&<> · <a className="text-indigo-600 underline" href={selected.publishedUrl} target="_blank" rel="noopener noreferrer">View published post</a></>}
      </p>}
     <div className="border-t pt-3"><h3 className="text-sm font-semibold">Revision history</h3>
       <div className="mt-2 flex flex-wrap gap-2">{selected.revisions.map(x=>
        <span key={x.revision} className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          v{x.revision} · {new Date(x.createdAt).toLocaleDateString()}</span>)}</div>
     </div>
    </div>
  </Card>}
 </div>;
}
