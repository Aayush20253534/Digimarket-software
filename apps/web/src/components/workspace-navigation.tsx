import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
 Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, CheckSquare2,
 CreditCard, FileStack, FolderKanban, LayoutDashboard, Search, Settings2,
 ShieldCheck, Users, UsersRound, Wallet
} from "lucide-react";

type Item={label:string;href:string;icon:LucideIcon;permits?:readonly string[]};
type Group={title:string;items:readonly Item[]};
const sections:readonly Group[]=[
 {title:"Workspace",items:[
  {label:"Overview",href:"/app/dashboard",icon:LayoutDashboard},
  {label:"Global search",href:"/app/search",icon:Search,permits:["search.read"]},
  {label:"Reports",href:"/app/reports",icon:ChartNoAxesCombined,permits:["reports.business.read"]},
  {label:"Notifications",href:"/app/notifications",icon:Bell,permits:["notifications.read"]}
 ]},
 {title:"Relationships",items:[
  {label:"Leads CRM",href:"/app/leads",icon:BriefcaseBusiness,permits:["leads.read"]},
  {label:"Clients",href:"/app/clients",icon:Users,permits:["clients.read"]}
 ]},
 {title:"Delivery",items:[
  {label:"Projects",href:"/app/projects",icon:FolderKanban,permits:["projects.read"]},
  {label:"Tasks",href:"/app/tasks",icon:CheckSquare2,permits:["tasks.read"]},
  {label:"Content calendar",href:"/app/content",icon:CalendarDays,permits:["content.read"]},
  {label:"Files & assets",href:"/app/assets",icon:FileStack,permits:["assets.read"]},
  {label:"Approvals",href:"/app/approvals",icon:CheckSquare2,permits:["approvals.read"]}
 ]},
 {title:"Finance",items:[
  {label:"Invoices & payments",href:"/app/billing",icon:CreditCard,permits:["invoices.read","payments.read"]},
  {label:"Client profitability",href:"/app/profitability",icon:ChartNoAxesCombined,permits:["profitability.read"]},
  {label:"Income & expenses",href:"/app/finance",icon:Wallet,permits:["finance.entry.read.own","finance.read.all"]}
 ]},
 {title:"Administration",items:[
  {label:"Founders & responsibilities",href:"/app/founders",icon:UsersRound,permits:["founders.read"]},
  {label:"Company settings",href:"/app/settings",icon:Settings2,permits:["organization.settings.manage"]},
  {label:"Team & accounts",href:"/app/team/users",icon:Users,permits:["users.read"]}
 ]},
 {title:"Account",items:[{label:"My account",href:"/app/profile",icon:ShieldCheck}]}
];
export function permittedGroups(permissions:readonly string[]):Group[]{
 const granted=new Set(permissions);
 return sections.map(group=>({...group,items:group.items.filter(item=>!item.permits||item.permits.some(p=>granted.has(p)))}))
  .filter(group=>group.items.length>0);
}
export function currentSection(groups:Group[],pathname:string){
 const chosen=groups.find(g=>g.items.some(i=>pathname===i.href||pathname.startsWith(i.href+"/")));
 const item=chosen?.items.find(i=>pathname===i.href||pathname.startsWith(i.href+"/"));
 return {group:chosen?.title??"Workspace",title:item?.label??"Workspace"};
}
export function WorkspaceNav({groups,pathname,compact=false,onNavigate}:{
 groups:Group[];pathname:string;compact?:boolean;onNavigate?:()=>void
}){
 return <nav aria-label="Workspace navigation" className="aw-nav-scroller">
  {groups.map(group=><section key={group.title} className="aw-nav-section">
   <p className="aw-nav-group" aria-hidden="true">{group.title}</p>
   {group.items.map(({label,href,icon:Icon})=>{
    const active=pathname===href||pathname.startsWith(href+"/");
    return <Link key={href} href={href} onClick={onNavigate}
     title={compact?label:undefined} aria-label={compact?label:undefined}
     aria-current={active?"page":undefined}
     className={"aw-nav-item"+(active?" aw-nav-selected":"")}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true"/>
      <span className="aw-nav-name">{label}</span>
     </Link>;
   })}
  </section>)}
 </nav>;
}
