"use client";
import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,Notice,PageHeader,Spinner,EmptyState} from "@/components/ui";

type Values={billedNet:string;billedTax:string;billedGross:string;collectedCash:string;
 recognizedRevenue:string;directCosts:string;contribution:string;marginPercent:string|null};
type ClientRow=Values&{clientId:string;clientName:string;status:string};
type Report={currency:string;period:{from:string;to:string;clientId?:string};
 clients:ClientRow[];totals:Values&{unallocatedExpense:string|null;outsideFilterAttributedCost:string|null};
 methodology:Record<string,string>};
type Client={id:string;businessName:string};
type Project={id:string;clientId:string;name:string};
type Invoice={id:string;number:string|null;clientId:string;status:string;subtotal:string;
 client:{businessName:string}};
type Allocation={clientId:string;projectId:string|null;amount:string;note:string|null;
 client:{businessName:string}};
type Expense={id:string;amount:string;unallocated:string;attributed:string;costAllocationVersion:number;
 occurredOn:string;merchantOrSource:string|null;description:string|null;category:{name:string};
 costAllocations:Allocation[]};
type Recognition={id:string;amount:string;note:string;recognizedOn:string;reversalOfId:string|null;
 reversal:{id:string}|null;client:{businessName:string};invoice:{number:string|null}};
type AllocationForm={clientId:string;projectId:string;amount:string;note:string};
type List<T>={items:T[];nextCursor:string|null};
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>today().slice(0,7)+"-01";
const blank=():AllocationForm=>({clientId:"",projectId:"",amount:"",note:""});
const money=(s:string)=>"₹"+Number(s).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
const errorText=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Request failed";
const pct=(n:string|null)=>n===null?"N/A":n+"%";
export default function ProfitabilityPage(){
 const {session,request}=useAuth();
 const permissions=session?.identity.permissions??[];
 const canRead=permissions.includes("profitability.read")&&permissions.includes("finance.read.all");
 const canManage=permissions.includes("profitability.manage")&&canRead;
 const [from,setFrom]=useState(monthStart),[to,setTo]=useState(today),[clientId,setClientId]=useState("");
 const [report,setReport]=useState<Report|null>(null);
 const [clients,setClients]=useState<Client[]>([]),[projects,setProjects]=useState<Project[]>([]);
 const [invoices,setInvoices]=useState<Invoice[]>([]),[expenses,setExpenses]=useState<Expense[]>([]);
 const [recognitions,setRecognitions]=useState<Recognition[]>([]);
 const [selectedExpense,setSelectedExpense]=useState<string>("");
 const [allocations,setAllocations]=useState<AllocationForm[]>([blank()]);
 const [recognized,setRecognized]=useState({invoiceId:"",amount:"",note:"",recognizedOn:today()});
 const [reverseReason,setReverseReason]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[message,setMessage]=useState("");
 const params=useMemo(()=>new URLSearchParams({
  from,to,...(clientId?{clientId}:{}),
 }),[from,to,clientId]);
 const load=useCallback(async()=>{
  if(!canRead){setLoading(false);return;}
  setLoading(true);
  try{
   const [r,e,n]=await Promise.all([
    request<Report>("/profitability/report?"+params),
    canManage?request<Expense[]>("/profitability/expenses?"+params):Promise.resolve([]),
    canManage?request<Recognition[]>("/profitability/recognitions"+(clientId?"?clientId="+clientId:"")):Promise.resolve([]),
   ]);
   setReport(r);setExpenses(e);setRecognitions(n);setError("");
  }catch(e){setError(errorText(e));}finally{setLoading(false);}
 },[canRead,canManage,request,params,clientId]);
 useEffect(()=>{void load();},[load]);
 useEffect(()=>{
  if(!canRead)return;
  void request<List<Client>>("/clients?limit=100").then(r=>setClients(r.items)).catch(()=>{});
  if(!canManage)return;
  void request<List<Project>>("/projects?limit=100").then(r=>setProjects(r.items)).catch(()=>{});
  void request<List<Invoice>>("/invoices?limit=100").then(r=>setInvoices(r.items)).catch(()=>{});
 },[canRead,canManage,request,session?.identity.userId]);
 const chosen=expenses.find(e=>e.id===selectedExpense);
 const selectExpense=(id:string)=>{
  setSelectedExpense(id);
  const e=expenses.find(v=>v.id===id);
  setAllocations(e?.costAllocations.length?e.costAllocations.map(a=>({
   clientId:a.clientId,projectId:a.projectId??"",amount:a.amount,note:a.note??"",
  })):[blank()]);
 };
 const change=(index:number,key:keyof AllocationForm,value:string)=>{
  setAllocations(a=>a.map((row,i)=>i===index?{...row,[key]:value,
   ...(key==="clientId"?{projectId:""}:{})}:row));
 };
 const commit=async(task:()=>Promise<unknown>,success:string)=>{
  setBusy(true);setError("");setMessage("");
  try{await task();await load();setMessage(success);}
  catch(e){setError(errorText(e));}finally{setBusy(false);}
 };
 const saveCosts=async(e:FormEvent)=>{
  e.preventDefault();if(!chosen)return;
  const filtered=allocations.filter(a=>a.clientId&&a.amount);
  await commit(async()=>{
   await request("/profitability/expenses/"+chosen.id+"/allocations",{method:"PUT",body:{
    version:chosen.costAllocationVersion,
    allocations:filtered.map(a=>({clientId:a.clientId,projectId:a.projectId||null,
     amount:a.amount,note:a.note||undefined})),
   }});
   setSelectedExpense("");setAllocations([blank()]);
  },"Expense attribution saved with an audit entry.");
 };
 const addRevenue=async(e:FormEvent)=>{
  e.preventDefault();
  await commit(async()=>{
   await request("/profitability/recognitions",{method:"POST",body:{
    ...recognized,idempotencyKey:crypto.randomUUID(),
   }});
   setRecognized(v=>({...v,amount:"",note:""}));
  },"Recognized revenue added without posting cash.");
 };
 const reverse=async(id:string)=>{
  if(!reverseReason.trim()){setError("Enter a correction reason before reversing.");return;}
  await commit(async()=>{
   await request("/profitability/recognitions/"+id+"/reverse",{method:"POST",body:{
    recognizedOn:today(),note:reverseReason,idempotencyKey:crypto.randomUUID(),
   }});
   setReverseReason("");
  },"Correction recorded as a new negative recognition.");
 };
 const exportCsv=async()=>{
  setBusy(true);setError("");
  try{
   const data=await request<{filename:string;csv:string}>("/profitability/export?"+params);
   const url=URL.createObjectURL(new Blob([data.csv],{type:"text/csv;charset=utf-8"}));
   const node=document.createElement("a");node.href=url;node.download=data.filename;
   document.body.appendChild(node);node.click();node.remove();URL.revokeObjectURL(url);
  }catch(e){setError(errorText(e));}finally{setBusy(false);}
 };
 if(!session)return <Spinner label="Loading financial permissions…"/>;
 if(!canRead)return <><PageHeader title="Restricted financial report"/>
  <Notice kind="error">Client profitability requires privileged finance and report access.</Notice></>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Financial operations" title="Client profitability"
   description="Compare recognized revenue with attributable direct costs. Invoice totals, cash received, and unallocated overhead stay separate."/>
  {error&&<Notice kind="error">{error}</Notice>}
  {message&&<Notice kind="success">{message}</Notice>}
  <Card title="Reporting period" description="Event dates are the basis: issuance, receipt, recognition and expense posting date.">
   <div className="flex flex-wrap items-end gap-3">
    <label className="text-sm">From<input className="field mt-1 block" type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
    <label className="text-sm">Through<input className="field mt-1 block" type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    <label className="text-sm">Client<select className="field mt-1 block" value={clientId} onChange={e=>setClientId(e.target.value)}>
     <option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></label>
    <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void exportCsv()}>Export CSV</button>
    <button className="btn-secondary" type="button" onClick={()=>void load()}>Refresh</button>
   </div>
  </Card>
  {loading&&<Spinner label="Calculating verified accounting totals…"/>}
  {report&&<>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    {([
     ["Recognized revenue",report.totals.recognizedRevenue],
     ["Direct client costs",report.totals.directCosts],
     ["Client contribution",report.totals.contribution],
     ["Contribution margin",pct(report.totals.marginPercent)],
    ] as const).map(([title,value])=><Card key={title} title={title}>
      <p className="text-2xl font-semibold tabular-nums">{title==="Contribution margin"?value:money(value)}</p></Card>)}
   </div>
   <Card title="Revenue and costs are different measures" description="Billed values include only issued invoices; collected excludes unverified or unrelated income entries.">
     <div className="grid gap-4 text-sm sm:grid-cols-3">
       <div><p className="text-slate-500">Issued invoices (before tax)</p><b>{money(report.totals.billedNet)}</b>
        <p className="text-xs text-slate-500">Tax separately {money(report.totals.billedTax)}</p></div>
       <div><p className="text-slate-500">Collected verified cash</p><b>{money(report.totals.collectedCash)}</b></div>
       <div><p className="text-slate-500">Unallocated agency expense</p>
        <b>{report.totals.unallocatedExpense===null?"All-client report only":money(report.totals.unallocatedExpense)}</b></div>
     </div>
   </Card>
   <Card title="Profitability by client" description="Contribution = recognized revenue minus attributed direct costs. This is not company net profit.">
     {report.clients.length?<div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
       <thead><tr className="border-b text-left text-slate-500">
        {["Client","Billed net","Collected","Recognized","Direct cost","Contribution","Margin"].map(k=>
         <th key={k} className="py-3 pr-3">{k}</th>)}</tr></thead>
       <tbody>{report.clients.map(c=><tr key={c.clientId} className="border-b">
        <td className="py-3 pr-3 font-semibold">{c.clientName}</td>
        {[c.billedNet,c.collectedCash,c.recognizedRevenue,c.directCosts,c.contribution].map((x,i)=>
         <td key={i} className="py-3 pr-3 tabular-nums">{money(x)}</td>)}
        <td className="py-3 tabular-nums">{pct(c.marginPercent)}</td>
       </tr>)}</tbody>
      </table></div>:<EmptyState title="No clients in view" description="Choose another filter."/>}
   </Card>
   <Card title="Accounting methodology" description="Period views can differ because cash, invoices, and recognized work have different accounting dates.">
    <div className="grid gap-2 text-sm text-slate-600">
     {Object.entries(report.methodology).map(([k,v])=><p key={k}><b className="capitalize">{k}:</b> {v}</p>)}
    </div>
   </Card>
  </>}
  {canManage&&<>
   <Card title="Attribute approved expenses" description="Allocate one posted expense across one or more clients; any remainder stays unallocated overhead. Reallocation is audited.">
    <div className="space-y-4">
     <label className="text-sm">Posted expense
      <select className="field mt-1 w-full" value={selectedExpense} onChange={e=>selectExpense(e.target.value)}>
       <option value="">Choose posted expense</option>{expenses.map(e=><option key={e.id} value={e.id}>
        {e.occurredOn.slice(0,10)} · {e.category.name} · {money(e.amount)} · {e.merchantOrSource??"Expense"}
       </option>)}</select></label>
     {chosen&&<form onSubmit={saveCosts} className="space-y-3">
      <p className="text-xs text-slate-500">Expense total: {money(chosen.amount)}. Existing unallocated: {money(chosen.unallocated)}.</p>
      {allocations.map((a,i)=><div key={i} className="grid gap-2 rounded-lg border p-3 md:grid-cols-4">
       <label className="text-xs">Client<select required className="field mt-1 w-full" value={a.clientId} onChange={e=>change(i,"clientId",e.target.value)}>
        <option value="">Choose</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></label>
       <label className="text-xs">Project (optional)<select className="field mt-1 w-full" value={a.projectId} onChange={e=>change(i,"projectId",e.target.value)}>
        <option value="">No project</option>{projects.filter(p=>p.clientId===a.clientId).map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
       <label className="text-xs">Attributed INR<input required className="field mt-1 w-full" inputMode="decimal" value={a.amount}
        onChange={e=>change(i,"amount",e.target.value)}/></label>
       <label className="text-xs">Note<input className="field mt-1 w-full" maxLength={500} value={a.note}
        onChange={e=>change(i,"note",e.target.value)}/></label>
       <button className="btn-secondary w-fit" type="button" onClick={()=>setAllocations(v=>v.filter((_,j)=>j!==i))}>Remove</button>
      </div>)}
      <div className="flex flex-wrap gap-2">
       <button type="button" className="btn-secondary" onClick={()=>setAllocations(a=>[...a,blank()])}>Split to another client</button>
       <button className="btn-primary" disabled={busy}>Save cost attribution</button>
      </div>
     </form>}
    </div>
   </Card>
   <Card title="Recognize earned revenue" description="Manual recognition is capped at the issued invoice's before-tax subtotal and does not create a cash receipt.">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={addRevenue}>
     <label className="text-sm">Issued invoice<select required className="field mt-1 w-full" value={recognized.invoiceId}
       onChange={e=>setRecognized(v=>({...v,invoiceId:e.target.value}))}>
       <option value="">Choose invoice</option>{invoices.filter(i=>i.status==="ISSUED").map(i=>
        <option key={i.id} value={i.id}>{i.client.businessName} · {i.number} · pre-tax {money(i.subtotal)}</option>)}
      </select></label>
     <label className="text-sm">Recognized on<input required type="date" className="field mt-1 w-full" value={recognized.recognizedOn}
       onChange={e=>setRecognized(v=>({...v,recognizedOn:e.target.value}))}/></label>
     <label className="text-sm">Revenue INR<input required inputMode="decimal" className="field mt-1 w-full" value={recognized.amount}
       onChange={e=>setRecognized(v=>({...v,amount:e.target.value}))}/></label>
     <label className="text-sm">Reason / milestone<input required minLength={4} maxLength={500} className="field mt-1 w-full"
       value={recognized.note} onChange={e=>setRecognized(v=>({...v,note:e.target.value}))}/></label>
     <button className="btn-primary w-fit" disabled={busy}>Record earned revenue</button>
    </form>
   </Card>
   <Card title="Recognition ledger and corrections" description="Original entries remain unchanged. Reversals create negative records with a separate audit trail.">
    <label className="text-sm">Correction reason (required to reverse)
     <input className="field mt-1 w-full" minLength={4} maxLength={500} value={reverseReason}
      placeholder="Incorrect delivery period, accounting correction..." onChange={e=>setReverseReason(e.target.value)}/></label>
    <div className="mt-3 space-y-2">
     {recognitions.length?recognitions.map(x=><div key={x.id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-3">
      <div className="text-sm"><b>{money(x.amount)}</b> · {x.client.businessName} · {x.invoice.number}
       <p className="text-xs text-slate-500">{x.recognizedOn.slice(0,10)} · {x.note}</p></div>
      {!x.reversalOfId&&!x.reversal&&<button className="btn-secondary" type="button" disabled={busy||reverseReason.trim().length<4}
       onClick={()=>void reverse(x.id)}>Reverse entry</button>}
      {x.reversal&&<span className="text-xs text-slate-500">Reversed</span>}
     </div>):<EmptyState title="No revenue recognized" description="Issued invoices alone are not proof of earned revenue."/>}
    </div>
   </Card>
  </>}
 </div>;
}
