import type { ReactNode } from "react";
import { AlertCircle, ArrowRight, Inbox } from "lucide-react";

export function PageHeader({ eyebrow, title, description, actions }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode;
}) {
  return <header className="flex flex-wrap items-end justify-between gap-5">
    <div className="min-w-0">
      {eyebrow && <p className="mb-2 text-xs font-bold uppercase tracking-[.16em] text-indigo-600">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p>}
    </div>
    {actions}
  </header>;
}

export function Card({ title, description, children, className = "" }: {
  title?: string; description?: string; children: ReactNode; className?: string;
}) {
  return <section className={"rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 " + className}>
    {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
    {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
    <div className={title || description ? "mt-5" : ""}>{children}</div>
  </section>;
}

export function EmptyState({ title, description, icon: Icon = Inbox }: {
  title: string; description: string; icon?: typeof Inbox;
}) {
  return <div className="flex flex-col items-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center">
    <Icon aria-hidden="true" className="mb-3 h-7 w-7 text-slate-400" />
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{description}</p>
  </div>;
}

export function Notice({ children, kind = "info" }: { children: ReactNode; kind?: "info" | "error" | "success" }) {
  const styles = {
    info: "border-indigo-100 bg-indigo-50 text-indigo-900",
    error: "border-red-100 bg-red-50 text-red-800",
    success: "border-emerald-100 bg-emerald-50 text-emerald-800",
  };
  return <div role={kind === "error" ? "alert" : "status"} className={"flex items-start gap-2 rounded-xl border px-4 py-3 text-sm " + styles[kind]}>
    {kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
    <div>{children}</div>
  </div>;
}

export function StatusBadge({ status, rectangular = false, uppercase = false }: { status: string; rectangular?: boolean; uppercase?: boolean }) {
  const classes = status==="MEETING_PROCESS"?"bg-blue-100 text-blue-800"
    : status==="YET_TO_CALL"?"bg-black text-white"
    : status==="CALL_NOT_PICKING"?"bg-pink-100 text-pink-800"
    : ["ACTIVE","APPROVED"].includes(status) ? "bg-emerald-50 text-emerald-700"
    : ["DISABLED","REJECTED"].includes(status) ? "bg-red-50 text-red-700"
    : "bg-amber-50 text-amber-700";
  // The lead register's subtitle rule excludes .aw-status-badge; use it only for
  // rectangular badges so other modules retain their existing pill appearance.
  const shape = rectangular ? "aw-status-badge inline-flex w-fit max-w-full items-center rounded-md" : "inline-flex rounded-full";
  return <span className={shape + (status==="MEETING_PROCESS"?" aw-status-meeting":status==="CALL_NOT_PICKING"?" aw-status-not-picking":status==="REJECTED"?" aw-status-rejected":status==="YET_TO_CALL"?" aw-status-yet-to-call":"") + " px-2.5 py-1 text-xs font-semibold " + classes}>{uppercase?status.replaceAll("_"," "):status==="MEETING_PROCESS"?"Meeting Process":status==="YET_TO_CALL"?"Yet to Call":status.replaceAll("_"," ")}</span>;
}

export function FormField({ label, id, children, help }: { label: ReactNode; id: string; children: ReactNode; help?: string }) {
  return <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-semibold text-slate-700">{label}</label>
    {children}
    {help && <p className="text-xs leading-5 text-slate-500">{help}</p>}
  </div>;
}

export function Spinner({ label = "Loading" }: { label?: string }) {
  return <div role="status" className="flex min-h-48 items-center justify-center gap-3 text-sm text-slate-500">
    <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" aria-hidden="true" />
    {label}
  </div>;
}
