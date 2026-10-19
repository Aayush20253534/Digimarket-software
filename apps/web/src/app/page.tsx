import { Activity, ArrowUpRight, Boxes, CheckCircle2, Database, ShieldCheck } from "lucide-react";
import { healthResponseSchema } from "@digimarket/contracts";

export const dynamic = "force-dynamic";

type Status = "connected" | "unavailable";

async function getApiStatus(): Promise<Status> {
  try {
    const base = process.env.API_INTERNAL_URL ?? "http://127.0.0.1:4000";
    const response = await fetch(new URL("/api/v1/health", base), {
      cache: "no-store",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) return "unavailable";
    const body: unknown = await response.json();
    return healthResponseSchema.safeParse(body).success ? "connected" : "unavailable";
  } catch {
    return "unavailable";
  }
}

const platform = [
  { title: "Client operations", description: "Lead, client and delivery modules follow in later milestones.", icon: Boxes },
  { title: "Controlled access", description: "Identity and permission enforcement arrive in Module 3.", icon: ShieldCheck },
  { title: "Reliable data", description: "Neon and Prisma models are added in Module 2.", icon: Database },
];

export default async function HomePage() {
  const apiStatus = await getApiStatus();

  return (
    <main className="min-h-screen bg-[#0a1020] text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-12">
        <header className="flex items-center justify-between border-b border-white/10 pb-7">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500/20 ring-1 ring-indigo-400/30">
              <Boxes className="h-5 w-5 text-indigo-300" aria-hidden="true" />
            </div>
            <span className="text-base font-semibold tracking-tight">DigiMarket</span>
            <span className="hidden rounded-full border border-white/10 px-3 py-1 text-xs text-slate-400 sm:inline">Agency workspace</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Activity className="h-4 w-4" aria-hidden="true" /> Module 1
          </div>
        </header>

        <section className="grid items-center gap-12 py-20 lg:grid-cols-[1.4fr_1fr] lg:py-28">
          <div>
            <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1.5 text-xs font-medium text-indigo-200">
              Foundation milestone
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl leading-tight font-semibold tracking-tight sm:text-5xl lg:text-6xl">
              One workspace for every part of the agency.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-slate-400">
              The application foundation is installed. Client records, financial workflows,
              projects, approvals and content planning will be implemented in the upcoming modules.
            </p>
            <div className="mt-8 inline-flex items-center gap-2 text-sm text-indigo-200">
              Infrastructure-first development <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </div>
          </div>

          <aside className="rounded-3xl border border-white/10 bg-white/[0.035] p-7 shadow-2xl shadow-indigo-900/10">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-indigo-300" aria-hidden="true" />
              <h2 className="font-semibold">System connectivity</h2>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-400">Live server-to-server check against the Express API.</p>
            <div className="mt-7 flex items-center justify-between rounded-2xl border border-white/10 bg-[#101b32] p-5">
              <div>
                <p className="text-sm font-medium">Express API</p>
                <p className="mt-1 text-xs text-slate-400">GET /api/v1/health</p>
              </div>
              <span
                data-testid="api-health-status"
                className={apiStatus === "connected"
                  ? "rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs text-emerald-300"
                  : "rounded-full border border-amber-400/20 bg-amber-400/10 px-3 py-1 text-xs text-amber-300"}
              >
                {apiStatus === "connected" ? "Connected" : "Unavailable"}
              </span>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Login, database queries, and dashboards are intentionally not enabled in this milestone.
            </p>
          </aside>
        </section>

        <section aria-label="Future platform capabilities" className="grid gap-4 pb-20 md:grid-cols-3">
          {platform.map(({ title, description, icon: Icon }) => (
            <article key={title} className="rounded-2xl border border-white/10 bg-white/[0.025] p-6">
              <Icon className="h-6 w-6 text-indigo-300" aria-hidden="true" />
              <h2 className="mt-5 font-semibold">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
            </article>
          ))}
        </section>
        <footer className="border-t border-white/10 py-8 text-xs text-slate-500">
          Internal workspace · Module 1 infrastructure · No production business records
        </footer>
      </div>
    </main>
  );
}
