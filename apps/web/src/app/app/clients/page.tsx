"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BriefcaseBusiness, RefreshCw } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { DirectoryDetailsPortal } from "@/components/directory-modal";
import { ApiError } from "@/lib/api";
import { ClientDeliveryWorkspace } from "@/components/client-delivery-workspace";
import { Card, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";

type Status="ACTIVE"|"PAUSED"|"ARCHIVED";
type Contact={id:string;name:string;role:string|null;phone:string|null;email:string|null;isPrimary:boolean};
type Service={id:string;name:string;description:string|null;monthlyTarget:number|null;status:"ACTIVE"|"PAUSED"|"ENDED"};
type Client={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;
 websiteUrl:string|null;instagramUrl:string|null;facebookUrl:string|null;notes:string|null;
 contractStartOn:string|null;contractEndOn:string|null;monthlyFee:string|null;monthlyAdBudget:string|null;
 status:Status;version:number;sourceLeadId:string|null;createdAt:string};
type Detail=Client&{contacts:Contact[];services:Service[];sourceLead:{id:string;businessName:string;status:string}|null};
type Register={items:Client[];nextCursor:string|null};
type Editable={businessName:string;businessType:string;phone:string;email:string;location:string;
 websiteUrl:string;instagramUrl:string;facebookUrl:string;notes:string};
const clean:Editable={businessName:"",businessType:"",phone:"",email:"",location:"",
 websiteUrl:"",instagramUrl:"",facebookUrl:"",notes:""};
const editableFields=[
 ["businessName","Business name"],["businessType","Business type"],
 ["phone","Phone"],["notes","Client notes"],
] as const;
const readable=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Client request failed";
function fromClient(c:Client):Editable {
 return Object.fromEntries(Object.keys(clean).map(k=>[k,c[k as keyof Editable]??""])) as Editable;
}
export default function ClientsPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const [rows,setRows]=useState<Client[]>([]);
 const [selected,setSelected]=useState<Detail|null>(null);
 const [draft,setDraft]=useState<Editable>(clean);
 const [status,setStatus]=useState<Status>("ACTIVE");
 const [terms,setTerms]=useState({contractStartOn:"",contractEndOn:"",monthlyFee:"",monthlyAdBudget:""});
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
 const [service,setService]=useState({name:"",description:"",status:"ACTIVE" as Service["status"],monthlyTarget:""});
 const [editingService,setEditingService]=useState<Service|null>(null);
 const [serviceEdit,setServiceEdit]=useState({name:"",description:"",status:"ACTIVE" as Service["status"],monthlyTarget:""});
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
     setTerms({contractStartOn:data.contractStartOn?.slice(0,10)??"",contractEndOn:data.contractEndOn?.slice(0,10)??"",
       monthlyFee:data.monthlyFee??"",monthlyAdBudget:data.monthlyAdBudget??""});
     setError("");
   }catch(e){setError(readable(e));}
 };
 useEffect(()=>{
  if(focusedRef.current||!canRead)return;
  const id=new URLSearchParams(window.location.search).get("focus");
  if(!id||!/^[0-9a-f-]{36}$/i.test(id))return;
  focusedRef.current=true;void open(id);
 },[canRead]);
 async function save(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id,{method:"PUT",body:{businessName:draft.businessName,businessType:draft.businessType,phone:draft.phone,notes:draft.notes,...terms,status,version:selected.version}});
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
 async function saveServiceEdit(e:FormEvent){
   e.preventDefault();if(!selected||!editingService)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id+"/services/"+editingService.id,{method:"PUT",body:{
       ...serviceEdit,monthlyTarget:serviceEdit.monthlyTarget?Number(serviceEdit.monthlyTarget):null,
     }});
     setEditingService(null);await open(selected.id);setMessage("Service commitment updated.");
   }catch(e){setError(readable(e));}finally{setBusy(false);}
 }
 async function addService(e:FormEvent){
   e.preventDefault();if(!selected)return;
   setBusy(true);setError("");setMessage("");
   try{
     await request("/clients/"+selected.id+"/services",{method:"POST",body:{...service,monthlyTarget:service.monthlyTarget?Number(service.monthlyTarget):null}});
     setService({name:"",description:"",status:"ACTIVE",monthlyTarget:""});
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
   <PageHeader eyebrow="Client delivery" title="Clients & delivery"
     description="Client agreements, services, projects and deliverables in one workspace. Clients come from approved leads."
     actions={<div className="flex flex-wrap gap-2"><Link className="btn-secondary" href="/app/leads">View leads</Link><button type="button" className="btn-secondary" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>}/>
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
          {!loading&&!rows.length&&<p className="aw-directory-empty-line"><BriefcaseBusiness size={16}/> No matching clients. Approve a lead to add it here.</p>}
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
     </div>
     {selected&&<DirectoryDetailsPortal onClose={()=>setSelected(null)}>
       <div className="aw-directory-details-panel">
       {selected&&<div className="aw-directory-details-header"><strong>Client details</strong><button type="button" className="btn-secondary" onClick={()=>setSelected(null)}>Close</button></div>}
       {selected?<Card title={"Client: "+selected.businessName} description={"Profile version "+selected.version+" · Agreement and onboarding"}>
         {selected.sourceLead&&<p className="mb-4 text-sm">Source lead: <Link href="/app/leads" className="text-indigo-700 underline">{selected.sourceLead.businessName}</Link></p>}
         {canEdit?<form onSubmit={save} className="space-y-3">
           {editableFields.map(([key,label])=><FormField key={key} id={"edit-client-"+key} label={label}>
             <input id={"edit-client-"+key} className="field" value={draft[key]}
               required={key==="businessName"} type="text"
               onChange={e=>setDraft(v=>({...v,[key]:e.target.value}))}/>
           </FormField>)}
           <FormField id="client-status" label="Client status">
             <select id="client-status" className="field" value={status} onChange={e=>setStatus(e.target.value as Status)}>
               {(["ACTIVE","PAUSED","ARCHIVED"] as const).map(x=><option key={x}>{x}</option>)}
             </select>
           </FormField>
           <div className="grid gap-3 border-t pt-3 sm:grid-cols-2">
             <FormField id="client-contract-start" label="Agreement start"><input className="field" id="client-contract-start" type="date" value={terms.contractStartOn}
               onChange={e=>setTerms(v=>({...v,contractStartOn:e.target.value}))}/></FormField>
             <FormField id="client-contract-end" label="Agreement end"><input className="field" id="client-contract-end" type="date" min={terms.contractStartOn||undefined} value={terms.contractEndOn}
               onChange={e=>setTerms(v=>({...v,contractEndOn:e.target.value}))}/></FormField>
             <FormField id="client-monthly-fee" label="Monthly service fee (INR)"><input className="field" id="client-monthly-fee" inputMode="decimal"
               placeholder="15000" pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" value={terms.monthlyFee}
               onChange={e=>setTerms(v=>({...v,monthlyFee:e.target.value}))}/></FormField>
             <FormField id="client-monthly-ad-budget" label="Monthly ad budget (INR)"><input className="field" id="client-monthly-ad-budget" inputMode="decimal"
               placeholder="3000" pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" value={terms.monthlyAdBudget}
               onChange={e=>setTerms(v=>({...v,monthlyAdBudget:e.target.value}))}/></FormField>
           </div>
           <button disabled={busy} className="btn-primary">Save client profile & agreement</button>
         </form>:<div className="space-y-2 text-sm text-slate-600">
           <p>Business: {selected.businessType||"Not recorded"}</p>
           <p>Phone: {selected.phone||"Not recorded"} · Email: {selected.email||"Not recorded"}</p>
           <p>Location: {selected.location||"Not recorded"}</p>
           {selected.notes&&<p className="whitespace-pre-wrap">{selected.notes}</p>}
           <p>Agreement: {selected.contractStartOn?.slice(0,10)??"Not set"} to {selected.contractEndOn?.slice(0,10)??"Not set"}</p>
           <p>Monthly fee: ₹{selected.monthlyFee??"Not set"} · Ad budget: ₹{selected.monthlyAdBudget??"Not set"}</p>
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
       {selected&&<Card title="Services & monthly commitments" description="Services promised to this client and their agreed monthly delivery targets.">
         {selected.services.length===0?<p className="text-sm text-slate-500">No services listed.</p>:
           <div className="space-y-2">{selected.services.map(x=><div key={x.id} className="rounded-lg border p-3 text-sm">
             <div className="flex items-center justify-between gap-2"><p className="font-semibold">{x.name}</p><div className="flex items-center gap-2">
               <StatusBadge status={x.status}/>
               {canEdit&&<button className="btn-secondary text-xs" type="button" onClick={()=>{
                 setEditingService(x);setServiceEdit({name:x.name,description:x.description??"",status:x.status,monthlyTarget:x.monthlyTarget?.toString()??""});
               }} aria-label={"Edit service "+x.name}>Edit</button>}
             </div></div>
             {x.description&&<p className="mt-1 text-xs">{x.description}</p>}
             {x.monthlyTarget&&<p className="mt-1 text-xs font-semibold">{x.monthlyTarget} per month</p>}
           </div>)}</div>}
         {canEdit&&editingService&&<form onSubmit={saveServiceEdit} className="mt-3 space-y-2 rounded-lg border border-violet-200 p-3">
           <h3 className="font-semibold">Edit service commitment</h3>
           <FormField id="edit-service-name" label="Service name"><input id="edit-service-name" className="field" required maxLength={120} value={serviceEdit.name}
             onChange={e=>setServiceEdit(v=>({...v,name:e.target.value}))}/></FormField>
           <FormField id="edit-service-description" label="Description"><input id="edit-service-description" className="field" maxLength={1000} value={serviceEdit.description}
             onChange={e=>setServiceEdit(v=>({...v,description:e.target.value}))}/></FormField>
           <FormField id="edit-service-target" label="Monthly target"><input id="edit-service-target" className="field" type="number" min={1} max={1000} value={serviceEdit.monthlyTarget}
             onChange={e=>setServiceEdit(v=>({...v,monthlyTarget:e.target.value}))}/></FormField>
           <FormField id="edit-service-status" label="Status"><select id="edit-service-status" className="field" value={serviceEdit.status}
             onChange={e=>setServiceEdit(v=>({...v,status:e.target.value as Service["status"]}))}>
             <option>ACTIVE</option><option>PAUSED</option><option>ENDED</option>
           </select></FormField>
           <div className="flex gap-2"><button className="btn-primary" type="submit" disabled={busy}>Save service</button>
             <button className="btn-secondary" type="button" onClick={()=>setEditingService(null)}>Cancel</button></div>
         </form>}
         {canEdit&&<form onSubmit={addService} className="mt-4 space-y-2">
           <FormField id="service-name" label="Service name"><input id="service-name" className="field" required maxLength={120} value={service.name} onChange={e=>setService(v=>({...v,name:e.target.value}))}/></FormField>
           <FormField id="service-description" label="Service description"><input id="service-description" className="field" maxLength={1000} value={service.description} onChange={e=>setService(v=>({...v,description:e.target.value}))}/></FormField>
           <FormField id="service-target" label="Monthly quantity (optional)"><input id="service-target" className="field" type="number" min={1} max={1000}
             placeholder="8 for reels / posts" value={service.monthlyTarget} onChange={e=>setService(v=>({...v,monthlyTarget:e.target.value}))}/></FormField>
           <FormField id="service-status" label="Service status"><select id="service-status" className="field" value={service.status} onChange={e=>setService(v=>({...v,status:e.target.value as Service["status"]}))}>
             <option>ACTIVE</option><option>PAUSED</option><option>ENDED</option>
           </select></FormField>
           <button disabled={busy} className="btn-secondary">Add service</button>
         </form>}
       </Card>}
       {selected&&<ClientDeliveryWorkspace key={selected.id} clientId={selected.id} canCreate={!!session?.identity.permissions.includes("projects.create")}/>}
       </div>
     </DirectoryDetailsPortal>}
   </div>
 </div>;
}
