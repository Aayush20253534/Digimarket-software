"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Activity, ArrowRight, Bell, CheckCircle2, ChevronRight, CircleDollarSign,
  FolderKanban, LayoutDashboard, Search, ShieldCheck, Users,
} from "lucide-react";
import { AWDialog } from "@/components/aw-dialog";
import { AWBadge, AWButton, AWCard, AWEmptyState, AWFormField, AWInput, AWNotice,
  AWPageHeader, AWSelect, AWSkeleton, AWStatusBadge, AWTable, AWTextarea } from "@/components/aw-ui";
import { BrandLogo } from "@/components/brand-logo";

const swatches = [
  { label: "Obsidian", color: "#09070E", css: "--aw-canvas" },
  { label: "Surface", color: "#171122", css: "--aw-surface" },
  { label: "Violet", color: "#7C3AED", css: "--aw-violet" },
  { label: "Purple", color: "#B026FF", css: "--aw-purple" },
  { label: "Magenta", color: "#F037DB", css: "--aw-magenta" },
];

const sampleRecords = [
  { name: "Concept project", owner: "Design team", status: "ACTIVE", due: "Oct 24" },
  { name: "Approval illustration", owner: "Operations", status: "PENDING", due: "Oct 26" },
  { name: "Archived example", owner: "Admin", status: "DONE", due: "Oct 18" },
];

export default function DesignPreview() {
  const [tab, setTab] = useState("Overview");
  const [query, setQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const visibleRecords = sampleRecords.filter((record) =>
    record.name.toLowerCase().includes(query.toLowerCase()));

  return <main className="aw-theme min-h-screen">
    <div className="aw-ambient min-h-screen">
      <div className="aw-shell pb-16">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#362842] py-5">
          <BrandLogo compact tagline />
          <div className="flex flex-wrap items-center gap-3">
            <AWBadge tone="accent">Phase 1 · Design preview</AWBadge>
            <Link href="/" className="aw-button aw-button-secondary aw-button-sm">Existing homepage <ArrowRight size={15} aria-hidden="true" /></Link>
          </div>
        </header>

        <section className="grid gap-7 py-12 lg:grid-cols-[1.2fr_.8fr] lg:items-center lg:py-16">
          <div>
            <p className="aw-eyebrow">AmplifyWorld Workspace · Design foundation</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-extrabold leading-[1.08] tracking-[-.05em] sm:text-5xl">
              Work smarter.<br/><span className="aw-gradient-text">Amplify everything.</span>
            </h1>
            <p className="aw-description mt-5">One cohesive interface for your agency, with premium violet surfaces, accessible controls and fast, responsive workflows. This page demonstrates the design system, not real business data.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <AWButton onClick={() => setDialogOpen(true)}>Preview dialog <ArrowRight size={16} aria-hidden="true" /></AWButton>
              <AWButton variant="secondary" onClick={() => setToast((value) => !value)}>Toggle notice</AWButton>
              <AWButton variant="ghost" disabled>Disabled control</AWButton>
            </div>
            {toast && <div className="mt-4"><AWNotice tone="success">Component action works. No production data has been changed.</AWNotice></div>}
          </div>
          <div className="aw-glass overflow-hidden rounded-[24px] p-5 sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#F7F5FB]">Sample workspace snapshot</p>
              <AWBadge tone="neutral"><Activity size={12} aria-hidden="true" /> Demo only</AWBadge>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[{ icon: CircleDollarSign, label: "Cashflow", value: "₹1.42L" },
                { icon: FolderKanban, label: "Projects", value: "12" },
                { icon: Users, label: "Clients", value: "28" },
                { icon: Bell, label: "Pending", value: "04" }].map(({ icon: Icon, label, value }) =>
                <div key={label} className="min-w-0 rounded-2xl border border-[#3C2A53] bg-[#211630] p-3.5">
                  <Icon size={17} className="text-[#C281FF]" aria-hidden="true" />
                  <p className="mt-3 text-xs text-[#B5ADC5]">{label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight text-white" style={{ fontVariantNumeric: "tabular-nums" }}>{value}</p>
                </div>)}
            </div>
            <div className="mt-4 h-[115px] rounded-2xl border border-[#3C2A53] bg-[#140D20] px-3 py-2">
              <svg viewBox="0 0 400 100" width="100%" height="100%" role="img" aria-label="Illustrative purple growth curve">
                <defs><linearGradient id="awGraph" x1="0" x2="0" y1="0" y2="1">
                  <stop stopColor="#AB47EE" stopOpacity=".3"/><stop offset="1" stopColor="#AB47EE" stopOpacity="0"/>
                </linearGradient></defs>
                <path d="M0 88 L400 88" stroke="#4A365B" strokeWidth="1"/>
                <path d="M3 77 C48 66 61 83 105 60 S180 72 208 42 S289 66 326 28 S370 33 397 9 L397 88 L3 88Z" fill="url(#awGraph)"/>
                <path d="M3 77 C48 66 61 83 105 60 S180 72 208 42 S289 66 326 28 S370 33 397 9" fill="none" stroke="#D35DFB" strokeWidth="3" strokeLinecap="round"/>
              </svg>
            </div>
            <p className="mt-3 text-xs text-[#9E92B3]">Illustrative metrics and chart. No backend requests.</p>
          </div>
        </section>

        <section className="mb-10">
          <AWPageHeader eyebrow="Foundations" title="Colors & typography" description="Accessible contrasts, a restrained neon palette, and predictable spacing across every future page."/>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {swatches.map((swatch) => <div key={swatch.css} className="aw-card overflow-hidden">
              <div className="h-20" style={{ backgroundColor: swatch.color }} />
              <div className="p-3"><p className="font-semibold text-sm">{swatch.label}</p>
                <p className="mt-1 break-all font-mono text-xs text-[#B5ADC5]">{swatch.color}</p></div>
            </div>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <AWBadge tone="accent">Brand accent</AWBadge>
            <AWBadge tone="success">Success</AWBadge>
            <AWBadge tone="warning">Pending</AWBadge>
            <AWBadge tone="danger">Needs attention</AWBadge>
            <AWBadge>Neutral</AWBadge>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-[1.05fr_.95fr]">
          <AWCard title="Forms & controls" description="Large touch targets, semantic labels, and clear focus states." className="p-5 sm:p-6">
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <AWFormField id="aw-demo-project" label="Project title">
                <AWInput id="aw-demo-project" placeholder="Enter a project name" />
              </AWFormField>
              <AWFormField id="aw-demo-owner" label="Assigned team">
                <AWSelect id="aw-demo-owner" defaultValue="creative">
                  <option value="creative">Creative team</option>
                  <option value="operations">Operations</option>
                  <option value="marketing">Marketing</option>
                </AWSelect>
              </AWFormField>
              <AWFormField id="aw-demo-notes" label="Description" className="sm:col-span-2">
                <AWTextarea id="aw-demo-notes" placeholder="An example of the forthcoming notes/editor field…" rows={3} />
              </AWFormField>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <AWButton onClick={() => setDialogOpen(true)}>Primary action</AWButton>
              <AWButton variant="secondary" onClick={() => setToast(true)}>Secondary action</AWButton>
              <AWButton variant="danger" disabled>Danger action</AWButton>
            </div>
          </AWCard>

          <AWCard title="Permission-aware navigation style" description="The existing secure routes and backend checks will be retained." className="p-5 sm:p-6">
            <div className="mt-4 grid gap-2">
              {[
                { icon: LayoutDashboard, text: "Overview", id: "Overview" },
                { icon: FolderKanban, text: "Projects", id: "Projects" },
                { icon: Search, text: "CRM", id: "CRM" },
                { icon: ShieldCheck, text: "Settings", id: "Settings" },
              ].map(({ icon: Icon, text, id }) => <button
                key={id} type="button" onClick={() => setTab(id)}
                className={"flex min-h-11 items-center justify-between rounded-xl border px-3 py-2 text-left transition-colors " +
                  (tab === id ? "border-[#764BA0] bg-[#3A1F54] text-white" : "border-transparent text-[#B5ADC5] hover:bg-[#281A36]")}
                aria-pressed={tab === id}>
                  <span className="flex items-center gap-3"><Icon size={18} aria-hidden="true"/>{text}</span><ChevronRight size={16} aria-hidden="true"/>
                </button>)}
            </div>
            <AWNotice tone="info"><strong>{tab}</strong> is selected for preview. Real navigation and permissions will follow in Phase 3.</AWNotice>
          </AWCard>
        </section>

        <section className="mt-8">
          <AWCard title="Tables & workflow states" description="Compact data rows with contained scrolling on narrow screens." className="p-4 sm:p-6">
            <div className="aw-toolbar my-5">
              <div className="w-full min-w-0 sm:w-[320px]">
                <AWFormField id="aw-preview-search" label="Filter example rows">
                  <AWInput id="aw-preview-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search project names" />
                </AWFormField>
              </div>
              <AWBadge tone="accent">{visibleRecords.length} sample results</AWBadge>
            </div>
            {visibleRecords.length ? <AWTable label="Illustrative project table">
              <thead><tr><th scope="col">Project</th><th scope="col">Owner</th><th scope="col">Status</th><th scope="col">Due date</th></tr></thead>
              <tbody>{visibleRecords.map((record) => <tr key={record.name}>
                <td className="font-semibold">{record.name}</td><td>{record.owner}</td>
                <td><AWStatusBadge status={record.status}/></td><td>{record.due}</td>
              </tr>)}</tbody>
            </AWTable> : <AWEmptyState title="No sample rows" description="Change the filter to see the example rows again."/>}
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[74,90,64,82].map((n,i)=><AWSkeleton key={i} className="h-3.5" style={{width:n+"%"}}/>)}
            </div>
          </AWCard>
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-[#362842] pt-6">
          <BrandLogo compact workspace/>
          <p className="text-xs text-[#ADA1C1]">Design preview · No customer data · Production routes unchanged</p>
          <Link href="/" className="text-sm text-[#D2A1FA] underline-offset-4 hover:underline">Back to current homepage</Link>
        </footer>
      </div>
    </div>
    <AWDialog open={dialogOpen} onClose={() => setDialogOpen(false)}
      title="AmplifyWorld design system"
      description="This native dialog demonstrates keyboard focus, Escape-to-close, and consistent colors. It does not save data."
      actions={<><AWButton variant="secondary" onClick={() => setDialogOpen(false)}>Cancel</AWButton>
        <AWButton onClick={() => setDialogOpen(false)}><CheckCircle2 size={16} aria-hidden="true"/> Looks good</AWButton></>}>
      <p className="mt-4 text-sm text-[#D6CFDF]">Preview-only interface. The functional workspace stays on its existing routes.</p>
    </AWDialog>
  </main>;
}
