"use client";
import {useEffect,useState} from "react";
import {useParams} from "next/navigation";
import {ArrowUpRight,Check,Copy,MapPin,MessageSquareText,ShieldCheck,Star} from "lucide-react";
import {apiRequest} from "@/lib/api";
type Business={slug:string;businessName:string;businessDetails:string;logoUrl:string|null;accentColor:string;language:string;googleReviewUrl:string};
type Draft={text:string;source:"ai"|"template"};
function readable(e:unknown){return e instanceof Error?e.message:"Unable to load review card";}
export default function PublicReviewPage(){
 const {slug}=useParams<{slug:string}>();
 const [business,setBusiness]=useState<Business|null>(null);
 const [draft,setDraft]=useState("");
 const [source,setSource]=useState<Draft["source"]>("template");
 const [busy,setBusy]=useState(true);
 const [error,setError]=useState("");
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  if(!slug)return;
  let mounted=true;
  (async()=>{
   try{
    const card=await apiRequest<Business>("/review-cards/public/"+encodeURIComponent(slug));
    if(!mounted)return;
    setBusiness(card);
    // Automatic generation on scan. No generate or write-your-own option.
    const generated=await apiRequest<Draft>("/review-cards/public/"+encodeURIComponent(slug)+"/draft",{method:"POST",body:{}});
    if(mounted){setDraft(generated.text);setSource(generated.source);}
   }catch(e){if(mounted)setError(readable(e));}
   finally{if(mounted)setBusy(false);}
  })();
  return()=>{mounted=false};
 },[slug]);
 async function goToGoogle(){
  if(!business||!draft.trim())return;
  if(/\[[^\]]+\]/.test(draft)){
   setError("Please replace the bracketed example with your own genuine experience before posting.");
   return;
  }
  setError("");
  try{
   await navigator.clipboard.writeText(draft.trim());setCopied(true);
  }catch{
   setError("Clipboard access was denied. Select and copy the text manually, then open Google using the link below.");
   return;
  }
  try{await apiRequest("/review-cards/public/"+business.slug+"/click",{method:"POST",body:{}});}catch{/* The Google link must remain usable even if analytics fail. */}
  window.location.assign(business.googleReviewUrl);
 }
 return <main className="min-h-screen bg-[#0d0d10] text-white flex justify-center items-center p-4 py-12">
  <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-[#18181d] shadow-2xl">
   <header className="p-7 text-center space-y-3" style={{borderTop:"5px solid "+(business?.accentColor||"#A855F7")}}>
    {business?.logoUrl?<img src={business.logoUrl} alt="" className="mx-auto h-16 max-w-52 object-contain"/>:
     <div className="mx-auto w-14 h-14 flex justify-center items-center rounded-full bg-white/10"><MapPin size={27}/></div>}
    <p className="text-xs tracking-[0.2em] uppercase text-white/50">Google Reviews</p>
    <h1 className="text-2xl font-bold tracking-tight">{business?.businessName||"Share your experience"}</h1>
    <p className="text-sm text-white/60">Your words matter. Review your draft before posting it.</p>
   </header>
   <div className="px-6 pb-7 space-y-5">
    <div className="flex items-center justify-center gap-1 text-yellow-400" aria-label="Google rating selected by you on Google">
     {Array.from({length:5},(_,i)=><Star key={i} size={20} strokeWidth={1.5}/>)}
    </div>
    {busy?<div role="status" className="min-h-36 flex flex-col items-center justify-center gap-3 text-white/70">
      <div className="h-7 w-7 border-2 border-white/20 border-t-white rounded-full animate-spin"/>
      <span>Preparing your unique review draft…</span>
     </div>:error&&!draft?<p role="alert" className="rounded-xl bg-red-950/30 border border-red-500/30 p-4 text-sm">{error}</p>:
     <div className="space-y-3">
      <div className="flex items-center justify-between gap-3"><label htmlFor="review-copy" className="font-semibold flex gap-2 items-center"><MessageSquareText size={19}/>Your review draft</label>
       <span className="text-xs rounded-full px-2 py-1 bg-white/10">{source==="ai"?"AI-assisted":"Starter draft"}</span></div>
      <textarea id="review-copy" value={draft} onChange={e=>{setDraft(e.target.value);setCopied(false);setError("");}}
       className="w-full min-h-48 rounded-xl border border-white/15 bg-white/5 p-4 text-base leading-relaxed focus:border-white/60 focus:outline-none"
       maxLength={1500} aria-describedby="review-note"/>
      <p id="review-note" className="text-xs leading-relaxed text-white/55">Replace any bracketed text with what you actually experienced. Edit freely. The wording is different for each scan, but only you can confirm what happened.</p>
      {error&&<p role="alert" className="text-sm text-amber-300">{error}</p>}
      <button type="button" onClick={()=>void goToGoogle()} disabled={!draft.trim()}
       className="w-full rounded-xl bg-white text-black font-semibold flex justify-center items-center gap-2 py-3 disabled:opacity-40">
       {copied?<Check size={18}/>:<Copy size={18}/>} Copy review & open Google <ArrowUpRight size={18}/>
      </button>
      {business&&<a href={business.googleReviewUrl} target="_blank" rel="noopener noreferrer" className="block text-center underline text-sm text-white/65">
       Open Google review page without copying
      </a>}
     </div>}
    <p className="text-xs leading-relaxed flex gap-2 text-white/40"><ShieldCheck size={17} className="shrink-0"/>No review is submitted automatically. You choose your rating and submit on Google. Never post something that did not happen.</p>
   </div>
  </section>
 </main>;
}
