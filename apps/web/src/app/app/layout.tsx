"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, CheckSquare2,
  ChevronRight, CreditCard, FileStack, FolderKanban, LayoutDashboard, LogOut,
  Menu, Search, Settings2, ShieldCheck, Users, UsersRound, Wallet, X,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Notice, Spinner } from "@/components/ui";

const futureModules = [
  { label: "Reports", icon: ChartNoAxesCombined },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { status, session, refresh, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  async function signOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      await logout();
      router.replace("/login");
    } catch {
      setSignOutError("Sign out could not be confirmed by the server. Your session may still be active.");
    } finally {
      setSigningOut(false);
    }
  }

  if (status === "loading") return <div className="min-h-screen bg-slate-50"><Spinner label="Verifying workspace access…" /></div>;
  if (status === "error") return <main className="mx-auto max-w-md px-6 py-24"><Notice kind="error">Unable to verify your session. Check the API connection.</Notice><button className="btn-secondary mt-5" onClick={() => void refresh()}>Retry connection</button></main>;
  if (!session) return <div className="min-h-screen bg-slate-50"><Spinner label="Redirecting to sign in…" /></div>;

  const canSeeFounders = session.identity.permissions.includes("founders.read");
  const canSeeSettings = session.identity.permissions.includes("organization.settings.manage");
  const canSeeProfitability = session.identity.permissions.includes("profitability.read");
  const canSeeBilling = session.identity.permissions.includes("invoices.read") || session.identity.permissions.includes("payments.read");
  const canSeeContent = session.identity.permissions.includes("content.read");
  const canSeeTasks = session.identity.permissions.includes("tasks.read");
  const canSeeProjects = session.identity.permissions.includes("projects.read");
  const canSeeAssets = session.identity.permissions.includes("assets.read");
  const canSeeClients = session.identity.permissions.includes("clients.read");
  const canSeeLeads = session.identity.permissions.includes("leads.read");
  const canSeeFinance = session.identity.permissions.includes("finance.entry.read.own") || session.identity.permissions.includes("finance.read.all");
  const canSeeApprovals = session.identity.permissions.includes("approvals.read");
  const canSeeTeam = session.identity.permissions.includes("users.read");
  const name = session.user.displayName;
  const initials = name.split(/\s+/).map((word) => word.charAt(0)).slice(0,2).join("").toUpperCase();

  const nav = <div className="flex h-full flex-col">
    <Link href="/app/dashboard" className="mb-8 flex items-center gap-3 px-3 text-lg font-bold tracking-tight text-slate-900">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>DigiMarket
    </Link>
    <nav aria-label="Workspace navigation" className="flex-1 space-y-5">
      <div>
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Workspace</p>
        <Link href="/app/dashboard" aria-current={pathname === "/app/dashboard" ? "page" : undefined} className={"sidebar-link " + (pathname === "/app/dashboard" ? "sidebar-active" : "")}>
          <LayoutDashboard className="h-4 w-4" aria-hidden="true" />Overview
        </Link>
        {canSeeLeads && <Link href="/app/leads" aria-current={pathname.startsWith("/app/leads") ? "page" : undefined} className={"sidebar-link " + (pathname.startsWith("/app/leads") ? "sidebar-active" : "")}>
          <BriefcaseBusiness className="h-4 w-4" aria-hidden="true" />Leads CRM
        </Link>}
        {canSeeClients && <Link href="/app/clients" aria-current={pathname.startsWith("/app/clients") ? "page" : undefined} className={"sidebar-link " + (pathname.startsWith("/app/clients") ? "sidebar-active" : "")}>
          <Users className="h-4 w-4" aria-hidden="true" />Clients
        </Link>}
        {canSeeProjects && <Link href="/app/projects" aria-current={pathname.startsWith("/app/projects") ? "page" : undefined} className={"sidebar-link " + (pathname.startsWith("/app/projects") ? "sidebar-active" : "")}>
          <FolderKanban className="h-4 w-4" aria-hidden="true" />Projects
        </Link>}
        {canSeeTasks && <Link href="/app/tasks" aria-current={pathname.startsWith("/app/tasks") ? "page" : undefined}
          className={"sidebar-link " + (pathname.startsWith("/app/tasks") ? "sidebar-active" : "")}>
          <CheckSquare2 className="h-4 w-4" aria-hidden="true" />Tasks
        </Link>}
        {canSeeContent && <Link href="/app/content" aria-current={pathname.startsWith("/app/content")?"page":undefined}
          className={"sidebar-link "+(pathname.startsWith("/app/content")?"sidebar-active":"")}>
          <CalendarDays className="h-4 w-4" aria-hidden="true" />Content calendar
        </Link>}
        {canSeeAssets && <Link href="/app/assets" aria-current={pathname.startsWith("/app/assets") ? "page" : undefined} className={"sidebar-link " + (pathname.startsWith("/app/assets") ? "sidebar-active" : "")}>
          <FileStack className="h-4 w-4" aria-hidden="true" />Files & assets
        </Link>}
        {canSeeBilling && <Link href="/app/billing" aria-current={pathname.startsWith("/app/billing")?"page":undefined}
          className={"sidebar-link "+(pathname.startsWith("/app/billing")?"sidebar-active":"")}>
          <CreditCard className="h-4 w-4" aria-hidden="true" />Invoices & payments
        </Link>}
        {canSeeProfitability && <Link href="/app/profitability"
          aria-current={pathname.startsWith("/app/profitability")?"page":undefined}
          className={"sidebar-link "+(pathname.startsWith("/app/profitability")?"sidebar-active":"")}>
          <ChartNoAxesCombined className="h-4 w-4" aria-hidden="true" />Client profitability
        </Link>}
        {canSeeFinance && <Link href="/app/finance" aria-current={pathname === "/app/finance" ? "page" : undefined} className={"sidebar-link " + (pathname === "/app/finance" ? "sidebar-active" : "")}>
          <Wallet className="h-4 w-4" aria-hidden="true" />Income & expenses
        </Link>}
        {canSeeApprovals && <Link href="/app/approvals" aria-current={pathname === "/app/approvals" ? "page" : undefined} className={"sidebar-link " + (pathname === "/app/approvals" ? "sidebar-active" : "")}>
          <CheckSquare2 className="h-4 w-4" aria-hidden="true" />Approvals
        </Link>}
        {canSeeFounders && <Link href="/app/founders"
          aria-current={pathname.startsWith("/app/founders")?"page":undefined}
          className={"sidebar-link "+(pathname.startsWith("/app/founders")?"sidebar-active":"")}>
          <UsersRound className="h-4 w-4" aria-hidden="true" />Founders & responsibilities
        </Link>}
        {canSeeSettings && <Link href="/app/settings"
          aria-current={pathname.startsWith("/app/settings")?"page":undefined}
          className={"sidebar-link "+(pathname.startsWith("/app/settings")?"sidebar-active":"")}>
          <Settings2 className="h-4 w-4" aria-hidden="true" />Company settings
        </Link>}
        {canSeeTeam && <Link href="/app/team/users" aria-current={pathname === "/app/team/users" ? "page" : undefined} className={"sidebar-link " + (pathname === "/app/team/users" ? "sidebar-active" : "")}>
          <Users className="h-4 w-4" aria-hidden="true" />Team & accounts
        </Link>}
        <Link href="/app/profile" aria-current={pathname === "/app/profile" ? "page" : undefined} className={"sidebar-link " + (pathname === "/app/profile" ? "sidebar-active" : "")}>
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />My account
        </Link>
      </div>
      <div>
        <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Coming in later modules</p>
        {futureModules.map(({ label, icon: Icon }) => <div key={label} className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm text-slate-400" title="Scheduled for a later module">
          <Icon className="h-4 w-4" aria-hidden="true" /><span>{label}</span>
          <span className="ml-auto text-[10px]">Soon</span>
        </div>)}
      </div>
    </nav>
    <div className="mt-5 border-t border-slate-200 pt-5">
      <Link href="/app/profile" className="flex items-center gap-3 rounded-xl px-3 py-2 hover:bg-slate-50">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-sm font-bold text-indigo-700">{initials}</span>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-900">{name}</span><span className="block truncate text-xs text-slate-500">{session.identity.roles.join(", ")}</span></span>
        <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </Link>
      <button className="sidebar-link mt-2 w-full text-left" type="button" onClick={signOut} disabled={signingOut}><LogOut className="h-4 w-4" aria-hidden="true" />{signingOut ? "Signing out…" : "Sign out"}</button>
    </div>
  </div>;

  return <div className="min-h-screen bg-slate-50 text-slate-900 lg:pl-64">
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 overflow-y-auto border-r border-slate-200 bg-white px-4 py-6 lg:block">{nav}</aside>
    {mobileOpen && <div className="fixed inset-0 z-40 lg:hidden">
      <button className="absolute inset-0 bg-slate-950/60" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />
      <aside className="relative h-full w-72 max-w-[85vw] overflow-y-auto bg-white px-4 py-6 shadow-xl">
        <button onClick={() => setMobileOpen(false)} className="absolute right-4 top-6 rounded-lg p-2 text-slate-600" aria-label="Close menu"><X className="h-5 w-5" /></button>{nav}
      </aside>
    </div>}
    <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-5 backdrop-blur sm:px-8">
      <div className="flex items-center gap-4">
        <button type="button" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
        <div><p className="text-xs text-slate-500">Agency workspace</p><p className="text-sm font-semibold">Internal operations</p></div>
      </div>
      <div className="flex items-center gap-2">
        <span title="Global search will be enabled in Module 16" className="hidden items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-400 sm:flex"><Search className="h-4 w-4" />Search coming soon</span>
        <span title="Notifications are planned for Module 16" className="rounded-xl border border-slate-200 p-2.5 text-slate-400"><Bell className="h-4 w-4" aria-label="Notifications coming soon" /></span>
        <Link href="/app/profile" aria-label="Open my account" className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{initials}</Link>
      </div>
    </header>
    <div className="mx-auto w-full max-w-[1500px] px-5 py-8 sm:px-8 sm:py-10">
      {signOutError && <div className="mb-5"><Notice kind="error">{signOutError}</Notice></div>}
      {children}
    </div>
  </div>;
}
