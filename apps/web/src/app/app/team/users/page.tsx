"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { KeyRound, LockKeyhole, Plus, RefreshCw, Search, Shield, UserRoundX, Users } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { Card, EmptyState, FormField, Notice, PageHeader, Spinner, StatusBadge } from "@/components/ui";
import { ApiError, type StaffUser } from "@/lib/api";

const roles = ["EMPLOYEE", "FOUNDER", "ADMIN"] as const;
type AssignableRole = (typeof roles)[number];
function makeTemporaryPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
  const random = new Uint8Array(28);
  crypto.getRandomValues(random);
  return Array.from(random, (n) => chars[n % chars.length]).join("");
}

export default function TeamAccounts() {
  const { session, request } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AssignableRole>("EMPLOYEE");

  const allowed = session?.identity.permissions.includes("users.read") ?? false;
  const canCreate = session?.identity.permissions.includes("users.create") ?? false;
  const canReset = session?.identity.permissions.includes("users.reset") ?? false;
  const canDisable = session?.identity.permissions.includes("users.update") ?? false;
  const superAdmin = session?.identity.roles.includes("SUPER_ADMIN") ?? false;
  const team = useMemo(() => users.filter((person) => [person.displayName, person.loginId, person.email ?? "", person.status, ...person.roles]
    .some((field) => field.toLowerCase().includes(search.toLowerCase()))), [users, search]);

  const reload = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    try {
      const result = await request<StaffUser[]>("/users");
      setUsers(result); setError("");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Unable to retrieve staff records.");
    } finally { setLoading(false); }
  }, [allowed, request]);

  useEffect(() => { void reload(); }, [reload]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setError(""); setSuccess(""); setBusy(true);
    try {
      await request("/users", { method: "POST", body: {
        loginId: loginId.trim(), displayName: displayName.trim(),
        ...(email.trim() ? { email: email.trim() } : {}), temporaryPassword: password, role,
      } });
      setSuccess("Account created. Login: " + loginId.trim() + ". One-time temporary password: " + password + ". Copy and share it securely; it cannot be retrieved later.");
      setLoginId(""); setDisplayName(""); setEmail(""); setRole("EMPLOYEE"); setShowForm(false);
      setPassword("");
      await reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Unable to create account.");
    } finally { setBusy(false); }
  }

  async function reset(user: StaffUser) {
    if (!canReset) return;
    if (!window.confirm("Reset password for " + user.displayName + "? Existing sessions will be revoked.")) return;
    const next = makeTemporaryPassword();
    setError(""); setSuccess(""); setBusy(true);
    try {
      await request("/users/" + user.id + "/reset-password", { method: "POST", body: { temporaryPassword: next } });
      setSuccess("Password reset for " + user.loginId + ". New temporary password: " + next + ". Share it securely. This notice disappears on navigation.");
      await reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Reset failed.");
    } finally { setBusy(false); }
  }
  async function disable(user: StaffUser) {
    if (!canDisable || !window.confirm("Disable " + user.displayName + "? This will revoke all active sessions.")) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      await request("/users/" + user.id + "/disable", { method: "POST" });
      setSuccess(user.loginId + " was disabled.");
      await reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Unable to disable user.");
    } finally { setBusy(false); }
  }
  async function changeRole(user: StaffUser, newRole: AssignableRole) {
    if (!superAdmin || !window.confirm("Change " + user.loginId + " to " + newRole + "? Existing sessions will be revoked.")) return;
    setError(""); setSuccess(""); setBusy(true);
    try {
      await request("/users/" + user.id + "/role", { method: "PUT", body: { role: newRole } });
      setSuccess("Updated role for " + user.loginId + ".");
      await reload();
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Unable to update role.");
    } finally { setBusy(false); }
  }

  if (!session) return <Spinner label="Loading access permissions…" />;
  if (!allowed) return <div className="space-y-6"><PageHeader eyebrow="Team" title="Access denied" description="Your account does not have permission to view employee records." /><Notice kind="error">Staff information is restricted to authorized administrators.</Notice></div>;

  return <div className="space-y-7">
    <PageHeader eyebrow="Team management" title="People & accounts" description="Provision internal logins, manage permissions and revoke access. All operations are validated by the API."
      actions={canCreate && <button type="button" className="btn-primary" onClick={() => {
        setShowForm((current) => !current); setPassword(makeTemporaryPassword()); setError(""); setSuccess("");
      }}><Plus className="h-4 w-4" aria-hidden="true" />{showForm ? "Close form" : "New account"}</button>} />

    {error && <Notice kind="error">{error}</Notice>}
    {success && <Notice kind="success">{success}</Notice>}

    {showForm && canCreate && <Card title="Create an employee login" description="Users must change the temporary password at first sign-in. Only a Super Admin can assign founder or admin roles.">
      <form onSubmit={create} className="grid gap-5 sm:grid-cols-2">
        <FormField id="staff-name" label="Display name"><input className="field" id="staff-name" minLength={1} maxLength={160} required value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></FormField>
        <FormField id="staff-login" label="Login ID"><input className="field" id="staff-login" minLength={3} maxLength={80} pattern="[A-Za-z0-9_.-]+" required autoCapitalize="none" value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="first.last" /></FormField>
        <FormField id="staff-email" label="Email (optional)"><input className="field" id="staff-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></FormField>
        <FormField id="staff-role" label="Role"><select className="field" id="staff-role" value={role} onChange={(e) => setRole(e.target.value as AssignableRole)}>
          {(superAdmin ? roles : ["EMPLOYEE"] as const).map((key) => <option key={key} value={key}>{key}</option>)}
        </select></FormField>
        <div className="sm:col-span-2">
          <FormField id="staff-pass" label="Temporary password" help="Generated randomly. Copy it and send using an approved secure channel. The server stores only a password hash.">
            <div className="flex gap-2"><input className="field font-mono" id="staff-pass" minLength={12} maxLength={128} type="text" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              <button type="button" className="btn-secondary shrink-0" onClick={() => setPassword(makeTemporaryPassword())} aria-label="Generate another password"><RefreshCw className="h-4 w-4" /></button></div>
          </FormField>
        </div>
        <div className="sm:col-span-2"><button className="btn-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button></div>
      </form>
    </Card>}

    <Card title="Company directory" description="Staff listed from the database. Credentials and secret fields are never returned here.">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-sm"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden="true" />
          <label htmlFor="staff-search" className="sr-only">Search staff</label>
          <input id="staff-search" className="field pl-10" placeholder="Search by name, login or role…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="button" className="btn-secondary" onClick={() => { setLoading(true); void reload(); }} disabled={loading}><RefreshCw className="h-4 w-4" />Refresh</button>
      </div>
      {loading ? <Spinner label="Loading team…" /> : !team.length ? <EmptyState icon={Users} title={search ? "No matching accounts" : "No employee records"} description={search ? "Change the search filter to see other accounts." : "Create the first employee account using the button above."} /> : <div className="overflow-x-auto">
        <table className="w-full min-w-[700px] text-left text-sm">
          <thead><tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th scope="col" className="pb-3 pr-4">Person</th><th scope="col" className="pb-3 pr-4">Role</th><th scope="col" className="pb-3 pr-4">Status</th><th scope="col" className="pb-3">Actions</th>
          </tr></thead>
          <tbody>{team.map((user) => <tr key={user.id} className="border-b border-slate-100 last:border-0">
            <td className="py-4 pr-4"><p className="font-semibold text-slate-900">{user.displayName}</p><p className="text-xs text-slate-500">{user.loginId}{user.email ? " · " + user.email : ""}</p></td>
            <td className="py-4 pr-4">{superAdmin && user.id !== session.user.id && !user.roles.includes("SUPER_ADMIN") ? <select className="field max-w-36 text-xs" aria-label={"Role for " + user.loginId} value={user.roles[0] ?? "EMPLOYEE"} disabled={busy} onChange={(e) => void changeRole(user, e.target.value as AssignableRole)}>
              {roles.map((r) => <option key={r} value={r}>{r}</option>)}
            </select> : <span className="text-slate-700">{user.roles.join(", ")}</span>}</td>
            <td className="py-4 pr-4"><StatusBadge status={user.status} /></td>
            <td className="py-4">{user.id !== session.user.id && user.status !== "DISABLED" && !user.roles.includes("SUPER_ADMIN") ? <div className="flex flex-wrap gap-2">
              {canReset && <button disabled={busy} className="btn-secondary text-xs" onClick={() => void reset(user)}><KeyRound className="h-3.5 w-3.5" aria-hidden="true" />Reset</button>}
              {canDisable && <button disabled={busy} className="btn-danger text-xs" onClick={() => void disable(user)}><UserRoundX className="h-3.5 w-3.5" aria-hidden="true" />Disable</button>}
            </div> : <span className="text-xs text-slate-400">{user.id === session.user.id ? "Your account" : "Restricted"}</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </Card>
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-600">
      <Shield className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" aria-hidden="true" />
      <p><strong className="text-slate-900">Access is server-enforced.</strong> This interface displays actions based on permissions, but the Express API independently validates every operation. Your temporary passwords are never retrievable from the database.</p>
    </div>
  </div>;
}
