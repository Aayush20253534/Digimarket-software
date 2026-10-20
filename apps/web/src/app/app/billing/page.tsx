"use client";
import {FormEvent,useCallback,useEffect,useMemo,useState} from "react";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,PageHeader,Notice,Spinner,StatusBadge,EmptyState} from "@/components/ui";

type Client={id:string;businessName:string};
type Category={id:string;kind:string;name:string;active:boolean};
type Line={description:string;quantity:string;unitPrice:string;taxRate:string};
type Invoice={id:string;clientId:string;number:string|null;status:"DRAFT"|"ISSUED"|"VOID";
 version:number;client:{businessName:string};sellerName:string;sellerAddress:string;sellerTaxId:string|null;
 buyerName:string;buyerAddress:string|null;notes:string|null;dueOn:string;subtotal:string;taxTotal:string;
 total:string;paidTotal:string;balance:string;settlement:string;lines:Line[]};
type Payment={id:string;clientId:string;status:"PENDING"|"VERIFIED"|"REJECTED";amount:string;reference:string;
 method:string;receivedOn:string;version:number;client:{businessName:string};
 allocations:{invoiceId:string;amount:string;invoice:{number:string|null}}[]};
type Schedule={id:string;clientId:string;enabled:boolean;version:number;frequency:string;nextRunAt:string;sellerName:string};
type Listing<T>={items:T[];nextCursor:string|null};
type Receivable={currency:string;receivable:string;overdue:string;openCount:number;overdueCount:number};
type Draft={clientId:string;sellerName:string;sellerAddress:string;sellerTaxId:string;
 buyerName:string;buyerAddress:string;dueOn:string;notes:string;lines:Line[]};
const blankLine=():Line=>({description:"",quantity:"1",unitPrice:"",taxRate:"0"});
const initial=():Draft=>({clientId:"",sellerName:"",sellerAddress:"",sellerTaxId:"",
 buyerName:"",buyerAddress:"",dueOn:new Date(Date.now()+14*86400000).toISOString().slice(0,10),
 notes:"",lines:[blankLine()]});
const err=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Billing request failed";
const rupee=(v:string)=>"INR "+Number(v).toLocaleString("en-IN",{minimumFractionDigits:2,maximumFractionDigits:2});
export default function BillingPage(){
 const {session,request}=useAuth();
 const grants=session?.identity.permissions??[];
 const canInvoices=grants.includes("invoices.read"),canDraft=grants.includes("invoices.draft"),
 canIssue=grants.includes("invoices.issue"),canManage=grants.includes("invoices.manage");
 const canPayments=grants.includes("payments.read"),canRecord=grants.includes("payments.record"),
 canVerify=grants.includes("payments.verify");
 const [tab,setTab]=useState<"invoices"|"payments"|"recurrence">("invoices");
 const [invoices,setInvoices]=useState<Invoice[]>([]),[selected,setSelected]=useState<Invoice|null>(null);
 const [payments,setPayments]=useState<Payment[]>([]),[schedules,setSchedules]=useState<Schedule[]>([]);
 const [clients,setClients]=useState<Client[]>([]),[categories,setCategories]=useState<Category[]>([]);
 const [receivables,setReceivables]=useState<Receivable|null>(null);
 const [draft,setDraft]=useState<Draft>(initial);
 const [editing,setEditing]=useState(false),[payment,setPayment]=useState({
  clientId:"",categoryId:"",amount:"",receivedOn:new Date().toISOString().slice(0,10),
  method:"UPI",reference:"",invoiceId:""});
 const [recurrence,setRecurrence]=useState({frequency:"MONTHLY",startAt:"",dueAfterDays:14});
 const [filterClient,setFilterClient]=useState("");
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const availableInvoices=useMemo(()=>invoices.filter(x=>x.clientId===payment.clientId&&x.status==="ISSUED"&&Number(x.balance)>0),[invoices,payment.clientId]);
 const selectedInvoice=availableInvoices.find(x=>x.id===payment.invoiceId);
 const reload=useCallback(async()=>{
  if(!canInvoices&&!canPayments){setLoading(false);return;}
  setLoading(true);
  try{
   const tasks:Promise<unknown>[]=[];
   if(canInvoices){
    tasks.push(request<Listing<Invoice>>("/invoices?limit=100"+(filterClient?"&clientId="+filterClient:"")).then(x=>setInvoices(x.items)));
    tasks.push(request<Receivable>("/invoices/receivables").then(setReceivables));
   }
   if(canPayments)tasks.push(request<Payment[]>("/payments").then(setPayments));
   if(canManage)tasks.push(request<Schedule[]>("/billing-schedules").then(setSchedules));
   await Promise.all(tasks);setError("");
  }catch(e){setError(err(e));}finally{setLoading(false);}
 },[canInvoices,canPayments,canManage,request,filterClient]);
 useEffect(()=>{void reload();},[reload]);
 useEffect(()=>{
  if(grants.includes("clients.read"))void request<Listing<Client>>("/clients?limit=100").then(x=>setClients(x.items)).catch(()=>{});
  if(grants.includes("finance.read.all")||grants.includes("finance.entry.create"))
   void request<Category[]>("/finance/categories").then(setCategories).catch(()=>{});
 },[request,session?.identity.userId]);
 const open=async(id:string)=>{
  try{setSelected(await request<Invoice>("/invoices/"+id));setEditing(false);setError("");}
  catch(e){setError(err(e));}
 };
 const run=async(cb:()=>Promise<unknown>,message:string,id?:string)=>{
  setBusy(true);setError("");setSuccess("");
  try{await cb();if(id)await open(id);await reload();setSuccess(message);}
  catch(e){setError(err(e));}finally{setBusy(false);}
 };
 const body=(d:Draft)=>({
  ...d,sellerTaxId:d.sellerTaxId||undefined,buyerAddress:d.buyerAddress||undefined,
  notes:d.notes||undefined,lines:d.lines,
 });
 const updateLine=(index:number,field:keyof Line,value:string)=>
  setDraft(d=>({...d,lines:d.lines.map((x,i)=>i===index?{...x,[field]:value}:x)}));
 const submitDraft=async(e:FormEvent)=>{
  e.preventDefault();
  if(editing&&selected){
   const current=selected;
   const data=body(draft);
   const {clientId:unused,...fields}=data;void unused;
   await run(()=>request("/invoices/"+current.id,{method:"PUT",body:{...fields,version:current.version}}),
     "Draft updated.",current.id);
  }else await run(async()=>{
   const created=await request<Invoice>("/invoices",{method:"POST",body:body(draft)});
   setDraft(initial());await open(created.id);
  },"Invoice draft created.");
 };
 const download=async(invoice:Invoice)=>{
  setBusy(true);setError("");
  try{
   const file=await request<{filename:string;base64:string;mime:string}>("/invoices/"+invoice.id+"/pdf");
   const binary=atob(file.base64);const bytes=new Uint8Array(binary.length);
   for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
   const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
   const a=document.createElement("a");a.href=url;a.download=file.filename;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1500);
   setSuccess("Private invoice PDF generated.");
  }catch(e){setError(err(e));}finally{setBusy(false);}
 };
 const record=async(e:FormEvent)=>{
  e.preventDefault();if(!selectedInvoice)return;
  await run(async()=>{
   await request("/payments",{method:"POST",body:{
    ...payment,idempotencyKey:crypto.randomUUID(),
    allocations:[{invoiceId:payment.invoiceId,amount:payment.amount}],
    invoiceId:undefined,
   }});
   setPayment(p=>({...p,amount:"",reference:"",invoiceId:""}));
  },"Payment recorded as pending. It will not affect balances or cash totals until a different finance approver verifies it.");
 };
 const startEdit=()=>{if(!selected)return;
  setDraft({clientId:selected.clientId,sellerName:selected.sellerName,sellerAddress:selected.sellerAddress,
   sellerTaxId:selected.sellerTaxId||"",buyerName:selected.buyerName,buyerAddress:selected.buyerAddress||"",
   dueOn:selected.dueOn.slice(0,10),notes:selected.notes||"",lines:selected.lines.map(x=>({
    description:x.description,quantity:x.quantity,unitPrice:x.unitPrice,taxRate:x.taxRate}))});
  setEditing(true);
 };
 const createSchedule=async(e:FormEvent)=>{
  e.preventDefault();if(!recurrence.startAt)return;
  await run(()=>request("/billing-schedules",{method:"POST",body:{
   ...body(draft),dueOn:undefined,frequency:recurrence.frequency,
   startAt:new Date(recurrence.startAt).toISOString(),dueAfterDays:recurrence.dueAfterDays,
  }}),"Recurring invoice schedule created. It generates drafts only, never automatic payments.");
 };
 if(!session)return <Spinner label="Loading billing permissions…"/>;
 if(!canInvoices&&!canPayments)return <><PageHeader title="Billing access denied"/><Notice kind="error">Billing permissions required.</Notice></>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Agency finances" title="Invoices & payments"
   description="Issue numbered invoices, collect and verify partial payments, and track INR receivables without double-counting income."/>
  {error&&<Notice kind="error">{error}</Notice>}
  {success&&<Notice kind="success">{success}</Notice>}
  {receivables&&canInvoices&&<div className="grid gap-3 sm:grid-cols-3">
   <Card title="Outstanding"><p className="text-2xl font-bold">{rupee(receivables.receivable)}</p>
     <p className="text-xs text-slate-500">{receivables.openCount} open invoices</p></Card>
   <Card title="Overdue"><p className="text-2xl font-bold">{rupee(receivables.overdue)}</p>
     <p className="text-xs text-slate-500">{receivables.overdueCount} overdue invoices</p></Card>
   <Card title="Accounting rule"><p className="text-sm text-slate-600">Issuing invoices does not post income. Only independently verified payments do.</p></Card>
  </div>}
  <div role="tablist" aria-label="Billing sections" className="flex flex-wrap gap-2">
   {(["invoices","payments","recurrence"] as const).filter(x=>x==="invoices"?canInvoices:x==="payments"?canPayments:canManage).map(x=>
    <button key={x} role="tab" aria-selected={tab===x} className={tab===x?"btn-primary":"btn-secondary"} onClick={()=>setTab(x)} type="button">
     {x==="invoices"?"Invoices":x==="payments"?"Payments":"Recurring drafts"}</button>)}
  </div>
  {loading?<Spinner label="Loading billing records…"/>:null}
  {tab==="invoices"&&canInvoices&&<div className="space-y-5">
   <Card title="Invoice register" description="Issued amounts are immutable. Payment status is derived from verified allocations.">
    <div className="mb-4 flex flex-wrap items-center gap-2">
     <select className="field" aria-label="Filter by client" value={filterClient} onChange={e=>setFilterClient(e.target.value)}>
      <option value="">All clients</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
     </select><button type="button" className="btn-secondary" onClick={()=>void reload()}>Refresh</button>
    </div>
    {invoices.length? <div className="space-y-2">{invoices.map(i=><button type="button" key={i.id}
      onClick={()=>void open(i.id)} className="flex w-full flex-wrap justify-between gap-3 rounded-lg border p-3 text-left hover:border-indigo-400">
       <div className="text-sm"><b>{i.number||"Unissued draft"}</b><p className="text-slate-500">{i.client.businessName}</p></div>
       <div className="text-sm">{rupee(i.total)}<p className="text-xs text-slate-500">Balance {rupee(i.balance)}</p></div>
       <StatusBadge status={i.settlement}/></button>)}</div>:
       <EmptyState title="No invoices found" description="Create a draft for an existing client to begin."/>}
   </Card>
   {selected&&<Card title={selected.number||"Draft invoice"} description={selected.client.businessName}>
    <div className="space-y-4">
     <div className="flex flex-wrap items-center gap-3"><StatusBadge status={selected.settlement}/>
      <span className="text-sm">Total {rupee(selected.total)}</span>
      <span className="text-sm">Paid {rupee(selected.paidTotal)}</span>
      <span className="text-sm font-semibold">Due {rupee(selected.balance)}</span>
     </div>
     <p className="text-sm text-slate-600">{selected.sellerName} · {selected.sellerAddress}</p>
     <table className="w-full text-sm"><thead><tr className="border-b text-left">
      <th className="py-2">Description</th><th>Qty</th><th>Price</th></tr></thead>
      <tbody>{selected.lines.map((x,i)=><tr key={i} className="border-b">
       <td className="py-2">{x.description}</td><td>{x.quantity}</td><td>{rupee(x.unitPrice)}</td></tr>)}</tbody>
     </table>
     <div className="flex flex-wrap gap-2">
      {canDraft&&selected.status==="DRAFT"&&<button type="button" className="btn-secondary" onClick={startEdit}>Edit draft</button>}
      {canIssue&&selected.status==="DRAFT"&&<button disabled={busy} type="button" className="btn-primary" onClick={()=>
        void run(()=>request("/invoices/"+selected.id+"/issue",{method:"POST",body:{version:selected.version}}),
          "Invoice issued and numbered.",selected.id)}>Issue invoice</button>}
      {selected.status!=="DRAFT"&&<button disabled={busy} type="button" className="btn-secondary"
       onClick={()=>void download(selected)}>Download private PDF</button>}
      {canManage&&selected.status==="ISSUED"&&Number(selected.paidTotal)===0&&
       <button disabled={busy} type="button" className="btn-secondary" onClick={()=>void run(()=>
        request("/invoices/"+selected.id+"/void",{method:"POST",body:{version:selected.version}}),
        "Invoice voided. The issued number remains reserved.",selected.id)}>Void invoice</button>}
     </div>
    </div>
   </Card>}
   {canDraft&&<Card title={editing?"Edit invoice draft":"Create invoice draft"}
     description="Billing identity and tax fields are supplied by the issuer. Configure them correctly before issuing.">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={submitDraft}>
     <label className="text-sm">Client<select required disabled={editing} className="field mt-1 w-full"
      value={draft.clientId} onChange={e=>setDraft(d=>({...d,clientId:e.target.value}))}>
      <option value="">Choose client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></label>
     <label className="text-sm">Invoice due date<input required type="date" className="field mt-1 w-full" value={draft.dueOn}
      onChange={e=>setDraft(d=>({...d,dueOn:e.target.value}))}/></label>
     {(["sellerName","sellerAddress","sellerTaxId","buyerName","buyerAddress","notes"] as const).map(key=>
      <label className="text-sm" key={key}>{key.replace(/([A-Z])/g," $1")}
       <input required={["sellerName","sellerAddress","buyerName"].includes(key)} className="field mt-1 w-full"
        maxLength={key==="notes"?2000:key.endsWith("Address")?500:key==="sellerTaxId"?40:180}
        value={draft[key]} onChange={e=>setDraft(d=>({...d,[key]:e.target.value}))}/></label>)}
     <div className="space-y-3 md:col-span-2">
      <h3 className="text-sm font-semibold">Invoice lines</h3>
      {draft.lines.map((l,i)=><div key={i} className="grid grid-cols-2 gap-2 rounded-lg border p-3 sm:grid-cols-5">
       <label className="text-xs sm:col-span-2">Service or item<input className="field mt-1 w-full" required minLength={2}
        value={l.description} onChange={e=>updateLine(i,"description",e.target.value)}/></label>
       <label className="text-xs">Qty<input className="field mt-1 w-full" inputMode="decimal" required value={l.quantity}
        onChange={e=>updateLine(i,"quantity",e.target.value)}/></label>
       <label className="text-xs">Unit price INR<input className="field mt-1 w-full" inputMode="decimal" required value={l.unitPrice}
        onChange={e=>updateLine(i,"unitPrice",e.target.value)}/></label>
       <label className="text-xs">Tax %<input className="field mt-1 w-full" inputMode="decimal" required value={l.taxRate}
        onChange={e=>updateLine(i,"taxRate",e.target.value)}/></label>
       {draft.lines.length>1&&<button type="button" className="btn-secondary col-span-2 sm:col-span-5" onClick={()=>
        setDraft(d=>({...d,lines:d.lines.filter((_,n)=>n!==i)}))}>Remove line</button>}
      </div>)}
      <button type="button" className="btn-secondary" disabled={draft.lines.length>=50}
       onClick={()=>setDraft(d=>({...d,lines:[...d.lines,blankLine()]}))}>Add line</button>
     </div>
     <div className="flex flex-wrap gap-2 md:col-span-2">
      <button disabled={busy} className="btn-primary">{editing?"Save draft changes":"Create draft"}</button>
      {editing&&<button type="button" className="btn-secondary" onClick={()=>{setEditing(false);setDraft(initial());}}>Cancel</button>}
     </div>
    </form>
   </Card>}
  </div>}
  {tab==="payments"&&canPayments&&<div className="space-y-5">
   <Card title="Payment verification queue" description="An authorized approver other than the recorder must confirm each receipt.">
    {payments.length?<div className="space-y-2">{payments.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
     <div><b className="text-sm">{rupee(p.amount)}</b>
      <p className="text-xs text-slate-500">{p.client.businessName} · {p.method} · Ref {p.reference}</p>
      <p className="text-xs text-slate-500">Invoice allocations: {p.allocations.map(a=>(a.invoice.number||"Draft")+" "+rupee(a.amount)).join("; ")}</p></div>
     <div className="flex flex-wrap gap-2 items-center"><StatusBadge status={p.status}/>
      {canVerify&&p.status==="PENDING"&&<>
       <button className="btn-primary" type="button" disabled={busy} onClick={()=>void run(()=>
        request("/payments/"+p.id+"/verify",{method:"POST",body:{version:p.version}}),
        "Verified payment was allocated to invoices and posted exactly once to the finance ledger.")}>Verify</button>
       <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void run(()=>
        request("/payments/"+p.id+"/reject",{method:"POST",body:{version:p.version}}),
        "Payment rejected without cash posting.")}>Reject</button></>}
     </div>
    </div>)}</div>:<EmptyState title="No payments yet" description="Newly recorded payments appear here until an independent verifier decides."/>}
   </Card>
   {canRecord&&<Card title="Record a received payment" description="Payment amount is allocated to one issued invoice here; the API supports splitting one receipt across multiple invoices.">
     <form className="grid gap-3 md:grid-cols-2" onSubmit={record}>
      <label className="text-sm">Client<select required className="field mt-1 w-full" value={payment.clientId}
       onChange={e=>setPayment(p=>({...p,clientId:e.target.value,invoiceId:""}))}>
       <option value="">Choose client</option>{clients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}</select></label>
      <label className="text-sm">Issued invoice<select required className="field mt-1 w-full" value={payment.invoiceId}
       onChange={e=>setPayment(p=>({...p,invoiceId:e.target.value}))}>
       <option value="">Choose invoice</option>{availableInvoices.map(i=><option key={i.id} value={i.id}>{i.number} · balance {rupee(i.balance)}</option>)}</select></label>
      <label className="text-sm">Income category<select required className="field mt-1 w-full" value={payment.categoryId}
       onChange={e=>setPayment(p=>({...p,categoryId:e.target.value}))}>
       <option value="">Choose category</option>{categories.filter(c=>c.active&&c.kind==="INCOME").map(c=>
       <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="text-sm">Amount (up to {selectedInvoice?rupee(selectedInvoice.balance):"invoice balance"})
       <input className="field mt-1 w-full" required inputMode="decimal" value={payment.amount}
        onChange={e=>setPayment(p=>({...p,amount:e.target.value}))}/></label>
      <label className="text-sm">Received date<input className="field mt-1 w-full" type="date" required value={payment.receivedOn}
       onChange={e=>setPayment(p=>({...p,receivedOn:e.target.value}))}/></label>
      <label className="text-sm">Method<select className="field mt-1 w-full" value={payment.method}
       onChange={e=>setPayment(p=>({...p,method:e.target.value}))}>
        {["UPI","BANK_TRANSFER","CASH","CARD","OTHER"].map(m=><option key={m}>{m}</option>)}</select></label>
      <label className="text-sm md:col-span-2">Unique payment reference
       <input className="field mt-1 w-full" required minLength={4} maxLength={180} value={payment.reference}
        onChange={e=>setPayment(p=>({...p,reference:e.target.value}))}/></label>
      <button className="btn-primary w-fit" disabled={busy||!payment.invoiceId}>Record pending payment</button>
     </form>
   </Card>}
  </div>}
  {tab==="recurrence"&&canManage&&<div className="space-y-5">
   <Card title="Recurring billing schedules" description="The background worker creates draft invoices for review. Invoices are never issued or paid automatically.">
    {schedules.length?<div className="space-y-3">{schedules.map(s=><div key={s.id} className="flex flex-wrap justify-between gap-3 rounded-lg border p-3">
     <p className="text-sm"><b>{s.sellerName}</b> · {s.frequency}<br/>Next draft {new Date(s.nextRunAt).toLocaleString()}</p>
     <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void run(()=>
      request("/billing-schedules/"+s.id,{method:"PUT",body:{version:s.version,enabled:!s.enabled}}),
      s.enabled?"Schedule paused.":"Schedule resumed.")}>{s.enabled?"Pause":"Resume"}</button>
    </div>)}</div>:<EmptyState title="No recurring invoices" description="Configure a draft template to start a recurrence schedule."/>}
   </Card>
   <Card title="Create recurring draft schedule" description="Use the invoice draft form above to define the client, seller identity, and line items first.">
    <form className="grid gap-3 md:grid-cols-2" onSubmit={createSchedule}>
     <label className="text-sm">Frequency<select className="field mt-1 w-full" value={recurrence.frequency}
      onChange={e=>setRecurrence(s=>({...s,frequency:e.target.value}))}>
       <option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option><option value="YEARLY">Yearly</option></select></label>
     <label className="text-sm">First draft time<input className="field mt-1 w-full" type="datetime-local" required
      value={recurrence.startAt} onChange={e=>setRecurrence(s=>({...s,startAt:e.target.value}))}/></label>
     <label className="text-sm">Days after issue for due date<input className="field mt-1 w-full" type="number" min={0} max={90}
      value={recurrence.dueAfterDays} onChange={e=>setRecurrence(s=>({...s,dueAfterDays:Number(e.target.value)}))}/></label>
     <div className="md:col-span-2"><button disabled={busy||!draft.clientId||!draft.lines[0]?.unitPrice}
      className="btn-primary">Create billing schedule from draft form</button></div>
    </form>
   </Card>
  </div>}
 </div>;
}
