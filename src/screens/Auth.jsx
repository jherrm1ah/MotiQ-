import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { C, FONT, Button, Field, input } from "../ui.jsx";

// Sign in or create an account with email and password.
export default function Auth() {
  const [mode, setMode] = useState("signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setNote("");
    if (mode === "signup" && !name.trim()) return setError("Tell us your name.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError("Enter a valid email address.");
    if (mode !== "reset" && password.length < 8) return setError("Use at least 8 characters for your password.");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { name: name.trim() } } });
        if (err) throw err;
        if (!data.session) { setNote(`We've emailed ${email.trim()}. Tap the link in it to confirm, then sign in.`); setMode("signin"); }
      } else if (mode === "signin") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) throw new Error(/invalid/i.test(err.message) ? "That email and password don't match." : err.message);
      } else {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (err) throw err;
        setNote("Check your email for a link to set a new password.");
      }
    } catch (err) { setError(err.message || "Something went wrong. Try again."); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: FONT, background: `radial-gradient(120% 70% at 50% 0%, #10261F 0%, ${C.bg} 60%)` }}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 400 }}>
        <div style={{ textAlign: "center", marginBottom: 26 }}>
          <img src="/icon.svg" alt="" width={64} height={64} style={{ borderRadius: 16 }} />
          <h1 style={{ margin: "14px 0 6px", fontSize: 32, fontWeight: 800, letterSpacing: -1 }}>Motiq</h1>
          <p style={{ margin: 0, color: C.sub, fontSize: 15 }}>Your AI car companion</p>
        </div>
        {mode === "signup" && <Field label="Your name"><input style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Ada Obi" /></Field>}
        <Field label="Email"><input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></Field>
        {mode !== "reset" && <Field label="Password"><input style={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder="At least 8 characters" /></Field>}
        {error && <p role="alert" style={{ color: C.bad, fontSize: 14, margin: "0 0 12px" }}>{error}</p>}
        {note && <p style={{ color: C.accent, fontSize: 14, margin: "0 0 12px" }}>{note}</p>}
        <Button type="submit" disabled={busy} style={{ width: "100%" }}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "signin" ? "Sign in" : "Send reset link"}</Button>
        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14, color: C.sub }}>
          {mode === "signup" ? <>Have an account? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signin"); setError(""); }} style={{ color: C.accent, fontWeight: 700 }}>Sign in</a></>
            : <>New to Motiq? <a href="#" onClick={(e) => { e.preventDefault(); setMode("signup"); setError(""); }} style={{ color: C.accent, fontWeight: 700 }}>Create an account</a></>}
          {mode === "signin" && <div style={{ marginTop: 10 }}><a href="#" onClick={(e) => { e.preventDefault(); setMode("reset"); setError(""); }} style={{ color: C.sub }}>Forgot password?</a></div>}
        </div>
      </form>
    </div>
  );
}
