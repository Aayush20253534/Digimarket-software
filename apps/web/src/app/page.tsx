import Link from "next/link";
import {
  Activity, ArrowRight, ArrowUpRight, BadgeCheck, CalendarDays, ChartNoAxesCombined,
  CheckCheck, CreditCard, FileStack, FolderKanban, LockKeyhole, ShieldCheck, Sparkles,
  Users, Workflow
} from "lucide-react";
import { healthResponseSchema } from "@digimarket/contracts";
import { BrandLogo } from "@/components/brand-logo";
import { AWBadge } from "@/components/aw-ui";

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

const modules = [
  { title: "Clients & leads", description: "Keep every relationship, follow-up, and opportunity in view.", icon: Users, label: "CRM" },
  { title: "Projects & tasks", description: "Coordinate deliverables, people, and recurring work.", icon: FolderKanban, label: "Delivery" },
  { title: "Content calendar", description: "Plan campaigns, track reviews, and organize publishing.", icon: CalendarDays, label: "Content" },
  { title: "Finance & billing", description: "Record expenses, invoices, payments, and profitability.", icon: CreditCard, label: "Finance" },
  { title: "Files & assets", description: "Maintain a secure library of your brand and client materials.", icon: FileStack, label: "Assets" },
  { title: "Approvals & reporting", description: "Bring decisions and actionable insights into one workflow.", icon: ChartNoAxesCombined, label: "Insights" },
];

export default async function HomePage() {
  const status = await getApiStatus();
  return <main className="aw-theme aw-public aw-ambient min-h-screen">
    <a href="#main-content" className="aw-skip-link">Skip to content</a>
    <div className="aw-public-grid" aria-hidden="true" />
    <header className="aw-site-header">
      <div className="aw-shell flex min-w-0 items-center justify-between gap-3 py-4 sm:py-5">
        <Link href="/" aria-label="AmplifyWorld Workspace homepage" className="min-w-0">
          <BrandLogo compact workspace />
        </Link>
        <nav aria-label="Public navigation" className="hidden items-center gap-7 text-sm text-[#C3B7D1] lg:flex">
          <a className="aw-nav-link" href="#features">Features</a>
          <a className="aw-nav-link" href="#workflow">How it works</a>
          <a className="aw-nav-link" href="#security">Security</a>
        </nav>
        <Link href="/login" className="aw-button aw-button-primary shrink-0 !text-xs sm:!text-sm">
          Sign in <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </header>

    <div id="main-content" className="relative">
      <section className="aw-shell aw-hero-grid relative grid items-center gap-12 pb-20 pt-16 lg:grid-cols-[1.04fr_.96fr] lg:gap-12 lg:pb-28 lg:pt-24">
        <div className="relative z-[1] min-w-0">
          <AWBadge tone="accent"><Sparkles size={13} aria-hidden="true" /> The operating system for growing agencies</AWBadge>
          <h1 className="aw-hero-heading mt-7 max-w-[720px]">
            Every moving part.<span className="block aw-gradient-text">One powerful workspace.</span>
          </h1>
          <p className="mt-7 max-w-[590px] text-base leading-8 text-[#BDB3CC] sm:text-lg">
            Bring your people, clients, creative projects, finances, and approvals together.
            AmplifyWorld Workspace gives your agency one secure place to keep work moving.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/login" className="aw-button aw-button-primary min-w-[185px]">Enter your workspace <ArrowRight size={17} aria-hidden="true"/></Link>
            <a href="#features" className="aw-button aw-button-secondary">Explore the platform <ArrowUpRight size={16} aria-hidden="true"/></a>
          </div>
          <div className="mt-9 flex flex-wrap items-center gap-5 text-xs text-[#ADA1C1] sm:text-sm">
            <span className="flex items-center gap-2"><ShieldCheck size={17} className="text-[#C477FD]" aria-hidden="true"/> Private team access</span>
            <span className="flex items-center gap-2"><CheckCheck size={17} className="text-[#C477FD]" aria-hidden="true"/> Role-aware workflows</span>
          </div>
        </div>

        <div className="aw-hero-stage relative mx-auto w-full max-w-[640px] min-w-0" aria-label="Illustrative product dashboard">
          <div className="aw-hero-orb" aria-hidden="true"/>
          <div className="aw-hero-orb-ring" aria-hidden="true"/>
          <div className="aw-hero-panel relative">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#3D2851] px-5 py-4 sm:px-6">
              <span className="flex items-center gap-2 text-sm font-semibold text-[#F7F5FB]"><span className="aw-preview-dot"/> Workspace overview</span>
              <span className="rounded-full border border-[#523365] bg-[#2A193C] px-2.5 py-1 text-[11px] text-[#CE9EF7]">Product illustration</span>
            </div>
            <div className="grid grid-cols-2 gap-3 p-4 sm:gap-4 sm:p-6">
              {[
                {icon: Users, title: "Clients", value: "Keep connected"},
                {icon: FolderKanban, title: "Projects", value: "Stay on track"},
                {icon: CreditCard, title: "Finances", value: "Know the numbers"},
                {icon: Workflow, title: "Approvals", value: "Move forward"},
              ].map(({icon: Icon,title,value})=><div key={title} className="aw-mini-metric min-w-0">
                <Icon className="text-[#D179FF]" size={18} aria-hidden="true"/>
                <p className="mt-4 text-xs text-[#AC9CBD]">{title}</p>
                <p className="mt-1 text-sm font-semibold text-[#F7F1FF]">{value}</p>
              </div>)}
            </div>
            <div className="mx-4 mb-4 rounded-xl border border-[#3C2A4D] bg-[#110C1A] p-4 sm:mx-6 sm:mb-6">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#E1D5EF]">A clearer path from idea to delivery</span>
                <Activity size={17} aria-hidden="true" className="text-[#C96CFF]"/>
              </div>
              <svg viewBox="0 0 440 116" className="mt-2 h-[112px] w-full" role="img" aria-label="Illustrative upward workflow progress curve, not real company data">
                <defs><linearGradient id="aw-home-chart" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#B33CF3" stopOpacity=".24"/><stop offset="1" stopColor="#B33CF3" stopOpacity="0"/></linearGradient></defs>
                <path d="M0 106H440M0 67H440M0 28H440" stroke="#2D223A" strokeWidth="1"/>
                <path d="M4 100 C55 94 69 105 103 79 S157 78 194 64 S248 82 289 43 S349 51 390 22 S413 26 436 6 V114H4Z" fill="url(#aw-home-chart)"/>
                <path d="M4 100 C55 94 69 105 103 79 S157 78 194 64 S248 82 289 43 S349 51 390 22 S413 26 436 6" fill="none" stroke="#D956FF" strokeWidth="3.5" strokeLinecap="round"/>
              </svg>
            </div>
          </div>
          <div className="aw-float-label aw-float-label-top"><BadgeCheck size={16} aria-hidden="true"/> Organized by design</div>
          <div className="aw-float-label aw-float-label-bottom"><LockKeyhole size={16} aria-hidden="true"/> Secure access</div>
        </div>
      </section>

      <section id="features" className="aw-shell aw-section pb-20 scroll-mt-24">
        <div className="mb-9 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="aw-eyebrow">ONE WORKSPACE · EVERY FUNCTION</p>
            <h2 className="aw-section-heading mt-3">Everything your agency needs to <span className="aw-gradient-text">move forward.</span></h2>
          </div>
          <p className="max-w-[340px] text-sm leading-7 text-[#B7AEC7]">A connected workspace for day-to-day operations, without switching between disconnected tools.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {modules.map(({title, description, icon: Icon, label})=><article key={title} className="aw-feature-card">
            <div className="flex items-start justify-between gap-3">
              <div className="aw-feature-icon"><Icon size={21} strokeWidth={1.7} aria-hidden="true"/></div>
              <span className="text-[11px] font-semibold uppercase tracking-[.12em] text-[#947EA8]">{label}</span>
            </div>
            <h3 className="mt-6 text-lg font-semibold text-[#F6F2FC]">{title}</h3>
            <p className="mt-2 text-sm leading-7 text-[#B1A8C1]">{description}</p>
          </article>)}
        </div>
      </section>

      <section id="workflow" className="aw-shell aw-section pb-20 scroll-mt-24">
        <div className="aw-feature-band grid gap-10 overflow-hidden p-6 sm:p-9 lg:grid-cols-[.85fr_1.15fr] lg:items-center lg:p-12">
          <div>
            <p className="aw-eyebrow">BUILT FOR HOW TEAMS WORK</p>
            <h2 className="aw-section-heading mt-3">From the first brief to <span className="aw-gradient-text">the final result.</span></h2>
            <p className="mt-5 max-w-lg text-sm leading-7 text-[#B9AECA]">
              Keep context with the work. Handovers, decisions and milestones belong together,
              and everyone sees the information their role allows.
            </p>
            <Link href="/login" className="aw-button aw-button-secondary mt-7">Open workspace <ArrowUpRight size={16} aria-hidden="true"/></Link>
          </div>
          <ol className="grid gap-4">
            {[
              ["01","Organize","Bring clients, opportunities, deliverables, and resources into one view."],
              ["02","Collaborate","Assign work, request approvals, and keep your team aligned."],
              ["03","Understand","Track finance and reporting with access appropriate to each role."],
            ].map(([n,title,detail])=><li key={n} className="aw-workflow-step">
              <span className="aw-step-number">{n}</span>
              <div><h3 className="font-semibold text-[#F7F0FF]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#BAAFC9]">{detail}</p></div>
              <ArrowUpRight className="ml-auto shrink-0 text-[#A66AC8]" size={17} aria-hidden="true"/>
            </li>)}
          </ol>
        </div>
      </section>

      <section id="security" className="aw-shell aw-section pb-24 scroll-mt-24">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <div className="aw-security-card">
            <div className="aw-feature-icon"><ShieldCheck size={24} aria-hidden="true"/></div>
            <p className="aw-eyebrow mt-8">SECURITY AT THE CORE</p>
            <h2 className="aw-section-heading mt-3">Your team&apos;s work stays <span className="aw-gradient-text">in the right hands.</span></h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#B5ABCA]">
              AmplifyWorld Workspace supports administrator-issued accounts, role-based access checks,
              first-login password changes and authenticator challenges for privileged accounts.
              There is no public account registration.
            </p>
            <div className="mt-6 flex flex-wrap gap-2"><AWBadge tone="accent">Role-aware access</AWBadge><AWBadge>Private workspace</AWBadge><AWBadge>Multi-factor verification</AWBadge></div>
          </div>
          <div className="aw-status-card">
            <div className="flex items-center gap-3"><div className="aw-feature-icon"><Activity size={20} aria-hidden="true"/></div>
              <div><h3 className="font-semibold">Service connectivity</h3><p className="mt-1 text-xs text-[#AFA3C1]">Live backend health check</p></div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#3C2B4C] bg-[#120B1C] p-4">
              <span className="text-sm font-semibold">Express API</span>
              <span data-testid="api-health-status" className={"rounded-full border px-3 py-1 text-xs font-semibold " +
                (status === "connected" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-amber-500/30 bg-amber-500/10 text-amber-300")}>
                {status === "connected" ? "Connected" : "Unavailable"}
              </span>
            </div>
            <p className="mt-5 text-xs leading-6 text-[#A99DBC]">
              This only checks the API health endpoint. It does not verify login credentials, database readiness or account provisioning.
            </p>
          </div>
        </div>
      </section>

      <section className="aw-shell pb-20">
        <div className="aw-final-cta relative overflow-hidden px-6 py-11 text-center sm:px-10 sm:py-14">
          <p className="aw-eyebrow">AMPLIFY YOUR OPERATIONS</p>
          <h2 className="aw-section-heading mx-auto mt-4 max-w-2xl">Less chaos. <span className="aw-gradient-text">More momentum.</span></h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[#C0B4D0]">Your workspace is ready when you are. Sign in with the credentials provided by your administrator.</p>
          <Link href="/login" className="aw-button aw-button-primary mt-7">Login to AmplifyWorld <ArrowRight size={17} aria-hidden="true"/></Link>
        </div>
      </section>
    </div>

    <footer className="border-t border-[#31233C]">
      <div className="aw-shell flex flex-wrap items-center justify-between gap-5 py-7">
        <BrandLogo compact tagline/>
        <p className="text-xs text-[#9E90B0]">AmplifyWorld Workspace · Private agency operations</p>
        <Link href="/login" className="inline-flex items-center gap-2 text-sm text-[#DDB8FF] hover:text-white">Team sign in <ArrowUpRight size={15} aria-hidden="true"/></Link>
      </div>
    </footer>
  </main>;
}
