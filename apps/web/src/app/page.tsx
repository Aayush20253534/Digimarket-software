import Link from "next/link";
import { Activity, ArrowUpRight, Boxes, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { healthResponseSchema } from "@digimarket/contracts";

export const dynamic = "force-dynamic";

async function getApiStatus(): Promise<"connected" | "unavailable"> {
  try {
    const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
    const response = await fetch(new URL("/api/v1/health", base), {
      cache: "no-store", signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return "unavailable";
    const body: unknown = await response.json();
    return healthResponseSchema.safeParse(body).success ? "connected" : "unavailable";
  } catch { return "unavailable"; }
}

export default async function HomePage() {
  const status = await getApiStatus();
  return <main className="min-h-screen bg-[#101a35] text-slate-100">
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-12">
      <header className="flex items-center justify-between border-b border-white/10 pb-7">
        <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/30"><Boxes className="h-5 w-5" aria-hidden="true" /></span><strong>DigiMarket</strong></div>
        <Link className="rounded-xl bg-white px-5 py-2.5 text-sm font-bold text-indigo-800 hover:bg-indigo-50" href="/login">Sign in <ArrowUpRight className="ml-2 inline h-4 w-4" aria-hidden="true" /></Link>
      </header>
      <section className="grid items-center gap-14 py-20 lg:grid-cols-[1.35fr_1fr] lg:py-28">
        <div><span className="rounded-full border border-indigo-300/30 bg-indigo-300/10 px-3 py-1.5 text-xs font-medium text-indigo-200">Private agency operations</span>
          <h1 className="mt-6 max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl lg:text-6xl">All your operations. One secure workspace.</h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-slate-300">Sign in to organize clients, campaign projects, content planning, tasks, approvals, invoices, payments and agency reporting in one secure workspace.</p>
          <Link href="/login" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-6 py-3 font-semibold text-white hover:bg-indigo-600">Open workspace <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        <aside className="rounded-3xl border border-white/10 bg-white/[0.05] p-7 shadow-xl">
          <h2 className="flex items-center gap-3 font-semibold"><Activity className="h-5 w-5 text-indigo-200" aria-hidden="true" />System connectivity</h2>
          <p className="mt-2 text-sm text-slate-300">Live server-side check of the Express health endpoint.</p>
          <div className="mt-7 flex items-center justify-between rounded-2xl border border-white/10 bg-[#192747] p-5">
            <div><p className="text-sm font-medium">Express API</p><p className="mt-1 text-xs text-slate-300">GET /api/v1/health</p></div>
            <span data-testid="api-health-status" className={"rounded-full px-3 py-1 text-xs " + (status === "connected" ? "bg-emerald-400/10 text-emerald-200" : "bg-amber-400/10 text-amber-200")}>{status === "connected" ? "Connected" : "Unavailable"}</span>
          </div>
          <p className="mt-4 text-xs text-slate-300">Health status does not imply that a production database or user account has been configured.</p>
        </aside>
      </section>
      <section className="grid gap-4 pb-20 md:grid-cols-3">
        {[
          { title: "Access control", description: "Live role grants and protected staff account administration.", icon: ShieldCheck },
          { title: "Account security", description: "First-login password changes, short-lived JWT and MFA challenges.", icon: CheckCircle2 },
          { title: "Business operations", description: "Projects, invoicing, team workflows and permission-scoped reports.", icon: Database },
        ].map(({ title, description, icon: Icon }) => <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.05] p-6"><Icon className="h-6 w-6 text-indigo-200" aria-hidden="true" /><h2 className="mt-5 font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{description}</p></article>)}
      </section>
      <footer className="border-t border-white/10 py-8 text-xs text-slate-300">Private agency workspace · Access requires an assigned account</footer>
    </div>
  </main>;
}
