// Error tracking: crashes and failures are sent to the client_errors table (no personal data
// beyond the signed-in account), so problems show up on the admin page before anyone reports them.
import { supabase } from "./supabase.js";

const VERSION = "1.5.0";
const sent = new Set();
let count = 0;
let screen = "";
export const setErrorScreen = (s) => { screen = s || ""; };
const platform = () => (typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() ? "android" : "web");

export function reportError(err, where = "") {
  try {
    const message = String((err && (err.message || err.reason)) || err || "Unknown error").slice(0, 500);
    if (/ResizeObserver loop|Load failed|Failed to fetch|NetworkError|AbortError/i.test(message)) return; // noise, or no signal
    const key = message + where;
    if (sent.has(key) || count >= 15) return;
    sent.add(key); count++;
    supabase.from("client_errors").insert({ message, stack: String((err && err.stack) || "").slice(0, 4000), screen: (where || screen).slice(0, 40), app_version: VERSION, platform: platform() }).then(() => {}, () => {});
  } catch (e) { /* never let error reporting break the app */ }
}

export function installErrorTracking() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => reportError(e.error || e.message));
  window.addEventListener("unhandledrejection", (e) => reportError(e.reason));
}
