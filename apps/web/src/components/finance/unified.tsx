"use client";
import {Suspense,useEffect,useState,useCallback} from "react";
import {useSearchParams} from "next/navigation";
import Link from "next/link";
import {useAuth} from "@/components/auth-provider";
import {BusinessWorkspaceNav} from "@/components/business-workspace-nav";
import {BusinessPeriodPicker} from "@/components/business-period-picker";
import {PageHeader,Spinner,Notice} from "@/components/ui";
import {FinanceScope,useFinanceWindow} from "./shared";
import {ActivityRegister} from "./activity";
import {FinanceOverviewContent} from "./overview";
import {FinanceSectionWorkspace} from "./section-workspace";
import {SalaryWorkspace} from "./salary-workspace";
import {TotalExpenses} from "./total-expenses";
import {AccountsOverview} from "./ledgers";
import FinanceCyclesPage from "@/app/app/finance/cycles/page";
type Tab="overview"|"transactions"|"salary"|"accounts"|"cycles";
type Mode="EXPENSE"|"INCOME"|"SALARY";
const tabs:Tab[]=["overview","transactions","salary","accounts","cycles"];
const registers=[["all","All transactions"],["agency","Income & operating expenses"],["total","All posted expenses"],["self","Agency Meta Ads"],["client","Client Meta Ads"],["salary","Salary payments"],["settlement","Internal settlements"]] as const;
type Register=typeof registers[number][0];
export function UnifiedFinance({initialTab="overview"}:{initialTab?:Tab}={}){return <Suspense fallback={<Spinner label="Loading Finance workspace…"/>}><FinanceWorkspace initialTab={initialTab}/></Suspense>}
function FinanceWorkspace({initialTab}:{initialTab:Tab}){
 const searchParams=useSearchParams(),requestedTab=searchParams.get("tab");
 const {session}=useAuth(),w=useFinanceWindow();
 const [tab,setTab]=useState<Tab>(initialTab),[mode,setMode]=useState<Mode>("EXPENSE"),[register,setRegister]=useState<Register>("all"),[refresh,setRefresh]=useState(0);
 const reload=useCallback(()=>setRefresh(v=>v+1),[]);
 const allowed=!!session?.identity.permissions.some(p=>p==="finance.read.all"||p==="finance.entry.read.own"),all=!!session?.identity.permissions.includes("finance.read.all"),founder=!!session?.identity.roles.includes("FOUNDER"),canCreate=!!session?.identity.permissions.includes("finance.entry.create");
 useEffect(()=>{setTab(requestedTab&&tabs.includes(requestedTab as Tab)?requestedTab as Tab:initialTab);},[requestedTab,initialTab]);
 const active=allowed?tab:"salary";
 function changeTab(next:Tab){setTab(next);const q=new URLSearchParams(window.location.search);q.set("tab",next);window.history.replaceState(null,"",window.location.pathname+"?"+q.toString());if(next==="salary"&&founder)setMode("SALARY");else if(mode==="SALARY")setMode("EXPENSE");}
 if(!session)return <Spinner label="Checking Finance access…"/>;
 return <main className="aw-finance-page aw-v5-finance-page fc-workspace space-y-4" data-aw-module="finance">
 <BusinessWorkspaceNav/><PageHeader title="Finance" description="Income, expenses, salary payments and balances in one workspace." actions={<button type="button" className="btn-secondary" onClick={reload}>Refresh</button>}/>
 {<><BusinessPeriodPicker value={w.period} onChange={w.setPeriod} financeCycles={w.cycleState?[w.cycleState.current,...w.cycleState.history]:undefined}/>{w.cycleError&&<Notice kind="error">{w.cycleError}</Notice>}{allowed&&<div className="fc-tabs" role="group" aria-label="Finance visibility"><button type="button" className={w.view==="mine"?"btn-primary":"btn-secondary"} onClick={()=>w.setView("mine")}>My entries</button>{all&&<button type="button" className={w.view==="all"?"btn-primary":"btn-secondary"} onClick={()=>w.setView("all")}>Agency totals &amp; register</button>}</div>}</>}
 <nav className="fc-tabs" aria-label="Finance workspace sections">{(allowed?tabs:["salary"] as Tab[]).map(t=><button key={t} type="button" aria-current={active===t?"page":undefined} className={active===t?"btn-primary":"btn-secondary"} onClick={()=>changeTab(t)}>{t==="salary"?(founder?"Salary":"My salary"):t[0].toUpperCase()+t.slice(1)}</button>)}</nav>
 <FinanceScope window={w} refresh={refresh} onMutation={reload}>
 {((allowed&&canCreate)||founder)&&<section className="fc-quick" aria-label="Quick transaction entry"><div className="fc-heading"><h2>Quick entry</h2><span>Record a completed transaction</span></div><div className="fc-tabs" role="group" aria-label="Quick entry type">{(allowed&&canCreate?(founder?["EXPENSE","INCOME","SALARY"]:["EXPENSE","INCOME"]):["SALARY"] as Mode[]).map(m=><button type="button" key={m} aria-pressed={(active==="salary"&&founder?"SALARY":mode)===m} className={(active==="salary"&&founder?"SALARY":mode)===m?"btn-primary":"btn-secondary"} onClick={()=>{if(active==="salary"&&m!=="SALARY")changeTab("overview");setMode(m as Mode)}}>{m==="EXPENSE"?"+ Expense":m==="INCOME"?"+ Income":"+ Salary"}</button>)}</div>{(active==="salary"&&founder||mode==="SALARY"||!canCreate)&&founder?<SalaryWorkspace paymentOnly/>:<FinanceSectionWorkspace key={mode} section="entries" quickKind={mode==="INCOME"?"INCOME":"EXPENSE"}/>}</section>}
 {active==="overview"&&<><FinanceOverviewContent w={w} refresh={refresh}/><ActivityRegister recent/></>}
 {active==="transactions"&&<section className="space-y-4"><div className="fc-tabs" role="group" aria-label="Transaction classification">{registers.filter(([id])=>id!=="settlement"||founder||all).map(([id,label])=><button type="button" key={id} aria-pressed={register===id} className={register===id?"btn-primary":"btn-secondary"} onClick={()=>setRegister(id)}>{label}</button>)}</div>{register==="all"?<ActivityRegister/>:register==="agency"?<FinanceSectionWorkspace key="agency" section="entries" registerOnly/>:register==="settlement"?<FinanceSectionWorkspace key="settlements" section="settlements"/>:register==="salary"?<SalaryWorkspace historyOnly/>:<TotalExpenses key={register} initialType={register==="self"?"SELF_ADS":register==="client"?"CLIENT_ADS":"ALL"}/>}</section>}
 {active==="salary"&&<SalaryWorkspace historyOnly/>}
 {active==="accounts"&&<section className="space-y-4"><div className="fc-tabs">{[["accounts","Account register"],["client-funds","Client funds"],["settlements","Internal settlements"],["transfers","Transfers"],["unassigned","Unassigned entries"]].filter(([path])=>all||founder&&path==="settlements").map(([path,label])=><Link key={path} href={"/app/finance/"+path+"?"+w.query} className="btn-secondary">{label}</Link>)}</div>{all?<AccountsOverview key={refresh}/>:<p>Account administration requires agency finance access.</p>}{founder&&<SalaryWorkspace fundingOnly hideBalances={all}/>}</section>}
 {active==="cycles"&&<><FinanceCyclesPage key={refresh}/>{all&&<Link className="btn-secondary" href={"/app/finance/closing?"+w.query}>Manual cycle closing</Link>}</>}
 </FinanceScope>
 {all&&<details className="fc-management"><summary>Finance management</summary><div className="fc-tabs">{[["categories","Manage categories"],["agreements","Agreement projections"],["ads","Detailed Meta Ads"],["closing","Close cycle"],["total-expenses","Total expense register"]].map(([path,label])=><Link className="btn-secondary" key={path} href={"/app/finance/"+path+"?"+w.query}>{label}</Link>)}</div></details>}
 </main>;
}