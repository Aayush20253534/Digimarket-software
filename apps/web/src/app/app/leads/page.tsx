"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Download, Plus, RefreshCw, Upload } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ApiError, type StaffUser } from "@/lib/api";
import { Card, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Stage="NEW"|"CONTACTED"|"QUALIFIED"|"PROPOSAL"|"WON"|"LOST";
const stages:Stage[]=["NEW","CONTACTED","QUALIFIED","PROPOSAL","WON","LOST"];
type Lead={id:string;businessName:string;contactName:string|null;phone:string|null;businessType:string|null;
 location:string|null;websiteUrl:string|null;instagramUrl:string|null;source:string|null;
 status:Stage;assignedToId:string|null;createdById:string;nextFollowUpAt:string|null;
 version:number;createdAt:string;canEdit?:boolean;assignee?:{displayName:string}|null};
type Activity={id:string;kind:string;note:string|null;createdAt:string;actor:{displayName:string}};
type Duplicate={id:string;reason:string;resolution:string;lead:{id:string;businessName:string;phone:string|null};
 candidate:{id:string;businessName:string;phone:string|null}};
type Detail=Lead&{activities:Activity[];duplicates:Duplicate[];canEdit:boolean};
type Page={items:Lead[];nextCursor:string|null};
type NewLead={businessName:string;contactName:string;phone:string;businessType:string;location:string;websiteUrl:string;instagramUrl:string;source:string;note:string};
const blank:NewLead={businessName:"",contactName:"",phone:"",businessType:"",location:"",websiteUrl:"",instagramUrl:"",source:"",note:""};
const errText=(e:unknown)=>e instanceof ApiError?e.message:"Lead request failed.";
function fmt(date:string|null){return date?new Date(date).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short"}):"Not set";}
function decodeCSV(text:string){
 const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
 for(let i=0;i<text.length;i++){
   const c=text[i];
   if(c==='"'){if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
   else if(!quoted&&c===","){row.push(field);field="";}
   else if(!quoted&&(c==="\n"||c==="\r")){if(c==="\r"&&text[i+1]==="\n")i++;row.push(field);if(row.some(x=>x.trim()))rows.push(row);row=[];field="";}
   else field+=c;
 }
 if(quoted)throw new Error("Unclosed CSV quoted field");
 row.push(field);if(row.some(x=>x.trim()))rows.push(row);
 return rows;
}
const formKeys=["businessName","contactName","phone","businessType","location","websiteUrl","instagramUrl","source"] as const;
const headers:Record<string,string>={business_name:"businessName",contact_name:"contactName",business_type:"businessType",
 website_url:"websiteUrl",instagram_url:"instagramUrl",businessName:"businessName",contactName:"contactName",
 businessType:"businessType",websiteUrl:"websiteUrl",instagramUrl:"instagramUrl",phone:"phone",location:"location",source:"source"};
export default function LeadsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("leads.read");
 const canConvert=!!session?.identity.permissions.includes("leads.convert")&&!!session?.identity.permissions.includes("clients.create");
 const canCreate=!!session?.identity.permissions.includes("leads.create");
 const canAssign=!!session?.identity.permissions.includes("leads.assign");
 const canBulk=!!session?.identity.permissions.includes("leads.bulk");
 const canReview=!!session?.identity.permissions.includes("leads.duplicates.review");
 const [items,setItems]=useState<Lead[]>([]);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [legacySort,setLegacySort]=useState(false);
 const [cursor,setCursor]=useState<string|null>(null);
 const [stage,setStage]=useState("");
 const [search,setSearch]=useState("");
 const [history,setHistory]=useState<string[]>([]);
 const [sortBy,setSortBy]=useState<"businessName"|"contactName"|"location"|"status"|"nextFollowUpAt">("businessName"),[descending,setDescending]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [created,setCreated]=useState<NewLead>(blank);
 const [creating,setCreating]=useState(false);
 const [selected,setSelected]=useState<Detail|null>(null);
 const [editStage,setEditStage]=useState<Stage>("NEW");
 const [followup,setFollowup]=useState("");
 const [owner,setOwner]=useState("");
 const [note,setNote]=useState("");
 const [staff,setStaff]=useState<StaffUser[]>([]);
 const [duplicates,setDuplicates]=useState<Duplicate[]>([]);
 const [csvRows,setCsvRows]=useState<NewLead[]>([]);
 const [batchId,setBatchId]=useState<string>("");
 const [csvError,setCsvError]=useState("");
 const [updating,setUpdating]=useState({businessName:"",contactName:"",phone:"",businessType:"",location:"",source:"",websiteUrl:"",instagramUrl:""});
 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   setLoading(true);
   try{
     const q=new URLSearchParams({limit:"30",sort:sortBy,direction:descending?"desc":"asc"});
     if(stage)q.set("stage",stage);if(search.trim())q.set("q",search.trim());
     if(cursor)q.set("cursor",cursor);
     let result:Page;
     try{result=await request<Page>("/leads?"+q);setLegacySort(false);}
     catch(e){
      if(!(e instanceof ApiError)||e.status!==422)throw e;
      q.delete("sort");q.delete("direction");
      result=await request<Page>("/leads?"+q);setLegacySort(true);
     }
     setItems(result.items);setNextCursor(result.nextCursor);setError("");
   }catch(e){setError(errText(e));}finally{setLoading(false);}
 },[canRead,request,stage,search,cursor,sortBy,descending]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{if(!canAssign)return;void request<StaffUser[]>("/leads/assignees").then(setStaff).catch(()=>{});},[canAssign,request]);
 const open=async(id:string)=>{
   setError("");try{
     const detail=await request<Detail>("/leads/"+id);
     setSelected(detail);setEditStage(detail.status);setOwner(detail.assignedToId??"");
     setFollowup(detail.nextFollowUpAt?new Date(detail.nextFollowUpAt).toISOString().slice(0,16):"");
     setNote("");
     setUpdating({businessName:detail.businessName,contactName:detail.contactName??"",phone:detail.phone??"",
       businessType:detail.businessType??"",location:detail.location??"",source:detail.source??"",
       websiteUrl:detail.websiteUrl??"",instagramUrl:detail.instagramUrl??""});
   }catch(e){setError(errText(e));}
 };
 async function convert(){
   if(!selected)return;setBusy(true);setError("");setMessage("");
   try{
     const client=await request<{id:string}>("/leads/"+selected.id+"/convert",{method:"POST",body:{version:selected.version}});
     setMessage("Won lead converted into a client. The record is now linked in Clients.");
     await open(selected.id);await load();
     if(!client.id)throw new Error("Client conversion did not return an ID");
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function create(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");setMessage("");
   try{
     const data=await request<Lead>("/leads",{method:"POST",body:created});
     setCreated(blank);setCreating(false);setMessage("Lead created. Potential duplicates will be flagged for human review.");
     setCursor(null);await load();await open(data.id);
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function edit(e:FormEvent){
   e.preventDefault();if(!selected)return;setBusy(true);setError("");
   try{
     await request("/leads/"+selected.id,{method:"PUT",body:{...updating,status:editStage,
       nextFollowUpAt:followup?new Date(followup).toISOString():"",version:selected.version}});
     setMessage("Lead updated and activity recorded.");await open(selected.id);await load();
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
 async function loadDuplicates(){
   try{setDuplicates(await request<Duplicate[]>("/leads/duplicates"));setError("");}
   catch(e){setError(errText(e));}
 }
 async function review(id:string,resolution:"CONFIRMED"|"DISMISSED"){
   setBusy(true);
   try{
     await request("/leads/duplicates/"+id+"/review",{method:"POST",body:{resolution}});
     setMessage("Duplicate signal reviewed. No leads were automatically merged.");
     await loadDuplicates();if(selected)await open(selected.id);
   }catch(e){setError(errText(e));}finally{setBusy(false);}
 }
 async function readCSV(file:File|undefined){
   if(!file)return;
   setCsvError("");
   try{
     if(file.size>100_000)throw new Error("CSV must be under 100 KB");
     const rows=decodeCSV(await file.text());
     if(rows.length<2)throw new Error("Provide CSV headers and at least one lead");
     if(rows.length>51)throw new Error("Import up to 50 leads per batch");
     const header=rows[0].map(x=>headers[x.trim().replace(/^\uFEFF/,"")]??"");
     if(!header.includes("businessName"))throw new Error("CSV needs business_name or businessName header");
     const data=rows.slice(1).map(columns=>{
       const obj:NewLead={...blank};
       for(let i=0;i<header.length;i++){
         const k=header[i] as keyof NewLead;
         if(formKeys.includes(k as (typeof formKeys)[number]))obj[k]=(columns[i]??"").trim();
       }
       return obj;
     });
     if(data.some(r=>!r.businessName||r.businessName.length<2))throw new Error("Every lead needs a business name");
     setCsvRows(data);setBatchId(crypto.randomUUID());
   }catch(e){setCsvError(e instanceof Error?e.message:"Invalid CSV");setCsvRows([]);}
 }
 async function importRows(){
   if(!csvRows.length||!batchId)return;setBusy(true);setError("");
   try{
     const result=await request<{count:number}>("/leads/import",{method:"POST",body:{batchId,rows:csvRows}});
     setMessage("Imported "+result.count+" leads. Possible duplicates are flagged, not merged.");
     setCsvRows([]);setBatchId("");setCursor(null);await load();
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
 const sorted=useMemo(()=>legacySort?[...items].sort((a,b)=>{
  const delta=String(a[sortBy]??"").localeCompare(String(b[sortBy]??""),undefined,{numeric:true,sensitivity:"base"});
  return descending?-delta:delta;
 }):items,[items,sortBy,descending,legacySort]);
 if(!session)return <Spinner label="Checking CRM access…"/>;
 if(!canRead)return <><PageHeader title="Leads access denied"/><Notice kind="error">Your account cannot view shared leads.</Notice></>;
 return <div data-aw-module="leads" className="aw-module-root space-y-7">
   <PageHeader eyebrow="Sales pipeline" title="Leads CRM"
     description="Shared agency prospects, ownership, pipeline stages and follow-ups. Won leads can be converted to client records by authorized staff."
     actions={<div className="flex flex-wrap gap-2">
       {canCreate&&<button className="btn-primary" type="button" onClick={()=>setCreating(x=>!x)} aria-expanded={creating}>
        <Plus className="h-4 w-4"/>{creating?"Hide lead form":"Add lead"}</button>}
       {canBulk&&<button className="btn-secondary" type="button" disabled={busy} onClick={()=>void download()}><Download className="h-4 w-4"/>Export</button>}
       <button className="btn-secondary" type="button" onClick={()=>void load()}><RefreshCw className="h-4 w-4"/>Refresh</button>
     </div>}/>
   {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Leads pipeline</span><span className="aw-module-count">{items.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{stage||"All stages"}</span></div>}
   {error&&<Notice kind="error">{error}</Notice>}
   {message&&<Notice kind="success">{message}</Notice>}
   <div className="aw-directory-layout">
     <div className="space-y-5">
       <Card title="Lead register" description="Live agency prospects and assigned follow-ups.">
         <div className="aw-lead-toolbar">
           <input aria-label="Search leads" className="field min-w-[175px] flex-1" value={search}
             onChange={e=>{setSearch(e.target.value);setCursor(null);setHistory([]);}} placeholder="Search business, contact, city, phone"/>
           <select aria-label="Filter by stage" className="field" value={stage} onChange={e=>{setStage(e.target.value);setCursor(null);setHistory([]);}}>
             <option value="">All stages</option>{stages.map(x=><option key={x}>{x}</option>)}
           </select>
<select className="field" aria-label="Sort leads on this page" value={sortBy} onChange={e=>{setSortBy(e.target.value as typeof sortBy);setCursor(null);setHistory([]);}}>
  <option value="businessName">Business</option><option value="contactName">Contact</option><option value="location">Location</option><option value="status">Stage</option><option value="nextFollowUpAt">Follow-up</option>
 </select><button type="button" className="btn-secondary" aria-label="Reverse lead sort" onClick={()=>{setDescending(x=>!x);setCursor(null);setHistory([]);}}>{descending?"Descending ↓":"Ascending ↑"}</button>
         </div>
         {loading&&<Spinner label="Loading leads…"/>}
          {!loading&&!items.length&&<p className="aw-directory-empty-line">No matching leads. Add a prospect or change the filters.</p>}
          <div className="aw-register-scroll mt-4"><table className="aw-register-table" aria-label="Leads directory">
            <thead><tr><th>Business / contact</th><th>Phone</th><th>Location</th><th>Stage</th><th>Assigned to</th><th>Follow-up</th><th>Details</th></tr></thead>
            <tbody>{sorted.map(l=><tr key={l.id} className={selected?.id===l.id?"aw-register-selected":""}>
             <td><strong>{l.businessName}</strong><span>{l.contactName||"No contact"}</span></td>
             <td>{l.phone||"—"}</td><td>{l.location||"—"}</td><td><StatusBadge status={l.status}/></td>
             <td>{l.assignee?.displayName||"Unassigned"}</td><td>{fmt(l.nextFollowUpAt)}</td>
             <td><button type="button" className="aw-register-open" onClick={()=>void open(l.id)}>Open</button></td>
            </tr>)}</tbody></table></div>
         <div className="mt-4 flex items-center justify-between gap-3">
           <button className="btn-secondary" disabled={!history.length||loading} onClick={()=>{setCursor(history[history.length-1]||null);setHistory(h=>h.slice(0,-1));}}>Previous</button><span className="aw-register-page">Page {history.length+1}</span>
           <button className="btn-secondary" disabled={!nextCursor||loading} onClick={()=>{setHistory(h=>[...h,cursor||""]);setCursor(nextCursor);}}>Next page</button>
         </div>
       </Card>
       {canCreate&&creating&&<div className="aw-register-drawer" role="dialog" aria-modal="true" aria-label="Add lead form">
  <div className="aw-register-drawer-head"><strong>New prospect</strong><button type="button" className="btn-secondary" onClick={()=>setCreating(false)}>Close lead form</button></div>
  <Card title="Create a lead" description="Lead notes are preserved in the private activity timeline.">
         <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
           {([
             ["businessName","Business name",true],["contactName","Contact name",false],
             ["phone","Phone",false],["businessType","Business type",false],
             ["location","City / location",false],["source","Source",false],
             ["websiteUrl","Website URL",false],["instagramUrl","Instagram URL",false],
             ["note","First note",false],
           ] as const).map(([field,label,required])=><FormField key={field} id={"new-"+field} label={label}>
             <input id={"new-"+field} className="field" required={required} maxLength={field==="note"?2000:500}
               value={created[field]} onChange={e=>setCreated(v=>({...v,[field]:e.target.value}))}/>
           </FormField>)}
           <div className="sm:col-span-2"><button className="btn-primary" disabled={busy} type="submit">Create lead</button></div>
         </form>
       </Card></div>}
     </div>
     <div className="space-y-5">
       {selected?<Card title={"Lead: "+selected.businessName} description={"Version "+selected.version+" · "+selected.status}>
         <div className="space-y-5">
           <p className="text-xs text-slate-500">Created {fmt(selected.createdAt)} · {selected.source||"No source"}</p>
           {canConvert&&selected.status==="WON"&&<div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3">
             <p className="mb-2 text-xs text-indigo-800">Create one linked client profile from this won lead. Repeat conversions are rejected.</p>
             <button className="btn-primary" type="button" disabled={busy} onClick={()=>void convert()}>Convert to client</button>
             <Link href="/app/clients" className="ml-3 text-sm text-indigo-700 underline">View clients</Link>
           </div>}
           {selected.canEdit?<form onSubmit={edit} className="space-y-3">
             {(["businessName","contactName","phone","businessType","location","source","websiteUrl","instagramUrl"] as const).map(k=>
               <FormField key={k} id={"edit-"+k} label={"Edit "+k.replace(/([A-Z])/g," $1")}>
                 <input id={"edit-"+k} className="field" value={updating[k]} onChange={e=>setUpdating(v=>({...v,[k]:e.target.value}))}/>
               </FormField>)}
             <FormField id="edit-stage" label="Stage"><select id="edit-stage" className="field" value={editStage}
               onChange={e=>setEditStage(e.target.value as Stage)}>{stages.map(x=><option key={x}>{x}</option>)}</select></FormField>
             <FormField id="edit-follow" label="Next follow-up"><input id="edit-follow" type="datetime-local" className="field" value={followup}
               onChange={e=>setFollowup(e.target.value)}/></FormField>
             <button className="btn-primary" type="submit" disabled={busy}>Save details and stage</button>
           </form>:<p className="text-sm text-slate-600">Basic lead details are shared; editing and private activity require assignment or permission.</p>}
           {canAssign&&<form className="space-y-2 border-t pt-4" onSubmit={assign}>
             <FormField id="lead-owner" label="Assigned owner"><select id="lead-owner" className="field" value={owner} onChange={e=>setOwner(e.target.value)}>
               <option value="">Unassigned</option>{staff.filter(u=>u.status==="ACTIVE").map(u=><option key={u.id} value={u.id}>{u.displayName} ({u.loginId})</option>)}
             </select></FormField>
             <button className="btn-secondary" type="submit" disabled={busy}>Update owner</button>
           </form>}
           {selected.canEdit&&<form className="space-y-2 border-t pt-4" onSubmit={saveNote}>
             <FormField id="activity-note" label="Activity note"><textarea id="activity-note" className="field min-h-20" required maxLength={2000}
               value={note} onChange={e=>setNote(e.target.value)}/></FormField>
             <button className="btn-secondary" type="submit" disabled={busy||!note.trim()}>Add note</button>
           </form>}
           {selected.canEdit&&<div className="border-t pt-4">
             <h3 className="font-semibold">Activity timeline</h3>
             <div className="mt-3 space-y-2">{selected.activities.map(a=><div key={a.id} className="rounded-lg bg-slate-50 p-3 text-xs">
               <p className="font-semibold">{a.kind.replaceAll("_"," ")} · {a.actor.displayName}</p>
               {a.note&&<p className="mt-1 whitespace-pre-wrap">{a.note}</p>}
               <p className="mt-1 text-slate-500">{fmt(a.createdAt)}</p>
             </div>)}</div>
           </div>}
         </div>
       </Card>:null}
       {canReview&&<Card title="Potential duplicates" description="Matches use normalized phone or business name. Reviewing never merges records.">
         <button type="button" className="btn-secondary" onClick={()=>void loadDuplicates()}>Load suspected duplicates</button>
         <div className="mt-3 space-y-3">{duplicates.map(d=><div key={d.id} className="rounded-lg border p-3 text-sm">
           <p className="font-semibold">{d.lead.businessName} / {d.candidate.businessName}</p>
           <p className="text-xs text-slate-500">{d.reason} · {d.resolution}</p>
           {d.resolution==="OPEN"&&<div className="mt-2 flex gap-2">
             <button className="btn-secondary" disabled={busy} onClick={()=>void review(d.id,"CONFIRMED")}>Confirm match</button>
             <button className="btn-secondary" disabled={busy} onClick={()=>void review(d.id,"DISMISSED")}>Not a duplicate</button>
           </div>}
         </div>)}</div>
       </Card>}
       {canBulk&&<Card title="CSV import" description="Upload up to 50 prospects per batch. Requires business_name column. All rows validate before insertion.">
         <label htmlFor="lead-import-file" className="block text-sm font-semibold">Select CSV</label>
         <input id="lead-import-file" type="file" accept=".csv,text/csv" onChange={e=>void readCSV(e.target.files?.[0])}
           className="mt-2 block w-full text-sm"/>
         {csvError&&<Notice kind="error">{csvError}</Notice>}
         {csvRows.length>0&&<p className="mt-2 text-sm">{csvRows.length} lead rows ready for import</p>}
         <button className="btn-primary mt-3" type="button" disabled={busy||!csvRows.length} onClick={()=>void importRows()}>
           <Upload className="h-4 w-4"/>Import validated rows
         </button>
       </Card>}
     </div>
   </div>
 </div>;
}
