// Sends a Motiq notification to the person's phones with Firebase Cloud Messaging (FCM v1).
// Called only by the database (public.notify) with the shared secret stored in app_secrets.
//   POST { notification_id }   header x-motiq-secret
// Secret: FCM_SERVICE_ACCOUNT — the Firebase service-account JSON (Firebase → Project settings →
// Service accounts → Generate new private key), pasted whole into Supabase → Edge Functions → Secrets.
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

let cached: { token: string; exp: number } | null = null;
async function accessToken(sa: { client_email: string; private_key: string }) {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${b64url(sig)}` }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`oauth ${res.status} ${j.error || ""}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cached.token;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const { data: s } = await admin.from("app_secrets").select("value").eq("key", "push_secret").maybeSingle();
  const given = req.headers.get("x-motiq-secret") || "";
  if (!s || !given || given !== s.value) return new Response("forbidden", { status: 403 });
  const raw = Deno.env.get("FCM_SERVICE_ACCOUNT");
  if (!raw) return new Response("push not configured");
  try {
    const sa = JSON.parse(raw);
    const { notification_id } = await req.json();
    const { data: n } = await admin.from("notifications").select("*").eq("id", notification_id).maybeSingle();
    if (!n) return new Response("no notification");
    const { data: tokens } = await admin.from("push_tokens").select("token").eq("user_id", n.user_id);
    if (!tokens || !tokens.length) return new Response("no devices");
    const bearer = await accessToken(sa);
    let sent = 0;
    for (const { token } of tokens) {
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: "POST", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token, notification: { title: n.title, body: n.body }, data: { link: n.link || "", kind: n.kind, id: n.id },
          android: { priority: "high", notification: { icon: "ic_stat_motiq", color: "#212121", channel_id: "motiq" } } } }),
      });
      if (r.ok) sent++;
      else {
        const e = await r.json().catch(() => ({}));
        const code = JSON.stringify(e);
        if (r.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(code)) await admin.from("push_tokens").delete().eq("token", token);
        else console.error("fcm", r.status, code.slice(0, 300));
      }
    }
    return new Response(`sent ${sent}`);
  } catch (e) {
    console.error(e);
    return new Response("error", { status: 500 });
  }
});
