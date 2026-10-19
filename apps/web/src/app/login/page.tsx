"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { FormField, Notice, Spinner } from "@/components/ui";
import { ApiError, apiRequest, type LoginResult, type SessionPayload } from "@/lib/api";

type Step = "credentials" | "change" | "enroll" | "verify";

export default function LoginPage() {
  const router = useRouter();
  const { status, completeLogin } = useAuth();
  const [step, setStep] = useState<Step>("credentials");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [mfaSecret, setMfaSecret] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (status === "authenticated") router.replace("/app/dashboard");
  }, [router, status]);

  async function finish(payload: SessionPayload) {
    await completeLogin(payload);
    router.replace("/app/dashboard");
  }

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await apiRequest<LoginResult>("/auth/login", {
        method: "POST", body: { loginId, password },
      });
      if (result.next === "SIGNED_IN") {
        setPassword("");
        await finish(result);
      } else {
        setChallenge(result.challengeToken);
        setStep(result.next === "CHANGE_PASSWORD" ? "change" : result.next === "ENROLL_MFA" ? "enroll" : "verify");
      }
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Unable to connect to the authentication service.");
    } finally { setBusy(false); }
  }

  async function submitChange(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await apiRequest("/auth/change-password", { method: "POST", body: {
        challengeToken: challenge, oldPassword: password, newPassword,
      } });
      setPassword(""); setNewPassword(""); setChallenge("");
      setStep("credentials");
      setNotice("Password changed. Sign in using your new password.");
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Password update failed.");
    } finally { setBusy(false); }
  }

  async function setupMfa() {
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ secret: string; otpauthUrl: string }>("/auth/mfa/setup", {
        method: "POST", body: { challengeToken: challenge },
      });
      setMfaSecret(result.secret);
      // otpauth URI is issued by backend and can be entered into any TOTP authenticator.
      // Keep this secret in memory only; do not log it or persist it.
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "MFA setup is unavailable.");
    } finally { setBusy(false); }
  }

  async function submitMfa(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const url = step === "enroll" ? "/auth/mfa/confirm" : "/auth/mfa/verify";
      const result = await apiRequest<SessionPayload>(url, { method: "POST", body: {
        challengeToken: challenge, code: otp,
      } });
      setOtp(""); setMfaSecret(""); setPassword(""); setChallenge("");
      await finish(result);
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : "Verification failed.");
    } finally { setBusy(false); }
  }

  if (status === "loading" || status === "authenticated") return <Spinner label="Checking your session…" />;

  return <main className="min-h-screen bg-slate-50 lg:grid lg:grid-cols-2">
    <section className="hidden min-h-screen flex-col justify-between overflow-hidden bg-[#101a35] p-12 text-white lg:flex">
      <div className="flex items-center gap-3 text-lg font-bold tracking-tight">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-500"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>
        DigiMarket
      </div>
      <div className="max-w-md">
        <span className="inline-flex rounded-full border border-indigo-300/30 bg-indigo-300/10 px-3 py-1 text-xs font-semibold text-indigo-100">PRIVATE AGENCY WORKSPACE</span>
        <h1 className="mt-7 text-5xl font-bold leading-tight tracking-tight">The work behind your next big idea.</h1>
        <p className="mt-6 text-lg leading-8 text-slate-300">Projects, clients, teams and your agency operations, organized in one secure place.</p>
        <div className="mt-11 grid gap-4">
          {[
            ["Private by design", "Only provisioned team members can sign in."],
            ["Permission-aware access", "Roles and data scope are checked by the server."],
            ["Two-factor security", "Administrators and founders use an authenticator."],
          ].map(([title, copy]) => <div key={title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4">
            <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-indigo-200" aria-hidden="true" />
            <div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-slate-300">{copy}</p></div>
          </div>)}
        </div>
      </div>
      <p className="text-sm text-slate-400">DigiMarket · Internal use only</p>
    </section>
    <section className="flex min-h-screen items-center justify-center px-6 py-12 sm:px-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2 text-lg font-bold text-slate-900 lg:hidden">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white"><UsersRound className="h-5 w-5" aria-hidden="true" /></span>DigiMarket
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-9">
          <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
            {step === "credentials" ? <LockKeyhole aria-hidden="true" /> : step === "change" ? <KeyRound aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {step === "credentials" ? "Sign in to your workspace" : step === "change" ? "Set your new password" : step === "enroll" ? "Enable two-factor security" : "Verify your sign-in"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {step === "credentials" ? "Use the login ID and password issued by your administrator." : step === "change" ? "Your temporary password must be replaced before account access." : step === "enroll" ? "Set up a time-based authenticator to protect this privileged account." : "Enter the six-digit code from your authenticator."}
          </p>
          <div className="mt-6 space-y-3">
            {error && <Notice kind="error">{error}</Notice>}
            {notice && <Notice kind="success">{notice}</Notice>}
          </div>
          {step === "credentials" && <form onSubmit={submitCredentials} className="mt-6 space-y-5">
            <FormField id="login-id" label="Login ID">
              <input id="login-id" className="field" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={80} value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="your-login-id" />
            </FormField>
            <FormField id="password" label="Password">
              <input id="password" className="field" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            </FormField>
            <button className="btn-primary w-full" disabled={busy} type="submit">{busy ? "Signing in…" : "Sign in"} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          </form>}
          {step === "change" && <form onSubmit={submitChange} className="mt-6 space-y-5">
            <FormField id="new-password" label="New password" help="Minimum 12 characters. Use a unique password.">
              <input className="field" id="new-password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            </FormField>
            <button className="btn-primary w-full" type="submit" disabled={busy}>{busy ? "Updating…" : "Change password"}</button>
          </form>}
          {step === "enroll" && !mfaSecret && <div className="mt-6">
            <button type="button" className="btn-primary w-full" onClick={setupMfa} disabled={busy}>{busy ? "Preparing…" : "Generate authenticator setup"}</button>
          </div>}
          {(step === "verify" || (step === "enroll" && mfaSecret)) && <form onSubmit={submitMfa} className="mt-6 space-y-5">
            {step === "enroll" && <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
              <p className="text-sm font-semibold text-indigo-900">Add a time-based account to your authenticator.</p>
              <p className="mt-2 text-xs leading-5 text-indigo-800">Enter this setup key manually. It is shown only during enrollment, so keep it private.</p>
              <code data-testid="mfa-secret" className="mt-3 block break-all rounded-lg bg-white p-3 font-mono text-sm tracking-widest text-slate-900">{mfaSecret}</code>
            </div>}
            <FormField id="otp" label="Six-digit authenticator code">
              <input id="otp" className="field" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" required value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" />
            </FormField>
            <button className="btn-primary w-full" type="submit" disabled={busy}>{busy ? "Verifying…" : step === "enroll" ? "Enable MFA and sign in" : "Verify and sign in"}</button>
          </form>}
          {step !== "credentials" && <button type="button" onClick={() => { setStep("credentials"); setChallenge(""); setOtp(""); setMfaSecret(""); setError(""); }} className="mt-5 text-sm font-medium text-slate-500 hover:text-indigo-700">Start over</button>}
        </div>
        <p className="mt-6 text-center text-xs text-slate-400">No public registration. Contact your administrator for access.</p>
      </div>
    </section>
  </main>;
}
