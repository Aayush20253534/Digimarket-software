"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { reportingPreset, type ReportingPeriod } from "@digimarket/contracts";
import { BusinessPeriodPicker } from "@/components/business-period-picker";
import { useAuth } from "@/components/auth-provider";
import { Notice, PageHeader, Spinner } from "@/components/ui";
export function money(value: string | number | null | undefined) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(value ?? 0));
  if (!match) return "Unavailable";
  const fraction = (match[3] ?? "").padEnd(3, "0");
  const cents =
    BigInt(match[2]) * 100n + BigInt(fraction.slice(0, 2)) + (Number(fraction[2]) >= 5 ? 1n : 0n);
  return (
    (match[1] ? "−" : "") +
    "₹" +
    new Intl.NumberFormat("en-IN").format(cents / 100n) +
    "." +
    (cents % 100n).toString().padStart(2, "0")
  );
}
export function useFinanceWindow() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<ReportingPeriod>(() => reportingPreset("current"));
  const [view, setView] = useState<"mine" | "all">("mine");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!session) return;
    const q = new URLSearchParams(window.location.search);
    const from = q.get("from"),
      to = q.get("to");
    if (
      from &&
      to &&
      /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to) &&
      from <= to
    )
      setPeriod({ from, to });
    if (
      (q.get("view") === "all" && session.identity.permissions.includes("finance.read.all")) ||
      (!q.has("view") &&
        session.identity.permissions.includes("finance.read.all") &&
        !session.identity.roles.includes("FOUNDER"))
    )
      setView("all");
    setReady(true);
  }, [session]);
  const query = new URLSearchParams({ ...period, view }).toString();
  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(window.location.search);
    q.set("from", period.from);
    q.set("to", period.to);
    q.set("view", view);
    window.history.replaceState(null, "", window.location.pathname + "?" + q.toString());
  }, [ready, period, view]);
  return { period, setPeriod, view, setView, query, ready };
}
export function FinanceFrame({
  title,
  description,
  window: w,
  children,
  agencyOnly = false,
  overview = false,
  actions,
}: {
  title: string;
  description: string;
  window: ReturnType<typeof useFinanceWindow>;
  children: ReactNode;
  agencyOnly?: boolean;
  overview?: boolean;
  actions?: ReactNode;
}) {
  const { session } = useAuth();
  if (!session) return <Spinner label="Checking finance access…" />;
  const all = session.identity.permissions.includes("finance.read.all");
  if (
    (agencyOnly && !all) ||
    (!all && !session.identity.permissions.includes("finance.entry.read.own"))
  )
    return <Notice kind="error">Finance access is not available for this account.</Notice>;
  return (
    <div className="aw-finance-page space-y-6" data-aw-module="finance">
      {!overview && (
        <Link
          href={"/app/finance?" + w.query}
          className="inline-flex text-sm text-violet-300 hover:underline"
        >
          ← Finance overview
        </Link>
      )}
      <PageHeader eyebrow="Finance" title={title} description={description} actions={actions} />
      <BusinessPeriodPicker value={w.period} onChange={w.setPeriod} />
      {!agencyOnly && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Finance visibility">
          <button
            className={w.view === "mine" ? "btn-primary" : "btn-secondary"}
            onClick={() => w.setView("mine")}
          >
            My entries
          </button>
          {all && (
            <button
              className={w.view === "all" ? "btn-primary" : "btn-secondary"}
              onClick={() => w.setView("all")}
            >
              Agency totals & register
            </button>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
export function FinancePager({
  page,
  total,
  limit = 25,
  onChange,
  disabled = false,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (page: number) => void;
  disabled?: boolean;
}) {
  return (
    <nav className="mt-4 flex flex-wrap gap-3 items-center" aria-label="Finance pagination">
      <button
        className="btn-secondary"
        disabled={disabled || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        Previous page
      </button>
      <span className="text-sm">
        Page {page} of {Math.max(1, Math.ceil(total / limit))} · {total} records
      </span>
      <button
        className="btn-secondary"
        disabled={disabled || page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        Next page
      </button>
    </nav>
  );
}
export function DownloadCSV({ rows, name }: { rows: (string | number)[][]; name: string }) {
  return (
    <button
      className="btn-secondary"
      onClick={() => {
        const csv = rows
          .map((row) =>
            row
              .map(
                (value) =>
                  '"' +
                  String(value)
                    .replace(/^[=+@\-\t\r]/, "'$&")
                    .replaceAll('"', '""') +
                  '"',
              )
              .join(","),
          )
          .join("\r\n");
        const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = name + ".csv";
        a.click();
        URL.revokeObjectURL(url);
      }}
    >
      Export balances CSV
    </button>
  );
}
