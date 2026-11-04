"use client";
import Link from "next/link";
import {useEffect,useState} from "react";
import type {LucideIcon} from "lucide-react";
import {
 BriefcaseBusiness,CalendarDays,CalendarClock,ChartNoAxesCombined,ChevronDown,
 CheckSquare2,FileStack,FolderKanban,LayoutDashboard,MessageCircle,
 Settings2,Users,Wallet
} from "lucide-react";

export type NavItem={label:string;href:string;icon:LucideIcon;permits?:readonly string[];roles?:readonly string[]};
export type NavGroup={title:string;items:readonly NavItem[]};

// Phase 2 navigation only; existing feature URLs and their API permissions stay intact.
const sections:readonly NavGroup[]=[
 {title:"Workspace",items:[{label:"Overview",href:"/app/dashboard",icon:LayoutDashboard}]},
 {title:"Sales & CRM",items:[
  {label:"Leads CRM",href:"/app/leads",icon:BriefcaseBusiness,permits:["leads.read"]},
  {label:"Follow-ups",href:"/app/follow-ups",icon:CalendarClock,permits:["leads.read"]},
  {label:"Meetings",href:"/app/meetings",icon:CalendarDays,permits:["leads.read"]},
  {label:"Clients",href:"/app/clients",icon:Users,permits:["clients.read"]}
 ]},
 {title:"Operations",items:[
  {label:"Client Deliveries",href:"/app/deliveries",icon:FolderKanban,permits:["clients.read"]},
  {label:"Tasks",href:"/app/tasks",icon:CheckSquare2,permits:["tasks.read"]}
 ]},
 {title:"Business",items:[
  {label:"Finance",href:"/app/finance",icon:Wallet,permits:["finance.entry.read.own","finance.read.all"]},
  {label:"Documents",href:"/app/documents/quotations",icon:FileStack,roles:["FOUNDER","ADMIN","SUPER_ADMIN"]},
  {label:"Reports",href:"/app/reports",icon:ChartNoAxesCombined,permits:["reports.business.read"]}
 ]},
 {title:"Communication",items:[{label:"Messages",href:"/app/messages",icon:MessageCircle}]},
 {title:"Administration",items:[
  {label:"Settings",href:"/app/settings",icon:Settings2,
   permits:["organization.settings.manage","founders.read","users.read"]}
 ]}
];
const legacyDestinations:Record<string,string>={
 "/app/quotations":"/app/documents/quotations",
 "/app/agreements":"/app/documents/quotations",
 "/app/task-history":"/app/tasks",
 "/app/assets":"/app/clients",
 "/app/founders":"/app/settings",
 "/app/team/users":"/app/settings",
 "/app/integrations/chatgpt":"/app/settings",
 "/app/billing":"/app/finance",
 "/app/profitability":"/app/finance",
};
function matches(pathname:string,href:string){
 if(pathname===href||pathname.startsWith(href+"/"))return true;
 if(href==="/app/documents/quotations"&&pathname.startsWith("/app/documents/"))return true;
 const canonical=legacyDestinations[pathname];
 return canonical===href;
}
export function permittedGroups(permissions:readonly string[],roles:readonly string[]=[]):NavGroup[]{
 const granted=new Set(permissions);
 return sections.map(group=>({...group,items:group.items.filter(item=>
  (!item.roles||item.roles.some(r=>roles.includes(r)))&&
  (!item.permits||item.permits.some(p=>granted.has(p))||item.roles?.some(r=>roles.includes(r)))
 )})).filter(group=>group.items.length>0);
}
export function currentSection(groups:NavGroup[],pathname:string){
 const chosen=groups.find(group=>group.items.some(item=>matches(pathname,item.href)));
 const item=chosen?.items.find(i=>matches(pathname,i.href));
 const titles:Record<string,{group:string;title:string}>={
  "/app/approvals":{group:"Workspace",title:"Approval inbox"},
  "/app/notes":{group:"Workspace",title:"Notes"},
  "/app/notes/list":{group:"Workspace",title:"Notes"},
  "/app/content":{group:"Operations",title:"Content Calendar"},
  "/app/search":{group:"Workspace",title:"Search"},
  "/app/profile":{group:"Workspace",title:"My account"},
  "/app/notifications":{group:"Workspace",title:"Notifications"}
 };
 return {group:chosen?.title??titles[pathname]?.group??"Workspace",
  title:item?.label??titles[pathname]?.title??"Workspace"};
}
const STORE="aw-sidebar-groups-v2";
export function WorkspaceNav({groups,pathname,compact=false,onNavigate}:{
 groups:NavGroup[];pathname:string;compact?:boolean;onNavigate?:()=>void
}){
 const [closed,setClosed]=useState<Record<string,boolean>>({});
 useEffect(()=>{
  try{
   const stored=JSON.parse(window.localStorage.getItem(STORE)??"{}") as Record<string,unknown>;
   if(stored&&typeof stored==="object"&&!Array.isArray(stored))
    setClosed(Object.fromEntries(Object.entries(stored).filter(([,v])=>typeof v==="boolean")) as Record<string,boolean>);
  }catch{/* Corrupt or blocked storage must not hide the workspace. */}
 },[]);
 const toggle=(title:string)=>setClosed(previous=>{
  const next={...previous,[title]:!previous[title]};
  try{window.localStorage.setItem(STORE,JSON.stringify(next));}catch{/* Optional preference. */}
  return next;
 });
 return <nav aria-label="Workspace navigation" className="aw-nav-scroller">
  {groups.map((group,i)=>{
   const active=group.items.some(item=>matches(pathname,item.href));
   const expanded=compact||!closed[group.title];
   return <section key={group.title} className="aw-nav-section" data-nav-group={group.title}>
    <button className="aw-nav-group aw-nav-group-toggle" type="button"
     title={compact?group.title:undefined}
     aria-label={"Toggle "+group.title+" navigation"}
     aria-controls={"aw-nav-items-"+i}
     aria-expanded={expanded}
     disabled={compact}
     onClick={()=>toggle(group.title)}>
     <span>{group.title}</span><ChevronDown size={14} aria-hidden="true"/>
    </button>
    <div id={"aw-nav-items-"+i} className="aw-nav-group-items" hidden={!expanded} data-active={active?"true":"false"}>
     {group.items.map(({label,href,icon:Icon})=>{
      const selected=matches(pathname,href);
      return <Link key={href} href={href} onClick={onNavigate}
       title={compact?label:undefined} aria-label={compact?label:undefined}
       aria-current={selected?"page":undefined}
       className={"aw-nav-item"+(selected?" aw-nav-selected":"")}>
       <Icon size={18} strokeWidth={1.8} aria-hidden="true"/>
       <span className="aw-nav-name">{label}</span>
      </Link>;
     })}
    </div>
   </section>;
  })}
 </nav>;
}
