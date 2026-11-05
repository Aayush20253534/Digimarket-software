"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {BriefcaseBusiness, CalendarClock, CalendarDays, Users, Video} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

/**
 * Page-level wayfinding for the Sales & CRM area.
 * Link visibility is derived from existing permissions, never a new grant.
 */
export function SalesWorkspaceNav(){
 const {session}=useAuth();
 const pathname=usePathname();
 if(!session)return null;
 const grants=new Set(session.identity.permissions);
 const routes=[
  {label:"Leads",href:"/app/leads",icon:BriefcaseBusiness,allowed:grants.has("leads.read")},
  {label:"Follow-ups",href:"/app/follow-ups",icon:CalendarClock,allowed:grants.has("leads.read")},
  {label:"Meetings",href:"/app/meetings",icon:CalendarDays,allowed:grants.has("leads.read")},
  {label:"Clients",href:"/app/clients",icon:Users,allowed:grants.has("clients.read")},
  {label:"Video readiness",href:"/app/clients/video-readiness",icon:Video,allowed:grants.has("clients.read")},
 ].filter(x=>x.allowed);
 if(routes.length<2)return null;
 return <nav aria-label="Sales workspace sections" className="aw-v3-sales-nav">
  {routes.map(({label,href,icon:Icon})=>{
   const active=pathname===href||(href==="/app/clients"&&pathname.startsWith("/app/clients/")&&!pathname.startsWith("/app/clients/video-readiness"));
   return <Link key={href} href={href} aria-current={active?"page":undefined}
    className={"aw-v3-sales-link"+(active?" is-active":"")}>
    <Icon size={16} strokeWidth={1.8} aria-hidden="true"/><span>{label}</span>
   </Link>;
  })}
 </nav>;
}
