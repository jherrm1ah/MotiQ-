// Tools for one car: the fuel log, recalls and known problems, and a shareable history PDF.
import React, { useEffect, useState } from "react";
import { Fuel, Trash2, AlertTriangle, Loader2, ShieldAlert, Bot, Share2, TrendingDown } from "lucide-react";
import { useTheme, useUI, RED, AMBER, GREEN, Field, PrimaryButton, SecondaryButton, Stat, ToggleRow, Skeleton, carLabel, carFull } from "../design.jsx";
import { addFuel, deleteFuel, fuelStats, loadRecalls, reminderState } from "../lib/data.js";
import { money, todayISO, dateLabel } from "../lib/units.js";
import { describeCode } from "../lib/dtc.js";

const volUnit = (unit) => (unit === "mi" ? "gal" : "L");

export function FuelSheet({ car }) {
  const { uid, me, unit, fuel, setFuel, showToast, confirm } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER } = useTheme();
  const logs = fuel.filter((f) => f.vehicle_id === car.id);
  const stats = fuelStats(logs, unit);
  const [f, setF] = useState({ filled_on: todayISO(), odometer: car.odometer || "", amount: "", cost: "", full_tank: true });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!f.odometer || !(Number(f.amount) > 0)) return showToast(`Add the odometer and how many ${unit === "mi" ? "gallons" : "litres"}.`);
    setBusy(true);
    try { const row = await addFuel(uid, { ...f, vehicle_id: car.id }, me.currency); setFuel((x) => [row, ...x]); setF({ ...f, amount: "", cost: "", odometer: "" }); showToast("Fill-up saved"); }
    catch (err) { showToast(/fuel_logs/.test(err.message) ? "The fuel log needs one more setup step in the database." : err.message); }
    setBusy(false);
  };
  const fmt = (v) => (v == null ? "—" : `${v.toFixed(1)} ${stats.label}`);
  return (
    <div className="flex flex-col gap-4">
      {stats.worse && (
        <div className="flex gap-2.5 rounded-2xl p-3.5" style={{ backgroundColor: "rgba(245,185,68,0.12)" }}>
          <TrendingDown size={16} style={{ color: AMBER }} className="mt-0.5 shrink-0" />
          <p className="text-xs leading-relaxed" style={{ color: TEXT }}>Your last tank used noticeably more fuel than usual ({fmt(stats.last)} vs {fmt(stats.avg)}). Tyre pressure, a dirty air filter or a sensor fault can cause this — worth a scan.</p>
        </div>
      )}
      <div className="flex flex-col gap-2.5 rounded-2xl p-4" style={{ backgroundColor: CARD_ALT }}>
        <Stat label="Average" value={fmt(stats.avg)} source={stats.avg != null ? "calculated" : null} />
        <Stat label="Last tank" value={fmt(stats.last)} />
        <Stat label="Spent this month" value={stats.spentThisMonth ? money(stats.spentThisMonth, me.currency) : "—"} />
        <Stat label={`Fuel cost per ${unit}`} value={stats.costPerDist != null ? money(stats.costPerDist, me.currency) : "—"} />
        {stats.avg == null && <p className="text-xs" style={{ color: SUB }}>Log two full tanks to see your fuel economy.</p>}
      </div>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Odometer (${unit})`} value={f.odometer} onChange={(e) => setF({ ...f, odometer: e.target.value })} inputMode="numeric" />
          <Field label={`Fuel (${volUnit(unit)})`} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} inputMode="decimal" />
          <Field label={`Cost (${me.currency})`} value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} inputMode="decimal" />
          <Field label="Date" type="date" value={f.filled_on} onChange={(e) => setF({ ...f, filled_on: e.target.value })} />
        </div>
        <ToggleRow label="Filled the tank to full" on={f.full_tank} onChange={(v) => setF({ ...f, full_tank: v })} />
        <PrimaryButton type="submit" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Fuel size={15} />} Add fill-up</PrimaryButton>
      </form>
      {logs.length > 0 && (
        <div className="flex flex-col">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Fill-ups</p>
          {logs.slice(0, 20).map((l, i) => (
            <div key={l.id} className="flex items-center gap-3 py-2.5" style={i ? { borderTop: `1px solid ${BORDER}` } : undefined}>
              <div className="min-w-0 flex-1">
                <p className="text-sm" style={{ color: TEXT }}>{Number(l.amount)} {volUnit(unit)}{l.cost != null ? ` · ${money(l.cost, l.currency)}` : ""}</p>
                <p className="text-xs" style={{ color: SUB }}>{dateLabel(l.filled_on)} · {Number(l.odometer).toLocaleString()} {unit}{l.full_tank ? "" : " · part fill"}</p>
              </div>
              <button onClick={() => confirm("Delete fill-up?", "It will be removed from your fuel log.", "Delete", async () => { await deleteFuel(l.id); setFuel((x) => x.filter((y) => y.id !== l.id)); })} aria-label="Delete fill-up" className="p-1"><Trash2 size={13} style={{ color: SUB }} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function RecallsSheet({ car }) {
  const { goTo, setCarId } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const [state, setState] = useState({ loading: true, recalls: [], error: "" });
  useEffect(() => { loadRecalls(car).then((r) => setState({ loading: false, recalls: r, error: "" })).catch((e) => setState({ loading: false, recalls: [], error: e.message })); }, [car.id]);
  const ask = () => { setCarId(car.id); goTo("ai", { ask: `What are the most common problems and weak spots on a ${carFull(car)}${car.odometer ? ` at about ${car.odometer.toLocaleString()} on the clock` : ""}? What should I check or replace soon, and roughly what does it cost?` }); };
  return (
    <div className="flex flex-col gap-4">
      <button onClick={ask} className="flex items-center gap-3 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD_ALT }}>
        <Bot size={18} style={{ color: TEXT }} className="shrink-0" />
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold" style={{ color: TEXT }}>Known problems for this model</span><span className="block text-xs" style={{ color: SUB }}>Ask the AI mechanic what usually goes wrong on a {carFull(car)}</span></span>
      </button>
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Official safety recalls</p>
        {state.loading ? <Skeleton rows={2} height={70} radius={16} />
          : state.error ? <p className="text-sm" style={{ color: SUB }}>{state.error}</p>
            : state.recalls.length === 0 ? <p className="flex items-center gap-2 text-sm" style={{ color: GREEN }}><ShieldAlert size={15} /> No recalls found for a {carFull(car)}.</p>
              : (
                <div className="flex flex-col gap-2.5">
                  {state.recalls.map((r) => (
                    <div key={r.id} className="rounded-2xl p-3.5" style={{ backgroundColor: CARD_ALT }}>
                      <p className="flex items-start gap-2 text-sm font-semibold" style={{ color: TEXT }}><AlertTriangle size={14} style={{ color: RED }} className="mt-0.5 shrink-0" />{r.component}</p>
                      <p className="mt-1 text-xs leading-relaxed" style={{ color: SUB }}>{r.summary}</p>
                      {r.remedy && <p className="mt-1.5 text-xs leading-relaxed" style={{ color: TEXT }}><b>Fix:</b> {r.remedy}</p>}
                      <p className="mt-1.5 text-[10px]" style={{ color: SUB }}>Campaign {r.id}{r.date ? ` · ${r.date}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: SUB }}>From the US recall database (NHTSA). Cars sold in other countries can have different recalls — a dealer for your brand can check your VIN.</p>
      </div>
    </div>
  );
}

// A clean PDF of the car's record (health, services, reminders, scans, documents, fuel) to show a
// buyer or a mechanic. Shared through the phone's share sheet, or downloaded on a computer.
export async function shareHistory({ car, garage, documents, fuel, me, unit }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const line = (text, { size = 10, bold = false, color = [33, 33, 33], gap = 4 } = {}) => {
    doc.setFont("helvetica", bold ? "bold" : "normal"); doc.setFontSize(size); doc.setTextColor(...color);
    for (const part of doc.splitTextToSize(String(text), W - 2 * M)) { if (y > H - M) { doc.addPage(); y = M; } doc.text(part, M, y); y += size + gap; }
  };
  const section = (t) => { y += 10; doc.setDrawColor(224); doc.line(M, y - 6, W - M, y - 6); line(t, { size: 13, bold: true, gap: 6 }); };
  const h = car.healthInfo;
  line("Motiq vehicle history", { size: 9, color: [97, 97, 97] });
  line(carFull(car), { size: 22, bold: true, gap: 6 });
  line([car.nickname, car.vin && `VIN ${car.vin}`, car.plate && `Plate ${car.plate}`, `${(car.odometer || 0).toLocaleString()} ${unit}`].filter(Boolean).join("  ·  "), { color: [97, 97, 97] });
  line(`Health ${car.health}/100 — ${h.label}. Generated ${new Date().toLocaleDateString()}.`, { gap: 2 });
  const services = garage.services.filter((s) => s.vehicle_id === car.id);
  section(`Service history (${services.length})`);
  if (!services.length) line("No services recorded.", { color: [97, 97, 97] });
  for (const s of services) line(`${dateLabel(s.done_on)}  ${s.title}${s.odometer ? ` at ${s.odometer.toLocaleString()} ${unit}` : ""}${s.shop ? ` — ${s.shop}` : ""}${s.cost != null ? `  (${money(s.cost, s.currency)})` : ""}`);
  const open = garage.reminders.filter((r) => r.vehicle_id === car.id && !r.done_at);
  section("Coming up");
  if (!open.length) line("Nothing scheduled.", { color: [97, 97, 97] });
  for (const r of open) line(`${r.title} — ${reminderState(r, car.odometer)}${r.due_on ? `, due ${dateLabel(r.due_on)}` : ""}${r.due_odometer != null ? `, at ${r.due_odometer.toLocaleString()} ${unit}` : ""}`);
  const scans = garage.scans.filter((s) => s.vehicle_id === car.id).slice(0, 10);
  section(`Diagnostic scans (${scans.length})`);
  if (!scans.length) line("No scans yet.", { color: [97, 97, 97] });
  for (const s of scans) line(`${dateLabel(s.created_at)}${s.source === "demo" ? " (demo)" : ""}: ${(s.codes || []).length ? s.codes.map((c) => `${c.code} ${describeCode(c.code)}`).join("; ") : "no fault codes"}`);
  const docs = documents.filter((d) => d.vehicle_id === car.id);
  if (docs.length) { section("Documents"); for (const d of docs) line(`${d.title}${d.expires_on ? ` — expires ${dateLabel(d.expires_on)}` : ""}`); }
  const st = fuelStats(fuel.filter((f) => f.vehicle_id === car.id), unit);
  if (st.avg != null) { section("Fuel economy"); line(`Average ${st.avg.toFixed(1)} ${st.label} over ${st.legs.length} tanks.`); }
  y += 14; line("Records entered by the owner in the Motiq app. Scans read from the car's OBD-II port.", { size: 8, color: [97, 97, 97] });

  const name = `${carFull(car).replace(/[^\w]+/g, "-")}-history.pdf`;
  const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (native) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
    const data = doc.output("datauristring").split(",")[1];
    const { uri } = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    await Share.share({ title: `${carLabel(car)} history`, files: [uri], dialogTitle: "Share car history" });
    return "shared";
  }
  const blob = doc.output("blob");
  const file = new File([blob], name, { type: "application/pdf" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: `${carLabel(car)} history` }); return "shared"; } catch (e) { if (e && e.name === "AbortError") return "cancelled"; } }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "downloaded";
}
