"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {Notice,Spinner} from "@/components/ui";
import {FinancePager,money,useFinanceWindow,useFinanceContext} from "./shared";
const labels={ALL:"All types",INCOME:"Income",OTHER:"Operating expenses",SELF_ADS:"Agency Meta Ads",CLIENT_ADS:"Client Meta Ads",SALARY:"Salary",SETTLEMENT:"Internal settlement"} as const;
type Type=keyof typeof labels;
type Row={id:string;date:string;type:Exclude<Type,"ALL">;category:string;person:string;client:string;description:string;amount:string;status:string;method:string;direction:string;reversal:boolean};
type Result={items:Row[];total:number;page:number;limit:number};
function signed(r:Row){if(r.direction==="TRANSFER")return money(r.amount);const reversed=r.amount.startsWith("-");return ((r.direction==="INCOMING")!==reversed?"+":"−")+money(r.amount.replace(/^-/,""));}
function destination(r:Row){return r.type==="SETTLEMENT"?"/app/finance/settlements":r.type==="SALARY"?"/app/finance/total-expenses?type=SALARY":r.type==="SELF_ADS"||r.type==="CLIENT_ADS"?"/app/finance/ads":"/app/finance/entries";}
export function ActivityRegister({recent=false}:{recent?:boolean}){
 const {request,session}=useAuth(),w=useFinanceWindow(),context=useFinanceContext();
 const [type,setType]=useState<Type>("ALL"),[status,setStatus]=useState("ALL"),[search,setSearch]=useState(""),[page,setPage]=useState(1),[data,setData]=useState<Result|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false);
 const founder=!!session?.identity.roles.includes("FOUNDER"),settlements=founder||w.view==="all";
 const query=w.query+"&"+new URLSearchParams({page:String(page),limit:recent?"8":"25",type:type==="SETTLEMENT"&&!settlements?"ALL":type,status:recent?"POSTED":status,q:search});
 useEffect(()=>{setPage(1)},[w.query,type,status,search]);
 useEffect(()=>{if(!w.ready)return;let active=true;setBusy(true);setError("");setData(null);
 void request<Result>("/finance/activity?"+query).then(r=>{if(!active)return;if(!r||!Array.isArray(r.items)||typeof r.total!=="number")throw Error("Activity register is unavailable on this API version.");setData(r)}).catch(e=>{if(active)setError(e instanceof Error?e.message:"Activity unavailable")}).finally(()=>{if(active)setBusy(false)});return()=>{active=false}},[request,w.ready,query,context?.refresh]);
 async function exportRows(){setExporting(true);try{const r=await request<{csv:string;filename:string}>("/finance/activity/export?"+query);const url=URL.createObjectURL(new Blob([r.csv],{type:"text/csv;charset=utf-8"})),a=document.createElement("a");a.href=url;a.download=r.filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e){setError(e instanceof Error?e.message:"Export failed")}finally{setExporting(false)}}
 return <section className="fc-breakdown" aria-label={recent?"Recent financial activity":"Unified transaction register"}>
 <div className="fc-heading"><h2>{recent?"Recent financial activity":"All transactions"}</h2>{recent?<Link className="btn-secondary" href={"/app/finance?tab=transactions&"+w.query}>View register</Link>:<button type="button" className="btn-secondary" onClick={()=>void exportRows()} disabled={exporting||!data}>{exporting?"Exporting…":"Export CSV"}</button>}</div>
 <p>Internal settlements move personal balances only. Salary payments are counted once; My entries shows only the amount you funded.</p>
 {!recent&&<div className="fc-tabs"><label className="fc-search"><span className="sr-only">Search all transactions</span><input type="search" aria-label="Search all transactions" maxLength={100} placeholder="Category, client, person or note" value={search} onChange={e=>setSearch(e.target.value)}/></label><select className="field" aria-label="Transaction type" value={type} onChange={e=>setType(e.target.value as Type)}>{Object.entries(labels).filter(([k])=>k!=="SETTLEMENT"||settlements).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select><select className="field" aria-label="Transaction status" value={status} onChange={e=>setStatus(e.target.value)}>{["ALL","POSTED","PENDING","REJECTED","CANCELLED"].map(v=><option key={v} value={v}>{v==="ALL"?"All statuses":v}</option>)}</select></div>}
 {error&&<Notice kind="error">{error}</Notice>}
 {busy||!w.ready?<Spinner label="Loading financial activity…"/>:data&&!data.items.length?<p>No matching transactions.</p>:data&&<><div className="fc-activity-list">{data.items.map(r=><article className="fc-activity-row" key={r.id}><div><strong>{r.category}</strong><small>{r.date} · {labels[r.type]??r.type}{r.client?" · "+r.client:""}</small>{r.person&&<small>{r.person}</small>}{!recent&&r.description&&<p>{r.description}</p>}</div><div className="fc-activity-amount"><strong>{signed(r)}</strong><small>{r.status}{r.direction==="TRANSFER"?" · Transfer":""}{r.reversal?" · Reversal":""}</small>{!recent&&<small>{r.method.replaceAll("_"," ")}</small>}<Link className="fc-record-link" href={destination(r)+(destination(r).includes("?")?"&":"?")+w.query}>Details</Link></div></article>)}</div>{!recent&&<FinancePager page={page} total={data.total} onChange={setPage} disabled={busy}/>}</>}
 </section>
}
