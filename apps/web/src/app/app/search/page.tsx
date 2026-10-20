"use client";
import {useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,EmptyState,Notice,PageHeader,Spinner} from "@/components/ui";
type Hit={id:string;kind:string;title:string;detail:string;href:string};
export default function SearchPage(){
 const {session,request}=useAuth();
 const can=!!session?.identity.permissions.includes("search.read");
 const [q,setQ]=useState(""),[submitted,setSubmitted]=useState(""),[results,setResults]=useState<Hit[]>([]);
 const [busy,setBusy]=useState(false),[error,setError]=useState("");
 const search=async(e?:FormEvent)=>{
  e?.preventDefault();if(q.trim().length<2)return;
  setBusy(true);setError("");setSubmitted(q.trim());
  try{const res=await request<{query:string;items:Hit[]}>("/search?q="+encodeURIComponent(q.trim()));setResults(res.items);}
  catch(e){setError(e instanceof ApiError?e.message:"Search unavailable");setResults([]);}finally{setBusy(false);}
 };
 useEffect(()=>{setResults([]);setSubmitted("");},[session?.identity.userId]);
 if(!session)return <Spinner label="Checking search access…"/>;
 if(!can)return <Notice kind="error">Personal search permission required.</Notice>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Private workspace index" title="My workspace search"
   description="Find your own or assigned leads, clients, projects, tasks, content, invoices, files, notes, finance entries and approvals. Results are scoped to the signed-in user."/>
  <Card title="Find one of your records">
   <form onSubmit={e=>void search(e)} className="flex flex-wrap gap-3">
    <label className="flex-1"><span className="sr-only">Search workspace</span>
     <input autoFocus className="field w-full" required minLength={2} maxLength={100} value={q}
      placeholder="Client, task, invoice number…" onChange={e=>setQ(e.target.value)}/></label>
    <button className="btn-primary" type="submit" disabled={busy}>{busy?"Searching…":"Search"}</button>
   </form>
  </Card>
  {error&&<Notice kind="error">{error}</Notice>}
  {submitted&&<Card title={"Results for "+submitted} description="The backend enforces user ownership, assignment and module permissions.">
   {!results.length?<EmptyState title="No matching records" description="Try another title or business name."/>:
    <div className="space-y-2">{results.map(x=><Link key={x.kind+x.id} href={x.href}
     className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 hover:border-indigo-300">
     <div><b className="text-sm">{x.title}</b><p className="text-xs text-slate-500">{x.detail}</p></div>
     <span className="text-xs text-indigo-700">Open {x.kind} module →</span>
    </Link>)}</div>}
  </Card>}
 </div>;
}
