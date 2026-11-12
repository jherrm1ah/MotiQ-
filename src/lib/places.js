// Real places near the driver (mechanics, parts, tyres, car washes, fuel…) from OpenStreetMap,
// through the free Overpass API. Works worldwide; no key needed. Ratings don't exist in
// OpenStreetMap, so places are sorted by distance and show their real hours and phone.
import { haversineKm } from "../design.jsx";

export const PLACE_CATEGORIES = [
  { key: "Mechanics", query: ['nwr["shop"="car_repair"]'] },
  { key: "Auto parts", query: ['nwr["shop"="car_parts"]'] },
  { key: "Tyres", query: ['nwr["shop"="tyres"]'] },
  { key: "Batteries", query: ['nwr["shop"="batteries"]'] },
  { key: "Car wash", query: ['nwr["amenity"="car_wash"]'] },
  { key: "Service centres", query: ['nwr["shop"="car"]', 'nwr["amenity"="vehicle_inspection"]'] },
  { key: "Fuel", query: ['nwr["amenity"="fuel"]'] },
  { key: "EV charging", query: ['nwr["amenity"="charging_station"]'] },
];

const SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];

function categoryOf(tags) {
  if (tags.shop === "car_repair") return "Mechanics";
  if (tags.shop === "car_parts") return "Auto parts";
  if (tags.shop === "tyres") return "Tyres";
  if (tags.shop === "batteries") return "Batteries";
  if (tags.amenity === "car_wash") return "Car wash";
  if (tags.shop === "car" || tags.amenity === "vehicle_inspection") return "Service centres";
  if (tags.amenity === "fuel") return "Fuel";
  if (tags.amenity === "charging_station") return "EV charging";
  return "Mechanics";
}

// All categories (or one) within `radiusKm` of `at`, nearest first.
export async function findPlaces(at, { category = "All", radiusKm = 8 } = {}) {
  const cats = category === "All" ? PLACE_CATEGORIES : PLACE_CATEGORIES.filter((c) => c.key === category);
  const r = Math.round(radiusKm * 1000);
  const parts = cats.flatMap((c) => c.query.map((q) => `${q}(around:${r},${at.lat},${at.lon});`)).join("");
  const body = `[out:json][timeout:25];(${parts});out center tags 200;`;
  let lastErr = null;
  for (const url of SERVERS) {
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: body }) });
      if (!res.ok) throw new Error(`Places search failed (${res.status})`);
      const data = await res.json();
      const seen = new Set();
      return (data.elements || [])
        .map((e) => {
          const t = e.tags || {};
          const lat = e.lat ?? (e.center && e.center.lat), lon = e.lon ?? (e.center && e.center.lon);
          if (lat == null || lon == null) return null;
          const cat = categoryOf(t);
          const name = t.name || t.brand || t.operator || `${cat === "Mechanics" ? "Mechanic" : cat === "Car wash" ? "Car wash" : cat.replace(/s$/, "")} (no name listed)`;
          const street = [t["addr:housenumber"], t["addr:street"]].filter(Boolean).join(" ");
          return {
            id: `${e.type}/${e.id}`, name, category: cat, lat, lon,
            km: haversineKm(at, { lat, lon }),
            address: [street, t["addr:city"] || t["addr:suburb"]].filter(Boolean).join(", "),
            phone: t.phone || t["contact:phone"] || "",
            website: t.website || t["contact:website"] || "",
            hours: t.opening_hours || "",
            open: isOpenNow(t.opening_hours),
            brand: t.brand || "",
          };
        })
        .filter(Boolean)
        .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
        .sort((a, b) => a.km - b.km);
    } catch (e) { lastErr = e; }
  }
  throw new Error(lastErr && /fetch|network/i.test(lastErr.message) ? "No connection. Check your internet and try again." : "Couldn't load places right now. Try again in a minute.");
}

// Reads common OpenStreetMap opening_hours ("Mo-Fr 08:00-18:00; Sa 09:00-14:00", "24/7").
// true = open now, false = closed now, null = unknown or too complex to read.
const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
export function isOpenNow(spec, now = new Date()) {
  if (!spec) return null;
  const s = spec.trim();
  if (s === "24/7") return true;
  if (/PH|SH|week|easter|sunrise|sunset|\[|"/i.test(s)) return null;
  const today = (now.getDay() + 6) % 7; // Monday = 0
  const mins = now.getHours() * 60 + now.getMinutes();
  let decided = null;
  try {
    for (const raw of s.split(";")) {
      const rule = raw.trim(); if (!rule) continue;
      const m = rule.match(/^((?:[A-Z][a-z](?:-[A-Z][a-z])?,?)+)?\s*(.*)$/);
      if (!m) return null;
      let days = [0, 1, 2, 3, 4, 5, 6];
      if (m[1]) {
        days = [];
        for (const part of m[1].split(",").filter(Boolean)) {
          const [a, b] = part.split("-");
          const ia = DAYS.indexOf(a), ib = b ? DAYS.indexOf(b) : ia;
          if (ia < 0 || ib < 0) return null;
          for (let i = ia; ; i = (i + 1) % 7) { days.push(i); if (i === ib) break; }
        }
      }
      if (!days.includes(today)) continue;
      const times = m[2].trim();
      if (/^(off|closed)$/i.test(times)) { decided = false; continue; }
      if (!times) { decided = true; continue; }
      let open = false;
      for (const range of times.split(",")) {
        const t = range.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})\+?$/);
        if (!t) return null;
        const from = +t[1] * 60 + +t[2]; let to = +t[3] * 60 + +t[4];
        if (to <= from) to += 24 * 60;
        if ((mins >= from && mins < to) || (mins + 1440 >= from && mins + 1440 < to)) open = true;
      }
      decided = open;
    }
  } catch (e) { return null; }
  return decided === null ? false : decided;
}
