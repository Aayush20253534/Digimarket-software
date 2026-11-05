"use client";
import {useState} from "react";
import {useAuth} from "@/components/auth-provider";
import {PageHeader,Spinner} from "@/components/ui";
type Client={id:string;businessName:string};
export default function ReviewCards(){
 const {session,request}=useAuth();
 const [clients,setClients]=useState<Client[]>([]);
 const [loaded,setLoaded]=useState(false);
 const [selected,setSelected]=useState("");
 const [googleUrl,setGoogleUrl]=useState("");
 const [error,setError]=useState("");
 const [copied,setCopied]=useState(false);
 const canRead=!!session?.identity.permissions.includes("clients.read");
 async function load(){try{const data=await request<{items:Client[]}>("/clients?limit=30");setClients(data.items);setLoaded(true);setError("");}catch(e){setError(e instanceof Error?e.message:"Unable to load clients");}}
 if(!session)return <Spinner label="Checking access"/>;
 if(!canRead)return <p>Clients access required.</p>;
 const name=clients.find(c=>c.id===selected)?.businessName||"";
 const valid=/^https:\/\/(www\.)?(google\.[a-z.]+|g\.page|maps\.app\.goo\.gl|goo\.gl)\//i.test(googleUrl);
 const link=typeof window!=="undefined"&&name&&valid?window.location.origin+"/review?"+new URLSearchParams({business:name,google:googleUrl}).toString():"";
 return <main className="space-y-5 p-4">
  <PageHeader eyebrow="REPUTATION" title="AI Review Cards" description="Create a QR review assistant for an existing DigiMarket client."/>
  <section className="rounded-xl border p-5 space-y-4 max-w-2xl">
   {!loaded?<button className="aw-client-btn" onClick={()=>void load()}>Load clients</button>:<label className="block space-y-2">Business<select className="field w-full" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Select client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></label>}
   <label className="block space-y-2">Official Google review link<input className="field w-full" type="url" placeholder="https://g.page/r/.../review" value={googleUrl} onChange={e=>setGoogleUrl(e.target.value)}/></label>
   {error&&<p role="alert">{error}</p>}
   {googleUrl&&!valid&&<p role="alert">Enter a valid Google review URL.</p>}
   {link&&<div className="space-y-3"><img alt="Review QR code" width={240} height={240} src={"https://api.qrserver.com/v1/create-qr-code/?size=320x320&data="+encodeURIComponent(link)}/><p className="break-all text-sm">{link}</p><button className="aw-client-btn" onClick={async()=>{await navigator.clipboard.writeText(link);setCopied(true);}}>{copied?"Copied":"Copy customer link"}</button><p className="text-sm">Print the QR image on a branded card. The customer sees a draft immediately on opening the link.</p></div>}
  </section>
  <p className="text-sm">Initial version: configuration is encoded in the link and is not saved to the database. QR scans and published Google reviews are not tracked.</p>
 </main>;
}