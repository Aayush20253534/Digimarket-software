"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {FileSignature,FileText} from "lucide-react";
import type {ReactNode} from "react";
import {useAuth} from "@/components/auth-provider";

/* Shared navigation wrapper; each underlying form/history remains untouched. */
export default function DocumentsLayout({children}:{children:ReactNode}){
 const {session}=useAuth();
 const allowed=!!session?.identity.roles.some(r=>["FOUNDER","ADMIN","SUPER_ADMIN"].includes(r));
 const pathname=usePathname();
 if(!allowed)return <>{children}</>;
 const tabs=[
  {label:"Quotations",href:"/app/documents/quotations",icon:FileText},
  {label:"Agreements",href:"/app/documents/agreements",icon:FileSignature},
 ];
 return <div className="aw-v2-subpage">
  <nav aria-label="Documents sections" className="aw-v2-tabs" data-testid="documents-tabs">
   {tabs.map(({label,href,icon:Icon})=><Link key={href} href={href}
    aria-current={pathname===href?"page":undefined}
    className={"aw-v2-tab"+(pathname===href?" aw-v2-tab-active":"")}>
    <Icon size={16} aria-hidden="true"/>{label}
   </Link>)}
  </nav>
  {children}
 </div>;
}
