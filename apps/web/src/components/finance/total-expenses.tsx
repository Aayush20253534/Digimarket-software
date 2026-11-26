"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, Spinner } from "@/components/ui";
import { FinanceFrame, FinancePager, money, useFinanceWindow, useFinanceContext } from "./shared";
import {PersonalNetAfterSettlements} from "./personal-net-after-settlements";
import {ExpenseEditDialog,type EditableExpense,type EditOptions} from "./expense-edit-dialog";

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
  personalSettlementResetAt?: string;
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

export function TotalExpenses({initialType="ALL"}:{initialType?:"ALL"|ExpenseType}={}) {
  const context=useFinanceContext();
  const w = useFinanceWindow(),
    { session, request } = useAuth();
  const [data, setData] = useState<Records | null>(null),
    [error, setError] = useState("");
  const [page, setPage] = useState(1),
    [type, setType] = useState<"ALL" | ExpenseType>(initialType);
  useEffect(()=>{
    const value=new URLSearchParams(window.location.search).get("type");
    if(!context&&value&&Object.prototype.hasOwnProperty.call(expenseTypes,value))setType(value as ExpenseType);
  },[]);
  const [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<EditableExpense | null>(null);
  const [editOptions, setEditOptions] = useState<EditOptions | null>(null);
  const [editLoading, setEditLoading] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const canEdit = !!session
    && session.identity.roles.some(r => r === "ADMIN" || r === "SUPER_ADMIN")
    && session.identity.permissions.includes("finance.category.manage")
    && session.identity.permissions.includes("finance.read.all");
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
  }, [w.ready, permitted, query, request, refresh,context?.refresh]);

  async function deleteExpense(row: Records["items"][number]) {
    if (!canEdit || !row.id.startsWith("finance:") || row.reversal || editSaving) return;
    if (!window.confirm("Delete this expense of " + money(row.amount) + "? It will be removed from all financial totals; the audit record is retained.")) return;
    setEditSaving(true); setError(""); setNotice("");
    try {
      await request("/finance/entries/" + encodeURIComponent(row.id.slice("finance:".length)), { method: "DELETE" });
      setNotice("Expense deleted from financial totals.");
      setPage(1); setRefresh(v => v + 1);context?.onMutation();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to delete expense."); }
    finally { setEditSaving(false); }
  }

  async function beginEdit(row: Records["items"][number]) {
    if (!canEdit || !row.id.startsWith("finance:") || row.reversal) return;
    setError(""); setNotice(""); setEditLoading(row.id);
    try {
      const id = row.id.slice("finance:".length);
      // Reuse the existing, paginated finance register. A new GET /entries/:id/edit
      // endpoint is not required, so frontend and backend deployments cannot skew.
      const params = new URLSearchParams({
        from: row.date, to: row.date, view: "all",
        scope: row.type === "CLIENT_ADS" ? "meta_ads" : "agency",
        kind: "EXPENSE", status: "POSTED", page: "1", limit: "100",
      });
      type RegisterRow = {
        id: string; category: {id: string}; enteredById: string;
        clientId: string | null; amount: string; occurredOn: string;
        method: string; merchantOrSource: string | null; description: string | null;
      };
      let found: RegisterRow | undefined;
      let total = 0;
      for (let number = 1; number <= 1000; number++) {
        params.set("page", String(number));
        const result = await request<{items: RegisterRow[]; total: number}>("/finance/register?" + params.toString());
        found = result.items.find(entry => entry.id === id);
        total = result.total;
        if (found || number * 100 >= total || result.items.length === 0) break;
      }
      if (!found) throw new Error("Expense could not be found in the finance register. Refresh this page and try again.");
      const [categories, people, clients] = await Promise.all([
        request<EditOptions["categories"]>("/finance/categories"),
        request<EditOptions["people"]>("/finance/assignees"),
        request<EditOptions["clients"]>("/finance/meta-ad-clients"),
      ]);
      setEditing({
        id: found.id, categoryId: found.category.id, enteredById: found.enteredById,
        clientId: found.clientId, amount: found.amount, occurredOn: found.occurredOn,
        method: found.method, merchantOrSource: found.merchantOrSource ?? "",
        description: found.description ?? "",
      });
      setEditOptions({categories, people, clients});
    } catch(e) {
      setError(e instanceof Error ? e.message : "Unable to edit this entry.");
    } finally {
      setEditLoading(null);
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !canEdit || editSaving) return;
    setEditSaving(true);setError("");
    try {
      const {id, categoryId, enteredById, clientId, amount, occurredOn, method,
        merchantOrSource, description} = editing;
      await request("/finance/entries/" + encodeURIComponent(id), {
        method: "PUT",
        body: {categoryId, enteredById, clientId, amount, occurredOn, method,
          merchantOrSource, description},
      });
      setEditing(null);setEditOptions(null);
      setNotice("Expense updated. User-wise totals reflect the assigned user; agency totals are unaffected by reassignment.");
      setRefresh(value => value + 1);context?.onMutation();
    } catch(e) {
      setError(e instanceof Error ? e.message : "Unable to save the expense.");
    } finally {
      setEditSaving(false);
    }
  }

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
      {notice && <Notice kind="success">{notice}</Notice>}
      {w.view === "mine" && data?.summary.personalSettlementResetAt && (
        <p className="text-sm text-slate-400" role="status">My summary restarted with your latest founder settlement. Older entries remain in the register; agency totals are unchanged.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Total expense summary">
        {w.view==="mine"&&<PersonalNetAfterSettlements period={w.period}/>}
        {(
          [
            ["Posted income", data?.summary.postedIncome],
            ["Total expense", data?.summary.postedTotalExpense],
            [w.view==="mine"?"Operating net (before settlements)":"Net operating money", data?.summary.netOperatingMoney],
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
        deposits are excluded from operating profit. Personal settlement transfers appear in a separate adjusted-net card.
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
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
          <label className="block w-full sm:flex-1 sm:min-w-[14rem]">
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
          <label className="block w-full sm:w-auto">
            Expense type
            <select
              className="input mt-1 block w-full"
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
            className="btn-secondary w-full sm:w-auto"
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
          . Search and type filters apply to records and CSV. Personal summary cards restart after
          the latest active founder settlement; historical rows remain listed.
        </p>
        {!data && !error ? (
          <Spinner label="Loading expense records…" />
        ) : (
          data && (
            <>
              <div className="space-y-3 md:hidden" aria-label="Mobile expense records">
                {data.items.map(row => (
                  <article key={row.id} className="rounded-lg border border-white/10 p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-base">{money(row.amount)}</strong>
                      <span className="text-xs text-slate-400">{row.date}</span>
                    </div>
                    <p className="text-sm font-semibold">{expenseTypes[row.type]} · {row.category}</p>
                    <p className="text-sm">Assigned to: {row.person || "—"}</p>
                    {row.client && <p className="text-sm">Client: {row.client}</p>}
                    {row.description && <p className="text-sm break-words">{row.description}</p>}
                    {row.reversal && <p className="text-xs text-amber-300">Reversal</p>}
                    {canEdit && row.id.startsWith("finance:") && !row.reversal &&
                      <button type="button" className="btn-secondary text-xs" disabled={!!editLoading || editSaving}
                        onClick={() => void beginEdit(row)}>
                        {editLoading === row.id ? "Opening…" : "Edit expense"}
                      </button>}
                    {canEdit && row.id.startsWith("finance:") && !row.reversal &&
                      <button type="button" className="btn-secondary text-xs text-red-400" disabled={editSaving}
                        onClick={() => void deleteExpense(row)}>Delete expense</button>}
                    {canEdit && row.type === "SALARY" && <Link href="/app/salary" className="text-sm underline text-violet-300">View salary workflow</Link>}
                  </article>
                ))}
              </div>
              <div className="hidden md:block overflow-x-auto">
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
                        ...(canEdit ? ["Actions"] : []),
                      ].map(label => <th key={label} className="p-3">{label}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map(row => (
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
                        {canEdit && <td className="p-3">
                          {row.id.startsWith("finance:") && !row.reversal ?
                            <button type="button" className="btn-secondary text-xs" disabled={!!editLoading || editSaving}
                              onClick={() => void beginEdit(row)}>
                              {editLoading === row.id ? "Opening…" : "Edit"}
                            </button> :
                            row.type === "SALARY" ? <Link href="/app/salary" className="underline text-violet-300">View salary</Link> : "—"}
                          {row.id.startsWith("finance:") && !row.reversal && <button type="button" className="btn-secondary text-xs text-red-400 mt-1" disabled={editSaving} onClick={() => void deleteExpense(row)}>Delete</button>}
                        </td>}
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
      {editing && editOptions && canEdit && <ExpenseEditDialog editing={editing} editOptions={editOptions} setEditing={setEditing} editSaving={editSaving} error={error} saveEdit={saveEdit} onCancel={()=>{setEditing(null);setEditOptions(null);}}/>}
    </FinanceFrame>
  );
}
