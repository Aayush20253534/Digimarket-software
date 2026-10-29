"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,ArrowRight,CalendarDays,CheckCircle2,ClipboardList,FolderKanban,RefreshCw,Users} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ClientDeliveryWorkspace} from "@/components/client-delivery-workspace";
import {Spinner} from "@/components/ui";

type Status="ACTIVE"|"PAUSED"|"ARCHIVED";
type ClientTab="delivery"|"services"|"agreement"|"contacts";
type Contact={id:string;name:string;role:string|null;phone:string|null;email:string|null;isPrimary:boolean};
type Service={id:string;name:string;description:string|null;status:"ACTIVE"|"PAUSED"|"ENDED"};
type Detail={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;notes:string|null;
 contractStartOn:string|null;contractEndOn:string|null;monthlyFee:string|null;monthlyAdBudget:string|null;status:Status;version:number;
 sourceLead:{businessName:string}|null;contacts:Contact[];services:Service[]};
type Editing={businessName:string;businessType:string;phone:string;email:string;location:string;notes:string;
 contractStartOn:string;contractEndOn:string;monthlyFee:string;monthlyAdBudget:string;status:Status};
type ServiceDraft={name:string;description:string;status:Service["status"]};
const blankService:ServiceDraft={name:"",description:"",status:"ACTIVE"};
const tabs=[["delivery","Delivery",FolderKanban],["services","Services",ClipboardList],["agreement","Agreement",CalendarDays],["contacts","Contacts",Users]] as const;
function formFrom(c:Detail):Editing{return {
 businessName:c.businessName,businessType:c.businessType??"",phone:c.phone??"",email:c.email??"",location:c.location??"",notes:c.notes??"",
 contractStartOn:c.contractStartOn?.slice(0,10)??"",contractEndOn:c.contractEndOn?.slice(0,10)??"",
 monthlyFee:c.monthlyFee??"",monthlyAdBudget:c.monthlyAdBudget??"",status:c.status
};}
const money=(n:string|null)=>n===null?"Restricted or not set":"₹"+Number(n).toLocaleString("en-IN");
export default function ClientWorkspacePage(){
 const id=String(useParams<{id:string}>().id);
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const canFinance=!!session?.identity.permissions.includes("finance.read.all");
 const [client,setClient]=useState<Detail|null>(null),[form,setForm]=useState<Editing|null>(null),[tab,setTab]=useState<ClientTab>("delivery");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [contact,setContact]=useState({name:"",role:"",phone:"",email:"",isPrimary:false});
 const [service,setService]=useState<ServiceDraft>(blankService),[editingService,setEditingService]=useState<string|null>(null),[serviceEdit,setServiceEdit]=useState<ServiceDraft>(blankService);
 const load=useCallback(async()=>{
  if(!canRead)return;
  try{const response=await request<Detail>("/clients/"+id);setClient(response);setForm(formFrom(response));setError("");}
  catch(e){setError(e instanceof Error?e.message:"Cannot load client");}
  finally{setLoading(false);}
 },[id,canRead,request]);
 useEffect(()=>{if(canRead)void load();else if(session)setLoading(false);},[canRead,load,session]);
 async function execute(action:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setSuccess("");
  try{await action();await load();setSuccess(message);}
  catch(e){setError(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 function saveAgreement(e:FormEvent){
  e.preventDefault();if(!client||!form)return;
  const fields={businessName:form.businessName,businessType:form.businessType,phone:form.phone,email:form.email,location:form.location,notes:form.notes,
   contractStartOn:form.contractStartOn,contractEndOn:form.contractEndOn,status:form.status,version:client.version,
   ...(canFinance?{monthlyFee:form.monthlyFee,monthlyAdBudget:form.monthlyAdBudget}:{})};
  void execute(()=>request("/clients/"+id,{method:"PUT",body:fields}),"Client and agreement saved.");
 }
 function addContact(e:FormEvent){
  e.preventDefault();
  void execute(async()=>{await request("/clients/"+id+"/contacts",{method:"POST",body:contact});
   setContact({name:"",role:"",phone:"",email:"",isPrimary:false});},"Contact added.");
 }
 function addService(e:FormEvent){
  e.preventDefault();
  void execute(async()=>{await request("/clients/"+id+"/services",{method:"POST",body:service});setService(blankService);},"Service commitment added.");
 }
 function saveService(e:FormEvent){
  e.preventDefault();if(!editingService)return;
  void execute(async()=>{await request("/clients/"+id+"/services/"+editingService,{method:"PUT",body:serviceEdit});setEditingService(null);},"Service commitment saved.");
 }
 if(!session)return <Spinner label="Verifying workspace access…"/>;
 if(!canRead)return <div className="aw-client-workspace"><p role="alert">Client access denied.</p></div>;
 if(loading)return <div className="aw-client-workspace"><Spinner label="Loading client workspace…"/></div>;
 if(!client||!form)return <div className="aw-client-workspace"><Link className="aw-client-back" href="/app/clients"><ArrowLeft size={16}/>Back to Clients</Link><p role="alert">{error||"Client could not be found"}</p></div>;
 return <div className="aw-client-workspace" data-testid="client-workspace-page" data-aw-module="clients">
  <nav className="aw-client-crumb"><Link href="/app/clients"><ArrowLeft size={15}/>All clients</Link><span>/</span><span>{client.businessName}</span></nav>
  <header className="aw-client-hero">
   <div className="aw-client-hero-top">
    <div><p className="aw-client-kicker">CLIENT DELIVERY WORKSPACE</p><h1>{client.businessName}</h1>
     <p>{client.businessType||"Business category not recorded"}{client.location?" · "+client.location:""}{client.phone?" · "+client.phone:""}</p>
    </div>
    <div className="aw-client-hero-actions"><span className={"aw-client-status aw-client-status-"+client.status.toLowerCase()}>{client.status}</span>
     <button className="aw-client-btn" type="button" onClick={()=>void load()} disabled={busy}><RefreshCw size={15}/>Refresh</button>
    </div>
   </div>
   <div className="aw-client-statrow">
    <div className="aw-client-stat"><ClipboardList size={18}/><span>Active services</span><strong>{client.services.filter(s=>s.status==="ACTIVE").length}</strong></div>
    <div className="aw-client-stat"><CalendarDays size={18}/><span>Agreement ends</span><strong>{client.contractEndOn?client.contractEndOn.slice(0,10):"Not set"}</strong></div>
    <div className="aw-client-stat"><CheckCircle2 size={18}/><span>Onboarding</span><strong>{client.services.length&&client.contractStartOn?"Configured":"Needs setup"}</strong></div>
   </div>
  </header>
  <nav className="aw-client-tabs" role="tablist" aria-label="Client workspace sections">
   {tabs.map(([key,label,Icon])=><button key={key} role="tab" type="button" id={"client-tab-"+key} aria-controls="client-workspace-panel" aria-selected={tab===key}
    className={tab===key?"aw-client-tab aw-client-tab-current":"aw-client-tab"} onClick={()=>{setTab(key);setError("");setSuccess("");}}>
     <Icon size={17}/>{label}</button>)}
  </nav>
  {error&&<div className="aw-client-alert" role="alert">{error}</div>}
  {success&&<div className="aw-client-success" role="status">{success}</div>}
  <div id="client-workspace-panel" role="tabpanel" aria-labelledby={"client-tab-"+tab} data-testid="client-workspace-active-panel">
   {tab==="delivery"&&<>
    {client.services.length===0&&<div className="aw-client-callout"><div><strong>Start with the service agreement</strong><p>No service commitments are recorded. You can record an agreed service or schedule a named delivery directly.</p></div>
     <button className="aw-client-btn" type="button" onClick={()=>setTab("services")}>Add services <ArrowRight size={15}/></button></div>}
    <ClientDeliveryWorkspace clientId={client.id} contractStartOn={client.contractStartOn} contractEndOn={client.contractEndOn} services={client.services}/>
   </>}
   {tab==="services"&&<section className="aw-client-panel"><div className="aw-client-panel-heading"><div><h2>Agreed services</h2><p>Record the services promised in the agreement. Delivery dates and quantities belong under Client deliveries.</p></div></div>
    <div className="aw-client-service-grid">{client.services.map(item=><article className="aw-client-service" key={item.id}>
     <div className="aw-client-panel-heading"><div><h3>{item.name}</h3><p>{item.description||"No service description"}</p></div><span className={"aw-client-status aw-client-status-"+item.status.toLowerCase()}>{item.status}</span></div>
     {canEdit&&<button className="aw-client-btn" type="button" onClick={()=>{setEditingService(item.id);setServiceEdit({name:item.name,description:item.description??"",status:item.status});}}>Edit service</button>}
    </article>)}</div>
    {!client.services.length&&<p className="aw-client-empty">No services yet. Add the first agreed service below.</p>}
    {canEdit&&editingService&&<form className="aw-client-form aw-client-subform" onSubmit={saveService} aria-label="Edit client service">
     <h3>Edit service commitment</h3>
     <label>Service name<input className="field" required minLength={2} maxLength={120} value={serviceEdit.name} onChange={e=>setServiceEdit(v=>({...v,name:e.target.value}))}/></label>
     <label>Description<input className="field" maxLength={1000} value={serviceEdit.description} onChange={e=>setServiceEdit(v=>({...v,description:e.target.value}))}/></label>
     <label>Status<select className="field" value={serviceEdit.status} onChange={e=>setServiceEdit(v=>({...v,status:e.target.value as Service["status"]}))}><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select></label>
     <div className="aw-client-actions"><button className="aw-client-primary" disabled={busy}>Save changes</button><button className="aw-client-btn" type="button" onClick={()=>setEditingService(null)}>Cancel</button></div>
    </form>}
    {canEdit&&<form className="aw-client-form aw-client-subform" onSubmit={addService} aria-label="Add client service">
     <h3>Add agreed service</h3>
     <label>Service name<input className="field" required minLength={2} maxLength={120} placeholder="e.g. Reels" value={service.name} onChange={e=>setService(v=>({...v,name:e.target.value}))}/></label>
     <label>Description<input className="field" maxLength={1000} placeholder="Scope and expectations" value={service.description} onChange={e=>setService(v=>({...v,description:e.target.value}))}/></label>
     <label>Status<select className="field" value={service.status} onChange={e=>setService(v=>({...v,status:e.target.value as Service["status"]}))}><option>ACTIVE</option><option>PAUSED</option><option>ENDED</option></select></label>
     <div className="aw-client-actions"><button className="aw-client-primary" disabled={busy}>Add service</button></div>
    </form>}
   </section>}
   {tab==="agreement"&&<section className="aw-client-panel"><div className="aw-client-panel-heading"><div><h2>Client profile & agreement</h2><p>Keep account information and commercial terms tied to the original client record.</p></div><span className="aw-client-muted">Revision {client.version}</span></div>
    {client.sourceLead&&<p className="aw-client-muted">Converted from approved lead: {client.sourceLead.businessName}</p>}
    {canEdit?<form className="aw-client-form" onSubmit={saveAgreement} aria-label="Edit client agreement">
     <div className="aw-client-form-grid">
      <label>Business name<input className="field" required minLength={2} value={form.businessName} onChange={e=>setForm(v=>v?{...v,businessName:e.target.value}:v)}/></label>
      <label>Business category<input className="field" value={form.businessType} onChange={e=>setForm(v=>v?{...v,businessType:e.target.value}:v)}/></label>
      <label>Phone<input className="field" value={form.phone} onChange={e=>setForm(v=>v?{...v,phone:e.target.value}:v)}/></label>
      <label>Email<input className="field" type="email" value={form.email} onChange={e=>setForm(v=>v?{...v,email:e.target.value}:v)}/></label>
      <label>Location<input className="field" value={form.location} onChange={e=>setForm(v=>v?{...v,location:e.target.value}:v)}/></label>
      <label>Status<select className="field" value={form.status} onChange={e=>setForm(v=>v?{...v,status:e.target.value as Status}:v)}><option>ACTIVE</option><option>PAUSED</option><option>ARCHIVED</option></select></label>
      <label>Agreement start<input className="field" type="date" value={form.contractStartOn} onChange={e=>setForm(v=>v?{...v,contractStartOn:e.target.value}:v)}/></label>
      <label>Agreement end<input className="field" type="date" min={form.contractStartOn||undefined} value={form.contractEndOn} onChange={e=>setForm(v=>v?{...v,contractEndOn:e.target.value}:v)}/></label>
      {canFinance&&<><label>Monthly service fee (₹)<input className="field" inputMode="decimal" placeholder="15000" value={form.monthlyFee} onChange={e=>setForm(v=>v?{...v,monthlyFee:e.target.value}:v)}/></label>
      <label>Monthly ad budget (₹)<input className="field" inputMode="decimal" placeholder="3000" value={form.monthlyAdBudget} onChange={e=>setForm(v=>v?{...v,monthlyAdBudget:e.target.value}:v)}/></label></>}
      <label className="aw-client-wide">Client notes<textarea className="field" rows={4} value={form.notes} onChange={e=>setForm(v=>v?{...v,notes:e.target.value}:v)}/></label>
     </div>
     <div className="aw-client-actions"><button className="aw-client-primary" disabled={busy}>Save client & agreement</button></div>
    </form>:<div className="aw-client-readonly"><p>Status: {client.status}</p><p>Phone: {client.phone||"—"}</p><p>Agreement: {form.contractStartOn||"Not set"} to {form.contractEndOn||"Not set"}</p>{canFinance&&<p>Fee: {money(client.monthlyFee)} · Ad budget: {money(client.monthlyAdBudget)}</p>}</div>}
   </section>}
   {tab==="contacts"&&<section className="aw-client-panel"><div className="aw-client-panel-heading"><div><h2>Contacts</h2><p>People responsible for client-side coordination and approval.</p></div></div>
    <div className="aw-client-service-grid">{client.contacts.map(c=><article className="aw-client-service" key={c.id}><h3>{c.name}{c.isPrimary?" · Primary":""}</h3><p>{c.role||"Role not specified"}</p><p>{c.phone||"No phone"} · {c.email||"No email"}</p></article>)}</div>
    {!client.contacts.length&&<p className="aw-client-empty">No contacts recorded.</p>}
    {canEdit&&<form className="aw-client-form aw-client-subform" onSubmit={addContact} aria-label="Add client contact"><h3>Add contact</h3>
     <label>Name<input className="field" required minLength={2} maxLength={160} value={contact.name} onChange={e=>setContact(v=>({...v,name:e.target.value}))}/></label>
     <label>Role<input className="field" value={contact.role} onChange={e=>setContact(v=>({...v,role:e.target.value}))}/></label>
     <label>Phone<input className="field" value={contact.phone} onChange={e=>setContact(v=>({...v,phone:e.target.value}))}/></label>
     <label>Email<input className="field" type="email" value={contact.email} onChange={e=>setContact(v=>({...v,email:e.target.value}))}/></label>
     <label className="aw-client-check"><input type="checkbox" checked={contact.isPrimary} onChange={e=>setContact(v=>({...v,isPrimary:e.target.checked}))}/>Primary contact</label>
     <div className="aw-client-actions"><button className="aw-client-primary" disabled={busy}>Add contact</button></div>
    </form>}
   </section>}
  </div>
 </div>;
}