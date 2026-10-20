"use client";

import Link from "next/link";
import BillingPage from "../billing/page";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, FileImage, Plus, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";

type Kind="INCOME"|"EXPENSE";
type View="mine"|"all";
type Category={id:string;kind:Kind;name:string;active:boolean};
type Entry={id:string;kind:Kind;status:"PENDING"|"POSTED"|"REJECTED"|"CANCELLED";
  amount:string;currencyCode:string;occurredOn:string;method:string;description:string|null;
  merchantOrSource:string|null;createdAt:string;approvalRequestId:string;
  receiptAssetId?:string|null;category:{name:string};enteredBy:{displayName:string;loginId:string}};
type Totals={currency:string;postedIncome:string;postedExpense:string;postedNet:string;
  pendingIncome:string;pendingExpense:string;groups:{kind:Kind;status:string;amount:string;count:number}[]};
type FinancePolicy={category:string;active:boolean};
const zero:Totals={currency:"INR",postedIncome:"0.0000",postedExpense:"0.0000",postedNet:"0.0000",
  pendingIncome:"0.0000",pendingExpense:"0.0000",groups:[]};
const modes=["CASH","UPI","BANK_TRANSFER","CARD","OTHER"] as const;
function money(value:string){
  const negative=value.startsWith("-"),raw=negative?value.slice(1):value;
  const [whole,fraction=""]=raw.split(".");
  const grouped=whole.replace(/\B(?=(\d{3})+(?!\d))/g,",");
  const shown=fraction.padEnd(2,"0").replace(/0{1,2}$/,"") || "00";
  return (negative?"−":"")+"₹"+grouped+"."+shown;
}
function readable(error:unknown){return error instanceof ApiError?error.message:"Could not complete the finance operation.";}
export default function FinancePage(){
  const {session,request}=useAuth();
  const canAll=!!session?.identity.permissions.includes("finance.read.all");
  const canBilling=!!session?.identity.permissions.some(p=>p==="invoices.read"||p==="payments.read");
  const [section,setSection]=useState<"ledger"|"billing">("ledger");
  const canManage=!!session?.identity.permissions.includes("finance.category.manage");
  const canCreate=!!session?.identity.permissions.includes("finance.entry.create");
  const canReadOwn=!!session?.identity.permissions.includes("finance.entry.read.own");
  const [view,setView]=useState<View>("mine");
  const [categories,setCategories]=useState<Category[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [totals,setTotals]=useState<Totals>(zero);
  const [financeReady,setFinanceReady]=useState(false);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [kind,setKind]=useState<Kind>("EXPENSE");
  const [categoryId,setCategoryId]=useState("");
  const [amount,setAmount]=useState("");
  const [occurredOn,setOccurredOn]=useState(()=>new Date().toISOString().slice(0,10));
  const [method,setMethod]=useState<(typeof modes)[number]>("UPI");
  const [source,setSource]=useState("");
  const [description,setDescription]=useState("");
  const [receipt,setReceipt]=useState<File|null>(null);
  const [uploadStatus,setUploadStatus]=useState("");
  const [categoryKind,setCategoryKind]=useState<Kind>("EXPENSE");
  const [categoryName,setCategoryName]=useState("");
  const selected=useMemo(()=>categories.filter(c=>c.active&&c.kind===kind),[categories,kind]);
  useEffect(()=>{if(!selected.some(c=>c.id===categoryId))setCategoryId(selected[0]?.id??"");},[selected,categoryId]);

  const reload=useCallback(async()=>{
    if(!canReadOwn&&!canAll){setLoading(false);return;}
    setLoading(true);
    try{
      const target=view==="all"&&canAll?"all":"mine";
      const [cats,ledger,sums,policies]=await Promise.all([
        request<Category[]>("/finance/categories"),
        request<Entry[]>("/finance/entries?view="+target),
        request<Totals>("/finance/summary?view="+target),
        request<FinancePolicy[]>("/approval-policies"),
      ]);
      setCategories(cats);setEntries(ledger);setTotals(sums);
      setFinanceReady(policies.some(p=>p.category==="FINANCE"&&p.active));
      setError("");
    }catch(e){setError(readable(e));}finally{setLoading(false);}
  },[request,view,canReadOwn,canAll]);
  useEffect(()=>{void reload();},[reload]);
  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      let receiptAssetId:string|null=null;
      if(receipt){
       if(!["image/jpeg","image/png","image/webp","application/pdf"].includes(receipt.type))throw new Error("Receipt must be JPEG, PNG, WebP or PDF.");
       if(receipt.size>10_000_000||receipt.size===0)throw new Error("Receipt must be between 1 byte and 10 MB.");
       setUploadStatus("Authorizing private receipt upload…");
       const intent=await request<{intentId:string;expiresAt:string;params:Record<string,string>;uploadUrl:string}>(
         "/finance/proof-intent",{method:"POST",body:{filename:receipt.name,contentType:receipt.type,bytes:receipt.size,clientId:null}});
       if(new Date(intent.expiresAt).getTime()<=Date.now())throw new Error("Upload authorization expired. Retry.");
       const form=new FormData();
       for(const [k,v] of Object.entries(intent.params))form.append(k,v);
       form.append("file",receipt,receipt.name);
       setUploadStatus("Uploading receipt securely…");
       const response=await fetch(intent.uploadUrl,{method:"POST",body:form});
       if(!response.ok)throw new Error("Receipt upload failed ("+response.status+")");
       const payload=await response.json() as {asset_id?:string};
       if(!payload.asset_id)throw new Error("Receipt storage did not return an identifier");
       setUploadStatus("Verifying receipt…");
       const proof=await request<{id:string}>("/finance/proof-confirm",{method:"POST",body:{intentId:intent.intentId,assetId:payload.asset_id}});
       receiptAssetId=proof.id;
      }
      setUploadStatus("Submitting transaction for approval…");
      await request("/finance/entries",{method:"POST",body:{
        kind,categoryId,amount:amount.trim(),occurredOn,method,
        merchantOrSource:source.trim(),description:description.trim(),
        idempotencyKey:crypto.randomUUID(),receiptAssetId,
      }});
      setSuccess("Entry submitted for finance approval. Pending amounts are not included in posted totals.");
      setAmount("");setSource("");setDescription("");setReceipt(null);
      await reload();
    }catch(e){setError(e instanceof Error?e.message:readable(e));}finally{setBusy(false);setUploadStatus("");}
  }
  async function addCategory(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/categories",{method:"POST",body:{kind:categoryKind,name:categoryName.trim()}});
      setSuccess("Category created for the whole agency.");setCategoryName("");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function toggleCategory(c:Category){
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/categories/"+c.id+"/status",{method:"PUT",body:{active:!c.active}});
      setSuccess("Category updated without altering historical entries.");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function showReceipt(id:string){
    setBusy(true);setError("");
    try{
     const proof=await request<{url:string;expiresAt:string}>("/finance/entries/"+id+"/proof");
     const link=document.createElement("a");link.href=proof.url;link.target="_blank";link.rel="noopener noreferrer";link.click();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function exportCsv(){
    setBusy(true);setError("");
    try{
      const target=view==="all"&&canAll?"all":"mine";
      const response=await request<{filename:string;csv:string}>("/finance/export?view="+target);
      const blob=new Blob([response.csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=response.filename;a.click();
      URL.revokeObjectURL(url);
      setSuccess("CSV exported for the selected permission-scoped view.");
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  if(!session)return <Spinner label="Checking finance access…"/>;
  if(!canReadOwn&&!canAll&&!canBilling)return <><PageHeader title="Finance access denied" description="No financial permissions were assigned to your account."/><Notice kind="error">Contact an administrator for access.</Notice></>;
  const nav=<div className="aw-finance-tabs" role="tablist" aria-label="Finance sections">
     {(canReadOwn||canAll)&&<button type="button" role="tab" aria-selected={section==="ledger"}
       className={section==="ledger"?"active":""} onClick={()=>setSection("ledger")}><Wallet size={16}/> Income & expenses</button>}
     {canBilling&&<button type="button" role="tab" aria-selected={section==="billing"}
       className={section==="billing"?"active":""} onClick={()=>setSection("billing")}>Invoices & payments</button>}
   </div>;
  if(section==="billing"||(!canReadOwn&&!canAll)){
   return <div className="space-y-5">{nav}<BillingPage/></div>;
  }
  return <div className="space-y-7">
    {nav}
    <PageHeader eyebrow="Financial operations" title="Income, expenses & billing"
      description="All financial records are submitted for approval. Only posted entries count towards net income."
      actions={<div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void exportCsv()}><Download className="h-4 w-4"/>Export CSV</button>
        <button className="btn-secondary" type="button" disabled={loading} onClick={()=>void reload()}><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>}/>
    {error&&<Notice kind="error">{error}</Notice>}{success&&<Notice kind="success">{success}</Notice>}
    <div className="flex gap-2" role="group" aria-label="Finance visibility">
      <button className={view==="mine"?"btn-primary":"btn-secondary"} onClick={()=>setView("mine")}>My entries</button>
      {canAll&&<button className={view==="all"?"btn-primary":"btn-secondary"} onClick={()=>setView("all")}>Agency totals</button>}
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {([
        ["Posted income",totals.postedIncome],
        ["Posted expenses",totals.postedExpense],
        ["Net posted",totals.postedNet],
        ["Pending income",totals.pendingIncome],
        ["Pending expenses",totals.pendingExpense],
      ] as const).map(([label,value])=><Card key={label}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 break-words text-xl font-bold">{loading?"…":money(value)}</p>
        <p className="mt-2 text-xs text-slate-500">{view==="all"?"Organization":"Your entries"} · {totals.currency}</p>
      </Card>)}
    </div>
    {!financeReady&&<Notice>To submit finance entries, an administrator must activate the FINANCE policy in <Link className="underline" href="/app/approvals">Approval workflows</Link>.</Notice>}
    <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
      {canCreate&&<Card title="New income or expense" description="Every submission enters the approval queue. Amounts are stored with four decimal places, not floating-point math.">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit}>
          <FormField id="finance-kind" label="Entry type"><select id="finance-kind" className="field" value={kind} onChange={e=>setKind(e.target.value as Kind)}>
            <option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></FormField>
          <FormField id="finance-category" label="Category"><select id="finance-category" className="field" value={categoryId} required onChange={e=>setCategoryId(e.target.value)}>
            {!selected.length&&<option value="">Create a category first</option>}
            {selected.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
          <FormField id="finance-amount" label="Amount (INR)"><input id="finance-amount" className="field" inputMode="decimal" required
            pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" placeholder="1250.00"
            value={amount} onChange={e=>setAmount(e.target.value)}/></FormField>
          <FormField id="finance-date" label="Transaction date"><input id="finance-date" className="field" required type="date" value={occurredOn}
            onChange={e=>setOccurredOn(e.target.value)}/></FormField>
          <FormField id="finance-method" label="Payment method"><select id="finance-method" className="field" value={method} onChange={e=>setMethod(e.target.value as typeof method)}>
            {modes.map(m=><option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</select></FormField>
          <FormField id="finance-source" label={kind==="EXPENSE"?"Merchant / payee":"Income source"}><input id="finance-source" className="field" maxLength={160}
            value={source} onChange={e=>setSource(e.target.value)} placeholder={kind==="EXPENSE"?"Rapido":"Agency service"}/></FormField>
          <div className="sm:col-span-2"><FormField id="finance-description" label="Notes (optional)"><textarea id="finance-description" className="field min-h-20" maxLength={2000}
            value={description} onChange={e=>setDescription(e.target.value)}/></FormField></div>
          <div className="sm:col-span-2"><FormField id="finance-receipt" label="Receipt image or payment proof (optional)">
             <input id="finance-receipt" className="field" type="file"
               accept="image/jpeg,image/png,image/webp,application/pdf"
               onChange={e=>setReceipt(e.target.files?.[0]??null)}/>
            </FormField>
            {receipt&&<p className="mt-1 text-xs">{receipt.name} · {(receipt.size/1024/1024).toFixed(2)} MB</p>}
            {uploadStatus&&<p role="status" className="mt-2 text-sm">{uploadStatus}</p>}
          </div>
          <div className="sm:col-span-2"><button className="btn-primary" type="submit" disabled={busy||!categoryId||!financeReady}>
            <Plus className="h-4 w-4"/>{busy?"Submitting…":"Submit for approval"}</button></div>
        </form>
      </Card>}
      <Card title="Expense and income categories" description="Company-wide categories are set by administrators. Old entries retain their category when it is deactivated.">
        {canManage&&<form className="flex flex-wrap items-end gap-3" onSubmit={addCategory}>
          <FormField id="new-category-kind" label="Type"><select id="new-category-kind" className="field" value={categoryKind}
            onChange={e=>setCategoryKind(e.target.value as Kind)}><option value="EXPENSE">Expense</option><option value="INCOME">Income</option></select></FormField>
          <FormField id="new-category-name" label="Category name"><input id="new-category-name" className="field" required minLength={2}
            maxLength={120} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder="Rapido"/></FormField>
          <button className="btn-primary" type="submit" disabled={busy}>Add category</button>
        </form>}
        <div className="mt-5 space-y-2">{categories.length?categories.map(c=><div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
          <div><p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.kind} · {c.active?"Active":"Inactive"}</p></div>
          {canManage&&<button type="button" className="btn-secondary text-xs" onClick={()=>void toggleCategory(c)} disabled={busy}>{c.active?"Disable":"Enable"}</button>}
        </div>):<EmptyState title="No categories yet" description="An administrator can add expense and income categories." icon={Wallet}/>}</div>
      </Card>
    </div>
    <Card title={view==="all"?"Agency financial register":"My financial register"} description="Latest 200 entries, including pending and rejected requests. The CSV export includes up to 5,000 entries.">
      {loading?<Spinner label="Loading financial entries…"/>:!entries.length?<EmptyState title="No entries yet" description="Submitted income and expense records appear here after entry."/>:
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
          <thead><tr className="border-b text-xs uppercase text-slate-500">
            {["Date","Type","Category","Source","Amount","Status","Entered by","Receipt","Approval"].map(x=><th key={x} className="pb-3 pr-4">{x}</th>)}
          </tr></thead><tbody>{entries.map(row=><tr key={row.id} className="border-b border-slate-100">
            <td className="py-3 pr-4">{row.occurredOn}</td>
            <td className="py-3 pr-4">{row.kind==="INCOME"?<ArrowDownLeft className="h-4 w-4 text-emerald-600"/>:<ArrowUpRight className="h-4 w-4 text-amber-600"/>}</td>
            <td className="py-3 pr-4">{row.category.name}</td>
            <td className="py-3 pr-4">{row.merchantOrSource||"—"}</td>
            <td className="py-3 pr-4 font-semibold">{money(row.amount)}</td>
            <td className="py-3 pr-4">{row.status}</td>
            <td className="py-3 pr-4">{row.enteredBy.displayName}</td>
            <td className="py-3">{row.receiptAssetId?
              <button type="button" className="btn-secondary" disabled={busy} aria-label={"View receipt for "+row.occurredOn}
                onClick={()=>void showReceipt(row.id)}><FileImage size={16}/> Proof</button>:"—"}</td>
            <td className="py-3"><Link href="/app/approvals" className="text-indigo-600 underline">Approvals</Link></td>
          </tr>)}</tbody></table></div>}
    </Card>
  </div>;
}
