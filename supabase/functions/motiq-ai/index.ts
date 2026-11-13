// Motiq's AI mechanic. The app sends a question (and optionally a photo); this function adds what
// Motiq knows about the car (details, service history, open reminders, the latest OBD-II scan),
// asks Claude, saves both sides of the conversation and returns the answer.
//
//   POST { message, vehicleId?, mode?: "chat" | "voice" | "scan", imagePath? }
//     -> { reply }
//   mode "voice": Car Mode. Short, spoken-style answers (no lists or symbols).
//   mode "scan":  explain an OBD-II scan in plain words (message holds the codes and readings).
//   mode "vin":   read the VIN from a photo (imagePath); replies with just the VIN. Not saved.
//   mode "light":  a photo of the dashboard: which warning lights are on and what to do.
//   mode "damage": a photo of damage (dent, tyre, leak, rust…): likely cause and cost range.
//   mode "value":  what the car is worth now, from its details and history.
//
// Secret: ANTHROPIC_API_KEY (Supabase → Project Settings → Edge Functions → Secrets).
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "jsr:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
class UserError extends Error {}

const MODEL = "claude-opus-5-5";
const DAILY_LIMIT = { free: 15, pro: 100 }; // questions per person per day
const LANGS: Record<string, string> = { en: "English", fr: "French", es: "Spanish", pt: "Portuguese", ar: "Arabic", sw: "Swahili", ha: "Hausa", yo: "Yoruba" };

const RULES = `You are Motiq, a friendly, expert car mechanic inside the Motiq app. You help drivers anywhere in the world understand their car: warning lights, sounds, smells, OBD-II fault codes, maintenance, costs and what to do next.

How to answer:
- Use the car details, service history, reminders and latest scan below. Mention them when they matter ("your last oil change was 9,000 km ago").
- Be practical: likely causes (most likely first), what the driver can safely check themselves, whether it's safe to keep driving, how urgent it is, and a rough cost range in the driver's currency when you can.
- Be honest about uncertainty: without seeing the car you can only narrow it down. Suggest a mechanic for anything you can't confirm.
- Safety first: for brakes, steering, airbags, fuel leaks, overheating or smoke, tell them clearly to stop driving and get help. Never suggest disabling safety systems or emissions equipment.
- Use the driver's distance unit and currency. Keep answers short and scannable; no long essays.
- Only answer about cars, driving, maintenance, buying/selling cars and parts, and using Motiq. Politely steer other topics back to cars.`;

const VOICE = `This answer will be read aloud to someone who is driving. Reply in 1-3 short spoken sentences: no lists, headings, symbols, emoji or markdown. If it needs more detail, say they can read more in the app when parked. Never ask them to look at the screen while driving.`;

// Chat and scans start with a verdict tag the app turns into a "Safe to drive / Drive with caution /
// Stop driving" badge. Voice answers don't (they're read aloud).
const VERDICT = `Start your answer with exactly one tag on its own line: [VERDICT:safe] (fine to keep driving normally), [VERDICT:caution] (drive only if necessary and briefly, get it checked soon) or [VERDICT:stop] (don't drive: arrange a tow or roadside help). Pick the more cautious one when unsure, and never play down brakes, steering, fuel smell, smoke or overheating. If the question isn't about a problem with the car (e.g. maintenance advice or prices), or you need to ask one clarifying question first, leave the tag out.`;

const LIGHT = `The photo shows the car's dashboard. Name every warning light you can see that is on (colour and symbol), say what each means for this car, how urgent it is (red = stop soon, amber = get it checked), what the driver can check themselves and whether it's safe to keep driving. If the photo is unclear or no warning light is on, say so and ask for a clearer photo with the engine running.`;
const DAMAGE = `The photo shows damage or wear on the car (for example a dent, scratch, tyre, leak, rust or a broken part). Say what it most likely is and what probably caused it, whether it affects safety or is cosmetic, whether it's safe to drive, what the fix is (repair vs replace) and a realistic cost range in the driver's currency where they live. Be honest that a photo can't show everything.`;
const VALUE = `Estimate what this car is worth today if sold privately and if traded in to a dealer, in the driver's currency, in the driver's country. Use the make, model, year, mileage, fuel and gearbox, and explain in 3-5 bullet points what pushes the price up or down — including how complete its service history in Motiq is, fault codes from the last scan and overdue reminders. Give a range, not one number, and say it's an estimate. End with two or three things that would raise the price before selling. Leave out the verdict tag.`;
const SCAN = `The message is an OBD-II scan from the driver's car. Explain it in plain words: what each code means for this car, how serious it is (start with the most serious), whether it's safe to drive, what to check or fix first and a rough cost. Comment on any readings that look wrong (e.g. battery under 12.2 V with the engine off, or under 13.5 V running; coolant over 105 °C). If there are no codes and the readings look normal, say the car looks healthy.`;

function carContext(car: any, services: any[], reminders: any[], scan: any, me: any) {
  if (!car) return "The driver hasn't picked a car yet.";
  const unit = me?.distance_unit || "km";
  const lines = [
    `Car: ${[car.year, car.make, car.model, car.trim_level].filter(Boolean).join(" ")}${car.nickname ? ` ("${car.nickname}")` : ""}`,
    `Fuel: ${car.fuel}. Gearbox: ${car.transmission}. Odometer: ${car.odometer} ${unit}.${car.vin ? ` VIN: ${car.vin}.` : ""}`,
  ];
  if (services.length) lines.push("Recent service history:\n" + services.map((s) => `- ${s.done_on}: ${s.title}${s.odometer ? ` at ${s.odometer} ${unit}` : ""}${s.notes ? ` (${s.notes.slice(0, 120)})` : ""}`).join("\n"));
  else lines.push("No service history recorded yet.");
  if (reminders.length) lines.push("Open reminders:\n" + reminders.map((r) => `- ${r.title}${r.due_on ? ` due ${r.due_on}` : ""}${r.due_odometer ? ` at ${r.due_odometer} ${unit}` : ""}`).join("\n"));
  if (scan) {
    const codes = (scan.codes || []).map((c: any) => `${c.code} (${c.kind})`).join(", ") || "none";
    lines.push(`Latest scan (${scan.created_at.slice(0, 10)}${scan.source === "demo" ? ", demo data" : ""}): check engine light ${scan.check_engine ? "ON" : "off"}; codes: ${codes}; readings: ${JSON.stringify(scan.readings || {})}.`);
  }
  return lines.join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer /, "");
    const { data: u } = await admin.auth.getUser(token);
    if (!u?.user) return json({ error: "Sign in first" }, 401);
    const uid = u.user.id;
    const body = await req.json().catch(() => ({}));
    const mode = ["voice", "scan", "vin", "light", "damage", "value"].includes(body.mode) ? body.mode : "chat";
    const chatMode = ["voice"].includes(mode) ? mode : "chat"; // how it's saved: light/damage/value/scan join the chat
    const message = String(body.message || "").trim().slice(0, 4000);
    if (!message) throw new UserError("Ask something about your car.");
    if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new UserError("The AI mechanic isn't switched on yet. The Motiq team needs to add its key.");

    // The driver, and the car (yours, or one shared with you) and what Motiq knows about it.
    const vehicleId = body.vehicleId ? String(body.vehicleId) : null;
    const [{ data: me }, { data: carRow }, { data: membership }] = await Promise.all([
      admin.from("profiles").select("name, country, currency, distance_unit, city, language, plan, pro_until").eq("id", uid).maybeSingle(),
      vehicleId ? admin.from("vehicles").select("*").eq("id", vehicleId).maybeSingle() : Promise.resolve({ data: null }),
      vehicleId ? admin.from("vehicle_members").select("member_id").eq("vehicle_id", vehicleId).eq("member_id", uid).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const car = carRow && (carRow.owner_id === uid || membership) ? carRow : null;
    const pro = me?.plan === "pro" && (!me.pro_until || new Date(me.pro_until) > new Date());
    const limit = pro ? DAILY_LIMIT.pro : DAILY_LIMIT.free;
    const since = new Date(Date.now() - 86400000).toISOString();
    const { count } = await admin.from("ai_messages").select("id", { count: "exact", head: true }).eq("owner_id", uid).eq("role", "user").gte("created_at", since);
    if ((count ?? 0) >= limit) throw new UserError(pro ? `You've asked ${limit} questions today. Try again tomorrow.` : `You've used today's ${limit} free questions. Upgrade to Motiq Pro for ${DAILY_LIMIT.pro} a day, or try again tomorrow.`);
    const language = LANGS[me?.language || "en"] || "English";
    const [{ data: services }, { data: reminders }, { data: scans }, { data: history }] = await Promise.all([
      car ? admin.from("service_records").select("title, done_on, odometer, notes").eq("vehicle_id", car.id).order("done_on", { ascending: false }).limit(12) : Promise.resolve({ data: [] }),
      car ? admin.from("reminders").select("title, due_on, due_odometer").eq("vehicle_id", car.id).is("done_at", null).limit(10) : Promise.resolve({ data: [] }),
      car ? admin.from("scans").select("source, check_engine, codes, readings, created_at").eq("vehicle_id", car.id).order("created_at", { ascending: false }).limit(1) : Promise.resolve({ data: [] }),
      admin.from("ai_messages").select("role, content").eq("owner_id", uid).eq("mode", chatMode)
        .match(car ? { vehicle_id: car.id } : {}).order("created_at", { ascending: false }).limit(16),
    ]);

    const driver = `Driver: ${me?.name || "unknown name"}${me?.city ? `, ${me.city}` : ""}${me?.country ? ` (${me.country})` : ""}. Currency: ${me?.currency || "USD"}. Distance unit: ${me?.distance_unit || "km"}. Today: ${new Date().toISOString().slice(0, 10)}.${language !== "English" ? ` Always reply in ${language}, whatever language the question is in (keep fault codes and the [VERDICT:...] tag as they are).` : ""}`;
    const context = `${driver}\n${carContext(car, services || [], reminders || [], (scans || [])[0], me)}`;

    // Earlier turns (oldest first), then this question, with the photo if there is one.
    const past: Anthropic.Beta.BetaMessageParam[] = (history || []).reverse().map((m: any) => ({ role: m.role, content: m.content }));
    while (past.length && past[0].role !== "user") past.shift();
    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    let imagePath: string | null = null;
    if (body.imagePath && typeof body.imagePath === "string" && body.imagePath.startsWith(`${uid}/`)) {
      const { data: file } = await admin.storage.from("ai-photos").download(body.imagePath);
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.length <= 5 * 1024 * 1024) {
          let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: btoa(bin) } });
          imagePath = body.imagePath;
        }
      }
    }
    content.push({ type: "text", text: message });

    const client = new Anthropic();
    if ((mode === "light" || mode === "damage") && !imagePath) throw new UserError("Add a photo first.");
    if (mode === "vin") {
      if (!imagePath) throw new UserError("Add a photo of the VIN plate or sticker.");
      const r = await client.beta.messages.create({
        model: MODEL, max_tokens: 200, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default", output_config: { effort: "low" },
        system: "Find the vehicle identification number (VIN) in the photo: 17 characters, letters and digits, never I, O or Q. Reply with only the VIN, or NONE if you can't read all 17 characters with confidence.",
        messages: [{ role: "user", content }],
      });
      const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
      return json({ reply: text });
    }
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: mode === "voice" ? 1000 : 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: mode === "voice" ? "low" : "medium" },
      // Stable rules first (cached), then this driver's car (changes as they use the app).
      system: [
        { type: "text", text: RULES, cache_control: { type: "ephemeral" } },
        { type: "text", text: [mode === "voice" ? VOICE : mode === "value" ? "" : VERDICT, ({ scan: SCAN, light: LIGHT, damage: DAMAGE, value: VALUE } as Record<string, string>)[mode] || "", context].filter(Boolean).join("\n\n") },
      ],
      messages: [...past, { role: "user", content }],
    });

    if (response.stop_reason === "refusal") throw new UserError("Motiq can't help with that one. Try asking about your car in a different way.");
    const reply = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (!reply) throw new UserError("Motiq couldn't answer that. Try again.");

    // The answer is stamped just after the question so they always come back in order.
    const asked = Date.now();
    await admin.from("ai_messages").insert([
      { owner_id: uid, vehicle_id: car?.id ?? null, mode: chatMode, role: "user", content: mode === "scan" ? `Explain my scan:\n${message}` : message, image_path: imagePath, created_at: new Date(asked).toISOString() },
      { owner_id: uid, vehicle_id: car?.id ?? null, mode: chatMode, role: "assistant", content: reply.slice(0, 20000), created_at: new Date(asked + 1).toISOString() },
    ]);
    return json({ reply });
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Motiq is busy right now. Try again in a minute." }, 429);
    if (e instanceof Anthropic.APIError) { console.error("anthropic", e.status, e.message); return json({ error: "Motiq couldn't reach the AI. Try again." }, 502); }
    console.error(e);
    return json({ error: "Something went wrong. Try again." }, 500);
  }
});
