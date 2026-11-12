import { createClient } from "@supabase/supabase-js";

// The project address and its publishable key are public by design: what anyone can read or
// change is decided by the row level security rules in supabase/migrations.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "https://qsnooitnvlziladyywho.supabase.co";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || "sb_publishable_QrxhkzmRY5DqQ9D7gSHuoQ_lImw_rGI";

// In the Android app, Google sign-in comes back through the app's own link (com.orynthra.motiq://)
// with a one-time code, so the app uses the PKCE flow there.
export const IS_NATIVE = typeof window !== "undefined" && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const NATIVE_CALLBACK = "com.orynthra.motiq://login-callback";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: IS_NATIVE ? "pkce" : "implicit" },
});

export async function signInWithGoogle() {
  if (!IS_NATIVE) {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
    if (error) throw error;
    return;
  }
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: NATIVE_CALLBACK, skipBrowserRedirect: true } });
  if (error) throw error;
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url });
}

// Android: finish Google sign-in when the browser hands the code back to the app.
export async function listenForNativeSignIn() {
  if (!IS_NATIVE) return;
  const [{ App }, { Browser }] = await Promise.all([import("@capacitor/app"), import("@capacitor/browser")]);
  App.addListener("appUrlOpen", async ({ url }) => {
    if (!url || !url.startsWith(NATIVE_CALLBACK)) return;
    const code = new URL(url.replace(/^com\.orynthra\.motiq:\/\//, "https://x/")).searchParams.get("code");
    try { if (code) await supabase.auth.exchangeCodeForSession(code); } finally { Browser.close().catch(() => {}); }
  });
}
