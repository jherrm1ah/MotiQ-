// Welcome, sign in and create account. A fixed light palette on purpose: this is the brand
// moment before you're inside the app (the Appearance setting applies once signed in).
import React, { useState } from "react";
import { Play, ChevronsRight, ArrowLeft, Eye, EyeOff, Mail, Check, Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { ACCENT, Logo } from "../design.jsx";

const AUTH = { bg: "#E0E0E0", card: "#FFFFFF", field: "#F5F5F5", border: "#E0E0E0", text: "#212121", sub: "#616161", fill: "#212121", fillText: "#FFFFFF", bad: "#C62828" };
const redirectTo = () => (window.location.protocol.startsWith("http") ? window.location.origin : undefined);

export function HeroScreen({ onStart }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden" style={{ backgroundColor: "#212121", paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center gap-2 px-6 pt-8">
        <Logo size={26} />
        <span className="font-semibold uppercase text-white" style={{ letterSpacing: "0.15em", fontSize: 11 }}>Motiq AI</span>
      </div>
      <div className="flex-1 px-6 pt-16">
        <h1 className="font-bold text-white" style={{ lineHeight: 1.08, fontSize: 38 }}>Diagnose issues<br />before they<br />become repairs</h1>
        <p className="mt-5 max-w-[300px] text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.6)" }}>
          Track your car's health, read fault codes with an OBD-II adapter, ask an AI mechanic, and find help nearby.
        </p>
      </div>
      <div className="flex flex-col items-center gap-5 px-6" style={{ paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))" }}>
        <button type="button" onClick={onStart} className="flex w-full items-center gap-3 rounded-full py-2.5 pl-2.5 pr-5 active:scale-95 transition-transform" style={{ backgroundColor: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white"><Play size={13} style={{ color: "#000" }} fill="#000" /></div>
          <span className="flex-1 text-left text-sm font-semibold text-white">Start</span>
          <ChevronsRight size={16} style={{ color: "rgba(255,255,255,0.6)" }} />
        </button>
      </div>
    </div>
  );
}

function AuthField({ id, label, ...props }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium" style={{ color: AUTH.text }}>{label}</label>
      <input id={id} className="h-11 w-full rounded-xl px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-black" style={{ backgroundColor: AUTH.field, border: `1px solid ${AUTH.border}`, color: AUTH.text }} {...props} />
    </div>
  );
}

function AuthPasswordField({ id, label, value, onChange, autoComplete }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-xs font-medium" style={{ color: AUTH.text }}>{label}</label>
      <div className="relative">
        <input id={id} type={visible ? "text" : "password"} value={value} onChange={onChange} autoComplete={autoComplete} placeholder="••••••••" className="h-11 w-full rounded-xl px-3.5 pr-11 text-sm focus:outline-none focus:ring-2 focus:ring-black" style={{ backgroundColor: AUTH.field, border: `1px solid ${AUTH.border}`, color: AUTH.text }} />
        <button type="button" onClick={() => setVisible((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label={visible ? "Hide password" : "Show password"}>
          {visible ? <EyeOff size={16} style={{ color: AUTH.sub }} /> : <Eye size={16} style={{ color: AUTH.sub }} />}
        </button>
      </div>
    </div>
  );
}

function AuthCheckbox({ checked, onChange, children }) {
  return (
    <button type="button" onClick={onChange} aria-pressed={checked} className="flex items-start gap-2 text-left">
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center" style={checked ? { borderRadius: 5, backgroundColor: AUTH.fill } : { borderRadius: 5, border: `1.5px solid ${AUTH.sub}` }}>
        {checked && <Check size={11} style={{ color: AUTH.fillText }} strokeWidth={3} />}
      </span>
      <span className="text-xs leading-relaxed" style={{ color: AUTH.sub }}>{children}</span>
    </button>
  );
}

// "Email me a sign-in link": no password needed.
function EmailLinkRow({ email, onToast }) {
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { onToast("Type your email above first"); return; }
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
    setBusy(false);
    onToast(error ? error.message : "Check your email for a sign-in link");
  };
  return (
    <div>
      <p className="mb-3 text-center text-xs" style={{ color: AUTH.sub }}>Or continue with</p>
      <div className="flex justify-center">
        <button type="button" onClick={send} disabled={busy} className="flex items-center gap-2 rounded-full px-5 py-3 text-xs font-semibold active:scale-95 transition-transform disabled:opacity-60" style={{ backgroundColor: AUTH.field, border: `1px solid ${AUTH.border}`, color: AUTH.text }}>
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />} Email me a sign-in link
        </button>
      </div>
    </div>
  );
}

const Brand = ({ size = 18 }) => (
  <div className="flex items-center gap-1.5">
    <Logo size={size + 8} />
    <span className="font-bold" style={{ color: AUTH.text, fontSize: size }}>Motiq <span style={{ backgroundColor: ACCENT, padding: "0 5px", borderRadius: 5 }}>AI</span></span>
  </div>
);

export function LoginScreen({ onCreateAccount, onToast }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const login = async (e) => {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    setBusy(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (err) setError(/invalid/i.test(err.message) ? "That email and password don't match." : /confirm/i.test(err.message) ? "Confirm your email first: open the link we sent you." : err.message);
  };
  const forgot = async () => {
    if (!/\S+@\S+\.\S+/.test(email)) { setError("Type your email, then tap Forgot password."); return; }
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirectTo() });
    onToast(err ? err.message : "Password reset link sent to your email");
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: AUTH.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex flex-col items-center gap-1 px-6 pt-10"><Brand /></div>
      <form onSubmit={login} className="no-scrollbar mt-6 flex-1 overflow-y-auto px-6 pb-8 pt-7" style={{ borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: AUTH.card, boxShadow: "0 -8px 24px -12px rgba(0,0,0,0.08)" }}>
        <h1 className="text-center text-xl font-bold leading-snug" style={{ color: AUTH.text }}>Welcome back —<br />sign in to your garage</h1>
        <div className="mt-6 flex flex-col gap-4">
          <AuthField id="login-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          <AuthPasswordField id="login-password" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-end">
            <button type="button" onClick={forgot} className="rounded text-xs font-medium focus:outline-none focus:ring-2 focus:ring-black" style={{ color: AUTH.text }}>Forgot password?</button>
          </div>
          {error && <p role="alert" className="text-xs font-medium" style={{ color: AUTH.bad }}>{error}</p>}
          <button type="submit" disabled={busy} className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60" style={{ backgroundColor: AUTH.fill, color: AUTH.fillText }}>
            {busy && <Loader2 size={15} className="animate-spin" />} Login
          </button>
        </div>
        <div className="mt-7"><EmailLinkRow email={email} onToast={onToast} /></div>
        <p className="mt-7 text-center text-xs" style={{ color: AUTH.sub }}>
          Don't have an account?{" "}
          <button type="button" onClick={onCreateAccount} className="rounded font-semibold focus:outline-none focus:ring-2 focus:ring-black" style={{ color: AUTH.text }}>Create one</button>
        </p>
      </form>
    </div>
  );
}

export function SignupScreen({ onBack, onToast }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) return setError("Add your name.");
    if (!/\S+@\S+\.\S+/.test(email)) return setError("Enter a valid email.");
    if (password.length < 8) return setError("Use at least 8 characters for your password.");
    if (!agreed) return setError("Tick the box to agree to the terms.");
    setBusy(true);
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() }, emailRedirectTo: redirectTo() } });
    setBusy(false);
    if (err) return setError(/registered|exists/i.test(err.message) ? "There's already an account with that email. Sign in instead." : err.message);
    if (!data.session) setSent(true);
    else onToast("Account created — welcome to Motiq");
  };

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: AUTH.bg, paddingTop: "env(safe-area-inset-top, 0px)" }}>
      <div className="flex items-center gap-3 px-6 pt-8">
        <button onClick={onBack} type="button" aria-label="Back" className="flex h-9 w-9 items-center justify-center rounded-full active:scale-90 transition-transform" style={{ backgroundColor: AUTH.field }}>
          <ArrowLeft size={15} style={{ color: AUTH.text }} />
        </button>
        <Brand size={16} />
      </div>
      <div className="no-scrollbar mt-5 flex-1 overflow-y-auto px-6 pb-8">
        {sent ? (
          <div className="p-6 text-center" style={{ borderRadius: 28, backgroundColor: AUTH.card, border: `1px solid ${AUTH.border}` }}>
            <Mail size={26} style={{ color: AUTH.text, margin: "0 auto" }} />
            <h1 className="mt-3 text-xl font-bold" style={{ color: AUTH.text }}>Check your email</h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: AUTH.sub }}>We sent a link to <b>{email.trim()}</b>. Open it to confirm your account, then sign in.</p>
            <button type="button" onClick={onBack} className="mt-5 w-full rounded-2xl py-3.5 text-sm font-semibold" style={{ backgroundColor: AUTH.fill, color: AUTH.fillText }}>Back to sign in</button>
          </div>
        ) : (
          <form onSubmit={create} className="p-6" style={{ borderRadius: 28, backgroundColor: AUTH.card, border: `1px solid ${AUTH.border}` }}>
            <h1 className="text-xl font-bold" style={{ color: AUTH.text }}>Create an account</h1>
            <p className="mt-1 text-xs" style={{ color: AUTH.sub }}>Every car you add gets its own health record from day one.</p>
            <div className="mt-5 flex flex-col gap-4">
              <AuthField id="signup-name" label="Name" autoComplete="name" placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <AuthField id="signup-email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <AuthPasswordField id="signup-password" label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <AuthCheckbox checked={agreed} onChange={() => setAgreed((a) => !a)}>
                I agree to the <span style={{ color: AUTH.text, fontWeight: 600 }}>Terms of Service</span> and Privacy Policy
              </AuthCheckbox>
              {error && <p role="alert" className="text-xs font-medium" style={{ color: AUTH.bad }}>{error}</p>}
              <button type="submit" disabled={busy} className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-60" style={{ backgroundColor: AUTH.fill, color: AUTH.fillText }}>
                {busy && <Loader2 size={15} className="animate-spin" />} Create account
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
