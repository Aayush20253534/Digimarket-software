"use client";
import {agencyToday,cycleLabel} from "@digimarket/contracts";
import {BusinessPeriodPicker} from "@/components/business-period-picker";
import {FinancePager,useFinanceWindow,useFinanceContext} from "./shared";
import {ReversalButton} from "./reversal";
import {PreviousCycleNetPosted} from "./previous-cycle-carry";
import {PersonalNetAfterSettlements} from "./personal-net-after-settlements";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Download, FileImage, Plus, RefreshCw, Wallet, Search, Scale } from "lucide-react";
import {BusinessWorkspaceNav} from "@/components/business-workspace-nav";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner } from "@/components/ui";
import { ApiError } from "@/lib/api";

type Kind="INCOME"|"EXPENSE";
type Category={id:string;kind:Kind;name:string;active:boolean;purpose?:"GENERAL"|"META_ADS"|"SALARY"};
type Assignee={id:string;displayName:string;loginId:string};
type MetaBucket={posted:string;pending:string;total:string;excluded:string;count:number;excludedCount:number};
type MetaCategory=MetaBucket&{clientId:string|null;name:string};
type MetaPeriod=MetaBucket&{date:string;selfPosted:string;selfPending:string;clientPosted:string;
  clientPending:string;categories:MetaCategory[]};
type MetaPerson=MetaBucket&{userId:string;name:string;categories:MetaCategory[]};
type MetaDistribution={view:"mine"|"all";from:string|null;to:string|null;
  totalPosted:string;totalPending:string;total:string;excludedAmount:string;excludedCount:number;
  transactionCount:number;selfPosted:string;selfPending:string;clientPosted:string;clientPending:string;
  categories:MetaCategory[];individuals:MetaPerson[];daily:MetaPeriod[];monthly:MetaPeriod[]};
type MetaAdClient={id:string;businessName:string};
type Entry={id:string;kind:Kind;status:"PENDING"|"POSTED"|"REJECTED"|"CANCELLED";
  amount:string;currencyCode:string;occurredOn:string;method:string;description:string|null;
  merchantOrSource:string|null;createdAt:string;approvalRequestId:string|null;
  reversesId?:string|null;reversedBy?:string|null;
  sourceType?:"FINANCE"|"SALARY"|"SETTLEMENT";salaryPaymentId?:string;salaryMonth?:string;
  settlementId?:string;settlementDirection?:"OUTGOING"|"INCOMING";
  receiptAssetId?:string|null;enteredById:string;clientId:string|null;client:MetaAdClient|null;
  category:{id:string;name:string;active:boolean;purpose?:"GENERAL"|"META_ADS"|"SALARY"};
  enteredBy:{displayName:string;loginId:string};submittedBy:{displayName:string}};
type Totals={agencyOperatingNet?:string;currency:string;postedIncome:string;postedExpense:string;postedNet:string;
  postedNetBeforeSalary?:string;postedSalaryExpense?:string;postedExpenseIncludingSalary?:string;
  postedExpenseBeforeSettlement?:string;receivedInternalSettlement?:string;
  personalSettlementResetAt?:string|null;
  pendingIncome:string;pendingExpense:string;groups:{kind:Kind;status:string;amount:string;count:number}[];
  clientAdSpend?:{posted:string;pending:string;count:number};recurringIncome?:RecurringIncome};
type AgencySettlementRow={
  id:string;occurredOn:string;senderName:string;recipientName:string;
  amount:string;method:string;status:"POSTED"|"CANCELLED";
  note:string|null;voidReason:string|null
};
type AgencySettlementPage={
  items:AgencySettlementRow[];total:number;page:number;limit:number;
  postedTotal:string;postedCount:number;voidedCount:number;
};
type FinancePolicy={category:string;active:boolean};
type SalaryFinanceSummary={totalPaid:string;founderFunding:{founderUserId:string;name:string;amount:string}[]};
type RecurringIncome={month:string;from?:string;to?:string;monthlyServiceTotal:string;monthlyAdBudgetTotal:string;monthlyCombinedTotal:string;items:{id:string;businessName:string;monthlyServiceCharge:string;monthlyAdBudget:string;monthlyCombined:string;contractEndOn:string|null}[]};
const zero:Totals={currency:"INR",postedIncome:"0.0000",postedExpense:"0.0000",postedNet:"0.0000",
  pendingIncome:"0.0000",pendingExpense:"0.0000",groups:[]};
const modes=["CASH","UPI","BANK_TRANSFER","CARD","OTHER"] as const;
const SALARY_OPTION="__salary_workflow__";
const isSalaryCategory=(name:string)=>/^salary$/i.test(name.trim());
const isMetaAdsCategory=(category:{name:string;purpose?:string}|undefined)=>category?.purpose?category.purpose==="META_ADS":/^meta[\s_-]*(?:ads?|advertising|advertisements?)$/i.test(category?.name.trim()??"");
function money(value:string|number|null|undefined){
  // API snapshots and historical rows can lack optional financial fields.
  // An absent value must never crash the entire ledger or masquerade as ₹0.
  if(value===null||value===undefined)return "Unavailable";
  const text=String(value);
  if(!/^-?\d+(?:\.\d{1,4})?$/.test(text))return "Unavailable";
  const negative=text.startsWith("-"),raw=negative?text.slice(1):text;
  const [whole,fraction=""]=raw.split(".");
  const digits=fraction.padEnd(3,"0");
  const cents=BigInt(whole||"0")*100n+BigInt(digits.slice(0,2))+(digits.charCodeAt(2)>=53?1n:0n);
  const integer=(cents/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,",");
  return (negative?"−":"")+"₹"+integer+"."+(cents%100n).toString().padStart(2,"0");
}
function readable(error:unknown){return error instanceof ApiError?error.message:"Could not complete the finance operation.";}
export function FinanceSectionWorkspace({section,categoryType="EXPENSE",directExpense=false,quickKind,registerOnly=false,onExpenseSaved}:{section:"entries"|"ads"|"categories"|"settlements"|"agreements";categoryType?:Kind;directExpense?:boolean;quickKind?:Kind;registerOnly?:boolean;onExpenseSaved?:()=>void}){
  const context=useFinanceContext();
  const compact=!!quickKind;
  const formOnly=directExpense||compact;
  const windowState=useFinanceWindow({syncUrl:section!=="categories"});
  const {period,setPeriod,view,setView,ready}=windowState;
  const [page,setPage]=useState(1),[total,setTotal]=useState(0),[categoryFilter,setCategoryFilter]=useState("");
  const [categoryPurpose,setCategoryPurpose]=useState<"GENERAL"|"META_ADS">("GENERAL");
  const forms=section==="entries"||section==="ads";
  const {session,request}=useAuth();
  const isFounder=!!session?.identity.roles.includes("FOUNDER");
  const canAll=!!session?.identity.permissions.includes("finance.read.all");
  const canManage=!!session?.identity.permissions.includes("finance.category.manage");
  const adminFinance=!!session?.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN")&&canManage;
  const canCreate=!!session?.identity.permissions.includes("finance.entry.create");
  const canReadOwn=!!session?.identity.permissions.includes("finance.entry.read.own");
  const [editingCategory,setEditingCategory]=useState<Category|null>(null);
  const [editedCategoryName,setEditedCategoryName]=useState("");
  const [editingEntry,setEditingEntry]=useState<Entry|null>(null);
  const [entryEdit,setEntryEdit]=useState({categoryId:"",amount:"",occurredOn:"",method:"UPI",
    merchantOrSource:"",description:"",enteredById:"",clientId:null as string|null});
  const [editAdFunding,setEditAdFunding]=useState<"SELF"|"CLIENT">("SELF");
  const [assignees,setAssignees]=useState<Assignee[]>([]);
  const [assigneesError,setAssigneesError]=useState("");
  const [categories,setCategories]=useState<Category[]>([]);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [metaAdEntries,setMetaAdEntries]=useState<Entry[]>([]);
  const [metaDistribution,setMetaDistribution]=useState<MetaDistribution|null>(null);
  const [metaDistributionLoading,setMetaDistributionLoading]=useState(true);
  const [metaDistributionRefresh,setMetaDistributionRefresh]=useState(0);
  const [metaPeriodMode,setMetaPeriodMode]=useState<"daily"|"monthly">("daily");
  const metaFrom=period.from,metaTo=period.to;
  const periodQuery=new URLSearchParams({from:period.from,to:period.to}).toString();
  const [metaDistributionError,setMetaDistributionError]=useState("");
  const [metaSearch,setMetaSearch]=useState("");
  const [metaFundingFilter,setMetaFundingFilter]=useState<"ALL"|"SELF"|"CLIENT">("ALL");
  const [entrySearch,setEntrySearch]=useState("");
  const [entryKindFilter,setEntryKindFilter]=useState<"ALL"|Kind>("ALL");
  const [entryStatusFilter,setEntryStatusFilter]=useState<"ALL"|Entry["status"]>("ALL");
  const [metaAdClients,setMetaAdClients]=useState<MetaAdClient[]>([]);
  const [metaAdClientsError,setMetaAdClientsError]=useState("");
  const [totals,setTotals]=useState<Totals>(zero);
  const [balance,setBalance]=useState<{opening:string;movement:string;remaining:string}|null>(null);
  const [summaryAvailable,setSummaryAvailable]=useState(false);
  const [financeReady,setFinanceReady]=useState(false);
  const [recurring,setRecurring]=useState<RecurringIncome|null>(null);
  const [salarySummary,setSalarySummary]=useState<SalaryFinanceSummary|null>(null);
  const [salaryError,setSalaryError]=useState("");
  const [loading,setLoading]=useState(true);
  const reloadSequence=useRef(0);
  const [hasLoadedEntries,setHasLoadedEntries]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [settlementHistory,setSettlementHistory]=useState<Entry[]>([]);
  const [settlementHistoryError,setSettlementHistoryError]=useState("");
  const [agencySettlementHistory,setAgencySettlementHistory]=useState<AgencySettlementPage|null>(null);
  const [agencySettlementPage,setAgencySettlementPage]=useState(1);
  const [agencySettlementLoading,setAgencySettlementLoading]=useState(false);
  const [agencySettlementError,setAgencySettlementError]=useState("");
  const [settlementPeers,setSettlementPeers]=useState<Assignee[]>([]);
  const [settlementPeer,setSettlementPeer]=useState("");
  const [settlementAmount,setSettlementAmount]=useState("");
  const [settlementDate,setSettlementDate]=useState(()=>agencyToday());
  const [settlementMethod,setSettlementMethod]=useState<(typeof modes)[number]>("UPI");
  const [settlementNote,setSettlementNote]=useState("");
  const [settlementKey,setSettlementKey]=useState(()=>crypto.randomUUID());
  const [settlementError,setSettlementError]=useState("");
  const [kind,setKind]=useState<Kind>(quickKind??"EXPENSE");
  const [categoryId,setCategoryId]=useState("");
  const [adFunding,setAdFunding]=useState<"SELF"|"CLIENT">("SELF");
  const [clientId,setClientId]=useState("");
  const [amount,setAmount]=useState("");
  const [occurredOn,setOccurredOn]=useState(()=>agencyToday());
  const [method,setMethod]=useState<(typeof modes)[number]>("UPI");
  const [source,setSource]=useState("");
  const [description,setDescription]=useState("");
  const [receipt,setReceipt]=useState<File|null>(null);
  const [uploadStatus,setUploadStatus]=useState("");
  const [entryKey,setEntryKey]=useState(()=>crypto.randomUUID());
  const [receiptKey,setReceiptKey]=useState(0);
  const [moreDetails,setMoreDetails]=useState(false);
  useEffect(()=>{if(quickKind){setKind(quickKind);setCategoryId("");setClientId("");setAdFunding("SELF");}},[quickKind]);
  useEffect(()=>{if(compact){try{const saved=localStorage.getItem("aw-finance-method");if(modes.includes(saved as typeof method))setMethod(saved as typeof method);}catch{/* optional preference */}}},[compact]);
  const categoryKind=categoryType;
  const managedCategories=categories.filter(c=>c.kind===categoryKind);
  const [categoryName,setCategoryName]=useState("");
  useEffect(()=>{setCategoryName("");setEditingCategory(null);setCategoryPurpose("GENERAL");setError("");setSuccess("");},[categoryKind]);
  const selected=useMemo(()=>categories.filter(c=>c.active&&c.kind===kind&&c.purpose!=="SALARY"&&!isSalaryCategory(c.name)&&(section!=="ads"||isMetaAdsCategory(c))),[categories,kind,section]);
  const salarySelected=kind==="EXPENSE"&&categoryId===SALARY_OPTION;
  const metaAdsSelected=kind==="EXPENSE"&&isMetaAdsCategory(categories.find(c=>c.id===categoryId));
  const filteredMetaAdEntries=metaAdEntries;
  const filteredEntries=entries;
  const agencyMetaAdCount=metaAdEntries.filter(row=>!row.clientId).length;
  const clientMetaAdCount=metaAdEntries.length-agencyMetaAdCount;
  useEffect(()=>{const query=new URLSearchParams(window.location.search);const filter=query.get("kind");if(!formOnly&&(filter==="INCOME"||filter==="EXPENSE")){setEntryKindFilter(filter);setKind(filter);}if(!formOnly)setCategoryFilter(query.get("categoryId")??"");},[formOnly]);
  useEffect(()=>setPage(1),[periodQuery,view,entrySearch,entryKindFilter,entryStatusFilter,metaSearch,metaFundingFilter,categoryFilter]);
  const registerParams=new URLSearchParams({from:period.from,to:period.to,view:view==="all"&&canAll?"all":"mine",scope:section==="ads"?"meta_ads":"agency",page:String(page),limit:"25",q:section==="ads"?metaSearch:entrySearch});
  if(section==="ads")registerParams.set("funding",metaFundingFilter);
  if(section==="entries"){
    if(entryKindFilter!=="ALL")registerParams.set("kind",entryKindFilter);
    if(entryStatusFilter!=="ALL")registerParams.set("status",entryStatusFilter);
    if(categoryFilter)registerParams.set("categoryId",categoryFilter);
  }
  const registerQuery=registerParams.toString();
  // Bar widths are visual comparisons only; displayed money uses the existing
  // exact decimal-string formatter and server-owned summary calculations.
  const founderSalaryRows=salarySummary?.founderFunding.filter(x=>view==="all"||x.founderUserId===session?.identity.userId)??[];
  const fundedSalaryExpense=Number(totals.postedSalaryExpense??"0");
  const fundedSalaryText=fundedSalaryExpense.toFixed(2);
  const postedIncomeValue=Number(totals.postedIncome);
  const postedExpenseValue=Number(totals.postedExpense);
  const postedMax=Math.max(1,Number.isFinite(postedIncomeValue)?Math.max(0,postedIncomeValue):0,
    Number.isFinite(postedExpenseValue)?Math.max(0,postedExpenseValue):0,
    Number.isFinite(fundedSalaryExpense)?Math.max(0,fundedSalaryExpense):0);
  // An entry must start without a selected category.
  useEffect(()=>{if(categoryId&&categoryId!==SALARY_OPTION&&!selected.some(c=>c.id===categoryId))setCategoryId("");},[selected,categoryId]);

  const reload=useCallback(async()=>{
    // Category management is independent of financial cycle resolution.
    if(!ready&&section!=="categories")return;
    const sequence=++reloadSequence.current;
    if(!canReadOwn&&!canAll){setLoading(false);return;}
    setLoading(true);setError("");
    const target=view==="all"&&canAll?"all":"mine";
    const [ledger,sums,cats,policies,settlements]=await Promise.allSettled([
      forms&&!formOnly?request<{items:Entry[];total:number}>("/finance/register?"+registerQuery):Promise.resolve({items:[],total:0}),
      !formOnly&&(section==="entries"||section==="agreements")?request<Totals>("/finance/summary?view="+(section==="agreements"?"all":target)+"&"+periodQuery):Promise.resolve(zero),
      forms||section==="categories"?request<Category[]>("/finance/categories"):Promise.resolve([] as Category[]),
      forms&&canCreate?request<FinancePolicy[]>("/approval-policies"):Promise.resolve([] as FinancePolicy[]),
      section==="settlements"&&view==="mine"&&isFounder&&canReadOwn
        ?request<Entry[]>("/finance/internal-settlements/mine?"+periodQuery)
        :Promise.resolve([] as Entry[]),
    ]);
    if(sequence!==reloadSequence.current)return;
    if(ledger.status==="fulfilled"){setEntries(section==="entries"?ledger.value.items:[]);setMetaAdEntries(section==="ads"?ledger.value.items:[]);setTotal(ledger.value.total);setHasLoadedEntries(true);}
    else{setEntries([]);setMetaAdEntries([]);setTotal(0);}
    if(settlements.status==="fulfilled"){setSettlementHistory(settlements.value);setSettlementHistoryError("");}else setSettlementHistoryError(readable(settlements.reason));
    if(sums.status==="fulfilled"){setSummaryAvailable(true);setTotals(sums.value);setRecurring(sums.value.recurringIncome??null);}else{setSummaryAvailable(false);setTotals(zero);}
    if(cats.status==="fulfilled")setCategories(cats.value);
    if(policies.status==="fulfilled")setFinanceReady(policies.value.some(p=>p.category==="FINANCE"&&p.active));
    const problems=[ledger,sums,cats,policies].flatMap(result=>result.status==="rejected"?[readable(result.reason)]:[]);
    setError(problems.join(" "));setLoading(false);setMetaDistributionRefresh(v=>v+1);
  },[request,view,canReadOwn,canAll,isFounder,periodQuery,registerQuery,section,forms,canCreate,ready,formOnly]);
  useEffect(()=>{
    if(formOnly||section!=="entries"||!ready||!session||view!=="all"||!canAll){
      setBalance(null);return;
    }
    let active=true;
    void request<{opening:string;movement:string;remaining:string}>("/finance/cycle-balance?view=all&"+periodQuery)
      .then(result=>{if(active)setBalance(result)}).catch(()=>{if(active)setBalance(null)});
    return()=>{active=false};
  },[formOnly,section,ready,session,request,view,canAll,periodQuery,metaDistributionRefresh]);
  useEffect(()=>{
    if(formOnly||!isFounder||section!=="entries"||!ready)return;
    let active=true;
    void request<SalaryFinanceSummary>("/salary/summary?"+periodQuery).then(summary=>{
      if(active){setSalarySummary(summary);setSalaryError("");}
    }).catch(e=>{if(active)setSalaryError(readable(e));});
    return()=>{active=false;};
  },[isFounder,request,periodQuery,metaDistributionRefresh,section,ready,formOnly]);
  useEffect(()=>{
    void reload();
    return()=>{reloadSequence.current+=1;};
  },[reload]);
  useEffect(()=>{
    if(!isFounder||!canReadOwn||section!=="settlements")return;
    let active=true;
    void request<Assignee[]>("/finance/internal-settlements/founders").then(peers=>{
      if(active){setSettlementPeers(peers);setSettlementError("");}
    }).catch(e=>{if(active)setSettlementError(e instanceof Error?e.message:"Founder list unavailable");});
    return()=>{active=false;};
  },[isFounder,canReadOwn,request,section]);
  useEffect(()=>{
    if(formOnly||!adminFinance||!forms)return;
    let active=true;
    void request<Assignee[]>("/finance/assignees").then(users=>{
      if(active){setAssignees(users);setAssigneesError("");}
    }).catch(e=>{
      if(active)setAssigneesError(readable(e));
    });
    return()=>{active=false;};
  },[adminFinance,request,forms,formOnly]);
  useEffect(()=>{
    const id=new URLSearchParams(window.location.search).get("focus");
    if(!id||![...entries,...metaAdEntries].some(entry=>entry.id===id))return;
    const frame=window.requestAnimationFrame(()=>{const row=document.getElementById("finance-meta-"+id)??document.getElementById("finance-"+id);row?.classList.add("aw-register-selected");row?.scrollIntoView({block:"center",behavior:"smooth"});});
    return ()=>window.cancelAnimationFrame(frame);
  },[entries,metaAdEntries]);
  useEffect(()=>{
    if((!canCreate&&!adminFinance)||!forms)return;
    let active=true;
    // The Clients directory already reads this endpoint. Use it first rather than
    // depending on the separately deployed, newer finance-only backend route.
    const load=async()=>{
      try{
        const clients:MetaAdClient[]=[];
        let cursor:string|null=null;
        for(let page=0;page<50;page++){
          const query=new URLSearchParams({status:"ACTIVE",limit:"100"});
          if(cursor)query.set("cursor",cursor);
          const response=await request<{items:MetaAdClient[];nextCursor:string|null}>("/clients?"+query);
          clients.push(...response.items);
          if(!response.nextCursor){cursor=null;break;}
          if(response.nextCursor===cursor)throw new Error("Client directory returned a repeated page.");
          cursor=response.nextCursor;
        }
        if(cursor)throw new Error("Client directory has more than 5,000 records. Narrow this list before selecting a client.");
        if(active){setMetaAdClients(clients.sort((a,b)=>a.businessName.localeCompare(b.businessName)));setMetaAdClientsError("");}
      }catch(directoryError){
        try{
          // A finance-only user may not have clients.read. Keep the narrow
          // finance endpoint as a fallback once the API is deployed.
          const clients=await request<MetaAdClient[]>("/finance/meta-ad-clients");
          if(active){setMetaAdClients(clients);setMetaAdClientsError("");}
        }catch(lookupError){
          if(active){
            setMetaAdClients([]);
            setMetaAdClientsError("Could not load paying clients. Directory: "+readable(directoryError)+" Finance API: "+readable(lookupError));
          }
        }
      }
    };
    void load();
    return()=>{active=false;};
  },[request,canCreate,adminFinance,forms]);

  async function submit(e:FormEvent){
    e.preventDefault();
    if(!categoryId){setError("Select a category before saving this entry.");return;}
    if(salarySelected){setError("Record salaries in the Salary module; linked expenses will appear here automatically.");return;}
    if(metaAdsSelected&&adFunding==="CLIENT"&&!clientId){setError("Select the client paying for this Meta Ads expense.");return;}
    setBusy(true);setError("");setSuccess("");
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
      setUploadStatus(isFounder?"Recording transaction…":"Submitting transaction for approval…");
      const saved=await request<{status:string}>((directExpense||quickKind==="EXPENSE")?"/finance/expenses/mine":"/finance/entries",{method:"POST",body:{
        kind,categoryId,clientId:metaAdsSelected&&adFunding==="CLIENT"?clientId:null,
        amount:amount.trim(),occurredOn,method,
        merchantOrSource:source.trim(),description:description.trim(),
        idempotencyKey:entryKey,receiptAssetId,
      }});
      setSuccess(metaAdsSelected&&adFunding==="CLIENT"
        ?(saved.status==="POSTED"?"Client Meta Ads spend saved separately from agency expenses.":"Client Meta Ads spend submitted for approval; it is excluded from agency expenses.")
        :(saved.status==="POSTED"?"Entry saved and included in posted totals.":"Entry submitted for finance approval. Pending amounts are not included in posted totals."));
      setAmount("");setSource("");setDescription("");setReceipt(null);setReceiptKey(v=>v+1);setEntryKey(crypto.randomUUID());
       if(compact){try{localStorage.setItem("aw-finance-method",method);}catch{/* optional preference */}}
      setCategoryId("");setAdFunding("SELF");setClientId("");
      onExpenseSaved?.();context?.onMutation();
      await reload();
    }catch(e){setError(e instanceof Error?e.message:readable(e));}finally{setBusy(false);setUploadStatus("");}
  }
  useEffect(()=>{
    setAgencySettlementPage(1);
  },[period.from,period.to,view]);
  useEffect(()=>{
    if(section!=="settlements"||view!=="all"||!canAll||!ready||!session){
      setAgencySettlementHistory(null);setAgencySettlementLoading(false);return;
    }
    let active=true;
    setAgencySettlementHistory(null);setAgencySettlementLoading(true);setAgencySettlementError("");
    const query=new URLSearchParams({...period,page:String(agencySettlementPage),limit:"50"});
    void request<AgencySettlementPage>("/finance/internal-settlements/all?"+query.toString())
      .then(result=>{if(active)setAgencySettlementHistory(result)})
      .catch(error=>{if(active)setAgencySettlementError(readable(error))})
      .finally(()=>{if(active)setAgencySettlementLoading(false)});
    return()=>{active=false};
  },[section,view,canAll,ready,session,request,period.from,period.to,agencySettlementPage,metaDistributionRefresh]);

  async function recordSettlement(e:FormEvent){
    e.preventDefault();
    if(!settlementPeer||!settlementAmount.trim()){setError("Select a receiving founder and positive amount.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/internal-settlements",{method:"POST",body:{
        recipientId:settlementPeer,amount:settlementAmount.trim(),occurredOn:settlementDate,
        method:settlementMethod,note:settlementNote.trim(),idempotencyKey:settlementKey
      }});
      setSettlementAmount("");setSettlementNote("");setSettlementKey(crypto.randomUUID());
      setSuccess("Settlement recorded as private history. Work-cycle and agency totals remain unchanged.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:readable(e));}
    finally{setBusy(false);}
  }
  async function voidSettlement(row:Entry){
    if(!row.settlementId||row.settlementDirection!=="OUTGOING")return;
    const reason=window.prompt("Reason for voiding the informational settlement (minimum 4 characters):");
    if(reason===null)return;
    if(reason.trim().length<4){setError("At least four characters are required.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/internal-settlements/"+row.settlementId+"/void",{method:"POST",body:{reason:reason.trim()}});
      setSuccess("Settlement voided for both founders. Company totals remain unchanged.");
      await reload();
    }catch(e){setError(e instanceof Error?e.message:readable(e));}
    finally{setBusy(false);}
  }
  async function addCategory(e:FormEvent){
    e.preventDefault();if(loading||busy)return;setBusy(true);setError("");setSuccess("");
    try{
      if(categoryKind==="EXPENSE"&&isSalaryCategory(categoryName))throw new Error("Salary is a linked category. Use the Salary module to record payments.");
      await request("/finance/categories",{method:"POST",body:{kind:categoryKind,name:categoryName.trim(),purpose:categoryKind==="EXPENSE"?categoryPurpose:"GENERAL"}});
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
  function beginEntryEdit(row:Entry,assignClient=false){
    setEditingEntry(row);setError("");setEditAdFunding(assignClient?"CLIENT":row.clientId?"CLIENT":"SELF");
    setEntryEdit({categoryId:row.category.id,
      amount:row.amount,occurredOn:row.occurredOn,method:row.method,
      merchantOrSource:row.merchantOrSource??"",description:row.description??"",
      enteredById:row.enteredById,clientId:row.clientId});
  }
  async function saveEntry(e:FormEvent){
    e.preventDefault();if(!editingEntry)return;
    const editIsMeta=editingEntry.kind==="EXPENSE"&&isMetaAdsCategory(categories.find(c=>c.id===entryEdit.categoryId));
    if(editIsMeta&&editAdFunding==="CLIENT"&&!entryEdit.clientId){setError("Select a client for this Meta Ads expense.");return;}
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/entries/"+editingEntry.id,{method:"PUT",body:{
        ...entryEdit,clientId:editIsMeta&&editAdFunding==="CLIENT"?entryEdit.clientId:null,
      }});
      setEditingEntry(null);setSuccess("Finance entry updated. User-wise totals now reflect the assigned user, and the original submitter is preserved in the audit history.");
      await reload();
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  async function deleteEntry(row:Entry){
    if(!window.confirm("Cancel "+row.kind.toLowerCase()+" "+money(row.amount)+" assigned to "+row.enteredBy.displayName+"? This removes it from posted or pending totals while preserving the approval and audit history. This cannot be undone."))return;
    setBusy(true);setError("");setSuccess("");
    try{
      await request("/finance/entries/"+row.id,{method:"DELETE"});
      setSuccess(row.kind==="INCOME"
        ?"Income cancelled and excluded from finance totals. Audit history retained."
        :"Expense cancelled and excluded from finance totals. Audit history retained.");
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
  async function exportCsv(scope:"agency"|"client_ads"|"meta_ads"="agency"){
    setBusy(true);setError("");
    try{
      const params=new URLSearchParams(registerQuery);params.set("scope",scope);
      const response=await request<{filename:string;csv:string}>("/finance/register/export?"+params);
      const blob=new Blob([response.csv],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");a.href=url;a.download=response.filename;a.click();
      URL.revokeObjectURL(url);
      setSuccess("CSV exported for the selected permission-scoped view.");
    }catch(e){setError(readable(e));}finally{setBusy(false);}
  }
  useEffect(()=>{
    if((!canReadOwn&&!canAll)||section!=="ads"||!ready)return;
    let active=true;
    setMetaDistribution(null);
    setMetaDistributionLoading(true);
    setMetaDistributionError("");
    const target=view==="all"&&canAll?"all":"mine";
    const params=new URLSearchParams({view:target});
    if(metaFrom)params.set("from",metaFrom);
    if(metaTo)params.set("to",metaTo);
    void request<MetaDistribution>("/finance/meta-ads-distribution?"+params.toString())
      .then(data=>{
        if(!Array.isArray(data.daily)||!Array.isArray(data.monthly)||
          !Array.isArray(data.individuals)||typeof data.total!=="string")
          throw new Error("Finance API update required: redeploy the latest main branch on Render.");
        if(active){setMetaDistribution(data);setMetaDistributionLoading(false);}
      })
      .catch(e=>{if(active){
        setMetaDistribution(null);
        setMetaDistributionError(e instanceof ApiError?readable(e):
          e instanceof Error?e.message:"Could not load Meta Ads distribution.");
        setMetaDistributionLoading(false);
      }});
    return()=>{active=false;};
  },[request,view,canReadOwn,canAll,metaFrom,metaTo,metaDistributionRefresh,section,ready]);
  const entryForm=forms&&canCreate&&!registerOnly&&<Card title={compact?(kind==="EXPENSE"?"Record expense":"Record income"):directExpense?"Add expense":"New income or expense"} description={isFounder?"Founder entries are posted immediately. Amounts use exact four-decimal precision.":"Employee entries enter the approval queue. Amounts use exact four-decimal precision."}>
        <form className={"aw-finance-new-form grid gap-4 sm:grid-cols-2"+(compact?" fc-quick-form":"")} onSubmit={submit}>
          {!compact&&<FormField id="finance-kind" label="Entry type"><select id="finance-kind" className="field" disabled={directExpense} value={kind} onChange={e=>{setKind(e.target.value as Kind);setCategoryId("");}}>
            <option value="EXPENSE">Expense</option>{!directExpense&&section!=="ads"&&<option value="INCOME">Income</option>}</select></FormField>}
          <FormField id="finance-category" label="Category"><select id="finance-category" className="field" value={categoryId} required onChange={e=>{setCategoryId(e.target.value);setAdFunding("SELF");setClientId("");}}>
            <option value="">{selected.length?"Select a category":"Create a category first"}</option>
            {selected.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            {!formOnly&&section!=="ads"&&kind==="EXPENSE"&&isFounder&&<option value={SALARY_OPTION}>Salary (linked payroll entry)</option>}
          </select></FormField>
          {salarySelected&&<div className="sm:col-span-2 rounded-xl border border-violet-500/30 bg-violet-500/5 p-4 space-y-2" role="status">
            <p className="font-semibold">Salary expense</p>
            <p className="text-sm">Record a payment in Salary and split its funding among founders. Each share appears here automatically with a Salary tag. Recording it twice would count the same expense twice.</p>
            <Link href="/app/salary" className="btn-primary inline-flex"><Plus size={16}/>Record in Salary</Link>
          </div>}
          {metaAdsSelected&&<>
            <FormField id="finance-meta-funding" label="Meta Ads paid by">
              <select id="finance-meta-funding" className="field" value={adFunding} onChange={e=>{setAdFunding(e.target.value as "SELF"|"CLIENT");setClientId("");}}>
                <option value="SELF">Self (agency expense)</option>
                <option value="CLIENT">Client (separate ad spend)</option>
              </select>
            </FormField>
            {adFunding==="CLIENT"&&<FormField id="finance-meta-client" label="Client">
              <select id="finance-meta-client" className="field" required value={clientId} onChange={e=>setClientId(e.target.value)}>
                <option value="">Select paying client</option>
                {metaAdClients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
              </select>
              {metaAdClientsError&&<p className="mt-2 text-sm text-red-400" role="alert">{metaAdClientsError}</p>}
              {!metaAdClientsError&&!metaAdClients.length&&<p className="mt-2 text-xs text-slate-400">No active clients available in this workspace.</p>}
            </FormField>}
            <p className="sm:col-span-2 text-xs text-slate-500">Client Meta Ads spend stays separate from agency expenses. Once posted, it reduces Net posted.</p>
          </>}
          <FormField id="finance-amount" label="Amount (INR)"><input id="finance-amount" className="field" inputMode="decimal" required
            pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" placeholder="1250.00"
            value={amount} onChange={e=>setAmount(e.target.value)}/></FormField>
          <FormField id="finance-date" label="Transaction date"><input id="finance-date" className="field" required type="date" value={occurredOn}
            onChange={e=>setOccurredOn(e.target.value)}/></FormField>
          <FormField id="finance-method" label="Payment method"><select id="finance-method" className="field" value={method} onChange={e=>setMethod(e.target.value as typeof method)}>
            {modes.map(m=><option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}</select></FormField>
          <p className="sm:col-span-2 text-sm text-slate-400" data-testid="finance-owner-notice">This entry belongs to your signed-in user. An administrator can reassign it later.</p>
          {compact&&<button type="button" className="btn-secondary sm:col-span-2 fc-extra" aria-expanded={moreDetails} onClick={()=>setMoreDetails(v=>!v)}>{moreDetails?"Hide optional details":"Payee, notes & receipt"}</button>}
          <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2" hidden={compact&&!moreDetails}>
          <FormField id="finance-source" label={kind==="EXPENSE"?"Merchant / payee":"Income source"}><input id="finance-source" className="field" maxLength={160}
            value={source} onChange={e=>setSource(e.target.value)} placeholder={kind==="EXPENSE"?"Rapido":"Agency service"}/></FormField>
          <div className="sm:col-span-2"><FormField id="finance-description" label="Notes (optional)"><textarea id="finance-description" className="field min-h-20" maxLength={2000}
            value={description} onChange={e=>setDescription(e.target.value)}/></FormField></div>
          <div className="sm:col-span-2"><FormField id="finance-receipt" label="Receipt image or payment proof (optional)">
             <input key={receiptKey} id="finance-receipt" className="field" type="file"
               accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/bmp,image/tiff,image/heic,image/heif,application/pdf,.jpg,.jfif,.jpeg,.gif,.png,.tif,.tiff"
               onChange={e=>setReceipt(e.target.files?.[0]??null)}/>
            </FormField>
            {receipt&&<p className="mt-1 text-xs">{receipt.name} · {(receipt.size/1024/1024).toFixed(2)} MB</p>}
            {uploadStatus&&<p role="status" className="mt-2 text-sm">{uploadStatus}</p>}
          </div>
          </div>
          <div className="sm:col-span-2 flex flex-wrap gap-2"><button className="btn-primary" type="submit" disabled={busy||loading||!categoryId||salarySelected||(!isFounder&&!financeReady)} title={!isFounder&&!financeReady?"Finance approvals are currently disabled. See the notice above.":undefined}>
            <Plus className="h-4 w-4"/>{busy?"Submitting…":isFounder?(compact?(kind==="EXPENSE"?"Save expense":"Save income"):directExpense?"Save expense":"Save entry"):"Submit for approval"}</button>{compact&&<span className="text-xs text-slate-400 self-center">Save clears the form so you can add another entry.</span>}</div>
        </form>
      </Card>;
  if(!session)return <Spinner label="Checking finance access…"/>;
  if(!canReadOwn&&!canAll)return <><PageHeader title="Finance access denied" description="No financial permissions were assigned to your account."/><Notice kind="error">Contact an administrator for access.</Notice></>;
  if(formOnly)return <div className="space-y-3">{!isFounder&&!loading&&!financeReady&&<Notice kind="error">Finance approvals are not currently enabled. Ask an administrator to enable the finance approval policy.</Notice>}{error&&<Notice kind="error">{error}</Notice>}{success&&<Notice kind="success">{success}</Notice>}{entryForm}</div>;
  return <div className="aw-finance-page aw-v5-finance-page space-y-7" data-aw-module="finance">
    {!context&&<><BusinessWorkspaceNav/>
    <Link className="inline-flex text-sm text-violet-300 underline" href={"/app/finance?"+windowState.query}>← Finance overview</Link></>}
    <PageHeader eyebrow="Financial operations" title={{entries:"Income & expense register",ads:"Meta Ads",categories:categoryKind==="INCOME"?"Income categories":"Expense categories",settlements:"Founder settlements",agreements:"Agreement projections"}[section]}
      description={section==="categories"?"Manage this category type for the whole agency. Historical entries retain their categories.":isFounder?"Your income and expenses post immediately without approval.":"Entries are submitted for approval. Only posted entries count towards net income."}
      actions={<div className="flex flex-wrap gap-2">
        {forms&&<button className="btn-secondary" type="button" disabled={busy} onClick={()=>void exportCsv(section==="ads"?"meta_ads":"agency")}><Download className="h-4 w-4"/>Export CSV</button>}
        <button className="btn-secondary" type="button" disabled={loading} onClick={()=>void reload()}><RefreshCw className="h-4 w-4"/>Refresh</button>
      </div>}/>
    {error&&<Notice kind="error">{error}</Notice>}{success&&<Notice kind="success">{success}</Notice>}
    {!context&&section!=="categories"&&<BusinessPeriodPicker value={period} onChange={setPeriod} disabled={busy}/>}
    {section==="categories"&&<nav className="flex flex-wrap gap-3" aria-label="Category management">
      <Link className="btn-secondary" href={"/app/finance/categories?"+windowState.query}>All category types</Link>
      <Link className={categoryKind==="INCOME"?"btn-primary":"btn-secondary"} href={"/app/finance/categories/income?"+windowState.query}>Income categories</Link>
      <Link className={categoryKind==="EXPENSE"?"btn-primary":"btn-secondary"} href={"/app/finance/categories/expenses?"+windowState.query}>Expense categories</Link>
    </nav>}
    {!context&&(forms||(section==="settlements"&&isFounder&&canAll))&&
      <div className="aw-v5-finance-visibility flex gap-2" role="group" aria-label="Finance visibility">
      <button className={view==="mine"?"btn-primary":"btn-secondary"} onClick={()=>setView("mine")}>My entries</button>
      {canAll&&<button className={view==="all"?"btn-primary":"btn-secondary"} onClick={()=>setView("all")}>Agency totals & register</button>}
    </div>}
    {section==="settlements"&&view==="mine"&&isFounder&&canReadOwn&&
      <section id="finance-settlement-history" aria-label="My internal settlements">
        <Card title="Internal settlements received & sent"
          description="The recipient sees Settlement In and the sender sees Settlement Out. Both personal account balances change; company income and expense totals stay unchanged.">
          {settlementHistoryError&&<p role="status" className="text-sm text-amber-400">{settlementHistoryError}</p>}
          {loading&&!settlementHistory.length?<Spinner label="Loading settlement history…"/>:
           !settlementHistory.length?<p className="text-sm text-slate-400">
              {settlementHistoryError
                ?"Unable to confirm historical settlements. No records have been deleted."
                :"No internal settlements received or sent."}
            </p>:
           <div className="space-y-3" role="region" aria-label="Internal settlement history">
             {settlementHistory.map(row=>
               <div key={row.id} data-testid="personal-settlement-entry"
                 className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                 <div className="space-y-1">
                   <p className="font-semibold">{row.settlementDirection==="INCOMING"?"Settlement In · Received from ":"Settlement Out · Sent to "}{row.merchantOrSource}</p>
                   <p className="text-xs text-slate-400">{row.occurredOn} · {row.method.replaceAll("_"," ")} · {row.status}</p>
                   {row.description&&<p className="text-sm text-slate-400">{row.description}</p>}
                 </div>
                 <div className="flex items-center gap-2">
                   <strong className={row.settlementDirection==="INCOMING"?"text-emerald-400":"text-slate-200"}>
                     {row.settlementDirection==="INCOMING"?"+":"−"}{money(row.amount)}
                   </strong>
                   {row.settlementDirection==="OUTGOING"&&row.status!=="CANCELLED"&&
                     <button className="btn-secondary text-xs" type="button" disabled={busy}
                       onClick={()=>void voidSettlement(row)}>Void</button>}
                 </div>
               </div>)}
           </div>}
        </Card>
      </section>}
    {section==="settlements"&&view==="all"&&canAll&&
      <section id="finance-agency-settlement-history" aria-label="All founder settlements">
        <Card title="All founder settlements"
          description="Every founder-to-founder settlement within the selected cycle. Transferred amounts are counted once; these transfers do not create agency revenue or expense.">
          {agencySettlementError&&<p role="alert" className="text-sm text-amber-400">{agencySettlementError}</p>}
          {agencySettlementHistory&&<div className="grid gap-3 sm:grid-cols-3">
            <div><p className="text-sm text-slate-400">Total transferred (active)</p>
              <strong className="text-xl">{money(agencySettlementHistory.postedTotal)}</strong></div>
            <div><p className="text-sm text-slate-400">Active transfers</p>
              <strong className="text-xl">{agencySettlementHistory.postedCount}</strong></div>
            <div><p className="text-sm text-slate-400">Voided transfers</p>
              <strong className="text-xl">{agencySettlementHistory.voidedCount}</strong></div>
          </div>}
          {agencySettlementLoading?<Spinner label="Loading agency settlements…"/>:
            agencySettlementHistory&&!agencySettlementHistory.items.length?
              <p className="text-sm text-slate-400">No founder settlements in this work cycle.</p>:
            agencySettlementHistory?<div className="space-y-3" role="region" aria-label="Agency settlement history">
              {agencySettlementHistory.items.map(row=>
                <div key={row.id} data-testid="agency-settlement-entry"
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 p-3">
                  <div className="space-y-1">
                    <p className="font-semibold">{row.senderName} → {row.recipientName}</p>
                    <p className="text-xs text-slate-400">{row.occurredOn} · {row.method.replaceAll("_"," ")} · {row.status}</p>
                    {row.note&&<p className="text-sm text-slate-400">{row.note}</p>}
                    {row.voidReason&&<p className="text-sm text-slate-400">Void reason: {row.voidReason}</p>}
                  </div>
                  <strong className={row.status==="CANCELLED"?"line-through text-slate-500":"text-slate-200"}>
                    {money(row.amount)}
                  </strong>
                </div>)}
              <FinancePager page={agencySettlementPage}
                total={agencySettlementHistory.total} limit={agencySettlementHistory.limit}
                onChange={setAgencySettlementPage}/>
            </div>:null}
        </Card>
      </section>}
    {section==="entries"&&<>
    <div className="flex flex-wrap items-center gap-3">
      <Link className="btn-secondary" href={"/app/finance/cycles?"+windowState.query}>Cycles · View previous entries</Link>
    </div>
    <PreviousCycleNetPosted period={period} view={view==="all"&&canAll?"all":"mine"}/>
    {isFounder&&view==="mine"&&<PersonalNetAfterSettlements period={period}/>}
    {view==="all"&&canAll&&balance&&<Card>
      <p className="text-sm font-semibold">Agency net balance remaining</p>
      <strong className="mt-2 block text-2xl">{money(balance.remaining)}</strong>
      <p className="mt-1 text-sm text-slate-400">Carried forward: {money(balance.opening)} · Movement this cycle: {money(balance.movement)}. Bookkeeping balances, not verified bank funds.</p>
    </Card>}
    <div id="finance-summary" className="aw-finance-summary-grid grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6" aria-label="Financial totals">
      {([
        ["Posted income",totals.postedIncome],
        ["Posted expenses",totals.postedExpense],
        ["Expenses incl. salary",totals.postedExpenseIncludingSalary??totals.postedExpense],
        ["Operating net after ad outflows (excl. settlements)",totals.postedNet],
        ["Agency operating net",totals.agencyOperatingNet??"0"],
        ["Pending income",totals.pendingIncome],
        ["Pending expenses",totals.pendingExpense],
      ] as const).map(([label,value])=><Card key={label}>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-2 break-words text-xl font-bold">{loading?"…":summaryAvailable?money(value):"Unavailable"}</p>
        <p className="mt-2 text-xs text-slate-500">{label==="Operating net after ad outflows (excl. settlements)"
          ?(view==="mine"&&isFounder?"Income − current-cycle expenses − client Meta Ads − salary funded":"Income − agency expenses − posted client Meta Ads − salary funded")
          :view==="mine"&&isFounder&&totals.personalSettlementResetAt
            ?"Since latest internal settlement · "+totals.currency
            :label==="Agency operating net"?"Income − agency expenses − salary; client ads separate":(view==="all"?"Organization":"Your entries")+" · Selected work cycle · "+totals.currency}</p>
      </Card>)}
      <Card>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Client Meta Ads spend</p>
        <p className="mt-2 break-words text-xl font-bold">{loading?"…":summaryAvailable?money(totals.clientAdSpend?.posted??"0.0000"):"Unavailable"}</p>
        <p className="mt-2 text-xs text-slate-500">
          {view==="mine"&&isFounder&&totals.personalSettlementResetAt?"Since latest settlement · ":""}
          Posted · Pending: {money(totals.clientAdSpend?.pending??"0.0000")}
        </p>
      </Card>
    </div>
    {isFounder&&view==="mine"&&totals.personalSettlementResetAt&&
      <p className="text-sm text-slate-400" role="status">
        My entries summary reset: {new Date(totals.personalSettlementResetAt).toLocaleString("en-IN",{dateStyle:"medium",timeStyle:"short",timeZone:"Asia/Kolkata"})}.
        {" Prior posted expenses: "+money(totals.postedExpenseBeforeSettlement??"0")+". "}
        {"All summary cards show transactions since this settlement. Current-cycle expenses: "+money(totals.postedExpense)+". "}
        Historical transactions remain in the register and agency totals are unchanged.
      </p>}
    <section className="aw-v5-finance-visuals" aria-label="Posted income and expense comparison">
      <header><div><span className="aw-v5-eyebrow">LEDGER COMPARISON</span>
        <h2>{view==="mine"?"Personal current-cycle income and expenses":"Posted agency income and expenses"}</h2>
        <p>{view==="mine"?"All figures use the selected work cycle. Internal settlements move personal balances without changing these income and expense totals.":"Agency ledger totals are kept separate from salaries funded by founders. Salary receipts never increase income."}</p>
       </div><Scale size={20} aria-hidden="true"/></header>
      <div className="aw-v5-finance-compare">
       {([["Income",totals.postedIncome,postedIncomeValue],
          ["Expenses",totals.postedExpense,postedExpenseValue],
           ...(isFounder?[["Founder-funded salaries",fundedSalaryText,fundedSalaryExpense] as const]:[])] as const).map(([label,value,number])=>
         <div className="aw-v5-finance-comparison-row" key={label}>
          <div><span>{label}</span><strong>{loading?"…":summaryAvailable?money(value):"Unavailable"}</strong></div>
          <div className="aw-v5-finance-track" role="img"
            aria-label={label+": "+(loading?"loading":money(value))}>
           <span style={{width:(Number.isFinite(number)?Math.max(0,number)/postedMax*100:0)+"%"}}/>
          </div>
         </div>)}
      </div>
      <p className="aw-v5-finance-notice">Pending transactions and projected recurring fees are not included. Internal settlements move balances between founders. Only a new work cycle restarts income and expense totals; historical records stay available in Cycles.</p>
    </section>
    {isFounder&&<section id="finance-salary" className="rounded-xl border border-white/10 p-5 space-y-3" aria-label="Separate founder salary funding expenses">
      <div className="flex flex-wrap justify-between gap-2"><div><h2 className="font-semibold text-lg">Founder-funded salary expenses</h2>
        <p className="text-sm opacity-70">Tracked separately from posted agency income and expense entries. Funding is attributed to the founder whose account paid, not the recipient.</p></div>
        <Link href="/app/salary" className="btn-secondary">Salary ledger</Link></div>
      {salaryError&&<p className="text-sm text-amber-400">Salary ledger unavailable: {salaryError}</p>}
      <div className="space-y-2">{founderSalaryRows.map(x=><div key={x.founderUserId} className="flex gap-2 justify-between border-b border-white/10 py-2 text-sm">
        <span>{x.name}</span><strong>{money(x.amount)}</strong></div>)}</div>
      <p className="font-semibold">Total founder-funded salary expense: {money(fundedSalaryText)}</p>
      {view==="all"&&<p className="text-sm opacity-70">Net posted (after founder-funded salaries): {money(totals.postedNet)}. Net before salaries: {money(totals.postedNetBeforeSalary??"0")}. These are Finance ledger balances, not verified bank balances.</p>}
    </section>}
    </>}
    {forms&&!isFounder&&!loading&&!financeReady&&<div className="aw-finance-policy-warning" role="status">
    <span aria-hidden="true">i</span><p>Finance approvals are not active yet. An administrator can enable the FINANCE policy in <Link className="font-bold underline" href="/app/approvals">Approval workflows</Link>.</p>
   </div>}
    {section==="agreements"&&canAll&&<div id="finance-recurring" className="aw-v5-finance-anchor"><Card title="Recurring income from client agreements" description="Monthly rates for active, unexpired agreements overlapping the selected dates. Ended agreements are excluded. These are projections, not received payments; ad budgets are separate from service revenue.">
      {recurring?<div className="space-y-4">
        <p className="text-sm text-slate-500">Period: {recurring.from??period.from} through {recurring.to??period.to} · Active client agreements</p>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><p className="text-sm">Monthly service charges</p><strong>{money(recurring.monthlyServiceTotal)}</strong></div>
          <div><p className="text-sm">Monthly ad budgets</p><strong>{money(recurring.monthlyAdBudgetTotal)}</strong></div>
          <div><p className="text-sm">Combined monthly commitment</p><strong>{money(recurring.monthlyCombinedTotal)}</strong></div>
        </div>
        <div className="overflow-x-auto"><table className="aw-finance-register"><thead><tr><th>Client</th><th>Service charge</th><th>Ad budget</th><th>Combined / month</th><th>Agreement ends</th></tr></thead>
          <tbody>{recurring.items.map(c=><tr key={c.id}><td><Link href={"/app/clients/"+c.id} className="underline">{c.businessName}</Link></td><td>{money(c.monthlyServiceCharge)}</td><td>{money(c.monthlyAdBudget)}</td><td>{money(c.monthlyCombined)}</td><td>{c.contractEndOn??"Open-ended"}</td></tr>)}</tbody></table></div>
        {!recurring.items.length&&<p className="text-sm">No active client agreements with monthly charges recorded for this work cycle.</p>}
      </div>:<p className="text-sm">Recurring agreement projection is unavailable.</p>}
    </Card></div>}
    <div id="finance-entry" className="aw-finance-panels grid gap-5">
      {entryForm}
      {section==="categories"&&<Card title={categoryKind==="INCOME"?"Manage income categories":"Manage expense categories"} description="Only this category type is shown. Old entries retain their category when it is deactivated.">
        {canManage&&<form className="flex flex-wrap items-end gap-3" onSubmit={addCategory}>
          <FormField id="new-category-name" label="Category name"><input id="new-category-name" className="field" required minLength={2}
            maxLength={120} value={categoryName} onChange={e=>setCategoryName(e.target.value)} placeholder={categoryKind==="INCOME"?"Service fees":"Travel"}/></FormField>
          {categoryKind==="EXPENSE"&&<FormField id="new-category-purpose" label="Category purpose"><select id="new-category-purpose" className="field" value={categoryPurpose} onChange={e=>setCategoryPurpose(e.target.value as typeof categoryPurpose)}><option value="GENERAL">Operating expense</option><option value="META_ADS">Meta advertising</option></select></FormField>}
          <button className="btn-primary" type="submit" disabled={busy||loading||!categoryName.trim()}>Add category</button>
        </form>}
        <div className="aw-finance-category-list mt-5 space-y-2" role="region" aria-label="Financial categories" tabIndex={0}>{managedCategories.length?managedCategories.map(c=><div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2">
          <div><p className="text-sm font-semibold">{c.name}</p><p className="text-xs text-slate-500">{c.kind} · {c.purpose??"GENERAL"} · {c.active?"Active":"Inactive"}</p></div>
          {canManage&&<div className="flex flex-wrap gap-2">
            <button type="button" className="btn-secondary text-xs" onClick={()=>void toggleCategory(c)} disabled={busy}>{c.active?"Disable":"Enable"}</button>
            {adminFinance&&<><button type="button" className="btn-secondary text-xs" onClick={()=>{setEditingCategory(c);setEditedCategoryName(c.name);}} disabled={busy}>Edit</button>
            <button type="button" className="btn-secondary text-xs" onClick={()=>void deleteCategory(c)} disabled={busy}>Delete</button></>}
          </div>}
        </div>):<EmptyState title={"No "+categoryKind.toLowerCase()+" categories yet"} description="An administrator can add a category above." icon={Wallet}/>}</div>
      </Card>}
    </div>
    {section==="settlements"&&isFounder&&canCreate&&canReadOwn&&
      <section id="finance-internal-settlement" aria-label="Record internal settlement">
       <Card title="Internal Settlement" description="Record money sent between founders. The sender balance decreases and recipient balance increases; this does not create company income or expenses.">
        {settlementError&&<Notice kind="error">{settlementError}</Notice>}
        <form className="aw-finance-new-form grid gap-4 sm:grid-cols-2" onSubmit={e=>void recordSettlement(e)}>
         <FormField id="settlement-recipient" label="Receiving founder">
          <select id="settlement-recipient" className="field" required value={settlementPeer} onChange={e=>setSettlementPeer(e.target.value)}>
           <option value="">Select founder</option>
           {settlementPeers.map(person=><option key={person.id} value={person.id}>{person.displayName}</option>)}
          </select>
         </FormField>
         <FormField id="settlement-amount" label="Amount (INR)">
          <input id="settlement-amount" className="field" inputMode="decimal" required pattern="(0|[1-9][0-9]{0,12})([.][0-9]{1,2})?"
           placeholder="2000.00" value={settlementAmount} onChange={e=>setSettlementAmount(e.target.value)}/>
         </FormField>
         <FormField id="settlement-date" label="Settlement date">
          <input id="settlement-date" className="field" type="date" required value={settlementDate}
           onChange={e=>setSettlementDate(e.target.value)}/>
         </FormField>
         <FormField id="settlement-method" label="Method">
          <select id="settlement-method" className="field" value={settlementMethod}
           onChange={e=>setSettlementMethod(e.target.value as typeof settlementMethod)}>
           {modes.map(m=><option key={m} value={m}>{m.replaceAll("_"," ")}</option>)}
          </select>
         </FormField>
         <div className="sm:col-span-2">
          <FormField id="settlement-note" label="Note (optional)">
           <textarea id="settlement-note" className="field min-h-20" maxLength={500}
            value={settlementNote} placeholder="Purpose or reference" onChange={e=>setSettlementNote(e.target.value)}/>
          </FormField>
         </div>
         <p className="sm:col-span-2 text-sm text-slate-500">
          Informational record only; DigiMarket does not transfer money. These notes do not change work-cycle totals or account balances.
         </p>
         <div className="sm:col-span-2">
          <button className="btn-primary" type="submit" disabled={busy||!settlementPeer||!settlementAmount||!settlementPeers.length}>
           <Plus size={16}/>{busy?"Saving…":"Record internal settlement"}
          </button>
         </div>
        </form>
       </Card>
      </section>}
    {section==="ads"&&<>
    <div id="finance-meta-ads" className="aw-v5-finance-anchor"/>
    <Card title={view==="mine"?"My Meta Ads spending breakdown":"Agency Meta Ads spending breakdown"}
      description={view==="mine"?"Only transactions assigned to your account, split by Self and each client.":"All team members combined, with person-wise, client-wise and date-wise totals."}>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <p className="text-sm">Uses the work cycle selected above: {metaFrom} through {metaTo}.</p>
        <button type="button" className="btn-secondary" onClick={()=>setMetaDistributionRefresh(x=>x+1)}
          disabled={metaDistributionLoading}><RefreshCw size={16}/>Refresh breakdown</button>
        <button type="button" className="btn-secondary" disabled={!metaDistribution||metaDistributionLoading} onClick={()=>{
          if(!metaDistribution)return;
          const report=metaDistribution;
          const rows:string[][]=[
            ["Meta Ads spending report",report.view==="mine"?"My entries":"Agency totals"],
            ["From",report.from??"All time","To",report.to??"All time"],
            ["Status","Posted","Pending","Posted + pending","Excluded (rejected/cancelled)"],
            ["Totals",report.totalPosted,report.totalPending,report.total,report.excludedAmount],
            ["Self",report.selfPosted,report.selfPending],
            ["Clients",report.clientPosted,report.clientPending],
            [],
            ["Category","Posted","Pending","Posted + pending","Excluded","Transactions"],
            ...report.categories.map(c=>[c.name,c.posted,c.pending,c.total,c.excluded,String(c.count)]),
            [],
            ["Person","Posted","Pending","Posted + pending","Excluded","Transactions"],
            ...report.individuals.map(p=>[p.name,p.posted,p.pending,p.total,p.excluded,String(p.count)]),
            [],
            ["Date","Posted","Pending","Posted + pending","Self posted","Client posted","Transactions"],
            ...report.daily.map(d=>[d.date,d.posted,d.pending,d.total,d.selfPosted,d.clientPosted,String(d.count)]),
            [],
            ["Work cycle (closing date exclusive)","Posted","Pending","Posted + pending","Self posted","Client posted","Transactions"],
            ...report.monthly.map(d=>[cycleLabel(d.date),d.posted,d.pending,d.total,d.selfPosted,d.clientPosted,String(d.count)]),
            [],
            ["Date","Category","Posted","Pending","Posted + pending","Transactions"],
            ...report.daily.flatMap(d=>d.categories.map(c=>[d.date,c.name,c.posted,c.pending,c.total,String(c.count)])),
          ];
          const csv=rows.map(row=>row.map(cell=>'"'+cell.replaceAll('"','""')+'"').join(",")).join("\r\n");
          const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
          const a=document.createElement("a");a.href=url;a.download="meta-ads-"+report.view+"-breakdown.csv";a.click();
          URL.revokeObjectURL(url);
        }}><Download size={16}/>Export breakdown</button>
      </div>
      {metaDistributionLoading&&<p role="status" className="text-sm text-slate-500 mb-3">Calculating Meta Ads totals…</p>}
      {metaDistributionError&&<Notice kind="error">{metaDistributionError}</Notice>}
      {metaDistribution&&!metaDistributionLoading&&<>
        <p className="text-sm text-slate-500 mb-3">
          {view==="mine"?"My recorded transactions":"Agency-wide transactions"} ·
          {metaDistribution.from||metaDistribution.to
            ?" "+(metaDistribution.from??"Beginning")+" to "+(metaDistribution.to??"Today")
            :" All dates"} · {metaDistribution.transactionCount} posted/pending entries
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
          {([
            ["Recorded total (posted + pending)",metaDistribution.total],
            ["Posted spending",metaDistribution.totalPosted],
            ["Pending approval",metaDistribution.totalPending],
            ["Self posted",metaDistribution.selfPosted],
            ["Client posted",metaDistribution.clientPosted],
            ["Excluded (rejected/cancelled)",metaDistribution.excludedAmount],
          ] as const).map(([label,value])=>
            <div key={label} className="rounded-xl border p-4">
              <p className="text-sm text-slate-500">{label}</p>
              <p className="text-xl font-semibold break-all">{money(value)}</p>
            </div>)}
        </div>
        <p className="mb-5 text-xs text-slate-500">
          Self means Meta Ads without a linked client. Posted + pending is a recorded total, not final paid spending.
          Rejected/cancelled entries ({metaDistribution.excludedCount}) are shown separately, never added to spending.
        </p>
        {view==="all"&&<section className="mb-6" aria-label="Individual Meta Ads distribution">
          <h3 className="font-semibold mb-3">Individual spending by team member</h3>
          {metaDistribution.individuals.length===0?<p className="text-sm text-slate-500">No recorded spending.</p>:
            <div className="space-y-2">{metaDistribution.individuals.map(p=>
              <details key={p.userId} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  <strong>{p.name}</strong>
                  <span className="block text-slate-500 mt-1">Posted {money(p.posted)} · Pending {money(p.pending)} · Total {money(p.total)}</span>
                </summary>
                <div className="mt-3 space-y-2 text-sm">
                  {p.categories.map(c=><div key={c.clientId??"self"} className="flex flex-wrap justify-between gap-2 border-t pt-2">
                    <span>{c.name}</span><span>{money(c.posted)} posted · {money(c.pending)} pending</span>
                  </div>)}
                </div>
              </details>)}</div>}
        </section>}
        <section className="mb-6" aria-label="Meta Ads category totals">
          <h3 className="font-semibold mb-3">Category totals: Self and individual clients</h3>
          {metaDistribution.categories.length===0?<p className="text-sm text-slate-500">No Meta Ads entries in this date range.</p>:
          <div className="space-y-3">{metaDistribution.categories.map(c=>
            <div key={c.clientId??"self"} className="rounded-lg border p-3">
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <strong>{c.name}</strong>
                <span>Posted {money(c.posted)} · Pending {money(c.pending)}</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Recorded total: {money(c.total)} · {c.count} entries</p>
              <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full bg-indigo-600" style={{width:
                  (Number(metaDistribution.totalPosted)>0
                    ?Math.max(0,Math.min(100,Number(c.posted)/Number(metaDistribution.totalPosted)*100)):0)+"%"}}/>
              </div>
            </div>)}</div>}
        </section>
        <section aria-label="Date wise Meta Ads spending">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h3 className="font-semibold">Date-wise spending</h3>
            <div className="flex gap-2" role="group" aria-label="Date grouping">
              <button type="button" className={metaPeriodMode==="daily"?"btn-primary":"btn-secondary"}
                aria-pressed={metaPeriodMode==="daily"} onClick={()=>setMetaPeriodMode("daily")}>Day-wise</button>
              <button type="button" className={metaPeriodMode==="monthly"?"btn-primary":"btn-secondary"}
                aria-pressed={metaPeriodMode==="monthly"} onClick={()=>setMetaPeriodMode("monthly")}>Cycle-wise</button>
            </div>
          </div>
          {(metaPeriodMode==="daily"?metaDistribution.daily:metaDistribution.monthly).length===0
            ?<p className="text-sm text-slate-500">No transactions in this period.</p>:
          <div className="space-y-2">
            {(metaPeriodMode==="daily"?metaDistribution.daily:metaDistribution.monthly).map(d=>
              <details key={d.date} className="rounded-lg border p-3">
                <summary className="cursor-pointer text-sm">
                  <strong>{metaPeriodMode==="monthly"?cycleLabel(d.date):d.date}</strong>
                  <span className="block text-slate-500 mt-1">Posted {money(d.posted)} · Pending {money(d.pending)} · Total {money(d.total)}</span>
                </summary>
                <div className="mt-3 text-sm">
                  <div className="flex flex-wrap justify-between gap-2 pb-2">
                    <span>Self: {money(d.selfPosted)} posted · {money(d.selfPending)} pending</span>
                    <span>Clients: {money(d.clientPosted)} posted · {money(d.clientPending)} pending</span>
                  </div>
                  {d.categories.map(c=><div key={c.clientId??"self"} className="flex flex-wrap justify-between gap-2 border-t py-2">
                    <span>{c.name}</span>
                    <span>{money(c.posted)} posted · {money(c.pending)} pending</span>
                  </div>)}
                </div>
              </details>)}
          </div>}
        </section>
      </>}
    </Card>

    <Card title="All Meta Ads spend" description="Meta Ads expenses only, including Self and Client-funded campaigns. Posted client spending reduces Net posted without increasing agency expenses. Search covers every matching entry. Export CSV uses the same filters.">
      <button type="button" className="btn-secondary mb-4 text-xs" disabled={busy} onClick={()=>void exportCsv("meta_ads")}>
        <Download className="h-4 w-4"/> Export Meta Ads CSV
      </button>
      <div className="aw-v5-register-filters" aria-label="Meta Ads register filters">
       <label className="aw-v5-register-search"><Search size={16} aria-hidden="true"/>
        <span className="sr-only">Search Meta Ads spend</span>
        <input type="search" aria-label="Search Meta Ads spend" value={metaSearch}
          placeholder="Search client, note or payer" onChange={e=>setMetaSearch(e.target.value)}/>
       </label>
       <div className="aw-v5-filter-pills" role="group" aria-label="Meta Ads funding filter">
        {([["ALL","All"],["SELF","Agency"],["CLIENT","Client"]] as const).map(([value,label])=>
          <button key={value} type="button" aria-pressed={metaFundingFilter===value}
            onClick={()=>setMetaFundingFilter(value)}>{label}</button>)}
       </div>
       <span className="aw-v5-register-count">{total} matching records · Page {page}
         {(metaFrom||metaTo)?" · Date filter applied":""}</span>
      </div>
      {!metaAdEntries.length?<EmptyState title="No matching Meta Ads expenses" description="No records match the selected dates, funding filter and search. Choose All or adjust the filters to review other spending."/>:<>
      <div className="space-y-3 md:hidden" aria-label="Meta Ads spending entries, mobile view">
        {filteredMetaAdEntries.map(row=><article key={row.id} id={"finance-meta-mobile-"+row.id} className="rounded-xl border border-slate-700/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-lg">{money(row.amount)}</strong>
            <span className={"aw-finance-status status-"+row.status.toLowerCase()}>{row.status}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span>{row.occurredOn}</span><span>·</span><span>{row.clientId?"Client":"Self"}</span>
          </div>
          <div className="mt-2 font-semibold break-words">
            {row.clientId
              ?row.client?<Link className="underline" href={"/app/clients/"+row.client.id}>{row.client.businessName}</Link>:"Client unavailable"
              :"Agency / Self"}
          </div>
          <div className="mt-3 grid gap-1 text-sm text-slate-400">
            <p>Recorded by: {row.enteredBy.displayName}</p>
            <p>Payment method: {row.method.replaceAll("_"," ")}</p>
            {row.description&&<p className="break-words">Notes: {row.description}</p>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(adminFinance||isFounder)&&row.status==="POSTED"&&!row.reversesId&&!row.reversedBy&&<ReversalButton source="FINANCE" id={row.id} label={money(row.amount)} onSaved={reload}/>}
            {row.receiptAssetId&&<button type="button" disabled={busy} className="btn-secondary text-xs"
              onClick={()=>void showReceipt(row.id)}>Proof</button>}
            {row.approvalRequestId&&<Link className="underline text-sm" href={"/app/approvals?focus="+encodeURIComponent(row.approvalRequestId)}>View approval</Link>}
            {adminFinance&&row.status!=="CANCELLED"&&!row.reversesId&&!row.reversedBy&&<>
              {!row.clientId&&<button type="button" className="btn-secondary text-xs" disabled={busy}
                onClick={()=>beginEntryEdit(row,true)}>Assign client</button>}
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>beginEntryEdit(row)}>Edit</button>
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>void deleteEntry(row)}>Delete</button>
            </>}
          </div>
        </article>)}
      </div>
      <div className="aw-finance-register-scroll hidden md:block" role="region" aria-label="All Meta Ads register" tabIndex={0}>
        <table className="aw-finance-register"><thead><tr>
          {(adminFinance||isFounder)&&<th>Actions</th>}
          {["Date","Paid by","Client","Amount","Payment method","Status","Recorded by","Notes","Receipt","Approval"].map(label=><th key={label}>{label}</th>)}
        </tr></thead><tbody>{filteredMetaAdEntries.map(row=><tr key={row.id} id={"finance-meta-"+row.id}>
          {(adminFinance||isFounder)&&<td><div className="flex gap-2">
            {adminFinance&&row.status!=="CANCELLED"&&!row.reversesId&&!row.reversedBy&&<>
              {!row.clientId&&<button type="button" className="btn-secondary text-xs" disabled={busy}
                onClick={()=>beginEntryEdit(row,true)} aria-label={"Assign client to Meta Ads entry "+money(row.amount)}>Assign client</button>}
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>beginEntryEdit(row)}>Edit</button>
              <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>void deleteEntry(row)}>Delete</button>
            </>}
            {row.status==="POSTED"&&!row.reversesId&&!row.reversedBy&&<ReversalButton source="FINANCE" id={row.id} label={money(row.amount)} onSaved={reload}/>}
          </div></td>}
          <td>{row.occurredOn}</td>
          <td>{row.clientId?"Client":"Self"}</td>
          <td>{row.clientId
            ?(row.client?<Link className="underline" href={"/app/clients/"+row.client.id}>{row.client.businessName}</Link>:"Client unavailable")
            :"—"}</td>
          <td>{money(row.amount)}</td><td>{row.method.replaceAll("_"," ")}</td>
          <td><span className={"aw-finance-status status-"+row.status.toLowerCase()}>{row.status}</span></td>
          <td>{row.enteredBy.displayName}</td><td>{row.description||"—"}</td>
          <td>{row.receiptAssetId?<button type="button" disabled={busy} className="btn-secondary text-xs" onClick={()=>void showReceipt(row.id)}>Proof</button>:"—"}</td>
          <td>{row.approvalRequestId?<Link className="underline" href={"/app/approvals?focus="+encodeURIComponent(row.approvalRequestId)}>View approval</Link>:"—"}</td>
        </tr>)}</tbody></table>
      </div></>}
      {metaAdEntries.length>0&&!filteredMetaAdEntries.length&&<div className="aw-v5-no-matches" role="status">
       {metaFundingFilter==="CLIENT"&&!metaSearch.trim()&&clientMetaAdCount===0?<>
         <p>No Meta Ads entries are linked to a client. {agencyMetaAdCount} {agencyMetaAdCount===1?"entry is":"entries are"} currently marked Agency. Review those records and assign only the ones actually funded by clients.</p>
         <button type="button" onClick={()=>setMetaFundingFilter("SELF")}>Review {agencyMetaAdCount} Agency {agencyMetaAdCount===1?"entry":"entries"}</button>
       </>:<>
         <p>No Meta Ads records match these filters.</p>
         <button type="button" onClick={()=>{setMetaSearch("");setMetaFundingFilter("ALL");}}>Clear filters</button>
       </>}
      </div>}
    </Card>
    <FinancePager page={page} total={total} onChange={setPage} disabled={loading}/></>}
    {section==="entries"&&<>
    <div id="finance-register" className="aw-v5-finance-anchor"/>
    <Card title={view==="all"?"Agency financial register":"My financial register"}
      description="Agency income and expense records. Use the classified register views for salary, client ads and internal settlements. Search and CSV apply to the entire selected range.">
      <div className="aw-v5-register-filters" aria-label="Financial register filters">
       <label className="aw-v5-register-search"><Search size={16} aria-hidden="true"/>
        <span className="sr-only">Search financial entries</span>
        <input type="search" aria-label="Search financial entries" value={entrySearch}
         placeholder="Search category, payee or member" onChange={e=>setEntrySearch(e.target.value)}/>
       </label>
       <select className="field" aria-label="Filter ledger by kind" value={entryKindFilter}
        onChange={e=>setEntryKindFilter(e.target.value as "ALL"|Kind)}>
        <option value="ALL">All types</option><option value="INCOME">Income</option><option value="EXPENSE">Expense</option>
       </select>
       <select className="field" aria-label="Filter financial entry status" value={entryStatusFilter}
        onChange={e=>setEntryStatusFilter(e.target.value as "ALL"|Entry["status"])}>
        <option value="ALL">All statuses</option>{(["POSTED","PENDING","REJECTED","CANCELLED"] as const).map(value=>
         <option key={value} value={value}>{value}</option>)}
       </select>
       <select className="field" aria-label="Filter finance category" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">All categories</option>{categories.filter(c=>entryKindFilter==="ALL"||c.kind===entryKindFilter).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
       <span className="aw-v5-register-count">{total} matching records · Page {page}</span>
      </div>
      {loading&&!hasLoadedEntries?<Spinner label="Loading financial entries…"/>:
        !entries.length&&!error?<EmptyState title="No entries yet" description="Submitted income and expense records appear here after entry."/>:
        !entries.length?<Notice kind="error">The financial register could not be loaded. Saved entries have not been deleted. Retry Refresh.</Notice>:
        <><div className="space-y-3 md:hidden" role="region" aria-label="Financial entries mobile view">
          {filteredEntries.map(row=><article key={row.id} className="rounded-xl border border-white/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <strong>{money(row.amount)}</strong>
              <span className={"aw-finance-status status-"+row.status.toLowerCase()}>{row.status}</span>
            </div>
            <p className="text-sm">{row.occurredOn} · {row.kind} · {row.category.name}</p>
            <p className="text-sm">By: {row.enteredBy.displayName}</p>
            {row.submittedBy&&row.submittedBy.displayName!==row.enteredBy.displayName&&
              <p className="text-xs">Submitted by: {row.submittedBy.displayName}</p>}
            {row.description&&<p className="text-sm break-words">{row.description}</p>}
            {adminFinance&&row.sourceType==="FINANCE"&&row.status!=="CANCELLED"&&!row.reversesId&&!row.reversedBy&&
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>beginEntryEdit(row)}>Edit fields</button>
                <button type="button" className="btn-secondary text-xs" disabled={busy} onClick={()=>void deleteEntry(row)}>Delete</button>
              </div>}
            {row.receiptAssetId&&<button type="button" className="btn-secondary text-xs" onClick={()=>void showReceipt(row.id)}>Proof</button>}
          </article>)}
        </div>
        <div className="aw-finance-register-scroll hidden md:block" role="region" aria-label="Financial register" tabIndex={0}><table className="aw-finance-register">
          <thead><tr className="border-b text-xs uppercase text-slate-500">
            {(adminFinance||isFounder)&&<th className="pb-3 pr-4">Actions</th>}
            {["Date","Type","Category","Source","Notes","Amount","Status","Assigned to","Receipt","Approval"].map(x=><th key={x} className="pb-3 pr-4">{x}</th>)}
          </tr></thead><tbody>{filteredEntries.map(row=><tr key={row.id} id={"finance-"+row.id}>
            {(adminFinance||isFounder)&&<td className="py-3 pr-4">
              {adminFinance&&row.sourceType==="FINANCE"&&row.status!=="CANCELLED"&&!row.reversesId&&!row.reversedBy&&<div className="flex items-center gap-2">
                <button type="button" className="btn-secondary text-xs" disabled={busy}
                  onClick={()=>beginEntryEdit(row)} aria-label={"Edit "+row.kind.toLowerCase()+" "+row.id}>Edit</button>
                <button type="button" className="btn-secondary text-xs" disabled={busy}
                  onClick={()=>void deleteEntry(row)} aria-label={"Delete "+row.kind.toLowerCase()+" "+row.id}>Delete</button>
              </div>}
              {row.status==="POSTED"&&!row.reversesId&&!row.reversedBy&&<ReversalButton source="FINANCE" id={row.id} label={money(row.amount)} onSaved={reload}/>}
            </td>}
            <td className="py-3 pr-4">{row.occurredOn}</td>
            <td>{row.sourceType==="SETTLEMENT"?
              <span className="inline-flex items-center gap-1 text-sm text-slate-300">
                {row.settlementDirection==="INCOMING"?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}
                {row.settlementDirection==="INCOMING"?"Settlement In":"Settlement Out"}
              </span>:
              <span className={"aw-finance-kind "+(row.kind==="INCOME"?"income":"expense")}>
                {row.kind==="INCOME"?<ArrowDownLeft size={16}/>:<ArrowUpRight size={16}/>}
                {row.kind==="INCOME"?"Income":"Expense"}
              </span>}</td>
            <td className="py-3 pr-4">{row.sourceType==="SETTLEMENT"?
               <span className="inline-flex items-center rounded-md border border-slate-500/40 px-2 py-1 text-xs font-semibold text-slate-300">Internal Settlement</span>:
               row.sourceType==="SALARY"?<span className="inline-flex items-center rounded-md bg-violet-500/15 px-2 py-1 text-xs font-semibold text-violet-400">Salary</span>:row.category.name}</td>
            <td className="py-3 pr-4">{row.merchantOrSource||"—"}</td>
            <td className="py-3 pr-4"><div className="min-w-40 max-w-80 whitespace-pre-wrap break-words text-sm" title={row.description??undefined}>{row.description?.trim()||"—"}</div></td>
            <td className={row.sourceType==="SETTLEMENT"?"aw-finance-amount text-slate-300":"aw-finance-amount "+(row.kind==="INCOME"?"income":"expense")}>
              {row.sourceType==="SETTLEMENT"?(row.settlementDirection==="OUTGOING"?"−":"+"):""}{money(row.amount)}
              {row.sourceType==="SETTLEMENT"&&<small className="block font-normal opacity-60">{"Debits sender and credits recipient accounts"}</small>}
            </td>
            <td><span className={"aw-finance-status status-"+row.status.toLowerCase()}>{row.status}</span></td>
            <td className="py-3 pr-4"><strong>{row.enteredBy.displayName}</strong>
              {row.submittedBy&&row.submittedBy.displayName!==row.enteredBy.displayName&&
               <span className="aw-finance-original-submitter">Submitted by {row.submittedBy.displayName}</span>}</td>
            <td className="py-3">{row.receiptAssetId?
              <button type="button" className="btn-secondary" disabled={busy} aria-label={"View receipt for "+row.occurredOn}
                onClick={()=>void showReceipt(row.id)}><FileImage size={16}/> Proof</button>:"—"}</td>
            <td className="py-3"><div className="flex items-center gap-2">
              {row.sourceType==="SETTLEMENT"?<>
                <span className="text-xs text-slate-500">Personal balance transfer; excluded from company income and expenses</span>
                {row.settlementDirection==="OUTGOING"&&row.status!=="CANCELLED"&&
                  <button type="button" className="btn-secondary text-xs" disabled={busy}
                    onClick={()=>void voidSettlement(row)}>Void settlement</button>}
              </>:
                row.sourceType==="SALARY"?<Link href="/app/salary" className="aw-finance-approval-link">View salary</Link>:
                row.approvalRequestId?<Link href={"/app/approvals?focus="+encodeURIComponent(row.approvalRequestId)} className="aw-finance-approval-link">View approval</Link>:null}

            </div></td>
          </tr>)}</tbody></table></div></>}
      {entries.length>0&&!filteredEntries.length&&<p className="aw-v5-no-matches" role="status">
       No transactions match these filters.
       <button type="button" onClick={()=>{setEntrySearch("");setEntryKindFilter("ALL");setEntryStatusFilter("ALL");}}>Clear filters</button>
      </p>}
    </Card>
    <FinancePager page={page} total={total} onChange={setPage} disabled={loading}/></>}
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
    {adminFinance&&editingEntry&&<div className="aw-finance-admin-overlay" role="presentation">
      <div className="aw-finance-admin-modal" role="dialog" aria-modal="true" aria-label={"Edit "+editingEntry.kind.toLowerCase()}>
        <h2>Edit {editingEntry.kind.toLowerCase()}</h2><p>Originally submitted by {editingEntry.submittedBy?.displayName??editingEntry.enteredBy.displayName}.
          Edit this {editingEntry.kind.toLowerCase()} entry or assign it to an active member of the company. Reassignment moves the entry between personal totals, without changing agency totals or the original submitter.</p>
        {assigneesError&&<Notice kind="error">{assigneesError}</Notice>}
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>void saveEntry(e)}>
          <FormField id="admin-expense-category" label={editingEntry.kind==="INCOME"?"Income category":"Expense category"}><select id="admin-expense-category" className="field" required value={entryEdit.categoryId}
            onChange={e=>{setEntryEdit(v=>({...v,categoryId:e.target.value,clientId:null}));setEditAdFunding("SELF");}}>
            {categories.filter(c=>c.kind===editingEntry.kind&&(c.active||c.id===editingEntry.category.id)).map(c=>
              <option key={c.id} value={c.id}>{c.name}{!c.active?" (archived)":""}</option>)}
          </select></FormField>
          {editingEntry.kind==="EXPENSE"&&isMetaAdsCategory(categories.find(c=>c.id===entryEdit.categoryId)??editingEntry.category)&&<>
            <FormField id="edit-meta-payer" label="Meta Ads paid by">
              <select id="edit-meta-payer" className="field" value={editAdFunding} onChange={e=>{setEditAdFunding(e.target.value as "SELF"|"CLIENT");setEntryEdit(v=>({...v,clientId:null}));}}>
                <option value="SELF">Self (agency expense)</option>
                <option value="CLIENT">Client (separate ad spend)</option>
              </select>
            </FormField>
            {editAdFunding==="CLIENT"&&<FormField id="edit-meta-client" label="Client">
              <select id="edit-meta-client" className="field" required value={entryEdit.clientId??""}
                onChange={e=>setEntryEdit(v=>({...v,clientId:e.target.value||null}))}>
                <option value="">Select paying client</option>
                {editingEntry.client&&!metaAdClients.some(c=>c.id===editingEntry.client?.id)&&
                  <option value={editingEntry.client.id}>{editingEntry.client.businessName} (existing)</option>}
                {metaAdClients.map(c=><option key={c.id} value={c.id}>{c.businessName}</option>)}
              </select>
              {metaAdClientsError&&<p className="mt-2 text-sm text-red-400" role="alert">{metaAdClientsError}</p>}
              {!metaAdClientsError&&!metaAdClients.length&&<p className="mt-2 text-xs text-slate-400">No active clients available in this workspace.</p>}
            </FormField>}
          </>}
          <FormField id="admin-expense-assignee" label={"Assign "+editingEntry.kind.toLowerCase()+" to"}>
            <select id="admin-expense-assignee" className="field" required value={entryEdit.enteredById}
              onChange={e=>setEntryEdit(v=>({...v,enteredById:e.target.value}))}>
              {!assignees.some(user=>user.id===editingEntry.enteredById)&&
                <option value={editingEntry.enteredById}>{editingEntry.enteredBy.displayName} (current)</option>}
              {assignees.map(user=><option key={user.id} value={user.id}>{user.displayName} ({user.loginId})</option>)}
            </select>
          </FormField>
          <FormField id="admin-expense-amount" label="Amount (INR)"><input id="admin-expense-amount" className="field" inputMode="decimal" required
            pattern="(0|[1-9][0-9]{0,14})([.][0-9]{1,4})?" value={entryEdit.amount}
            onChange={e=>setEntryEdit(v=>({...v,amount:e.target.value}))}/></FormField>
          <FormField id="admin-expense-date" label="Date"><input id="admin-expense-date" type="date" className="field" required
            value={entryEdit.occurredOn} onChange={e=>setEntryEdit(v=>({...v,occurredOn:e.target.value}))}/></FormField>
          <FormField id="admin-expense-method" label="Payment method"><select id="admin-expense-method" className="field" value={entryEdit.method}
            onChange={e=>setEntryEdit(v=>({...v,method:e.target.value}))}>{modes.map(m=><option key={m} value={m}>{m}</option>)}</select></FormField>
          <div className="sm:col-span-2"><FormField id="admin-expense-payee" label={editingEntry.kind==="INCOME"?"Income source":"Merchant / payee"}>
            <input id="admin-expense-payee" className="field" maxLength={160} value={entryEdit.merchantOrSource}
              onChange={e=>setEntryEdit(v=>({...v,merchantOrSource:e.target.value}))}/></FormField></div>
          <div className="sm:col-span-2"><FormField id="admin-expense-desc" label="Notes"><textarea id="admin-expense-desc" className="field" maxLength={2000}
              value={entryEdit.description} onChange={e=>setEntryEdit(v=>({...v,description:e.target.value}))}/></FormField></div>
          <div className="sm:col-span-2 aw-finance-admin-actions"><button type="button" className="btn-secondary" onClick={()=>setEditingEntry(null)}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={busy||!entryEdit.categoryId||!entryEdit.enteredById}>Save {editingEntry.kind.toLowerCase()}</button></div>
        </form>
      </div>
    </div>}
  </div>;
}
