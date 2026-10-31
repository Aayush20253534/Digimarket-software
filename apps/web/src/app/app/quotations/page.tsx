"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {Download,FileText,Plus,RefreshCw,Trash2} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {PageHeader,Spinner} from "@/components/ui";
import {downloadQuotationPdf,type QuotationFields,type SavedQuotation} from "@/lib/quotation-pdf";

type Service=QuotationFields["services"][number];
const makeDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
const initial=():QuotationFields=>({
 clientName:"",packageTitle:"CUSTOM MARKETING PACKAGE",quoteDate:makeDate(),
 serviceFee:"",feePeriod:"monthly",servicePayment:"at signing",
 adBudget:"0",adBudgetMode:"not applicable",adPlatform:"Meta",adPayment:"before ads run",adFlexibility:"client-adjustable",
 taxMode:"not charged",gstRate:18,gstin:"",influencerFees:"not applicable",domainHosting:"not applicable",
 reels:8,posts:8,validityDays:7,serviceTerm:"1 month",services:[{name:"",description:""}],exclusions:"",
});
const money=(v:number)=>"₹"+v.toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
function cost(form:QuotationFields) {
 const service=Math.round((Number(form.serviceFee)||0)*100);
 const ads=form.adBudgetMode==="not applicable"?0:Math.round((Number(form.adBudget)||0)*100);
 const tax=form.taxMode==="extra"?Math.round(service*form.gstRate/100):0;
 return {service:service/100,ads:ads/100,tax:tax/100,total:(service+ads+tax)/100};
}
const field="field";
const label="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#593978]";
const card="rounded border border-[#E4CDEC] bg-white p-5 shadow-sm";
const action="btn-secondary";
const reason=(e:unknown)=>e instanceof Error?e.message:"Quotation operation failed.";

export default function QuotationsPage(){
 const {session,request}=useAuth();
 const permitted=!!session?.identity.roles.some(role=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(role));
 const [form,setForm]=useState<QuotationFields>(initial);
 const [rows,setRows]=useState<SavedQuotation[]>([]);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[downloading,setDownloading]=useState<string|null>(null);
 const [error,setError]=useState(""),[notice,setNotice]=useState("");
 const [search,setSearch]=useState("");
 const patch=<K extends keyof QuotationFields>(key:K,value:QuotationFields[K])=>setForm(prev=>({...prev,[key]:value}));
 const editService=(index:number,key:keyof Service,value:string)=>setForm(prev=>({
   ...prev,services:prev.services.map((s,i)=>i===index?{...s,[key]:value}:s),
 }));
 const load=useCallback(async()=>{
  if(!permitted){setLoading(false);return;}
  try{const out=await request<{items:SavedQuotation[]}>("/quotations");
   setRows(out.items);setError("");}
  catch(e){setError(reason(e));}finally{setLoading(false);}
 },[permitted,request]);
 useEffect(()=>{void load();},[load]);
 const totals=useMemo(()=>cost(form),[form]);
 const filtered=useMemo(()=>rows.filter(r=>[r.clientName,r.quoteNumber].join(" ").toLowerCase().includes(search.trim().toLowerCase())),[rows,search]);
 async function download(row:SavedQuotation){
  setDownloading(row.id);setError("");
  try{await downloadQuotationPdf(row);}catch(e){setError("PDF export failed: "+reason(e));}
  finally{setDownloading(null);}
 }
 async function create(e:FormEvent<HTMLFormElement>){
  e.preventDefault();setError("");setNotice("");
  if(form.services.some(s=>!s.name.trim()||!s.description.trim())){setError("Every service needs a name and brief description.");return;}
  if(form.adBudgetMode==="not applicable"&&Number(form.adBudget)!==0){setError("Set the ad budget to zero when not applicable.");return;}
  setSaving(true);
  try {
   const out=await request<SavedQuotation>("/quotations",{method:"POST",body:form});
   setRows(prev=>[out,...prev]);
   setNotice(out.quoteNumber+" saved. Your PDF has been prepared for download.");
   await download(out);
  } catch(e){setError(reason(e));}
  finally{setSaving(false);}
 }
 if(!session)return <Spinner label="Checking quotation access…"/>;
 if(!permitted)return <div className="p-6"><h1 className="text-xl font-bold">Quotations</h1><p>Only founder and administrator accounts can access quotations.</p></div>;
 return <div className="aw-module-root space-y-5" data-aw-module="quotations">
  <PageHeader eyebrow="AMPLIFYWORLD • SALES" title="Quotations"
   description="Create numbered, branded service quotations from the approved AmplifyWorld template. Quotations do not post income or create invoices."
   actions={<button className={action} type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/> Refresh</button>}/>
  {error&&<div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">{error}</div>}
  {notice&&<div role="status" className="rounded border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">{notice}</div>}
  <form className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(285px,.7fr)]" onSubmit={e=>void create(e)}>
   <div className="space-y-5">
    <section className={card}>
     <h2 className="mb-4 text-lg font-bold text-[#4C207A]">1. Client & quotation</h2>
     <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2"><label className={label} htmlFor="quote-client">Client / business name *</label>
       <input required minLength={2} maxLength={80} id="quote-client" className={field} value={form.clientName}
        onChange={e=>patch("clientName",e.target.value)} placeholder="Business or authorized legal name"/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="quote-title">Package title *</label>
       <input required maxLength={60} id="quote-title" className={field} value={form.packageTitle} onChange={e=>patch("packageTitle",e.target.value)}/></div>
      <div><label className={label} htmlFor="quote-date">Quotation date *</label>
       <input required type="date" id="quote-date" className={field} value={form.quoteDate} onChange={e=>patch("quoteDate",e.target.value)}/></div>
      <div className="flex items-end pb-2 text-sm text-[#766288]">Quotation number is assigned when saved.</div>
     </div>
    </section>
    <section className={card}>
     <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-[#4C207A]">2. Included services *</h2>
      <button type="button" className={action} disabled={form.services.length>=6}
       onClick={()=>patch("services",[...form.services,{name:"",description:""}])}><Plus size={15}/> Add service</button></div>
     <p className="mb-4 text-sm text-[#766288]">Up to six services, matching the two-column template grid.</p>
     <div className="grid gap-3 sm:grid-cols-2">{form.services.map((service,index)=>
      <div key={index} className="rounded border border-[#E7D7F0] bg-[#FBF8FD] p-3">
       <div className="mb-3 flex items-center justify-between"><strong className="text-sm text-[#4C207A]">Service {String(index+1).padStart(2,"0")}</strong>
        <button type="button" aria-label={"Remove service "+(index+1)} disabled={form.services.length===1} className="text-[#8D5A9C] disabled:opacity-40"
         onClick={()=>patch("services",form.services.filter((_,i)=>i!==index))}><Trash2 size={16}/></button></div>
       <label className={label} htmlFor={"quote-service-"+index}>Name *</label>
       <input required maxLength={52} id={"quote-service-"+index} className={field} value={service.name}
        onChange={e=>editService(index,"name",e.target.value)} placeholder="e.g. Social media management"/>
       <label className={label+" mt-3"} htmlFor={"quote-description-"+index}>Brief scope / deliverables *</label>
       <textarea required minLength={2} maxLength={115} rows={3} id={"quote-description-"+index} className={field}
        value={service.description} onChange={e=>editService(index,"description",e.target.value)}
        placeholder="What is included, quantity and exclusions"/>
      </div>)}</div>
     <div className="mt-4 grid grid-cols-2 gap-4">
      <div><label className={label} htmlFor="quote-reels">Monthly reels</label>
       <input id="quote-reels" type="number" min={0} max={999} className={field} value={form.reels} onChange={e=>patch("reels",Number(e.target.value))}/></div>
      <div><label className={label} htmlFor="quote-posts">Monthly posts</label>
       <input id="quote-posts" type="number" min={0} max={999} className={field} value={form.posts} onChange={e=>patch("posts",Number(e.target.value))}/></div>
     </div>
    </section>
    <section className={card}>
     <h2 className="mb-4 text-lg font-bold text-[#4C207A]">3. Fees, advertising & taxes</h2>
     <div className="grid gap-4 sm:grid-cols-2">
      <div><label className={label} htmlFor="quote-fee">Agency service fee (₹) *</label>
       <input required type="number" step=".01" min="0" max="999999999" id="quote-fee" className={field}
        value={form.serviceFee} onChange={e=>patch("serviceFee",e.target.value)}/></div>
      <div><label className={label} htmlFor="quote-period">Fee basis</label>
       <select id="quote-period" className={field} value={form.feePeriod} onChange={e=>patch("feePeriod",e.target.value as QuotationFields["feePeriod"])}>
        <option value="monthly">Monthly</option><option value="one-time">One-time</option>
       </select></div>
      <div><label className={label} htmlFor="quote-ad-mode">Advertising budget type *</label>
       <select id="quote-ad-mode" className={field} value={form.adBudgetMode}
        onChange={e=>{const mode=e.target.value as QuotationFields["adBudgetMode"];setForm(f=>({...f,adBudgetMode:mode,adBudget:mode==="not applicable"?"0":f.adBudget}));}}>
        <option value="not applicable">Not applicable</option><option value="optional">Optional</option><option value="mandatory">Mandatory</option>
       </select></div>
      <div><label className={label} htmlFor="quote-ads">Advertising budget (₹)</label>
       <input id="quote-ads" required type="number" min="0" max="999999999" step=".01" disabled={form.adBudgetMode==="not applicable"}
        className={field} value={form.adBudget} onChange={e=>patch("adBudget",e.target.value)}/></div>
      <div><label className={label} htmlFor="quote-tax">GST treatment</label>
       <select id="quote-tax" className={field} value={form.taxMode} onChange={e=>patch("taxMode",e.target.value as QuotationFields["taxMode"])}>
        <option value="not charged">Not charged</option><option value="inclusive">Included in quoted service fee</option><option value="extra">Add GST to service fee</option>
       </select></div>
      <div><label className={label} htmlFor="quote-gst-rate">GST rate (%)</label>
       <input id="quote-gst-rate" className={field} type="number" step=".01" min="0" max="28"
        disabled={form.taxMode!=="extra"} value={form.gstRate} onChange={e=>patch("gstRate",Number(e.target.value))}/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="quote-gstin">GSTIN (if applicable)</label>
       <input id="quote-gstin" className={field} maxLength={32} value={form.gstin} onChange={e=>patch("gstin",e.target.value)}/></div>
     </div>
     <p className="mt-3 text-xs text-[#7B6989]">GST added separately is calculated on agency fees, not client-controlled advertising spend. Validate tax treatment before issuing a legal quotation.</p>
    </section>
    <section className={card}>
     <h2 className="mb-4 text-lg font-bold text-[#4C207A]">4. Payment & commercial terms</h2>
     <div className="grid gap-4 sm:grid-cols-2">
      <div><label className={label} htmlFor="quote-service-payment">Service fee payable</label>
       <select id="quote-service-payment" className={field} value={form.servicePayment} onChange={e=>patch("servicePayment",e.target.value as QuotationFields["servicePayment"])}>
        <option>at signing</option><option>monthly</option><option>milestone</option></select></div>
      <div><label className={label} htmlFor="quote-channel">Advertising channel</label>
       <select id="quote-channel" className={field} value={form.adPlatform} onChange={e=>patch("adPlatform",e.target.value as QuotationFields["adPlatform"])}>
        <option>Meta</option><option>Google</option><option>Meta and Google</option><option>other</option></select></div>
      <div><label className={label} htmlFor="quote-ad-payment">Ad budget payable</label>
       <select id="quote-ad-payment" className={field} value={form.adPayment} onChange={e=>patch("adPayment",e.target.value as QuotationFields["adPayment"])}>
        <option>at signing</option><option>before ads run</option><option>per schedule</option></select></div>
      <div><label className={label} htmlFor="quote-budget-flex">Advertising budget</label>
       <select id="quote-budget-flex" className={field} value={form.adFlexibility} onChange={e=>patch("adFlexibility",e.target.value as QuotationFields["adFlexibility"])}>
        <option value="fixed">Fixed</option><option value="client-adjustable">Client-adjustable</option></select></div>
      <div><label className={label} htmlFor="quote-influencer">Influencer fees</label>
       <select id="quote-influencer" className={field} value={form.influencerFees} onChange={e=>patch("influencerFees",e.target.value as QuotationFields["influencerFees"])}>
        <option>included</option><option>extra</option><option>not applicable</option></select></div>
      <div><label className={label} htmlFor="quote-hosting">Domain and hosting</label>
       <select id="quote-hosting" className={field} value={form.domainHosting} onChange={e=>patch("domainHosting",e.target.value as QuotationFields["domainHosting"])}>
        <option>included</option><option>extra</option><option>client-provided</option><option>not applicable</option></select></div>
      <div><label className={label} htmlFor="quote-validity">Valid for (days)</label>
       <input id="quote-validity" className={field} type="number" required min={1} max={180} value={form.validityDays}
        onChange={e=>patch("validityDays",Number(e.target.value))}/></div>
      <div><label className={label} htmlFor="quote-term">Service term *</label>
       <input id="quote-term" className={field} required maxLength={60} value={form.serviceTerm}
        onChange={e=>patch("serviceTerm",e.target.value)} placeholder="e.g. 3 months"/></div>
      <div className="sm:col-span-2"><label className={label} htmlFor="quote-exclusions">Additional exclusions (optional)</label>
       <textarea id="quote-exclusions" className={field} rows={2} maxLength={110} value={form.exclusions}
        onChange={e=>patch("exclusions",e.target.value)} placeholder="Extra third-party costs or exclusions"/></div>
     </div>
    </section>
   </div>
   <aside className="space-y-5 xl:sticky xl:top-6">
    <section className="overflow-hidden rounded border border-[#DDB9EF] bg-white shadow-sm">
     <div className="bg-[#51217B] px-5 py-4 text-white"><FileText className="mb-2" size={22}/><h2 className="text-lg font-bold">Quotation summary</h2>
      <p className="text-sm text-[#E8D6F5]">AmplifyWorld • A4 PDF</p></div>
     <div className="space-y-3 p-5">
      <div className="flex justify-between text-sm"><span>Agency service fee</span><strong>{money(totals.service)}</strong></div>
      <div className="flex justify-between text-sm"><span>Advertising budget {form.adBudgetMode==="optional"?"(optional)":""}</span><strong>{money(totals.ads)}</strong></div>
      <div className="flex justify-between text-sm"><span>Additional GST</span><strong>{money(totals.tax)}</strong></div>
      <div className="border-t border-[#E6D7EC] pt-3 text-[#6E2488]"><div className="flex items-center justify-between gap-3"><strong>Total package value</strong><strong className="text-xl">{money(totals.total)}</strong></div></div>
      <p className="text-xs text-[#806F8A]">Optional advertising spend is included in package value when entered, but remains optional under the payment terms.</p>
      <button className="btn-primary w-full" type="submit" disabled={saving||!!downloading}>
       <Download size={16}/>{saving?"Saving quotation…":"Generate & download PDF"}</button>
      <button type="button" className="btn-secondary w-full" onClick={()=>{setForm(initial());setNotice("");setError("");}} disabled={saving}>Clear form</button>
     </div>
    </section>
   </aside>
  </form>
  <section className={card}>
   <div className="mb-4 flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-[#4C207A]">Quotation history</h2>
    <p className="text-sm text-[#826F91]">Saved quotations are immutable snapshots. Reuse as a new quotation to revise terms.</p></div>
    <input aria-label="Search quotation history" className={field+" max-w-sm"} placeholder="Search name or quotation number" value={search} onChange={e=>setSearch(e.target.value)}/></div>
   {loading?<p role="status">Loading quotations…</p>:!filtered.length?<p className="py-8 text-center text-[#826F91]">No quotations found.</p>:
    <div className="overflow-x-auto"><table className="w-full text-left text-sm" aria-label="Quotation history">
     <thead className="border-b bg-[#F8F2FC] text-[#542679]"><tr><th className="p-3">Quotation no.</th><th className="p-3">Client</th><th className="p-3">Date</th><th className="p-3">Total</th><th className="p-3">Actions</th></tr></thead>
     <tbody>{filtered.map(row=><tr key={row.id} className="border-b border-[#EEE4F3]">
      <td className="p-3 font-semibold text-[#572783]">{row.quoteNumber}</td><td className="p-3">{row.clientName}</td>
      <td className="p-3">{row.quoteDate.slice(0,10)}</td><td className="p-3">{money(Number(row.total))}</td>
      <td className="flex flex-wrap gap-2 p-3"><button className={action} disabled={!!downloading} onClick={()=>void download(row)} type="button">
        <Download size={15}/>{downloading===row.id?"Preparing…":"PDF"}</button>
       <button className={action} type="button" onClick={()=>{setForm({...row.payload,quoteDate:makeDate()});setNotice("Copied "+row.quoteNumber+" into a new, unsaved quotation.");window.scrollTo({top:0,behavior:"smooth"});}}>Reuse</button></td>
     </tr>)}</tbody></table></div>}
  </section>
 </div>;
}
