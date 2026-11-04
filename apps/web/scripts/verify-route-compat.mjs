#!/usr/bin/env node
/**
 * UI v2 compatibility guard.
 *
 * Changing the sidebar is allowed. Deleting an existing bookmarked route is
 * not: merged/hidden destinations still need a protected page or redirect.
 *
 * Run: node apps/web/scripts/verify-route-compat.mjs
 */
import {access} from "node:fs/promises";
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
