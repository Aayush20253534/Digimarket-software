"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {ArrowLeft,RefreshCw,Search} from "lucide-react";
import {SalesWorkspaceNav} from "@/components/sales-workspace-nav";
import {ClientPostReadiness} from "@/components/client-post-readiness";
import {useAuth} from "@/components/auth-provider";
import {PageHeader,Spinner} from "@/components/ui";

type Client={id:string;businessName:string;status:"ACTIVE"|"PAUSED"|"ARCHIVED"};
type Page={items:Client[];nextCursor:string|null};
export default function PostReadinessPage(){
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const [clients,setClients]=useState<Client[]>([]),[clientId,setClientId]=useState("");
 const [search,setSearch]=useState(""),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);setError("");
  try{
   const list:Client[]=[];
   let cursor:string|null=null;
   for(let n=0;n<50;n++){
    const q=new URLSearchParams({limit:"100",sort:"businessName",direction:"asc"});
    if(cursor)q.set("cursor",cursor);
    const result=await request<Page>("/clients?"+q.toString());
    list.push(...result.items);
    if(!result.nextCursor){cursor=null;break;}
    cursor=result.nextCursor;
   }
   setClients(list);
   setClientId(existing=>{
    const requested=new URLSearchParams(window.location.search).get("clientId")??"";
    return [existing,requested].find(id=>list.some(x=>x.id===id))??list.find(x=>x.status==="ACTIVE")?.id??list[0]?.id??"";
   });
  }catch(e){setError(e instanceof Error?e.message:"Cannot load clients");}
  finally{setLoading(false);}
 },[canRead,request]);
 useEffect(()=>{void load();},[load]);
 const visible=useMemo(()=>clients.filter(x=>x.businessName.toLowerCase().includes(search.trim().toLowerCase())),[clients,search]);
 const selected=clients.find(x=>x.id===clientId);
 if(!session)return <Spinner label="Checking client access…"/>;
 if(!canRead)return <p role="alert">Client access denied.</p>;
 return <div className="aw-client-workspace space-y-5" data-aw-module="clients-post-readiness">
  <SalesWorkspaceNav/>
  <PageHeader eyebrow="CLIENT CONTENT PIPELINE" title="Weekly post readiness"
   description="Choose a client and month to track regular and festival post readiness in separate weekly inventories."
   actions={<div className="flex gap-2 flex-wrap">
    <Link className="aw-client-btn" href="/app/clients"><ArrowLeft size={16}/>Clients</Link>
    <button type="button" className="aw-client-btn" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>Refresh clients</button>
   </div>}/>
  {error&&<p role="alert" className="aw-client-alert">{error}</p>}
  <section className="aw-client-panel">
   <div className="aw-client-panel-heading"><div><h2>Select client</h2>
    <p>Weekly counts are separate for every client's monthly ledger.</p></div></div>
   {loading?<Spinner label="Loading client directory…"/>:<div className="grid gap-3 sm:grid-cols-2">
    <label className="space-y-1 text-sm"><span className="block">Find business</span>
     <div className="flex items-center gap-2"><Search size={17}/><input className="field w-full" type="search"
      placeholder="Search client name" value={search} onChange={e=>setSearch(e.target.value)}/></div></label>
    <label className="space-y-1 text-sm"><span className="block">Client</span>
     <select className="field w-full" value={clientId} onChange={e=>setClientId(e.target.value)}>
      {!clients.length&&<option value="">No clients</option>}
      {selected&&!visible.some(x=>x.id===selected.id)&&<option value={selected.id}>{selected.businessName} (selected)</option>}
      {visible.map(c=><option key={c.id} value={c.id}>{c.businessName} · {c.status}</option>)}
     </select></label>
   </div>}
   {!loading&&!clients.length&&<p className="aw-client-muted">No clients recorded. Approved leads become clients automatically.</p>}
  </section>
  {selected&&<ClientPostReadiness key={selected.id} clientId={selected.id}/>}
 </div>;
}
