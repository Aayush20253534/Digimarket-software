"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {Banknote,ChartNoAxesCombined,FileStack,Wallet} from "lucide-react";
import {useAuth} from "@/components/auth-provider";

/** Page-level wayfinding. Existing server-side authorisation remains in place. */
export function BusinessWorkspaceNav(){
 const {session}=useAuth();
 const pathname=usePathname();
 if(!session)return null;
 const grants=new Set(session.identity.permissions);
 const documentRole=session.identity.roles.some(role=>
  role==="FOUNDER"||role==="ADMIN"||role==="SUPER_ADMIN");
 const links=[
  {label:"Finance",href:"/app/finance",icon:Wallet,
   allowed:grants.has("finance.read.all")||grants.has("finance.entry.read.own")},
  {label:"Salary",href:"/app/salary",icon:Banknote,allowed:true},
  {label:"Documents",href:"/app/documents/quotations",icon:FileStack,allowed:documentRole},
  {label:"Reports",href:"/app/reports",icon:ChartNoAxesCombined,
   allowed:grants.has("reports.business.read")},
 ].filter(link=>link.allowed);
 if(links.length<2)return null;
 return <nav className="aw-v5-business-nav" aria-label="Business workspace sections">
  {links.map(({label,href,icon:Icon})=>{
   const active=pathname===href||(href==="/app/documents/quotations"&&
    (pathname.startsWith("/app/documents/")||pathname==="/app/quotations"||pathname==="/app/agreements"))||
    (href==="/app/reports"&&pathname.startsWith("/app/reports/"));
   return <Link key={href} href={href} aria-current={active?"page":undefined}
     className={"aw-v5-business-link"+(active?" is-active":"")}>
     <Icon size={17} strokeWidth={1.85} aria-hidden="true"/>{label}
   </Link>;
  })}
 </nav>;
}
