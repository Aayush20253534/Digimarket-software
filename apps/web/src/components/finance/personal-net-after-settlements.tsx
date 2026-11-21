"use client";

import type {ReportingPeriod} from "@digimarket/contracts";
import {useEffect,useState} from "react";
import {useAuth} from "@/components/auth-provider";
import {Card} from "@/components/ui";
import {money} from "./shared";

type Settlement={
  amount:string;
  status:"POSTED"|"CANCELLED";
  settlementDirection:"INCOMING"|"OUTGOING";
};
type ExpenseSummary={netOperatingMoney:string};
type Calculation={operating:string;received:string;sent:string;after:string};

/** Exact 4-decimal INR arithmetic. A settlement is a transfer, not revenue. */
function units(value:string):bigint{
  const match=/^(-?)(\d+)(?:\.(\d{1,4}))?$/.exec(value);
  if(!match)throw new Error("Invalid financial amount");
  const absolute=BigInt(match[2])*10000n+BigInt((match[3]??"").padEnd(4,"0"));
  return match[1]==="-"?-absolute:absolute;
}
function decimal(value:bigint):string{
  const negative=value<0n,absolute=negative?-value:value;
  return (negative?"-":"")+(absolute/10000n).toString()+"."+(absolute%10000n).toString().padStart(4,"0");
}
export function calculatePersonalNet(operating:string,rows:Settlement[]):Calculation{
  let received=0n,sent=0n;
  for(const row of rows){
    if(row.status!=="POSTED")continue; // Voided transfers never affect balances.
    if(row.settlementDirection==="INCOMING")received+=units(row.amount);
    else if(row.settlementDirection==="OUTGOING")sent+=units(row.amount);
  }
  return {operating,received:decimal(received),sent:decimal(sent),
    after:decimal(units(operating)+received-sent)};
}

/**
 * Show personal cash-flow movement separately from operating profit. Read the
 * original settlement history rather than creating fake income transactions.
 * Date-scoped values restart each work cycle; account balances carry forward.
 */
export function PersonalNetAfterSettlements({period}:{period:ReportingPeriod}){
  const {session,request}=useAuth();
  const founder=!!session?.identity.roles.includes("FOUNDER");
  const [data,setData]=useState<Calculation|null>(null);
  const [error,setError]=useState("");
  useEffect(()=>{
    if(!session||!founder)return;
    let active=true;
    setData(null);setError("");
    const query=new URLSearchParams({view:"mine",from:period.from,to:period.to}).toString();
    void Promise.all([
      request<ExpenseSummary>("/finance/total-expenses/summary?"+query),
      request<Settlement[]>("/finance/internal-settlements/mine?"+query)
    ]).then(([summary,settlements])=>{
      if(!active)return;
      if(settlements.length>=200){
        setError("Settlement history needs review: result limit reached.");
        return;
      }
      setData(calculatePersonalNet(summary.netOperatingMoney,settlements));
    }).catch(()=>{if(active)setError("Unable to reconcile the personal settlement total.");});
    return()=>{active=false};
  },[session,founder,request,period.from,period.to]);
  if(!founder)return null;
  return <Card>
    <p className="text-sm text-slate-400">My net after internal settlements · this cycle</p>
    <strong className="mt-2 block text-2xl">{data?money(data.after):error||"…"}</strong>
    {data&&<p className="mt-2 text-sm text-slate-400">
      Operating net {money(data.operating)} + received {money(data.received)} − sent {money(data.sent)}
    </p>}
    <p className="mt-2 text-xs text-slate-500">
      Settlements change your personal money movement, not company income or operating profit.
      The carried-forward account balance is shown separately.
    </p>
  </Card>;
}
