"use client";
import {money} from "./shared";
import {Notice,Spinner} from "@/components/ui";
export type FounderBalance={founderUserId:string;name:string;financeNetBeforeSalary:string;salaryFunded:string;remaining:string};
const validAmount=(value:unknown):value is string=>typeof value==="string"&&/^-?\d+(?:\.\d{1,4})?$/.test(value);
export function readFounderBalances(value:unknown):FounderBalance[]|null{
 if(!value||typeof value!=="object"||!("founderBalances" in value)||!Array.isArray(value.founderBalances))return null;
 const rows:unknown[]=value.founderBalances;
 if(!rows.every((r):r is FounderBalance=>!!r&&typeof r==="object"&&"founderUserId" in r&&typeof r.founderUserId==="string"&&"name" in r&&typeof r.name==="string"&&"financeNetBeforeSalary" in r&&validAmount(r.financeNetBeforeSalary)&&"salaryFunded" in r&&validAmount(r.salaryFunded)&&"remaining" in r&&validAmount(r.remaining)))return null;
 if(new Set(rows.map(r=>r.founderUserId)).size!==rows.length)return null;
 return rows;
}
function units(value:string){const negative=value.startsWith("-"),[whole,decimal=""]=value.replace(/^-/,"").split(".");return (BigInt(whole)*10000n+BigInt(decimal.padEnd(4,"0")))*(negative?-1n:1n);}
function decimal(value:bigint){const absolute=value<0n?-value:value;return (value<0n?"-":"")+(absolute/10000n)+"."+(absolute%10000n).toString().padStart(4,"0");}
export function FounderBalanceCards({rows,loading=false,error=""}:{rows:FounderBalance[]|null;loading?:boolean;error?:string}){
 return <section className="space-y-3 min-w-0" aria-label="Finance-linked founder balances">
 <h2 className="text-lg font-semibold">Founder Finance balances</h2>
 <p className="text-sm text-slate-400">All-time posted balances, including client Meta Ads, salary funding and internal settlements. These are attributed Finance balances, not verified bank balances. Changing the work cycle does not reset them.</p>
 {error?<Notice kind="error">{error}</Notice>:loading?<Spinner label="Loading founder Finance balances…"/>:rows===null?<Notice kind="error">Founder balances unavailable. No legacy balance will be substituted.</Notice>:rows.length===0?<p className="text-sm text-slate-400">No active founders found.</p>:<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{rows.map(r=><article key={r.founderUserId} className="rounded-xl border border-white/10 p-4 min-w-0 space-y-2" data-testid={"founder-finance-balance-"+r.founderUserId}>
 <h3 className="font-semibold break-words">{r.name}</h3><p className="text-2xl font-semibold break-words">{money(r.remaining)}</p><p className="text-xs text-slate-400">Remaining Finance balance · all time</p>
 <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-2 text-sm border-t border-white/10 pt-3"><span>Net before salary</span><strong>{money(r.financeNetBeforeSalary)}</strong><span>Salary funded</span><strong>{money(r.salaryFunded)}</strong><span>Net settlements</span><strong>{money(decimal(units(r.remaining)-units(r.financeNetBeforeSalary)+units(r.salaryFunded)))}</strong></div>
 </article>)}</div>}
 </section>;
}
