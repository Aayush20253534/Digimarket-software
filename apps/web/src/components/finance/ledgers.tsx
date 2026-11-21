"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { AGENCY_START_DATE, agencyToday } from "@digimarket/contracts";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, Spinner } from "@/components/ui";
import { DownloadCSV, FinanceFrame, FinancePager, money, useFinanceWindow } from "./shared";
import { ReversalButton } from "./reversal";

type Account = {
  id: string;
  name: string;
  kind: string;
  ownerName: string | null;
  openingOn: string;
  openingBalance: string;
  opening: string;
  movement: string;
  closing: string;
};
type OwnClientAdSpend={
  posted:string;entries:number;
  byClient:{clientId:string;name:string;posted:string;entries:number}[];
};
type ClientBalance = {
  id: string;
  name: string;
  opening: string;
  received: string;
  refunded: string;
  spent: string;
  adjustments: string;
  closing: string;
};
type HistoryRow = {
  id?: string;
  key?: string;
  sourceId?: string;
  source: "FINANCE" | "SALARY" | "SALARY_TOTAL" | "FUNDS" | "CLIENT_FUND" | "TRANSFER";
  kind?: string;
  amount: string;
  occurredOn: string;
  description: string;
  reversesId?: string | null;
  reversedBy?: string | null;
};
type History = { items: HistoryRow[]; total: number; page: number; limit: number };
type Unassigned = {
  finance: { id: string; date: string; label: string; amount: string }[];
  salary: { id: string; date: string; label: string; amount: string }[];
  financeCount: number;
  salaryCount: number;
  page: number;
  limit: number;
};
type Review = {
  from: string;
  to: string;
  closed: { closedAt: string; note: string } | null;
  accounts: (Account & { matched: boolean; statementBalance: string | null })[];
  pending: number;
  unassignedFinance: number;
  unassignedSalary: number;
  blockers: string[];
  canClose: boolean;
  clientDeficits?: { id: string; name: string; closing: string }[];
};
function useData<T>(url: string, enabled: boolean, version = 0) {
  const { request } = useAuth();
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setError("");
    setData(null);
    void request<T>(url)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [url, enabled, version, request]);
  return { data, error };
}
function useLedger() {
  const w = useFinanceWindow(),
    auth = useAuth(),
    [version, setVersion] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const allowed = !!auth.session?.identity.permissions.includes("finance.read.all");
  const founder = !!auth.session?.identity.roles.includes("FOUNDER");
  const write =
    allowed &&
    !!auth.session?.identity.roles.some((r) => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r));
  const refresh = () => setVersion((v) => v + 1);
  async function save(path: string, body: unknown, message: string) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await auth.request(path, { method: "POST", body });
      setSuccess(message);
      refresh();
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save finance record");
      return null;
    } finally {
      setBusy(false);
    }
  }
  return {
    w,
    ...auth,
    version,
    refresh,
    busy,
    error,
    success,
    save,
    enabled: allowed && w.ready,
    write,
    founder,
  };
}
function Feedback({ error, success }: { error: string; success: string }) {
  return (
    <>
      {error && <Notice kind="error">{error}</Notice>}
      {success && <Notice kind="success">{success}</Notice>}
    </>
  );
}
function AccountSelect({
  id,
  label,
  accounts,
  value,
  onChange,
}: {
  id: string;
  label: string;
  accounts: { id: string; name: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        className="field"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose account</option>
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}
function HistoryTable({
  data,
  allowReverse,
  founder,
  onSaved,
}: {
  data: History;
  allowReverse: boolean;
  founder: boolean;
  onSaved: () => void;
}) {
  return !data.items.length ? (
    <EmptyState
      title="No movements in this range"
      description="Adjust the dates or search to view other records."
    />
  ) : (
    <div className="overflow-x-auto">
      <table className="aw-finance-register">
        <thead>
          <tr>
            {["Date", "Source", "Description", "Movement", "Correction"].map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.items.map((row) => (
            <tr key={row.key ?? row.id}>
              <td>{row.occurredOn}</td>
              <td>{row.kind ?? row.source.replaceAll("_", " ")}</td>
              <td className="min-w-48 max-w-96 whitespace-pre-wrap">{row.description}</td>
              <td>{money(row.amount)}</td>
              <td>
                {row.reversesId
                  ? "Reversal"
                  : row.reversedBy
                    ? "Reversed"
                    : allowReverse &&
                      row.source !== "SALARY_TOTAL" &&
                      (row.source !== "SALARY" || founder) && (
                        <ReversalButton
                          id={(row.id ?? row.sourceId)!}
                          source={row.source === "CLIENT_FUND" ? "FUNDS" : row.source}
                          label={money(row.amount)}
                          onSaved={onSaved}
                        />
                      )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AccountsOverview() {
  const l = useLedger(),
    { data: accounts, error } = useData<Account[]>(
      "/finance/accounts?" + l.w.query,
      l.enabled,
      l.version,
    );
  const owners = useData<{ id: string; displayName: string }[]>(
    "/finance/account-owners",
    l.enabled && l.write,
  );
  const [form, setForm] = useState({
    name: "",
    kind: "BANK",
    ownerUserId: "",
    openingOn: AGENCY_START_DATE,
    openingBalance: "0",
  });
  async function submit(e: FormEvent) {
    e.preventDefault();
    const result = await l.save(
      "/finance/accounts",
      { ...form, ownerUserId: form.kind === "FOUNDER" ? form.ownerUserId : undefined },
      "Account created. Link its existing transactions before reconciling.",
    );
    if (result) setForm((v) => ({ ...v, name: "", ownerUserId: "", openingBalance: "0" }));
  }
  return (
    <FinanceFrame
      title="Accounts & transfers"
      description="Balances carry forward between cycles. Open an account to inspect its movements and reconcile it."
      window={l.w}
      agencyOnly
      actions={
        <div className="flex flex-wrap gap-2">
          <Link className="btn-secondary" href={"/app/finance/transfers?" + l.w.query}>
            Transfers
          </Link>
          <Link className="btn-primary" href={"/app/finance/unassigned?" + l.w.query}>
            Assign existing records
          </Link>
        </div>
      }
    >
      <Feedback error={l.error || error || owners.error} success={l.success} />
      <Notice>
        Use each real account once. A founder clearing balance below zero means the agency owes the
        founder; above zero means the founder holds agency funds. Opening balances are amounts
        before the opening date's entries.
      </Notice>
      {accounts ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => (
              <Link
                key={a.id}
                href={"/app/finance/accounts/" + a.id + "?" + l.w.query}
                className="rounded-xl border border-white/10 p-5 hover:border-violet-400"
              >
                <h2 className="text-lg font-semibold">{a.name}</h2>
                <p className="text-sm text-slate-400">
                  {a.kind} {a.ownerName && "· " + a.ownerName}
                </p>
                <p className="mt-4 text-2xl">{money(a.closing)}</p>
                <p className="mt-2 text-sm text-slate-400">
                  Opening {money(a.opening)} · Movement {money(a.movement)}
                </p>
              </Link>
            ))}
          </div>
          {!accounts.length && (
            <EmptyState
              title="No money accounts yet"
              description="Create accounts using verified opening balances. Existing transactions remain unassigned until reviewed."
            />
          )}
          <DownloadCSV
            name={"money-accounts-" + l.w.period.from}
            rows={[
              ["Account", "Type", "Opening", "Movement", "Closing"],
              ...accounts.map((a) => [a.name, a.kind, a.opening, a.movement, a.closing]),
            ]}
          />
        </>
      ) : (
        !error && <Spinner label="Loading accounts…" />
      )}
      {l.write && (
        <details className="rounded-xl border border-white/10 p-5">
          <summary className="cursor-pointer font-semibold">Create money account</summary>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
            <FormField id="account-name" label="Account name">
              <input
                id="account-name"
                className="field"
                required
                minLength={2}
                maxLength={120}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </FormField>
            <FormField id="account-kind" label="Account type">
              <select
                id="account-kind"
                className="field"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                {["BANK", "CASH", "UPI", "FOUNDER"].map((k) => (
                  <option key={k} value={k}>
                    {k === "FOUNDER" ? "Founder clearing" : k}
                  </option>
                ))}
              </select>
            </FormField>
            {form.kind === "FOUNDER" && (
              <FormField id="account-owner" label="Founder">
                <select
                  id="account-owner"
                  className="field"
                  required
                  value={form.ownerUserId}
                  onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
                >
                  <option value="">Choose founder</option>
                  {owners.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              </FormField>
            )}
            <FormField id="account-opening-date" label="Opening date">
              <input
                id="account-opening-date"
                className="field"
                type="date"
                min={AGENCY_START_DATE}
                max={agencyToday()}
                required
                value={form.openingOn}
                onChange={(e) => setForm({ ...form, openingOn: e.target.value })}
              />
            </FormField>
            <FormField id="account-opening-balance" label="Verified opening balance (INR)">
              <input
                id="account-opening-balance"
                className="field"
                type="number"
                step="0.0001"
                required
                value={form.openingBalance}
                onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
              />
            </FormField>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={l.busy}>
                Create account
              </button>
            </div>
          </form>
        </details>
      )}
    </FinanceFrame>
  );
}
export function AccountDetails({ id }: { id: string }) {
  const l = useLedger(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const accounts = useData<Account[]>("/finance/accounts?" + l.w.query, l.enabled, l.version);
  const history = useData<History>(
    "/finance/account-history?" +
      l.w.query +
      "&accountId=" +
      id +
      "&page=" +
      page +
      "&q=" +
      encodeURIComponent(search),
    l.enabled,
    l.version,
  );
  const a = accounts.data?.find((a) => a.id === id);
  useEffect(() => setPage(1), [l.w.query, search]);
  return (
    <FinanceFrame
      title={a?.name ?? "Account movements"}
      description="Signed movements explain the account balance. Opening balance is recorded separately from income."
      window={l.w}
      agencyOnly
      actions={
        <Link className="btn-secondary" href={"/app/finance/accounts?" + l.w.query}>
          All accounts
        </Link>
      }
    >
      <Feedback error={l.error || accounts.error || history.error} success={l.success} />
      {a && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Opening", a.opening],
            ["Movement", a.movement],
            ["Closing", a.closing],
          ].map(([label, value]) => (
            <Card key={label}>
              <p>{label}</p>
              <strong>{money(value)}</strong>
            </Card>
          ))}
        </div>
      )}
      <Card title="Account history">
        <input
          className="field mb-4"
          type="search"
          aria-label="Search account movements"
          placeholder="Search description"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {history.data ? (
          <>
            <HistoryTable
              data={history.data}
              allowReverse={l.write}
              founder={l.founder}
              onSaved={l.refresh}
            />
            <FinancePager page={page} total={history.data.total} onChange={setPage} />
          </>
        ) : (
          !history.error && <Spinner />
        )}
      </Card>
      {a && l.write && (
        <>
          <ReconcileForm account={a} date={l.w.period.to} save={l.save} busy={l.busy} />
          <AccountCorrection account={a} save={l.save} busy={l.busy} />
        </>
      )}
    </FinanceFrame>
  );
}
function AccountCorrection({
  account: a,
  save,
  busy,
}: {
  account: Account;
  save: ReturnType<typeof useLedger>["save"];
  busy: boolean;
}) {
  const [form, setForm] = useState({
    name: a.name,
    openingOn: a.openingOn,
    openingBalance: a.openingBalance,
    note: "",
  });
  return (
    <details className="rounded-xl border border-white/10 p-5">
      <summary className="cursor-pointer font-semibold">Correct account setup</summary>
      <p className="mt-3 text-sm text-slate-400">
        Available while the opening cycle is open. Corrections are audited and may require
        reconciling the account again.
      </p>
      <form
        className="mt-4 grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await save(
            "/finance/account-corrections",
            { id: a.id, ...form },
            "Account setup corrected. Recheck the statement reconciliation.",
          );
        }}
      >
        <FormField id="correct-account-name" label="Account name">
          <input
            id="correct-account-name"
            className="field"
            required
            minLength={2}
            maxLength={120}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </FormField>
        <FormField id="correct-opening-date" label="Opening date">
          <input
            id="correct-opening-date"
            className="field"
            type="date"
            min={AGENCY_START_DATE}
            max={agencyToday()}
            required
            value={form.openingOn}
            onChange={(e) => setForm({ ...form, openingOn: e.target.value })}
          />
        </FormField>
        <FormField id="correct-opening-balance" label="Verified opening balance (INR)">
          <input
            id="correct-opening-balance"
            className="field"
            type="number"
            step="0.0001"
            required
            value={form.openingBalance}
            onChange={(e) => setForm({ ...form, openingBalance: e.target.value })}
          />
        </FormField>
        <FormField id="correct-account-note" label="Correction reason">
          <input
            id="correct-account-note"
            className="field"
            required
            minLength={4}
            maxLength={500}
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </FormField>
        <button className="btn-primary" disabled={busy}>
          Save account correction
        </button>
      </form>
    </details>
  );
}
function ReconcileForm({
  account,
  date,
  save,
  busy,
}: {
  account: Account;
  date: string;
  save: ReturnType<typeof useLedger>["save"];
  busy: boolean;
}) {
  const [balance, setBalance] = useState(""),
    [note, setNote] = useState("");
  return (
    <Card
      title={"Reconcile through " + date}
      description="Enter the closing balance from your bank statement, cash count or founder confirmation. A difference blocks closing; it does not create an automatic adjustment."
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          await save(
            "/finance/reconciliations",
            { accountId: account.id, asOf: date, statementBalance: balance, note },
            "Reconciliation saved. Cycle checks now use this statement.",
          );
        }}
        data-reconciliation-form
      >
        <FormField id={"statement-" + account.id} label="Statement balance (INR)">
          <input
            id={"statement-" + account.id}
            className="field"
            required
            type="number"
            step="0.0001"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
          />
        </FormField>
        <FormField id={"statement-note-" + account.id} label="Statement reference / note">
          <input
            id={"statement-note-" + account.id}
            className="field"
            required
            minLength={4}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </FormField>
        <p className="text-sm">Recorded closing balance: {money(account.closing)}</p>
        <button type="submit" className="btn-primary" disabled={busy || date >= agencyToday()}>
          Save reconciliation
        </button>
      </form>
    </Card>
  );
}

export function ClientFundsOverview() {
  const l = useLedger();
  const ownAccess=!!l.session?.identity.permissions.includes("finance.entry.read.own");
  const {data,error}=useData<ClientBalance[]>(
    "/finance/client-funds?"+l.w.query,
    l.enabled&&l.w.view==="all",l.version);
  const agencySpend=useData<{clientAdSpend:{posted:string}}>(
    "/finance/summary?"+l.w.query,
    l.enabled&&l.w.view==="all",l.version);
  const personal=useData<OwnClientAdSpend>(
    "/finance/client-ad-spend/mine?"+
      new URLSearchParams(l.w.period).toString(),
    ownAccess&&l.w.ready&&l.w.view==="mine",l.version);
  if(l.w.view==="mine")return (
    <FinanceFrame title="Client ads paid from my account"
      description="Only posted client Meta Ads expenses assigned to your personal clearing account for the selected cycle. This is money spent, not the total client deposit balance."
      window={l.w}>
      <Feedback error={personal.error} success=""/>
      {personal.data?<><Card>
        <p className="text-sm text-slate-400">Client advertising outflow from my account</p>
        <strong className="mt-2 block text-2xl">{money(personal.data.posted)}</strong>
        <p className="mt-2 text-sm text-slate-400">{personal.data.entries} posted entries in this cycle</p>
      </Card>
      <section className="grid gap-3 sm:grid-cols-2" aria-label="My client ad spending by client">
        {personal.data.byClient.map(row=><Card key={row.clientId}>
          <p className="font-semibold">{row.name}</p>
          <strong className="mt-2 block text-xl">{money(row.posted)}</strong>
          <p className="mt-1 text-xs text-slate-400">{row.entries} posted entries · My account only</p>
        </Card>)}
      </section>
      {!personal.data.byClient.length&&<Notice>No client Meta Ads have been paid from this account during the selected cycle.</Notice>}
      </>:!personal.error&&<Spinner label="Loading client advertising outflows…"/>}
    </FinanceFrame>
  );
  return (
    <FinanceFrame
      title="Client ad funds"
      description="Client Meta Ads spending from all founder accounts. Deposit balances remain separate for reconciliation."
      window={l.w}
      agencyOnly
    >
      <Feedback error={error||agencySpend.error} success="" />
      {agencySpend.data?<Card>
        <p className="text-sm text-slate-400">Total posted client Meta Ads · all accounts · selected cycle</p>
        <strong className="mt-2 block text-2xl" data-testid="agency-client-ad-spend">{money(agencySpend.data.clientAdSpend.posted)}</strong>
        <p className="mt-2 text-xs text-slate-400">Advertising spend, not the remaining client deposit balance.</p>
      </Card>:!agencySpend.error&&<Spinner label="Loading agency client advertising spend…"/>}
      <Notice>
        Historical ad spending has not been treated as a deposit. Negative balances identify missing
        funding or spending that needs correction.
      </Notice>
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.map((c) => (
              <Link
                key={c.id}
                className="rounded-xl border border-white/10 p-5 hover:border-violet-400"
                href={"/app/finance/client-funds/" + c.id + "?" + l.w.query}
              >
                <h2 className="font-semibold">{c.name}</h2>
                <p className="mt-3 text-2xl">{money(c.spent)}</p>
                <p className="mt-1 text-xs text-slate-400">Client ad spend · all accounts · this cycle</p>
                <p className={"mt-2 text-sm " + (Number(c.closing) < 0 ? "text-amber-300" : "text-slate-400")}>
                  Remaining recorded funds: {money(c.closing)}
                </p>
                <p className="mt-2 text-sm text-slate-400">
                  Received {money(c.received)} · Refunded {money(c.refunded)}
                </p>
                {Number(c.closing) < 0 && (
                  <p className="mt-2 text-xs text-amber-300">Outstanding funds · review required</p>
                )}
              </Link>
            ))}
          </div>
          {!data.length && (
            <EmptyState
              title="No clients yet"
              description="Add a client before recording advertising funds."
            />
          )}
          <DownloadCSV
            name={"client-ad-funds-" + l.w.period.from}
            rows={[
              ["Client", "Opening", "Received", "Refunded", "Spent", "Adjustments", "Closing"],
              ...data.map((c) => [
                c.name,
                c.opening,
                c.received,
                c.refunded,
                c.spent,
                c.adjustments,
                c.closing,
              ]),
            ]}
          />
        </>
      ) : (
        !error && <Spinner />
      )}
    </FinanceFrame>
  );
}
export function ClientFundDetails({ id }: { id: string }) {
  const l = useLedger(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const balances = useData<ClientBalance[]>(
      "/finance/client-funds?" + l.w.query,
      l.enabled,
      l.version,
    ),
    accounts = useData<{ id: string; name: string }[]>(
      "/finance/account-options",
      l.enabled && l.write,
      l.version,
    );
  const history = useData<History>(
      "/finance/client-funds/history?" +
        l.w.query +
        "&clientId=" +
        id +
        "&page=" +
        page +
        "&q=" +
        encodeURIComponent(search),
      l.enabled,
      l.version,
    ),
    client = balances.data?.find((c) => c.id === id);
  const [form, setForm] = useState({
      kind: "TOPUP",
      accountId: "",
      amount: "",
      occurredOn: agencyToday(),
      reference: "",
      note: "",
    }),
    [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => setPage(1), [l.w.query, search]);
  return (
    <FinanceFrame
      title={client?.name ?? "Client ad funds"}
      description="Top-ups increase funds held for this client. Refunds and posted advertising spend reduce them."
      window={l.w}
      agencyOnly
      actions={
        <Link className="btn-secondary" href={"/app/finance/client-funds?" + l.w.query}>
          All client funds
        </Link>
      }
    >
      <Feedback
        error={l.error || balances.error || history.error || accounts.error}
        success={l.success}
      />
      {client && (
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Opening", client.opening],
            ["Received", client.received],
            ["Spent", client.spent],
            ["Refunded", client.refunded],
            ["Adjustments", client.adjustments],
            ["Closing", client.closing],
          ].map(([label, value]) => (
            <Card key={label}>
              <p>{label}</p>
              <strong>{money(value)}</strong>
            </Card>
          ))}
        </div>
      )}
      {l.write && (
        <details className="rounded-xl border border-white/10 p-5">
          <summary className="cursor-pointer font-semibold">Record top-up or refund</summary>
          <form
            className="mt-4 grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const saved = await l.save(
                "/finance/client-funds",
                { ...form, clientId: id, idempotencyKey: key },
                "Client funds recorded. Agency income is unchanged.",
              );
              if (saved) {
                setKey(crypto.randomUUID());
                setForm((v) => ({ ...v, amount: "", reference: "", note: "" }));
              }
            }}
          >
            <FormField id="fund-kind" label="Movement">
              <select
                id="fund-kind"
                className="field"
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
              >
                <option value="TOPUP">Client top-up</option>
                <option value="REFUND">Refund to client</option>
              </select>
            </FormField>
            <AccountSelect
              id="fund-account"
              label={form.kind === "TOPUP" ? "Received into account" : "Paid from account"}
              accounts={accounts.data ?? []}
              value={form.accountId}
              onChange={(accountId) => setForm({ ...form, accountId })}
            />
            <FormField id="fund-amount" label="Amount (INR)">
              <input
                id="fund-amount"
                className="field"
                type="number"
                min="0.0001"
                step="0.0001"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </FormField>
            <FormField id="fund-date" label="Date">
              <input
                id="fund-date"
                className="field"
                type="date"
                required
                value={form.occurredOn}
                onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
              />
            </FormField>
            <FormField id="fund-reference" label="Payment reference">
              <input
                id="fund-reference"
                className="field"
                maxLength={160}
                value={form.reference}
                onChange={(e) => setForm({ ...form, reference: e.target.value })}
              />
            </FormField>
            <FormField id="fund-note" label="Note">
              <input
                id="fund-note"
                className="field"
                required
                minLength={4}
                maxLength={500}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </FormField>
            <div className="sm:col-span-2">
              <button className="btn-primary" disabled={l.busy || !accounts.data?.length}>
                Record funds movement
              </button>
            </div>
          </form>
        </details>
      )}
      <Card title="Client funds history">
        <input
          className="field mb-4"
          type="search"
          aria-label="Search client funds"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search notes"
        />
        {history.data ? (
          <>
            <HistoryTable
              data={history.data}
              allowReverse={l.write}
              founder={l.founder}
              onSaved={l.refresh}
            />
            <FinancePager page={page} total={history.data.total} onChange={setPage} />
          </>
        ) : (
          !history.error && <Spinner />
        )}
      </Card>
    </FinanceFrame>
  );
}

export function TransfersPage() {
  const l = useLedger(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState("");
  const accounts = useData<{ id: string; name: string }[]>(
    "/finance/account-options",
    l.enabled,
    l.version,
  );
  const history = useData<{
    items: {
      id: string;
      fromAccount: { name: string };
      toAccount: { name: string };
      amount: string;
      occurredOn: string;
      note: string;
      reversesId: string | null;
      reversedBy?: { id: string } | null;
    }[];
    total: number;
  }>(
    "/finance/transfers?" + l.w.query + "&page=" + page + "&q=" + encodeURIComponent(search),
    l.enabled,
    l.version,
  );
  const [form, setForm] = useState({
      fromAccountId: "",
      toAccountId: "",
      amount: "",
      occurredOn: agencyToday(),
      note: "",
    }),
    [key, setKey] = useState(() => crypto.randomUUID());
  useEffect(() => setPage(1), [l.w.query, search]);
  return (
    <FinanceFrame
      title="Account transfers"
      description="Record completed transfers and founder reimbursements. Transfers move balances without changing agency income, expenses or profit."
      window={l.w}
      agencyOnly
    >
      <Feedback error={l.error || accounts.error || history.error} success={l.success} />
      {l.write && (
        <Card
          title="Record a transfer"
          description="This records a transfer you already made; it does not move money through your bank."
        >
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const saved = await l.save(
                "/finance/transfers",
                { ...form, idempotencyKey: key },
                "Transfer recorded. Agency operating totals are unchanged.",
              );
              if (saved) {
                setKey(crypto.randomUUID());
                setForm((v) => ({ ...v, amount: "", note: "" }));
              }
            }}
          >
            <AccountSelect
              id="transfer-from"
              label="From account"
              accounts={accounts.data ?? []}
              value={form.fromAccountId}
              onChange={(fromAccountId) => setForm({ ...form, fromAccountId })}
            />
            <AccountSelect
              id="transfer-to"
              label="To account"
              accounts={accounts.data ?? []}
              value={form.toAccountId}
              onChange={(toAccountId) => setForm({ ...form, toAccountId })}
            />
            <FormField id="transfer-amount" label="Amount (INR)">
              <input
                id="transfer-amount"
                className="field"
                type="number"
                min="0.0001"
                step="0.0001"
                required
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </FormField>
            <FormField id="transfer-date" label="Date">
              <input
                id="transfer-date"
                className="field"
                type="date"
                required
                value={form.occurredOn}
                onChange={(e) => setForm({ ...form, occurredOn: e.target.value })}
              />
            </FormField>
            <FormField id="transfer-note" label="Reference / note">
              <input
                id="transfer-note"
                className="field"
                required
                minLength={4}
                maxLength={500}
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
              />
            </FormField>
            <button
              className="btn-primary self-end"
              disabled={l.busy || form.fromAccountId === form.toAccountId}
            >
              Record transfer
            </button>
          </form>
        </Card>
      )}
      <Card title="Transfer history">
        <input
          className="field mb-4"
          type="search"
          aria-label="Search transfers"
          placeholder="Search reference / note"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {history.data ? (
          <>
            <div className="overflow-x-auto">
              <table className="aw-finance-register">
                <thead>
                  <tr>
                    {["Date", "From", "To", "Amount", "Note", "Correction"].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.data.items.map((t) => (
                    <tr key={t.id}>
                      <td>{t.occurredOn.slice(0, 10)}</td>
                      <td>{t.fromAccount.name}</td>
                      <td>{t.toAccount.name}</td>
                      <td>{money(t.amount)}</td>
                      <td>{t.note}</td>
                      <td>
                        {t.reversesId
                          ? "Reversal"
                          : t.reversedBy
                            ? "Reversed"
                            : l.write && (
                                <ReversalButton
                                  source="TRANSFER"
                                  id={t.id}
                                  label={money(t.amount)}
                                  onSaved={l.refresh}
                                />
                              )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <FinancePager page={page} total={history.data.total} onChange={setPage} />
          </>
        ) : (
          !history.error && <Spinner />
        )}
      </Card>
    </FinanceFrame>
  );
}
export function UnassignedPage() {
  const l = useLedger(),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState<Record<string, string>>({});
  const accounts = useData<{ id: string; name: string }[]>(
      "/finance/account-options",
      l.enabled,
      l.version,
    ),
    pending = useData<Unassigned>(
      "/finance/unassigned?" + l.w.query + "&page=" + page,
      l.enabled,
      l.version,
    );
  useEffect(() => setPage(1), [l.w.query]);
  return (
    <FinanceFrame
      title="Assign money accounts"
      description="Review which real account funded or received each historical record. Assignment changes cash reporting, not income or expenses."
      window={l.w}
      agencyOnly
    >
      <Feedback error={l.error || accounts.error || pending.error} success={l.success} />
      {!l.founder && !!pending.data?.salaryCount && (
        <Notice>Salary allocations need a founder to assign their money accounts.</Notice>
      )}
      {pending.data ? (
        <>
          {(
            [
              [
                "finance",
                "Income and expense entries",
                pending.data.finance,
                pending.data.financeCount,
              ],
              [
                "salary",
                "Salary funding allocations",
                pending.data.salary,
                pending.data.salaryCount,
              ],
            ] as const
          )
            .filter(([source]) => source !== "salary" || l.founder)
            .map(([source, title, rows, count]) => (
              <Card key={source} title={title} description={count + " records need an account"}>
                <div className="space-y-3">
                  {rows.map((row) => (
                    <form
                      key={row.id}
                      className="flex flex-wrap items-end gap-3 rounded-lg border border-white/10 p-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await l.save(
                          "/finance/account-links",
                          { source, id: row.id, accountId: selected[row.id] },
                          "Money account assigned.",
                        );
                      }}
                    >
                      <div className="min-w-48 flex-1">
                        <strong>{row.label}</strong>
                        <p className="text-sm">
                          {row.date} · {money(row.amount)}
                        </p>
                      </div>
                      <AccountSelect
                        id={"assign-" + row.id}
                        label="Money account"
                        accounts={accounts.data ?? []}
                        value={selected[row.id] ?? ""}
                        onChange={(value) => setSelected({ ...selected, [row.id]: value })}
                      />
                      {l.write && (
                        <button className="btn-primary" disabled={l.busy || !selected[row.id]}>
                          Assign
                        </button>
                      )}
                    </form>
                  ))}
                </div>
                {!rows.length && <p>No unassigned entries on this page.</p>}
              </Card>
            ))}
          <FinancePager
            page={page}
            total={Math.max(pending.data.financeCount, l.founder ? pending.data.salaryCount : 0)}
            onChange={setPage}
          />
        </>
      ) : (
        !pending.error && <Spinner />
      )}
    </FinanceFrame>
  );
}
export function CycleClosingPage() {
  const l = useLedger(),
    { data, error } = useData<Review>("/finance/cycle-review?" + l.w.query, l.enabled, l.version),
    [note, setNote] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [confirmClientDeficits, setConfirmClientDeficits] = useState(false);
  useEffect(() => {
    setConfirmed(false);
    setConfirmClientDeficits(false);
    setNote("");
  }, [l.w.query]);
  return (
    <FinanceFrame
      title="Close a work cycle"
      description="Close only after all posted records are assigned and account balances match verified statements. Closed records are protected from editing or deletion."
      window={l.w}
      agencyOnly
    >
      <Feedback error={l.error || error} success={l.success} />
      {data ? (
        data.closed ? (
          <Notice kind="success">
            Cycle closed on {data.closed.closedAt.slice(0, 10)}. {data.closed.note} Corrections must
            be reversals in an open cycle.
          </Notice>
        ) : (
          <>
            {!!data.blockers.length && (
              <Card title="Complete before closing">
                <ul className="list-disc pl-5 space-y-2">
                  {data.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="btn-secondary" href={"/app/finance/unassigned?" + l.w.query}>
                    Assign records
                  </Link>
                  <Link className="btn-secondary" href={"/app/finance/client-funds?" + l.w.query}>
                    Review client funds
                  </Link>
                  <button className="btn-secondary" onClick={l.refresh}>
                    Refresh checks
                  </button>
                </div>
              </Card>
            )}
            {data.accounts.map((a) => (
              <div key={a.id}>
                {a.matched ? (
                  <Card title={a.name}>
                    <p>Matched statement: {money(a.closing)}</p>
                  </Card>
                ) : l.write ? (
                  <ReconcileForm account={a} date={data.to} save={l.save} busy={l.busy} />
                ) : (
                  <Card title={a.name}>
                    <p>Reconciliation required.</p>
                  </Card>
                )}
              </div>
            ))}
            {l.write && (
              <Card title="Lock this cycle">
                <form
                  className="space-y-4"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await l.save(
                      "/finance/cycle-close",
                      { from: data.from, to: data.to, note, confirmed, confirmClientDeficits },
                      "Cycle closed. Historical records are locked.",
                    );
                  }}
                >
                  <FormField id="close-note" label="Closing note">
                    <textarea
                      id="close-note"
                      className="field"
                      required
                      minLength={4}
                      maxLength={500}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </FormField>
                  <label className="flex gap-3 items-start">
                    <input
                      type="checkbox"
                      required
                      checked={confirmed}
                      onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    <span>
                      I verified the accounts and client balances. I understand that corrections
                      will require reversals in an open cycle.
                    </span>
                  </label>
                  {!!data.clientDeficits?.length && (
                    <div className="space-y-3 rounded-lg border border-amber-400/40 p-4">
                      <p className="text-sm">
                        These clients have advertising spend above recorded funding. Check missing
                        receipts and classification, then document any genuine amount still owed to
                        the agency in the closing note.
                      </p>
                      <ul>
                        {data.clientDeficits.map((c) => (
                          <li key={c.id}>
                            {c.name}: {money(c.closing)}
                          </li>
                        ))}
                      </ul>
                      <label className="flex gap-3 items-start">
                        <input
                          type="checkbox"
                          required
                          checked={confirmClientDeficits}
                          onChange={(e) => setConfirmClientDeficits(e.target.checked)}
                        />
                        <span>
                          I verified these outstanding client balances and documented the amounts
                          owed.
                        </span>
                      </label>
                    </div>
                  )}
                  <button
                    className="btn-primary"
                    disabled={
                      l.busy ||
                      !data.canClose ||
                      !confirmed ||
                      (!!data.clientDeficits?.length && !confirmClientDeficits)
                    }
                  >
                    Close cycle
                  </button>
                </form>
              </Card>
            )}
          </>
        )
      ) : (
        !error && <Spinner label="Checking cycle…" />
      )}
    </FinanceFrame>
  );
}
