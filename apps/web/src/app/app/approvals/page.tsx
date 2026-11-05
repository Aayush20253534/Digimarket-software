"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Check, Clock3, RefreshCw, ShieldCheck, X, Search } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";
import {OperationsWorkspaceNav} from "@/components/operations-workspace-nav";

type Category = "GENERAL" | "FINANCE" | "CONTENT" | "DELIVERABLE";
type Outcome = "APPROVED" | "REJECTED" | "CANCELLED";
type Policy = { id:string; category:Category; name:string; active:boolean; approverRoleKeys:string[] };
type Approval = {
  id:string; title:string; description:string; status:"PENDING"|Outcome;
  requesterId:string; createdAt:string; approverRoleKeys:string[];
  policy:{category:Category;name:string}; requester:{displayName:string};
  decision:null|{outcome:Outcome;reason:string|null;createdAt:string;actor:{displayName:string}};
};
const categories:Category[]=["GENERAL","FINANCE","CONTENT","DELIVERABLE"];
const errorText=(error:unknown)=>error instanceof ApiError?error.message:"The operation failed.";

export default function ApprovalsPage() {
  const {session,request}=useAuth();
  const [view,setView]=useState<"mine"|"queue"|"history">("mine");
  const fetchSequence=useRef(0);
  useEffect(()=>{
   // Deep links to the approval queue must respect the user's existing rights,
   // not merely the URL. The API enforces access independently.
   const requested=new URLSearchParams(window.location.search).get("view");
   if(requested==="mine")setView("mine");
   if(requested==="queue"||requested==="history")
    setView(session?.identity.permissions.includes("approvals.decide")?requested:"mine");
  },[session?.identity.permissions]);
  const [items,setItems]=useState<Approval[]>([]);
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [category,setCategory]=useState<Category>("GENERAL");
  const [title,setTitle]=useState("");
  const [description,setDescription]=useState("");
  const [policyCategory,setPolicyCategory]=useState<Category>("GENERAL");
  const [policyName,setPolicyName]=useState("General approvals");
  const [policyRoles,setPolicyRoles]=useState<string[]>(["SUPER_ADMIN","ADMIN"]);
  const [policyActive,setPolicyActive]=useState(true);
  const [reasonById,setReasonById]=useState<Record<string,string>>({});
  const [query,setQuery]=useState("");
  const [categoryFilter,setCategoryFilter]=useState<""|Category>("");
  const canRead=!!session?.identity.permissions.includes("approvals.read");
  const canSubmit=!!session?.identity.permissions.includes("approvals.submit");
  const canDecide=!!session?.identity.permissions.includes("approvals.decide");
  const canManage=!!session?.identity.permissions.includes("approvals.policy.manage");

  const reload=useCallback(async ()=>{
    if(!canRead){setLoading(false);return;}
    const active=++fetchSequence.current;
    setLoading(true);
    try {
      const [requests,rules]=await Promise.all([
        request<Approval[]>("/approvals?view="+(view!=="mine"&&canDecide?view:"mine")),
        request<Policy[]>("/approval-policies"),
      ]);
      if(active!==fetchSequence.current)return;
      setItems(requests);setPolicies(rules);setError("");
    }catch(e){if(active===fetchSequence.current)setError(errorText(e));}
    finally{if(active===fetchSequence.current)setLoading(false);}
  },[request,view,canRead,canDecide]);
  useEffect(()=>{void reload();},[reload]);
  useEffect(()=>{
    if(policies.length && !policies.some(p=>p.active && p.category===category)) {
      setCategory(policies.find(p=>p.active)?.category??"GENERAL");
    }
  },[policies,category]);

  async function submit(e:FormEvent) {
    e.preventDefault();setError("");setSuccess("");setBusy(true);
    try {
      await request("/approvals",{method:"POST",body:{category,title:title.trim(),description:description.trim()}});
      setTitle("");setDescription("");setSuccess("Approval request submitted.");
      await reload();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  async function resolve(item:Approval,outcome:"APPROVED"|"REJECTED"|"CANCELLED") {
    const reason=reasonById[item.id]?.trim();
    if(outcome==="REJECTED"&&!reason){setError("Rejection requires a reason.");return;}
    if(!window.confirm((outcome==="CANCELLED"?"Cancel":outcome==="APPROVED"?"Approve":"Reject")+" this request?"))return;
    setBusy(true);setError("");setSuccess("");
    try {
      await request("/approvals/"+item.id+(outcome==="CANCELLED"?"/cancel":"/decision"),{
        method:"POST",...(outcome==="CANCELLED"?{}:{body:{outcome,...(reason?{reason}:{})}}),
      });
      setSuccess("Request "+outcome.toLowerCase()+".");await reload();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  async function savePolicy(e:FormEvent) {
    e.preventDefault();setBusy(true);setError("");setSuccess("");
    try {
      await request("/approval-policies/"+policyCategory,{
        method:"PUT",body:{name:policyName.trim(),active:policyActive,approverRoleKeys:policyRoles},
      });
      setSuccess("Routing policy saved. Existing requests keep their original approver roles.");
      await reload();
    }catch(e){setError(errorText(e));}finally{setBusy(false);}
  }
  function changePolicy(category:Category){
    const selected=policies.find(p=>p.category===category);
    setPolicyCategory(category);setPolicyName(selected?.name??category+" approvals");
    setPolicyRoles(selected?.approverRoleKeys??["SUPER_ADMIN","ADMIN"]);
    setPolicyActive(selected?.active??true);
  }
  useEffect(()=>{
   const id=new URLSearchParams(window.location.search).get("focus");
   if(!id||!items.some(x=>x.id===id))return;
   const frame=window.requestAnimationFrame(()=>{
    const node=document.getElementById("approval-"+id);node?.classList.add("aw-register-selected");node?.scrollIntoView({block:"center",behavior:"smooth"});
   });
   return()=>window.cancelAnimationFrame(frame);
  },[items]);
  if(!session)return <Spinner label="Loading your permissions…" />;
  if(!canRead)return <div className="space-y-4"><PageHeader title="Access denied" description="Approval requests are restricted."/><Notice kind="error">Your role cannot view approvals.</Notice></div>;
  // Counts represent the current API response/view, never organization-wide totals.
  const approvalCounts={
   total:items.length,
   pending:items.filter(x=>x.status==="PENDING").length,
   approved:items.filter(x=>x.status==="APPROVED").length,
   rejected:items.filter(x=>x.status==="REJECTED").length,
   cancelled:items.filter(x=>x.status==="CANCELLED").length,
  };
  const filteredItems=items.filter(item=>
   (!categoryFilter||item.policy.category===categoryFilter)&&
   (!query.trim()||[item.title,item.description,item.requester.displayName,item.policy.name]
    .some(value=>value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))));
  const selectView=(next:"mine"|"queue"|"history")=>{
   if(next!=="mine"&&!canDecide)return;
   setView(next);setQuery("");setCategoryFilter("");
   const url=new URL(window.location.href);
   url.searchParams.set("view",next);url.searchParams.delete("focus");
   window.history.replaceState(null,"",url.pathname+url.search+url.hash);
  };
  const activePolicies=policies.filter(p=>p.active);
  return <div data-aw-module="approvals" className="aw-module-root space-y-7">
    <OperationsWorkspaceNav/>
    <PageHeader eyebrow="Operations" title="Approval workflows"
      description="Submit requests, review pending decisions and inspect recorded outcomes. Approving a finance request posts its associated financial entry."
      actions={<button className="btn-secondary" onClick={()=>void reload()} disabled={loading||busy}><RefreshCw className="h-4 w-4"/>Refresh</button>}/>
    <section className="aw-v4-approval-summary" aria-label="Approval counts in current view">
     {([["In this view",approvalCounts.total],["Pending",approvalCounts.pending],
      ["Approved",approvalCounts.approved],["Rejected",approvalCounts.rejected],
      ["Cancelled",approvalCounts.cancelled]] as const).map(([label,count])=>
       <div key={label} className="aw-v4-summary-stat"><span>{label}</span><strong>{loading?"…":count}</strong></div>)}
    </section>
    {!loading&&<div className="aw-module-meta"><span className="aw-module-pill">Review workflows</span><span className="aw-module-count">{items.length} on this page</span><span className="aw-module-pill aw-module-pill-muted">{view==="mine"?"My requests":view==="queue"?"Decision queue":"Decision history"}</span></div>}
    {error&&<Notice kind="error">{error}</Notice>}
    {success&&<Notice kind="success">{success}</Notice>}
    {canSubmit&&<Card title="New approval request" description="An active category policy is required before requests can be submitted.">
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormField id="approval-category" label="Category">
          <select id="approval-category" className="field" aria-label="Approval category"
  value={activePolicies.some(p=>p.category===category)?category:""} disabled={!activePolicies.length}
  onChange={e=>setCategory(e.target.value as Category)}>
  <option value="" disabled>{activePolicies.length?"Choose a category":"No active approval categories"}</option>
  {activePolicies.map(p=><option key={p.id} value={p.category}>{p.name} ({p.category})</option>)}
 </select>
        </FormField>
        <FormField id="approval-title" label="Title">
          <input id="approval-title" className="field" minLength={4} maxLength={180} required value={title} onChange={e=>setTitle(e.target.value)}/>
        </FormField>
        <div className="sm:col-span-2"><FormField id="approval-description" label="Description">
          <textarea id="approval-description" className="field min-h-24" minLength={5} maxLength={4000} required value={description} onChange={e=>setDescription(e.target.value)}/>
        </FormField></div>
        <div className="sm:col-span-2"><button className="btn-primary" type="submit" disabled={busy||!activePolicies.some(p=>p.category===category)}>Submit request</button>
          {!activePolicies.length&&<p className="mt-2 text-xs text-amber-700">No active policy. An administrator must configure approval routing first.</p>}</div>
      </form>
    </Card>}
    <div className="aw-v4-approval-view flex gap-2" role="group" aria-label="Approval view">
      <button className={view==="mine"?"btn-primary":"btn-secondary"} onClick={()=>selectView("mine")}>My requests</button>
      {canDecide&&<><button className={view==="queue"?"btn-primary":"btn-secondary"} onClick={()=>selectView("queue")}>Decision queue</button><button className={view==="history"?"btn-primary":"btn-secondary"} onClick={()=>selectView("history")}>Decision history</button></>}
    </div>
    <Card title={view==="mine"?"My approval requests":view==="queue"?"Requests awaiting my decision":"My past decisions"}>
      <div className="aw-v4-approval-tools">
       <label className="aw-v4-search"><Search size={16} aria-hidden="true"/>
        <span className="sr-only">Search approvals in this view</span>
        <input type="search" aria-label="Search approvals in this view" value={query}
         onChange={e=>setQuery(e.target.value)} placeholder="Search request, requester or policy"/></label>
       <select className="field" aria-label="Filter approval category" value={categoryFilter}
        onChange={e=>setCategoryFilter(e.target.value as ""|Category)}>
        <option value="">All categories</option>
        {categories.map(value=><option key={value} value={value}>{value}</option>)}
       </select>
      </div>
      {!loading&&(query||categoryFilter)&&<p className="aw-v4-scope-note" aria-live="polite">
       Showing {filteredItems.length} of {items.length} loaded requests in this view.
      </p>}
      {loading?<Spinner label="Loading approval records…"/>:filteredItems.length===0?
        <EmptyState icon={Clock3} title={(query||categoryFilter)?"No matching requests":"No requests here"}
          description={(query||categoryFilter)?"Clear your search or category filter to see all requests in this view.":view==="mine"?"Your submitted requests will appear here.":view==="queue"?"No pending requests match your approver roles.":"No approved, rejected or cancelled decisions yet."}/>:
        <div className="aw-v4-approval-list space-y-4">{filteredItems.map(item=><article key={item.id} id={"approval-"+item.id} className="aw-approval-row aw-v4-approval-card rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-slate-500">{item.policy.name} · {item.requester.displayName} · {new Date(item.createdAt).toLocaleString()}</p>
            <h3 className="mt-1 font-semibold">{item.title}</h3></div>
            <span className={"aw-v4-approval-status aw-v4-status-"+item.status.toLowerCase()}>{item.status}</span></div>
          <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{item.description}</p>
          {item.decision&&<p className="mt-3 border-t pt-3 text-xs text-slate-600">
            {item.decision.outcome} by {item.decision.actor.displayName}
            {item.decision.reason?" · "+item.decision.reason:""}</p>}
          {item.status==="PENDING"&&<div className="aw-v4-approval-actions mt-4 flex flex-wrap items-end gap-2">
            {view==="mine"||!canDecide?<button className="btn-secondary" disabled={busy} onClick={()=>void resolve(item,"CANCELLED")}>
              <X className="h-4 w-4"/>Cancel request</button>:<>
              <button className="btn-primary" disabled={busy} onClick={()=>void resolve(item,"APPROVED")}><Check className="h-4 w-4"/>Approve</button>
              <input className="field max-w-sm" aria-label={"Reason to reject "+item.title} placeholder="Reason required for rejection" maxLength={1000}
                value={reasonById[item.id]??""} onChange={e=>setReasonById(v=>({...v,[item.id]:e.target.value}))}/>
              <button className="btn-secondary" disabled={busy} onClick={()=>void resolve(item,"REJECTED")}>Reject</button>
            </>}</div>}
        </article>)}</div>}
    </Card>
    {canManage&&<Card title="Approval policy configuration" description="Only authorized leadership roles can decide. Changes affect new submissions, not requests already pending.">
      <form onSubmit={savePolicy} className="grid gap-4 sm:grid-cols-2">
        <FormField id="policy-category" label="Category"><select id="policy-category" className="field" value={policyCategory}
          onChange={e=>changePolicy(e.target.value as Category)}>{categories.map(c=><option key={c} value={c}>{c}</option>)}</select></FormField>
        <FormField id="policy-name" label="Policy name"><input id="policy-name" className="field" minLength={2} maxLength={160} value={policyName} onChange={e=>setPolicyName(e.target.value)} required/></FormField>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">Eligible approver roles</legend>
          {["SUPER_ADMIN","ADMIN","FOUNDER"].map(r=><label className="flex items-center gap-2 text-sm" key={r}>
            <input type="checkbox" checked={policyRoles.includes(r)} onChange={e=>setPolicyRoles(v=>e.target.checked?[...v,r]:v.filter(x=>x!==r))}/>{r}</label>)}</fieldset>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policyActive} onChange={e=>setPolicyActive(e.target.checked)}/>Accept new requests</label>
        <div className="sm:col-span-2"><button type="submit" className="btn-primary" disabled={busy||!policyRoles.length}><ShieldCheck className="h-4 w-4"/>Save policy</button></div>
      </form>
    </Card>}
  </div>;
}
