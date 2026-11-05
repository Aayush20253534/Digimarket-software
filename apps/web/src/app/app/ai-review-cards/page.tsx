"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {Check,Copy,ExternalLink,Plus,QrCode,RefreshCw,Printer,Save,ShieldCheck} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {PageHeader,Spinner} from "@/components/ui";

type Client={id:string;businessName:string};
type Card={
 id:string;clientId:string;slug:string;businessName:string;googleReviewUrl:string;
 businessDetails:string;logoUrl:string|null;accentColor:string;language:string;
 enabled:boolean;metrics:{scans:number;generated:number;clicks:number}
};
type Form={clientId:string;googleReviewUrl:string;businessDetails:string;logoUrl:string;accentColor:string;language:string;enabled:boolean};
const empty:Form={clientId:"",googleReviewUrl:"",businessDetails:"",logoUrl:"",accentColor:"#A855F7",language:"English",enabled:true};
const qr=(url:string,size=600)=>"https://api.qrserver.com/v1/create-qr-code/?size="+size+"x"+size+"&margin=12&format=png&data="+encodeURIComponent(url);
const errorText=(e:unknown)=>e instanceof Error?e.message:"Request failed";
export default function AiReviewCards(){
 const {session,request}=useAuth();
 const permitted=!!session?.identity.permissions.includes("clients.read");
 const canEdit=!!session?.identity.permissions.includes("clients.edit");
 const [cards,setCards]=useState<Card[]>([]);
 const [clients,setClients]=useState<Client[]>([]);
 const [busy,setBusy]=useState(false);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [editId,setEditId]=useState<string|null>(null);
 const [form,setForm]=useState<Form>(empty);
 const [printId,setPrintId]=useState<string|null>(null);
 const [copied,setCopied]=useState("");
 const load=useCallback(async()=>{
  if(!permitted)return;
  setLoading(true);
  try{
   const cardsResponse=await request<{items:Card[]}>("/review-cards");
   const all:Client[]=[];
   let cursor:string|null=null;
   for(let i=0;i<12;i++){
    const qs=new URLSearchParams({limit:"30"});
    if(cursor)qs.set("cursor",cursor);
    const page=await request<{items:Client[];nextCursor:string|null}>("/clients?"+qs);
    all.push(...page.items);cursor=page.nextCursor;
    if(!cursor)break;
   }
   setCards(cardsResponse.items);setClients(all);setError("");
  }catch(e){setError(errorText(e));}
  finally{setLoading(false);}
 },[permitted,request]);
 useEffect(()=>{void load()},[load]);
 useEffect(()=>{
  const done=()=>setPrintId(null);
  window.addEventListener("afterprint",done);
  return()=>window.removeEventListener("afterprint",done);
 },[]);
 const editing=useMemo(()=>cards.find(c=>c.id===editId),[cards,editId]);
 function selectCard(card:Card){
  setEditId(card.id);
  setForm({clientId:card.clientId,googleReviewUrl:card.googleReviewUrl,businessDetails:card.businessDetails,
   logoUrl:card.logoUrl||"",accentColor:card.accentColor,language:card.language,enabled:card.enabled});
  setNotice("");setError("");
 }
 function newCard(){setEditId(null);setForm(empty);setNotice("");setError("");}
 async function save(){
  if(!canEdit||!form.clientId)return;
  setBusy(true);setNotice("");setError("");
  try{
   const payload={googleReviewUrl:form.googleReviewUrl.trim(),businessDetails:form.businessDetails.trim(),
    logoUrl:form.logoUrl.trim(),accentColor:form.accentColor,language:form.language,enabled:form.enabled};
   if(editId)await request("/review-cards/"+editId,{method:"PUT",body:payload});
   else await request("/review-cards",{method:"POST",body:{...payload,clientId:form.clientId}});
   setNotice("Review card saved.");await load();newCard();setNotice("Review card saved.");
  }catch(e){setError(errorText(e));}
  finally{setBusy(false);}
 }
 async function toggle(card:Card){
  if(!canEdit)return;
  setBusy(true);setError("");
  try{await request("/review-cards/"+card.id,{method:"PUT",body:{enabled:!card.enabled}});
   if(editId===card.id)setForm(v=>({...v,enabled:!card.enabled}));
   await load();
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 }
 const origin=typeof window==="undefined"?"":window.location.origin;
 if(!session)return <Spinner label="Checking access…"/>;
 if(!permitted)return <div role="alert">Clients read permission is required to manage review cards.</div>;
 return <main className="aw-review-admin space-y-5 p-4 md:p-6">
  <PageHeader eyebrow="REPUTATION MANAGEMENT" title="AI Review Cards"
   description="Create a branded QR card per client. Customers receive a fresh review draft automatically and choose what to post."/>
  <style>{`@media print {
   body * {visibility:hidden!important}
   .aw-review-admin .review-print-card,.aw-review-admin .review-print-card *{visibility:visible!important}
   .aw-review-admin .review-print-card{position:fixed!important;left:0!important;top:0!important;width:100%!important;
    border:none!important;box-shadow:none!important;padding:25mm!important;background:white!important;color:#111!important}
   .aw-review-admin .review-print-card img{width:75mm!important;height:75mm!important;margin:auto!important}
   .aw-review-admin .review-print-card button{display:none!important}
  }`}</style>
  {error&&<p role="alert" className="rounded-lg border border-red-500/40 p-3 text-red-400">{error}</p>}
  {notice&&<p role="status" className="rounded-lg border border-green-500/40 p-3">{notice}</p>}
  <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(330px,1fr)]">
   <div className="rounded-xl border border-neutral-700/50 bg-neutral-900/30 p-5 space-y-4">
    <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">{editing?"Edit card":"Create client card"}</h2>
     <button type="button" onClick={newCard} className="aw-client-btn"><Plus size={16}/>New</button></div>
    {loading?<p>Loading business records…</p>:<label className="block space-y-1"><span>Client</span>
      <select className="field w-full" value={form.clientId} disabled={!!editId||!canEdit}
       onChange={e=>setForm(v=>({...v,clientId:e.target.value}))}>
       <option value="">Choose a client</option>
       {clients.filter(c=>!!editId||!cards.some(card=>card.clientId===c.id)).map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
      </select></label>}
    <label className="block space-y-1"><span>Official Google write-review URL</span>
     <input className="field w-full" type="url" placeholder="https://g.page/r/.../review" value={form.googleReviewUrl}
      disabled={!canEdit} onChange={e=>setForm(v=>({...v,googleReviewUrl:e.target.value}))}/></label>
    <p className="text-xs opacity-70">Use the “Ask for reviews” URL from Google Business Profile, not a generic website link.</p>
    <label className="block space-y-1"><span>Business facts for the draft (optional)</span>
     <textarea className="field w-full" rows={3} maxLength={1200} disabled={!canEdit}
      placeholder="Facts only, such as cuisine, services or available facilities."
      value={form.businessDetails} onChange={e=>setForm(v=>({...v,businessDetails:e.target.value}))}/></label>
    <label className="block space-y-1"><span>Business logo image URL (HTTPS, optional)</span>
     <input className="field w-full" type="url" disabled={!canEdit} value={form.logoUrl}
      onChange={e=>setForm(v=>({...v,logoUrl:e.target.value}))} placeholder="https://.../logo.png"/></label>
    <div className="grid gap-3 grid-cols-2">
     <label className="block space-y-1"><span>Draft language</span><select className="field w-full" value={form.language} disabled={!canEdit}
      onChange={e=>setForm(v=>({...v,language:e.target.value}))}>
      {["English","Hindi","Hinglish"].map(x=><option key={x}>{x}</option>)}
     </select></label>
     <label className="block space-y-1"><span>Accent color</span><input className="field w-full h-11" type="color" value={form.accentColor} disabled={!canEdit}
      onChange={e=>setForm(v=>({...v,accentColor:e.target.value}))}/></label>
    </div>
    <label className="flex gap-2 items-center"><input type="checkbox" checked={form.enabled} disabled={!canEdit}
     onChange={e=>setForm(v=>({...v,enabled:e.target.checked}))}/> Review card enabled</label>
    <button type="button" disabled={!canEdit||busy||!form.clientId||!form.googleReviewUrl.trim()}
     onClick={()=>void save()} className="aw-client-btn w-full justify-center"><Save size={16}/>{busy?"Saving…":editId?"Save changes":"Create review card"}</button>
   </div>
   <div className="rounded-xl border border-neutral-700/50 bg-neutral-900/30 p-5 space-y-4">
    <h2 className="text-lg font-semibold">Card performance</h2>
    <div className="grid grid-cols-3 gap-2">{[
     ["Scans",cards.reduce((n,c)=>n+c.metrics.scans,0)],
     ["Drafts",cards.reduce((n,c)=>n+c.metrics.generated,0)],
     ["Google clicks",cards.reduce((n,c)=>n+c.metrics.clicks,0)]
    ].map(([label,value])=><div key={label} className="rounded-lg border border-neutral-700/60 p-3 text-center">
     <strong className="block text-xl">{value}</strong><span className="text-xs opacity-70">{label}</span></div>)}</div>
    <p className="text-sm opacity-75">Scans, generated drafts and outbound clicks are recorded. Published Google reviews cannot be confirmed from a click.</p>
    <p className="text-sm">Cards: <strong>{cards.length}</strong> | Enabled: <strong>{cards.filter(c=>c.enabled).length}</strong></p>
    <button className="aw-client-btn" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>Refresh analytics</button>
    <p className="text-xs opacity-70">AI integration uses backend GROQ_API_KEY (preferred) or OPENAI_API_KEY. If it is not configured or the provider is unavailable, the page displays a clearly labeled editable starter draft.</p>
   </div>
  </section>
  <section className="space-y-3"><h2 className="text-xl font-bold">Client review cards</h2>
   {!loading&&cards.length===0&&<p>No cards yet. Select a client to create the first one.</p>}
   <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{cards.map(card=>{
    const link=origin+"/review/"+card.slug;
    return <article key={card.id} className={"rounded-xl border p-4 space-y-3 "+(printId===card.id?"review-print-card":"")}>
     <div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-lg">{card.businessName}</h3>
      <span className={"text-xs rounded-full px-2 py-1 "+(card.enabled?"bg-green-700/30":"bg-neutral-600/30")}>{card.enabled?"Active":"Paused"}</span></div>
     <div className="text-center rounded-lg bg-white text-black p-4 space-y-2">
      {card.logoUrl&&<img src={card.logoUrl} alt="Business logo" className="h-12 w-auto max-w-[180px] mx-auto object-contain"/>}
      <h4 className="font-bold text-lg">{card.businessName}</h4>
      <img src={qr(link,600)} alt={"QR code for "+card.businessName} className="w-44 h-44 mx-auto" width={176} height={176}/>
      <p className="font-semibold text-sm">SCAN TO REVIEW US ON GOOGLE</p>
      <p className="text-xs">Share your genuine experience</p>
      <div className="h-1 rounded" style={{backgroundColor:card.accentColor}}/>
     </div>
     <p className="text-xs break-all opacity-75">{link}</p>
     <div className="grid grid-cols-3 text-sm text-center"><span>{card.metrics.scans} scans</span><span>{card.metrics.generated} drafts</span><span>{card.metrics.clicks} clicks</span></div>
     <div className="flex flex-wrap gap-2">
      <button className="aw-client-btn" onClick={()=>selectCard(card)}>Edit</button>
      <button className="aw-client-btn" disabled={!canEdit||busy} onClick={()=>void toggle(card)}>{card.enabled?"Pause":"Enable"}</button>
      <button className="aw-client-btn" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(card.id);}}>{copied===card.id?<Check size={15}/>:<Copy size={15}/>}Copy</button>
      <a className="aw-client-btn" href={link} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>Preview</a>
      <a className="aw-client-btn" href={qr(link,1200)} target="_blank" rel="noopener noreferrer"><QrCode size={15}/>QR PNG</a>
      <button className="aw-client-btn" onClick={()=>{setPrintId(card.id);setTimeout(()=>window.print(),150)}}><Printer size={15}/>Print / PDF</button>
     </div>
    </article>
   })}</div>
  </section>
  <p className="flex gap-2 text-sm opacity-70"><ShieldCheck size={18}/>All generated text is editable. Customers verify their experience and submit reviews directly on Google. No fabricated reviews, incentives or automatic submission.</p>
 </main>;
}
