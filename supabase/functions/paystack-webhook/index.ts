// Paystack calls this after a payment. If the signature is genuine and the charge succeeded, the
// person gets Motiq Pro for the months they paid for (added to any time they still have).
// Set this URL as the webhook in Paystack → Settings → API Keys & Webhooks:
//   https://<project>.supabase.co/functions/v1/paystack-webhook
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

async function hmac512(key: string, data: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const secret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!secret) return new Response("not configured", { status: 500 });
  const raw = await req.text();
  const sig = req.headers.get("x-paystack-signature") || "";
  if (sig !== (await hmac512(secret, raw))) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(raw);
  if (event.event !== "charge.success") return new Response("ignored");
  const ref = event.data && event.data.reference;

  // Paying a mechanic: hold the money until the driver marks the job done.
  if (typeof ref === "string" && ref.startsWith("job_")) {
    const { data: job } = await admin.from("job_payments").select("*").eq("reference", ref).maybeSingle();
    if (!job) return new Response("unknown reference");
    if (event.data.currency !== job.currency || Number(event.data.amount) !== Math.round(Number(job.amount) * 100)) {
      await admin.from("job_payments").update({ status: "failed" }).eq("id", job.id).eq("status", "pending");
      return new Response("amount mismatch");
    }
    const { data: claimed } = await admin.from("job_payments").update({ status: "held", paid_at: new Date().toISOString() }).eq("id", job.id).eq("status", "pending").select("id");
    if (!claimed || claimed.length === 0) return new Response("already done");
    const money = `${job.currency} ${Number(job.amount).toLocaleString("en-US")}`;
    await admin.rpc("notify", { p_user: job.provider_id, p_kind: "payment", p_title: "The driver paid for the job", p_body: `${money} is held safely by Motiq. You'll get it (minus the Motiq fee) when the driver marks the job done.`, p_link: "quotes" });
    await admin.rpc("notify", { p_user: job.driver_id, p_kind: "payment", p_title: "Payment received", p_body: `${money} is held safely. Tap "Job done" when the work is finished and the mechanic gets paid.`, p_link: "quotes" });
    return new Response("ok");
  }

  const { data: pay } = await admin.from("payments").select("*").eq("reference", ref).maybeSingle();
  if (!pay) return new Response("unknown reference");
  if (pay.status === "paid") return new Response("already done");
  // Amount and currency must match what we asked for.
  if (event.data.currency !== pay.currency || Number(event.data.amount) !== Math.round(Number(pay.amount) * 100)) {
    await admin.from("payments").update({ status: "failed" }).eq("id", pay.id);
    return new Response("amount mismatch");
  }
  // Claim the payment first so a repeated webhook can't add the months twice.
  const { data: claimed } = await admin.from("payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pay.id).neq("status", "paid").select("id");
  if (!claimed || claimed.length === 0) return new Response("already done");
  const { data: me } = await admin.from("profiles").select("plan, pro_until").eq("id", pay.owner_id).maybeSingle();
  const start = me && (me.plan === "pro" || me.plan === "fleet") && me.pro_until && new Date(me.pro_until) > new Date() ? new Date(me.pro_until) : new Date();
  start.setMonth(start.getMonth() + pay.months);
  await admin.from("profiles").update({ plan: pay.plan === "fleet" ? "fleet" : (me && me.plan === "fleet" ? "fleet" : "pro"), pro_until: start.toISOString() }).eq("id", pay.owner_id);
  return new Response("ok");
});
