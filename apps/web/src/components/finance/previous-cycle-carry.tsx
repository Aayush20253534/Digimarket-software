"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {AGENCY_START_DATE,businessCycle,cycleLabel,type ReportingPeriod} from "@digimarket/contracts";
import {useAuth} from "@/components/auth-provider";
import {Card} from "@/components/ui";
import {money} from "./shared";

/**
 * Informational opening line. A prior-cycle net is NEVER inserted as fresh
 * FinancialTransaction income or included twice in current-cycle profit.
 */
export function PreviousCycleNetPosted({
  period,view,
}:{
  period:ReportingPeriod;
  view:"mine"|"all";
}){
  const {session,request}=useAuth();
  const current=businessCycle(period.from);
  const previous=businessCycle(period.from,-1);
  const completeCycle=current.from===period.from&&current.to===period.to;
  const eligible=completeCycle&&previous.from>=AGENCY_START_DATE;
  const [result,setResult]=useState<{postedNet:string}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    setResult(null);setError("");
    if(!eligible||!session)return;
    let active=true;
    const query=new URLSearchParams({from:previous.from,to:previous.to,view}).toString();
    void request<{postedNet:string}>("/finance/summary?"+query)
      .then(value=>{if(active)setResult(value)})
      .catch(()=>{if(active)setError("Previous cycle net unavailable")});
    return()=>{active=false};
  },[session,request,eligible,previous.from,previous.to,view]);
  if(!eligible)return null;
  const url="/app/finance/cycles?"+new URLSearchParams({from:previous.from,to:previous.to,view}).toString();
  return <Card>
    <p className="text-sm font-semibold">Previous cycle net posted</p>
    <strong className="mt-2 block text-2xl">{result?money(result.postedNet):error||"…"}</strong>
    <p className="mt-1 text-sm text-slate-400">From {cycleLabel(previous.key)}. This is last cycle's net after expenses, salaries and client ads. It is a brought-forward reference, not fresh income and is not added again to this cycle's posted income.</p>
    <Link className="mt-3 inline-block text-sm text-violet-300 underline" href={url}>View source cycle</Link>
  </Card>;
}
