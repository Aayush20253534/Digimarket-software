"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import { Card, Notice, PageHeader, Spinner } from "@/components/ui";

const paramNames = ["client_id", "redirect_uri", "response_type", "code_challenge",
  "code_challenge_method", "scope", "state"];
const errorText = (e: unknown) => e instanceof ApiError || e instanceof Error ?
  e.message : "Could not authorize the connection";

export default function ApproveChatGptPage() {
  const { session, request, status } = useAuth();
  const [params, setParams] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const result: Record<string, string> = {};
    for (const key of paramNames) {
      const value = query.get(key);
      if (value !== null) result[key] = value;
    }
    setParams(result);
  }, []);
  const scopes = params?.scope?.split(" ").filter(Boolean) ?? [];
  const founder = session?.identity.roles.includes("FOUNDER") ?? false;
  const valid = Boolean(params?.client_id && params?.redirect_uri && params?.code_challenge &&
    params?.code_challenge_method === "S256" && params?.response_type === "code");
  async function approve() {
    if (!params || !valid || !founder) return;
    setBusy(true); setError("");
    try {
      const outcome = await request<{ redirectUrl: string }>(
        "/integrations/chatgpt/oauth/approve", { method: "POST", body: params });
      window.location.assign(outcome.redirectUrl);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  }
  return <div className="mx-auto max-w-2xl space-y-6">
    <PageHeader eyebrow="Private integration" title="Authorize ChatGPT CRM access"
      description="Review each permission before connecting this account." />
    {status === "loading" && <Spinner label="Checking your login..." />}
    {status !== "loading" && !session && <Notice kind="error">
      Sign in to AmplifyWorld in another tab, then return to this authorization page.
      <Link href="/login" target="_blank" className="ml-2 underline">Open login</Link>
    </Notice>}
    {session && !founder && <Notice kind="error">Only active founder accounts may connect to ChatGPT.</Notice>}
    {!valid && params && <Notice kind="error">Invalid or incomplete authorization request.</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    <Card title="Requested permission scopes">
      <div className="space-y-2 text-sm">
        {scopes.map(scope => <div key={scope} className="rounded-md border border-purple-200 p-2">{scope}</div>)}
        {!scopes.length && <p>No scopes requested.</p>}
      </div>
      <p className="mt-4 text-sm text-slate-600">
        ChatGPT receives a revocable, scoped token. It does not receive your CRM password,
        browser session, database credentials or unrestricted database access.
        Approving client conversion and other CRM writes requires separate action confirmation.
      </p>
      <button className="btn-primary mt-4" type="button" disabled={!founder || !valid || busy}
        onClick={() => void approve()}>{busy ? "Authorizing..." : "Authorize requested access"}</button>
    </Card>
  </div>;
}
