"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Card, Notice, PageHeader, Spinner } from "@/components/ui";

type Grant = {
  id: string; userId: string; scopes: string[]; createdAt: string; lastUsedAt: string | null;
  accessExpiresAt: string; refreshExpiresAt: string; revokedAt: string | null;
};
const errorText = (e: unknown) => e instanceof ApiError || e instanceof Error ?
  e.message : "Integration request failed";

export default function ChatGptIntegrationPage() {
  const { session, request } = useAuth();
  const roles = session?.identity.roles ?? [];
  const authorized = roles.some(r => ["FOUNDER", "ADMIN", "SUPER_ADMIN"].includes(r));
  const [data, setData] = useState<Grant[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!authorized) { setLoading(false); return; }
    try {
      const response = await request<{ enabled: boolean; connections: Grant[] }>(
        "/integrations/chatgpt/connections");
      setData(response.connections); setError("");
    } catch (e) { setError(errorText(e)); }
    finally { setLoading(false); }
  }, [authorized, request]);
  useEffect(() => { void reload(); }, [reload]);
  async function revoke(id: string) {
    if (!window.confirm("Revoke this ChatGPT connection immediately?")) return;
    setBusy(id);
    try {
      await request("/integrations/chatgpt/connections/" + id + "/revoke", { method: "POST" });
      await reload();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(""); }
  }
  return <div className="space-y-6">
    <PageHeader eyebrow="Settings / Integrations" title="ChatGPT CRM"
      description="Review per-founder access, permissions, last use and connection revocation." />
    {!authorized && <Notice kind="error">This page is restricted to founders and administrators.</Notice>}
    {authorized && <>
      {error && <Notice kind="error">{error}</Notice>}
      <Card title="Private CRM integration" description="The integration is installed separately in ChatGPT. Connections use OAuth, not shared administrator passwords.">
        <div className="space-y-2 text-sm text-slate-700">
          <p>Scope: leads, follow-ups, meetings, clients and CRM analytics.</p>
          <p>Advertiser spend and paid-ad attribution are not available from CRM data. Meta reporting remains separate.</p>
          <p>Connection requires an active founder account. Administrator accounts can revoke grants, but cannot use CRM tools.</p>
        </div>
        <p className="mt-4"><Link href="/app/settings" className="text-sm text-purple-700 underline">Company settings</Link></p>
      </Card>
      {loading ? <Spinner label="Checking integration connections..." /> :
        <Card title="Authorized connections">
          {!data.length && <p className="text-sm text-slate-600">No connections have been created.</p>}
          <div className="space-y-3">
            {data.map(g => <div key={g.id} className="rounded-xl border border-purple-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="font-semibold">{g.revokedAt ? "Revoked" : g.refreshExpiresAt < new Date().toISOString() ? "Expired" : "Authorized"} · {g.id.slice(0, 8)}</span>
                {!g.revokedAt && <button type="button" className="btn-secondary" disabled={busy === g.id}
                  onClick={() => void revoke(g.id)}>{busy === g.id ? "Revoking..." : "Revoke"}</button>}
              </div>
              <p className="mt-2 text-slate-600">User: {g.userId}</p>
              <p className="mt-1 text-slate-600">Created: {new Date(g.createdAt).toLocaleString()}</p>
              <p className="mt-1 text-slate-600">Last access: {g.lastUsedAt ? new Date(g.lastUsedAt).toLocaleString() : "Never"}</p>
              <p className="mt-1 break-words text-slate-600">Permissions: {g.scopes.join(", ")}</p>
            </div>)}
          </div>
        </Card>}
    </>}
  </div>;
}
