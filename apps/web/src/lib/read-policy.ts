/** Read-only, short-lived browser snapshots; financial totals and editable details stay live. */
export const readGroup=(path:string)=>path.split("?")[0].split("/")[1]??"";
export function readFreshness(path:string){
 const route=path.split("?")[0];
 if(route==="/clients")return 20_000;
 if(["/leads","/leads/metrics","/leads/follow-ups","/leads/follow-ups/today","/leads/meetings","/leads/meetings/today","/leads/meetings/history","/reports/leads","/reports/client-delivery"].includes(route))return 10_000;
 if(["/quotations","/agreements"].includes(route))return 15_000;
 return 0;
}
/** Unknown or cross-cutting writes conservatively invalidate everything. */
export function affectedReadGroups(path:string):string[]|null{
 switch(readGroup(path)){
  case "leads":return ["leads","clients","reports","quotations","agreements"];
  case "clients":return ["clients","reports","quotations","agreements"];
  case "quotations":case "agreements":return ["quotations","agreements","clients","reports"];
  case "notifications":case "notes":case "messages":return [readGroup(path)];
  default:return null;
 }
}
export function prefetchPaths(href:string):string[]{
 switch(href){
  case "/app/clients":return ["/clients?limit=30&section=current&sort=businessName&direction=asc&workspace=1"];
  case "/app/follow-ups":return ["/leads/follow-ups?limit=20&view=all"];
  case "/app/meetings":return ["/leads/meetings?limit=20"];
  default:return [];
 }
}
