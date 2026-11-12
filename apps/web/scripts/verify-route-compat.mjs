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
  "clients", "clients/[id]", "deliveries",
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
