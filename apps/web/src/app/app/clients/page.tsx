"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Plus, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DirectoryModal, DirectoryDetailsPortal } from "@/components/directory-modal";
import { ApiError } from "@/lib/api";
import { Card, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Status="ACTIVE"|"PAUSED"|"ARCHIVED";
type Contact={id:string;name:string;role:string|null;phone:string|null;email:string|null;isPrimary:boolean};
type Service={id:string;name:string;description:string|null;status:"ACTIVE"|"PAUSED"|"ENDED"};
type Client={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;
 websiteUrl:string|null;instagramUrl:string|null;facebookUrl:string|null;notes:string|null;
 status:Status;version:number;sourceLeadId:string|null;createdAt:string};
type Detail=Client&{contacts:Contact[];services:Service[];sourceLead:{id:string;businessName:string;status:string}|null};
type Register={items:Client[];nextCursor:string|null};
type Editable={businessName:string;businessType:string;phone:string;email:string;location:string;
 websiteUrl:string;instagramUrl:string;facebookUrl:string;notes:string};
const clean:Editable={businessName:"",businessType:"",phone:"",email:"",location:"",
 websiteUrl:"",instagramUrl:"",facebookUrl:"",notes:""};
const editableFields=[
 ["businessName","Business name"],["businessType","Business type"],["phone","Business phone"],
 ["email","Business email"],["location","Address / location"],["websiteUrl","Website URL"],
 ["instagramUrl","Instagram URL"],["facebookUrl","Facebook URL"],["notes","Internal notes"],
] as const;
const readable=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Client request failed";
function fromClient(c:Client):Editable {
 return Object.fromEntries(Object.keys(clean).map(k=>[k,c[k as keyof Editable]??""])) as Editable;
}
export default function ClientsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const canCreate=!!session?.identity.permissions.includes("clients.create");
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const [rows,setRows]=useState<Client[]>([]);
 const [selected,setSelected]=useState<Detail|null>(null);
 const [draft,setDraft]=useState<Editable>(clean);
 const [createDraft,setCreateDraft]=useState<Editable>(clean);
 const [creating,setCreating]=useState(false);
 const [status,setStatus]=useState<Status>("ACTIVE");
 const [filter,setFilter]=useState("");
 const [search,setSearch]=useState("");
 const [history,setHistory]=useState<string[]>([]);
 const [sortBy,setSortBy]=useState<"businessName"|"businessType"|"location"|"status">("businessName"),[descending,setDescending]=useState(false);
 const [cursor,setCursor]=useState<string|null>(null);
 const [nextCursor,setNextCursor]=useState<string|null>(null);
 const [legacySort,setLegacySort]=useState(false);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [message,setMessage]=useState("");
 const [contact,setContact]=useState({name:"",role:"",phone:"",email:"",isPrimary:false});
 const [service,setService]=useState({name:"",description:"",status:"ACTIVE" as Service["status"]});
 const load=useCallback(async()=>{
   if(!canRead){setLoading(false);return;}
   setLoading(true);
   try{
     const q=new URLSearchParams({limit:"30",sort:sortBy,direction:descending?"desc":"asc"});
     if(search.trim())q.set("q",search.trim());
     if(filter)q.set("status",filter);
     if(cursor)q.set("cursor",cursor);
     let result:Register;
     try{result=await request<Register>("/clients?"+q.toString());setLegacySort(false);}
     catch(e){
      if(!(e instanceof ApiError)||e.status!==422)throw e;
      q.delete("sort");q.delete("direction");
      result=await request<Register>("/clients?"+q.toString());setLegacySort(true);
     }
     setRows(result.items);setNextCursor(result.nextCursor);setError("");
   }catch(e){setError(readable(e));}finally{setLoading(false);}
 },[canRead,request,search,filter,cursor,sortBy,descending]);
 useEffect(()=>{void load();},[load]);
 const focusedRef=useRef(false);
 const open=async(id:string)=>{
   try{
     const data=await request<Detail>("/clients/"+id);
     setSelected(data);setDraft(fromClient(data));setStatus(data.status);
     setError("");
   }catch(e){setError(readable(e));}
 };
 useEffect(()=>{
  if(focusedRef.current||!canRead)return;
  const id=new URLSearchParams(window.location.search).get("focus");
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
  focusedRef.current=true;void open(id);
 },[canRead]);
 async function create(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");setMessage("");
   try{
     const client=await request<Client>("/clients",{method:"POST",body:createDraft});
     setCreateDraft(clean);setCreating(false);setCursor(null);setHistory([]);
     setMessage("Client created. No billing or credentials have been inferred.");
     await load();await open(client.id);
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function save(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id,{method:"PUT",body:{...draft,status,version:selected.version}});
     await open(selected.id);await load();setMessage("Client profile updated.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function addContact(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id+"/contacts",{method:"POST",body:contact});
     setContact({name:"",role:"",phone:"",email:"",isPrimary:false});
     await open(selected.id);setMessage("Client contact saved.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function addService(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id+"/services",{method:"POST",body:service});
     setService({name:"",description:"",status:"ACTIVE"});
     await open(selected.id);setMessage("Service added to client.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 const sorted=useMemo(()=>legacySort?[...rows].sort((a,b)=>{
  const delta=String(a[sortBy]??"").localeCompare(String(b[sortBy]??""),undefined,{numeric:true,sensitivity:"base"});
  return descending?-delta:delta;
 }):rows,[rows,sortBy,descending,legacySort]);
 if(!session)return <Spinner label="Checking client access…"/>;
 if(!canRead)return <><PageHeader title="Clients access denied"/><Notice kind="error">Your account cannot view client records.</Notice></>;
 return <div data-aw-module="clients" className="aw-module-root space-y-7">
   <PageHeader eyebrow="Agency relationships" title="Clients"
     description="Organization-wide client profiles, contacts and active services. Won leads may be converted from Leads CRM."
     actions={<div className="flex flex-wrap gap-2">{canCreate&&<button className="btn-primary" type="button" aria-expanded={creating} onClick={()=>setCreating(v=>!v)}><Plus size={16}/>{creating?"Hide client form":"Add client"}</button>}<button type="button" className="btn-secondary" onClick={()=>void load()}>
       <RefreshCw className="h-4 w-4" aria-hidden="true"/>Refresh</button></div>}/>
   {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Client relationships</span><span className="aw-module-count">{rows.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{filter||"All statuses"}</span></div>}
   {error&&<Notice kind="error">{error}</Notice>}
   {message&&<Notice kind="success">{message}</Notice>}
   <div className="aw-directory-layout">
     <div className="space-y-5">
       <Card title="Client directory" description="Search and manage authorized business records.">
         <div className="aw-client-toolbar">
           <input aria-label="Search clients" className="field min-w-[190px] flex-1" placeholder="Search business, city, phone, email"
             value={search} onChange={e=>{setSearch(e.target.value);setCursor(null);setHistory([]);}}/>
           <select aria-label="Filter clients" className="field" value={filter} onChange={e=>{setFilter(e.target.value);setCursor(null);setHistory([]);}}>
             <option value="">All clients</option>{(["ACTIVE","PAUSED","ARCHIVED"] as const).map(x=><option key={x}>{x}</option>)}
           </select>
<select className="field" aria-label="Sort clients on this page" value={sortBy} onChange={e=>{setSortBy(e.target.value as typeof sortBy);setCursor(null);setHistory([]);}}>
  <option value="businessName">Business</option><option value="businessType">Category</option><option value="location">Location</option><option value="status">Status</option>
 </select><button type="button" className="btn-secondary" aria-label="Reverse client sort" onClick={()=>{setDescending(x=>!x);setCursor(null);setHistory([]);}}>{descending?"Descending ↓":"Ascending ↑"}</button>
         </div>
         {loading&&<Spinner label="Loading clients…"/>}
          {!loading&&!rows.length&&<p className="aw-directory-empty-line"><BriefcaseBusiness size={16}/> No matching clients. Add a client or convert a won lead.</p>}
          <div className="aw-register-scroll mt-4"><table className="aw-register-table" aria-label="Clients directory">
            <thead><tr><th>Business</th><th>Type</th><th>Phone</th><th>Email</th><th>Location</th><th>Status</th><th>Details</th></tr></thead>
            <tbody>{sorted.map(c=><tr key={c.id} className={"aw-client-row cursor-pointer "+(selected?.id===c.id?"aw-register-selected":"")} onClick={()=>void open(c.id)} onKeyDown={e=>{if(e.key==="Enter")void open(c.id);}} tabIndex={0}>
             <td><strong>{c.businessName}</strong>{c.sourceLeadId&&<span>Converted from lead</span>}</td>
             <td>{c.businessType||"—"}</td><td>{c.phone||"—"}</td><td>{c.email||"—"}</td>
             <td>{c.location||"—"}</td><td><StatusBadge status={c.status}/></td>
             <td><button type="button" className="aw-register-open" onClick={e=>{e.stopPropagation();void open(c.id);}}>Open</button></td>
            </tr>)}</tbody></table></div>
         <div className="mt-4 flex justify-between">
           <button className="btn-secondary" disabled={!history.length||loading} onClick={()=>{setCursor(history[history.length-1]||null);setHistory(h=>h.slice(0,-1));}}>Previous</button><span className="aw-register-page">Page {history.length+1}</span>
           <button className="btn-secondary" disabled={!nextCursor||loading} onClick={()=>{setHistory(h=>[...h,cursor||""]);setCursor(nextCursor);}}>Next page</button>
         </div>
       </Card>
       {canCreate&&creating&&<DirectoryModal title="Add client" description="Create a client profile directly without converting a lead." onClose={()=>{if(!busy)setCreating(false);}}>
         <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
           {editableFields.map(([key,label])=><FormField key={key} id={"new-client-"+key} label={<>{label}{key!=="websiteUrl"&&key!=="instagramUrl"?<span className="aw-required-star" aria-label="required"> *</span>:<span className="aw-optional-label"> (optional)</span>}</>}>
             <input id={"new-client-"+key} className="field" autoFocus={key==="businessName"} required={key!=="websiteUrl"&&key!=="instagramUrl"}
               type={key==="email"?"email":key.endsWith("Url")?"url":"text"}
               value={createDraft[key]} onChange={e=>setCreateDraft(v=>({...v,[key]:e.target.value}))}/>
           </FormField>)}
           <div className="sm:col-span-2 aw-directory-modal-actions">
             <button className="btn-secondary" type="button" disabled={busy} onClick={()=>setCreating(false)}>Cancel</button>
             <button className="btn-primary" disabled={busy} type="submit">Create client</button>
           </div>
         </form>
       </DirectoryModal>}
     </div>
     {selected&&<DirectoryDetailsPortal onClose={()=>setSelected(null)}>
       <div className="aw-directory-details-panel">
       {selected&&<div className="aw-directory-details-header"><strong>Client details</strong><button type="button" className="btn-secondary" onClick={()=>setSelected(null)}>Close</button></div>}
       {selected?<Card title={"Client: "+selected.businessName} description={"Profile version "+selected.version}>
         {selected.sourceLead&&<p className="mb-4 text-sm">Source lead: <Link href="/app/leads" className="text-indigo-700 underline">{selected.sourceLead.businessName}</Link></p>}
         {canEdit?<form onSubmit={save} className="space-y-3">
           {editableFields.map(([key,label])=><FormField key={key} id={"edit-client-"+key} label={label}>
             <input id={"edit-client-"+key} className="field" value={draft[key]}
               required={key==="businessName"} type={key==="email"?"email":key.endsWith("Url")?"url":"text"}
               onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))}/>
           </FormField>)}
           <FormField id="client-status" label="Client status">
             <select id="client-status" className="field" value={status} onChange={e=>setStatus(e.target.value as Status)}>
               {(["ACTIVE","PAUSED","ARCHIVED"] as const).map(x=><option key={x}>{x}</option>)}
             </select>
           </FormField>
           <button disabled={busy} className="btn-primary">Save client profile</button>
         </form>:<div className="space-y-2 text-sm text-slate-600">
           <p>Business: {selected.businessType||"Not recorded"}</p>
           <p>Phone: {selected.phone||"Not recorded"} · Email: {selected.email||"Not recorded"}</p>
           <p>Location: {selected.location||"Not recorded"}</p>
           {selected.notes&&<p className="whitespace-pre-wrap">{selected.notes}</p>}
           <StatusBadge status={selected.status}/>
         </div>}
       </Card>:null}
       {selected&&<Card title="Contacts" description="People connected with this client. No login credentials are stored.">
         {selected.contacts.length===0?<p className="text-sm text-slate-500">No contacts recorded.</p>:
           <div className="space-y-2">{selected.contacts.map(x=><div key={x.id} className="rounded-lg border p-3 text-sm">
             <p className="font-semibold">{x.name}{x.isPrimary?" · Primary":""}</p>
             <p className="text-xs text-slate-600">{x.role||"No role"} · {x.phone||"No phone"} · {x.email||"No email"}</p>
           </div>)}</div>}
         {canEdit&&<form onSubmit={addContact} className="mt-4 grid gap-2 sm:grid-cols-2">
           <FormField id="contact-name" label="Contact name"><input id="contact-name" className="field" required maxLength={160} value={contact.name} onChange={e=>setContact(v=>({...v,name:e.target.value}))}/></FormField>
           <FormField id="contact-role" label="Role"><input id="contact-role" className="field" value={contact.role} onChange={e=>setContact(v=>({...v,role:e.target.value}))}/></FormField>
           <FormField id="contact-phone" label="Contact phone"><input id="contact-phone" className="field" value={contact.phone} onChange={e=>setContact(v=>({...v,phone:e.target.value}))}/></FormField>
           <FormField id="contact-email" label="Contact email"><input id="contact-email" className="field" type="email" value={contact.email} onChange={e=>setContact(v=>({...v,email:e.target.value}))}/></FormField>
           <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={contact.isPrimary} onChange={e=>setContact(v=>({...v,isPrimary:e.target.checked}))}/>Primary contact</label>
           <div className="sm:col-span-2"><button disabled={busy} className="btn-secondary">Add contact</button></div>
         </form>}
       </Card>}
       {selected&&<Card title="Services" description="Services supplied to this client; invoicing is a later module.">
         {selected.services.length===0?<p className="text-sm text-slate-500">No services listed.</p>:
           <div className="space-y-2">{selected.services.map(x=><div key={x.id} className="rounded-lg border p-3 text-sm">
             <div className="flex justify-between"><p className="font-semibold">{x.name}</p><StatusBadge status={x.status}/></div>
             {x.description&&<p className="mt-1 text-xs">{x.description}</p>}
           </div>)}</div>}
         {canEdit&&<form onSubmit={addService} className="mt-4 space-y-2">
           <FormField id="service-name" label="Service name"><input id="service-name" className="field" required maxLength={120} value={service.name} onChange={e=>setService(v=>({...v,name:e.target.value}))}/></FormField>
           <FormField id="service-description" label="Service description"><input id="service-description" className="field" maxLength={1000} value={service.description} onChange={e=>setService(v=>({...v,description:e.target.value}))}/></FormField>
           <FormField id="service-status" label="Service status"><select id="service-status" className="field" value={service.status} onChange={e=>setService(v=>({...v,status:e.target.value as Service["status"]}))}>
             <option>ACTIVE</option><option>PAUSED</option><option>ENDED</option>
           </select></FormField>
           <button disabled={busy} className="btn-secondary">Add service</button>
         </form>}
       </Card>}
       </div>
     </DirectoryDetailsPortal>}
   </div>
 </div>;
}
