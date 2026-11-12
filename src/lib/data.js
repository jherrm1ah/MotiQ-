// Everything Motiq reads and writes. Row level security (supabase/migrations) decides what each
// person can see: your own cars, history, scans and AI chats; anyone's active listings.
import { supabase, SUPABASE_URL } from "./supabase.js";
import { severityOf } from "./dtc.js";
import { daysUntil, todayISO } from "./units.js";

const ok = (res, what) => { if (res.error) throw new Error(res.error.message || `Couldn't load ${what}`); return res.data; };

export async function loadProfile(uid) {
  return ok(await supabase.from("profiles").select("*").eq("id", uid).maybeSingle(), "your profile");
}
export async function saveProfile(uid, patch) {
  return ok(await supabase.from("profiles").update(patch).eq("id", uid).select().single(), "your profile");
}

export async function loadGarage(uid) {
  const [cars, services, reminders, scans] = await Promise.all([
    supabase.from("vehicles").select("*").eq("owner_id", uid).order("created_at"),
    supabase.from("service_records").select("*").eq("owner_id", uid).order("done_on", { ascending: false }).limit(300),
    supabase.from("reminders").select("*").eq("owner_id", uid).order("due_on", { ascending: true, nullsFirst: false }).limit(300),
    supabase.from("scans").select("*").eq("owner_id", uid).order("created_at", { ascending: false }).limit(60),
  ]);
  return { cars: ok(cars, "your cars"), services: ok(services, "service history"), reminders: ok(reminders, "reminders"), scans: ok(scans, "scans") };
}

export async function saveCar(uid, car) {
  const row = {
    owner_id: uid, make: car.make.trim(), model: car.model.trim(), year: car.year ? Number(car.year) : null,
    trim_level: (car.trim_level || "").trim(), nickname: (car.nickname || "").trim(), vin: (car.vin || "").trim().toUpperCase(),
    plate: (car.plate || "").trim().toUpperCase(), fuel: car.fuel || "petrol", transmission: car.transmission || "automatic",
    odometer: Math.max(0, Math.round(Number(car.odometer) || 0)),
  };
  return car.id
    ? ok(await supabase.from("vehicles").update(row).eq("id", car.id).select().single(), "your car")
    : ok(await supabase.from("vehicles").insert(row).select().single(), "your car");
}
export async function deleteCar(id) { ok(await supabase.from("vehicles").delete().eq("id", id), "your car"); }
export async function updateOdometer(id, odometer) { ok(await supabase.from("vehicles").update({ odometer: Math.round(odometer) }).eq("id", id), "your car"); }

export async function addService(uid, vehicleId, s, currency) {
  return ok(await supabase.from("service_records").insert({
    owner_id: uid, vehicle_id: vehicleId, kind: s.kind || "other", title: s.title.trim(), done_on: s.done_on || todayISO(),
    odometer: s.odometer ? Math.round(Number(s.odometer)) : null, cost: s.cost === "" || s.cost == null ? null : Number(s.cost),
    currency, shop: (s.shop || "").trim(), notes: (s.notes || "").trim(),
  }).select().single(), "service");
}
export async function deleteService(id) { ok(await supabase.from("service_records").delete().eq("id", id), "service"); }

export async function addReminder(uid, vehicleId, r) {
  return ok(await supabase.from("reminders").insert({
    owner_id: uid, vehicle_id: vehicleId, kind: r.kind || "other", title: r.title.trim(),
    due_on: r.due_on || null, due_odometer: r.due_odometer ? Math.round(Number(r.due_odometer)) : null,
    every_months: r.every_months ? Number(r.every_months) : null, every_distance: r.every_distance ? Number(r.every_distance) : null,
  }).select().single(), "reminder");
}
// Done: mark it, and if it repeats, set the next one up.
export async function completeReminder(uid, r, odometer) {
  ok(await supabase.from("reminders").update({ done_at: new Date().toISOString() }).eq("id", r.id), "reminder");
  if (r.every_months || r.every_distance) {
    let due_on = null;
    if (r.every_months) { const d = new Date(); d.setMonth(d.getMonth() + r.every_months); due_on = d.toISOString().slice(0, 10); }
    await addReminder(uid, r.vehicle_id, { ...r, due_on, due_odometer: r.every_distance ? (odometer || 0) + r.every_distance : null });
  }
}
export async function deleteReminder(id) { ok(await supabase.from("reminders").delete().eq("id", id), "reminder"); }

export async function saveScan(uid, vehicleId, scan) {
  return ok(await supabase.from("scans").insert({ owner_id: uid, vehicle_id: vehicleId, source: scan.source, check_engine: !!scan.check_engine, codes: scan.codes || [], readings: scan.readings || {}, summary: scan.summary || "" }).select().single(), "scan");
}
export async function setScanSummary(id, summary) { await supabase.from("scans").update({ summary: summary.slice(0, 4000) }).eq("id", id); }

// ---- AI mechanic
export async function loadAiHistory(uid, vehicleId, mode = "chat") {
  let q = supabase.from("ai_messages").select("id, role, content, created_at, image_path").eq("owner_id", uid).eq("mode", mode).order("created_at", { ascending: false }).limit(40);
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  // A question and its answer are saved together (same time): put the question first.
  return ok(await q, "chat").sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.role === "user" ? -1 : 1) - (b.role === "user" ? -1 : 1));
}
export async function clearAiHistory(uid) { ok(await supabase.from("ai_messages").delete().eq("owner_id", uid), "chat"); }
export async function askMotiq({ message, vehicleId, mode = "chat", imagePath = null }) {
  const { data, error } = await supabase.functions.invoke("motiq-ai", { body: { message, vehicleId, mode, imagePath } });
  if (error) {
    let msg = "Motiq couldn't answer. Try again.";
    try { const body = await error.context.json(); if (body && body.error) msg = body.error; } catch (e) {}
    throw new Error(msg);
  }
  return data.reply;
}

// Photos are shrunk on the phone before upload (max 1600 px, JPEG).
export async function shrinkPhoto(file, max = 1600) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.84));
}
export async function uploadPhoto(bucket, uid, file) {
  const blob = await shrinkPhoto(file);
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  ok(await supabase.storage.from(bucket).upload(path, blob, { contentType: "image/jpeg", upsert: false }), "photo");
  return path;
}
export const listingPhotoUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/listing-photos/${path}`;

// ---- Marketplace
export async function loadListings({ kind, q, fitsMake, mine, uid } = {}) {
  let query = supabase.from("listings").select("*, seller:profiles!listings_seller_id_fkey(id, name, city, country)").order("created_at", { ascending: false }).limit(100);
  if (mine) query = query.eq("seller_id", uid).neq("status", "hidden");
  else query = query.eq("status", "active");
  if (kind) query = query.eq("kind", kind);
  if (fitsMake) query = query.or(`fits_make.ilike.${fitsMake.replace(/[,()]/g, "")},fits_make.eq.`);
  if (q) { const s = q.replace(/[%,()]/g, " ").trim(); if (s) query = query.or(`title.ilike.%${s}%,description.ilike.%${s}%,fits_model.ilike.%${s}%`); }
  return ok(await query, "listings");
}
export async function saveListing(uid, l) {
  const row = {
    seller_id: uid, kind: l.kind, category: l.category || "other", title: l.title.trim(), description: (l.description || "").trim(),
    price: l.price === "" || l.price == null ? null : Number(l.price), currency: l.currency, condition: l.kind === "service" ? "na" : (l.condition || "used"),
    country: l.country || "", city: (l.city || "").trim(), fits_make: (l.fits_make || "").trim(), fits_model: (l.fits_model || "").trim(),
    fits_year_from: l.fits_year_from ? Number(l.fits_year_from) : null, fits_year_to: l.fits_year_to ? Number(l.fits_year_to) : null,
    photos: l.photos || [],
  };
  return l.id
    ? ok(await supabase.from("listings").update(row).eq("id", l.id).select().single(), "listing")
    : ok(await supabase.from("listings").insert(row).select().single(), "listing");
}
export async function setListingStatus(id, status) { ok(await supabase.from("listings").update({ status }).eq("id", id), "listing"); }

export async function contactSeller(listingId) {
  return ok(await supabase.rpc("contact_seller", { p_listing: listingId }), "chat");
}
export async function loadInbox(uid) {
  const convs = ok(await supabase.from("conversations").select("*, listing:listings(id, title, photos, price, currency, status)").order("last_message_at", { ascending: false }), "messages");
  if (!convs.length) return [];
  const others = [...new Set(convs.map((c) => (c.buyer_id === uid ? c.seller_id : c.buyer_id)))];
  const [people, last] = await Promise.all([
    supabase.from("profiles").select("id, name, city").in("id", others),
    supabase.from("messages").select("conversation_id, body, sender_id, read_at, created_at").in("conversation_id", convs.map((c) => c.id)).order("created_at", { ascending: false }).limit(500),
  ]);
  const byId = Object.fromEntries((people.data || []).map((p) => [p.id, p]));
  return convs.map((c) => {
    const msgs = (last.data || []).filter((m) => m.conversation_id === c.id);
    const other = byId[c.buyer_id === uid ? c.seller_id : c.buyer_id] || { name: "Someone" };
    return { ...c, other, last: msgs[0] || null, unread: msgs.filter((m) => m.sender_id !== uid && !m.read_at).length, role: c.buyer_id === uid ? "buying" : "selling" };
  });
}
export async function loadMessages(conversationId) {
  return ok(await supabase.from("messages").select("*").eq("conversation_id", conversationId).order("created_at").limit(500), "messages");
}
export async function sendMessage(uid, conversationId, body) {
  return ok(await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: uid, body: body.trim().slice(0, 2000) }).select().single(), "message");
}
export async function markRead(uid, conversationId) {
  await supabase.from("messages").update({ read_at: new Date().toISOString() }).eq("conversation_id", conversationId).neq("sender_id", uid).is("read_at", null);
}

// ---- Health: one score out of 100 for each car, and why.
export function reminderState(r, odometer) {
  if (r.done_at) return "done";
  const byDate = r.due_on ? daysUntil(r.due_on) : null;
  const byDist = r.due_odometer != null ? r.due_odometer - (odometer || 0) : null;
  if ((byDate != null && byDate < 0) || (byDist != null && byDist <= 0)) return "overdue";
  if ((byDate != null && byDate <= 30) || (byDist != null && byDist <= 1000)) return "soon";
  return "later";
}
export function healthOf(car, { services = [], reminders = [], scans = [] }) {
  const notes = [];
  let score = 100;
  const scan = scans.find((s) => s.vehicle_id === car.id);
  if (scan) {
    if (scan.check_engine) { score -= 15; notes.push({ tone: "bad", text: "Check engine light is on" }); }
    for (const c of scan.codes || []) {
      const sev = severityOf(c.code);
      score -= sev === "safety" ? 20 : sev === "soon" ? 10 : 4;
    }
    if ((scan.codes || []).length) notes.push({ tone: (scan.codes || []).some((c) => severityOf(c.code) === "safety") ? "bad" : "warn", text: `${scan.codes.length} fault code${scan.codes.length === 1 ? "" : "s"} in the last scan` });
    const v = scan.readings && scan.readings.battery_v;
    if (v != null && v < 12.2) { score -= 8; notes.push({ tone: "warn", text: `Battery reading was low (${v} V)` }); }
  }
  const open = reminders.filter((r) => r.vehicle_id === car.id && !r.done_at);
  const overdue = open.filter((r) => reminderState(r, car.odometer) === "overdue");
  const soon = open.filter((r) => reminderState(r, car.odometer) === "soon");
  if (overdue.length) { score -= Math.min(24, overdue.length * 8); notes.push({ tone: "bad", text: `${overdue.length} service item${overdue.length === 1 ? "" : "s"} overdue` }); }
  if (soon.length) { score -= Math.min(9, soon.length * 3); notes.push({ tone: "warn", text: `${soon.length} due soon` }); }
  const lastService = services.find((s) => s.vehicle_id === car.id);
  if (!lastService) notes.push({ tone: "muted", text: "No service history yet" });
  else if (daysUntil(lastService.done_on) < -365) { score -= 5; notes.push({ tone: "warn", text: "Last service was over a year ago" }); }
  if (!scan) notes.push({ tone: "muted", text: "No scan yet" });
  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 85 ? "Healthy" : score >= 65 ? "Needs attention soon" : "Needs attention";
  return { score, label, tone: score >= 85 ? "good" : score >= 65 ? "warn" : "bad", notes, scan, overdue, soon };
}

// Common service items, offered when adding a reminder (distance in the driver's unit).
export function reminderTemplates(unit = "km") {
  const d = (km, mi) => (unit === "mi" ? mi : km);
  return [
    { kind: "oil", title: "Oil and filter change", every_months: 6, every_distance: d(8000, 5000) },
    { kind: "tyres", title: "Tyre rotation and pressure check", every_months: 6, every_distance: d(10000, 6000) },
    { kind: "brakes", title: "Brake pads and fluid check", every_months: 12, every_distance: d(20000, 12000) },
    { kind: "filters", title: "Air and cabin filters", every_months: 12, every_distance: d(15000, 10000) },
    { kind: "battery", title: "Battery test", every_months: 12, every_distance: null },
    { kind: "fluids", title: "Coolant and transmission fluid check", every_months: 24, every_distance: d(40000, 25000) },
    { kind: "inspection", title: "Road-worthiness inspection", every_months: 12, every_distance: null },
    { kind: "insurance", title: "Insurance renewal", every_months: 12, every_distance: null },
    { kind: "licence", title: "Vehicle licence / registration renewal", every_months: 12, every_distance: null },
  ];
}

// ---- Documents & warranty (per car)
export async function loadDocuments(uid) {
  return ok(await supabase.from("vehicle_documents").select("*").eq("owner_id", uid).order("expires_on", { ascending: true, nullsFirst: false }), "documents");
}
export async function addDocument(uid, d) {
  return ok(await supabase.from("vehicle_documents").insert({
    owner_id: uid, vehicle_id: d.vehicle_id, kind: d.kind || "other", title: d.title.trim(), expires_on: d.expires_on || null, notes: (d.notes || "").trim(),
  }).select().single(), "document");
}
export async function deleteDocument(id) { ok(await supabase.from("vehicle_documents").delete().eq("id", id), "document"); }

// ---- Trips
export async function loadTrips(uid) {
  return ok(await supabase.from("trips").select("*").eq("owner_id", uid).order("ended_at", { ascending: false }).limit(100), "trips");
}
export async function saveTrip(uid, t) {
  return ok(await supabase.from("trips").insert({
    owner_id: uid, vehicle_id: t.vehicle_id || null, origin: (t.origin || "").slice(0, 120), destination: (t.destination || "").slice(0, 120),
    distance_km: Math.round((t.distance_km || 0) * 100) / 100, duration_sec: Math.round(t.duration_sec || 0), alerts: t.alerts || 0,
    real_route: !!t.real_route, completed: !!t.completed,
  }).select().single(), "trip");
}
export async function clearTrips(uid) { ok(await supabase.from("trips").delete().eq("owner_id", uid), "trips"); }

// ---- Fuel log
export async function loadFuel(uid) {
  return ok(await supabase.from("fuel_logs").select("*").eq("owner_id", uid).order("odometer", { ascending: false }).limit(500), "fuel log");
}
export async function addFuel(uid, f, currency) {
  return ok(await supabase.from("fuel_logs").insert({
    owner_id: uid, vehicle_id: f.vehicle_id, filled_on: f.filled_on || todayISO(), odometer: Math.round(Number(f.odometer)),
    amount: Number(f.amount), cost: f.cost === "" || f.cost == null ? null : Number(f.cost), currency, full_tank: f.full_tank !== false,
  }).select().single(), "fill-up");
}
export async function deleteFuel(id) { ok(await supabase.from("fuel_logs").delete().eq("id", id), "fill-up"); }

// Consumption between full tanks, in the driver's units: litres per 100 km, or miles per gallon.
export function fuelStats(logs, unit = "km") {
  const rows = [...logs].sort((a, b) => a.odometer - b.odometer);
  const legs = [];
  let lastFull = null, amountSince = 0;
  for (const r of rows) {
    if (lastFull) amountSince += Number(r.amount);
    if (r.full_tank) {
      if (lastFull && r.odometer > lastFull.odometer && amountSince > 0) {
        const dist = r.odometer - lastFull.odometer;
        legs.push({ at: r.filled_on, dist, amount: amountSince, value: unit === "mi" ? dist / amountSince : (amountSince / dist) * 100 });
      }
      lastFull = r; amountSince = 0;
    }
  }
  const avg = legs.length ? legs.reduce((s, l) => s + l.value, 0) / legs.length : null;
  const last = legs.length ? legs[legs.length - 1].value : null;
  // Worse economy: more litres per 100 km, or fewer miles per gallon.
  const worse = avg != null && legs.length >= 3 && (unit === "mi" ? last < avg * 0.8 : last > avg * 1.2);
  const month = new Date().toISOString().slice(0, 7);
  const spentThisMonth = rows.filter((r) => String(r.filled_on).slice(0, 7) === month).reduce((s, r) => s + (Number(r.cost) || 0), 0);
  const costed = rows.filter((r) => r.cost != null);
  const span = rows.length > 1 ? rows[rows.length - 1].odometer - rows[0].odometer : 0;
  const costPerDist = span > 0 && costed.length > 1 ? costed.slice(1).reduce((s, r) => s + Number(r.cost), 0) / span : null;
  return { legs, avg, last, worse, spentThisMonth, costPerDist, label: unit === "mi" ? "mpg" : "L/100 km" };
}

// ---- Market safety
export async function reportListing(uid, listingId, reason, details = "") {
  const res = await supabase.from("listing_reports").insert({ listing_id: listingId, reporter_id: uid, reason, details: details.slice(0, 500) });
  if (res.error && !/duplicate|unique/i.test(res.error.message)) throw new Error(res.error.message);
}
export async function loadBlocks(uid) { return ok(await supabase.from("user_blocks").select("blocked_id").eq("blocker_id", uid), "blocks").map((b) => b.blocked_id); }
export async function blockUser(uid, other) { const res = await supabase.from("user_blocks").insert({ blocker_id: uid, blocked_id: other }); if (res.error && !/duplicate/i.test(res.error.message)) throw new Error(res.error.message); }
export async function unblockUser(uid, other) { ok(await supabase.from("user_blocks").delete().eq("blocker_id", uid).eq("blocked_id", other), "blocks"); }

// ---- VIN and recalls (NHTSA's free public databases; recalls cover cars sold in the US)
export async function decodeVin(vin) {
  const v = String(vin || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (v.length !== 17) throw new Error("A VIN has 17 letters and numbers (no I, O or Q).");
  const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${v}?format=json`);
  if (!res.ok) throw new Error("Couldn't look up that VIN. Try again.");
  const r = ((await res.json()).Results || [])[0] || {};
  const title = (s) => String(s || "").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  if (!r.Make) throw new Error("That VIN wasn't recognised. Check it, or enter the car's details yourself.");
  return { vin: v, make: title(r.Make), model: String(r.Model || "").trim(), year: r.ModelYear ? Number(r.ModelYear) : "", trim_level: String(r.Trim || "").trim(),
    fuel: /electric/i.test(r.FuelTypePrimary) ? "electric" : /diesel/i.test(r.FuelTypePrimary) ? "diesel" : /hybrid/i.test(r.ElectrificationLevel || "") ? "hybrid" : "petrol" };
}
export async function readVinFromPhoto(uid, file) {
  const path = await uploadPhoto("ai-photos", uid, file);
  const { data, error } = await supabase.functions.invoke("motiq-ai", { body: { mode: "vin", imagePath: path, message: "Read the VIN" } });
  if (error) { let msg = "Couldn't read the VIN. Type it instead."; try { const b = await error.context.json(); if (b && b.error) msg = b.error; } catch (e) {} throw new Error(msg); }
  const vin = String(data.reply || "").toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, "");
  if (vin.length !== 17) throw new Error("Couldn't find a VIN in that photo. Try a closer, sharper shot, or type it.");
  return vin;
}
export async function loadRecalls(car) {
  if (!car.make || !car.model || !car.year) return [];
  const res = await fetch(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${encodeURIComponent(car.make)}&model=${encodeURIComponent(car.model)}&modelYear=${car.year}`);
  if (!res.ok) throw new Error("Couldn't check recalls right now.");
  return ((await res.json()).results || []).map((r) => ({ id: r.NHTSACampaignNumber, component: r.Component, summary: r.Summary, consequence: r.Consequence, remedy: r.Remedy, date: r.ReportReceivedDate }));
}
