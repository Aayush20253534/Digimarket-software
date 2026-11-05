"use client";
import {useCallback,useEffect,useState} from "react";
import {Banknote,Check,Plus,RefreshCw,RotateCcw,ShieldCheck,Users,Wallet} from "lucide-react";
import {BusinessWorkspaceNav} from "@/components/business-workspace-nav";
import {useAuth} from "@/components/auth-provider";
import {PageHeader,Spinner} from "@/components/ui";

type Person={id:string;displayName:string;loginId:string;isFounder:boolean};
type Account={id:string;name:string;founderUserId:string;founderName:string;openingBalance:string;availableBalance:string;active:boolean};
type Credit={id:string;amount:string;date:string;accountName:string;founderName:string;recordedBy:string;description:string|null};
type Share={accountId:string;amount:string};
type Salary={id:string;recipientUserId:string;recipientName:string;recordedBy:string;amount:string;salaryMonth:string;
 paidOn:string;method:string;status:"PAID"|"VOID";reference:string|null;note:string|null;voidReason:string|null;
 allocations:{accountId:string;amount:string;accountName:string;founderName:string}[]};
type Overview={currency:string;totalPaid:string;paymentCount:number;
 founderFunding:{founderUserId:string;name:string;amount:string;count:number}[];
 recipients:{userId:string;name:string;amount:string;count:number}[];
 monthly:{month:string;amount:string;count:number}[];accounts:Account[]};
const today=()=>new Date().toISOString().slice(0,10);
const rupees=(s:string|number)=>new Intl.NumberFormat("en-IN",{style:"currency",currency:"INR",
 minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(s)||0);
const err=(error:unknown)=>error instanceof Error?error.message:"The operation was not completed.";
const methods=["UPI","BANK_TRANSFER","CASH","CARD","OTHER"] as const;
export default function SalaryPage(){
 const {session,request}=useAuth();
 const founder=!!session?.identity.roles.includes("FOUNDER");
 const [people,setPeople]=useState<Person[]>([]);
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [credits,setCredits]=useState<Credit[]>([]);
 const [payments,setPayments]=useState<Salary[]>([]);
 const [overview,setOverview]=useState<Overview|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const [dateFrom,setDateFrom]=useState(today().slice(0,7)+"-01");
 const [dateTo,setDateTo]=useState(today());
 const [accountFounder,setAccountFounder]=useState(""),[accountName,setAccountName]=useState(""),
  [openingBalance,setOpeningBalance]=useState("0");
 const [creditAccount,setCreditAccount]=useState(""),[creditAmount,setCreditAmount]=useState(""),
  [creditDate,setCreditDate]=useState(today()),[creditNote,setCreditNote]=useState("");
 const [recipient,setRecipient]=useState(""),[amount,setAmount]=useState(""),[salaryMonth,setSalaryMonth]=useState(today().slice(0,7)),
  [paidOn,setPaidOn]=useState(today()),[method,setMethod]=useState<(typeof methods)[number]>("UPI"),
  [reference,setReference]=useState(""),[note,setNote]=useState(""),[confirmed,setConfirmed]=useState(false),
  [shares,setShares]=useState<Share[]>([{accountId:"",amount:""}]);
 const [paymentKey,setPaymentKey]=useState(()=>crypto.randomUUID());
 const [voidId,setVoidId]=useState<string|null>(null),[voidReason,setVoidReason]=useState("");

 const load=useCallback(async()=>{
  if(!session)return;
  setLoading(true);setError("");
  try{
   const params=new URLSearchParams({from:dateFrom,to:dateTo}).toString();
   if(founder){
    const [ps,as,cs,history,summary]=await Promise.all([
     request<Person[]>("/salary/people"),request<Account[]>("/salary/accounts"),
     request<Credit[]>("/salary/credits"),request<Salary[]>("/salary/payments?"+params),
     request<Overview>("/salary/summary?"+params)
    ]);
    setPeople(ps);setAccounts(as);setCredits(cs);setPayments(history);setOverview(summary);
   }else{
    const history=await request<Salary[]>("/salary/payments?"+params);
    setPayments(history);
   }
  }catch(e){setError(err(e));}finally{setLoading(false);}
 },[session,founder,request,dateFrom,dateTo]);
 useEffect(()=>{void load();},[load]);

 const activeAccounts=accounts.filter(x=>x.active);
 const founders=people.filter(x=>x.isFounder);
 const sharesTotal=shares.reduce((n,x)=>n+(Number(x.amount)||0),0);
 const difference=(Number(amount)||0)-sharesTotal;
 const shareIds=shares.map(x=>x.accountId).filter(Boolean);
 const duplicateShares=new Set(shareIds).size!==shareIds.length;
 const canPay=!!recipient&&Number(amount)>0&&confirmed&&shares.every(x=>x.accountId&&Number(x.amount)>0)
  &&!duplicateShares&&Math.abs(difference)<0.005&&shares.every(x=>{
   const found=activeAccounts.find(a=>a.id===x.accountId);
   return found&&Number(x.amount)<=Number(found.availableBalance);
  });
 async function action(work:()=>Promise<unknown>,message:string){
  setBusy(true);setError("");setSuccess("");
  try{await work();setSuccess(message);await load();}
  catch(e){setError(err(e));}
  finally{setBusy(false);}
 }
 const updateShare=(idx:number,key:keyof Share,value:string)=>setShares(rows=>rows.map((x,i)=>i===idx?{...x,[key]:value}:x));
 const totals=overview?.founderFunding||[];
 const maxFounder=Math.max(1,...totals.map(x=>Number(x.amount)));
 const monthMax=Math.max(1,...(overview?.monthly||[]).map(x=>Number(x.amount)));
 const isLoading=!session||loading&&!payments.length&&!accounts.length;
 if(!session)return <Spinner label="Checking salary access…"/>;
 return <main className="aw-salary-page space-y-6" data-aw-module="salary">
  <BusinessWorkspaceNav/>
  <PageHeader eyebrow="TEAM & PAYROLL" title={founder?"Salary & founder funding":"My salary"}
   description={founder?"Record confirmed salary payments, split them across founder accounts and track actual amounts funded without changing the ordinary income register.":
    "Your recorded salary payments are visible here. Entries are created by founders; no bank transfer is initiated by DigiMarket."}
   actions={<button className="btn-secondary" disabled={loading} onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>}/>
  {error&&<div role="alert" className="rounded-lg border border-red-500/40 p-3 text-red-400">{error}</div>}
  {success&&<div role="status" className="rounded-lg border border-emerald-500/40 p-3">{success}</div>}
  <div className="rounded-xl border border-white/10 p-4 flex flex-wrap gap-3 items-end">
   <label className="space-y-1 text-sm">From<input className="field block" type="date" max={dateTo} value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/></label>
   <label className="space-y-1 text-sm">Through<input className="field block" type="date" min={dateFrom} value={dateTo} onChange={e=>setDateTo(e.target.value)}/></label>
   <p className="text-sm opacity-70">All salary figures use the selected payment date range. Account balances always reflect all-time entries.</p>
  </div>
  {founder&&<>
   <section className="grid gap-3 sm:grid-cols-3">
    {[["Total salaries paid",overview?.totalPaid||"0.00","Company salary expense, counted once"],
      ["Salary payments",String(overview?.paymentCount||0),"Confirmed payments in range"],
      ["Founder sources",String(totals.length),"Funding founders in range"]].map(([label,value,desc],i)=>
     <article className="rounded-xl border border-white/10 p-4 space-y-2" key={label}>
      <span className="text-xs uppercase opacity-65">{label}</span>
      <strong className="block text-2xl">{i===0?rupees(value):value}</strong>
      <p className="text-xs opacity-65">{desc}</p>
     </article>)}
   </section>
   <div className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-xl border border-white/10 p-5 space-y-4">
     <h2 className="font-semibold text-lg flex gap-2 items-center"><Wallet size={19}/>Founder funding accounts</h2>
     <p className="text-sm opacity-70">Create a tracked balance for each founder's cash, UPI or bank funding source. Values are manual records, not bank-connected balances.</p>
     <label className="block text-sm space-y-1">Founder<select className="field w-full" value={accountFounder} onChange={e=>setAccountFounder(e.target.value)}>
      <option value="">Select founder</option>{founders.map(x=><option key={x.id} value={x.id}>{x.displayName}</option>)}
     </select></label>
     <div className="grid grid-cols-2 gap-3">
      <label className="text-sm space-y-1">Account label<input className="field w-full" value={accountName} maxLength={100}
       placeholder="UPI / Cash / Bank" onChange={e=>setAccountName(e.target.value)}/></label>
      <label className="text-sm space-y-1">Opening recorded funds (₹)<input className="field w-full" type="number" min="0" step="0.01"
       value={openingBalance} onChange={e=>setOpeningBalance(e.target.value)}/></label>
     </div>
     <button className="btn-secondary" disabled={busy||!accountFounder||!accountName.trim()} onClick={()=>void action(async()=>{
      await request("/salary/accounts",{method:"POST",body:{founderUserId:accountFounder,name:accountName,openingBalance}});
      setAccountName("");setOpeningBalance("0");
     },"Funding account created.")}><Plus size={16}/>Add account</button>
     {accounts.length===0?<p className="text-sm opacity-60">No founder salary funding accounts recorded.</p>:
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left opacity-60">
       <th className="py-2">Founder / account</th><th>Available</th><th>Status</th></tr></thead>
       <tbody>{accounts.map(a=><tr key={a.id} className="border-t border-white/10">
        <td className="py-2"><strong>{a.founderName}</strong><span className="block text-xs opacity-70">{a.name}</span></td>
        <td>{rupees(a.availableBalance)}</td>
        <td><button className="underline" disabled={busy} onClick={()=>void action(()=>request("/salary/accounts/"+a.id+"/status",
         {method:"PUT",body:{active:!a.active}}),a.active?"Account paused.":"Account enabled.")}>
         {a.active?"Active":"Paused"}</button></td>
       </tr>)}</tbody></table></div>}
    </section>
    <section className="rounded-xl border border-white/10 p-5 space-y-4">
     <h2 className="font-semibold text-lg flex gap-2 items-center"><Plus size={19}/>Record founder funds</h2>
     <p className="text-sm opacity-70">Add manually available funds without registering this contribution as agency income.</p>
     <label className="block text-sm space-y-1">Funding account<select className="field w-full" value={creditAccount} onChange={e=>setCreditAccount(e.target.value)}>
      <option value="">Choose an account</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>
       {a.founderName} · {a.name} ({rupees(a.availableBalance)})</option>)}
     </select></label>
     <div className="grid grid-cols-2 gap-3">
      <label className="text-sm space-y-1">Amount (₹)<input className="field w-full" type="number" min="0.01" step="0.01"
       value={creditAmount} onChange={e=>setCreditAmount(e.target.value)}/></label>
      <label className="text-sm space-y-1">Date<input className="field w-full" type="date" value={creditDate}
       onChange={e=>setCreditDate(e.target.value)}/></label>
     </div>
     <label className="block text-sm space-y-1">Note (optional)<input className="field w-full" maxLength={250}
      value={creditNote} onChange={e=>setCreditNote(e.target.value)} placeholder="Funds set aside for payroll"/></label>
     <button className="btn-secondary" disabled={busy||!creditAccount||Number(creditAmount)<=0} onClick={()=>void action(async()=>{
      await request("/salary/accounts/"+creditAccount+"/credits",{method:"POST",body:{
       amount:creditAmount,recordedOn:creditDate,description:creditNote}});
      setCreditAmount("");setCreditNote("");
     },"Founder funding balance updated.")}><Plus size={16}/>Record funding credit</button>
     <div className="space-y-2"><h3 className="font-semibold text-sm">Recent funding credits</h3>
      {credits.slice(0,8).map(c=><div key={c.id} className="flex justify-between gap-3 border-t border-white/10 py-2 text-sm">
       <span>{c.founderName} · {c.accountName}<small className="block opacity-60">{c.date} · {c.recordedBy}</small></span>
       <strong>{rupees(c.amount)}</strong>
      </div>)}{credits.length===0&&<p className="text-sm opacity-60">No additional funding recorded.</p>}</div>
    </section>
   </div>
   <section className="rounded-xl border border-white/10 p-5 space-y-4">
    <h2 className="text-xl font-semibold flex gap-2 items-center"><Banknote size={21}/>Record a salary payment</h2>
    <p className="text-sm opacity-70">Choose an employee or founder, then assign the exact funding split to one or more founder accounts. This records a payment you have already made, not an automatic transfer.</p>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
     <label className="text-sm space-y-1">Recipient<select className="field w-full" value={recipient} onChange={e=>setRecipient(e.target.value)}>
      <option value="">Choose staff member</option>{people.map(p=><option value={p.id} key={p.id}>{p.displayName}{p.isFounder?" (Founder)":""}</option>)}
     </select></label>
     <label className="text-sm space-y-1">Salary amount (₹)<input type="number" step="0.01" min="0.01" className="field w-full" value={amount}
      onChange={e=>setAmount(e.target.value)}/></label>
     <label className="text-sm space-y-1">Salary for month<input type="month" className="field w-full" value={salaryMonth}
      onChange={e=>setSalaryMonth(e.target.value)}/></label>
     <label className="text-sm space-y-1">Paid on<input type="date" className="field w-full" value={paidOn}
      onChange={e=>setPaidOn(e.target.value)}/></label>
     <label className="text-sm space-y-1">Payment method<select className="field w-full" value={method}
      onChange={e=>setMethod(e.target.value as (typeof methods)[number])}>{methods.map(x=><option key={x} value={x}>{x.replaceAll("_"," ")}</option>)}</select></label>
     <label className="text-sm space-y-1">Reference (optional)<input className="field w-full" maxLength={160}
      value={reference} onChange={e=>setReference(e.target.value)}/></label>
     <label className="text-sm space-y-1 sm:col-span-2">Notes (optional)<input className="field w-full" maxLength={500}
      value={note} onChange={e=>setNote(e.target.value)}/></label>
    </div>
    <h3 className="font-semibold">Funding sources</h3>
    {shares.map((share,i)=><div key={i} className="grid gap-2 grid-cols-[minmax(0,1fr)_minmax(100px,160px)_auto] items-end">
     <label className="text-sm space-y-1">Founder account
      <select className="field w-full" value={share.accountId} onChange={e=>updateShare(i,"accountId",e.target.value)}>
       <option value="">Select source</option>{activeAccounts.map(a=><option key={a.id} value={a.id}>{a.founderName} · {a.name} (Available {rupees(a.availableBalance)})</option>)}
      </select></label>
     <label className="text-sm space-y-1">Share (₹)<input className="field w-full" type="number" min="0.01" step="0.01"
      value={share.amount} onChange={e=>updateShare(i,"amount",e.target.value)}/></label>
     <button aria-label={"Remove funding source "+(i+1)} className="btn-secondary" disabled={shares.length===1}
      onClick={()=>setShares(x=>x.filter((_,j)=>j!==i))}>Remove</button>
    </div>)}
    <div className="flex gap-3 items-center flex-wrap">
     <button type="button" className="btn-secondary" onClick={()=>setShares(x=>[...x,{accountId:"",amount:""}])}
      disabled={shares.length>=20}><Plus size={16}/>Add another founder funding source</button>
     <p className="text-sm">Funding allocated: <strong>{rupees(sharesTotal)}</strong> · Remaining: <strong>{rupees(difference)}</strong></p>
    </div>
    {duplicateShares&&<p className="text-amber-400 text-sm">Select each funding account only once.</p>}
    <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>
     I confirm this salary was actually paid to the recipient.</label>
    <button type="button" disabled={busy||!canPay} className="btn-primary" onClick={()=>void action(async()=>{
     await request("/salary/payments",{method:"POST",body:{recipientUserId:recipient,
      idempotencyKey:paymentKey,amount,salaryMonth,paidOn,method,reference,note,
      allocations:shares,confirmedPaid:true}});
     setAmount("");setRecipient("");setShares([{accountId:"",amount:""}]);setConfirmed(false);
     setReference("");setNote("");setPaymentKey(crypto.randomUUID());
    },"Salary paid record created. Funders' available balances were reduced.")}>
     <Check size={16}/>{busy?"Saving…":"Save confirmed salary payment"}
    </button>
   </section>
   <div className="grid gap-5 lg:grid-cols-2">
    <section className="rounded-xl border border-white/10 p-5 space-y-3">
     <h2 className="text-lg font-semibold">Founder salary funding expenses</h2>
     <p className="text-xs opacity-70">Expense chart by funding founder, not by the founder recording the payment. Salary received is never income here.</p>
     {totals.map(x=><div key={x.founderUserId} className="space-y-1">
      <div className="flex justify-between text-sm"><span>{x.name}</span><strong>{rupees(x.amount)}</strong></div>
      <div className="h-3 rounded bg-white/10 overflow-hidden"><div className="h-full bg-purple-500" style={{width:Number(x.amount)/maxFounder*100+"%"}}/></div>
     </div>)}
     {totals.length===0&&<p className="text-sm opacity-60">No founder-funded salary expenses in this period.</p>}
    </section>
    <section className="rounded-xl border border-white/10 p-5 space-y-3">
     <h2 className="text-lg font-semibold">Monthly salary cost</h2>
     {(overview?.monthly||[]).map(x=><div key={x.month} className="space-y-1">
      <div className="flex justify-between text-sm"><span>{x.month}</span><strong>{rupees(x.amount)}</strong></div>
      <div className="h-3 rounded bg-white/10 overflow-hidden"><div className="h-full bg-sky-500" style={{width:Number(x.amount)/monthMax*100+"%"}}/></div>
     </div>)}
     {!(overview?.monthly||[]).length&&<p className="text-sm opacity-60">No salary costs in this period.</p>}
    </section>
   </div>
  </>}
  <section className="rounded-xl border border-white/10 p-5 space-y-4">
   <h2 className="text-lg font-semibold flex gap-2 items-center"><Users size={20}/>{founder?"Salary payment history":"My salary history"}</h2>
   <p className="text-sm opacity-70">All amounts are recorded payments, not bank transfer confirmations generated by DigiMarket. Voided records remain in history for audit.</p>
   {isLoading?<Spinner label="Loading salary ledger…"/>:payments.length===0?
    <p className="text-sm opacity-65">No salary entries found for this period.</p>:
    <div className="overflow-x-auto"><table className="w-full text-sm">
     <thead><tr className="border-b border-white/10 text-left opacity-65">
      <th className="py-3">Recipient</th><th>Salary month</th><th>Paid on</th><th>Amount</th>
      <th>Status</th>{founder&&<th>Founder funding and actions</th>}</tr></thead>
     <tbody>{payments.map(x=><tr key={x.id} className="border-t border-white/10 align-top">
      <td className="py-3"><strong>{x.recipientName}</strong><span className="text-xs opacity-60 block">Recorded by {x.recordedBy}</span></td>
      <td className="py-3">{x.salaryMonth}</td><td className="py-3">{x.paidOn}<span className="block text-xs opacity-60">{x.method.replaceAll("_"," ")}</span></td>
      <td className="py-3 font-semibold">{rupees(x.amount)}</td>
      <td className="py-3">{x.status==="PAID"?"Paid":"Voided"}{x.voidReason&&<small className="block opacity-60">{x.voidReason}</small>}</td>
      {founder&&<td className="py-3 space-y-1">
       {x.allocations.map(a=><div key={a.accountId}>{a.founderName} · {a.accountName}: <strong>{rupees(a.amount)}</strong></div>)}
       {x.reference&&<small className="block opacity-60">Ref: {x.reference}</small>}
       {x.status==="PAID"&&<button className="text-xs underline" onClick={()=>{setVoidId(x.id);setVoidReason("");}}>
        <RotateCcw size={13} className="inline"/> Void entry</button>}
       {voidId===x.id&&<div className="space-y-2 pt-2">
        <label className="block text-xs space-y-1">Reason for reversal<input className="field w-full" maxLength={500}
         value={voidReason} onChange={e=>setVoidReason(e.target.value)} placeholder="Incorrect entry / payment reversed"/></label>
        <div className="flex gap-2">
         <button className="btn-secondary" disabled={busy||voidReason.trim().length<4}
          onClick={()=>void action(async()=>{await request("/salary/payments/"+x.id+"/void",
           {method:"POST",body:{reason:voidReason.trim()}});setVoidId(null);},
           "Salary entry voided; each funding account was credited back.")}>Confirm reversal</button>
         <button className="btn-secondary" onClick={()=>setVoidId(null)}>Cancel</button>
        </div>
       </div>}
      </td>}
     </tr>)}</tbody></table></div>}
   <p className="text-xs opacity-60">Up to the latest 400 payments appear for the selected date range. Historical records are never deleted.</p>
  </section>
  {founder&&<p className="flex items-start gap-2 text-sm opacity-65"><ShieldCheck size={18} className="shrink-0"/>
   Company salary totals count each payment once. Funding splits are displayed separately by founder. Neither employee salary receipts nor founder deposits are added to ordinary Finance income.</p>}
 </main>;
}
