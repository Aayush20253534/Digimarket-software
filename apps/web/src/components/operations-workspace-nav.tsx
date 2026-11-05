"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {CalendarCheck2,ClipboardCheck,ShieldCheck} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

/**
 * Cross-page navigation for internal work and delivery operations.
 * A navigation shortcut never implies access; server grants remain authoritative.
 */
export function OperationsWorkspaceNav(){
 const {session}=useAuth();
 const path=usePathname();
 if(!session)return null;
 const granted=new Set(session.identity.permissions);
 const links=[
  {label:"Client Deliveries",href:"/app/deliveries",icon:CalendarCheck2,allowed:granted.has("clients.read")},
  {label:"Tasks",href:"/app/tasks",icon:ClipboardCheck,allowed:granted.has("tasks.read")},
  {label:"Approvals",href:"/app/approvals",icon:ShieldCheck,allowed:granted.has("approvals.read")},
 ].filter(link=>link.allowed);
 if(links.length<2)return null;
 return <nav aria-label="Operations workspace sections" className="aw-v4-operations-nav">
  {links.map(({label,href,icon:Icon})=>{
   const active=path===href||(href==="/app/tasks"&&path==="/app/task-history");
   return <Link key={href} href={href} aria-current={active?"page":undefined}
    className={"aw-v4-operations-link"+(active?" is-active":"")}>
    <Icon size={16} strokeWidth={1.8} aria-hidden="true"/>{label}
   </Link>;
  })}
 </nav>;
}
