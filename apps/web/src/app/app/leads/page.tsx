"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, MapPin, PhoneCall, Plus, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { DirectoryModal } from "@/components/directory-modal";
import { ApiError, type StaffUser } from "@/lib/api";
import { Card, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Stage="PENDING"|"YET_TO_CALL"|"CALL_NOT_PICKING"|"CALL_BUSY"|"FOLLOW_UP"|"MEETING_PROCESS"|"DECISION_PENDING"|"AGREEMENT_PENDING"|"APPROVED"|"REJECTED";
const stages:Stage[]=["PENDING","YET_TO_CALL","CALL_NOT_PICKING","CALL_BUSY","FOLLOW_UP","MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","APPROVED","REJECTED"];
const stageLabel=(s:Stage)=>s.replaceAll("_"," ");
type Lead={id:string;businessName:string;contactName:string|null;phone:string|null;businessType:string|null;
 location:string|null;googleMapsUrl:string|null;websiteUrl:string|null;instagramUrl:string|null;source:string|null;
 status:Stage;stageNote?:string;assignedToId:string|null;createdById:string;nextFollowUpAt:string|null;meetingAt:string|null;
 version:number;createdAt:string;canEdit?:boolean;assignee?:{displayName:string}|null};
type Activity={id:string;kind:string;note:string|null;createdAt:string;actor:{displayName:string}};
type Detail=Lead&{activities:Activity[];canEdit:boolean};
type Page={items:Lead[];nextCursor:string|null;total:number};
type Metrics={total:number;pending:number;yetToCall:number;meetingProcess:number;decisionPending:number;agreementPending:number;followUp:number;approved:number;rejected:number;converted:number;conversionRatePercent:number};
type LeadSource="COLD_CALL"|"META_LEADS"|"REFERRAL";
const leadSources:{value:LeadSource;label:string}[]=[{value:"COLD_CALL",label:"Cold Call"},{value:"META_LEADS",label:"Meta Leads"},{value:"REFERRAL",label:"Referral"}];
const sourceLabel=(value:string|null)=>value==="META_LEADS"||value==="WHATSAPP"?"Meta Leads":value==="COLD_CALL"||!value?"Cold Call":value==="REFERRAL"?"Referral":value;
const draftKey=(id:string)=>"amplifyworld:lead-stage-note:"+id;
const callHref=(value:string)=>"tel:"+(value.trim().startsWith("+")?"+":"")+value.replace(/\D/g,"");
type NewLead={phone:string;source:LeadSource};
const blank:NewLead={phone:"",source:"COLD_CALL"};
type SortKey="businessName"|"contactName"|"status"|"createdAt";
const sortKeys:SortKey[]=["businessName","contactName","status","createdAt"];
const leadPreferencesKey=(userId:string)=>"amplifyworld:leads:preferences:"+userId;
const errText=(e:unknown)=>e instanceof ApiError?e.message:"Lead request failed.";
function fmt(date:string|null){return date?new Date(date).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Not set";}
export default function LeadsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read");
 const isAdmin=!!session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN");
 const canDelete=!!session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN"||role==="FOUNDER");
 const canCreate=!isAdmin&&!!session?.identity.permissions.includes("leads.create");
 const canAssign=!isAdmin&&!!session?.identity.permissions.includes("leads.assign");
 const canBulk=!isAdmin&&!!session?.identity.permissions.includes("leads.bulk");
 const [items,setItems]=useState<Lead[]>([]);
 const [totalLeads,setTotalLeads]=useState<number|null>(null);
 const [metrics,setMetrics]=useState<Metrics|null>(null);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [legacySort,setLegacySort]=useState(false);
 const [cursor,setCursor]=useState<string|null>(null);
 const [stage,setStage]=useState("");
 const [sourceFilter,setSourceFilter]=useState<""|LeadSource>("");
 const [search,setSearch]=useState("");
 const [history,setHistory]=useState<string[]>([]);
 const [sortBy,setSortBy]=useState<SortKey>("createdAt"),[descending,setDescending]=useState(false);
 const [preferencesReady,setPreferencesReady]=useState(false);
 const loadSequence=useRef(0);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [created,setCreated]=useState<NewLead>(blank);
 const [creating,setCreating]=useState(false);
 const [selected,setSelected]=useState<Detail|null>(null);
 const [editStage,setEditStage]=useState<Stage>("PENDING");
 const [followUpOn,setFollowUpOn]=useState("");
 const [meetingOn,setMeetingOn]=useState("");
 const [meetingTime,setMeetingTime]=useState("");
 const [editSource,setEditSource]=useState<LeadSource>("COLD_CALL");
 const [stageNote,setStageNote]=useState("");
 const [noteSaveState,setNoteSaveState]=useState<"idle"|"saving"|"saved"|"error">("idle");
 const noteWriteQueue=useRef<Promise<unknown>>(Promise.resolve());
 const latestStageNote=useRef("");
 const activeLeadId=useRef<string|null>(null);
 const [owner,setOwner]=useState("");
 const [note,setNote]=useState("");
 const [staff,setStaff]=useState<StaffUser[]>([]);
 const [updating,setUpdating]=useState({businessName:"",contactName:"",businessType:"",location:"",googleMapsUrl:""});
 // Persist only display preferences, never lead details or auth credentials.
 useEffect(()=>{
   const userId=session?.identity.userId;
   if(!canRead||!userId){setPreferencesReady(false);return;}
   setPreferencesReady(false);
   try{
     const stored=window.localStorage.getItem(leadPreferencesKey(userId));
     if(stored){
       const value:unknown=JSON.parse(stored);
       if(value&&typeof value==="object"){
         const pref=value as Record<string,unknown>;
         if(pref.stage===""||stages.includes(pref.stage as Stage))setStage(pref.stage as string);
         if(pref.sourceFilter===""||pref.sourceFilter==="COLD_CALL"||pref.sourceFilter==="META_LEADS"||pref.sourceFilter==="REFERRAL")
           setSourceFilter(pref.sourceFilter as ""|LeadSource);
         if(typeof pref.search==="string")setSearch(pref.search.slice(0,100));
         if(sortKeys.includes(pref.sortBy as SortKey))setSortBy(pref.sortBy as SortKey);
         if(typeof pref.descending==="boolean")setDescending(pref.descending);
       }
     }
   }catch{/* Browser storage might be unavailable or cleared. */}
   setCursor(null);setHistory([]);setTotalLeads(null);setPreferencesReady(true);
 },[canRead,session?.identity.userId]);
 useEffect(()=>{
   if(!preferencesReady||!session?.identity.userId)return;
   try{window.localStorage.setItem(leadPreferencesKey(session.identity.userId),
     JSON.stringify({stage,sourceFilter,search,sortBy,descending}));}
   catch{/* Optional view preferences. */}
 },[preferencesReady,session?.identity.userId,stage,sourceFilter,search,sortBy,descending]);
 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   if(!preferencesReady)return;
   const sequence=++loadSequence.current;
   setLoading(true);
   try{
     const q=new URLSearchParams({limit:"10",sort:sortBy,direction:descending?"desc":"asc"});
     if(stage)q.set("stage",stage);if(sourceFilter)q.set("source",sourceFilter);if(search.trim())q.set("q",search.trim());
     if(cursor)q.set("cursor",cursor);
     let result:Page;
     try{result=await request<Page>("/leads?"+q);setLegacySort(false);}
     catch(e){
      if(!(e instanceof ApiError)||e.status!==422)throw e;
      q.delete("sort");q.delete("direction");
      result=await request<Page>("/leads?"+q);setLegacySort(true);
     }
     if(sequence!==loadSequence.current)return;
     setItems(result.items);setNextCursor(result.nextCursor);setTotalLeads(result.total);setError("");
     void request<Metrics>("/leads/metrics").then(result=>{
       if(sequence===loadSequence.current)setMetrics(result);
     }).catch(()=>{});
   }catch(e){if(sequence===loadSequence.current)setError(errText(e));}
   finally{if(sequence===loadSequence.current)setLoading(false);}
 },[canRead,preferencesReady,request,stage,sourceFilter,search,cursor,sortBy,descending]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!canAssign)return;void request<StaffUser[]>("/leads/assignees").then(setStaff).catch(()=>{});},[canAssign,request]);
 const focusedRef=useRef(false);
 const open=async(id:string)=>{
   setError("");try{
     const detail=await request<Detail>("/leads/"+id);
     activeLeadId.current=id;
     setSelected(detail);setEditStage(detail.status);setFollowUpOn(detail.nextFollowUpAt?.slice(0,10)??"");
     const savedMeeting=detail.meetingAt?new Date(new Date(detail.meetingAt).getTime()+330*60_000).toISOString().slice(0,16):"";
     setMeetingOn(savedMeeting.slice(0,10));setMeetingTime(savedMeeting.slice(11,16));setEditSource(detail.source==="META_LEADS"||detail.source==="WHATSAPP"?"META_LEADS":detail.source==="REFERRAL"?"REFERRAL":"COLD_CALL");setOwner(detail.assignedToId??"");
     let draft:string|null=null;try{draft=window.localStorage.getItem(draftKey(id));}catch{ /* Browser storage may be unavailable. */ }
     latestStageNote.current=draft??detail.stageNote??"";
     setNote("");setStageNote(latestStageNote.current);setNoteSaveState(draft===null?"idle":"saving");
     setUpdating({businessName:detail.businessName.startsWith("Lead ")? "":detail.businessName,
       contactName:detail.contactName??"",businessType:detail.businessType??"",location:detail.location??"",googleMapsUrl:detail.googleMapsUrl??""});
   }catch(e){setError(errText(e));}
 };
 useEffect(()=>{
  if(!selected?.canEdit||isAdmin||stageNote===(selected.stageNote??""))return;
  const leadId=selected.id,noteText=stageNote;
  const timer=window.setTimeout(()=>{
   if(activeLeadId.current===leadId)setNoteSaveState("saving");
   const write=noteWriteQueue.current.catch(()=>{}).then(()=>
     request<Lead>("/leads/"+leadId+"/stage-note",{method:"PUT",body:{note:noteText}}));
   noteWriteQueue.current=write;
   void write.then(saved=>{
     setSelected(current=>current?.id===leadId?{...current,stageNote:saved.stageNote??""}:current);
     setItems(current=>current.map(x=>x.id===leadId?{...x,stageNote:saved.stageNote??""}:x));
     if(activeLeadId.current===leadId&&latestStageNote.current===noteText){
       try{if(window.localStorage.getItem(draftKey(leadId))===noteText)window.localStorage.removeItem(draftKey(leadId));}catch{ /* Browser storage may be unavailable. */ }
       setNoteSaveState("saved");
     }
   }).catch(e=>{
     if(activeLeadId.current===leadId){setNoteSaveState("error");setError(errText(e));}
   });
  },800);
  return ()=>window.clearTimeout(timer);
 },[selected?.id,selected?.canEdit,selected?.stageNote,stageNote,isAdmin,request]);
 useEffect(()=>{
  if(focusedRef.current||!canRead)return;
  const id=new URLSearchParams(window.location.search).get("focus");
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
  focusedRef.current=true;void open(id);
 },[canRead]);
 async function create(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");setMessage("");
   try{
     const data=await request<Lead>("/leads",{method:"POST",body:created});
     setCreated(blank);setCreating(false);setMessage("Lead added to PENDING as "+sourceLabel(created.source)+".");
     setCursor(null);await load();await open(data.id);
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function edit(e:FormEvent){
   e.preventDefault();if(!selected)return;
   if(editStage==="FOLLOW_UP"&&!followUpOn){setError("Select a follow-up date before saving.");return;}
   if(editStage==="MEETING_PROCESS"&&(!meetingOn||!meetingTime)){
     setError("Select both a meeting date and time before saving.");return;
   }
   setBusy(true);setError("");
   try{
     await noteWriteQueue.current;
     await request("/leads/"+selected.id,{method:"PUT",body:{...updating,source:editSource,status:editStage,
       followUpOn:editStage==="FOLLOW_UP"?followUpOn:null,
       meetingOn:editStage==="MEETING_PROCESS"?meetingOn:null,
       meetingTime:editStage==="MEETING_PROCESS"?meetingTime:null,
       stageNote,version:selected.version}});
     try{window.localStorage.removeItem(draftKey(selected.id));}catch{ /* Browser storage may be unavailable. */ }
     setMessage(editStage==="APPROVED"?"Lead approved and automatically added to Clients.":editStage==="REJECTED"?"Lead marked Rejected.":"Shared lead and status note saved.");await open(selected.id);await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function deleteLead(){
   if(!selected||!canDelete)return;
   if(!window.confirm("Permanently delete this lead from the database? Its lead notes and activity will be removed. Converted client records are preserved. This cannot be undone."))return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/leads/"+selected.id,{method:"DELETE",body:{version:selected.version}});
     setSelected(null);setCursor(null);setHistory([]);
     setMessage("Lead permanently deleted from the database. Linked clients are preserved.");
     await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function assign(e:FormEvent){
   e.preventDefault();if(!selected)return;setBusy(true);setError("");
   try{
     await request("/leads/"+selected.id+"/assign",{method:"PUT",
       body:{version:selected.version,assignedToId:owner||null}});
     setMessage("Lead ownership updated.");await open(selected.id);await load();
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function saveNote(e:FormEvent){
   e.preventDefault();if(!selected)return;setBusy(true);setError("");
   try{
     await request("/leads/"+selected.id+"/notes",{method:"POST",body:{note}});
     setMessage("Activity note added.");await open(selected.id);
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function download(){
   setBusy(true);setError("");
   try{
     const result=await request<{filename:string;csv:string}>("/leads/export");
     const u=URL.createObjectURL(new Blob([result.csv],{type:"text/csv;charset=utf-8"}));
     const a=document.createElement("a");a.href=u;a.download=result.filename;a.click();URL.revokeObjectURL(u);
     setMessage("Organization CSV exported and recorded in audit history.");
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 const leadsPage=history.length+1;
 const leadsPageCount=totalLeads===null?null:Math.max(1,Math.ceil(totalLeads/10));
 const leadsRangeStart=totalLeads===null||totalLeads===0?0:(leadsPage-1)*10+1;
 const leadsRangeEnd=totalLeads===null?0:Math.min((leadsPage-1)*10+items.length,totalLeads);
 const sorted=useMemo(()=>legacySort?[...items].sort((a,b)=>{
  const delta=String(a[sortBy]??"").localeCompare(String(b[sortBy]??""),undefined,{numeric:true,sensitivity:"base"});
  return descending?-delta:delta;
 }):items,[items,sortBy,descending,legacySort]);
 if(!session)return <Spinner label="Checking CRM access…"/>;
 if(!canRead)return <><PageHeader title="Leads access denied"/><Notice kind="error">Your account cannot view shared leads.</Notice></>;
 return <div data-aw-module="leads" className="aw-module-root space-y-7">
   <PageHeader eyebrow="Sales pipeline" title="Leads CRM"
     description="Track Cold Call, Meta Leads and Referral separately. New WhatsApp leads are automatically classified as Meta Leads."
     actions={<div className="flex flex-wrap gap-2">
       {canCreate&&<button className="btn-primary" type="button" onClick={()=>setCreating(x=>!x)} aria-expanded={creating}>
        <Plus className="h-4 w-4"/>{creating?"Hide lead form":"Add lead"}</button>}
       {canBulk&&<button className="btn-secondary" type="button" disabled={busy} onClick={()=>void download()}><Download className="h-4 w-4"/>Export</button>}
       <button className="btn-secondary" type="button" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button>
     </div>}/>
   {metrics&&<section aria-label="CRM pipeline summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-8">
     {([["Total leads",metrics.total],["Approved clients",metrics.converted],
       ["REJECTED",metrics.rejected],["YET TO CALL",metrics.yetToCall],
       ["MEETING PROCESS",metrics.meetingProcess],["DECISION PENDING",metrics.decisionPending],
       ["AGREEMENT PENDING",metrics.agreementPending],["FOLLOW UP",metrics.followUp]] as const).map(([label,value])=>
       <div key={label} className="rounded-xl border border-slate-200/15 p-3">
         <p className="text-xs text-slate-500">{label}</p>
         <p className="mt-1 text-xl font-semibold">{value}</p>
       </div>)}
   </section>}
   {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Leads pipeline</span><span className="aw-module-count">{items.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{stage?stageLabel(stage as Stage):"ALL STAGES"}</span></div>}
   {error&&<Notice kind="error">{error}</Notice>}
   {message&&<Notice kind="success">{message}</Notice>}
   <div className="aw-directory-layout">
     <div className="space-y-5">
       <Card title="Lead register" description="Ten leads per page, with automatic creation dates and click-to-open rows. Use Next page for more leads.">
         <div className="aw-lead-toolbar">
           <input aria-label="Search leads" className="field min-w-[175px] flex-1" value={search}
             onChange={e=>{setSearch(e.target.value);setTotalLeads(null);setCursor(null);setHistory([]);}} placeholder="Search name, business or phone"/>
           <select aria-label="Filter by stage" className="field" value={stage} onChange={e=>{setStage(e.target.value);setTotalLeads(null);setCursor(null);setHistory([]);}}>
             <option value="">ALL STAGES</option>{stages.map(x=><option key={x} value={x}>{stageLabel(x)}</option>)}
           </select>
           <select aria-label="Filter by lead source" className="field" value={sourceFilter} onChange={e=>{setSourceFilter(e.target.value as ""|LeadSource);setTotalLeads(null);setCursor(null);setHistory([]);}}>
             <option value="">All sources</option>{leadSources.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
           </select>
<select className="field" aria-label="Sort leads on this page" value={sortBy} onChange={e=>{setSortBy(e.target.value as typeof sortBy);setTotalLeads(null);setCursor(null);setHistory([]);}}>
  <option value="businessName">Business</option><option value="contactName">Contact</option><option value="status">Stage</option><option value="createdAt">Created</option>
 </select><button type="button" className="btn-secondary" aria-label="Reverse lead sort" onClick={()=>{setDescending(x=>!x);setTotalLeads(null);setCursor(null);setHistory([]);}}>{descending?"Descending ↓":"Ascending ↑"}</button>
         </div>
         {loading&&<div className="aw-lead-sync" role="status" aria-live="polite">
           <RefreshCw size={15} className="aw-lead-sync-icon" aria-hidden="true"/>
           {items.length?"Refreshing leads…":"Loading lead records…"}
         </div>}
         {!loading&&!items.length&&<p className="aw-directory-empty-line">No matching leads. Add a prospect or change the filters.</p>}
          <div className="aw-register-scroll mt-4"><table className="aw-register-table" aria-label="Leads directory" aria-busy={loading}>
            <thead><tr><th>Call</th><th>Contact name</th><th>Business name</th><th>Business type</th><th>Source</th><th>Stage</th><th>Date added</th><th>Location</th><th>Meeting / status notes</th></tr></thead>
           <tbody>{loading&&!items.length?
             Array.from({length:5},(_,i)=><tr key={"loading-"+i} aria-hidden="true" className="aw-lead-loading-row">
               {Array.from({length:9},(_,j)=><td key={j}><div className="aw-lead-skeleton"/></td>)}
             </tr>):sorted.map(l=><tr key={l.id} tabIndex={0}
             aria-label={"Open lead "+(l.contactName||l.businessName)}
             className={"aw-lead-clickable"+(selected?.id===l.id?" aw-register-selected":"")}
             onClick={()=>void open(l.id)}
             onKeyDown={e=>{if(e.target!==e.currentTarget)return;
               if(e.key==="Enter"||e.key===" "){e.preventDefault();void open(l.id);}}}>
             <td>{l.phone?<a href={callHref(l.phone)} className="aw-lead-action" aria-label={"Call "+l.phone}
               title={"Call "+l.phone} onClick={e=>e.stopPropagation()}>
               <PhoneCall size={17} aria-hidden="true"/></a>:<span title="No phone number">—</span>}</td>
             <td>{l.contactName||"Name pending"}</td><td>{l.businessName.startsWith("Lead ")?"Business pending":l.businessName}</td>
             <td>{l.businessType||"Not recorded"}</td><td>{sourceLabel(l.source)}</td><td><StatusBadge status={l.status} rectangular uppercase/></td>
             <td><time dateTime={l.createdAt} title="Automatically recorded when this lead was created">{fmt(l.createdAt)}</time></td>
             <td>{l.googleMapsUrl?<a href={l.googleMapsUrl} target="_blank" rel="noopener noreferrer"
               className="aw-lead-action" aria-label={"Open Google Maps for "+(l.contactName||l.businessName)}
               title="Open location in Google Maps" onClick={e=>e.stopPropagation()}>
               <MapPin size={18} aria-hidden="true"/></a>:<span className="aw-lead-no-location" title="Location link not added"><MapPin size={17} aria-hidden="true"/></span>}</td>
             <td className="aw-lead-notes-cell"><div className={"aw-lead-notes-preview"+(!l.stageNote?.trim()?" aw-lead-notes-empty":"")} title={l.stageNote||"No notes yet"}>{l.stageNote?.trim()||"No notes yet"}</div></td>
           </tr>)}</tbody></table></div>
         <div className="mt-4 flex items-center justify-between gap-3">
           <button type="button" className="btn-secondary" aria-label="Previous leads page" disabled={!history.length||loading} onClick={()=>{setCursor(history[history.length-1]||null);setHistory(h=>h.slice(0,-1));}}>Previous</button>
           <span className="aw-register-page" aria-live="polite">{loading?"Loading page…":totalLeads===null?"Lead count unavailable":totalLeads===0?"Page 1 of 1 · Leads 0 of 0":`Page ${leadsPage} of ${leadsPageCount} · Leads ${leadsRangeStart}–${leadsRangeEnd} of ${totalLeads}`}</span>
           <button type="button" className="btn-secondary" aria-label="Next leads page" disabled={!nextCursor||loading} onClick={()=>{setHistory(h=>[...h,cursor||""]);setCursor(nextCursor);}}>Next page</button>
         </div>
       </Card>
       {canCreate&&creating&&<DirectoryModal title="Add lead"
         description="Enter the phone number and select how the lead was acquired. WhatsApp webhook leads are categorized automatically."
         onClose={()=>{if(!busy)setCreating(false);}}>
         <form onSubmit={create} className="space-y-3">
           <FormField id="new-lead-phone" label="Phone number">
             <input id="new-lead-phone" aria-label="Phone number" className="field" type="tel"
               autoFocus required minLength={7} maxLength={40} placeholder="+91 98765 43210"
               value={created.phone} onChange={e=>setCreated(v=>({...v,phone:e.target.value}))}/>
           </FormField>
           <FormField id="new-lead-source" label="Lead source">
             <select id="new-lead-source" aria-label="Lead source" className="field" required
               value={created.source} onChange={e=>setCreated(v=>({...v,source:e.target.value as LeadSource}))}>
               {leadSources.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
             </select>
           </FormField>
           <div className="aw-directory-modal-actions">
             <button className="btn-secondary" type="button" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button>
             <button className="btn-primary" type="submit" disabled={busy}>Add to PENDING</button>
           </div>
         </form>
       </DirectoryModal>}
     </div>
     <div className="space-y-5">
       {selected?<Card title={"Lead: "+selected.businessName} description={"Version "+selected.version+" · "+selected.status}>
         <div className="space-y-5">
           <p className="text-xs text-slate-500">Created {fmt(selected.createdAt)} · Source: {sourceLabel(selected.source)}</p>
           {selected.phone&&<a className="aw-lead-location-link" href={callHref(selected.phone)}>
             <PhoneCall size={16} aria-hidden="true"/>Call {selected.phone}</a>}
           {selected.googleMapsUrl&&!selected.canEdit&&<a className="aw-lead-location-link" href={selected.googleMapsUrl}
             target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true"/>Open location in Google Maps</a>}
           {selected.status==="FOLLOW_UP"&&selected.nextFollowUpAt&&
             <p className="aw-lead-followup-scheduled">Follow-up scheduled for <strong>{new Date(selected.nextFollowUpAt.slice(0,10)+"T12:00:00Z").toLocaleDateString("en-IN",{timeZone:"UTC",dateStyle:"long"})}</strong></p>}
           {selected.status==="MEETING_PROCESS"&&selected.meetingAt&&
             <p className="aw-lead-meeting-scheduled">Meeting scheduled for <strong>{new Date(selected.meetingAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",dateStyle:"long",timeStyle:"short"})} IST</strong></p>}
           {selected.status==="APPROVED"&&<p className="text-sm">Approved. This phone is now linked to a <Link className="underline" href="/app/clients">client record</Link>.</p>}
           {selected.canEdit&&!isAdmin?<form onSubmit={edit} className="space-y-3">
             {(["contactName","businessName","businessType"] as const).map(k=>
               <FormField key={k} id={"edit-"+k} label={k==="contactName"?"Contact name":k==="businessName"?"Business name":"Business type"}>
                 <input id={"edit-"+k} className="field" maxLength={k==="businessName"?180:k==="contactName"?160:120}
                   value={updating[k]} onChange={e=>setUpdating(v=>({...v,[k]:e.target.value}))}/>
               </FormField>)}
             <section aria-label="Lead location" className="aw-lead-location-section">
               <h3 className="text-sm font-semibold">Location</h3>
               <FormField id="edit-location" label="Address">
                 <input id="edit-location" className="field" maxLength={240}
                   placeholder="Meeting address or business location"
                   value={updating.location}
                   onChange={e=>setUpdating(v=>({...v,location:e.target.value}))}/>
               </FormField>
               <FormField id="edit-google-maps-url" label="Google Maps link">
                 <input id="edit-google-maps-url" type="url" className="field" maxLength={1000}
                   placeholder="https://maps.app.goo.gl/..."
                   value={updating.googleMapsUrl}
                   onChange={e=>setUpdating(v=>({...v,googleMapsUrl:e.target.value}))}/>
               </FormField>
               {selected.googleMapsUrl&&<a className="aw-lead-location-link" href={selected.googleMapsUrl}
                 target="_blank" rel="noopener noreferrer"><MapPin size={16} aria-hidden="true"/>View saved location</a>}
             </section>
             <FormField id="edit-source" label="Lead source">
               <select id="edit-source" className="field" value={editSource} onChange={e=>setEditSource(e.target.value as LeadSource)}>
                 {leadSources.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
               </select>
             </FormField>
             <FormField id="edit-stage" label="Lead status"><select id="edit-stage" className="field" value={editStage} disabled={selected.status==="APPROVED"}
               onChange={e=>setEditStage(e.target.value as Stage)}>{stages.map(x=><option key={x} value={x}>{stageLabel(x)}</option>)}</select></FormField>
             {editStage==="FOLLOW_UP"&&<section className="aw-lead-followup-field" aria-label="Follow-up schedule">
               <FormField id="lead-follow-up-on" label="Follow-up date">
                 <input id="lead-follow-up-on" className="field" type="date" required
                   aria-label="Follow-up date" value={followUpOn}
                   onChange={e=>setFollowUpOn(e.target.value)}/>
               </FormField>
               <p>Shown in Overview only on the selected calendar date. Change this date to reschedule.</p>
             </section>}
             {editStage==="MEETING_PROCESS"&&<section className="aw-lead-meeting-field" aria-label="Meeting schedule">
               <FormField id="lead-meeting-on" label="Meeting date">
                 <input id="lead-meeting-on" type="date" className="field" required
                   aria-label="Meeting date" value={meetingOn} onChange={e=>setMeetingOn(e.target.value)}/>
               </FormField>
               <FormField id="lead-meeting-time" label="Meeting time">
                 <input id="lead-meeting-time" type="time" className="field" required
                   aria-label="Meeting time" value={meetingTime} onChange={e=>setMeetingTime(e.target.value)}/>
               </FormField>
               <p>India Standard Time (IST). This meeting appears in Overview only on its scheduled date.</p>
             </section>}
             <FormField id="lead-status-note" label={"Note for "+stageLabel(editStage)}>
               <textarea id="lead-status-note" className="field min-h-20" maxLength={2000}
                 placeholder="Call summary, meeting outcome, or reason for approval"
                 value={stageNote} onChange={e=>{const value=e.target.value;latestStageNote.current=value;setStageNote(value);setNoteSaveState("idle");try{window.localStorage.setItem(draftKey(selected.id),value);}catch{ /* Browser storage may be unavailable. */ }}}/>
               <p className="aw-lead-note-save-state" data-state={noteSaveState} role="status">{noteSaveState==="saving"?"Saving to CRM…":noteSaveState==="saved"?"Saved to CRM":noteSaveState==="error"?"Save failed; draft retained on this device.":"Notes save automatically."}</p>
             </FormField>
             <button className="btn-primary" type="submit" disabled={busy}>Save details and stage</button>
           </form>:<p className="text-sm text-slate-600">Basic lead details are shared; editing and private activity require assignment or permission.</p>}
           {canDelete&&<div className="border-t border-slate-200/20 pt-4">
             <button type="button" className="btn-secondary" disabled={busy} onClick={()=>void deleteLead()}>
               <Trash2 className="mr-2 inline h-4 w-4"/>Delete lead
             </button>
             <p className="mt-2 text-xs text-slate-500">Permanently removes the lead and its CRM activity. Converted clients and deletion audit records remain.</p>
           </div>}
           {canAssign&&<form className="space-y-2 border-t pt-4" onSubmit={assign}>
             <FormField id="lead-owner" label="Assigned owner"><select id="lead-owner" className="field" value={owner} onChange={e=>setOwner(e.target.value)}>
               <option value="">Unassigned</option>{staff.filter(u=>u.status==="ACTIVE").map(u=><option key={u.id} value={u.id}>{u.displayName} ({u.loginId})</option>)}
             </select></FormField>
             <button className="btn-secondary" type="submit" disabled={busy}>Update owner</button>
           </form>}
           {selected.canEdit&&!isAdmin&&<form className="space-y-2 border-t pt-4" onSubmit={saveNote}>
             <FormField id="activity-note" label="Activity note"><textarea id="activity-note" className="field min-h-20" required maxLength={2000}
               value={note} onChange={e=>setNote(e.target.value)}/></FormField>
             <button className="btn-secondary" type="submit" disabled={busy||!note.trim()}>Add note</button>
           </form>}
           {selected.canEdit&&!isAdmin&&<div className="border-t pt-4">
             <h3 className="font-semibold">Activity timeline</h3>
             <div className="mt-3 space-y-2">{selected.activities.map(a=><div key={a.id} className="rounded-lg bg-slate-50 p-3 text-xs">
               <p className="font-semibold">{a.kind.replaceAll("_"," ")} · {a.actor.displayName}</p>
               {a.note&&<p className="mt-1 whitespace-pre-wrap">{a.note}</p>}
               <p className="mt-1 text-slate-500">{fmt(a.createdAt)}</p>
             </div>)}</div>
           </div>}
         </div>
       </Card>:null}

     </div>
   </div>
 </div>;
}
