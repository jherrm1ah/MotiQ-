// Starts a Motiq Pro payment with Paystack and returns the checkout page to open.
//   POST { months: 1 | 12, plan?: "pro" | "fleet" } -> { url, reference }   Motiq Pro / Fleet
//   POST { kind: "job", offerId }                  -> { url, reference }   pay a mechanic's accepted quote;
//        Motiq holds it until the driver marks the job done (COMMISSION goes to Motiq).
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

const FLEET: Record<string, { 1: number; 12: number }> = {
  NGN: { 1: 15000, 12: 150000 },
  GHS: { 1: 180, 12: 1800 },
  KES: { 1: 2400, 12: 24000 },
  ZAR: { 1: 330, 12: 3300 },
  USD: { 1: 18, 12: 180 },
};
class PayError extends Error {}
const COMMISSION = 0.1; // 10% of a job paid through Motiq

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
    // Where Paystack sends the driver after paying: the Motiq site they paid from, or the site set
    // in the PUBLIC_SITE_URL secret. With neither (e.g. the Android app), Paystack shows its own
    // "payment successful" page — never some other website.
    const site = (Deno.env.get("PUBLIC_SITE_URL") || "").replace(/\/+$/, "");
    const allowed = (u: string) => /^https:\/\/[a-z0-9-]+\.vercel\.app\//.test(u) || (!!site && u.startsWith(site + "/"));
    const origin: string | undefined = typeof body.returnTo === "string" && allowed(body.returnTo) ? body.returnTo : site ? `${site}/?pro=done` : undefined;
    const initialize = async (amount: number, currency: string, reference: string, metadata: Record<string, unknown>, callback?: string) => {
      const res = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
        body: JSON.stringify({ email: u.user!.email, amount: Math.round(amount * 100), currency, reference, metadata, ...(callback ? { callback_url: callback } : {}) }),
      });
      const out = await res.json();
      if (!res.ok || !out.status) { console.error("paystack", out); throw new PayError(out.message || "Couldn't start the payment."); }
      return out.data.authorization_url as string;
    };

    if (body.kind === "job") {
      // Pay a mechanic: only the driver who accepted this quote, only once, for the quoted price.
      const { data: offer } = await admin.from("quote_offers").select("id, provider_id, price, currency, status, request:quote_requests(owner_id)").eq("id", String(body.offerId || "")).maybeSingle();
      if (!offer || (offer.request as any)?.owner_id !== u.user.id) return json({ error: "Quote not found" }, 404);
      if (offer.status !== "accepted") return json({ error: "Accept the quote first." }, 400);
      if (offer.price == null || Number(offer.price) <= 0) return json({ error: "This quote has no price. Agree a price with the mechanic in chat first." }, 400);
      const { data: existing } = await admin.from("job_payments").select("status").eq("offer_id", offer.id).in("status", ["held", "released", "paid_out"]).limit(1);
      if (existing && existing.length) return json({ error: "You've already paid for this job." }, 400);
      const reference = `job_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
      const amount = Number(offer.price);
      // Record it first: if that fails, nobody is sent to pay.
      const { error: recErr } = await admin.from("job_payments").insert({ offer_id: offer.id, driver_id: u.user.id, provider_id: offer.provider_id, reference, amount, commission: Math.round(amount * COMMISSION * 100) / 100, currency: offer.currency });
      if (recErr) { console.error("job_payments", recErr.message); return json({ error: "Payments aren't set up yet. Try again later." }, 503); }
      const url = await initialize(amount, offer.currency, reference, { motiq_user: u.user.id, offer: offer.id }, origin ? origin.replace("pro=done", "job=paid") : undefined);
      return json({ url, reference, amount, currency: offer.currency });
    }

    const plan = body.plan === "fleet" ? "fleet" : "pro";
    const months = body.months === 12 ? 12 : 1;
    const { data: me } = await admin.from("profiles").select("currency").eq("id", u.user.id).maybeSingle();
    const currency = me && PRICES[me.currency] ? me.currency : "USD";
    const amount = (plan === "fleet" ? FLEET : PRICES)[currency][months];
    const reference = `motiq_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
    const { error: recErr } = await admin.from("payments").insert({ owner_id: u.user.id, reference, amount, currency, months, plan });
    if (recErr) { console.error("payments", recErr.message); return json({ error: "Payments aren't set up yet. Try again later." }, 503); }
    const url = await initialize(amount, currency, reference, { motiq_user: u.user.id, months, plan }, origin);
    return json({ url, reference, amount, currency });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof PayError ? e.message : "Something went wrong. Try again." }, 500);
  }
});
