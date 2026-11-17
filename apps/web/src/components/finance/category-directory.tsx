"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Notice, PageHeader, Spinner } from "@/components/ui";
import { useFinanceWindow } from "./shared";

export function FinanceCategoryDirectory() {
  const { session, request } = useAuth(),
    w = useFinanceWindow();
  const [categories, setCategories] = useState<
    { kind: "INCOME" | "EXPENSE"; active: boolean }[] | null
  >(null);
  const [error, setError] = useState("");
  const permitted = !!session?.identity.permissions.some(
    (p) => p === "finance.read.all" || p === "finance.entry.read.own",
  );
  useEffect(() => {
    if (!permitted) return;
    let active = true;
    void request<NonNullable<typeof categories>>("/finance/categories")
      .then((r) => {
        if (active) setCategories(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [permitted, request]);
  if (!session) return <Spinner label="Checking finance access…" />;
  if (!permitted)
    return <Notice kind="error">Finance access is not available for this account.</Notice>;
  return (
    <div className="aw-finance-page space-y-6" data-aw-module="finance">
      <Link className="text-sm text-violet-300" href={"/app/finance?" + w.query}>
        ← Finance overview
      </Link>
      <PageHeader
        title="Finance categories"
        description="Manage income and expense categories separately. Categories apply across all work cycles."
      />
      {error && <Notice kind="error">{error}</Notice>}
      <nav className="grid gap-4 sm:grid-cols-2" aria-label="Category types">
        {(
          [
            [
              "INCOME",
              "Income categories",
              "Service fees and other income sources",
              "income",
              ArrowDownLeft,
            ],
            [
              "EXPENSE",
              "Expense categories",
              "Operating costs, Meta Ads and other expenses",
              "expenses",
              ArrowUpRight,
            ],
          ] as const
        ).map(([kind, title, description, path, Icon]) => (
          <Link
            key={kind}
            className="rounded-2xl border border-white/10 p-6 hover:border-violet-400"
            href={"/app/finance/categories/" + path + "?" + w.query}
          >
            <div className="flex justify-between text-violet-300">
              <Icon size={24} />
              <ArrowRight size={20} />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            <p className="mt-4">
              {categories
                ? `${categories.filter((c) => c.kind === kind && c.active).length} active · ${categories.filter((c) => c.kind === kind && !c.active).length} inactive`
                : error
                  ? "Unavailable"
                  : "Loading…"}
            </p>
          </Link>
        ))}
      </nav>
    </div>
  );
}
