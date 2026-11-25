"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {ArrowUpRight,RefreshCw,Search,Video,Newspaper,PhoneCall,MapPin} from "lucide-react";
import {SalesWorkspaceNav} from "@/components/sales-workspace-nav";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {agencyToday,cycleLabel,clientHealthSchema} from "@digimarket/contracts";
import {PageHeader,Spinner} from "@/components/ui";
type Status="ACTIVE"|"PAUSED"|"ARCHIVED"|"EXPIRED";
type Client={id:string;businessName:string;businessType:string|null;phone:string|null;email:string|null;location:string|null;status:Status;sourceLeadId:string|null;agreementExpired?:boolean;contractEndOn?:string|null;agreementEndedOn?:string|null;agreementEndReason?:string|null;_count?:{contacts:number};monthlyFee?:string|null;monthlyAdBudget?:string|null;health?:Health;manager?:{displayName:string}|null;sourceLead?:{googleMapsUrl:string|null}|null;readiness?:Stock};
type Health=typeof clientHealthSchema.options[number];
type Stock={videos:number;posts:number;festival:number;videosDelivered:number;postsDelivered:number;festivalDelivered:number};
type Summary={all:number;active:number;paused:number;archived:number;past:number;expiring:number;monthlyFees:string|null};
type Register={items:Client[];nextCursor:string|null;total?:number;today?:string;cycle?:{key:string};summary?:Summary;managers?:{id:string;displayName:string}[]};
const money=(v:string|null|undefined)=>v==null?"—":"₹"+Number(v).toLocaleString("en-IN",{maximumFractionDigits:2});
const healthLabel=(h:string)=>h.replaceAll("_"," ").toLowerCase().replace(/^./,v=>v.toUpperCase());
const readable=(e:unknown)=>e instanceof Error?e.message:"Unable to load clients";
export function ClientDirectory({section}:{section:"current"|"expired"}){
 const router=useRouter();
 const loadVersion=useRef(0);
 const {session,request}=useAuth();
 const canRead=!!session?.identity.permissions.includes("clients.read"),canFinance=!!session?.identity.permissions.includes("finance.read.all");
 const [scope,setScope]=useState<"current"|"expired"|"all">(section),[expiring,setExpiring]=useState(false),[health,setHealth]=useState(""),[manager,setManager]=useState(""),[summary,setSummary]=useState<Summary|null>(null),[total,setTotal]=useState<number|null>(null),[today,setToday]=useState(agencyToday),[cycle,setCycle]=useState(""),[managers,setManagers]=useState<{id:string;displayName:string}[]>([]),[view,setView]=useState<"register"|"readiness">("register");
 const [rows,setRows]=useState<Client[]>([]),[search,setSearch]=useState(""),[filter,setFilter]=useState(""),[cursor,setCursor]=useState<string|null>(null),[next,setNext]=useState<string|null>(null);
 const [history,setHistory]=useState<string[]>([]),[sortBy,setSortBy]=useState<"businessName"|"businessType"|"location"|"status"|"contractEndOn">("businessName"),[descending,setDescending]=useState(false),[legacy,setLegacy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState("");
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  const version=++loadVersion.current;
  setLoading(true);setRows([]);setNext(null);
  try{
   const q=new URLSearchParams({limit:"30",section:scope,sort:sortBy,direction:descending?"desc":"asc",workspace:"1"});
   if(search.trim())q.set("q",search.trim());
   if(filter)q.set("status",filter);
   if(expiring)q.set("expiring","1");if(health)q.set("health",health);if(manager)q.set("managerId",manager);
   if(cursor)q.set("cursor",cursor);
   let response:Register;
   try{response=await request<Register>("/clients?"+q);setLegacy(false);}
   catch(e){
    if(!(e instanceof ApiError)||e.status!==422||expiring||health||manager||sortBy==="contractEndOn")throw e;
    q.delete("workspace");q.delete("sort");q.delete("direction");response=await request<Register>("/clients?"+q);setLegacy(true);
   }
   if(version===loadVersion.current){setRows(response.items);setNext(response.nextCursor);setError("");setSummary(response.summary??null);setTotal(response.total??null);setToday(response.today??agencyToday());setCycle(response.cycle?.key??"");setManagers(response.managers??[]);}
  }catch(e){if(version===loadVersion.current){setError(readable(e));setSummary(null);setTotal(null);}}finally{if(version===loadVersion.current)setLoading(false);}
 },[canRead,request,search,filter,cursor,sortBy,descending,scope,expiring,health,manager]);
 useEffect(()=>{void load();return()=>{loadVersion.current++;};},[load]);
 useEffect(()=>{setCursor(null);setHistory([]);setFilter("");setScope(section);setExpiring(false);},[section]);
 const choose=(key:string)=>{setCursor(null);setHistory([]);setFilter("");setExpiring(false);if(key==="past"){setScope("expired");router.push("/app/clients/expired");return;}setScope(key==="all"?"all":"current");if(key==="expiring")setExpiring(true);else if(["ACTIVE","PAUSED","ARCHIVED"].includes(key))setFilter(key);};
 useEffect(()=>{
  const focus=new URLSearchParams(window.location.search).get("focus");
  if(focus&&/^[0-9a-f-]{36}$/i.test(focus))router.replace("/app/clients/"+focus);
 },[router]);
 const sorted=useMemo(()=>legacy?[...rows].sort((a,b)=>{const n=String(a[sortBy]??"").localeCompare(String(b[sortBy]??""),undefined,{numeric:true,sensitivity:"base"});return descending?-n:n;}):rows,[rows,legacy,sortBy,descending]);
 if(!session)return <Spinner label="Checking client access…"/>;
 if(!canRead)return <div className="aw-client-directory"><h1>Clients access denied</h1><p>Your account cannot view client records.</p></div>;
 return <div data-aw-module="clients" className="aw-client-directory aw-client-directory-v2 aw-module-root space-y-5">
  <SalesWorkspaceNav/>
  <PageHeader eyebrow="CLIENT RELATIONSHIPS" title={section==="expired"?"Past Clients":"Clients"}
    description={section==="expired"?"Ended and expired client agreements. Their records remain available and are excluded from projected income.":"All acquisition cycles · Manage agreements, retention and service delivery."}
    actions={<div className="flex gap-2 flex-wrap"><Link href="/app/leads" className="aw-client-btn">View leads</Link>
    <Link href="/app/clients/video-readiness" className="aw-client-btn"><Video size={16}/>Video readiness</Link>
    <Link href="/app/clients/post-readiness" className="aw-client-btn"><Newspaper size={16}/>Post readiness</Link>
    {!session.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&session.identity.permissions.includes("assets.read")&&
     <Link href="/app/clients/assets" className="aw-client-btn">Files & Assets</Link>}
    <button className="aw-client-btn" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button></div>}/>
  <nav className="flex flex-wrap gap-3" aria-label="Client sections">
   <Link className={scope==="current"?"aw-client-primary":"aw-client-btn"} href="/app/clients" aria-current={scope==="current"?"page":undefined} onClick={()=>{setScope("current");setFilter("");setExpiring(false);setCursor(null);setHistory([]);}}>Clients</Link>
   <Link className={scope==="expired"?"aw-client-primary":"aw-client-btn"} href="/app/clients/expired" aria-current={scope==="expired"?"page":undefined}>Past Clients</Link>
   <button type="button" className={scope==="all"?"aw-client-primary":"aw-client-btn"} onClick={()=>choose("all")}>All clients</button>
  </nav>
  <section className="aw-client-metrics" aria-label="Client status across all cycles">{([["all","Total clients",summary?.all],["ACTIVE","Active",summary?.active],["expiring","Expiring soon",summary?.expiring],["PAUSED","Paused",summary?.paused],["past","Past clients",summary?.past],["ARCHIVED","Archived",summary?.archived]] as const).map(([key,label,n])=><button type="button" className="aw-client-stat aw-client-metric" key={key} data-metric={key} aria-pressed={key==="all"?scope==="all":key==="past"?scope==="expired":key==="expiring"?expiring:filter===key} disabled={key==="expiring"&&!summary} onClick={()=>choose(key)}><span>{label}</span><strong>{loading?"…":n??"—"}</strong></button>)}{canFinance&&<div className="aw-client-stat"><span>Active monthly service fees</span><strong>{loading?"…":money(summary?.monthlyFees)}</strong><small>Projection, not cash received</small></div>}</section>
  {!loading&&!summary&&!error&&<p className="aw-client-muted">Global metrics and stock summaries require the updated API.</p>}
    {error&&<div role="alert" className="aw-client-alert">{error}</div>}
  <section className="aw-client-panel">
   <div className="aw-client-panel-heading"><div><h2>{view==="readiness"?"Content readiness":scope==="expired"?"Past client directory":"Client directory"}</h2><p>{cycle?"Readiness · "+cycleLabel(cycle):"Select a client to open their dedicated workspace."}</p></div><div role="group" aria-label="Client directory view" className="flex flex-wrap gap-2"><button type="button" className="aw-client-btn" aria-pressed={view==="register"} onClick={()=>setView("register")}>Register</button><button type="button" className="aw-client-btn" aria-pressed={view==="readiness"} onClick={()=>setView("readiness")}>Readiness</button></div></div>
   <div className="aw-client-controls">
    <label className="aw-v3-directory-search"><Search size={17} aria-hidden="true"/><input aria-label="Search clients" className="field" placeholder="Search business, location, phone or email" value={search} onChange={e=>{setSearch(e.target.value);setCursor(null);setHistory([]);}}/></label>
    {scope!=="expired"&&<select aria-label="Filter clients" className="field" value={filter} onChange={e=>{setFilter(e.target.value);setExpiring(false);setCursor(null);setHistory([]);}}>
     <option value="">All statuses</option><option value="ACTIVE">Active</option><option value="PAUSED">Paused</option><option value="ARCHIVED">Archived</option>
    </select>}
    <select className="field" aria-label="Client health filter" disabled={!summary} value={health} onChange={e=>{setHealth(e.target.value);setCursor(null);setHistory([]);}}><option value="">All health ratings</option>{clientHealthSchema.options.map(h=><option key={h} value={h}>{healthLabel(h)}</option>)}</select>
    <select className="field" aria-label="Account manager filter" disabled={!summary} value={manager} onChange={e=>{setManager(e.target.value);setCursor(null);setHistory([]);}}><option value="">All managers</option>{managers.map(m=><option key={m.id} value={m.id}>{m.displayName}</option>)}</select>
    <select className="field" aria-label="Sort clients" value={sortBy} onChange={e=>{setSortBy(e.target.value as typeof sortBy);setCursor(null);setHistory([]);}}>
     <option value="businessName">Business</option><option value="businessType">Category</option><option value="location">Location</option><option value="status">Status</option><option value="contractEndOn" disabled={!summary}>Agreement end</option>
    </select>
    <button className="aw-client-btn" aria-label="Reverse client sort" onClick={()=>{setDescending(v=>!v);setCursor(null);setHistory([]);}}>{descending?"Descending ↓":"Ascending ↑"}</button>
    <button type="button" className="aw-client-btn" onClick={()=>{setScope(section);setFilter("");setExpiring(false);setHealth("");setManager("");setSearch("");setCursor(null);setHistory([]);}}>Clear filters</button>
   </div>
   {loading?<p role="status" className="aw-client-muted">Loading clients…</p>:!rows.length?<p className="aw-client-empty">{section==="expired"?"No past clients match these filters.":"No clients match these filters. A lead becomes a client when its stage is Approved."}</p>:null}
   <div className="aw-client-table-wrap">
    <table className="aw-client-table" aria-label={view==="register"?"Clients directory":"Client content readiness"} aria-busy={loading}><thead><tr>{(view==="register"?["Call","Business","Status","Agreement ends",...(canFinance?["Monthly fee","Ad budget"]:[]),"Ready stock","Map","Workspace"]:["Business","Videos ready","Regular posts ready","Festival posts ready","Videos delivered","Posts delivered","Festival delivered"]).map(h=><th key={h} scope="col">{h}</th>)}</tr></thead>
     <tbody>{sorted.map(c=>{const ended=c.agreementExpired||c.status==="EXPIRED",date=(c.agreementEndedOn??c.contractEndOn)?.slice(0,10),days=date?Math.round((Date.parse(date)-Date.parse(today))/86400000):null,stock=c.readiness,map=c.sourceLead?.googleMapsUrl;
     const identity=<div className="aw-v3-client-identity"><span className="aw-v3-client-avatar" aria-hidden="true">{c.businessName.slice(0,2).toUpperCase()}</span><span><strong>{c.businessName}</strong><small>{c.businessType||"Category not set"} · {c.manager?.displayName??"Unassigned"}</small><small data-health={c.health??"UNASSESSED"}>{healthLabel(c.health??"UNASSESSED")}</small></span></div>;
     return view==="register"?<tr key={c.id}><td>{c.phone?<a className="aw-followup-icon" href={"tel:"+(c.phone.trim().startsWith("+")?"+":"")+c.phone.replace(/\D/g,"")} title={c.phone} aria-label={"Call "+c.phone}><PhoneCall size={16}/></a>:"—"}</td><td>{identity}</td><td><span className={"aw-client-status aw-client-status-"+(ended?"ended":c.status.toLowerCase())}>{ended?"EXPIRED":c.status}</span></td>
     <td>{date??"Open / not set"}{date&&<small className="aw-client-expiry" data-urgency={ended?"ended":days!==null&&days<=7?"urgent":days!==null&&days<=30?"soon":"normal"}>{ended?"Ended":days===0?"Ends today":days+" days left"}</small>}{ended&&c.agreementEndReason&&<small className="block">{c.agreementEndReason}</small>}</td>
     {canFinance&&<><td>{money(c.monthlyFee)}</td><td>{money(c.monthlyAdBudget)}</td></>}
     <td><div className="aw-client-stock"><Link href={"/app/clients/video-readiness?clientId="+encodeURIComponent(c.id)} aria-label={"Video readiness for "+c.businessName} title="Videos ready"><Video size={16}/><span data-stock={stock?.videos===0?"zero":undefined}>{stock?.videos??"—"}</span></Link><Link href={"/app/clients/post-readiness?clientId="+encodeURIComponent(c.id)} aria-label={"Post readiness for "+c.businessName} title="Regular / festival posts ready"><Newspaper size={16}/><span data-stock={stock?.posts===0?"zero":undefined}>{stock?.posts??"—"}</span><span>/ {stock?.festival??"—"}</span></Link></div></td>
     <td>{map?<a className="aw-followup-icon" href={map} target="_blank" rel="noopener noreferrer" aria-label={"Open map for "+c.businessName} title={c.location??"Map"}><MapPin size={16}/></a>:<span title={c.location??"No map recorded"}>—</span>}</td><td><Link className="aw-followup-icon" href={"/app/clients/"+c.id} aria-label="Open workspace" title={"Open "+c.businessName}><ArrowUpRight size={17}/></Link></td></tr>:<tr key={c.id}><td><Link href={"/app/clients/"+c.id}>{identity}</Link></td>{[stock?.videos,stock?.posts,stock?.festival,stock?.videosDelivered,stock?.postsDelivered,stock?.festivalDelivered].map((n,i)=><td key={i} data-stock={i<3&&n===0?"zero":undefined}>{n??"—"}</td>)}</tr>;})}</tbody></table>
   </div>
   <div className="aw-client-pagination">
    <button className="aw-client-btn" disabled={!history.length||loading} onClick={()=>{setCursor(history[history.length-1]||null);setHistory(h=>h.slice(0,-1));}}>Previous</button>
    <span>Page {history.length+1} · {total??rows.length} {total===null?"on this page":"matching clients"}</span>
    <button className="aw-client-btn" disabled={!next||loading} onClick={()=>{setHistory(h=>[...h,cursor||""]);setCursor(next);}}>Next page</button>
   </div>
  </section>
 </div>;
}
