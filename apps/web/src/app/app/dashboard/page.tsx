"use client";

import Link from "next/link";
import {
  ArrowUpRight, BadgeCheck, CalendarClock, CheckCircle2, FolderOpen,
  Shield, ShieldCheck, Users, Workflow,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, PageHeader, StatusBadge } from "@/components/ui";

const planned = [
  { title: "Finance & approvals", detail: "Unified financial ledger, categories and approval queues.", icon: Workflow, module: "Modules 5–6" },
  { title: "Leads & clients", detail: "Prospects, follow-up history and client records.", icon: Users, module: "Modules 7–8" },
  { title: "Projects, tasks & assets", detail: "Production workflows, Cloudinary files and recurring work.", icon: FolderOpen, module: "Modules 9–11" },
  { title: "Calendar, invoices & reporting", detail: "Content planning, billing, profitability and insights.", icon: CalendarClock, module: "Modules 12–16" },
];

export default function Dashboard() {
  const { session } = useAuth();
  if (!session) return null;
  const canManage = session.identity.permissions.includes("users.read");

  return <div className="space-y-8">
    <PageHeader eyebrow="Overview" title={"Welcome, " + session.user.displayName.split(" ")[0]}
      description="Your secure company workspace is connected. Operational datasets appear as their modules are implemented."
      actions={<StatusBadge status={session.user.status} />} />
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-emerald-50 p-3 text-emerald-700"><BadgeCheck className="h-6 w-6" aria-hidden="true" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Your session</p><p className="mt-1 text-xl font-bold text-slate-900">Authenticated</p></div></div><p className="mt-4 text-xs text-slate-500">Verified against the API and current session record.</p></Card>
      <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-indigo-50 p-3 text-indigo-700"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned role</p><p className="mt-1 text-xl font-bold text-slate-900">{session.identity.roles.join(", ") || "None"}</p></div></div><p className="mt-4 text-xs text-slate-500">Role grants are checked by the backend.</p></Card>
      <Card><div className="flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Shield className="h-6 w-6" aria-hidden="true" /></div><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Access grants</p><p className="mt-1 text-xl font-bold text-slate-900">{session.identity.permissions.length}</p></div></div><p className="mt-4 text-xs text-slate-500">Current permissions attached to your account.</p></Card>
    </div>
    <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
      <Card title="Agency modules" description="Delivery stages are shown without invented financial or client statistics.">
        <div className="grid gap-3 sm:grid-cols-2">
          {planned.map(({ title, detail, icon: Icon, module }) => <div key={title} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between"><Icon className="h-5 w-5 text-indigo-600" aria-hidden="true" /><span className="text-[11px] font-semibold text-slate-400">{module}</span></div>
            <h3 className="mt-3 text-sm font-bold text-slate-900">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
          </div>)}
        </div>
      </Card>
      <Card title="Quick access" description="Tools available in this module.">
        <div className="space-y-3">
          <Link href="/app/profile" className="flex items-center justify-between rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50">
            <span className="flex items-center gap-3 text-sm font-semibold"><ShieldCheck className="h-5 w-5 text-indigo-600" aria-hidden="true" />View account and permissions</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>
          {canManage && <Link href="/app/team/users" className="flex items-center justify-between rounded-xl border border-slate-200 p-4 hover:border-indigo-300 hover:bg-indigo-50">
            <span className="flex items-center gap-3 text-sm font-semibold"><Users className="h-5 w-5 text-indigo-600" aria-hidden="true" />Team account management</span><ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </Link>}
          <EmptyState title="No business data yet" description="Tasks, leads, clients and finance entries will appear here after their database-backed modules ship." icon={CheckCircle2} />
        </div>
      </Card>
    </div>
  </div>;
}
