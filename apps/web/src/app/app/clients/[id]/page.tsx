"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import Link from "next/link";
import {useParams} from "next/navigation";
import {ArrowLeft,CalendarDays,CheckCircle2,RefreshCw,Users,FolderOpen,Video,Newspaper,LayoutDashboard,Wallet,History,PhoneCall,Mail,Globe,Instagram,Facebook,MapPin} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ClientVideoReadiness} from "@/components/client-video-readiness";
import {ClientPostReadiness} from "@/components/client-post-readiness";
import {SalesWorkspaceNav} from "@/components/sales-workspace-nav";
import {Spinner} from "@/components/ui";
import {EndClientAgreement} from "@/components/end-client-agreement";
import {agencyToday,cycleLabel,clientHealthSchema,clientOnboardingSchema} from "@digimarket/contracts";
import {DirectoryModal} from "@/components/directory-modal";

type Status="ACTIVE"|"PAUSED"|"ARCHIVED"|"EXPIRED";
type ClientTab="overview"|"video"|"post"|"agreement"|"contacts"|"files"|"finance"|"history";
type Health=typeof clientHealthSchema.options[number];
type Onboarding=typeof clientOnboardingSchema.options[number];
type Overview={cycle:{key:string};readiness:{from?:string|null;to?:string|null;videos:number;posts:number;festival:number;videosDelivered:number;postsDelivered:number;festivalDelivered:number};managers:{id:string;displayName:string}[];manager:{id:string;displayName:string}|null;financial:{invoiceCount:number;invoiceTotal:string;invoicePaid:string;invoiceOutstanding:string;verifiedPayments:string;paymentCount:number;funds:{received:string;spent:string;closing:string;refunded:string}|null}|null;history:{id:string;action:string;createdAt:string;actor:{displayName:string}|null;beforeRedacted?:Record<string,unknown>;afterRedacted?:Record<string,unknown>}[]};
const healthLabels:Record<Health,string>={UNASSESSED:"Unassessed",HEALTHY:"Healthy",NEEDS_ATTENTION:"Needs attention",AT_RISK:"At risk"};
const checklistLabels:Record<Onboarding,string>={AGREEMENT:"Agreement completed",BRAND_ASSETS:"Brand assets received",ACCOUNT_ACCESS:"Account access received",STRATEGY:"Strategy agreed",BILLING:"Billing setup completed"};
type Contact={id:string;name:string;role:string|null;phone:string|null;email:string|null;isPrimary:boolean};
type Detail={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;notes:string|null;
 contractStartOn:string|null;contractEndOn:string|null;monthlyFee:string|null;monthlyAdBudget:string|null;status:Status;version:number;
 agreementExpired?:boolean;agreementEndedOn?:string|null;agreementEndReason?:string|null;
 sourceLead:{id?:string;businessName:string;googleMapsUrl?:string|null}|null;contacts:Contact[];websiteUrl?:string|null;instagramUrl?:string|null;facebookUrl?:string|null;health?:Health;managerId?:string|null;onboarding?:Onboarding[];currentAgreementStartOn?:string|null;createdAt?:string};
type Editing={businessName:string;businessType:string;phone:string;email:string;location:string;notes:string;
 contractStartOn:string;contractEndOn:string;monthlyFee:string;monthlyAdBudget:string;status:Status;websiteUrl:string;instagramUrl:string;facebookUrl:string};
const tabs=[["overview","Overview",LayoutDashboard],["agreement","Agreement",CalendarDays],["video","Video readiness",Video],["post","Post readiness",Newspaper],["finance","Finance",Wallet],["contacts","Contacts",Users],["files","Files & Assets",FolderOpen],["history","History",History]] as const;
function formFrom(c:Detail):Editing{return {
 businessName:c.businessName,businessType:c.businessType??"",phone:c.phone??"",email:c.email??"",location:c.location??"",notes:c.notes??"",
 contractStartOn:c.contractStartOn?.slice(0,10)??"",contractEndOn:c.contractEndOn?.slice(0,10)??"",
 monthlyFee:c.monthlyFee??"",monthlyAdBudget:c.monthlyAdBudget??"",status:c.status,websiteUrl:c.websiteUrl??"",instagramUrl:c.instagramUrl??"",facebookUrl:c.facebookUrl??""
};}
const money=(n:string|null|undefined)=>n==null?"Restricted or not set":"₹"+Number(n).toLocaleString("en-IN");
export default function ClientWorkspacePage(){
 const id=String(useParams<{id:string}>().id);
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const canFinance=!!session?.identity.permissions.includes("finance.read.all");
 const [client,setClient]=useState<Detail|null>(null),[form,setForm]=useState<Editing|null>(null),[tab,setTab]=useState<ClientTab>("overview");
 const [overview,setOverview]=useState<Overview|null>(null),[overviewError,setOverviewError]=useState("");
 const [managerId,setManagerId]=useState(""),[health,setHealth]=useState<Health>("UNASSESSED"),[onboarding,setOnboarding]=useState<Onboarding[]>([]),[accountNote,setAccountNote]=useState("");
 const [renew,setRenew]=useState(false),[renewForm,setRenewForm]=useState({startOn:agencyToday(),endOn:"",monthlyFee:"",monthlyAdBudget:"",reason:""});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const [contact,setContact]=useState({name:"",role:"",phone:"",email:"",isPrimary:false});
 const load=useCallback(async()=>{
  if(!canRead)return;
  try{const response=await request<Detail>("/clients/"+id);setClient(response);setForm(formFrom(response));setManagerId(response.managerId??"");setHealth(response.health??"UNASSESSED");setOnboarding(response.onboarding??[]);setAccountNote(response.notes??"");setError("");}
  catch(e){setError(e instanceof Error?e.message:"Cannot load client");}
  finally{setLoading(false);}
 },[id,canRead,request]);
 useEffect(()=>{if(canRead)void load();else if(session)setLoading(false);},[canRead,load,session]);
 const loadOverview=useCallback(async()=>{if(!canRead)return;try{const d=await request<Overview>("/clients/"+id+"/overview");if(!d||!d.readiness||!Array.isArray(d.history))throw Error("Client overview API update required.");setOverview(d);setOverviewError("");}catch(e){setOverview(null);setOverviewError(e instanceof Error?e.message:"Unable to load client overview");}},[canRead,id,request]);
 useEffect(()=>{if(tab==="overview"||tab==="finance"||tab==="history")void loadOverview();},[tab,loadOverview]);
 async function execute(action:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setSuccess("");
  try{await action();await load();if(tab==="overview"||tab==="finance"||tab==="history")await loadOverview();setSuccess(message);}
  catch(e){setError(e instanceof Error?e.message:"Request failed");}
  finally{setBusy(false);}
 }
 function saveAgreement(e:FormEvent){
  e.preventDefault();if(!client||!form)return;
  const fields={businessName:form.businessName,businessType:form.businessType,phone:form.phone,email:form.email,location:form.location,notes:form.notes,
   contractStartOn:form.contractStartOn,contractEndOn:form.contractEndOn,status:form.status,version:client.version,websiteUrl:form.websiteUrl,instagramUrl:form.instagramUrl,facebookUrl:form.facebookUrl,
   ...(canFinance&&!client.currentAgreementStartOn?{monthlyFee:form.monthlyFee,monthlyAdBudget:form.monthlyAdBudget}:{})};
  void execute(()=>request("/clients/"+id,{method:"PUT",body:fields}),"Client and agreement saved.");
 }
 function saveAccount(e:FormEvent){e.preventDefault();if(!client)return;void execute(()=>request("/clients/"+id,{method:"PUT",body:{version:client.version,health,managerId:managerId||null,onboarding,notes:accountNote}}),"Account details saved.");}
 function openRenew(){if(!client)return;setRenewForm({startOn:agencyToday(),endOn:"",monthlyFee:client.monthlyFee??"",monthlyAdBudget:client.monthlyAdBudget??"",reason:""});setRenew(true);}
 function saveRenew(e:FormEvent){e.preventDefault();if(!client)return;void execute(async()=>{await request("/clients/"+id+"/renew",{method:"POST",body:{version:client.version,...renewForm}});setRenew(false);},"Agreement renewed. Original client and history retained.");}
 function addContact(e:FormEvent){
  e.preventDefault();
  void execute(async()=>{await request("/clients/"+id+"/contacts",{method:"POST",body:contact});
   setContact({name:"",role:"",phone:"",email:"",isPrimary:false});},"Contact added.");
 }
 if(!session)return <Spinner label="Verifying workspace access…"/>;
 if(!canRead)return <div className="aw-client-workspace"><p role="alert">Client access denied.</p></div>;
 if(loading)return <div className="aw-client-workspace"><Spinner label="Loading client workspace…"/></div>;
 if(!client||!form)return <div className="aw-client-workspace"><Link className="aw-client-back" href="/app/clients"><ArrowLeft size={16}/>Back to Clients</Link><p role="alert">{error||"Client could not be found"}</p></div>;
 return <div className="aw-client-workspace" data-testid="client-workspace-page" data-aw-module="clients">
  <SalesWorkspaceNav/>
  <nav className="aw-client-crumb"><Link href="/app/clients"><ArrowLeft size={15}/>All clients</Link><span>/</span><span>{client.businessName}</span></nav>
  <header className="aw-client-hero">
   <div className="aw-client-hero-top">
    <div><p className="aw-client-kicker">CLIENT WORKSPACE</p><h1>{client.businessName}</h1>
     <p>{client.businessType||"Business category not recorded"}{client.location?" · "+client.location:""}{client.createdAt?" · Client since "+client.createdAt.slice(0,10):""}</p>
 <div className="aw-client-shortcuts">{client.phone&&<a className="aw-followup-icon" href={"tel:"+client.phone} aria-label="Call client"><PhoneCall size={16}/></a>}{client.email&&<a className="aw-followup-icon" href={"mailto:"+client.email} aria-label="Email client"><Mail size={16}/></a>}{([[client.websiteUrl,"Website",Globe],[client.instagramUrl,"Instagram",Instagram],[client.facebookUrl,"Facebook",Facebook],[client.sourceLead?.googleMapsUrl,"Map",MapPin]] as const).map(([url,label,Icon])=>url&&<a key={label} className="aw-followup-icon" href={url} target="_blank" rel="noopener noreferrer" aria-label={label}><Icon size={16}/></a>)}</div>
    </div>
    <div className="aw-client-hero-actions"><span className={"aw-client-status aw-client-status-"+(client.agreementExpired?"ended":client.status.toLowerCase())}>{client.agreementExpired?"EXPIRED":client.status}</span>
     <button className="aw-client-btn" type="button" onClick={()=>{void load();void loadOverview();}} disabled={busy}><RefreshCw size={15}/>Refresh</button>
    </div>
   </div>
   <div className="aw-client-statrow">
    <div className="aw-client-stat"><CalendarDays size={18}/><span>{client.agreementExpired?"Agreement ended":"Agreement ends"}</span><strong>{(client.agreementEndedOn??client.contractEndOn)?.slice(0,10)||"Not set"}</strong></div>
    <div className="aw-client-stat"><CheckCircle2 size={18}/><span>Onboarding</span><strong>{(client.onboarding??[]).length}/5</strong></div>
 {canFinance&&<><div className="aw-client-stat"><span>Monthly service fee</span><strong>{money(client.monthlyFee)}</strong></div><div className="aw-client-stat"><span>Monthly ad budget</span><strong>{money(client.monthlyAdBudget)}</strong></div></>}
   </div>
  </header>
  <nav className="aw-client-tabs" role="tablist" aria-label="Client workspace sections">
   {tabs.filter(([key])=>key!=="finance"||canFinance).map(([key,label,Icon])=><button key={key} role="tab" type="button" id={"client-tab-"+key} aria-controls="client-workspace-panel" aria-selected={tab===key}
    className={tab===key?"aw-client-tab aw-client-tab-current":"aw-client-tab"} onClick={()=>{setTab(key);setError("");setSuccess("");}}>
     <Icon size={17}/>{label}</button>)}
  </nav>
  {error&&<div className="aw-client-alert" role="alert">{error}</div>}
  {success&&<div className="aw-client-success" role="status">{success}</div>}
  <div id="client-workspace-panel" role="tabpanel" aria-labelledby={"client-tab-"+tab} data-testid="client-workspace-active-panel">
   {tab==="overview"&&<div className="aw-client-overview-grid">
 <section className="aw-client-panel"><div className="aw-client-panel-heading"><div><h2>Content readiness</h2><p>{overview?.readiness.from&&overview.readiness.to?overview.readiness.from+" – "+overview.readiness.to:overview?"Set agreement start date to configure the client cycle":"Loading client service cycle…"}</p></div></div>
 {overview?<div className="aw-client-metrics">{[["Videos ready",overview.readiness.videos],["Regular posts ready",overview.readiness.posts],["Festival posts ready",overview.readiness.festival],["Videos delivered this cycle",overview.readiness.videosDelivered],["Posts delivered this cycle",overview.readiness.postsDelivered],["Festival posts delivered this cycle",overview.readiness.festivalDelivered]].map(([label,value])=><div className="aw-client-stat" key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>:<p className="aw-client-muted">{overviewError||"Loading readiness…"}</p>}
 <div className="aw-client-actions"><button className="aw-client-btn" onClick={()=>setTab("video")}>Video readiness</button><button className="aw-client-btn" onClick={()=>setTab("post")}>Post readiness</button></div></section>
 <section className="aw-client-panel"><h2>Account management</h2>{canEdit&&overview?<form className="aw-client-form" onSubmit={saveAccount}><div className="aw-client-form-grid"><label>Account manager<select className="field" value={managerId} onChange={e=>setManagerId(e.target.value)}><option value="">Unassigned</option>{overview.managers.map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select></label><label>Client health<select className="field" value={health} onChange={e=>setHealth(e.target.value as Health)}>{clientHealthSchema.options.map(h=><option value={h} key={h}>{healthLabels[h]}</option>)}</select></label><label className="aw-client-wide">Account notes<textarea className="field" rows={3} maxLength={2000} value={accountNote} onChange={e=>setAccountNote(e.target.value)}/></label></div><h3>Onboarding checklist</h3>{clientOnboardingSchema.options.map(k=><label className="aw-client-check" key={k}><input type="checkbox" checked={onboarding.includes(k)} onChange={e=>setOnboarding(v=>e.target.checked?[...v,k]:v.filter(x=>x!==k))}/>{checklistLabels[k]}</label>)}<button className="aw-client-primary" disabled={busy}>Save account details</button></form>:<div className="space-y-2"><p>Manager: {overview?.manager?.displayName??"Unassigned"}</p><p>Health: {healthLabels[client.health??"UNASSESSED"]}</p><p>{client.notes||"No account notes"}</p>{clientOnboardingSchema.options.map(k=><p key={k}>{(client.onboarding??[]).includes(k)?"✓":"○"} {checklistLabels[k]}</p>)}</div>}</section>
 </div>}
 {tab==="finance"&&canFinance&&<section className="aw-client-panel"><h2>Client financial overview</h2><p className="aw-client-muted">Contract projection, issued invoices, verified payments and ad funds remain separate. No ledger entries are created here.</p>{overview?.financial?<><div className="aw-client-metrics">{[["Agreed monthly service fee",client.monthlyFee],["Agreed monthly ad budget",client.monthlyAdBudget],["Issued invoices · all time",overview.financial.invoiceTotal],["Allocated invoice payments · all time",overview.financial.invoicePaid],["Outstanding issued invoices · all time",overview.financial.invoiceOutstanding],["Verified payments · agency cycle "+cycleLabel(overview.cycle.key),overview.financial.verifiedPayments],["Ad funds received · agency cycle",overview.financial.funds?.received??null],["Ad spend · agency cycle",overview.financial.funds?.spent??null],["Ad funds refunded · agency cycle",overview.financial.funds?.refunded??null],["Ad funds closing balance",overview.financial.funds?.closing??null]].map(([label,value])=><div className="aw-client-stat" key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div><p className="aw-client-muted">Invoice amounts may include tax or other items; they are not automatically treated as service fees. {overview.financial.invoiceCount===0?"No issued invoices are recorded.":""}</p></>:<p className="aw-client-muted">{overviewError||"Loading financial overview…"}</p>}<Link className="aw-client-btn" href="/app/finance">Open Finance</Link></section>}
 {tab==="history"&&<section className="aw-client-panel"><h2>Client activity & agreement history</h2><p className="aw-client-muted">Latest 100 recorded client events. Earlier unrecorded events are not inferred.</p>{overview?.history.map(event=><article key={event.id} className="aw-client-history"><strong>{event.action.replace("clients.","").replaceAll("_"," ")}</strong><small>{new Date(event.createdAt).toLocaleString("en-IN",{timeZone:"Asia/Kolkata"})} · {event.actor?.displayName??"System"}</small>{canFinance&&event.beforeRedacted&&["clients.agreement_renewed","clients.reactivated"].includes(event.action)&&<div className="aw-client-history-terms"><p>Previous: {String(event.beforeRedacted.startOn??"Not set")} – {String(event.beforeRedacted.endOn??"Open")} · {money(event.beforeRedacted.monthlyFee as string|null)} service / {money(event.beforeRedacted.monthlyAdBudget as string|null)} ads</p><p>New: {String(event.afterRedacted?.startOn??"")} – {String(event.afterRedacted?.endOn??"")} · {money(event.afterRedacted?.monthlyFee as string|null)} service / {money(event.afterRedacted?.monthlyAdBudget as string|null)} ads</p><p>{String(event.afterRedacted?.reason??"")}</p></div>}</article>)}{!overview?.history.length&&<p className="aw-client-muted">{overviewError||"No recorded events yet."}</p>}</section>}
 {tab==="files"&&<section className="aw-client-panel" aria-label="Client files and assets">
   <div className="aw-client-panel-heading"><div><h2>Files & Assets</h2>
    <p>Files linked to this client can be opened in the shared asset library. Unassigned agency files remain available through the full library for authorised members.</p></div></div>
   {!session.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&session.identity.permissions.includes("assets.read")?
    <div className="aw-client-actions">
     <Link className="aw-client-primary" href={"/app/clients/assets?clientId="+encodeURIComponent(client.id)}>
      <FolderOpen size={16} aria-hidden="true"/>Open this client's files</Link>
     <Link className="aw-client-btn" href="/app/clients/assets">All agency files</Link>
    </div>:
    <p className="aw-client-muted">You do not have access to the shared asset library.</p>}
  </section>}
  {tab==="video"&&<ClientVideoReadiness clientId={client.id}/>}
  {tab==="post"&&<ClientPostReadiness clientId={client.id}/>}
   {tab==="agreement"&&<section className="aw-client-panel"><div className="aw-client-panel-heading"><div><h2>Client profile & agreement</h2><p>Keep account information and commercial terms tied to the original client record.</p></div><span className="aw-client-muted">Revision {client.version}</span></div>
    {client.agreementExpired&&<div className="aw-client-callout" role="status"><div><strong>Agreement expired</strong>
      <p>Excluded from projected income. {client.agreementEndedOn?"Ended on "+client.agreementEndedOn.slice(0,10)+". ":""}{client.agreementEndReason}</p></div>
      <Link href="/app/clients/expired" className="aw-client-btn">View expired agreements</Link></div>}
    {canEdit&&!client.agreementEndedOn&&client.status!=="ARCHIVED"&&<div className="aw-client-actions mb-4">
      <EndClientAgreement client={client} onEnded={async()=>{await load();setSuccess("Agreement ended. Client moved to Expired and removed from projected income.");}}/>
    </div>}
    {client.sourceLead&&<p className="aw-client-muted">Converted from approved lead: {client.sourceLead.businessName}</p>}
 {canEdit&&canFinance&&client.status!=="ARCHIVED"&&<button type="button" className="aw-client-primary" onClick={openRenew}>{client.agreementExpired?"Reactivate client":"Renew agreement"}</button>}
 {client.currentAgreementStartOn&&<p className="aw-client-muted">Current agreement started {client.currentAgreementStartOn.slice(0,10)}. Original readiness anchor retained.</p>}
    {canEdit?<form className="aw-client-form" onSubmit={saveAgreement} aria-label="Edit client agreement">
     <div className="aw-client-form-grid">
      <label>Business name<input className="field" required minLength={2} value={form.businessName} onChange={e=>setForm(v=>v?{...v,businessName:e.target.value}:v)}/></label>
      <label>Business category<input className="field" value={form.businessType} onChange={e=>setForm(v=>v?{...v,businessType:e.target.value}:v)}/></label>
      <label>Phone<input className="field" value={form.phone} onChange={e=>setForm(v=>v?{...v,phone:e.target.value}:v)}/></label>
      <label>Email<input className="field" type="email" value={form.email} onChange={e=>setForm(v=>v?{...v,email:e.target.value}:v)}/></label>
      <label>Location<input className="field" value={form.location} onChange={e=>setForm(v=>v?{...v,location:e.target.value}:v)}/></label>
      <label>Status<select className="field" value={form.status} disabled={!!client.agreementEndedOn} onChange={e=>setForm(v=>v?{...v,status:e.target.value as Status}:v)}><option>ACTIVE</option><option>PAUSED</option><option>ARCHIVED</option>{client.status==="EXPIRED"&&<option>EXPIRED</option>}</select></label>
      <label>Agreement start<input className="field" type="date" disabled={!!client.currentAgreementStartOn} value={form.contractStartOn} onChange={e=>setForm(v=>v?{...v,contractStartOn:e.target.value}:v)}/></label>
      <label>Agreement end<input className="field" type="date" disabled={!!client.currentAgreementStartOn} min={form.contractStartOn||undefined} value={form.contractEndOn} onChange={e=>setForm(v=>v?{...v,contractEndOn:e.target.value}:v)}/></label>
      {canFinance&&<><label>Monthly service charge only (₹)<input className="field" inputMode="decimal" type="number" disabled={!!client.currentAgreementStartOn} min="0" step="0.0001" placeholder="15000" value={form.monthlyFee} onChange={e=>setForm(v=>v?{...v,monthlyFee:e.target.value}:v)}/></label>
      <label>Monthly ad budget (₹)<input className="field" inputMode="decimal" type="number" disabled={!!client.currentAgreementStartOn} min="0" step="0.0001" placeholder="3000" value={form.monthlyAdBudget} onChange={e=>setForm(v=>v?{...v,monthlyAdBudget:e.target.value}:v)}/></label>
      <div className="aw-client-wide"><strong>Monthly service charge + ad budget combined: {money(String(Number(form.monthlyFee||0)+Number(form.monthlyAdBudget||0)))}</strong><p>Projected agreement total only. Ad spend is not agency service income.</p></div></>}
      {(["websiteUrl","instagramUrl","facebookUrl"] as const).map(key=><label key={key}>{key==="websiteUrl"?"Website":key==="instagramUrl"?"Instagram":"Facebook"}<input className="field" type="url" value={form[key]} onChange={e=>setForm(v=>v?{...v,[key]:e.target.value}:v)}/></label>)}
 <label className="aw-client-wide">Client notes<textarea className="field" rows={4} value={form.notes} onChange={e=>setForm(v=>v?{...v,notes:e.target.value}:v)}/></label>
     </div>
     <div className="aw-client-actions"><button className="aw-client-primary" disabled={busy}>Save client & agreement</button></div>
    </form>:<div className="aw-client-readonly"><p>Status: {client.status}</p><p>Phone: {client.phone||"—"}</p><p>Agreement: {form.contractStartOn||"Not set"} to {form.contractEndOn||"Not set"}</p>{canFinance&&<p>Service charge: {money(client.monthlyFee)} · Ad budget: {money(client.monthlyAdBudget)} · Combined: {money(String(Number(client.monthlyFee||0)+Number(client.monthlyAdBudget||0)))}</p>}</div>}
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
 {renew&&<DirectoryModal title={client.agreementExpired?"Reactivate client":"Renew agreement"} description="Update the existing client. Previous terms remain in history; weekly readiness keeps its original anchor." onClose={()=>{if(!busy)setRenew(false);}}>
 <form className="aw-client-form" onSubmit={saveRenew}>{error&&<p role="alert" className="aw-client-alert">{error}</p>}<label>New agreement start<input className="field" type="date" required max={agencyToday()} value={renewForm.startOn} onChange={e=>setRenewForm(v=>({...v,startOn:e.target.value}))}/></label><label>New agreement end<input className="field" type="date" required min={agencyToday()} value={renewForm.endOn} onChange={e=>setRenewForm(v=>({...v,endOn:e.target.value}))}/></label><label>Monthly service fee<input className="field" type="number" min="0" step="0.0001" required value={renewForm.monthlyFee} onChange={e=>setRenewForm(v=>({...v,monthlyFee:e.target.value}))}/></label><label>Monthly ad budget<input className="field" type="number" min="0" step="0.0001" required value={renewForm.monthlyAdBudget} onChange={e=>setRenewForm(v=>({...v,monthlyAdBudget:e.target.value}))}/></label><label>Reason<textarea className="field" required minLength={4} maxLength={500} value={renewForm.reason} onChange={e=>setRenewForm(v=>({...v,reason:e.target.value}))}/></label><button className="aw-client-primary" disabled={busy}>Confirm agreement</button><button className="aw-client-btn" type="button" disabled={busy} onClick={()=>setRenew(false)}>Cancel</button></form>
 </DirectoryModal>}
 </div>;
}
