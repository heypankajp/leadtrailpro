"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import { errorMessage } from "@/lib/api";
import { defaultAutoLogoutTime, type UserAccount } from "@/features/users/model";
import { ErrorText } from "@/features/shell/components";
import { createBootstrapAdmin, login, requestPasswordReset, resetPassword, verifyTwoFactor } from "./client";

type Mode = "login" | "two-factor" | "forgot" | "reset" | "setup";

type Props = { checking: boolean; needsSetup: boolean; initialError: string; onSignedIn: (user: UserAccount) => void };

export default function AuthScreen({ checking, needsSetup, initialError, onSignedIn }: Props) {
  // A reset link lands on /?reset=<token>; read it once when the screen mounts.
  const [resetToken] = useState(() => (typeof window === "undefined" ? "" : new URLSearchParams(window.location.search).get("reset") ?? ""));
  const [mode, setMode] = useState<Mode>(resetToken ? "reset" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(initialError);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState({ key: "", firstName: "", lastName: "", email: "", phone: "", password: "", confirm: "" });
  const [showKey, setShowKey] = useState(false);

  useEffect(() => {
    if (!checking && resetToken && window.location.search.includes("reset=")) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, [checking, resetToken]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  };

  const submitLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => {
      const result = await login(email, password);
      if (result.requiresTwoFactor) { setMode("two-factor"); setMessage(`We emailed a 6-digit code to ${result.email}. It expires in 10 minutes.`); return; }
      if (result.user) { setPassword(""); onSignedIn(result.user); }
    });
  };

  const submitCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => { const result = await verifyTwoFactor(code); setPassword(""); setCode(""); onSignedIn(result.user); });
  };

  const submitForgot = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void run(async () => { const result = await requestPasswordReset(email); setMessage(result.message); });
  };

  const submitReset = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== confirm) { setError("Passwords do not match."); return; }
    void run(async () => { await resetPassword(resetToken, password); setPassword(""); setConfirm(""); setMode("login"); setMessage("Your password is set. Sign in with it now."); });
  };

  const submitSetup = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (setup.password !== setup.confirm) { setError("Passwords do not match."); return; }
    void run(async () => {
      await createBootstrapAdmin({
        firstName: setup.firstName, lastName: setup.lastName, email: setup.email, phone: setup.phone, password: setup.password, role: "admin", stage: "full_productive",
        extraPrivileges: [], twoFactorEnabled: false, autoLogoutEnabled: false, autoLogoutTime: defaultAutoLogoutTime, targetTemplateId: null,
      }, setup.key);
      const result = await login(setup.email, setup.password);
      if (result.user) onSignedIn(result.user);
      else { setMode("login"); setMessage("Administrator account created. Sign in to continue."); }
    });
  };

  const back = () => { setMode("login"); setError(""); setMessage(""); };

  return (
    <main className="login-shell">
      <section className={`login-card ${mode === "setup" ? "login-card-wide" : ""}`}>
        <div className="login-brand"><span className="brand-mark"><span /><span /><span /></span><span className="brand-name">salestrack<span>pro</span></span></div>
        <span className="eyebrow">SALES WORKSPACE</span>
        {checking ? (
          <>
            <h1>Checking your session</h1>
            <p>Connecting securely to your SalesTrackPro workspace.</p>
            <div className="login-loading">Verifying session...</div>
          </>
        ) : mode === "login" ? (
          <>
            <h1>Welcome back</h1>
            <p>Sign in to access your leads and team workspace.</p>
            <form className="login-form" onSubmit={submitLogin}>
              <label>Email address<input name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoFocus /></label>
              <label>Password<input name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required maxLength={200} /></label>
              {message && <p className="login-message" role="status">{message}</p>}
              <ErrorText message={error} />
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
            </form>
            <div className="login-links">
              <button className="login-bootstrap-link" onClick={() => { setMode("forgot"); setError(""); setMessage(""); }}>Forgot your password?</button>
              {needsSetup && <button className="login-bootstrap-link" onClick={() => { setMode("setup"); setError(""); setMessage(""); }}>First time setup? Create the initial administrator account</button>}
            </div>
          </>
        ) : mode === "two-factor" ? (
          <>
            <h1>Enter your sign-in code</h1>
            <p>{message || "Check your email for a 6-digit code."}</p>
            <form className="login-form" onSubmit={submitCode}>
              <label>6-digit code<input className="code-input" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label>
              <ErrorText message={error} />
              <button className="button button-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? "Verifying..." : "Verify and sign in"}</button>
            </form>
            <div className="login-links"><button className="login-bootstrap-link" onClick={back}><ArrowLeft size={13} /> Back to sign in (sends a new code)</button></div>
          </>
        ) : mode === "forgot" ? (
          <>
            <h1>Reset your password</h1>
            <p>Enter the email you sign in with. If it belongs to an active account, we will email a reset link.</p>
            <form className="login-form" onSubmit={submitForgot}>
              <label>Email address<input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoFocus /></label>
              {message && <p className="login-message" role="status">{message}</p>}
              <ErrorText message={error} />
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Sending..." : "Send reset link"}</button>
            </form>
            <div className="login-links"><button className="login-bootstrap-link" onClick={back}><ArrowLeft size={13} /> Back to sign in</button></div>
          </>
        ) : mode === "reset" ? (
          <>
            <h1>Choose a new password</h1>
            <p>At least 12 characters. Your other sessions will be signed out.</p>
            <form className="login-form" onSubmit={submitReset}>
              <label>New password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label>
              <label>Confirm password<input type="password" autoComplete="new-password" minLength={12} maxLength={200} value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>
              <ErrorText message={error} />
              <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Set password"}</button>
            </form>
            <div className="login-links"><button className="login-bootstrap-link" onClick={back}><ArrowLeft size={13} /> Back to sign in</button></div>
          </>
        ) : (
          <>
            <h1>Create the first administrator</h1>
            <p>Use the USER_MANAGEMENT_KEY from .env.local. This option disappears once the first account exists.</p>
            <form className="user-create-form" onSubmit={submitSetup}>
              <div className="user-form-grid">
                <label className="user-form-wide">User-management key
                  <span className="user-key-input-wrap">
                    <input type={showKey ? "text" : "password"} autoComplete="off" value={setup.key} onChange={(event) => setSetup({ ...setup, key: event.target.value })} required autoFocus />
                    <button className="user-key-visibility" type="button" aria-label={showKey ? "Hide key" : "Show key"} aria-pressed={showKey} onClick={() => setShowKey((visible) => !visible)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
                  </span>
                </label>
                <label>First name<input value={setup.firstName} onChange={(event) => setSetup({ ...setup, firstName: event.target.value })} autoComplete="given-name" required maxLength={80} /></label>
                <label>Last name<input value={setup.lastName} onChange={(event) => setSetup({ ...setup, lastName: event.target.value })} autoComplete="family-name" required maxLength={80} /></label>
                <label>Email<input type="email" value={setup.email} onChange={(event) => setSetup({ ...setup, email: event.target.value })} autoComplete="email" required maxLength={254} /></label>
                <label>Phone<input type="tel" value={setup.phone} onChange={(event) => setSetup({ ...setup, phone: event.target.value })} autoComplete="tel" maxLength={40} /></label>
                <label>Password<input type="password" value={setup.password} onChange={(event) => setSetup({ ...setup, password: event.target.value })} autoComplete="new-password" minLength={12} maxLength={200} required /><small>Minimum 12 characters.</small></label>
                <label>Confirm password<input type="password" value={setup.confirm} onChange={(event) => setSetup({ ...setup, confirm: event.target.value })} autoComplete="new-password" minLength={12} maxLength={200} required /></label>
              </div>
              <ErrorText message={error} />
              <div className="user-dialog-actions"><button className="button button-outline" type="button" onClick={back}>Back</button><button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating..." : "Create administrator"}</button></div>
            </form>
          </>
        )}
      </section>
    </main>
  );
}
