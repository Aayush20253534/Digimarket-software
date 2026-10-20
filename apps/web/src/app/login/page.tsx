"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Eye, EyeOff, Fingerprint, KeyRound, LockKeyhole, ShieldCheck, Sparkles, CheckCircle2 } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { AWButton, AWFormField, AWInput, AWNotice } from "@/components/aw-ui";
import { BrandLogo } from "@/components/brand-logo";
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
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

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

  if (status === "loading" || status === "authenticated") {
    return <main className="aw-theme flex min-h-screen items-center justify-center bg-[#09070E]">
      <div role="status" className="flex items-center gap-3 text-sm text-[#CFBFDF]">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#49345D] border-t-[#CA6BFF]" aria-hidden="true" />
        Checking your session…
      </div>
    </main>;
  }

  const stepTitle = step === "credentials" ? "Sign in to your workspace"
    : step === "change" ? "Set your new password"
    : step === "enroll" ? "Enable two-factor security"
    : "Verify your sign-in";
  const stepDescription = step === "credentials" ? "Use the login ID and password issued by your administrator."
    : step === "change" ? "Replace your temporary password before accessing the workspace."
    : step === "enroll" ? "Connect a time-based authenticator to protect your privileged account."
    : "Enter the six-digit code from your authenticator application.";

  return <main className="aw-theme min-h-[100svh] overflow-x-clip bg-[#09070E] lg:grid lg:grid-cols-[.97fr_1.03fr]">
    <a href="#auth-form-heading" className="aw-skip-link">Skip to sign in</a>
    <aside className="aw-auth-side hidden min-h-[100svh] flex-col justify-between border-r border-[#39234C] p-9 text-[#F7F1FF] lg:flex xl:p-14">
      <Link href="/" aria-label="Back to AmplifyWorld homepage" className="relative z-[2] self-start">
        <BrandLogo tagline workspace />
      </Link>
      <div className="relative z-[2] my-16 max-w-[520px]">
        <span className="aw-auth-secure-chip"><Sparkles size={14} aria-hidden="true"/> THE WORKSPACE FOR EVERY GROWTH MOVE</span>
        <h1 className="mt-7 text-[clamp(2.7rem,4vw,4.7rem)] font-extrabold leading-[1.08] tracking-[-.055em]">
          Big ambitions.<br/><span className="aw-gradient-text">Better operations.</span>
        </h1>
        <p className="mt-6 max-w-[480px] text-base leading-8 text-[#C0B1D2]">
          A connected home for the people, projects and decisions that move your agency forward.
        </p>
        <div className="mt-10 grid gap-3">
          {[
            ["Everything in sync", "Clients, campaigns, finance and delivery in one workspace."],
            ["Purpose-built security", "Role checks, private accounts and administrator-managed access."],
            ["Designed for focus", "Less busywork, clearer ownership and room to grow."],
          ].map(([title, description])=><div key={title} className="flex gap-4 rounded-2xl border border-[#49305D] bg-[#211430]/80 p-4">
            <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#734D91] bg-[#39204E] text-[#E2A1FF]">
              <CheckCircle2 size={18} aria-hidden="true" />
            </div>
            <div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-6 text-[#B8A8C8]">{description}</p></div>
          </div>)}
        </div>
      </div>
      <div className="relative z-[2] flex items-center gap-2 text-xs text-[#A79ABB]">
        <ShieldCheck size={15} aria-hidden="true" />
        Private agency software · Authorized team members only
      </div>
    </aside>

    <section className="relative flex min-h-[100svh] flex-col items-center justify-center px-4 py-8 sm:px-8 lg:px-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_45%_45%_at_90%_5%,rgba(164,41,222,.13),transparent)]" aria-hidden="true"/>
      <div className="relative z-[1] w-full max-w-[470px]">
        <div className="mb-7 flex items-center justify-between gap-3 lg:hidden">
          <Link href="/" className="min-w-0" aria-label="AmplifyWorld Workspace homepage"><BrandLogo compact workspace/></Link>
          <Link href="/" className="inline-flex shrink-0 items-center gap-1 text-xs text-[#DAB0F9]"><ArrowLeft size={15} aria-hidden="true"/> Home</Link>
        </div>
        <div className="aw-auth-form-panel">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div className="aw-auth-icon">
              {step === "credentials" ? <LockKeyhole size={23} aria-hidden="true" />
                : step === "change" ? <KeyRound size={23} aria-hidden="true" />
                : <Fingerprint size={23} aria-hidden="true" />}
            </div>
            <span className="aw-auth-secure-chip"><ShieldCheck size={14} aria-hidden="true"/> Secure access</span>
          </div>
          <p className="aw-eyebrow mb-3">AMPLIFYWORLD WORKSPACE</p>
          <h2 id="auth-form-heading" className="aw-auth-heading" tabIndex={-1}>{stepTitle}</h2>
          <p className="aw-auth-message mt-3">{stepDescription}</p>

          <div className="mt-5 space-y-3" aria-live="polite">
            {error && <AWNotice tone="error">{error}</AWNotice>}
            {notice && <AWNotice tone="success">{notice}</AWNotice>}
          </div>

          {step === "credentials" && <form onSubmit={submitCredentials} className="mt-7 space-y-5">
            <AWFormField id="login-id" label="Login ID">
              <AWInput id="login-id" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                required minLength={3} maxLength={80} value={loginId} onChange={(event) => setLoginId(event.target.value)} placeholder="your-login-id" />
            </AWFormField>
            <AWFormField id="password" label="Password">
              <div className="relative">
                <AWInput id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required
                  className="pr-12" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/>
                <button type="button" className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-lg text-[#BCACCD] hover:bg-[#312040]"
                  aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword}
                  onClick={() => setShowPassword((value) => !value)}>
                  {showPassword ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}
                </button>
              </div>
            </AWFormField>
            <AWButton type="submit" className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}<ArrowRight size={17} aria-hidden="true"/></AWButton>
          </form>}

          {step === "change" && <form onSubmit={submitChange} className="mt-7 space-y-5">
            <AWNotice tone="info">You&apos;re using a temporary password. Choose a new one to continue.</AWNotice>
            <AWFormField id="new-password" label="New password" help="At least 12 characters. Use a password you do not use elsewhere.">
              <div className="relative">
                <AWInput id="new-password" type={showNewPassword ? "text" : "password"} autoComplete="new-password" required
                  className="pr-12" minLength={12} maxLength={128} value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)} />
                <button type="button" className="absolute inset-y-1 right-1 grid w-10 place-items-center rounded-lg text-[#BCACCD] hover:bg-[#312040]"
                  aria-label={showNewPassword ? "Conceal replacement credential" : "Reveal replacement credential"} aria-pressed={showNewPassword}
                  onClick={() => setShowNewPassword((value) => !value)}>
                  {showNewPassword ? <EyeOff size={18} aria-hidden="true"/> : <Eye size={18} aria-hidden="true"/>}
                </button>
              </div>
            </AWFormField>
            <AWButton type="submit" className="w-full" disabled={busy}>{busy ? "Updating…" : "Change password"}<ArrowRight size={17} aria-hidden="true"/></AWButton>
          </form>}

          {step === "enroll" && !mfaSecret && <div className="mt-7 space-y-5">
            <AWNotice tone="info">Keep your authenticator app available. Setup will provide a one-time secret key.</AWNotice>
            <AWButton type="button" className="w-full" onClick={setupMfa} disabled={busy}>{busy ? "Preparing…" : "Generate authenticator setup"}<ArrowRight size={17} aria-hidden="true"/></AWButton>
          </div>}

          {(step === "verify" || (step === "enroll" && mfaSecret)) && <form onSubmit={submitMfa} className="mt-7 space-y-5">
            {step === "enroll" && <div className="rounded-xl border border-[#68457D] bg-[#251633] p-4">
              <p className="text-sm font-semibold text-[#F6E6FF]">Add a time-based account to your authenticator.</p>
              <p className="mt-2 text-xs leading-6 text-[#CBB8DA]">Enter the setup key manually. It is displayed only during enrollment, so keep it private.</p>
              <code data-testid="mfa-secret" className="aw-auth-mfa-key mt-3">{mfaSecret}</code>
            </div>}
            <AWFormField id="otp" label="Six-digit authenticator code">
              <AWInput id="otp" type="text" inputMode="numeric" autoComplete="one-time-code"
                minLength={6} maxLength={6} pattern="[0-9]{6}" required
                value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000" className="text-center font-mono text-lg tracking-[.35em]"/>
            </AWFormField>
            <AWButton type="submit" className="w-full" disabled={busy}>
              {busy ? "Verifying…" : step === "enroll" ? "Enable MFA and sign in" : "Verify and sign in"}
              <ArrowRight size={17} aria-hidden="true"/>
            </AWButton>
          </form>}

          {step !== "credentials" && <button type="button"
            onClick={() => { setStep("credentials"); setChallenge(""); setOtp(""); setMfaSecret(""); setError(""); }}
            className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#CE9DEF] hover:text-white">
            <ArrowLeft size={16} aria-hidden="true"/> Start over
          </button>}
          <div className="mt-7 border-t border-[#392747] pt-5">
            <p className="flex items-start gap-2 text-xs leading-6 text-[#A99BB9]">
              <LockKeyhole size={15} className="mt-1 shrink-0" aria-hidden="true"/>
              No public registration. Contact your administrator for access.
            </p>
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[#9182A5]">AmplifyWorld Workspace · Private by design</p>
      </div>
    </section>
  </main>;
}
