"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, FileImage, Plus, RefreshCw, Wallet } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";

type Kind="INCOME"|"EXPENSE";
type View="mine"|"all";
type Category={id:string;kind:Kind;name:string;active:boolean};
type Assignee={id:string;displayName:string;loginId:string};
type Entry={id:string;kind:Kind;status:"PENDING"|"POSTED"|"REJECTED"|"CANCELLED";
  amount:string;currencyCode:string;occurredOn:string;method:string;description:string|null;
  merchantOrSource:string|null;createdAt:string;approvalRequestId:string;
  receiptAssetId?:string|null;enteredById:string;category:{id:string;name:string;active:boolean};
  enteredBy:{displayName:string;loginId:string};submittedBy:{displayName:string}};
type Totals={currency:string;postedIncome:string;postedExpense:string;postedNet:string;
  pendingIncome:string;pendingExpense:string;groups:{kind:Kind;status:string;amount:string;count:number}[]};
type FinancePolicy={category:string;active:boolean};
const zero:Totals={currency:"INR",postedIncome:"0.0000",postedExpense:"0.0000",postedNet:"0.0000",
  pendingIncome:"0.0000",pendingExpense:"0.0000",groups:[]};
const modes=["CASH","UPI","BANK_TRANSFER","CARD","OTHER"] as const;
function money(value:string){
  const negative=value.startsWith("-"),raw=negative?value.slice(1):value;
  const [whole,fraction=""]=raw.split(".");
  const digits=fraction.padEnd(3,"0");
  const cents=BigInt(whole||"0")*100n+BigInt(digits.slice(0,2))+(digits.charCodeAt(2)>=53?1n:0n);
  const integer=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",");
  return (negative?"−":"")+"₹"+integer+"."+(cents%100n).toString().padStart(2,"0");
}
function readable(error:unknown){return error instanceof ApiError?error.message:"Could not complete the finance operation.";}
export default function FinancePage(){
  const {session,request}=useAuth();
  const canAll=!!session?.identity.permissions.includes("finance.read.all");
  const canManage=!!session?.identity.permissions.includes("finance.category.manage");
  const adminFinance=!!session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&canManage;
  const canCreate=!!session?.identity.permissions.includes("finance.entry.create");
  const canReadOwn=!!session?.identity.permissions.includes("finance.entry.read.own");
  const [view,setView]=useState<View>("mine");
  useEffect(()=>{if(canAll)setView("all");},[canAll]);
  const [editingCategory,setEditingCategory]=useState<Category|null>(null);
  const [editedCategoryName,setEditedCategoryName]=useState("");
  const [editingExpense,setEditingExpense]=useState<Entry|null>(null);
  const [expenseEdit,setExpenseEdit]=useState({categoryId:"",amount:"",occurredOn:"",method:"UPI",
    merchantOrSource:"",description:"",enteredById:""});
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [assigneesError,setAssigneesError]=useState("");
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
      const [ledger,sums]=await Promise.all([
        request<Entry[]>("/finance/entries?view="+target),
        request<Totals>("/finance/summary?view="+target),
      ]);
      setEntries(ledger);setTotals(sums);
      // A failed policy request must not blank the financial register.
      const [cats,policies]=await Promise.allSettled([
        request<Category[]>("/finance/categories"),
        request<FinancePolicy[]>("/approval-policies"),
      ]);
      if(cats.status==="fulfilled")setCategories(cats.value);
      if(policies.status==="fulfilled")setFinanceReady(policies.value.some(p=>p.category==="FINANCE"&&p.active));
      setError("");
    }catch(e){setError(readable(e));}finally{setLoading(false);}
  },[request,view,canReadOwn,canAll]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    if(!adminFinance)return;
    let active=true;
    void request<Assignee[]>("/finance/assignees").then(users=>{
      if(active){setAssignees(users);setAssigneesError("");}
    }).catch(e=>{
      if(active)setAssigneesError(readable(e));
    });
    return()=>{active=false;};
  },[adminFinance,request]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("focus");
    if(!id||!entries.some(entry=>entry.id===id))return;
    const frame=window.requestAnimationFrame(()=>{const row=document.getElementById("finance-"+id);row?.classList.add("aw-register-selected");row?.scrollIntoView({block:"center",behavior:"smooth"});});
    return ()=>window.cancelAnimationFrame(frame);
  },[entries]);

  async function submit(e:FormEvent){
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try{
      let receiptAssetId:string|null=null;
      if(receipt){
       if(!["image/jpeg","image/png","image/gif","image/webp","image/avif","image/bmp","image/tiff","image/heic","image/heif","application/pdf"].includes(receipt.type))throw new Error("Receipt must be an image or PDF.");
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
  async function saveCategoryEdit(e:FormEvent){
    e.preventDefault();if(!editingCategory)return;
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/categories/"+editingCategory.id,{method:"PUT",body:{name:editedCategoryName}});
      setEditingCategory(null);setSuccess("Category renamed. Historical entries remain linked.");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function deleteCategory(c:Category){
    if(!window.confirm("Delete "+c.name+"? Categories already used in finance or payments will be archived to preserve historical records."))return;
    setBusy(true);setError("");setSuccess("");
    try{
      const result=await request<{archived:boolean}>("/finance/categories/"+c.id,{method:"DELETE"});
      setSuccess(result.archived?"Category archived because financial history references it.":"Unused category permanently deleted.");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  function beginExpenseEdit(row:Entry){
    setEditingExpense(row);setError("");
    setExpenseEdit({categoryId:row.category.id,
      amount:row.amount,occurredOn:row.occurredOn,method:row.method,
      merchantOrSource:row.merchantOrSource??"",description:row.description??"",
      enteredById:row.enteredById});
  }
  async function saveExpense(e:FormEvent){
    e.preventDefault();if(!editingExpense)return;
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/entries/"+editingExpense.id,{method:"PUT",body:expenseEdit});
      setEditingExpense(null);setSuccess("Expense updated and assigned user saved with an audit record.");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function deleteExpense(row:Entry){
    if(!window.confirm("Cancel "+money(row.amount)+" recorded by "+row.enteredBy.displayName+"? This action excludes the expense from totals, preserves its audit trail and cannot be undone."))return;
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/entries/"+row.id,{method:"DELETE"});
      setSuccess("Expense cancelled and excluded from finance totals. The audit record remains.");
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
  if(!canReadOwn&&!canAll)return <><PageHeader title="Finance access denied" description="No financial permissions were assigned to your account."/><Notice kind="error">Contact an administrator for access.</Notice></>;
  return <div className="space-y-7">
    <PageHeader eyebrow="Financial operations" title="Income & expenses"
      description="All financial records are submitted for approval. Only posted entries count towards net income."
      actions={<div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button" disabled={busy} onClick={()=>void exportCsv()}><Download className="h-4 w-4"/>Export CSV</button>
        <button className="btn-secondary" type="button" disabled={loading} onClick={()=>void reload()}><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>}/>
    {error&&<Notice kind="error">{error}</Notice>}{success&&<Notice kind="success">{success}</Notice>}
    <div className="flex gap-2" role="group" aria-label="Finance visibility">
      <button className={view==="mine"?"btn-primary":"btn-secondary"} onClick={()=>setView("mine")}>My entries</button>
      {canAll&&<button className={view==="all"?"btn-primary":"btn-secondary"} onClick={()=>setView("all")}>Agency totals & register</button>}
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
    {!loading&&!financeReady&&<div className="aw-finance-policy-warning" role="status">
    <span aria-hidden="true">i</span><p>Finance approvals are not active yet. An administrator can enable the FINANCE policy in <Link className="font-bold underline" href="/app/approvals">Approval workflows</Link>.</p>
   </div>}
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
               accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp,image/tiff,image/heic,image/heif,application/pdf,.jpg,.jfif,.jpeg,.gif,.png,.tif,.tiff"
               onChange={e=>setReceipt(e.target.files?.[0]??null)}/>
            </FormField>
            {receipt&&<p className="mt-1 text-xs">{receipt.name} · {(receipt.size/1024/1024).toFixed(2)} MB</p>}
            {uploadStatus&&<p role="status" className="mt-2 text-sm">{uploadStatus}</p>}
          </div>
          <div className="sm:col-span-2"><button className="btn-primary" type="submit" disabled={busy||loading||!categoryId||!financeReady} title={!financeReady?"Finance approvals are currently disabled. See the notice above.":undefined}>
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
          {canManage&&<div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={()=>void toggleCategory(c)} disabled={busy}>{c.active?"Disable":"Enable"}</button>
            {adminFinance&&<><button type="button" className="btn-secondary text-xs" onClick={()=>{setEditingCategory(c);setEditedCategoryName(c.name);}} disabled={busy}>Edit</button>
            <button type="button" className="btn-secondary text-xs" onClick={()=>void deleteCategory(c)} disabled={busy}>Delete</button></>}
          </div>}
        </div>):<EmptyState title="No categories yet" description="An administrator can add expense and income categories." icon={Wallet}/>}</div>
      </Card>
    </div>
    <Card title={view==="all"?"Agency financial register":"My financial register"} description="Saved records, including pending, posted, rejected and cancelled entries. Latest 200 shown; CSV export includes up to 5,000.">
      {loading?<Spinner label="Loading financial entries…"/>:!entries.length?<EmptyState title="No entries yet" description="Submitted income and expense records appear here after entry."/>:
        <div className="aw-finance-register-scroll" role="region" aria-label="Financial register" tabIndex={0}><table className="aw-finance-register">
          <thead><tr className="border-b text-xs uppercase text-slate-500">
            {["Date","Type","Category","Source","Amount","Status","Assigned to","Receipt","Approval"].map(x=><th key={x} className="pb-3 pr-4">{x}</th>)}
          </tr></thead><tbody>{entries.map(row=><tr key={row.id} id={"finance-"+row.id}>
            <td className="py-3 pr-4">{row.occurredOn}</td>
            <td><span className={"aw-finance-kind "+(row.kind==="INCOME"?"income":"expense")}>{row.kind==="INCOME"?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>} {row.kind==="INCOME"?"Income":"Expense"}</span></td>
            <td className="py-3 pr-4">{row.category.name}</td>
            <td className="py-3 pr-4">{row.merchantOrSource||"—"}</td>
            <td className={"aw-finance-amount "+(row.kind==="INCOME"?"income":"expense")}>{money(row.amount)}</td>
            <td><span className={"aw-finance-status status-"+row.status.toLowerCase()}>{row.status}</span></td>
            <td className="py-3 pr-4"><strong>{row.enteredBy.displayName}</strong>
              {row.submittedBy&&row.submittedBy.displayName!==row.enteredBy.displayName&&
               <span className="aw-finance-original-submitter">Submitted by {row.submittedBy.displayName}</span>}</td>
            <td className="py-3">{row.receiptAssetId?
              <button type="button" className="btn-secondary" disabled={busy} aria-label={"View receipt for "+row.occurredOn}
                onClick={()=>void showReceipt(row.id)}><FileImage size={16}/> Proof</button>:"—"}</td>
            <td className="py-3"><div className="flex items-center gap-2">
              <Link href={"/app/approvals?focus="+encodeURIComponent(row.approvalRequestId)} className="aw-finance-approval-link">View approval</Link>
              {adminFinance&&row.kind==="EXPENSE"&&row.status!=="CANCELLED"&&<>
                <button type="button" className="btn-secondary text-xs" disabled={busy}
                  onClick={()=>beginExpenseEdit(row)} aria-label={"Edit expense "+row.id}>Edit</button>
                <button type="button" className="btn-secondary text-xs" disabled={busy}
                  onClick={()=>void deleteExpense(row)} aria-label={"Delete expense "+row.id}>Delete</button>
              </>}
            </div></td>
          </tr>)}</tbody></table></div>}
    </Card>
    {adminFinance&&editingCategory&&<div className="aw-finance-admin-overlay" role="presentation">
      <div className="aw-finance-admin-modal" role="dialog" aria-modal="true" aria-label="Edit finance category">
        <h2>Edit category</h2><p>Rename this category without modifying historical transactions.</p>
        <form onSubmit={e=>void saveCategoryEdit(e)}>
          <FormField id="finance-edit-category-name" label="Category name">
            <input id="finance-edit-category-name" autoFocus className="field" required minLength={2} maxLength={120}
              value={editedCategoryName} onChange={e=>setEditedCategoryName(e.target.value)}/></FormField>
          <div className="aw-finance-admin-actions"><button type="button" className="btn-secondary" onClick={()=>setEditingCategory(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy}>Save changes</button></div>
        </form>
      </div>
    </div>}
    {adminFinance&&editingExpense&&<div className="aw-finance-admin-overlay" role="presentation">
      <div className="aw-finance-admin-modal" role="dialog" aria-modal="true" aria-label="Edit expense">
        <h2>Edit expense</h2><p>Originally submitted by {editingExpense.submittedBy?.displayName??editingExpense.enteredBy.displayName}.
          You can edit or assign this expense to any active member of the company. The original approval requester remains recorded.</p>
        {assigneesError&&<Notice kind="error">{assigneesError}</Notice>}
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>void saveExpense(e)}>
          <FormField id="admin-expense-category" label="Expense category"><select id="admin-expense-category" className="field" required value={expenseEdit.categoryId}
            onChange={e=>setExpenseEdit(v=>({...v,categoryId:e.target.value}))}>
            {categories.filter(c=>c.kind==="EXPENSE"&&(c.active||c.id===editingExpense.category.id)).map(c=>
              <option key={c.id} value={c.id}>{c.name}{!c.active?" (archived)":""}</option>)}
          </select></FormField>
          <FormField id="admin-expense-assignee" label="Assign expense to">
            <select id="admin-expense-assignee" className="field" required value={expenseEdit.enteredById}
              onChange={e=>setExpenseEdit(v=>({...v,enteredById:e.target.value}))}>
              {!assignees.some(user=>user.id===editingExpense.enteredById)&&
                <option value={editingExpense.enteredById}>{editingExpense.enteredBy.displayName} (current)</option>}
              {assignees.map(user=><option key={user.id} value={user.id}>{user.displayName} ({user.loginId})</option>)}
            </select>
          </FormField>
          <FormField id="admin-expense-amount" label="Amount (INR)"><input id="admin-expense-amount" className="field" inputMode="decimal" required
            pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" value={expenseEdit.amount}
            onChange={e=>setExpenseEdit(v=>({...v,amount:e.target.value}))}/></FormField>
          <FormField id="admin-expense-date" label="Date"><input id="admin-expense-date" type="date" className="field" required
            value={expenseEdit.occurredOn} onChange={e=>setExpenseEdit(v=>({...v,occurredOn:e.target.value}))}/></FormField>
          <FormField id="admin-expense-method" label="Payment method"><select id="admin-expense-method" className="field" value={expenseEdit.method}
            onChange={e=>setExpenseEdit(v=>({...v,method:e.target.value}))}>{modes.map(m=><option key={m} value={m}>{m}</option>)}</select></FormField>
          <div className="sm:col-span-2"><FormField id="admin-expense-payee" label="Merchant / payee">
            <input id="admin-expense-payee" className="field" maxLength={160} value={expenseEdit.merchantOrSource}
              onChange={e=>setExpenseEdit(v=>({...v,merchantOrSource:e.target.value}))}/></FormField></div>
          <div className="sm:col-span-2"><FormField id="admin-expense-desc" label="Notes"><textarea id="admin-expense-desc" className="field" maxLength={2000}
              value={expenseEdit.description} onChange={e=>setExpenseEdit(v=>({...v,description:e.target.value}))}/></FormField></div>
          <div className="sm:col-span-2 aw-finance-admin-actions"><button type="button" className="btn-secondary" onClick={()=>setEditingExpense(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy||!expenseEdit.categoryId||!expenseEdit.enteredById}>Save expense</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
