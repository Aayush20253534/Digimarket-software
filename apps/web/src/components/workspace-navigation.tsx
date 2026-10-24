import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
 BriefcaseBusiness, CalendarDays, CalendarClock, ChartNoAxesCombined, CheckSquare2,
 FileStack, FolderKanban, LayoutDashboard, NotebookPen, MessageCircle, Search, Settings2, History,
 ShieldCheck, Users, UsersRound, Wallet
} from "lucide-react";

type Item={label:string;href:string;icon:LucideIcon;permits?:readonly string[]; operational?:boolean};
type Group={title:string;items:readonly Item[]};
const sections:readonly Group[]=[
 {title:"Workspace",items:[
  {label:"Overview",href:"/app/dashboard",icon:LayoutDashboard},
  {label:"My notes",href:"/app/notes",icon:NotebookPen},
  {label:"Messages",href:"/app/messages",icon:MessageCircle},
  {label:"My search",operational:true,href:"/app/search",icon:Search,permits:["search.read"]},
  {label:"Reports",href:"/app/reports",icon:ChartNoAxesCombined,permits:["reports.business.read"]}
 ]},
 {title:"Relationships",items:[
  {label:"Leads CRM",href:"/app/leads",icon:BriefcaseBusiness,permits:["leads.read"]},
  {label:"Follow Ups",href:"/app/follow-ups",icon:CalendarClock,permits:["leads.read"]},
  {label:"Meetings",href:"/app/meetings",icon:CalendarDays,permits:["leads.read"]},
  {label:"Clients",href:"/app/clients",icon:Users,permits:["clients.read"]}
 ]},
 {title:"Delivery",items:[
  {label:"Projects",href:"/app/projects",icon:FolderKanban,permits:["projects.read"]},
  {label:"Tasks",href:"/app/tasks",icon:CheckSquare2,permits:["tasks.read"]},
  {label:"Task history",href:"/app/task-history",icon:History,permits:["tasks.read"]},
  {label:"Content calendar",operational:true,href:"/app/content",icon:CalendarDays,permits:["content.read"]},
  {label:"Files & assets",operational:true,href:"/app/assets",icon:FileStack,permits:["assets.read"]},
  {label:"Approvals",href:"/app/approvals",icon:CheckSquare2,permits:["approvals.read"]}
 ]},
 {title:"Finance",items:[
  {label:"Income & expenses",href:"/app/finance",icon:Wallet,permits:["finance.entry.read.own","finance.read.all"]}
 ]},
 {title:"Administration",items:[
  {label:"Founders & responsibilities",href:"/app/founders",icon:UsersRound,permits:["founders.read"]},
  {label:"Company settings",href:"/app/settings",icon:Settings2,permits:["organization.settings.manage"]},
  {label:"Team & accounts",href:"/app/team/users",icon:Users,permits:["users.read"]}
 ]},
 {title:"Account",items:[{label:"My account",href:"/app/profile",icon:ShieldCheck}]}
];
export function permittedGroups(permissions:readonly string[],roles:readonly string[]=[]):Group[]{
  const admin=roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN");
 const granted=new Set(permissions);
 return sections.map(group=>({...group,items:group.items.filter(item=>(!admin||!item.operational)&&(!item.permits||item.permits.some(p=>granted.has(p))))}))
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
