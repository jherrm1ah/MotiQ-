// Everyday Motiq: the morning check, fuel prices near you, where you parked, road alerts, your
// driving score, SOS, ride-hailing profit, a mileage log, "is this price fair?", inviting friends
// and the weekly summary.
import React, { useEffect, useMemo, useState } from "react";
import {
  Sun, CloudRain, Fuel, ParkingSquare, MapPin, Navigation, Timer, X, AlertTriangle, Phone, Send, Siren, Plus, Trash2, Loader2,
  TrendingUp, Award, Flame, Share2, Gift, Scale, Bot, Wallet, Check, ThumbsUp, ThumbsDown, CalendarDays,
} from "lucide-react";
import { useTheme, useUI, ACCENT, RED, AMBER, GREEN, Pill, Field, PrimaryButton, SecondaryButton, NeonButton, Skeleton, fmtDist, haversineKm, local, carLabel } from "../design.jsx";
import { money, todayISO } from "../lib/units.js";
import { currentPosition, directionsUrl } from "../lib/geo.js";
import { findPlaces } from "../lib/places.js";
import {
  saveProfile, loadFuelPrices, reportFuelPrice, loadRoadAlerts, reportRoadAlert, voteRoadAlert, ROAD_ALERTS, addEarning, deleteEarning,
  jobPriceStats, myReferralCode, redeemReferral, loadReferrals, healthOf, loadPrivate, savePrivate,
} from "../lib/data.js";
import { todaysWeather, emergencyNumber, streak, badges, weekSummary, scoreColor, scoreWord, updateWidget } from "../lib/daily.js";

const openExternal = (url) => { const w = window.open(url, "_blank", "noopener"); if (!w) window.location.href = url; };
const minsAgo = (ts) => { const m = Math.round((Date.now() - ts) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const lastPos = () => local.get("motiq.lastPos", null);
async function hereNow() { const p = await currentPosition(); local.set("motiq.lastPos", { lat: p.lat, lon: p.lon, at: Date.now() }); return p; }
const FUELS = [["petrol", "Petrol"], ["diesel", "Diesel"], ["premium", "Premium"], ["lpg", "Gas"]];

function Card({ children, label, onClick, style }) {
  const { CARD, BORDER } = useTheme();
  const Tag = onClick ? "button" : "section";
  return <Tag aria-label={label} onClick={onClick} className={`flex flex-col gap-3 p-4 text-left ${onClick ? "active:scale-[0.98] transition-transform" : ""}`} style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}`, ...style }}>{children}</Tag>;
}
function Row({ icon: Icon, color, children, onClick, aria }) {
  const { CARD_ALT, TEXT, SUB } = useTheme();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag type={onClick ? "button" : undefined} aria-label={aria} onClick={onClick} className="flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left" style={{ backgroundColor: CARD_ALT }}>
      <Icon size={15} style={{ color: color || SUB }} className="shrink-0" /><div className="min-w-0 flex-1 text-xs leading-snug" style={{ color: TEXT }}>{children}</div>
    </Tag>
  );
}

// ---------- 1. Today: the morning car check
export function TodayCard() {
  const { me, vehicle, garage, documents, parking, earnings, fuel, openSheet, goTo, trips } = useUI();
  const { TEXT, SUB } = useTheme();
  const [weather, setWeather] = useState(null);
  const [cheapest, setCheapest] = useState(null);
  const pos = lastPos();
  useEffect(() => {
    if (!pos) return;
    todaysWeather(pos).then(setWeather).catch(() => {});
    loadFuelPrices(pos, 10).then((rows) => setCheapest(cheapestBy(rows, me.currency)[0] || null)).catch(() => {});
  }, []);
  const mine = (x) => !vehicle || !x.vehicle_id || x.vehicle_id === vehicle.id;
  const due = garage.reminders.filter((r) => mine(r) && !r.done_at && r.due_on && (new Date(r.due_on) - Date.now()) / 86400000 <= 7);
  const docs = documents.filter((d) => mine(d) && d.expires_on && (new Date(d.expires_on) - Date.now()) / 86400000 <= 14);
  const health = vehicle ? healthOf(vehicle, garage) : null;
  const h = new Date().getHours();
  const hello = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";

  // Keep the Android widget up to date with the same summary.
  useEffect(() => {
    updateWidget({ car: vehicle ? carLabel(vehicle) : "Add your car", health: health != null ? `${health}%` : "—", due: due.length ? `${due.length} due this week` : "Nothing due", fuel: cheapest ? `${money(cheapest.price, cheapest.currency)} ${cheapest.station_name || ""}`.trim() : "", parked: parking ? `Parked ${minsAgo(parking.at)}` : "" });
  }, [vehicle && vehicle.id, health, due.length, cheapest, parking]);

  return (
    <Card label="Today">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: TEXT }}>{hello} — today's check</p>
          <p className="mt-0.5 text-xs" style={{ color: SUB }}>{vehicle ? (due.length || docs.length ? `${carLabel(vehicle)} needs attention soon` : `${carLabel(vehicle)} looks good`) : "Add your car to get a daily check"}</p>
        </div>
        {weather && <div className="flex shrink-0 items-center gap-1 text-xs" style={{ color: TEXT }}>{weather.rain >= 60 ? <CloudRain size={14} /> : <Sun size={14} />}{weather.tempC}°</div>}
      </div>
      <div className="flex flex-col gap-2">
        {due.map((r) => <Row key={r.id} icon={CalendarDays} color={AMBER} onClick={() => goTo("garage")}>{r.title} — due {new Date(r.due_on) < new Date() ? "now" : new Date(r.due_on).toLocaleDateString(undefined, { weekday: "short" })}</Row>)}
        {docs.map((d) => <Row key={d.id} icon={AlertTriangle} color={AMBER} onClick={() => goTo("profile")}>{d.title} expires {new Date(d.expires_on).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Row>)}
        {weather ? <Row icon={weather.rain >= 60 ? CloudRain : Sun}>{weather.text}{weather.rain != null ? ` · ${weather.rain}% rain` : ""}. {weather.tip}</Row>
          : <Row icon={Sun} onClick={async () => { try { const p = await hereNow(); setWeather(await todaysWeather(p)); loadFuelPrices(p, 10).then((rows) => setCheapest(cheapestBy(rows, me.currency)[0] || null)).catch(() => {}); } catch (e) {} }} aria="Show today's weather">Tap to see today's driving weather and fuel prices near you</Row>}
        <Row icon={Fuel} color={cheapest ? GREEN : null} onClick={() => openSheet("Fuel prices near you", <FuelPricesSheet />)} aria="Fuel prices near you">
          {cheapest ? <>Cheapest {cheapest.fuel}: <b>{money(cheapest.price, cheapest.currency)}</b> at {cheapest.station_name || "a station"} · {minsAgo(new Date(cheapest.created_at).getTime())}</> : "Fuel prices near you — see or report one"}
        </Row>
        {parking && <Row icon={ParkingSquare} onClick={() => openSheet("Where you parked", <ParkingSheet />)} aria="Where you parked">Parked {minsAgo(parking.at)}{parking.until ? ` · meter ends ${new Date(parking.until).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : ""}</Row>}
        {me.driver_mode && <DriverToday />}
      </div>
    </Card>
  );
}

// ---------- 2. Fuel prices
const cheapestBy = (rows, currency) => {
  const latest = {};
  for (const r of rows) { if (r.currency !== currency) continue; const k = `${r.station_key}|${r.fuel}`; if (!latest[k]) latest[k] = r; }
  return Object.values(latest).sort((a, b) => a.price - b.price);
};
export function FuelPricesSheet() {
  const { me, uid, fuel, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER } = useTheme();
  const [kind, setKind] = useState("petrol");
  const [state, setState] = useState({ loading: true });
  const [reporting, setReporting] = useState(null);
  const load = async () => {
    try {
      const at = await hereNow();
      const [stations, prices] = await Promise.all([findPlaces(at, { category: "Fuel", radiusKm: 8 }).catch(() => []), loadFuelPrices(at, 12)]);
      setState({ at, stations, prices });
    } catch (e) { setState({ error: e.message }); }
  };
  useEffect(() => { load(); }, []);
  if (state.loading) return <Skeleton rows={3} height={56} radius={16} />;
  if (state.error) return <p className="text-sm" style={{ color: SUB }}>{state.error}</p>;
  const list = cheapestBy(state.prices, me.currency).filter((r) => r.fuel === kind);
  const avg = list.length ? list.reduce((s, r) => s + Number(r.price), 0) / list.length : 0;
  const fill = fuel.length ? fuel.slice(0, 6).reduce((s, f) => s + Number(f.amount || 0), 0) / Math.min(6, fuel.length) : 40;
  const save = list.length >= 2 ? (avg - list[0].price) * fill : 0;
  const priced = new Set(list.map((r) => r.station_key));
  const send = async (station, price) => {
    try {
      const row = await reportFuelPrice(uid, { station_key: String(station.id), station_name: station.name, lat: station.lat, lon: station.lon, country: me.country, fuel: kind, price, currency: me.currency });
      setState((s) => ({ ...s, prices: [row, ...s.prices] })); setReporting(null); showToast("Thanks — price shared with drivers near you");
    } catch (e) { showToast(e.message); }
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">{FUELS.map(([k, l]) => <Pill key={k} small active={kind === k} onClick={() => setKind(k)}>{l}</Pill>)}</div>
      {save > 0 && <div className="rounded-2xl p-3 text-sm" style={{ backgroundColor: "rgba(61,220,132,0.12)", color: TEXT }}>Filling up at <b>{list[0].station_name || "the cheapest station"}</b> saves you about <b>{money(save, me.currency)}</b> on a {Math.round(fill)} L fill-up.</div>}
      {list.length === 0 && <p className="text-sm" style={{ color: SUB }}>No {kind} prices reported nearby in the last 2 weeks. Be the first — tap a station below.</p>}
      {list.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-2 rounded-2xl px-3 py-2.5" style={{ backgroundColor: CARD_ALT }}>
          <div className="min-w-0"><p className="truncate text-sm font-medium" style={{ color: TEXT }}>{r.station_name || "Fuel station"}</p><p className="text-[11px]" style={{ color: SUB }}>{fmtDist(haversineKm(state.at, r), me.distance_unit)} · {minsAgo(new Date(r.created_at).getTime())}</p></div>
          <div className="flex items-center gap-2"><span className="font-bold" style={{ color: r === list[0] ? GREEN : TEXT }}>{money(r.price, r.currency)}</span><button aria-label={`Directions to ${r.station_name}`} onClick={() => openExternal(directionsUrl(r.lat, r.lon))}><Navigation size={15} style={{ color: SUB }} /></button></div>
        </div>
      ))}
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Report a price</p>
      {state.stations.slice(0, 12).map((st) => (
        <div key={st.id} className="rounded-2xl px-3 py-2.5" style={{ border: `1px solid ${BORDER}` }}>
          <button className="flex w-full items-center justify-between text-left" onClick={() => setReporting(reporting === st.id ? null : st.id)}>
            <span className="truncate text-sm" style={{ color: TEXT }}>{st.name || "Fuel station"} <span style={{ color: SUB }}>· {fmtDist(st.km, me.distance_unit)}</span></span>
            <span className="text-xs font-medium" style={{ color: SUB }}>{priced.has(String(st.id)) ? "Update" : "Add price"}</span>
          </button>
          {reporting === st.id && <PriceInput currency={me.currency} onSend={(p) => send(st, p)} />}
        </div>
      ))}
      {state.stations.length === 0 && <p className="text-xs" style={{ color: SUB }}>No fuel stations found within 8 km on the map.</p>}
    </div>
  );
}
function PriceInput({ currency, onSend }) {
  const [v, setV] = useState("");
  return (
    <div className="mt-2 flex items-end gap-2">
      <div className="flex-1"><Field label={`Price per litre (${currency})`} inputMode="decimal" value={v} onChange={(e) => setV(e.target.value.replace(/[^0-9.]/g, ""))} /></div>
      <PrimaryButton className="px-4" disabled={!(Number(v) > 0)} onClick={() => onSend(Number(v))}>Share</PrimaryButton>
    </div>
  );
}

// ---------- 3. Where did I park
export function ParkingSheet() {
  const { parking, setParking, showToast, vehicle } = useUI();
  const { TEXT, SUB } = useTheme();
  const [busy, setBusy] = useState(false);
  const [dist, setDist] = useState(null);
  useEffect(() => { if (parking) currentPosition({ timeout: 6000 }).then((p) => setDist(haversineKm(p, parking))).catch(() => {}); }, [parking]);
  const saveHere = async () => { setBusy(true); try { const p = await hereNow(); setParking({ lat: p.lat, lon: p.lon, at: Date.now(), vehicleId: vehicle && vehicle.id, until: null }); showToast("Parking spot saved"); } catch (e) { showToast(e.message); } setBusy(false); };
  const setTimer = async (mins) => {
    const until = Date.now() + mins * 60000;
    setParking({ ...parking, until });
    try {
      if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
        const { LocalNotifications } = await import("@capacitor/local-notifications");
        await LocalNotifications.schedule({ notifications: [{ id: 777001, title: "Parking ends in 10 minutes", body: "Head back to your car or top up the meter.", schedule: { at: new Date(until - 10 * 60000), allowWhileIdle: true }, smallIcon: "ic_stat_motiq", iconColor: "#212121" }] });
      }
    } catch (e) {}
    showToast(`We'll remind you 10 minutes before (${new Date(until).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })})`);
  };
  if (!parking) return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: SUB }}>Motiq saves where you parked when a trip ends. You can also save it now.</p>
      <PrimaryButton onClick={saveHere} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ParkingSquare size={15} />} Save my parking spot here</PrimaryButton>
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: TEXT }}>Parked {minsAgo(parking.at)}{dist != null ? ` · ${dist < 1 ? `${Math.round(dist * 1000)} m` : `${dist.toFixed(1)} km`} from you` : ""}</p>
      <PrimaryButton onClick={() => openExternal(`https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${parking.lat},${parking.lon}`)}><Navigation size={15} /> Walk me to my car</PrimaryButton>
      <div>
        <p className="mb-2 text-xs" style={{ color: SUB }}>{parking.until ? `Meter ends at ${new Date(parking.until).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "Parking meter timer"}</p>
        <div className="flex gap-2">{[[30, "30 min"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"]].map(([m, l]) => <Pill key={m} small onClick={() => setTimer(m)}>{l}</Pill>)}</div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SecondaryButton onClick={saveHere}><MapPin size={14} /> Update to here</SecondaryButton>
        <SecondaryButton color={RED} onClick={() => setParking(null)}><X size={14} /> Clear</SecondaryButton>
      </div>
    </div>
  );
}

// ---------- 4. Road alerts
export function ReportRoadSheet({ onDone }) {
  const { uid, showToast, trip } = useUI();
  const { SUB } = useTheme();
  const [kind, setKind] = useState("pothole");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try { const p = trip && trip.pos ? trip.pos : await hereNow(); await reportRoadAlert(uid, { kind, lat: p.lat, lon: p.lon, note }); showToast("Thanks — drivers near you will be warned"); onDone && onDone(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2">{ROAD_ALERTS.map(([k, l]) => <Pill key={k} active={kind === k} onClick={() => setKind(k)}>{l}</Pill>)}</div>
      <Field label="Note (optional)" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. left lane, big pothole after the bridge" />
      <p className="text-[11px]" style={{ color: SUB }}>Marked where you are now. Only report when it's safe — let a passenger do it if you're driving.</p>
      <PrimaryButton onClick={send} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <AlertTriangle size={15} />} Report</PrimaryButton>
    </div>
  );
}
export function RoadAlertsSheet() {
  const { uid, me, showToast, openSheet, closeSheet } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const [state, setState] = useState(null);
  const load = async () => { try { const at = await hereNow(); setState({ at, list: await loadRoadAlerts(at, 15) }); } catch (e) { setState({ error: e.message }); } };
  useEffect(() => { load(); }, []);
  const vote = async (a, still) => { try { await voteRoadAlert(a.id, still); showToast(still ? "Thanks — still there" : "Thanks — marked as gone"); load(); } catch (e) { showToast(e.message); } };
  return (
    <div className="flex flex-col gap-3">
      <NeonButton className="rounded-2xl py-3.5 text-sm" onClick={() => openSheet("Report a road problem", <ReportRoadSheet onDone={closeSheet} />)}><Plus size={15} /> Report a road problem</NeonButton>
      {!state ? <Skeleton rows={3} height={56} radius={16} /> : state.error ? <p className="text-sm" style={{ color: SUB }}>{state.error}</p> : state.list.length === 0 ? <p className="text-sm" style={{ color: SUB }}>No road problems reported within 15 km. Drive safe!</p> : state.list.map((a) => (
        <div key={a.id} className="flex items-center gap-3 rounded-2xl px-3 py-2.5" style={{ backgroundColor: CARD_ALT }}>
          <AlertTriangle size={15} style={{ color: a.kind === "accident" || a.kind === "flood" ? RED : AMBER }} className="shrink-0" />
          <div className="min-w-0 flex-1"><p className="text-sm font-medium" style={{ color: TEXT }}>{(ROAD_ALERTS.find((k) => k[0] === a.kind) || [0, "Hazard"])[1]}{a.note ? ` — ${a.note}` : ""}</p><p className="text-[11px]" style={{ color: SUB }}>{fmtDist(haversineKm(state.at, a), me.distance_unit)} · {minsAgo(new Date(a.created_at).getTime())}{a.still_there ? ` · ${a.still_there} confirmed` : ""}</p></div>
          {a.reporter_id !== uid && <><button aria-label="Still there" onClick={() => vote(a, true)}><ThumbsUp size={15} style={{ color: SUB }} /></button><button aria-label="Gone" onClick={() => vote(a, false)}><ThumbsDown size={15} style={{ color: SUB }} /></button></>}
        </div>
      ))}
    </div>
  );
}

// ---------- 5. Driving score
export function ScoreCard() {
  const { trips, openSheet } = useUI();
  const { TEXT, SUB } = useTheme();
  const week = trips.filter((t) => t.score != null && Date.now() - new Date(t.ended_at).getTime() < 7 * 86400000);
  const avg = week.length ? Math.round(week.reduce((s, t) => s + t.score, 0) / week.length) : null;
  const st = streak(trips);
  if (!trips.some((t) => t.score != null)) return null;
  return (
    <Card label="Driving score" onClick={() => openSheet("Your driving", <ScoreSheet />)}>
      <div className="flex items-center gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-lg font-bold" style={{ border: `4px solid ${scoreColor(avg) || SUB}`, color: TEXT }}>{avg ?? "—"}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: TEXT }}>Driving score · {scoreWord(avg)}</p>
          <p className="mt-0.5 text-xs" style={{ color: SUB }}>{week.length} scored trip{week.length === 1 ? "" : "s"} this week{st ? ` · 🔥 ${st}-day streak` : ""}</p>
        </div>
        <TrendingUp size={16} style={{ color: SUB }} />
      </div>
    </Card>
  );
}
export function ScoreSheet() {
  const { trips } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const scored = trips.filter((t) => t.score != null).slice(0, 20);
  const brakes = scored.reduce((s, t) => s + (t.hard_brakes || 0), 0);
  const speeding = Math.round(scored.reduce((s, t) => s + (t.speeding_sec || 0), 0) / 60);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Streak", `${streak(trips)} d`, Flame], ["Hard brakes", brakes, AlertTriangle], ["Over 110", `${speeding} min`, Timer]].map(([l, v, Icon]) => (
          <div key={l} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}><Icon size={14} style={{ color: SUB, margin: "0 auto" }} /><p className="mt-1 font-bold" style={{ color: TEXT }}>{v}</p><p className="text-[10px]" style={{ color: SUB }}>{l} (last 20)</p></div>
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Badges</p>
        <div className="flex flex-wrap gap-2">{badges(trips).map(([b, got]) => <span key={b} className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: got ? "rgba(239,255,0,0.14)" : CARD_ALT, color: got ? TEXT : SUB, opacity: got ? 1 : 0.6 }}><Award size={12} /> {b}</span>)}</div>
      </div>
      <div className="flex h-16 items-end gap-1" aria-label="Recent trip scores">{[...scored].reverse().map((t) => <div key={t.id} className="flex-1 rounded-sm" style={{ height: `${Math.max(6, t.score * 0.6)}px`, backgroundColor: scoreColor(t.score) }} title={`${t.score}`} />)}</div>
      <p className="text-[11px] leading-relaxed" style={{ color: SUB }}>Each trip starts at 100. Harsh braking and time above 110 km/h take points off, measured with your phone's GPS. Smooth, steady driving saves fuel and brakes.</p>
    </div>
  );
}

// ---------- 6. SOS
export function SosButton({ big }) {
  const { openSheet } = useUI();
  return <button onClick={() => openSheet("SOS", <SosSheet />)} aria-label="SOS emergency" className={`flex items-center justify-center gap-1.5 rounded-full font-bold ${big ? "px-5 py-3 text-sm" : "h-10 px-3 text-xs"}`} style={{ backgroundColor: RED, color: "#fff" }}><Siren size={big ? 16 : 14} /> SOS</button>;
}
export function SosSheet() {
  const { me, setMe, showToast, goTo, closeSheet } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER } = useTheme();
  const [priv, setPriv] = useState(null);
  useEffect(() => { loadPrivate(me.id).then(setPriv).catch(() => setPriv({ sos_contacts: [] })); }, []);
  const contacts = priv && Array.isArray(priv.sos_contacts) ? priv.sos_contacts : [];
  const [pos, setPos] = useState(null);
  const [adding, setAdding] = useState(false);
  const [c, setC] = useState({ name: "", phone: "" });
  useEffect(() => { hereNow().then(setPos).catch(() => setPos(lastPos())); }, []);
  const mapLink = pos ? `https://maps.google.com/?q=${pos.lat.toFixed(5)},${pos.lon.toFixed(5)}` : "";
  const text = `I need help. I'm here: ${mapLink} (sent from Motiq)`;
  const num = emergencyNumber(me.country);
  const sendSms = () => {
    if (!contacts.length) return setAdding(true);
    const to = contacts.map((x) => x.phone.replace(/[^\d+]/g, "")).join(",");
    window.location.href = `sms:${to}?body=${encodeURIComponent(text)}`;
  };
  const share = async () => { try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); showToast("Copied — paste it to someone"); } } catch (e) {} };
  const saveContacts = async (list) => { try { setPriv(await savePrivate(me.id, { sos_contacts: list })); } catch (e) { showToast(/profile_private/.test(e.message) ? "SOS contacts need one more setup step in the database." : e.message); } };
  return (
    <div className="flex flex-col gap-3">
      <a href={`tel:${num}`} className="flex items-center justify-center gap-2 rounded-2xl py-4 text-base font-bold" style={{ backgroundColor: RED, color: "#fff" }}><Phone size={18} /> Call emergency ({num})</a>
      <PrimaryButton onClick={sendSms} disabled={!pos}><Send size={15} /> {contacts.length ? `Text my location to ${contacts.length === 1 ? contacts[0].name : `${contacts.length} people`}` : "Text my location to family"}</PrimaryButton>
      <SecondaryButton onClick={share} disabled={!pos}><Share2 size={14} /> Share my location another way</SecondaryButton>
      <SecondaryButton onClick={() => { closeSheet(); goTo("market", { filter: "Mechanics" }); }}><MapPin size={14} /> Nearest mechanics and help</SecondaryButton>
      {!pos && <p className="text-xs" style={{ color: SUB }}>Finding your location…</p>}
      <div className="mt-2">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Emergency contacts</p>
        {contacts.map((x, i) => (
          <div key={i} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="text-sm" style={{ color: TEXT }}>{x.name} <span style={{ color: SUB }}>{x.phone}</span></span>
            <button aria-label={`Remove ${x.name}`} onClick={() => saveContacts(contacts.filter((_, j) => j !== i))}><Trash2 size={14} style={{ color: RED }} /></button>
          </div>
        ))}
        {adding ? (
          <div className="mt-2 flex flex-col gap-2 rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
            <Field label="Name" value={c.name} maxLength={40} onChange={(e) => setC({ ...c, name: e.target.value })} />
            <Field label="Phone" type="tel" value={c.phone} maxLength={20} onChange={(e) => setC({ ...c, phone: e.target.value })} />
            <PrimaryButton disabled={!c.name.trim() || c.phone.replace(/\D/g, "").length < 6} onClick={async () => { await saveContacts([...contacts, { name: c.name.trim(), phone: c.phone.trim() }].slice(0, 5)); setC({ name: "", phone: "" }); setAdding(false); }}>Save contact</PrimaryButton>
          </div>
        ) : contacts.length < 5 && <button onClick={() => setAdding(true)} className="mt-2 flex items-center gap-1.5 text-xs font-medium" style={{ color: TEXT }}><Plus size={13} /> Add a contact</button>}
      </div>
    </div>
  );
}

// ---------- 7. Ride-hailing driver mode
const PLATFORMS = ["Uber", "Bolt", "inDrive", "Other"];
function weekBounds() { const s = new Date(); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); return s; }
function profitFor({ earnings, fuel, services, from, to, currency }) {
  const inR = (iso) => { const t = new Date(`${String(iso).slice(0, 10)}T12:00:00`).getTime(); return t >= from.getTime() && t < to.getTime(); };
  const earned = earnings.filter((e) => e.currency === currency && inR(e.earned_on)).reduce((s, e) => s + Number(e.amount), 0);
  const fuelCost = fuel.filter((f) => f.cost != null && f.currency === currency && inR(f.filled_on)).reduce((s, f) => s + Number(f.cost), 0);
  const repairs = services.filter((x) => x.cost != null && x.currency === currency && inR(x.done_on)).reduce((s, x) => s + Number(x.cost), 0);
  return { earned, fuelCost, repairs, profit: earned - fuelCost - repairs };
}
function DriverToday() {
  const { me, earnings, fuel, garage, openSheet } = useUI();
  const from = new Date(); from.setHours(0, 0, 0, 0); const to = new Date(from.getTime() + 86400000);
  const p = profitFor({ earnings, fuel, services: garage.services, from, to, currency: me.currency });
  return <Row icon={Wallet} color={p.profit >= 0 ? GREEN : RED} onClick={() => openSheet("Driver earnings", <EarningsSheet />)} aria="Today's profit">Today's profit: <b>{money(p.profit, me.currency)}</b> ({money(p.earned, me.currency)} earned − {money(p.fuelCost + p.repairs, me.currency)} costs)</Row>;
}
export function EarningsSheet() {
  const { me, uid, earnings, setEarnings, fuel, garage, trips, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER } = useTheme();
  const [e, setE] = useState({ platform: "Uber", amount: "", rides: "", earned_on: todayISO() });
  const [busy, setBusy] = useState(false);
  const from = weekBounds(); const to = new Date(from.getTime() + 7 * 86400000);
  const p = profitFor({ earnings, fuel, services: garage.services, from, to, currency: me.currency });
  const km = trips.filter((t) => new Date(t.ended_at) >= from && t.purpose === "work").reduce((s, t) => s + Number(t.distance_km || 0), 0);
  const add = async () => {
    setBusy(true);
    try { const row = await addEarning(uid, { ...e, currency: me.currency }); setEarnings([row, ...earnings]); setE({ ...e, amount: "", rides: "" }); showToast("Earnings added"); }
    catch (err) { showToast(/driver_earnings/.test(err.message) ? "Driver mode needs one more setup step in the database." : err.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Earned", p.earned], ["Fuel + repairs", p.fuelCost + p.repairs], ["Profit", p.profit]].map(([l, v]) => <div key={l} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}><p className="text-sm font-bold" style={{ color: l === "Profit" ? (v >= 0 ? GREEN : RED) : TEXT }}>{money(v, me.currency)}</p><p className="text-[10px]" style={{ color: SUB }}>{l} this week</p></div>)}
      </div>
      {km > 0 && <p className="text-xs" style={{ color: SUB }}>{fmtDist(km, me.distance_unit)} of work trips this week · {money(p.profit / km, me.currency)} profit per km</p>}
      <div className="flex flex-col gap-2 rounded-2xl p-3" style={{ border: `1px solid ${BORDER}` }}>
        <div className="flex gap-2">{PLATFORMS.map((x) => <Pill key={x} small active={e.platform === x} onClick={() => setE({ ...e, platform: x })}>{x}</Pill>)}</div>
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Earned (${me.currency})`} inputMode="decimal" value={e.amount} onChange={(x) => setE({ ...e, amount: x.target.value.replace(/[^0-9.]/g, "") })} />
          <Field label="Rides" inputMode="numeric" value={e.rides} onChange={(x) => setE({ ...e, rides: x.target.value.replace(/\D/g, "") })} />
        </div>
        <Field label="Day" type="date" value={e.earned_on} max={todayISO()} onChange={(x) => setE({ ...e, earned_on: x.target.value })} />
        <PrimaryButton onClick={add} disabled={busy || !(Number(e.amount) > 0)}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add earnings</PrimaryButton>
      </div>
      {earnings.slice(0, 15).map((x) => (
        <div key={x.id} className="flex items-center justify-between py-1.5 text-sm">
          <span style={{ color: TEXT }}>{x.earned_on} · {x.platform}{x.rides ? ` · ${x.rides} rides` : ""}</span>
          <span className="flex items-center gap-2"><span className="font-mono" style={{ color: TEXT }}>{money(x.amount, x.currency)}</span><button aria-label="Delete" onClick={async () => { try { await deleteEarning(x.id); setEarnings(earnings.filter((y) => y.id !== x.id)); } catch (err) { showToast(err.message); } }}><Trash2 size={13} style={{ color: SUB }} /></button></span>
        </div>
      ))}
      <p className="text-[11px]" style={{ color: SUB }}>Costs are your fill-ups and services logged in Motiq. Mark trips as Work in Trip history to see profit per km.</p>
    </div>
  );
}

// ---------- 9. Is this price fair?
export function FairPriceSheet({ initial = "" }) {
  const { me, goTo, closeSheet, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const [job, setJob] = useState(initial);
  const [price, setPrice] = useState("");
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const check = async () => {
    setBusy(true);
    try { setRes(await jobPriceStats(job, me.country, me.currency)); } catch (e) { showToast(/job_price_stats/.test(e.message) ? "Price checks need one more setup step in the database." : e.message); }
    setBusy(false);
  };
  const quoted = Number(price) || null;
  const verdict = res && res.count >= 3 && quoted ? (quoted <= res.high * 1.05 ? (quoted < res.low * 0.8 ? ["Very cheap — check what's included", AMBER] : ["Fair price", GREEN]) : quoted <= res.high * 1.3 ? ["A bit high", AMBER] : ["Much higher than usual", RED]) : null;
  return (
    <div className="flex flex-col gap-4">
      <Field as="textarea" rows={2} label="What's the job?" value={job} onChange={(e) => setJob(e.target.value)} placeholder="e.g. replace front brake pads" />
      <Field label={`Price you were quoted (${me.currency}, optional)`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} />
      <PrimaryButton onClick={check} disabled={busy || job.trim().length < 4}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Scale size={15} />} Check the price</PrimaryButton>
      {res && (res.count >= 3 ? (
        <div className="rounded-2xl p-4" style={{ backgroundColor: CARD_ALT }}>
          {verdict && <p className="mb-2 text-base font-bold" style={{ color: verdict[1] }}>{verdict[0]}</p>}
          <p className="text-sm" style={{ color: TEXT }}>Mechanics on Motiq usually quote <b>{money(res.low, me.currency)} – {money(res.high, me.currency)}</b> for similar jobs (middle: {money(res.median, me.currency)}).</p>
          <p className="mt-1 text-[11px]" style={{ color: SUB }}>From {res.count} quotes in your country in the last 18 months.</p>
        </div>
      ) : <p className="text-sm" style={{ color: SUB }}>Not enough quotes for jobs like this yet in your country. Ask the AI mechanic for a typical price range instead.</p>)}
      <SecondaryButton onClick={() => { closeSheet(); goTo("ai", { ask: `Is ${quoted ? money(quoted, me.currency) : "this price"} fair for: ${job.trim() || "this repair"}? What should it usually cost where I live, and what should be included?` }); }}><Bot size={14} /> Ask the AI mechanic</SecondaryButton>
    </div>
  );
}

// ---------- 11. Invite friends
export function InviteSheet() {
  const { me, uid, showToast, reload } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const [code, setCode] = useState(me.referral_code || null);
  const [count, setCount] = useState(null);
  const [theirs, setTheirs] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!code) myReferralCode().then(setCode).catch((e) => showToast(/my_referral_code/.test(e.message) ? "Invites need one more setup step in the database." : e.message));
    loadReferrals(uid).then((r) => setCount(r.length)).catch(() => setCount(0));
  }, []);
  const newDriver = me.created_at && Date.now() - new Date(me.created_at).getTime() < 14 * 86400000;
  const share = async () => {
    const site = window.location.origin.startsWith("http") ? window.location.origin : (import.meta.env.VITE_PUBLIC_SITE_URL || "");
    const text = `I use Motiq to look after my car — AI mechanic, fault codes, fuel prices and more. Join with my code ${code} and I get a free month of Pro${site ? `: ${site}` : "."}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(text); showToast("Invite copied"); } } catch (e) {}
  };
  const redeem = async () => {
    setBusy(true);
    try { const name = await redeemReferral(theirs); showToast(`Thanks! ${name} gets a free month of Pro.`); setTheirs(""); reload(); } catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 rounded-2xl p-5 text-center" style={{ backgroundColor: CARD_ALT }}>
        <Gift size={22} style={{ color: TEXT }} />
        <p className="text-sm" style={{ color: TEXT }}>Get <b>1 free month of Motiq Pro</b> for every friend who joins with your code (up to 12 months).</p>
        <p className="font-mono text-2xl font-bold tracking-[0.25em]" style={{ color: TEXT }} aria-label="Your invite code">{code || "······"}</p>
        {count != null && <p className="text-xs" style={{ color: SUB }}>{count} friend{count === 1 ? "" : "s"} joined so far</p>}
      </div>
      <NeonButton className="rounded-2xl py-3.5 text-sm" onClick={share} disabled={!code}><Share2 size={15} /> Invite friends</NeonButton>
      {newDriver && (
        <div className="flex items-end gap-2">
          <div className="flex-1"><Field label="Got a friend's code?" value={theirs} onChange={(e) => setTheirs(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} /></div>
          <PrimaryButton className="px-4" disabled={busy || theirs.length !== 6} onClick={redeem}>Use</PrimaryButton>
        </div>
      )}
    </div>
  );
}

// ---------- 12. Weekly summary
export function WeeklyCard({ force }) {
  const { trips, garage, fuel, me, openSheet } = useUI();
  const { TEXT, SUB } = useTheme();
  const dow = new Date().getDay();
  const s = useMemo(() => weekSummary({ trips, services: garage.services, fuel, reminders: garage.reminders }), [trips, garage, fuel]);
  if (!force && dow !== 0 && dow !== 1) return null;
  if (!s.trips && !s.spent) return null;
  return (
    <Card label="Your week" onClick={() => openSheet("Your week", <WeeklySheet />)}>
      <p className="text-sm font-semibold" style={{ color: TEXT }}>Your week · {s.start.toLocaleDateString(undefined, { month: "short", day: "numeric" })}–{new Date(s.stop - 86400000).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p>
      <p className="text-xs" style={{ color: SUB }}>{fmtDist(s.km, me.distance_unit, 0)} · {s.trips} trip{s.trips === 1 ? "" : "s"} · {money(s.spent, me.currency)} spent{s.score != null ? ` · score ${s.score}` : ""}</p>
    </Card>
  );
}
export function WeeklySheet() {
  const { trips, garage, fuel, me } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const s = weekSummary({ trips, services: garage.services, fuel, reminders: garage.reminders });
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {[["Distance", fmtDist(s.km, me.distance_unit, 0)], ["Time driving", `${Math.floor(s.minutes / 60)} h ${s.minutes % 60} m`], ["Spent", money(s.spent, me.currency)], ["Driving score", s.score != null ? `${s.score} · ${scoreWord(s.score)}` : "—"]].map(([l, v]) => (
          <div key={l} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}><p className="text-base font-bold" style={{ color: TEXT }}>{v}</p><p className="text-[11px]" style={{ color: SUB }}>{l}</p></div>
        ))}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Coming up next week</p>
      {s.comingUp.length ? s.comingUp.map((r) => <p key={r.id} className="flex items-center gap-2 text-sm" style={{ color: TEXT }}><Check size={13} style={{ color: AMBER }} /> {r.title} — {new Date(r.due_on).toLocaleDateString(undefined, { weekday: "long" })}</p>) : <p className="text-sm" style={{ color: SUB }}>Nothing due. Enjoy the drive!</p>}
    </div>
  );
}

// Home shortcuts for the everyday tools.
export function DailyTools() {
  const { openSheet } = useUI();
  const { CARD, BORDER, TEXT } = useTheme();
  const tools = [
    [Fuel, "Fuel prices", () => openSheet("Fuel prices near you", <FuelPricesSheet />)],
    [AlertTriangle, "Road alerts", () => openSheet("Road alerts near you", <RoadAlertsSheet />)],
    [ParkingSquare, "My parking", () => openSheet("Where you parked", <ParkingSheet />)],
    [Scale, "Fair price?", () => openSheet("Is this price fair?", <FairPriceSheet />)],
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {tools.map(([Icon, label, go]) => (
        <button key={label} onClick={go} className="flex flex-col items-center gap-1.5 rounded-2xl py-3 active:scale-95 transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <Icon size={17} style={{ color: TEXT }} /><span className="text-[10px] font-medium" style={{ color: TEXT }}>{label}</span>
        </button>
      ))}
    </div>
  );
}
