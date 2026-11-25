"use client";
import Link from "next/link";
import {agencyToday} from "@digimarket/contracts";
import {ContactPicker,DocumentPreview,useDocumentDraft,type DocumentLinks,endOfMonthTerm,type Quote,type Agreement} from "@/components/documents/workspace";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {Download,Plus,Trash2} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {Spinner} from "@/components/ui";
import {downloadAgreementPdf,type AgreementFields,type SavedAgreement} from "@/lib/agreement-pdf";

const today=agencyToday;
const standardServices:AgreementFields["services"] = [
  {name:"Website Development",description:"Website setup, core pages and agreed routine updates."},
  {name:"SEO",description:"On-page optimization and relevant search visibility work."},
  {name:"AEO",description:"Answer Engine Optimization for discoverability."},
  {name:"GEO",description:"Generative Engine Optimization for relevant online visibility."},
  {name:"Social Media Management",description:"Planning, captions, publishing and profile handling."},
  {name:"Meta Ads",description:"Facebook and Instagram campaign setup, monitoring and optimization."},
  {name:"Influencer Marketing",description:"Influencer outreach, campaign coordination and agreed collaboration fees."},
  {name:"Monthly Reels and Posts",description:"Production, editing and publishing of 8 reels and 8 branded posts each month."},
];
const initial=(mode:AgreementFields["mode"]):AgreementFields=>({
 mode,clientName:"",clientAddress:"",clientRepresentative:"",clientDesignation:"",clientEmail:"",
 agencyRepresentative:"",agencyDesignation:"",agreementDate:today(),startDate:today(),endDate:endOfMonthTerm(today()),
 serviceFee:"",feePeriod:"monthly",servicePayment:"full advance",advanceAmount:"0",paymentSchedule:"",
 adBudget:"0",adBudgetMode:"optional",adPayment:"before ads run",
 taxMode:"inclusive",gstRate:18,reels:8,posts:8,
 services:mode==="default"?standardServices.map(s=>({...s})):[],
 exclusions:"",additionalTerms:"",noticeDays:7,
});
const panel="rounded-2xl border border-[#412450] bg-[#190E26] p-5";
const label="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#E8CFF8]";
const row="grid gap-4 sm:grid-cols-2";
const input="field";
const alert=(e:unknown)=>e instanceof Error?e.message:"Agreement operation failed.";
const currency=(s:string)=>"₹"+(Number(s)||0).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function AgreementsPage(){
 const {session,request}=useAuth();
 const permitted=!!session?.identity.roles.some(role=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(role));
 const [mode,setMode]=useState<AgreementFields["mode"]>("default");
 const [form,setForm]=useState<AgreementFields>(()=>initial("default"));
 const [saving,setSaving]=useState(false),[downloading,setDownloading]=useState<string|null>(null),[loading,setLoading]=useState(false);
 const [error,setError]=useState(""),[notice,setNotice]=useState(""),[links,setLinks]=useState<DocumentLinks>({}),[previewOpen,setPreviewOpen]=useState(true);
 const restore=(payload:AgreementFields,refs:DocumentLinks)=>{setForm(payload);setMode(payload.mode);setLinks(refs)};
 const draft=useDocumentDraft("agreement",form,links,restore,permitted);
 const loadSource=useCallback(async()=>{if(!permitted)return;const p=new URLSearchParams(window.location.search),id=p.get("revision")??p.get("source"),quoteId=p.get("quotation");if(!id&&!quoteId)return;setLoading(true);setError("");
 try{if(quoteId){const source=await request<Quote>("/quotations/"+encodeURIComponent(quoteId));const q=source.payload;const start=today();setMode("custom");setForm({...initial("custom"),clientName:q.clientName,serviceFee:q.serviceFee,adBudget:q.adBudget,adBudgetMode:q.adBudgetMode,adPayment:q.adPayment,taxMode:q.taxMode,gstRate:q.gstRate,feePeriod:q.feePeriod,servicePayment:q.servicePayment==="monthly"?"monthly advance":"full advance",reels:q.reels,posts:q.posts,services:q.services.map(s=>({...s})),exclusions:q.exclusions,additionalTerms:"Source quotation: "+source.quoteNumber+"; quoted term: "+q.serviceTerm+". Review payment schedule and all terms before signing.",startDate:start,endDate:endOfMonthTerm(start)});setLinks({sourceQuotationId:source.id,clientId:source.clientId,leadId:source.leadId});setNotice("Commercial terms copied from "+source.quoteNumber+". Confirm dates, signatories and payment terms.");return;}
 if(id){const source=await request<Agreement>("/agreements/"+encodeURIComponent(id));const payload={...source.payload,agreementDate:today()};setMode(payload.mode);setForm(payload);setLinks({clientId:source.clientId,leadId:source.leadId,revisionOfId:p.has("revision")?source.id:null,sourceQuotationId:source.sourceQuotationId});setNotice("Copied saved document into a new draft.");}
 }catch(e){setError(alert(e))}finally{setLoading(false)}},[permitted,request]);
 useEffect(()=>{void loadSource()},[loadSource]);
 const patch=<K extends keyof AgreementFields>(key:K,value:AgreementFields[K])=>
   setForm(prev=>{const next={...prev,[key]:value};if(key==="startDate"&&(!prev.endDate||prev.endDate===endOfMonthTerm(prev.startDate)))next.endDate=endOfMonthTerm(String(value));if(next.mode==="default"&&(key==="reels"||key==="posts"))next.services=standardServices.map((s,i)=>i===7?{...s,description:`Production, editing and publishing of ${next.reels} reels and ${next.posts} branded posts each month.`}:{...s});return next});
 const switchMode=(next:AgreementFields["mode"])=>{
  if(next===mode||draft.dirty&&!window.confirm("Change template and discard unsaved changes?"))return;
  setLinks({});setMode(next);setForm(initial(next));setError("");setNotice("");
 };
 const previewRow=useMemo<Agreement>(()=>{const fee=Number(form.serviceFee)||0,ads=form.adBudgetMode==="not applicable"?0:Number(form.adBudget)||0,tax=form.taxMode==="extra"?Math.round(fee*form.gstRate)/100:0;return {id:"draft",agreementNumber:"DRAFT",clientName:form.clientName||"Client name",agreementDate:form.agreementDate,startDate:form.startDate,endDate:form.endDate||form.startDate,payload:{...form,clientName:form.clientName||"Client name",endDate:form.endDate||form.startDate},serviceFee:fee.toFixed(2),adBudget:ads.toFixed(2),total:(fee+ads+tax).toFixed(2),createdAt:""}},[form]);
 async function download(item:SavedAgreement){
  setDownloading(item.id);setError("");
  try{await downloadAgreementPdf(item);}
  catch(e){setError("PDF download failed: "+alert(e));}
  finally{setDownloading(null);}
 }
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");setNotice("");
  if(form.endDate<form.startDate){setError("End date must be on or after start date.");return;}
  if(!form.services.length){setError("Add at least one service.");return;}
  if(form.servicePayment==="instalments"&&!form.paymentSchedule.trim()){setError("Specify instalment dates and amounts.");return;}
  if(Number(form.advanceAmount)>Number(form.serviceFee)){setError("Advance cannot exceed service fee.");return;}
  if(form.adBudgetMode==="not applicable"&&Number(form.adBudget)!==0){setError("Set ad budget to zero when not applicable.");return;}
  setSaving(true);
  try{
   const saved=await request<SavedAgreement>("/agreements",{method:"POST",body:{...form,links}});
   draft.markSaved();setNotice(saved.agreementNumber+" saved. PDF generation started.");
   await download(saved);
  }catch(e){setError(alert(e));}
  finally{setSaving(false);}
 }
 if(!session)return <Spinner label="Checking agreement access…"/>;
 if(!permitted)return <section className="p-6"><h1>Agreements</h1><p>Only founders and administrators can access agreements.</p></section>;
 return <div className="aw-quote-page aw-v5-document-page dc-editor space-y-5" data-aw-module="agreements">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-xs font-bold uppercase tracking-[.2em] text-[#D65DEC]">AMPLIFYWORLD / SALES</p>
    <h1 className="mt-2 text-3xl font-extrabold text-[#FBF4FF]">Agreements</h1>
    <p className="mt-2 text-sm leading-6 text-[#C9B3D8]">Create numbered, signed-ready service agreements. Saved copies are immutable; signatures are completed on the exported PDF.</p>
   </div>
   <Link className="btn-secondary" href="/app/documents/agreements">Back to register</Link>
  </header>
  {loading&&<Spinner label="Loading document source…"/>}
  {draft.controls}
  <ContactPicker onSelect={c=>{setLinks(v=>({...v,clientId:c.kind==="client"?c.id:null,leadId:c.kind==="lead"?c.id:null}));setForm(v=>({...v,clientName:c.name.slice(0,160),clientRepresentative:c.representative.slice(0,120),clientDesignation:c.designation.slice(0,100),clientEmail:c.email.slice(0,200),clientAddress:c.address.slice(0,500)}));}}/>
  {error&&<div role="alert" className="rounded-xl border border-red-500 bg-[#3C1A2A] p-3 text-sm text-[#FFCFD7]">{error}</div>}
  {notice&&<div role="status" className="rounded-xl border border-purple-500 bg-[#29143A] p-3 text-sm text-[#F3D6FF]">{notice}</div>}
  <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Agreement type">
   {(["default","custom"] as const).map(option=><button key={option} type="button" aria-pressed={mode===option}
    className={"aw-quote-mode "+(mode===option?"aw-quote-mode-active":"")} onClick={()=>switchMode(option)}>
    <strong className="block text-base">{option==="default"?"Default agreement":"Custom agreement"}</strong>
    <span className="mt-1 block text-xs">{option==="default"?"Standard digital marketing services and clauses.":"Customize services, content targets and special terms."}</span>
   </button>)}
  </div>
  <nav className="aw-v5-document-steps" aria-label="Agreement sections">
    {([["01","Client","#agreement-client"],["02","Dates","#agreement-dates"],
      ["03","Services","#agreement-services"],["04","Charges","#agreement-charges"],
      ["05","Terms","#agreement-terms"],["06","Review","#agreement-summary"]] as const).map(([n,title,href])=>
       <a key={href} href={href}><span>{n}</span>{title}</a>)}
   </nav>
  <form className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(285px,.7fr)]" onSubmit={e=>void create(e)}>
   <div className="space-y-5">
    <section id="agreement-client" className={panel}>
     <h2 className="mb-4 text-lg font-bold text-[#F5E7FF]">1. Client and representatives</h2>
     <div className={row}>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-client">Client / legal business name *</label>
       <input className={input} id="ag-client" required minLength={2} maxLength={160} value={form.clientName} onChange={e=>patch("clientName",e.target.value)}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-address">Registered / business address *</label>
       <textarea className={input} id="ag-address" required minLength={5} maxLength={500} rows={2} value={form.clientAddress} onChange={e=>patch("clientAddress",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-client-rep">Client signatory name *</label>
       <input className={input} id="ag-client-rep" required maxLength={120} value={form.clientRepresentative} onChange={e=>patch("clientRepresentative",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-client-role">Client signatory designation</label>
       <input className={input} id="ag-client-role" maxLength={100} value={form.clientDesignation} onChange={e=>patch("clientDesignation",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-agency-rep">Agency signatory name *</label>
       <input className={input} id="ag-agency-rep" required maxLength={120} value={form.agencyRepresentative} onChange={e=>patch("agencyRepresentative",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-agency-role">Agency signatory designation</label>
       <input className={input} id="ag-agency-role" maxLength={100} value={form.agencyDesignation} onChange={e=>patch("agencyDesignation",e.target.value)}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-email">Client email</label>
       <input className={input} id="ag-email" type="email" maxLength={200} value={form.clientEmail} onChange={e=>patch("clientEmail",e.target.value)}/></div>
     </div>
    </section>
    <section id="agreement-dates" className={panel}>
     <h2 className="mb-4 text-lg font-bold text-[#F5E7FF]">2. Agreement dates and term</h2>
     <div className="grid gap-4 sm:grid-cols-3">
      <div><label className={label} htmlFor="ag-date">Agreement date *</label><input className={input} id="ag-date" type="date" required value={form.agreementDate} onChange={e=>patch("agreementDate",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-start">Start date *</label><input className={input} id="ag-start" type="date" required value={form.startDate} onChange={e=>patch("startDate",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-end">End date *</label><input className={input} id="ag-end" type="date" min={form.startDate} required value={form.endDate} onChange={e=>patch("endDate",e.target.value)}/></div>
     </div>
    </section>
    <section id="agreement-services" className={panel}>
     <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-[#F5E7FF]">3. Services and deliverables</h2>
      {mode==="custom"&&<button type="button" className="btn-secondary" disabled={form.services.length>=12} onClick={()=>patch("services",[...form.services,{name:"",description:""}])}><Plus size={16}/>Add service</button>}
     </div>
     {mode==="default"?<div className="grid gap-2 sm:grid-cols-2">{form.services.map((s,i)=><div key={s.name} className="aw-quote-fixed-service">
      <span className="text-xs font-bold text-[#EC74F1]">{String(i+1).padStart(2,"0")}</span>
      <div><strong className="text-sm text-[#F5E7FF]">{s.name}</strong><p className="mt-1 text-xs leading-5 text-[#C4ACD4]">{s.description}</p></div></div>)}</div>:
      <div className="space-y-3">
       <div className="flex flex-wrap gap-2">{standardServices.map(s=><button className="btn-secondary text-xs" key={s.name} type="button"
        disabled={form.services.length>=12||form.services.some(v=>v.name===s.name)}
        onClick={()=>patch("services",[...form.services,{...s}])}>+ {s.name}</button>)}</div>
       {form.services.map((s,i)=><div key={i} className="rounded-lg border border-[#4B285C] p-3">
        <div className="flex justify-between"><strong>Service {i+1}</strong><button type="button" aria-label={"Remove service "+(i+1)} onClick={()=>patch("services",form.services.filter((_,j)=>j!==i))}><Trash2 size={16}/></button></div>
        <label className={label} htmlFor={"ag-service-"+i}>Service name</label>
        <input id={"ag-service-"+i} className={input} required maxLength={90} value={s.name}
         onChange={e=>patch("services",form.services.map((v,j)=>j===i?{...v,name:e.target.value}:v))}/>
        <label className={label} htmlFor={"ag-detail-"+i}>Deliverables / description</label>
        <textarea id={"ag-detail-"+i} className={input} required maxLength={350} rows={2} value={s.description}
         onChange={e=>patch("services",form.services.map((v,j)=>j===i?{...v,description:e.target.value}:v))}/>
       </div>)}
      </div>}
     <div className={"mt-4 "+row}>
      <div><label className={label} htmlFor="ag-reels">Reels per month</label><input className={input} id="ag-reels" type="number" min={0} max={999} value={form.reels} onChange={e=>patch("reels",Number(e.target.value))}/></div>
      <div><label className={label} htmlFor="ag-posts">Posts per month</label><input className={input} id="ag-posts" type="number" min={0} max={999} value={form.posts} onChange={e=>patch("posts",Number(e.target.value))}/></div>
     </div>
    </section>
    <section id="agreement-charges" className={panel}>
     <h2 className="mb-4 text-lg font-bold text-[#F5E7FF]">4. Charges and payment schedule</h2>
     <div className={row}>
      <div><label className={label} htmlFor="ag-fee">Agency service fee (₹) *</label><input className={input} id="ag-fee" required type="number" min={0} max={999999999} step=".01" value={form.serviceFee} onChange={e=>patch("serviceFee",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-period">Fee period</label><select id="ag-period" className={input} disabled={mode==="default"} value={form.feePeriod} onChange={e=>patch("feePeriod",e.target.value as AgreementFields["feePeriod"])}><option value="monthly">Monthly</option><option value="one-time">One-time</option></select></div>
      <div><label className={label} htmlFor="ag-payment">Service fee payment</label><select id="ag-payment" className={input} value={form.servicePayment} onChange={e=>patch("servicePayment",e.target.value as AgreementFields["servicePayment"])}><option value="full advance">Full advance</option><option value="monthly advance">Monthly advance</option><option value="instalments">Instalments</option></select></div>
      <div><label className={label} htmlFor="ag-advance">Initial amount payable (₹)</label><input className={input} id="ag-advance" required type="number" min={0} max={999999999} step=".01" value={form.advanceAmount} onChange={e=>patch("advanceAmount",e.target.value)}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-schedule">Payment schedule {form.servicePayment==="instalments"?"*":"(optional)"}</label>
       <textarea className={input} id="ag-schedule" rows={2} required={form.servicePayment==="instalments"} maxLength={500} value={form.paymentSchedule} onChange={e=>patch("paymentSchedule",e.target.value)} placeholder="Example: ₹7,000 at signing, balance ₹3,000 by 15 November"/></div>
      <div><label className={label} htmlFor="ag-ads">Advertising budget (₹)</label><input className={input} id="ag-ads" type="number" min={0} max={999999999} step=".01" required value={form.adBudget} onChange={e=>patch("adBudget",e.target.value)}/></div>
      <div><label className={label} htmlFor="ag-ads-mode">Advertising budget status</label><select className={input} id="ag-ads-mode" value={form.adBudgetMode} onChange={e=>{const v=e.target.value as AgreementFields["adBudgetMode"];patch("adBudgetMode",v);if(v==="not applicable")patch("adBudget","0");}}><option value="optional">Optional</option><option value="mandatory">Mandatory</option><option value="not applicable">Not applicable</option></select></div>
      <div><label className={label} htmlFor="ag-ads-when">Ad payment timing</label><select className={input} id="ag-ads-when" value={form.adPayment} onChange={e=>patch("adPayment",e.target.value as AgreementFields["adPayment"])}><option value="before ads run">Before ads run</option><option value="at signing">At signing</option><option value="per schedule">Per schedule</option></select></div>
      <div><label className={label} htmlFor="ag-tax">Tax treatment</label><select className={input} id="ag-tax" value={form.taxMode} onChange={e=>patch("taxMode",e.target.value as AgreementFields["taxMode"])}><option value="inclusive">Inclusive</option><option value="extra">Extra</option><option value="not charged">Not charged</option></select></div>
      {form.taxMode==="extra"&&<div><label className={label} htmlFor="ag-gst">GST rate (%)</label><input className={input} type="number" id="ag-gst" min={0} max={28} step=".01" value={form.gstRate} onChange={e=>patch("gstRate",Number(e.target.value))}/></div>}
     </div>
    </section>
    <section id="agreement-terms" className={panel}>
     <h2 className="mb-4 text-lg font-bold text-[#F5E7FF]">5. Termination and additional conditions</h2>
     <div className={row}>
      <div><label className={label} htmlFor="ag-notice">Termination notice (days)</label><input className={input} id="ag-notice" type="number" min={0} max={90} value={form.noticeDays} onChange={e=>patch("noticeDays",Number(e.target.value))}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-exclusions">Excluded expenses / services</label><textarea className={input} id="ag-exclusions" rows={2} maxLength={1000} value={form.exclusions} onChange={e=>patch("exclusions",e.target.value)}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="ag-terms">Additional agreed terms</label><textarea className={input} id="ag-terms" rows={3} maxLength={1500} value={form.additionalTerms} onChange={e=>patch("additionalTerms",e.target.value)}/></div>
     </div>
     <p className="mt-4 text-xs leading-5 text-[#C4ACD4]">The PDF includes responsibilities, confidentiality, third-party costs, liability, termination and governing law. Typed names do not constitute electronic signatures.</p>
    </section>
   </div>
   <aside className="space-y-4 xl:sticky xl:top-6"><section id="agreement-summary" className={panel}>
    <h2 className="mb-4 text-lg font-bold text-[#F5E7FF]">Agreement summary</h2>
    <div className="space-y-3 text-sm">
     <div className="flex justify-between gap-3"><span>Agency fee</span><strong>{currency(form.serviceFee)}</strong></div>
     <div className="flex justify-between gap-3"><span>Ad budget</span><strong>{currency(form.adBudget)}</strong></div>
     <div className="flex justify-between gap-3"><span>Term</span><strong>{form.endDate&&form.startDate?form.startDate+" to "+form.endDate:"Select dates"}</strong></div>
     <div className="border-t border-[#553363] pt-3"><span className="block text-xs">Taxes additional where selected</span></div>
    </div>
    <button type="submit" className="btn-primary mt-5 w-full" disabled={saving||!!downloading}><Download size={16}/>{saving?"Saving…":"Generate & download PDF"}</button>
    <button type="button" className="btn-secondary mt-3 w-full" disabled={saving} onClick={()=>{if(draft.dirty&&!window.confirm("Clear unsaved changes?"))return;setLinks({});setForm(initial(mode));setError("");setNotice("");}}>Clear form</button>
   </section><button type="button" className="btn-secondary w-full" onClick={()=>setPreviewOpen(v=>!v)}>{previewOpen?"Hide preview":"Show preview"}</button>{previewOpen&&<DocumentPreview row={previewRow}/>}</aside>
  </form>
 </div>;
}
