"use client";
import {useCallback,useEffect,useState,type FormEvent} from "react";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {ApiError} from "@/lib/api";
import {Card,Notice,PageHeader,Spinner} from "@/components/ui";
type Organization={id:string;name:string;timezone:string;defaultCurrency:string;settingsVersion:number;createdAt:string};
type Billing={organizationId:string;invoicePrefix:string;defaultDueDays:number;
 paymentInstructions:string|null;version:number};
type Policy={category:string;name:string;active:boolean;approverRoleKeys:string[]};
type Settings={organization:Organization;billing:Billing;
 financeCategories:{kind:string;activeCount:number}[];
 approvalPolicies:Policy[];activeBillingSchedules:number};
const err=(e:unknown)=>e instanceof ApiError?e.message:e instanceof Error?e.message:"Settings request failed";
const categoryOrder=["GENERAL","FINANCE","CONTENT","DELIVERABLE"];
export default function CompanySettingsPage(){
 const {session,request}=useAuth();
 const canManage=!!session?.identity.permissions.includes("organization.settings.manage");
 const [settings,setSettings]=useState<Settings|null>(null);
 const [org,setOrg]=useState({name:"",timezone:"Asia/Kolkata"});
 const [bill,setBill]=useState({invoicePrefix:"INV",defaultDueDays:14,paymentInstructions:""});
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false);
 const [error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  if(!canManage){setLoading(false);return;}
  setLoading(true);
  try{
   const data=await request<Settings>("/company-settings");
   setSettings(data);setOrg({name:data.organization.name,timezone:data.organization.timezone});
   setBill({invoicePrefix:data.billing.invoicePrefix,defaultDueDays:data.billing.defaultDueDays,
    paymentInstructions:data.billing.paymentInstructions??""});
   setError("");
  }catch(e){setError(err(e));}finally{setLoading(false);}
 },[canManage,request]);
 useEffect(()=>{void load();},[load]);
 const submit=async(e:FormEvent,kind:"organization"|"billing")=>{
  e.preventDefault();if(!settings)return;
  setBusy(true);setError("");setSuccess("");
  try{
   if(kind==="organization")await request("/company-settings",{method:"PUT",body:{
    version:settings.organization.settingsVersion,...org}});
   else await request("/company-settings/billing",{method:"PUT",body:{
    version:settings.billing.version,invoicePrefix:bill.invoicePrefix,
    defaultDueDays:bill.defaultDueDays,paymentInstructions:bill.paymentInstructions||null}});
   await load();setSuccess(kind==="organization"?"Company profile updated.":"Billing defaults saved for future invoices.");
  }catch(e){setError(err(e));}finally{setBusy(false);}
 };
 if(!session)return <Spinner label="Checking settings access…"/>;
 if(!canManage)return <><PageHeader title="Company settings"/><Notice kind="error">Organization settings management permission required.</Notice></>;
 return <div className="space-y-6">
  <PageHeader eyebrow="Administration" title="Company settings"
   description="Manage workspace identity, team governance, finance categories and approval policies."/>
  {error&&<Notice kind="error">{error}</Notice>}
  {success&&<Notice kind="success">{success}</Notice>}
  {loading&&<Spinner label="Loading company configuration…"/>}
  {settings&&<>
   <div className="grid gap-5 xl:grid-cols-2">
    <Card title="Organization identity" description="The company timezone affects presentation defaults. Existing scheduled tasks retain their saved timezones.">
     <form className="space-y-4" onSubmit={e=>void submit(e,"organization")}>
      <label className="block text-sm">Business name
       <input className="field mt-1 w-full" required minLength={2} maxLength={160} value={org.name}
        onChange={e=>setOrg(s=>({...s,name:e.target.value}))}/>
      </label>
      <label className="block text-sm">IANA timezone
       <input className="field mt-1 w-full" required maxLength={80} list="organization-timezones" value={org.timezone}
        onChange={e=>setOrg(s=>({...s,timezone:e.target.value}))}/>
       <datalist id="organization-timezones"><option value="Asia/Kolkata"/><option value="UTC"/>
        <option value="Asia/Kathmandu"/><option value="America/New_York"/><option value="Europe/London"/></datalist>
      </label>
      <p className="text-sm text-slate-600">Accounting currency: <strong>{settings.organization.defaultCurrency}</strong>. Existing ledger entries retain their recorded currency.</p>
      <button className="btn-primary" disabled={busy}>{busy?"Saving…":"Save organization"}</button>
     </form>
    </Card>
   </div>
   <div className="grid gap-5 xl:grid-cols-2">
    <Card title="Finance expense & income categories" description="Categories are administered through the existing finance module. Changes do not rewrite posted ledger entries.">
     <div className="space-y-2">{(["INCOME","EXPENSE"] as const).map(kind=>
      <div key={kind} className="flex justify-between rounded-lg border p-3 text-sm">
       <span>{kind==="INCOME"?"Income":"Expense"} categories</span>
       <b>{settings.financeCategories.find(c=>c.kind===kind)?.activeCount??0} active</b></div>)}</div>
     <div className="mt-4 flex flex-wrap gap-2">
      {session.identity.permissions.includes("finance.category.manage")&&<Link href="/app/finance" className="btn-secondary">Manage finance categories</Link>}
      <Link href="/app/finance" className="text-sm text-indigo-700 underline">Finance ledger</Link>
     </div>
    </Card>
    <Card title="Approval policies" description="Content, deliverable, finance and general approvals retain their own policy controls and role checks.">
     <div className="space-y-2">{categoryOrder.map(kind=>{
      const policy=settings.approvalPolicies.find(x=>x.category===kind);
      return <div key={kind} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
       <span>{kind}</span><span className={policy?.active?"text-green-700":"text-slate-500"}>{policy?.active?"Active":"Not active"}</span>
      </div>;
     })}</div>
     {session.identity.permissions.includes("approvals.policy.manage")&&<Link href="/app/approvals"
      className="btn-secondary mt-4 inline-flex">Manage approval policies</Link>}
    </Card>
   </div>
   <Card title="Team governance" description="Manage roles without changing historical finance data.">
    <div className="flex flex-wrap gap-2">
     <Link href="/app/founders" className="btn-secondary">Founder responsibilities</Link>
     {session.identity.permissions.includes("users.read")&&<Link href="/app/team/users" className="btn-secondary">Account management</Link>}
    </div>
   </Card>
  </>}
 </div>;
}
