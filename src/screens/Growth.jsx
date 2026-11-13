// Car papers for your country, shareable cards, and background trips (Android).
import React, { useEffect, useMemo, useState } from "react";
import { FileText, Check, Loader2, Share2, Bluetooth, ExternalLink, Image as ImageIcon } from "lucide-react";
import { useTheme, useUI, GREEN, AMBER, Field, Pill, PrimaryButton, SecondaryButton, ToggleRow, carLabel, carFull } from "../design.jsx";
import { addDocument, myReferralCode, track } from "../lib/data.js";
import { streak, weekSummary } from "../lib/daily.js";
import { money } from "../lib/units.js";

// ---------- Car papers by country. kind maps to vehicle_documents.kind.
const PAPERS = {
  NG: { name: "Nigeria", items: [
    ["registration", "Vehicle licence", "Renew every year at your state's motor licensing office or its online portal."],
    ["other", "Roadworthiness certificate", "Yearly vehicle inspection certificate from your state."],
    ["insurance", "Third-party insurance", "The legal minimum. Keep the certificate in the car."],
    ["other", "Proof of ownership", "Doesn't expire — keep a copy safe."],
    ["other", "Hackney permit", "Only for taxis and commercial cars."],
  ] },
  GH: { name: "Ghana", url: "https://www.dvla.gov.gh", items: [
    ["registration", "Roadworthy certificate (DVLA)", "Renew every year (every 6 months for commercial vehicles)."],
    ["insurance", "Motor insurance", "Third-party at least."],
    ["registration", "Vehicle registration", "From the DVLA."],
  ] },
  KE: { name: "Kenya", url: "https://ntsa.go.ke", items: [
    ["insurance", "Motor insurance (certificate)", "Renew every year; keep the digital certificate."],
    ["other", "Inspection certificate", "Commercial and public service vehicles: every year with NTSA."],
    ["registration", "Logbook", "From NTSA — doesn't expire."],
  ] },
  ZA: { name: "South Africa", items: [
    ["registration", "Licence disc", "Renew every year before it expires (there's a short grace period)."],
    ["other", "Roadworthy certificate", "Needed when you sell or re-register the car."],
    ["insurance", "Car insurance", "Not compulsory, but strongly recommended."],
  ] },
  GB: { name: "United Kingdom", url: "https://www.gov.uk/browse/driving/vehicle-tax-mot-insurance", items: [
    ["registration", "Vehicle tax", "Renew every year (or monthly by direct debit)."],
    ["other", "MOT certificate", "Every year once the car is 3 years old."],
    ["insurance", "Car insurance", "Required by law."],
  ] },
  US: { name: "United States", items: [
    ["registration", "Registration", "Renew with your state DMV (usually every 1–2 years)."],
    ["insurance", "Auto insurance card", "Required in almost every state."],
    ["other", "State inspection / emissions", "Only in some states."],
  ] },
};
const DEFAULT_PAPERS = { name: "your country", items: [
  ["registration", "Registration / road tax", "Renew it before it expires."],
  ["insurance", "Car insurance", "Keep proof in the car."],
  ["other", "Inspection / roadworthiness", "If your country requires one."],
] };

export function CountryPapersSheet() {
  const { me, uid, vehicle, documents, setDocuments, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER } = useTheme();
  const set = PAPERS[me.country] || DEFAULT_PAPERS;
  const [open, setOpen] = useState(null);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  if (!vehicle) return <p className="text-sm" style={{ color: SUB }}>Add your car first.</p>;
  const has = (title) => documents.some((d) => d.vehicle_id === vehicle.id && d.title.toLowerCase() === title.toLowerCase());
  const save = async (kind, title) => {
    setBusy(true);
    try { const row = await addDocument(uid, { vehicle_id: vehicle.id, kind, title, expires_on: date || null }); setDocuments([row, ...documents]); setOpen(null); setDate(""); showToast(date ? "Saved — we'll remind you before it expires" : "Saved"); track("papers_add"); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed" style={{ color: SUB }}>The papers a car usually needs in {set.name}. Add when each one expires and Motiq reminds you 2 weeks before. For {carLabel(vehicle)}.</p>
      {set.items.map(([kind, title, note]) => {
        const done = has(title);
        return (
          <div key={title} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
            <button className="flex w-full items-start justify-between gap-2 text-left" onClick={() => !done && setOpen(open === title ? null : title)} aria-expanded={open === title}>
              <div className="min-w-0"><p className="text-sm font-medium" style={{ color: TEXT }}>{title}</p><p className="mt-0.5 text-[11px] leading-snug" style={{ color: SUB }}>{note}</p></div>
              {done ? <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold" style={{ color: GREEN }}><Check size={12} /> Added</span> : <span className="shrink-0 text-[11px] font-semibold" style={{ color: TEXT }}>Add</span>}
            </button>
            {open === title && (
              <div className="mt-2 flex items-end gap-2">
                <div className="flex-1"><Field label="Expires on (optional)" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
                <PrimaryButton className="px-4" disabled={busy} onClick={() => save(kind, title)}>{busy ? <Loader2 size={14} className="animate-spin" /> : "Save"}</PrimaryButton>
              </div>
            )}
          </div>
        );
      })}
      {set.url && <a href={set.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 self-start text-xs font-medium" style={{ color: TEXT }}><ExternalLink size={12} /> Official site for {set.name}</a>}
      <p className="text-[11px]" style={{ color: SUB }}>Rules change and differ by state or region — check with the official office if you're not sure.</p>
    </div>
  );
}

// ---------- Shareable cards: a picture to post on WhatsApp or Instagram, with your invite code.
function drawCard({ title, big, lines, code }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d");
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, "#2A2A2A"); bg.addColorStop(1, "#151515");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = "rgba(239,255,0,0.12)"; g.beginPath(); g.arc(W - 120, 180, 320, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#EFFF00"; g.font = "800 64px system-ui, sans-serif"; g.fillText("Motiq", 90, 150);
  g.fillStyle = "#BDBDBD"; g.font = "500 44px system-ui, sans-serif"; g.fillText(title, 90, 330);
  g.fillStyle = "#FFFFFF"; g.font = "900 230px system-ui, sans-serif"; g.fillText(big, 80, 580);
  g.font = "500 50px system-ui, sans-serif"; g.fillStyle = "#E0E0E0";
  lines.forEach((l, i) => g.fillText(l, 90, 740 + i * 80));
  g.fillStyle = "#EFFF00"; g.beginPath(); g.roundRect ? g.roundRect(90, H - 260, W - 180, 150, 40) : g.rect(90, H - 260, W - 180, 150); g.fill();
  g.fillStyle = "#000"; g.font = "700 46px system-ui, sans-serif";
  g.fillText(code ? `Join Motiq with my code ${code}` : "Look after your car with Motiq", 140, H - 168);
  return c;
}
async function shareCanvas(canvas, name, text, showToast) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const file = new File([blob], name, { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    if (native) {
      const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
      const data = canvas.toDataURL("image/png").split(",")[1];
      const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
      await Share.share({ text, files: [uri] }); return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
    showToast("Picture saved — post it anywhere");
  } catch (e) { /* cancelled */ }
}
export function ShareCardsSheet() {
  const { me, trips, garage, fuel, vehicle, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const [code, setCode] = useState(me.referral_code || null);
  useEffect(() => { if (!code) myReferralCode().then(setCode).catch(() => {}); }, []);
  const s = useMemo(() => weekSummary({ trips, services: garage.services, fuel, reminders: garage.reminders, ref: new Date(Date.now() + 7 * 86400000) }), [trips, garage, fuel]);
  const services = vehicle ? garage.services.filter((x) => x.vehicle_id === vehicle.id) : [];
  const months = services.length ? Math.max(1, Math.round((Date.now() - new Date(services[services.length - 1].done_on).getTime()) / (30 * 86400000))) : 0;
  const cards = [
    s.score != null && { key: "score", label: `Driving score ${s.score} this week`, make: () => drawCard({ title: "My driving score this week", big: String(s.score), lines: [`${Math.round(s.km)} km · ${s.trips} trips`, streak(trips) ? `🔥 ${streak(trips)}-day smooth-driving streak` : "Smooth braking, steady speed"], code }) },
    vehicle && services.length > 0 && { key: "history", label: `${services.length} services logged`, make: () => drawCard({ title: `My ${carFull(vehicle)}`, big: `${services.length}`, lines: [`services on record${months ? ` over ${months} month${months === 1 ? "" : "s"}` : ""}`, `Health ${vehicle.health}% — looked after with Motiq`], code }) },
    vehicle && { key: "health", label: `Car health ${vehicle.health}%`, make: () => drawCard({ title: `My ${carFull(vehicle)}`, big: `${vehicle.health}%`, lines: ["car health score", "AI mechanic · fault codes · reminders"], code }) },
  ].filter(Boolean);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm" style={{ color: SUB }}>Post a card on WhatsApp, Instagram or anywhere. It includes your invite code, so you get a free month of Pro for each friend who joins.</p>
      {cards.length === 0 && <p className="text-sm" style={{ color: SUB }}>Drive a few trips or log a service to unlock cards.</p>}
      {cards.map((c) => (
        <button key={c.key} onClick={() => { track(`share_card_${c.key}`); shareCanvas(c.make(), `motiq-${c.key}.png`, code ? `Join Motiq with my code ${code}` : "Motiq", showToast); }} className="flex items-center justify-between rounded-2xl p-4 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD_ALT }}>
          <span className="flex items-center gap-2 text-sm font-medium" style={{ color: TEXT }}><ImageIcon size={16} /> {c.label}</span><Share2 size={15} style={{ color: SUB }} />
        </button>
      ))}
    </div>
  );
}

// ---------- Background trips (Android): start when the phone connects to the car's Bluetooth,
// stop when it disconnects. Recorded by the native MotiqTrips plugin, uploaded when Motiq opens.
export const tripPlugin = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MotiqTrips) || null;
export function BackgroundTripsSheet() {
  const { showToast, vehicle } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const P = tripPlugin();
  const [state, setState] = useState(null);
  const refresh = () => P && P.status().then(setState).catch(() => setState({ enabled: false }));
  useEffect(() => { refresh(); }, []);
  if (!P) return <p className="text-sm leading-relaxed" style={{ color: SUB }}>Background trips work in the Motiq Android app: your trips record by themselves when your phone connects to the car's Bluetooth, even with Motiq closed. On the web, use "Start trips automatically" in Notifications.</p>;
  const pair = async () => {
    try {
      const r = await P.pairCar({ vehicleId: vehicle ? vehicle.id : "" });
      if (r && r.enabled) showToast(`Trips will record when you connect to ${r.deviceName || "your car"}`);
      refresh();
    } catch (e) { showToast(e.message || "Couldn't set it up"); }
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed" style={{ color: SUB }}>Pick your car's Bluetooth (the car stereo). When your phone connects to it, Motiq records the trip in the background — distance, time and driving score — and stops when you switch the car off.</p>
      {state && state.enabled ? (
        <div className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
          <p className="flex items-center gap-2 text-sm" style={{ color: TEXT }}><Bluetooth size={15} style={{ color: GREEN }} /> On · {state.deviceName || "your car"}</p>
          {state.recording && <p className="mt-1 text-xs" style={{ color: AMBER }}>Recording a trip now</p>}
        </div>
      ) : null}
      <PrimaryButton onClick={pair}><Bluetooth size={15} /> {state && state.enabled ? "Choose a different car Bluetooth" : "Choose my car's Bluetooth"}</PrimaryButton>
      {state && state.enabled && <SecondaryButton onClick={async () => { await P.disable(); refresh(); showToast("Background trips are off"); }}>Turn off</SecondaryButton>}
      <p className="text-[11px] leading-relaxed" style={{ color: SUB }}>Android will ask to let Motiq use your location "all the time" — that's only used while a trip is recording, and a notification shows while it is. Nothing records when you're not connected to the car.</p>
    </div>
  );
}
