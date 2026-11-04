"use client";
import Link from "next/link";
import {ArrowLeft} from "lucide-react";
import {useAuth} from "@/components/auth-provider";
import {Spinner} from "@/components/ui";
import AssetsPage from "../../assets/page";

// Existing /app/assets stays available for old links. Client navigation is
// gated by the same asset grants and legacy admin UI restriction.
export default function ClientsAssetsPage(){
 const {session}=useAuth();
 if(!session)return <Spinner label="Checking asset permissions…"/>;
 const admin=session.identity.roles.some(r=>r==="ADMIN"||r==="SUPER_ADMIN");
 if(admin||!session.identity.permissions.includes("assets.read"))
  return <section className="aw-v2-card p-5" role="alert">Asset workspace access is restricted for this account.</section>;
 return <div className="aw-v2-client-assets" data-testid="client-assets-page">
  <Link href="/app/clients" className="aw-v2-back-link"><ArrowLeft size={16} aria-hidden="true"/>Client directory</Link>
  <AssetsPage/>
 </div>;
}
