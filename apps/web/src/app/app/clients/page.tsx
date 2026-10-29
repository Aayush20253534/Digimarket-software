"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowRight,BriefcaseBusiness,RefreshCw,Users} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {PageHeader,Spinner} from "@/components/ui";
type Status="ACTIVE"|"PAUSED"|"ARCHIVED";
type Client={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;status:Status;sourceLeadId:string|null;_count?:{services:number;contacts:number}};
type Register={items:Client[];nextCursor:string|null};
const readable=(e:unknown)=>e instanceof Error?e.message:"Unable to load clients";
export default function ClientsPage(){
 const router=useRouter();
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read");
 const [rows,setRows]=useState<Client[]>([]),[search,setSearch]=useState(""),[filter,setFilter]=useState(""),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null);
 const [history,setHistory]=useState<string[]>([]),[sortBy,setSortBy]=useState<"businessName"|"businessType"|"location"|"status">("businessName"),[descending,setDescending]=useState(false),[legacy,setLegacy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);
  try{
   const q=new URLSearchParams({limit:"30",sort:sortBy,direction:descending?"desc":"asc"});
   if(search.trim())q.set("q",search.trim());
   if(filter)q.set("status",filter);
   if(cursor)q.set("cursor",cursor);
   let response:Register;
   try{response=await request<Register>("/clients?"+q);setLegacy(false);}
   catch(e){
    if(!(e instanceof ApiError)||e.status!==422)throw e;
    q.delete("sort");q.delete("direction");response=await request<Register>("/clients?"+q);setLegacy(true);
   }
   setRows(response.items);setNext(response.nextCursor);setError("");
  }catch(e){setError(readable(e));}finally{setLoading(false);}
 },[canRead,request,search,filter,cursor,sortBy,descending]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  const focus=new URLSearchParams(window.location.search).get("focus");
  if(focus&&/^[0-9a-f-]{36}$/i.test(focus))router.replace("/app/clients/"+focus);
 },[router]);
 const sorted=useMemo(()=>legacy?[...rows].sort((a,b)=>{const n=String(a[sortBy]??"").localeCompare(String(b[sortBy]??""),undefined,{numeric:true,sensitivity:"base"});return descending?-n:n;}):rows,[rows,legacy,sortBy,descending]);
 if(!session)return <Spinner label="Checking client access…"/>;
 if(!canRead)return <div className="aw-client-directory"><h1>Clients access denied</h1><p>Your account cannot view client records.</p></div>;
 return <div data-aw-module="clients" className="aw-client-directory aw-module-root space-y-5">
  <PageHeader eyebrow="CLIENT RELATIONSHIPS" title="Clients & delivery"
    description="Manage each client's agreement, services, projects and delivery from one place."
    actions={<div className="flex gap-2 flex-wrap"><Link href="/app/leads" className="aw-client-btn">View leads</Link><button className="aw-client-btn" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>}/>
  <div className="aw-client-statrow">
   <div className="aw-client-stat"><Users size={18}/><span>Clients on this page</span><strong>{loading?"…":rows.length}</strong></div>
   <div className="aw-client-stat"><BriefcaseBusiness size={18}/><span>Active on this page</span><strong>{loading?"…":rows.filter(c=>c.status==="ACTIVE").length}</strong></div>
   <div className="aw-client-stat"><ArrowRight size={18}/><span>Client onboarding</span><strong>Lead approval</strong></div>
  </div>
  {error&&<div role="alert" className="aw-client-alert">{error}</div>}
  <section className="aw-client-panel">
   <div className="aw-client-panel-heading"><div><h2>Client directory</h2><p>Select a client to open their dedicated workspace. Records originate from approved leads.</p></div></div>
   <div className="aw-client-controls">
    <input aria-label="Search clients" className="field" placeholder="Search business, location, phone or email" value={search} onChange={e=>{setSearch(e.target.value);setCursor(null);setHistory([]);}}/>
    <select aria-label="Filter clients" className="field" value={filter} onChange={e=>{setFilter(e.target.value);setCursor(null);setHistory([]);}}>
     <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option>
    </select>
    <select className="field" aria-label="Sort clients on this page" value={sortBy} onChange={e=>{setSortBy(e.target.value as typeof sortBy);setCursor(null);setHistory([]);}}>
     <option value="businessName">Business</option><option value="businessType">Category</option><option value="location">Location</option><option value="status">Status</option>
    </select>
    <button className="aw-client-btn" aria-label="Reverse client sort" onClick={()=>{setDescending(v=>!v);setCursor(null);setHistory([]);}}>{descending?"Descending ↓":"Ascending ↑"}</button>
   </div>
   {loading?<p role="status" className="aw-client-muted">Loading clients…</p>:!rows.length?<p className="aw-client-empty">No clients match these filters. A lead becomes a client when its stage is Approved.</p>:null}
   <div className="aw-client-table-wrap">
    <table className="aw-client-table" aria-label="Clients directory">
     <thead><tr><th>Business</th><th>Category</th><th>Phone</th><th>Location</th><th>Services</th><th>Status</th><th>Workspace</th></tr></thead>
     <tbody>{sorted.map(c=><tr key={c.id}>
       <td><strong>{c.businessName}</strong>{c.sourceLeadId&&<small>Converted from lead</small>}</td>
       <td>{c.businessType||"Not set"}</td><td>{c.phone||"—"}</td><td>{c.location||"—"}</td><td>{c._count?.services??0}</td>
       <td><span className={"aw-client-status aw-client-status-"+c.status.toLowerCase()}>{c.status}</span></td>
       <td><Link className="aw-client-open" href={"/app/clients/"+c.id}>Open workspace <ArrowRight size={15}/></Link></td>
      </tr>)}</tbody>
    </table>
   </div>
   <div className="aw-client-pagination">
    <button className="aw-client-btn" disabled={!history.length||loading} onClick={()=>{setCursor(history[history.length-1]||null);setHistory(h=>h.slice(0,-1));}}>Previous</button>
    <span>Page {history.length+1}</span>
    <button className="aw-client-btn" disabled={!next||loading} onClick={()=>{setHistory(h=>[...h,cursor||""]);setCursor(next);}}>Next page</button>
   </div>
  </section>
 </div>;
}