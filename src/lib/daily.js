// Everyday driving helpers: trip score, driving streaks and badges, the morning check, the weekly
// summary, emergency numbers, weather (Open-Meteo, free, no key) and the Android widget.
export const SPEEDING_KMH = 110; // GPS can't know the speed limit, so "speeding" means over 110 km/h.

// 100 for a calm trip; harsh braking and time over 110 km/h take points off.
export function tripScore(t) {
  const mins = Math.max(1, (t.elapsedSec || 0) / 60);
  const brakesPer10 = ((t.hardBrakes || 0) / mins) * 10;
  const speedingShare = (t.speedingSec || 0) / Math.max(60, t.elapsedSec || 0);
  const h = new Date().getHours();
  const night = h >= 22 || h < 5;
  const score = Math.round(Math.max(0, Math.min(100, 100 - brakesPer10 * 12 - speedingShare * 60 - (night ? 3 : 0))));
  return { score, hard_brakes: t.hardBrakes || 0, speeding_sec: Math.round(t.speedingSec || 0), night };
}
export const scoreColor = (s) => (s == null ? null : s >= 85 ? "#3DDC84" : s >= 65 ? "#F5B944" : "#FF5A5F");
export const scoreWord = (s) => (s == null ? "—" : s >= 90 ? "Excellent" : s >= 80 ? "Smooth" : s >= 65 ? "OK" : "Needs care");

const dayKey = (d) => { const x = new Date(d); return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`; };
// Days in a row (ending today or yesterday) with at least one trip scoring 80+.
export function streak(trips) {
  const good = new Set(trips.filter((t) => t.score != null && t.score >= 80).map((t) => dayKey(t.ended_at)));
  let n = 0; const d = new Date();
  if (!good.has(dayKey(d))) d.setDate(d.getDate() - 1);
  while (good.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
export function badges(trips) {
  const scored = trips.filter((t) => t.score != null);
  const km = trips.reduce((s, t) => s + Number(t.distance_km || 0), 0);
  return [
    ["First trip", trips.length >= 1],
    ["100 km", km >= 100],
    ["1,000 km", km >= 1000],
    ["Smooth 10", scored.filter((t) => t.score >= 90).length >= 10],
    ["7-day streak", streak(trips) >= 7],
    ["Night owl", trips.some((t) => t.night)],
  ];
}

// Monday–Sunday totals for the week that contains `ref` (default: the week just finished on Sunday).
export function weekSummary({ trips, services, fuel, reminders, ref = new Date() }) {
  const end = new Date(ref); end.setHours(0, 0, 0, 0);
  const dow = (end.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(end); start.setDate(end.getDate() - dow - (dow === 6 ? 0 : 7));
  const stop = new Date(start); stop.setDate(start.getDate() + 7);
  const inWeek = (iso) => { const t = new Date(iso).getTime(); return t >= start.getTime() && t < stop.getTime(); };
  const wk = trips.filter((t) => inWeek(t.ended_at));
  const scored = wk.filter((t) => t.score != null);
  const spent = [...services.filter((s) => s.cost != null && inWeek(`${s.done_on}T12:00:00`)).map((s) => Number(s.cost)), ...fuel.filter((f) => f.cost != null && inWeek(`${f.filled_on}T12:00:00`)).map((f) => Number(f.cost))].reduce((a, b) => a + b, 0);
  const soon = reminders.filter((r) => !r.done_at && r.due_on && new Date(r.due_on) >= stop && new Date(r.due_on) < new Date(stop.getTime() + 7 * 86400000));
  return {
    start, stop, trips: wk.length, km: wk.reduce((s, t) => s + Number(t.distance_km || 0), 0), minutes: Math.round(wk.reduce((s, t) => s + (t.duration_sec || 0), 0) / 60),
    score: scored.length ? Math.round(scored.reduce((s, t) => s + t.score, 0) / scored.length) : null, spent, comingUp: soon,
  };
}

// Emergency numbers for the countries Motiq is used in most; 112 works on most mobile networks.
const EMERGENCY = { US: "911", CA: "911", MX: "911", NG: "112", GH: "112", KE: "999", ZA: "10111", EG: "122", MA: "19", GB: "999", IE: "112", AU: "000", NZ: "111", IN: "112", BR: "190", AR: "911", PH: "911", AE: "999", SA: "911" };
export const emergencyNumber = (country) => EMERGENCY[country] || "112";

// Today's driving weather where you are. Cached for an hour.
const WMO = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Cloudy", 45: "Fog", 48: "Fog", 51: "Drizzle", 53: "Drizzle", 55: "Drizzle", 61: "Rain", 63: "Rain", 65: "Heavy rain", 71: "Snow", 73: "Snow", 75: "Heavy snow", 80: "Showers", 81: "Showers", 82: "Heavy showers", 95: "Thunderstorms", 96: "Thunderstorms", 99: "Thunderstorms" };
let weatherCache = null;
export async function todaysWeather(at) {
  if (weatherCache && Date.now() - weatherCache.at < 3600000 && Math.abs(weatherCache.lat - at.lat) < 0.1) return weatherCache.w;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${at.lat.toFixed(3)}&longitude=${at.lon.toFixed(3)}&current=temperature_2m,weather_code&daily=precipitation_probability_max,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("weather");
  const j = await r.json();
  const code = j.current && j.current.weather_code;
  const rain = j.daily && j.daily.precipitation_probability_max ? j.daily.precipitation_probability_max[0] : null;
  const w = { tempC: j.current ? Math.round(j.current.temperature_2m) : null, text: WMO[code] || "—", rain, code,
    tip: code >= 95 ? "Storms today — slow down and keep your lights on." : code === 45 || code === 48 ? "Fog — use dipped headlights and leave more space." : (rain != null && rain >= 60) || (code >= 61 && code <= 82) ? "Rain likely — check your wipers and tyres, and brake earlier." : code >= 71 && code <= 75 ? "Snow — drive gently and leave extra time." : "Good driving weather. A good day to wash the car." };
  weatherCache = { at: Date.now(), lat: at.lat, w };
  return w;
}

// The Android widget reads a small summary the app saves (Capacitor Preferences →
// SharedPreferences "CapacitorStorage", key "motiq.widget") and refreshes itself.
export async function updateWidget(summary) {
  if (!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: "motiq.widget", value: JSON.stringify(summary) });
    const W = window.Capacitor.Plugins && window.Capacitor.Plugins.MotiqWidget;
    if (W && W.refresh) await W.refresh();
  } catch (e) { /* the widget is a nice-to-have */ }
}
