"use client";

import { LockKeyhole, LogOut, Shield, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Card, Notice, PageHeader, StatusBadge } from "@/components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { session, logout } = useAuth();
  const [error, setError] = useState("");
  if (!session) return null;
  const { user, identity } = session;
  return <div className="space-y-7">
    <PageHeader eyebrow="Account settings" title="My profile" description="Identity and granted permissions are obtained from the authenticated API." />
    <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
      <Card title="Account details">
        <dl className="space-y-5 text-sm">
          <div><dt className="text-slate-500">Display name</dt><dd className="mt-1 font-semibold text-slate-900">{user.displayName}</dd></div>
          <div><dt className="text-slate-500">Login ID</dt><dd className="mt-1 font-semibold text-slate-900">{user.loginId}</dd></div>
          <div><dt className="text-slate-500">Account status</dt><dd className="mt-1"><StatusBadge status={user.status} /></dd></div>
          <div><dt className="text-slate-500">Organization identifier</dt><dd className="mt-1 break-all font-mono text-xs text-slate-700">{user.organizationId}</dd></div>
        </dl>
      </Card>
      <Card title="Permissions & security">
        <div className="flex items-center gap-3 rounded-xl bg-indigo-50 p-4">
          <Shield className="h-6 w-6 text-indigo-700" aria-hidden="true" />
          <div><p className="text-sm font-semibold text-slate-900">Current role</p><p className="text-xs text-slate-600">{identity.roles.join(", ")}</p></div>
        </div>
        <p className="mb-3 mt-5 text-sm font-semibold text-slate-900">{identity.permissions.length} active permission grants</p>
        <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 p-3">
          {identity.permissions.length ? <ul className="flex flex-wrap gap-2">{identity.permissions.map((p) => <li key={p} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700">{p}</li>)}</ul>
            : <p className="text-sm text-slate-500">No extra permissions assigned.</p>}
        </div>
      </Card>
    </div>
    <Card title="Session controls" description="You can sign out at any time; access tokens are not stored in browser localStorage.">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-slate-600"><LockKeyhole className="h-4 w-4 text-indigo-600" aria-hidden="true" />JWT access with revocable refresh session</div>
        <button type="button" className="btn-secondary ml-auto" onClick={async () => {
          setError("");
          try { await logout(); } catch { setError("Server did not confirm logout. Close other open sessions and reconnect before trusting this device."); }
          router.replace("/login");
        }}><LogOut className="h-4 w-4" aria-hidden="true" />Sign out</button>
      </div>
      {error && <div className="mt-4"><Notice kind="error">{error}</Notice></div>}
      <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><UserRound className="h-4 w-4" aria-hidden="true" />Password changes and MFA recovery for active accounts will be added before production rollout.</p>
    </Card>
  </div>;
}
