// Starts a Motiq Pro payment with Paystack and returns the checkout page to open.
//   POST { months: 1 | 12 } -> { url, reference }
// Secret: PAYSTACK_SECRET_KEY (Supabase → Project Settings → Edge Functions → Secrets).
// Prices are here so they're easy to change. Paystack charges in your account's currencies:
// NGN works on every Nigerian account; other currencies must be enabled on your Paystack account.
import { createClient } from "jsr:@supabase/supabase-js@2";

const PRICES: Record<string, { 1: number; 12: number }> = {
  NGN: { 1: 2500, 12: 25000 },
  GHS: { 1: 30, 12: 300 },
  KES: { 1: 400, 12: 4000 },
  ZAR: { 1: 55, 12: 550 },
  USD: { 1: 3, 12: 30 },
};

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!secret) return json({ error: "Payments aren't switched on yet." }, 400);
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user || !u.user.email) return json({ error: "Sign in first" }, 401);
    const body = await req.json().catch(() => ({}));
    const months = body.months === 12 ? 12 : 1;
    const { data: me } = await admin.from("profiles").select("currency").eq("id", u.user.id).maybeSingle();
    const currency = me && PRICES[me.currency] ? me.currency : "USD";
    const amount = PRICES[currency][months];
    const reference = `motiq_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const origin = typeof body.returnTo === "string" && /^https:\/\/[a-z0-9-]+\.vercel\.app\//.test(body.returnTo) ? body.returnTo : "https://motiq.vercel.app/?pro=done";
    const res = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: u.user.email, amount: Math.round(amount * 100), currency, reference, callback_url: origin, metadata: { motiq_user: u.user.id, months } }),
    });
    const out = await res.json();
    if (!res.ok || !out.status) { console.error("paystack", out); return json({ error: out.message || "Couldn't start the payment." }, 502); }
    await admin.from("payments").insert({ owner_id: u.user.id, reference, amount, currency, months });
    return json({ url: out.data.authorization_url, reference, amount, currency });
  } catch (e) {
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
