"use client";
import {Suspense,useEffect,useState} from "react";
import {useSearchParams} from "next/navigation";
function Review(){
 const params=useSearchParams();
 const business=(params.get("business")||"").slice(0,120);
 const google=params.get("google")||"";
 const valid=/^https:\/\/(www\.)?(google\.[a-z.]+|g\.page|maps\.app\.goo\.gl|goo\.gl)\//i.test(google);
 const [draft,setDraft]=useState("");
 const [feedback,setFeedback]=useState("");
 const [copied,setCopied]=useState(false);
 useEffect(()=>{
  const starts=["My experience at","I visited","I recently stopped by","I went to"];
  const start=starts[Math.floor(Math.random()*starts.length)];
  setDraft(start+" "+business+". ");
 },[business]);
 if(!business||!valid)return <main className="p-8">Invalid or incomplete review card.</main>;
 return <main className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-5"><section className="w-full max-w-lg space-y-5 rounded-2xl border border-neutral-700 bg-neutral-900 p-6">
  <p className="text-sm text-neutral-400">Google review assistant</p><h1 className="text-2xl font-bold">{business}</h1>
  <p className="text-neutral-300">Your review draft is ready. Add details about what actually happened before posting.</p>
  <label className="block space-y-2">Your experience (optional, helps make the draft accurate)<textarea className="w-full rounded-lg bg-neutral-800 p-3" rows={2} value={feedback} onChange={e=>setFeedback(e.target.value)} placeholder="What did you personally enjoy or experience?"/></label>
  <label className="block space-y-2">Editable review<textarea className="w-full rounded-lg bg-neutral-800 p-3" rows={5} value={draft+(feedback?" "+feedback:"")} onChange={e=>{setDraft(e.target.value);setFeedback("");}}/></label>
  <button className="w-full rounded-lg bg-white p-3 font-semibold text-black" onClick={async()=>{await navigator.clipboard.writeText(draft+(feedback?" "+feedback:""));setCopied(true);window.open(google,"_blank","noopener,noreferrer");}}>{copied?"Copied. Open Google to post":"Copy review & open Google"}</button>
  <p className="text-xs text-neutral-400">Only submit a review reflecting your genuine experience. No rating or review is posted automatically.</p>
 </section></main>;
}
export default function Page(){return <Suspense fallback={<p>Loading review…</p>}><Review/></Suspense>}
