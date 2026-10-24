"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {ArrowDownToLine,ArrowLeft,ArrowRight,CalendarRange,ChartNoAxesCombined,Clock3,Filter,RefreshCcw,Search,ShieldCheck,TrendingUp,Users} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {Notice,PageHeader,Spinner} from "@/components/ui";

type Count={name:string;count:number};
type LeadRow={id:string;businessName:string;contactName:string|null;phone:string|null;
 source:string;status:string;businessType:string|null;location:string|null;assignedToId:string|null;
 assignee:string;createdAt:string;updatedAt:string;nextFollowUpAt:string|null;
 approved:boolean;converted:boolean;ageDays:number};
type Source={name:string;total:number;approved:number;converted:number;approvalRate:number;conversionRate:number};
type Team={id:string|null;name:string;total:number;approved:number;converted:number;meetings:number;conversionRate:number};
type ResponseData={
 from:string;to:string;asOf:string;
 summary:{total:number;approved:number;converted:number;approvalRate:number;conversionRate:number;
 meta:number;cold:number;meetings:number;decisionPending:number;agreementPending:number;
 rejected:number;overdue:number;averageApprovalDays:number|null;approvalTimingSample:number};
 trends:{daily:Count[];weekly:Count[];monthly:Count[]};
 sources:Source[];stages:Count[];funnel:Count[];team:Team[];categories:Count[];locations:Count[];
 followUps:Count[];assignees:{id:string;name:string}[];
 totalPages:number;page:number;limit:number;hasMore:boolean;items:LeadRow[];
 definitions:Record<string,string>;
};
type Options={assignees:{id:string;name:string}[];categories:string[];locations:string[]};
const ymd=(date:Date)=>date.toISOString().slice(0,10);
const today=()=>ymd(new Date());
const startMonth=()=>today().slice(0,7)+"-01";
const count=(n:number)=>n.toLocaleString("en-IN");
const label=(v:string)=>v==="META_LEADS"?"Meta Leads":v==="COLD_CALL"?"Cold Call":
 v==="OTHER"?"Other":v.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
const date=(value:string|null)=>value?new Date(value).toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"}):"Not set";
const pct=(n:number)=>n.toLocaleString("en-IN",{maximumFractionDigits:2})+"%";
const getError=(e:unknown)=>e instanceof Error?e.message:"Lead analytics unavailable";
const hues=["#c979ff","#ee75c8","#68d7e8","#f0ba77","#99e6b4","#8489ff","#e39b8b","#aeb7c9","#9d72ce","#65b19d"];

function Bars({items,maxRows=12}: {items:Count[];maxRows?:number}){
 const rows=items.slice(0,maxRows),maximum=Math.max(1,...rows.map(x=>x.count));
 if(!items.length||!items.some(x=>x.count))return <p className="aw-lead-empty">No matching leads in this period.</p>;
 return <div className="aw-lead-bars">{rows.map((item,i)=><div className="aw-lead-bar" key={item.name}>
  <div className="aw-lead-bar-label"><span title={label(item.name)}>{label(item.name)}</span><strong>{count(item.count)}</strong></div>
  <div className="aw-lead-track" role="img" aria-label={label(item.name)+": "+count(item.count)}>
   <div style={{width:Math.max(1,item.count/maximum*100)+"%",background:hues[i%hues.length]}}/>
  </div>
 </div>)}{items.length>maxRows&&<p className="aw-lead-muted">Showing the top {maxRows} of {items.length} groups.</p>}</div>;
}
function Trend({rows}: {rows:Count[]}){
 if(!rows.length)return <p className="aw-lead-empty">No leads created in this period.</p>;
 const width=Math.max(630,rows.length*26),height=220,padX=30,padY=22;
 const maximum=Math.max(1,...rows.map(x=>x.count));
 const coord=(i:number,v:number)=>({x:padX+(rows.length===1?0:i/(rows.length-1))*(width-padX*2),
  y:height-padY-(v/maximum)*(height-padY*2)});
 const points=rows.map((r,i)=>coord(i,r.count));
 return <div className="aw-lead-trend-scroll">
  <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img"
   aria-label={"New leads over time, from "+rows[0].name+" to "+rows[rows.length-1].name}>
   {[0,.25,.5,.75,1].map(t=><g key={t}>
    <line x1={padX} y1={height-padY-t*(height-2*padY)} x2={width-padX} y2={height-padY-t*(height-2*padY)} stroke="#614771" strokeDasharray="3 5"/>
    <text x={4} y={height-padY-t*(height-2*padY)+4} fill="#d1b9de" fontSize={10}>{Math.round(maximum*t)}</text>
   </g>)}
   {points.length>1&&<polyline points={points.map(p=>p.x+","+p.y).join(" ")} fill="none" stroke="#d884ff" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round"/>}
   {points.map((p,i)=><circle key={i} cx={p.x} cy={p.y} r={4} fill="#f5d7ff" stroke="#8733b9" strokeWidth={2}>
    <title>{rows[i].name+": "+count(rows[i].count)+" leads"}</title>
   </circle>)}
  </svg>
  <div className="aw-lead-axis"><span>{rows[0].name}</span><span>{rows.length>1?rows[Math.floor((rows.length-1)/2)].name:""}</span><span>{rows.length>1?rows[rows.length-1].name:""}</span></div>
 </div>;
}
function Donut({items}: {items:Count[]}){
 const total=items.reduce((sum,x)=>sum+x.count,0);
 let running=0;
 const gradient=items.map((x,i)=>{const from=running;running+=total?x.count/total*100:0;
  return `${hues[i%hues.length]} ${from}% ${running}%`;}).join(",");
 return <div className="aw-lead-donut-layout">
  <div className="aw-lead-donut" style={{background:total?`conic-gradient(${gradient})`:"#43324f"}}
   role="img" aria-label={items.map(x=>label(x.name)+" "+x.count).join(", ")}>
   <span><strong>{count(total)}</strong><small>leads</small></span>
  </div>
  <div className="aw-lead-legend">{items.map((item,i)=><div key={item.name}>
   <span style={{background:hues[i%hues.length]}}/><span>{label(item.name)}</span>
   <strong>{count(item.count)} <small>({pct(total?item.count/total*100:0)})</small></strong>
  </div>)}</div>
 </div>;
}
function Section({title,subtitle,children}: {title:string;subtitle?:string;children:React.ReactNode}){
 return <section className="aw-lead-panel">
  <div className="aw-lead-panel-title"><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div>{children}
 </section>;
}
export default function LeadBreakdownPage(){
 const {session,request}=useAuth();
 const allowed=!!session?.identity.permissions.includes("reports.business.read")&&
  !!session?.identity.permissions.includes("leads.read");
 const [from,setFrom]=useState(startMonth),[to,setTo]=useState(today);
 const [ready,setReady]=useState(false);
 const [source,setSource]=useState(""),[stage,setStage]=useState(""),[owner,setOwner]=useState("");
 const [category,setCategory]=useState(""),[location,setLocation]=useState(""),[search,setSearch]=useState("");
 const [page,setPage]=useState(1);
 const [bucket,setBucket]=useState<"daily"|"weekly"|"monthly">("daily");
 const [report,setReport]=useState<ResponseData|null>(null),[options,setOptions]=useState<Options|null>(null);
 const [busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState("");
 const sequence=useRef(0);
 useEffect(()=>{
  const params=new URLSearchParams(window.location.search);
  const a=params.get("from"),b=params.get("to");
  if(a&&b&&/^\d{4}-\d{2}-\d{2}$/.test(a)&&/^\d{4}-\d{2}-\d{2}$/.test(b)&&a<=b){
   setFrom(a);setTo(b);
  }
  setReady(true);
 },[]);
 const query=useMemo(()=>new URLSearchParams(Object.entries({
  from,to,page:String(page),limit:"20",source,stage,assignedToId:owner,businessType:category,location,q:search,
 }).filter((entry):entry is [string,string]=>entry[1]!=="")),[from,to,page,source,stage,owner,category,location,search]);
 const refresh=useCallback(async()=>{
  if(!ready||!allowed||!session)return;
  if(!from||!to||from>to){setError("Select a valid reporting period.");return;}
  const current=++sequence.current;
  setBusy(true);setError("");
  try{
   const result=await request<ResponseData>("/reports/leads?"+query.toString());
   if(current!==sequence.current)return;
   setReport(result);
   if(!options)setOptions({assignees:result.assignees,
    categories:result.categories.map(x=>x.name).filter(x=>x!=="Not specified"),
    locations:result.locations.map(x=>x.name).filter(x=>x!=="Not specified")});
  }catch(e){if(current===sequence.current)setError(getError(e));}
  finally{if(current===sequence.current)setBusy(false);}
 },[allowed,ready,session,request,query,from,to,options]);
 useEffect(()=>{void refresh();return()=>{sequence.current+=1;};},[refresh]);
 const applyPeriod=(start:string,end:string)=>{setFrom(start);setTo(end);setPage(1);};
 const preset=(kind:"month"|"three"|"year"|"all")=>{
  const current=new Date(),start=new Date(Date.UTC(current.getFullYear(),current.getMonth(),1));
  if(kind==="month")applyPeriod(startMonth(),today());
  if(kind==="three"){start.setUTCMonth(start.getUTCMonth()-2);applyPeriod(ymd(start),today());}
  if(kind==="year")applyPeriod(today().slice(0,4)+"-01-01",today());
  if(kind==="all")applyPeriod("1970-01-01",today());
 };
 const clear=()=>{setSource("");setStage("");setOwner("");setCategory("");setLocation("");setSearch("");setPage(1);};
 const download=async()=>{
  if(!allowed||!report||exporting)return;
  setExporting(true);setError("");
  try{
   const params=new URLSearchParams(query);params.delete("page");params.delete("limit");
   const csv=await request<{filename:string;csv:string;count:number}>("/reports/leads/export?"+params);
   const blob=new Blob(["\ufeff"+csv.csv],{type:"text/csv;charset=utf-8"});
   const href=URL.createObjectURL(blob),a=document.createElement("a");
   a.href=href;a.download=csv.filename;document.body.appendChild(a);a.click();a.remove();
   URL.revokeObjectURL(href);
  }catch(e){setError(getError(e));}finally{setExporting(false);}
 };
 const back="/app/reports?"+new URLSearchParams({from,to});
 const statCards=report?[
  ["Total leads",report.summary.total,"Selected cohort"],["Meta leads",report.summary.meta,"Meta and WhatsApp"],
  ["Cold call leads",report.summary.cold,"Manual outreach"],["Meetings reached",report.summary.meetings,"Recorded meeting stage"],
  ["Decision pending",report.summary.decisionPending,"Current stage"],["Agreement pending",report.summary.agreementPending,"Current stage"],
  ["Approved",report.summary.approved,"Current approved stage"],["Client converted",report.summary.converted,"Approved with linked client"],
  ["Approval rate",pct(report.summary.approvalRate),"Approved / total"],["Client conversion rate",pct(report.summary.conversionRate),"Converted / total"],
  ["Rejected",report.summary.rejected,"Current stage"],["Overdue follow-ups",report.summary.overdue,"Open leads, as of now"],
 ]:[];
 if(!session)return <Spinner label="Checking reporting access…"/>;
 if(!allowed)return <Notice kind="error">Business reporting and lead reading permissions are required.</Notice>;
 return <div className="aw-report-page aw-lead-breakdown space-y-5" data-testid="lead-analytics-breakdown">
  <Link className="aw-lead-back" href={back}><ArrowLeft size={16}/>Back to Reports</Link>
  <PageHeader eyebrow="AGENCY LEAD INTELLIGENCE" title="Leads Breakdown"
   description="Actual CRM records, funnel history and conversion outcomes. All numbers respect the selected reporting filters."/>
  <section className="aw-lead-filter">
   <div className="aw-lead-filter-head"><strong><CalendarRange size={18}/>Reporting period</strong>
    <span><ShieldCheck size={15}/> Live, permission-protected</span></div>
   <div className="aw-lead-presets">{([["month","This month"],["three","Last 3 months"],["year","This year"],["all","All time"]] as const).map(([key,value])=>
    <button type="button" key={key} onClick={()=>preset(key)}>{value}</button>)}</div>
   <div className="aw-lead-filter-row">
    <label>From<input className="field" type="date" aria-label="Leads from date" value={from} max={to}
     onChange={e=>applyPeriod(e.target.value,to)}/></label>
    <label>Through<input className="field" type="date" aria-label="Leads through date" value={to} min={from}
     onChange={e=>applyPeriod(from,e.target.value)}/></label>
    <button type="button" className="aw-lead-primary" disabled={busy} onClick={()=>void refresh()}>
     <RefreshCcw size={16} className={busy?"animate-spin":""}/>Refresh</button>
   </div>
   <div className="aw-lead-filter-head"><strong><Filter size={17}/>Filter all analytics</strong>
    <button type="button" className="aw-lead-reset" onClick={clear}>Clear filters</button></div>
   <div className="aw-lead-filter-grid">
    <label>Source<select aria-label="Lead source filter" value={source} onChange={e=>{setSource(e.target.value);setPage(1);}}>
     <option value="">All sources</option><option value="META_LEADS">Meta Leads</option><option value="COLD_CALL">Cold Calls</option>
    </select></label>
    <label>Status<select aria-label="Lead stage filter" value={stage} onChange={e=>{setStage(e.target.value);setPage(1);}}>
     <option value="">All statuses</option>{["PENDING","YET_TO_CALL","CALL_NOT_PICKING","CALL_BUSY","FOLLOW_UP","MEETING_PROCESS","DECISION_PENDING","AGREEMENT_PENDING","APPROVED","REJECTED","NEW","CONTACTED","QUALIFIED","PROPOSAL","WON","LOST"].map(v=><option key={v} value={v}>{label(v)}</option>)}
    </select></label>
    <label>Assignee<select aria-label="Lead assignee filter" value={owner} onChange={e=>{setOwner(e.target.value);setPage(1);}}>
     <option value="">All assignees</option>{options?.assignees.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}
    </select></label>
    <label>Business category<select aria-label="Lead business category filter" value={category} onChange={e=>{setCategory(e.target.value);setPage(1);}}>
     <option value="">All business types</option>{options?.categories.map(v=><option key={v}>{v}</option>)}
    </select></label>
    <label>Location<select aria-label="Lead location filter" value={location} onChange={e=>{setLocation(e.target.value);setPage(1);}}>
     <option value="">All locations</option>{options?.locations.map(v=><option key={v}>{v}</option>)}
    </select></label>
    <label className="aw-lead-search-label">Search<input aria-label="Search leads" type="search" maxLength={100} value={search}
     placeholder="Business, contact, phone, location…" onChange={e=>{setSearch(e.target.value);setPage(1);}}/></label>
   </div>
  </section>
  {error&&<Notice kind="error">{error}</Notice>}
  {busy&&!report&&<Spinner label="Calculating lead analytics…"/>}
  {report&&<>
   <p className="aw-lead-muted">Period: {date(report.from+"T00:00:00Z")} to {date(report.to+"T00:00:00Z")} · Calculated {new Date(report.asOf).toLocaleString("en-IN")} · {count(report.summary.total)} matching leads {busy?" · Updating…":""}</p>
   <div className="aw-lead-kpis">{statCards.map(([name,value,description],i)=><article key={name} className="aw-lead-kpi">
    <div className="aw-lead-kpi-icon">{i%3===0?<Users size={18}/>:i%3===1?<TrendingUp size={18}/>:<Clock3 size={18}/>}</div>
    <p>{name}</p><strong>{typeof value==="number"?count(value):value}</strong><small>{description}</small>
   </article>)}</div>
   <div className="aw-lead-panels">
    <Section title="Lead acquisition trend" subtitle="New leads by creation date. Switch the time grouping without changing the cohort.">
     <div className="aw-lead-panel-toolbar"><label>Group by <select value={bucket} onChange={e=>setBucket(e.target.value as typeof bucket)}>
      <option value="daily">Day</option><option value="weekly">Week</option><option value="monthly">Month</option>
     </select></label></div>
     <Trend rows={report.trends[bucket]}/>
    </Section>
    <Section title="Lead sources" subtitle="Acquisition channel distribution"><Donut items={report.sources.map(x=>({name:x.name,count:x.total}))}/></Section>
    <Section title="Current lead statuses" subtitle="Exactly one current status per lead"><Bars items={report.stages}/></Section>
    <Section title="Conversion stage reach" subtitle="Historical stages reached, not a strictly sequential funnel"><Bars items={report.funnel}/></Section>
    <Section title="Acquisition effectiveness" subtitle="Approved and client-converted counts stay separate">
     <div className="aw-lead-table-scroll"><table className="aw-lead-table">
      <thead><tr><th>Source</th><th>Leads</th><th>Approved</th><th>Clients</th><th>Approval %</th><th>Conversion %</th></tr></thead>
      <tbody>{report.sources.map(row=><tr key={row.name}><td>{label(row.name)}</td><td>{row.total}</td>
       <td>{row.approved}</td><td>{row.converted}</td><td>{pct(row.approvalRate)}</td><td>{pct(row.conversionRate)}</td></tr>)}</tbody>
     </table></div>
    </Section>
    <Section title="Follow-up workload" subtitle="Current follow-up dates of open leads"><Bars items={report.followUps}/></Section>
    <Section title="Business categories" subtitle="Lead distribution by business type"><Bars items={report.categories}/></Section>
    <Section title="Locations" subtitle="Recorded lead locations"><Bars items={report.locations}/></Section>
    <Section title="Team performance" subtitle="Performance by current assignee, including unassigned leads">
     <div className="aw-lead-table-scroll"><table className="aw-lead-table">
      <thead><tr><th>Assignee</th><th>Leads</th><th>Meeting reached</th><th>Approved</th><th>Clients</th><th>Conversion %</th></tr></thead>
      <tbody>{report.team.map((person,i)=><tr key={person.id??"unassigned"+i}>
       <td>{person.name}</td><td>{person.total}</td><td>{person.meetings}</td>
       <td>{person.approved}</td><td>{person.converted}</td><td>{pct(person.conversionRate)}</td>
      </tr>)}</tbody>
     </table></div>{!report.team.length&&<p className="aw-lead-empty">No matching team activity.</p>}
    </Section>
    <Section title="Average time to approval" subtitle="Measured from lead creation to recorded approval or linked client creation">
     <div className="aw-lead-timing"><strong>{report.summary.averageApprovalDays===null?"Not available":report.summary.averageApprovalDays+" days"}</strong>
      <span>Based on {report.summary.approvalTimingSample} dated approvals out of {report.summary.approved} approved leads.</span></div>
    </Section>
   </div>
   <Section title="Complete lead register" subtitle="Search and filters affect the cards, charts, table and export equally. 20 leads per page.">
    <div className="aw-lead-register-head"><span><Search size={15}/>{count(report.summary.total)} records · Page {report.page} of {report.totalPages}</span>
     <button className="aw-lead-primary" type="button" disabled={exporting||busy} onClick={()=>void download()}>
      <ArrowDownToLine size={17}/>{exporting?"Exporting…":"Export filtered CSV"}</button></div>
    <div className="aw-lead-table-scroll"><table className="aw-lead-table aw-lead-ledger">
     <thead><tr><th>Created</th><th>Business / contact</th><th>Source</th><th>Category / location</th><th>Assignee</th><th>Status</th><th>Client</th><th>Age</th><th>Updated</th><th>Follow-up</th></tr></thead>
     <tbody>{report.items.map(lead=><tr key={lead.id}>
      <td>{date(lead.createdAt)}</td>
      <td><Link className="aw-lead-row-link" href={"/app/leads?focus="+encodeURIComponent(lead.id)}>{lead.businessName}</Link>
       <small>{lead.contactName||"No contact"}{lead.phone?" · "+lead.phone:""}</small></td>
      <td>{label(lead.source)}</td><td>{lead.businessType||"Unspecified"}<small>{lead.location||"Unknown location"}</small></td>
      <td>{lead.assignee}</td><td><span className="aw-lead-stage">{label(lead.status)}</span></td>
      <td>{lead.converted?"Converted":lead.approved?"Approved only":"Not converted"}</td>
      <td>{lead.ageDays}d</td><td>{date(lead.updatedAt)}</td><td>{date(lead.nextFollowUpAt)}</td>
     </tr>)}</tbody>
    </table></div>
    {!report.items.length&&<p className="aw-lead-empty">No leads match these filters.</p>}
    <nav className="aw-lead-page-nav" aria-label="Lead analytics pages">
     <button type="button" disabled={busy||page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}><ArrowLeft size={15}/>Previous</button>
     <span>Page {page} of {report.totalPages}</span>
     <button type="button" disabled={busy||!report.hasMore} onClick={()=>setPage(p=>p+1)}>Next<ArrowRight size={15}/></button>
    </nav>
   </Section>
   <section className="aw-lead-definitions"><h2><ChartNoAxesCombined size={18}/> Metric definitions and data integrity</h2>
    <dl>{Object.entries(report.definitions).map(([name,description])=><div key={name}>
     <dt>{label(name)}</dt><dd>{description}</dd></div>)}</dl>
    <p>Advertising spend, cost per lead and advertising ROI are not computed here because campaign expenses are not reliably linked to individual Meta leads.</p>
   </section>
  </>}
 </div>;
}
