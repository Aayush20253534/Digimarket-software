"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  Landmark,
  Users,
  ReceiptText,
  ShieldCheck,
  Tags,
  Megaphone,
  CalendarRange,
} from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, Spinner } from "@/components/ui";
import { FinanceFrame, money, useFinanceWindow } from "./shared";
import type { TotalExpenseSummary } from "./total-expenses";
type Totals = {
  postedIncome: string;
  postedExpense: string;
  postedExpenseIncludingSalary: string;
  postedSalaryExpense: string;
  agencyOperatingNet: string;
  clientAdSpend?: { posted: string };
  pendingIncome: string;
  pendingExpense: string;
};
export function FinanceOverview() {
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [totals, setTotals] = useState<Totals | null>(null),
    [totalExpense, setTotalExpense] = useState<TotalExpenseSummary | null>(null),
    [error, setError] = useState("");
  const all = !!session?.identity.permissions.includes("finance.read.all"),
    founder = !!session?.identity.roles.includes("FOUNDER");
  useEffect(() => {
    if (!w.ready || !session) return;
    let active = true;
    setTotals(null);
    setTotalExpense(null);
    setError("");
    void Promise.all([
      request<Totals>("/finance/summary?" + w.query),
      request<TotalExpenseSummary>("/finance/total-expenses/summary?" + w.query),
    ])
      .then(([r, expense]) => {
        if (active) {
          setTotals(r);
          setTotalExpense(expense);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.ready, w.query, session, request]);
  const cards = [
    {
      title: "Income",
      description: "Receipts by category",
      href: "/app/finance/income",
      amount: totalExpense?.postedIncome,
      icon: ArrowDownLeft,
    },
    {
      title: "Expenses",
      description: "Operating costs and salary subtotal",
      href: "/app/finance/expenses",
      amount: totals?.postedExpenseIncludingSalary,
      icon: ArrowUpRight,
    },
    {
      title: "Total expense",
      description: "All expenses, Meta Ads and salaries",
      href: "/app/finance/total-expenses",
      amount: totalExpense?.postedTotalExpense,
      icon: ReceiptText,
    },
    {
      title: "Meta Ads",
      description: "Self and client campaign spending",
      href: "/app/finance/ads",
      icon: Megaphone,
    },
    ...(all
      ? [
          {
            title: "Client ad funds",
            description: "Top-ups, refunds and client balances",
            href: "/app/finance/client-funds",
            icon: Wallet,
          },
          {
            title: "Accounts & transfers",
            description: "Cash, bank, UPI and founder clearing",
            href: "/app/finance/accounts",
            icon: Landmark,
          },
        ]
      : []),
    ...(founder
      ? [
          {
            title: "Founder settlements",
            description: "Private settlement history and reimbursements",
            href: "/app/finance/settlements",
            icon: Users,
          },
          {
            title: "Salaries",
            description: "Payroll, funding and payment history",
            href: "/app/salary",
            amount: totals?.postedSalaryExpense,
            icon: ReceiptText,
          },
        ]
      : []),
    ...(all
      ? [
          {
            title: "Agreement projections",
            description: "Expected service fees and ad budgets",
            href: "/app/finance/agreements",
            icon: CalendarRange,
          },
          {
            title: "Cycle closing",
            description: "Reconcile accounts and lock completed cycles",
            href: "/app/finance/closing",
            icon: ShieldCheck,
          },
        ]
      : []),
    {
      title: "Categories",
      description: "Manage stable income and expense categories",
      href: "/app/finance/categories",
      icon: Tags,
    },
  ];
  return (
    <FinanceFrame
      overview
      title="Finance"
      description="Choose a card to open its records. All figures follow the selected work cycle."
      window={w}
      actions={
        <Link href={"/app/finance/entries?" + w.query} className="btn-primary">
          New entry / register
        </Link>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Finance overview totals">
        {[
          ["Net operating money", totalExpense?.netOperatingMoney],
          ["Pending income", totals?.pendingIncome],
          ["Pending expenses", totals?.pendingExpense],
        ].map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="block mt-2 text-2xl">
              {value === undefined ? (error ? "Unavailable" : "…") : money(value)}
            </strong>
          </Card>
        ))}
      </div>
      <nav className="grid grid-cols-2 gap-4 xl:grid-cols-3" aria-label="Finance categories">
        {cards.map(({ title, description, href, amount, icon: Icon }) => (
          <Link
            key={title}
            href={href + "?" + w.query}
            className="group min-w-0 rounded-2xl border border-white/10 bg-white/[.025] p-5 transition hover:border-violet-400/60 hover:bg-violet-500/5 focus-visible:outline-2 focus-visible:outline-violet-400"
          >
            <div className="flex items-center justify-between">
              <Icon size={23} className="text-violet-300" />
              <ArrowRight size={18} className="text-slate-500 group-hover:text-violet-300" />
            </div>
            <h2 className="mt-4 text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
            {amount !== undefined && <p className="mt-4 text-xl font-semibold">{money(amount)}</p>}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-slate-400">
        Net operating money = posted income − Total expense. Total expense includes ordinary costs,
        self and client Meta Ads, and salaries counted once. Transfers and client fund deposits are
        separate.
      </p>
    </FinanceFrame>
  );
}
export function FinanceCategorySummary({ kind }: { kind: "INCOME" | "EXPENSE" }) {
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [data, setData] = useState<{
      ordinary: string;
      salary: string;
      total: string;
      items: {
        id: string;
        name: string;
        posted: string;
        pending: string;
        count: number;
        active: boolean;
      }[];
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!w.ready || !session) return;
    let active = true;
    setData(null);
    setError("");
    void request<typeof data>("/finance/category-summary?" + w.query + "&kind=" + kind)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.ready, w.query, request, session, kind]);
  return (
    <FinanceFrame
      title={kind === "INCOME" ? "Income categories" : "Expense categories"}
      description="Open a category to view, search and export its transactions."
      window={w}
      actions={
        <Link className="btn-primary" href={"/app/finance/entries?" + w.query + "&kind=" + kind}>
          New entry / all records
        </Link>
      }
    >
      {error && <Notice kind="error">{error}</Notice>}
      {!data && !error ? (
        <Spinner label="Loading category balances…" />
      ) : (
        data && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <p>{kind === "INCOME" ? "Posted income" : "Operating expenses"}</p>
                <strong>{money(data.ordinary)}</strong>
              </Card>
              {kind === "EXPENSE" && (
                <>
                  <Card>
                    <p>Salaries</p>
                    <strong>{money(data.salary)}</strong>
                    {session?.identity.roles.includes("FOUNDER") && (
                      <Link className="block mt-2 text-violet-300" href={"/app/salary?" + w.query}>
                        Open salary ledger
                      </Link>
                    )}
                  </Card>
                  <Card>
                    <p>Total expenses including salary</p>
                    <strong>{money(data.total)}</strong>
                  </Card>
                </>
              )}
            </div>
            <nav
              className="grid grid-cols-2 gap-4 xl:grid-cols-3"
              aria-label="Financial category cards"
            >
              {data.items.map((c) => (
                <Link
                  className="rounded-xl border border-white/10 p-5 hover:border-violet-400"
                  key={c.id}
                  href={"/app/finance/entries?" + w.query + "&kind=" + kind + "&categoryId=" + c.id}
                >
                  <h2 className="font-semibold">
                    {c.name}
                    {!c.active && " · archived"}
                  </h2>
                  <p className="mt-3 text-xl">{money(c.posted)}</p>
                  <p className="text-sm text-slate-400">
                    {c.count} posted entries · Pending {money(c.pending)}
                  </p>
                </Link>
              ))}
            </nav>
            {!data.items.length && <Notice>No categories yet. Create them in Categories.</Notice>}
          </>
        )
      )}
    </FinanceFrame>
  );
}
