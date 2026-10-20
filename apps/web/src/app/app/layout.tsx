"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, LogOut, Menu, NotebookPen, PanelLeftClose, PanelLeftOpen, Search, X } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { BrandLogo } from "@/components/brand-logo";
import { AWButton, AWNotice } from "@/components/aw-ui";
import { currentSection, permittedGroups, WorkspaceNav } from "@/components/workspace-navigation";
import { AWNotificationBell } from "@/components/aw-notification-bell";

function Avatar({ name }: { name: string }) {
 const initials=name.trim().split(/\s+/).slice(0,2).map(w=>w.charAt(0)).join("").toUpperCase();
 return <span className="aw-work-avatar" aria-hidden="true">{initials}</span>;
}
function SidebarFooter({ name, roles, busy, logout, close }: {
 name:string;roles:readonly string[];busy:boolean;logout:()=>void;close?:()=>void;
}) {
 return <div className="aw-work-footer">
  <Link href="/app/profile" aria-label="View profile" onClick={close} className="aw-work-profile">
   <Avatar name={name}/>
   <span className="aw-work-profile-details">
    <span className="block truncate text-sm font-bold">{name}</span>
    <span className="block truncate text-xs text-[#B6A5C7]">{roles.join(", ")||"Member"}</span>
   </span>
  </Link>
  <button type="button" className="aw-nav-item aw-work-signout" disabled={busy} onClick={logout}
   aria-label="Sign out"><LogOut size={18} aria-hidden="true"/><span className="aw-nav-name">{busy?"Signing out…":"Sign out"}</span>
  </button>
 </div>;
}
export default function AppLayout({ children }: { children: React.ReactNode }) {
 const router=useRouter();
 const pathname=usePathname();
 const { status, session, refresh, logout }=useAuth();
 const [collapsed,setCollapsed]=useState(false);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [signingOut,setSigningOut]=useState(false);
 const [signOutError,setSignOutError]=useState("");
 const dialogRef=useRef<HTMLDialogElement>(null);
 const closeRef=useRef<HTMLButtonElement>(null);
 const triggerRef=useRef<HTMLButtonElement>(null);

 useEffect(()=>{if(status==="unauthenticated")router.replace("/login");},[router,status]);
 useEffect(()=>{try{setCollapsed(window.localStorage.getItem("aw-sidebar-collapsed")==="1");}catch{/* optional preference */}},[]);
 useEffect(()=>{setMobileOpen(false);},[pathname]);
 useEffect(()=>{
  const dialog=dialogRef.current;
  if(!dialog)return;
  if(mobileOpen&&!dialog.open){dialog.showModal();closeRef.current?.focus();}
  else if(!mobileOpen&&dialog.open)dialog.close();
 },[mobileOpen]);
 useEffect(()=>{
  if(!mobileOpen)return;
  const before=document.body.style.overflow;
  document.body.style.overflow="hidden";
  return()=>{document.body.style.overflow=before;};
 },[mobileOpen]);

 function toggleCollapsed(){
  setCollapsed(previous=>{
   const next=!previous;
   try{window.localStorage.setItem("aw-sidebar-collapsed",next?"1":"0");}catch{/* optional preference */}
   return next;
  });
 }
 async function signOut(){
  setSigningOut(true);setSignOutError("");
  try{await logout();setMobileOpen(false);router.replace("/login");}
  catch{setSignOutError("Sign out could not be confirmed by the server. Your session may still be active.");setMobileOpen(false);}
  finally{setSigningOut(false);}
 }
 if(status==="loading"||(status!=="error"&&!session))return <main className="aw-theme aw-work-loading">
  <div role="status">Verifying workspace access…</div>
 </main>;
 if(status==="error"||!session)return <main className="aw-theme aw-work-loading">
  <div className="max-w-md space-y-4 p-5"><AWNotice tone="error">Unable to verify your session. Check the API connection.</AWNotice>
   <AWButton onClick={()=>void refresh()}>Retry connection</AWButton></div>
 </main>;

 const isAdmin=session.identity.roles.some(role=>role==="ADMIN"||role==="SUPER_ADMIN");
  const groups=permittedGroups(session.identity.permissions,session.identity.roles);
 const current=currentSection(groups,pathname);
 const canSearch=!isAdmin&&session.identity.permissions.includes("search.read");
 const name=session.user.displayName;
 const brand=<Link href="/app/dashboard" aria-label="AmplifyWorld Workspace overview" className="aw-work-brand">
  <BrandLogo compact workspace/>
 </Link>;
 return <div className="aw-theme aw-workspace" data-collapsed={collapsed?"true":"false"} data-dashboard={pathname==="/app/dashboard"?"true":"false"} data-restyled={["/app/finance","/app/billing","/app/reports","/app/settings","/app/team/users","/app/founders","/app/assets","/app/profile","/app/search","/app/notes"].includes(pathname)?"true":"false"} data-workstream={["/app/leads","/app/clients","/app/projects","/app/tasks","/app/content","/app/approvals"].includes(pathname)?"true":"false"}>
  <a href="#workspace-content" className="aw-skip-link">Skip to workspace content</a>
  <aside aria-label="Workspace sidebar" className="aw-work-sidebar">
   <div className="aw-work-sidehead">{brand}
    <button type="button" className="aw-work-toggle" onClick={toggleCollapsed}
     title={collapsed?"Expand sidebar":"Collapse sidebar"}
     aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} aria-expanded={!collapsed}>
     {collapsed?<PanelLeftOpen size={19} aria-hidden="true"/>:<PanelLeftClose size={19} aria-hidden="true"/>}
    </button>
   </div>
   <WorkspaceNav groups={groups} pathname={pathname} compact={collapsed}/>
   <SidebarFooter name={name} roles={session.identity.roles} busy={signingOut} logout={()=>void signOut()}/>
  </aside>

  <dialog ref={dialogRef} aria-label="Workspace mobile navigation" className="aw-work-dialog"
   onClose={()=>{setMobileOpen(false);triggerRef.current?.focus();}}
   onClick={e=>{if(e.target===e.currentTarget)setMobileOpen(false);}}>
   <aside className="aw-work-drawer">
    <div className="aw-work-sidehead">{brand}
     <button ref={closeRef} type="button" className="aw-work-toggle" aria-label="Close menu" onClick={()=>setMobileOpen(false)}>
      <X size={20} aria-hidden="true"/>
     </button>
    </div>
    <WorkspaceNav groups={groups} pathname={pathname} onNavigate={()=>setMobileOpen(false)}/>
    <SidebarFooter name={name} roles={session.identity.roles} busy={signingOut}
     close={()=>setMobileOpen(false)} logout={()=>void signOut()}/>
   </aside>
  </dialog>

  <div className="aw-work-main">
   <header className="aw-work-topbar">
    <div className="flex min-w-0 items-center gap-3">
     <button ref={triggerRef} type="button" className="aw-work-icon aw-work-mobile-trigger"
      aria-label="Open menu" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(true)}>
      <Menu size={20} aria-hidden="true"/>
     </button>
     <div className="min-w-0">
      <p className="aw-work-breadcrumb">Workspace <ChevronRight size={12} aria-hidden="true"/>{current.group}</p>
      <p className="aw-work-title truncate">{current.title}</p>
     </div>
    </div>
    <div className="aw-work-topactions">
     {!isAdmin&&<Link href="/app/notes" aria-label="Open saved notes" title="My notes" className="aw-work-icon"><NotebookPen size={19} aria-hidden="true"/></Link>}
     {canSearch&&<Link href="/app/search" aria-label="Search workspace" className="aw-work-search">
      <Search size={17} aria-hidden="true"/><span>Search workspace</span>
     </Link>}
     <AWNotificationBell/>
     <Link href="/app/profile" aria-label="Open my account" className="aw-work-header-avatar"><Avatar name={name}/></Link>
    </div>
   </header>
   {/* Legacy module surfaces remain light until page migrations (Phases 4-6). */}
   <main id="workspace-content" className="aw-work-content">
    <div className="aw-work-content-width">
     {signOutError&&<div className="mb-5"><AWNotice tone="error">{signOutError}</AWNotice></div>}
     {isAdmin&&["/app/notes","/app/search","/app/leads","/app/content","/app/assets"].some(p=>pathname===p||pathname.startsWith(p+"/"))?<AWNotice tone="error">This operational module is not available to administrator accounts.</AWNotice>:children}
    </div>
   </main>
  </div>
 </div>;
}
