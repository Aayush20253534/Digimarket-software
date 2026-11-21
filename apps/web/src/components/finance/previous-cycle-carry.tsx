"use client";
import {useEffect,useState} from "react";
import Link from "next/link";
import {type ReportingPeriod} from "@digimarket/contracts";
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
  const [previous,setPrevious]=useState<ReportingPeriod|null>(null);
  useEffect(()=>{let active=true;setPrevious(null);if(!session)return;void request<{current:ReportingPeriod;history:ReportingPeriod[]}>("/finance/cycle-state").then(s=>{if(!active||!s?.current||!Array.isArray(s.history))return;const cycles=[s.current,...s.history];const i=cycles.findIndex(c=>c.from===period.from&&c.to===period.to);if(i>=0)setPrevious(cycles[i+1]??null);}).catch(()=>{});return()=>{active=false};},[session,request,period.from,period.to]);
  const [result,setResult]=useState<{postedNet:string}|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    setResult(null);setError("");
    if(!previous||!session)return;
    let active=true;
    const query=new URLSearchParams({from:previous.from,to:previous.to,view}).toString();
    void request<{postedNet:string}>("/finance/summary?"+query)
      .then(value=>{if(active)setResult(value)})
      .catch(()=>{if(active)setError("Previous cycle net unavailable")});
    return()=>{active=false};
  },[session,request,previous,view]);
  if(!previous)return null;
  const url="/app/finance/cycles?"+new URLSearchParams({from:previous.from,to:previous.to,view}).toString();
  return <Card>
    <p className="text-sm font-semibold">Previous cycle net posted</p>
    <strong className="mt-2 block text-2xl">{result?money(result.postedNet):error||"…"}</strong>
    <p className="mt-1 text-sm text-slate-400">From {previous.from} to {previous.to}. This is last cycle's net after expenses, salaries and client ads. It is a brought-forward reference, not fresh income and is not added again to this cycle's posted income.</p>
    <Link className="mt-3 inline-block text-sm text-violet-300 underline" href={url}>View source cycle</Link>
  </Card>;
}
