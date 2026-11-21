#!/usr/bin/env node
/**
 * UI v2 compatibility guard.
 *
 * Changing the sidebar is allowed. Deleting an existing bookmarked route is
 * not: merged/hidden destinations still need a protected page or redirect.
 *
 * Run: node apps/web/scripts/verify-route-compat.mjs
 */
import {access,readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import path from "node:path";

export const phase0Routes = [
  "", "dashboard", "leads", "follow-ups", "meetings",
  "clients", "clients/[id]",
  "tasks", "task-history", "finance", "quotations", "agreements",
  "reports", "reports/leads", "reports/[kind]",
  "messages", "notes", "notes/list", "content", "assets",
  "approvals", "founders", "integrations/chatgpt",
  "settings", "team/users", "profile", "search", "notifications",
  "billing", "profitability", "projects",
];

// Regression guard: the Meta Ads summary must receive the same selected
// finance visibility and date range as the transaction register. Dropping
// these gateway query parameters once caused 19 entries to appear as 6.
const gateway=await readFile(fileURLToPath(new URL("../src/app/api/v1/[...path]/route.ts",import.meta.url)),"utf8");
const missingFinanceFilters=[];
if(!gateway.includes('"finance/meta-ads-distribution"].includes(path)')||
   !gateway.includes('url.searchParams.set("view", view)'))
  missingFinanceFilters.push("agency/mine visibility");
if(!gateway.includes('if(path==="finance/meta-ads-distribution"){')||
   !gateway.includes('for(const key of ["from","to"])'))
  missingFinanceFilters.push("inclusive from/to dates");
if(missingFinanceFilters.length){
  process.stderr.write("Meta Ads proxy query forwarding missing: "+missingFinanceFilters.join(", ")+"\\n");
  process.exitCode=1;
}
// Founders' personal settlement history has its own GET endpoint. A missing
// gateway allowlist entry silently presented valid settlements as "none".
if(!gateway.includes('"finance/internal-settlements/mine": ["GET"]')){
  process.stderr.write("Finance proxy must permit GET /finance/internal-settlements/mine.\\n");
  process.exitCode=1;
}

// Direct expenses (including Tool Subscriptions) must reach the backend for
// every signed-in user. A missing proxy allowlist entry returns a misleading
// 404 "Route not found" before the expense can be recorded.
if(!gateway.includes('"finance/expenses/mine": ["POST"]')){
  process.stderr.write("Finance proxy must permit POST /finance/expenses/mine for direct expenses.\n");
  process.exitCode=1;
}

// The cycle-balance endpoint needs both the Next.js gateway allowlist and the
// original date/visibility parameters. A missing route silently hid balances.
// Check the route set and forwarded parameter set independently, rather
// than requiring unrelated route names to be adjacent in a particular order.
const financeForwarding = Array.from(gateway.matchAll(/if\(\s*(\[[^\]]*\])\.includes\(path\)\s*\)\s*\{\s*for\(const key of\s*(\[[^\]]*\])/g))
  .map(match => ({routes:JSON.parse(match[1]), keys:JSON.parse(match[2])}));
for(const route of ["finance/cycle-balance","finance/summary","finance/internal-settlements/mine","finance/internal-settlements/all","finance/client-ad-spend/mine"]){
  if(!gateway.includes('"'+route+'": ["GET"]') ||
     !financeForwarding.some(group => group.routes.includes(route) &&
       ["from","to","view"].every(key => group.keys.includes(key)))){
    process.stderr.write("Finance gateway must permit and forward from/to/view for "+route+"\n");
    process.exitCode=1;
  }
}
// Every manual cycle endpoint must reach the API; the API still verifies
// authorization, the period boundary and the submitted confirmation totals.
for(const [route,method] of [["finance/cycle-state","GET"],["finance/cycle-confirmation","GET"],["finance/cycle-close-simple","POST"]]){
  if(!gateway.includes('"'+route+'": ["'+method+'"]') ||
     !gateway.includes('|| path==="'+route+'"')){
    process.stderr.write("Finance gateway must permit and diagnose "+method+" /"+route+"\n");
    process.exitCode=1;
  }
}
if(!gateway.includes('|| path==="finance/cycle-balance"')){
  process.stderr.write("The Finance proxy must report outdated backend cycle routes explicitly.\n");
  process.exitCode=1;
}

for(const route of ['finance/client-ad-spend/mine','finance/internal-settlements/all']){
  if(!gateway.includes('"'+route+'": ["GET"]') ||
     !gateway.includes('"'+route+'"') ||
     !gateway.includes('|| path==="'+route+'"')){
    process.stderr.write("Finance gateway must permit, forward and diagnose "+route+"\\n");
    process.exitCode=1;
  }
}

const appDir=fileURLToPath(new URL("../src/app/app/",import.meta.url));
const missing=[];
for(const segment of phase0Routes){
  const file=path.join(appDir,segment,"page.tsx");
  try{await access(file);}catch{missing.push(segment?"/app/"+segment:"/app");}
}
if(missing.length){
  process.stderr.write("UI v2 backward-compatible routes missing:\n"+missing.map(x=>" - "+x).join("\n")+"\n");
  process.exitCode=1;
}else{
  process.stdout.write("UI v2 route contract: "+phase0Routes.length+" existing authenticated routes retained.\n");
}
