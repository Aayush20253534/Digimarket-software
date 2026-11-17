"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, Spinner } from "@/components/ui";
import { FinanceFrame, FinancePager, money, useFinanceWindow } from "./shared";

const expenseTypes = {
  OTHER: "Other expenses",
  SELF_ADS: "Self Meta Ads",
  CLIENT_ADS: "Client Meta Ads",
  SALARY: "Salaries",
};
type ExpenseType = keyof typeof expenseTypes;
export type TotalExpenseSummary = {
  postedIncome: string;
  postedTotalExpense: string;
  netOperatingMoney: string;
  breakdown: Record<ExpenseType, string>;
};
type Records = {
  summary: TotalExpenseSummary;
  items: {
    id: string;
    date: string;
    type: ExpenseType;
    category: string;
    person: string;
    client: string;
    description: string;
    amount: string;
    reversal: boolean;
  }[];
  total: number;
  matchingAmount: string;
  page: number;
  limit: number;
};

export function TotalExpenses() {
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [data, setData] = useState<Records | null>(null),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [type, setType] = useState<"ALL" | ExpenseType>("ALL");
  const [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false);
  const query =
    w.query +
    "&" +
    new URLSearchParams({ page: String(page), limit: "25", type, q: search }).toString();
  const permitted =
    !!session &&
    session.identity.permissions.some(
      (p) => p === "finance.read.all" || p === "finance.entry.read.own",
    );
  useEffect(() => {
    setPage(1);
  }, [w.query]);
  useEffect(() => {
    if (!w.ready || !permitted) return;
    let active = true;
    setData(null);
    setError("");
    void request<Records>("/finance/total-expenses?" + query)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [w.ready, permitted, query, request]);

  async function exportCSV() {
    setExporting(true);
    setError("");
    try {
      const result = await request<{ csv: string; filename: string }>(
        "/finance/total-expenses/export?" + query,
      );
      const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <FinanceFrame
      title="Total expense"
      window={w}
      description="Every posted expense in the selected work cycle, including self and client Meta Ads and salaries."
    >
      {error && <Notice kind="error">{error}</Notice>}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Total expense summary">
        {(
          [
            ["Posted income", data?.summary.postedIncome],
            ["Total expense", data?.summary.postedTotalExpense],
            ["Net operating money", data?.summary.netOperatingMoney],
          ] as const
        ).map(([label, value]) => (
          <Card key={label}>
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="block mt-2 text-2xl">
              {value === undefined ? (error ? "Unavailable" : "…") : money(value)}
            </strong>
          </Card>
        ))}
      </div>
      <p className="text-sm text-slate-400">
        Net operating money = posted income − Total expense. Salaries are counted once.
        {w.view === "mine"
          ? " Salary records show your funded share."
          : " Salary records show each payment once, regardless of funding splits."}{" "}
        Reversals reduce expenses. Pending and cancelled entries, transfers, and client fund
        deposits are excluded.
      </p>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Expense breakdown">
        {Object.entries(expenseTypes).map(([key, label]) => (
          <Card key={key}>
            <p className="text-sm text-slate-400">{label}</p>
            <strong className="block mt-2">
              {data ? money(data.summary.breakdown[key as ExpenseType]) : "…"}
            </strong>
          </Card>
        ))}
      </div>
      <section
        aria-label="All expense records"
        className="space-y-4 rounded-xl border border-white/10 p-4 sm:p-5 min-w-0"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex-1 min-w-0">
            Search expenses
            <input
              className="input mt-1 w-full"
              type="search"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Category, person, client or description"
            />
          </label>
          <label>
            Expense type
            <select
              className="input mt-1 block"
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setPage(1);
              }}
            >
              <option value="ALL">All expense types</option>
              {Object.entries(expenseTypes).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="btn-secondary"
            disabled={exporting || !data}
            onClick={() => void exportCSV()}
          >
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
        <p className="text-sm text-slate-400">
          {data
            ? `${data.total} matching records · ${money(data.matchingAmount)}`
            : "Loading records…"}
          . Search and type filters apply to records and CSV; the summary shows the entire selected
          cycle.
        </p>
        {!data && !error ? (
          <Spinner label="Loading expense records…" />
        ) : (
          data && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left min-w-[780px]">
                  <thead className="text-slate-400 border-b border-white/10">
                    <tr>
                      {[
                        "Date",
                        "Type / category",
                        "Person / salary recipient",
                        "Client",
                        "Description",
                        "Amount",
                      ].map((label) => (
                        <th key={label} className="p-3">
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((row) => (
                      <tr key={row.id} className="border-b border-white/10 align-top">
                        <td className="p-3 whitespace-nowrap">{row.date}</td>
                        <td className="p-3">
                          {expenseTypes[row.type]}
                          <span className="block text-xs text-slate-400">{row.category}</span>
                        </td>
                        <td className="p-3">{row.person || "—"}</td>
                        <td className="p-3">{row.client || "—"}</td>
                        <td className="p-3 max-w-xs break-words">
                          {row.reversal && <span className="block text-amber-300">Reversal</span>}
                          {row.description || "—"}
                        </td>
                        <td className="p-3 whitespace-nowrap font-semibold">{money(row.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.items.length && <Notice>No posted expenses match these filters.</Notice>}
              <FinancePager page={page} total={data.total} limit={data.limit} onChange={setPage} />
            </>
          )
        )}
      </section>
    </FinanceFrame>
  );
}
