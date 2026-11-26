"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {Download,Eye,Plus,RefreshCcw,Search,Copy,FileText,FileSignature} from "lucide-react";
import {agencyToday} from "@digimarket/contracts";
import {useAuth} from "@/components/auth-provider";
import {Spinner,Notice} from "@/components/ui";
import {downloadQuotationPdf,renderQuotationPages,type SavedQuotation} from "@/lib/quotation-pdf";
import {downloadAgreementPdf,renderAgreementPages,type SavedAgreement} from "@/lib/agreement-pdf";
export type DocumentLinks={clientId?:string|null;leadId?:string|null;revisionOfId?:string|null;sourceQuotationId?:string|null};
export type Quote=SavedQuotation&DocumentLinks;
export type Agreement=SavedAgreement&DocumentLinks;
export type DocKind="quotation"|"agreement";
export type DocRow=Quote|Agreement;
export const isQuote=(r:DocRow):r is Quote=>"quoteNumber" in r;
export const numberOf=(r:DocRow)=>isQuote(r)?r.quoteNumber:r.agreementNumber;
export const dateOf=(r:DocRow)=>(isQuote(r)?r.quoteDate:r.agreementDate).slice(0,10);
export const money=(v:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR"}).format(Number(v));
export function endOfMonthTerm(start:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start))return "";
 const d=new Date(start+"T00:00:00Z"),day=d.getUTCDate();if(!Number.isFinite(d.getTime()))return "";
 d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+1);
 const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
 d.setUTCDate(Math.min(day,last));d.setUTCDate(d.getUTCDate()-1);return d.toISOString().slice(0,10);
}
export function statusOf(r:DocRow,today=agencyToday()){
 if(isQuote(r)){const date=dateOf(r),end=new Date(date+"T00:00:00Z");end.setUTCDate(end.getUTCDate()+Math.max(1,Math.min(180,Number.isFinite(r.payload.validityDays)?r.payload.validityDays:7))-1);return date>today?"Future dated":end.toISOString().slice(0,10)<today?"Validity ended":"Within validity";}
 const end=r.endDate.slice(0,10),start=r.startDate.slice(0,10);return end<today?"Term ended":start>today?"Future term":"Current term";
}
export function DocumentPreview({row}:{row:DocRow}){
 const [images,setImages]=useState<string[]>([]),[error,setError]=useState(""),[zoom,setZoom]=useState(100),[index,setIndex]=useState(0),[busy,setBusy]=useState(true);
 useEffect(()=>{let cancelled=false;setBusy(true);setError("");const t=setTimeout(()=>{void (isQuote(row)?renderQuotationPages(row):renderAgreementPages(row)).then(pages=>{if(!cancelled){setImages(pages.map(c=>c.toDataURL("image/png")));setIndex(i=>Math.min(i,pages.length-1));}}).catch(e=>{if(!cancelled){setImages([]);setError(e instanceof Error?e.message:"Preview unavailable")}}).finally(()=>{if(!cancelled)setBusy(false)})},220);return()=>{cancelled=true;clearTimeout(t)}},[row]);
 return <div className="dc-preview"><div className="dc-row"><strong>PDF preview</strong><span className="dc-muted">{busy?"Updating…":images.length+" page"+(images.length===1?"":"s")}</span></div>{error&&<Notice kind="error">{error}</Notice>}{images.length>0&&<><div className="dc-preview-scroll"><img src={images[index]} alt={"Document preview page "+(index+1)} style={{width:zoom+"%",maxWidth:"none"}}/></div><div className="dc-row"><button type="button" className="btn-secondary" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>Previous</button><span>{index+1} / {images.length}</span><button type="button" className="btn-secondary" disabled={index>=images.length-1} onClick={()=>setIndex(i=>i+1)}>Next</button></div><div className="dc-row"><button type="button" className="btn-secondary" disabled={zoom<=50} onClick={()=>setZoom(v=>v-25)}>−</button><button className="btn-secondary" type="button" onClick={()=>setZoom(100)}>{zoom}% · Fit</button><button type="button" className="btn-secondary" disabled={zoom>=200} onClick={()=>setZoom(v=>v+25)}>+</button></div></>}</div>;
}
export function PreviewDialog({row,onClose}:{row:DocRow;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);useEffect(()=>{dialog.current?.showModal()},[]);
 return <dialog ref={dialog} className="dc-dialog" onCancel={onClose}><div className="dc-row"><h2>{numberOf(row)}</h2><button className="btn-secondary" onClick={onClose} type="button">Close</button></div><DocumentPreview row={row}/></dialog>;
}
type List<T>={items:T[];matching:number;page:number;totalPages:number;summary:{total?:number;current?:number;ending?:number};legacy:boolean};
type ListFilters={q:string;status:string;mode:string;sort:string;page:number;limit:number;from:string;to:string;relatedTo:string};
const record=(value:unknown):Record<string,unknown>|null=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:null;
const count=(value:unknown):number|undefined=>typeof value==="number"&&Number.isSafeInteger(value)&&value>=0?value:undefined;
const validDate=(value:unknown):value is string=>typeof value==="string"&&/^\d{4}-\d{2}-\d{2}/.test(value)&&Number.isFinite(Date.parse(value));
function validRow(value:unknown,kind:DocKind):value is DocRow{
 const r=record(value);if(!r||!record(r.payload))return false;
 return typeof r.id==="string"&&typeof r.clientName==="string"&&validDate(r.createdAt)&&
  ["serviceFee","adBudget","total"].every(k=>typeof r[k]==="string"||typeof r[k]==="number")&&
  (kind==="quotation"?typeof r.quoteNumber==="string"&&validDate(r.quoteDate):typeof r.agreementNumber==="string"&&validDate(r.agreementDate)&&validDate(r.startDate)&&validDate(r.endDate));
}
function normalizeList<T extends DocRow>(raw:unknown,kind:DocKind,filters:ListFilters):List<T>{
 const data=record(raw);if(!data||!Array.isArray(data.items)||!data.items.every(row=>validRow(row,kind)))throw Error("Invalid "+kind+" register response. Refresh or contact your administrator.");
 const items=data.items as T[],summary=record(data.summary);
 const total=count(summary?.total),current=count(summary?.current),ending=count(summary?.ending),matching=count(data.matching),page=count(data.page),totalPages=count(data.totalPages);
 if(total!==undefined&&matching!==undefined&&page!==undefined&&page>0&&totalPages!==undefined&&totalPages>0)
  return {items,matching,page,totalPages,summary:{total,current,ending},legacy:false};
 // Older deployed APIs return only {items}, capped at 150 records.
 // Never treat a truncated history as the organization-wide total.
 const today=agencyToday(),soon=new Date(today+"T00:00:00Z");soon.setUTCDate(soon.getUTCDate()+7);
 const query=filters.q.trim().toLowerCase();
 const filtered=items.filter(r=>{
  const date=dateOf(r),status=statusOf(r);
  const matchesStatus=filters.status==="all"||
   filters.status==="current"&&(status==="Within validity"||status==="Current term")||
   filters.status==="ended"&&(status==="Validity ended"||status==="Term ended")||
   filters.status==="future"&&(status==="Future dated"||status==="Future term")||
   filters.status==="ending"&&!isQuote(r)&&status==="Current term"&&r.endDate.slice(0,10)<=soon.toISOString().slice(0,10);
  return (!query||(r.clientName+" "+numberOf(r)).toLowerCase().includes(query))&&(!filters.from||date>=filters.from)&&(!filters.to||date<=filters.to)&&
   (filters.mode==="all"||(filters.mode==="default"?r.payload.mode==="default":r.payload.mode!=="default"))&&matchesStatus;
 }).sort((a,b)=>filters.sort==="oldest"?a.createdAt.localeCompare(b.createdAt):b.createdAt.localeCompare(a.createdAt));
 return {items:filtered.slice((filters.page-1)*filters.limit,filters.page*filters.limit),matching:filtered.length,page:filters.page,totalPages:Math.max(1,Math.ceil(filtered.length/filters.limit)),summary:{total,current,ending},legacy:true};
}
export function DocumentRegister({kind}:{kind?:DocKind}){
 const {session,request}=useAuth(),allowed=!!session?.identity.roles.some(r=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(r));
 const [q,setQ]=useState(""),[status,setStatus]=useState("all"),[mode,setMode]=useState("all"),[sort,setSort]=useState("newest"),[from,setFrom]=useState(""),[to,setTo]=useState(""),[page,setPage]=useState(1),[type,setType]=useState<"all"|DocKind>("all"),[relatedTo,setRelatedTo]=useState("");
 const [quotes,setQuotes]=useState<List<Quote>|null>(null),[agreements,setAgreements]=useState<List<Agreement>|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[preview,setPreview]=useState<DocRow|null>(null),[downloading,setDownloading]=useState(false);
 const seq=useRef(0);
 const load=useCallback(async()=>{if(!allowed)return;const id=++seq.current;setBusy(true);setError("");
 try{const params=new URLSearchParams({q,status,mode,sort,page:String(kind?page:1),limit:kind?"20":"10"});if(from)params.set("from",from);if(to)params.set("to",to);if(relatedTo&&kind)params.set("relatedTo",relatedTo);
 const filters={q,status,mode,sort,page:kind?page:1,limit:kind?20:10,from,to,relatedTo};
 const [a,b]=await Promise.allSettled([
  kind==="agreement"?Promise.resolve(null):request<unknown>("/quotations?"+params).then(raw=>normalizeList<Quote>(raw,"quotation",filters)),
  kind==="quotation"?Promise.resolve(null):request<unknown>("/agreements?"+params).then(raw=>normalizeList<Agreement>(raw,"agreement",filters))
 ]);
 if(seq.current===id){
  setQuotes(a.status==="fulfilled"?a.value:null);setAgreements(b.status==="fulfilled"?b.value:null);
  const failures=[a,b].filter(result=>result.status==="rejected").map(result=>result.reason instanceof Error?result.reason.message:"Unable to load documents");
  setError(failures.join(" · "));
 }
 }catch(e){if(seq.current===id){setError(e instanceof Error?e.message:"Unable to load documents");setQuotes(null);setAgreements(null)}}finally{if(seq.current===id)setBusy(false)}},[allowed,kind,request,q,status,mode,sort,page,from,to,relatedTo]);
 useEffect(()=>{const t=setTimeout(()=>void load(),200);return()=>{clearTimeout(t);seq.current++}},[load]);
 if(!session)return <Spinner label="Checking document access…"/>;if(!allowed)return <Notice kind="error">Documents require founder or administrator access.</Notice>;
 const rows:DocRow[]=[...(type==="agreement"&&!kind?[]:quotes?.items??[]),...(type==="quotation"&&!kind?[]:agreements?.items??[])].sort((a,b)=>sort==="newest"?b.createdAt.localeCompare(a.createdAt):a.createdAt.localeCompare(b.createdAt)).slice(0,kind?20:10);
 const data=kind==="quotation"?quotes:agreements;
 const create=(k:DocKind)=>"/app/documents/"+(k==="quotation"?"quotations":"agreements")+"/new";
 const change=(fn:()=>void)=>{fn();setPage(1)};
 const download=async(r:DocRow)=>{setDownloading(true);setError("");try{if(isQuote(r))await downloadQuotationPdf(r);else await downloadAgreementPdf(r)}catch(e){setError(e instanceof Error?e.message:"PDF failed")}finally{setDownloading(false)}};
 const source=async(kind:DocKind,id:string)=>{try{setPreview(await request<DocRow>("/"+(kind==="quotation"?"quotations":"agreements")+"/"+id))}catch(e){setError(e instanceof Error?e.message:"Source unavailable")}};
 return <div className="dc-page space-y-5" data-aw-module={kind==="quotation"?"quotations":kind==="agreement"?"agreements":"documents"}>
 <header className="dc-row"><div><h1>{kind==="quotation"?"Quotations":kind==="agreement"?"Agreements":"Documents"}</h1><p className="dc-muted">{kind?"Search and manage immutable saved documents.":"Commercial documents, drafts and recent activity."}</p></div><div className="dc-actions">{kind?<Link className="btn-primary" href={create(kind)}><Plus size={16}/>New {kind}</Link>:<><Link className="btn-primary" href={create("quotation")}><Plus size={16}/>New quotation</Link><Link className="btn-secondary" href={create("agreement")}><Plus size={16}/>New agreement</Link></>}<button className="btn-secondary" type="button" disabled={busy} onClick={()=>void load()}><RefreshCcw size={15}/>Refresh</button></div></header>
 {!kind&&<div className="dc-metrics">{[["Total quotations",quotes?.summary?.total],["Within validity",quotes?.summary?.current],["Total agreements",agreements?.summary?.total],["Terms ending in 7 days",agreements?.summary?.ending]].map(([label,value])=><div className="dc-panel" key={label}><span className="dc-muted">{label}</span><strong className="dc-number">{value??"—"}</strong></div>)}</div>}
 {(quotes?.legacy||agreements?.legacy)&&<div role="status" className="dc-panel dc-muted">Limited document history: the API has not supplied full totals or pagination metadata. Available records are shown; refresh after the API is updated.</div>}
 <section className="dc-panel"><div className="dc-row"><h2>{relatedTo?"Revision history":kind?"Document register":"Recent documents"}</h2>{relatedTo&&<button type="button" className="btn-secondary" onClick={()=>{setRelatedTo("");setPage(1)}}>Back to all documents</button>}{data&&kind&&<span className="dc-muted">{data.matching} {data.legacy?"matching in available history":"matching"}</span>}</div>
 <div className="dc-filters"><label className="dc-search"><Search size={16}/><input type="search" maxLength={160} aria-label="Search documents" placeholder="Client or document number" value={q} onChange={e=>change(()=>setQ(e.target.value))}/></label>
 {!kind&&<select className="field" aria-label="Document type" value={type} onChange={e=>change(()=>setType(e.target.value as typeof type))}><option value="all">All documents</option><option value="quotation">Quotations</option><option value="agreement">Agreements</option></select>}
 <select className="field" aria-label="Document validity" value={status} onChange={e=>change(()=>setStatus(e.target.value))}><option value="all">All dates</option><option value="current">Current validity / term</option><option value="ended">Ended</option><option value="future">Future</option>{kind==="agreement"&&<option value="ending">Ending in 7 days</option>}</select>
 <select className="field" aria-label="Template" value={mode} onChange={e=>change(()=>setMode(e.target.value))}><option value="all">All templates</option><option value="default">Default</option><option value="custom">Custom</option></select><select className="field" aria-label="Sort documents" value={sort} onChange={e=>change(()=>setSort(e.target.value))}><option value="newest">Latest first</option><option value="oldest">Oldest first</option></select></div>
 <div className="dc-filters"><label>From<input className="field" type="date" value={from} max={to||undefined} onChange={e=>change(()=>setFrom(e.target.value))}/></label><label>Through<input className="field" type="date" value={to} min={from||undefined} onChange={e=>change(()=>setTo(e.target.value))}/></label><button type="button" className="btn-secondary" onClick={()=>{setQ("");setStatus("all");setMode("all");setSort("newest");setFrom("");setTo("");setType("all");setRelatedTo("");setPage(1)}}>Clear filters</button></div>
 {error&&<Notice kind="error">{error}</Notice>}{busy&&!rows.length?<Spinner label="Loading saved documents…"/>:!rows.length?<p className="dc-muted">{error?"Document history unavailable. Try Refresh.":"No matching documents."}</p>:<div className="dc-table-scroll"><table className="dc-table" aria-label={kind==="quotation"?"Quotation history":kind==="agreement"?"Agreement history":"Recent documents"}><thead><tr>{["Document / client","Date / term","Service fee","Ad budget","Package value","Validity / term","Actions"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=>{const k=isQuote(r)?"quotation":"agreement",href=create(k);return <tr key={r.id}><td><div className="dc-row-id">{isQuote(r)?<FileText size={16}/>:<FileSignature size={16}/>}<strong>{r.clientName}</strong></div><small>{numberOf(r)}</small>{r.revisionOfId&&<small><button type="button" className="dc-link" onClick={()=>void source(k,r.revisionOfId!)}>View previous revision</button></small>}{!isQuote(r)&&r.sourceQuotationId&&<small><button type="button" className="dc-link" onClick={()=>void source("quotation",r.sourceQuotationId!)}>View source quotation</button></small>}</td><td>{dateOf(r)}{!isQuote(r)&&<small>{r.startDate.slice(0,10)} – {r.endDate.slice(0,10)}</small>}</td><td>{money(r.serviceFee)}</td><td>{money(r.adBudget)}</td><td>{money(r.total)}</td><td>{statusOf(r)}{!isQuote(r)&&<small>Generated, not signature verified</small>}</td><td><div className="dc-actions"><button type="button" className="btn-secondary" onClick={()=>setPreview(r)}><Eye size={14}/>Preview</button><button className="btn-secondary" type="button" disabled={downloading} onClick={()=>void download(r)}><Download size={14}/>PDF</button><details className="dc-menu"><summary>More</summary><div className="dc-actions"><Link className="btn-secondary" href={href+"?source="+r.id}><Copy size={14}/>Reuse</Link><Link className="btn-secondary" href={href+"?revision="+r.id}>Revise</Link>{kind&&!data?.legacy&&<button type="button" className="btn-secondary" onClick={()=>{setQ("");setMode("all");setStatus("all");setFrom("");setTo("");setRelatedTo(r.id);setPage(1)}}>Revision history</button>}{isQuote(r)&&<Link className="btn-secondary" href={create("agreement")+"?quotation="+r.id}>Create agreement</Link>}<button className="btn-secondary" type="button" onClick={()=>{void navigator.clipboard.writeText(numberOf(r)).catch(()=>setError("Clipboard unavailable"))}}>Copy number</button></div></details></div></td></tr>})}</tbody></table></div>}
 {kind&&data&&<div className="dc-row"><button className="btn-secondary" disabled={busy||page===1} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {data.page} of {data.totalPages}</span><button className="btn-secondary" disabled={busy||page>=data.totalPages} onClick={()=>setPage(p=>p+1)}>Next</button></div>}
 {!kind&&<div className="dc-actions"><Link href="/app/documents/quotations" className="btn-secondary">All quotations</Link><Link href="/app/documents/agreements" className="btn-secondary">All agreements</Link></div>}
 </section>{preview&&<PreviewDialog row={preview} onClose={()=>setPreview(null)}/>}</div>;
}
export type Contact={id:string;kind:"client"|"lead";name:string;representative:string;designation:string;email:string;address:string};
export function ContactPicker({onSelect}:{onSelect:(c:Contact)=>void}){
 const {request}=useAuth();const [q,setQ]=useState(""),[items,setItems]=useState<Contact[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 useEffect(()=>{let cancelled=false;if(q.trim().length<2){setItems([]);setBusy(false);return;}setBusy(true);setError("");const t=setTimeout(()=>void request<{items:Contact[]}>("/quotations/contacts?"+new URLSearchParams({q})).then(x=>{if(!cancelled)setItems(x.items)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"Search unavailable")}).finally(()=>{if(!cancelled)setBusy(false)}),200);return()=>{cancelled=true;clearTimeout(t)}},[q,request]);
 return <div className="dc-panel"><label>Find existing lead or client<input className="field" value={q} maxLength={160} placeholder="Search business name" onChange={e=>setQ(e.target.value)}/></label>{busy&&<p className="dc-muted">Searching…</p>}{error&&<p role="alert">{error}</p>}{items.map(c=><button type="button" className="dc-contact" key={c.kind+c.id} onClick={()=>{onSelect(c);setQ("");setItems([])}}>{c.name} · {c.kind}</button>)}{q.trim().length>=2&&!busy&&!error&&!items.length&&<p className="dc-muted">No matches. Enter details manually.</p>}</div>
}
export function useDocumentDraft<T extends object>(kind:DocKind,form:T,links:DocumentLinks,onRestore:(p:T,l:DocumentLinks)=>void,enabled:boolean){
 const {request}=useAuth(),[saved,setSaved]=useState<{payload:T;links:DocumentLinks;updatedAt:string}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[baseline,setBaseline]=useState<string|null>(null);
 const current=JSON.stringify({form,links}),dirty=baseline!==null&&baseline!==current;
 const validDraft=(payload:T)=>Object.entries(form).every(([key,value])=>{const v=(payload as Record<string,unknown>)[key];return Array.isArray(value)?Array.isArray(v)&&v.every(x=>x&&typeof x==="object"&&typeof x.name==="string"&&typeof x.description==="string"):typeof v===typeof value;});
 const base="/"+(kind==="quotation"?"quotations":"agreements")+"/draft";
 useEffect(()=>{if(enabled)setBaseline(v=>v??current)},[enabled,current]);
 useEffect(()=>{if(!enabled)return;let cancelled=false;void request<{payload:T;links:DocumentLinks;updatedAt:string}|null>(base).then(d=>{if(!cancelled)setSaved(d)}).catch(e=>{if(!cancelled)setError(e instanceof Error?e.message:"Draft unavailable")});return()=>{cancelled=true}},[enabled,base,request]);
 useEffect(()=>{if(!dirty)return;const before=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=""};const click=(e:MouseEvent)=>{const a=(e.target as Element|null)?.closest?.("a[href]");if(a instanceof HTMLAnchorElement&&a.origin===location.origin&&!a.hash&&a.href!==location.href&&!window.confirm("Leave with unsaved document changes?")){e.preventDefault();e.stopPropagation()}};window.addEventListener("beforeunload",before);document.addEventListener("click",click,true);return()=>{window.removeEventListener("beforeunload",before);document.removeEventListener("click",click,true)}},[dirty]);
 const save=async()=>{if(saved&&dirty&&!window.confirm("Replace the previous saved draft?"))return;setBusy(true);setError("");try{const d=await request<{payload:T;links:DocumentLinks;updatedAt:string}>(base,{method:"PUT",body:{payload:form,links}});setSaved(d);setBaseline(current)}catch(e){setError(e instanceof Error?e.message:"Draft not saved")}finally{setBusy(false)}};
 const clear=async()=>{setBusy(true);setError("");try{await request<void>(base,{method:"DELETE"});setSaved(null)}catch(e){setError(e instanceof Error?e.message:"Draft not removed")}finally{setBusy(false)}};
 return {dirty,markSaved:()=>setBaseline(current),controls:<div className="dc-row dc-draft"><span className="dc-muted">{dirty?"Unsaved changes":saved?"Draft saved · "+new Date(saved.updatedAt).toLocaleString("en-IN"):"New draft"}</span><div className="dc-actions"><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void save()}>Save draft</button>{saved&&<><button type="button" className="btn-secondary" disabled={busy} onClick={()=>{if(!dirty||window.confirm("Replace unsaved changes with the saved draft?")){if(!validDraft(saved.payload)){setError("Saved draft is incomplete or incompatible. Delete it or start a new draft.");return;}onRestore(saved.payload,saved.links);setBaseline(JSON.stringify({form:saved.payload,links:saved.links}))}}}>Resume draft</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>{if(window.confirm("Delete the saved draft?"))void clear()}}>Delete draft</button></>}</div>{error&&<p role="alert">{error}</p>}</div>};
}
