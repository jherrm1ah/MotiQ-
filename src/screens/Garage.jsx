// Smart Garage: every car with its health ring; open one for its numbers, what's due, service
// history, documents, the OBD-II adapter and editing. The forms here are reused from Home.
import React, { useState } from "react";
import {
  Plus, ChevronDown, ChevronRight, Car, Bluetooth, BluetoothConnected, Trash2, Check, AlertTriangle, Wrench, Bot, Pencil, Gauge, ScanLine, FileText, Loader2, Fuel, ShieldAlert, Share2, Camera, Search, Users, UserPlus, LogOut, Copy,
} from "lucide-react";
import { t } from "../lib/i18n.js";
import {
  useTheme, useUI, RED, AMBER, GREEN, Ring, Field, Pill, PrimaryButton, SecondaryButton, LiveStat, Empty, ScreenHeader,
  carLabel, carFull, healthColor, fmtSpeed, fmtTemp,
} from "../design.jsx";
import {
  saveCar, deleteCar, updateOdometer, addService, deleteService, addReminder, completeReminder, deleteReminder, reminderState, reminderTemplates,
} from "../lib/data.js";
import { money, todayISO, dateLabel } from "../lib/units.js";
import { decodeVin, readVinFromPhoto } from "../lib/data.js";
import { FuelSheet, RecallsSheet, shareHistory } from "./CarTools.jsx";
import { createInvite, redeemInvite, loadMembers, removeMember, isPro } from "../lib/data.js";
import { UpgradeSheet } from "./ProfileExtras.jsx";

// Owner: make an invite code and see / remove who the car is shared with.
function ShareCarSheet({ car }) {
  const { uid, showToast, confirm } = useUI();
  const { CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const [code, setCode] = useState(null);
  const [members, setMembers] = useState(null);
  const [busy, setBusy] = useState(false);
  React.useEffect(() => { loadMembers(car.id).then(setMembers).catch(() => setMembers([])); }, [car.id]);
  const make = async () => { setBusy(true); try { setCode(await createInvite(uid, car.id)); } catch (e) { showToast(e.message); } setBusy(false); };
  const share = async () => {
    const text = `Join my ${carLabel(car)} on Motiq: open Garage → Join a shared car and enter ${code}`;
    try { if (navigator.share) await navigator.share({ text }); else { await navigator.clipboard.writeText(code); showToast("Code copied"); } } catch {}
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed" style={{ color: SUB }}>Family or a driver can see this car and add services, fill-ups and reminders. Only you can edit or remove the car.</p>
      {code ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl p-5" style={{ backgroundColor: CARD_ALT }}>
          <p className="text-xs" style={{ color: SUB }}>Invite code · works once, for 7 days</p>
          <p className="font-mono text-3xl font-bold tracking-[0.25em]" style={{ color: TEXT }} aria-label="Invite code">{code}</p>
          <SecondaryButton onClick={share}><Copy size={14} /> Send the code</SecondaryButton>
        </div>
      ) : <PrimaryButton onClick={make} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />} Make an invite code</PrimaryButton>}
      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Shared with</p>
        {members == null ? <Loader2 size={15} className="animate-spin" style={{ color: SUB }} /> : members.length === 0 ? <p className="text-sm" style={{ color: SUB }}>Nobody yet.</p> : members.map((m) => (
          <div key={m.member_id} className="flex items-center justify-between py-2" style={{ borderBottom: `1px solid ${BORDER}` }}>
            <span className="text-sm" style={{ color: TEXT }}>{(m.member && m.member.name) || "Motiq driver"}</span>
            <button className="text-xs font-medium" style={{ color: RED }} onClick={() => confirm("Stop sharing?", `${(m.member && m.member.name) || "They"} will no longer see this car.`, "Remove", async () => { try { await removeMember(car.id, m.member_id); setMembers((x) => x.filter((y) => y.member_id !== m.member_id)); } catch (e) { showToast(e.message); } })}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function JoinCarSheet({ onDone }) {
  const { reload, showToast, setCarId } = useUI();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const join = async () => {
    setBusy(true);
    try { const id = await redeemInvite(code.trim().toUpperCase()); await reload(); if (id) setCarId(id); showToast("Car added to your garage"); onDone && onDone(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Invite code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))} placeholder="e.g. K7M2QX9P" />
      <PrimaryButton onClick={join} disabled={busy || code.length !== 8}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Users size={15} />} Join car</PrimaryButton>
    </div>
  );
}

const FUELS = [["petrol", "Petrol"], ["diesel", "Diesel"], ["hybrid", "Hybrid"], ["electric", "Electric"], ["lpg", "Gas (LPG/CNG)"], ["other", "Other"]];
const GEARS = [["automatic", "Automatic"], ["manual", "Manual"], ["cvt", "CVT"], ["other", "Other"]];
const SERVICE_KINDS = [["oil", "Oil"], ["tyres", "Tyres"], ["brakes", "Brakes"], ["battery", "Battery"], ["filters", "Filters"], ["fluids", "Fluids"], ["inspection", "Inspection"], ["repair", "Repair"], ["other", "Other"]];

function useBusy() {
  const { showToast } = useUI();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { if (busy) return; setBusy(true); try { await fn(); } catch (e) { showToast(e.message || "Couldn't save. Try again."); } setBusy(false); };
  return [busy, run];
}

export function CarForm({ car, onDone }) {
  const { me, uid, reload, showToast } = useUI();
  const [c, setC] = useState(car || { make: "", model: "", year: "", odometer: "", fuel: "petrol", transmission: "automatic", nickname: "", plate: "", vin: "" });
  const [busy, run] = useBusy();
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    if (!c.make.trim() || !c.model.trim()) return showToast("Add the make and model.");
    if (c.year && (c.year < 1950 || c.year > new Date().getFullYear() + 1)) return showToast("Check the year.");
    run(async () => { const row = await saveCar(uid, c); await reload(); showToast(car ? "Saved" : `${carFull(row)} added to your garage`); onDone && onDone(row); });
  };
  const [vinBusy, setVinBusy] = useState("");
  const vinFile = React.useRef(null);
  const fillFromVin = async (vin) => {
    setVinBusy("Looking up your VIN…");
    try { const d = await decodeVin(vin); setC((x) => ({ ...x, vin: d.vin, make: d.make || x.make, model: d.model || x.model, year: d.year || x.year, trim_level: d.trim_level || x.trim_level, fuel: d.fuel || x.fuel })); showToast(`Found: ${[d.year, d.make, d.model].filter(Boolean).join(" ")}`); }
    catch (e) { showToast(e.message); }
    setVinBusy("");
  };
  const scanVin = async (file) => {
    if (!file) return;
    setVinBusy("Reading the VIN from your photo…");
    try { const vin = await readVinFromPhoto(uid, file); setC((x) => ({ ...x, vin })); await fillFromVin(vin); }
    catch (e) { showToast(e.message); setVinBusy(""); }
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="rounded-2xl p-3" style={{ backgroundColor: useTheme().CARD_ALT }}>
        <p className="mb-2 text-xs" style={{ color: useTheme().SUB }}>Fill everything in from the VIN (on the windscreen, door frame or papers):</p>
        <div className="flex gap-2">
          <input aria-label="VIN" value={c.vin || ""} onChange={set("vin")} maxLength={17} placeholder="17-character VIN" className="h-11 min-w-0 flex-1 rounded-xl px-3 font-mono text-sm uppercase focus:outline-none" style={{ backgroundColor: useTheme().BG, color: useTheme().TEXT, border: `1px solid ${useTheme().BORDER}` }} />
          <button type="button" onClick={() => fillFromVin(c.vin)} disabled={!!vinBusy || (c.vin || "").length < 17} aria-label="Look up VIN" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40" style={{ backgroundColor: useTheme().FILL }}><Search size={16} style={{ color: useTheme().FILL_TEXT }} /></button>
          <button type="button" onClick={() => vinFile.current && vinFile.current.click()} disabled={!!vinBusy} aria-label="Scan VIN with camera" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl disabled:opacity-40" style={{ backgroundColor: useTheme().FILL }}><Camera size={16} style={{ color: useTheme().FILL_TEXT }} /></button>
          <input ref={vinFile} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; scanVin(f); }} />
        </div>
        {vinBusy && <p role="status" className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: useTheme().TEXT }}><Loader2 size={12} className="animate-spin" /> {vinBusy}</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Make" value={c.make} onChange={set("make")} placeholder="Toyota" autoComplete="off" />
        <Field label="Model" value={c.model} onChange={set("model")} placeholder="Corolla" autoComplete="off" />
        <Field label="Year" value={c.year || ""} onChange={set("year")} placeholder="2016" inputMode="numeric" />
        <Field label={`Odometer (${me.distance_unit})`} value={c.odometer ?? ""} onChange={set("odometer")} placeholder="85000" inputMode="numeric" />
      </div>
      <Field label="Nickname (optional)" value={c.nickname || ""} onChange={set("nickname")} placeholder="Daily driver" />
      <div>
        <p className="mb-1.5 text-xs font-medium" style={{ color: useTheme().SUB }}>Fuel</p>
        <div className="flex flex-wrap gap-2">{FUELS.map(([v, l]) => <Pill key={v} small active={c.fuel === v} onClick={() => setC({ ...c, fuel: v })}>{l}</Pill>)}</div>
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium" style={{ color: useTheme().SUB }}>Gearbox</p>
        <div className="flex flex-wrap gap-2">{GEARS.map(([v, l]) => <Pill key={v} small active={c.transmission === v} onClick={() => setC({ ...c, transmission: v })}>{l}</Pill>)}</div>
      </div>
      <Field label="Plate (optional)" value={c.plate || ""} onChange={set("plate")} />
      <PrimaryButton type="submit" disabled={busy} className="mt-1">{busy && <Loader2 size={15} className="animate-spin" />}{car ? "Save" : "Add car"}</PrimaryButton>
    </form>
  );
}

export function ServiceForm({ car, onDone }) {
  const { me, uid, reload, showToast } = useUI();
  const [s, setS] = useState({ kind: "oil", title: "Oil and filter change", done_on: todayISO(), odometer: car.odometer || "", cost: "", shop: "", notes: "" });
  const [busy, run] = useBusy();
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  const save = (e) => {
    e.preventDefault();
    if (!s.title.trim()) return showToast("Say what was done.");
    run(async () => {
      await addService(uid, car.id, s, me.currency);
      if (s.odometer && Number(s.odometer) > (car.odometer || 0)) await updateOdometer(car.id, Number(s.odometer));
      await reload(); showToast("Service saved"); onDone && onDone();
    });
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">{SERVICE_KINDS.map(([v, l]) => <Pill key={v} small active={s.kind === v} onClick={() => setS({ ...s, kind: v, title: v === "oil" ? "Oil and filter change" : l })}>{l}</Pill>)}</div>
      <Field label="What was done" value={s.title} onChange={set("title")} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date" type="date" value={s.done_on} onChange={set("done_on")} />
        <Field label={`Odometer (${me.distance_unit})`} value={s.odometer} onChange={set("odometer")} inputMode="numeric" />
        <Field label={`Cost (${me.currency})`} value={s.cost} onChange={set("cost")} inputMode="decimal" />
        <Field label="Shop (optional)" value={s.shop} onChange={set("shop")} />
      </div>
      <Field label="Notes (optional)" as="textarea" rows={3} value={s.notes} onChange={set("notes")} />
      <PrimaryButton type="submit" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Save</PrimaryButton>
    </form>
  );
}

export function ReminderForm({ car, onDone }) {
  const { me, uid, reload, showToast } = useUI();
  const { SUB } = useTheme();
  const [r, setR] = useState({ kind: "other", title: "", due_on: "", due_odometer: "", every_months: "", every_distance: "" });
  const [busy, run] = useBusy();
  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });
  const pick = (t) => {
    const d = new Date(); d.setMonth(d.getMonth() + (t.every_months || 6));
    setR({ kind: t.kind, title: t.title, due_on: d.toISOString().slice(0, 10), due_odometer: t.every_distance ? (car.odometer || 0) + t.every_distance : "", every_months: t.every_months || "", every_distance: t.every_distance || "" });
  };
  const save = (e) => {
    e.preventDefault();
    if (!r.title.trim()) return showToast("Name the reminder.");
    if (!r.due_on && !r.due_odometer) return showToast("Add a date or a reading it's due at.");
    run(async () => { await addReminder(uid, car.id, r); await reload(); showToast("Reminder added"); onDone && onDone(); });
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: SUB }}>Pick one, or write your own:</p>
      <div className="flex flex-wrap gap-2">{reminderTemplates(me.distance_unit).map((t) => <Pill key={t.title} small active={r.title === t.title} onClick={() => pick(t)}>{t.title}</Pill>)}</div>
      <Field label="Reminder" value={r.title} onChange={set("title")} placeholder="Oil and filter change" />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Due on" type="date" value={r.due_on} onChange={set("due_on")} />
        <Field label={`or at (${me.distance_unit})`} value={r.due_odometer} onChange={set("due_odometer")} inputMode="numeric" />
        <Field label="Repeat (months)" value={r.every_months} onChange={set("every_months")} inputMode="numeric" />
        <Field label={`or every (${me.distance_unit})`} value={r.every_distance} onChange={set("every_distance")} inputMode="numeric" />
      </div>
      <PrimaryButton type="submit" disabled={busy}>{busy && <Loader2 size={15} className="animate-spin" />}Add reminder</PrimaryButton>
    </form>
  );
}

export function OdometerForm({ car, onDone }) {
  const { me, reload, showToast } = useUI();
  const [v, setV] = useState(car.odometer || "");
  const [busy, run] = useBusy();
  const save = (e) => {
    e.preventDefault();
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) return showToast("Enter a number.");
    run(async () => { await updateOdometer(car.id, n); await reload(); showToast("Odometer updated"); onDone && onDone(); });
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <Field label={`Current reading (${me.distance_unit})`} value={v} onChange={(e) => setV(e.target.value)} inputMode="numeric" autoFocus />
      <p className="text-xs" style={{ color: useTheme().SUB }}>Keeps distance-based reminders accurate.</p>
      <PrimaryButton type="submit" disabled={busy}>Save</PrimaryButton>
    </form>
  );
}

export function OBDConnectSheet({ onScan, onDemo }) {
  const { TEXT, SUB, CARD_ALT } = useTheme();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
        <Bluetooth size={20} style={{ color: TEXT }} className="shrink-0" />
        <p className="text-sm leading-relaxed" style={{ color: SUB }}>Plug an OBD-II Bluetooth adapter into the port under your dashboard, turn the ignition on, then scan to pair.</p>
      </div>
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>Works with Bluetooth Low Energy adapters (often sold as "BLE" or "Bluetooth 4.0" ELM327, Vgate iCar Pro BLE, OBDLink CX, Veepeak BLE). Older classic-Bluetooth-only adapters won't show up.</p>
      <PrimaryButton onClick={onScan}><Bluetooth size={15} /> Scan for devices</PrimaryButton>
      {onDemo && <SecondaryButton onClick={onDemo}>No adapter? Try a demo scan</SecondaryButton>}
    </div>
  );
}

export default function Garage() {
  const { me, uid, unit, vehicles, garage, documents, fuel, obd, liveData, connectOBD, disconnectOBD, openSheet, closeSheet, confirm, goTo, setCarId, reload, showToast } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, RING_TRACK, FILL, FILL_TEXT } = useTheme();
  const [expanded, setExpanded] = useState(vehicles.length === 1 ? vehicles[0].id : null);
  const addCar = () => (!isPro(me) && vehicles.filter((v) => v.owner_id === uid).length >= 2) ? openSheet("Motiq Pro", <><p className="mb-4 text-sm" style={{ color: SUB }}>The free plan has room for 2 cars. Upgrade for more.</p><UpgradeSheet /></>) : openSheet("Add a vehicle", <CarForm onDone={(c) => { setExpanded(c.id); setCarId(c.id); closeSheet(); }} />);

  return (
    <div className="flex flex-col gap-5 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="font-bold tracking-tight" style={{ fontSize: 20, color: TEXT }}>{t("Smart Garage")}</h1>
          <p className="mt-0.5 text-sm" style={{ color: SUB }}>{vehicles.length} vehicle{vehicles.length === 1 ? "" : "s"} tracked</p>
        </div>
        <button onClick={addCar} className="flex h-10 w-10 items-center justify-center rounded-full active:scale-90 transition-transform" style={{ backgroundColor: FILL }} aria-label="Add a car"><Plus size={18} style={{ color: FILL_TEXT }} /></button>
      </div>

      <button onClick={() => openSheet(t("Join a shared car"), <JoinCarSheet onDone={closeSheet} />)} className="-mt-2 flex items-center gap-1.5 self-start text-xs font-medium" style={{ color: SUB }}><Users size={13} /> {t("Join a shared car")}</button>

      {vehicles.length === 0 && <Empty icon={Car} title="Your garage is empty" text="Add a car to track its health and service, scan it with an OBD-II adapter, and get AI help for it." action="Add a car" onAction={addCar} />}

      <div className="flex flex-col gap-3">
        {vehicles.map((v) => {
          const isOpen = expanded === v.id;
          const reminders = garage.reminders.filter((r) => r.vehicle_id === v.id && !r.done_at);
          const services = garage.services.filter((s) => s.vehicle_id === v.id);
          const docs = documents.filter((d) => d.vehicle_id === v.id);
          const connected = obd.status === "connected" && obd.vehicleId === v.id;
          const shared = v.owner_id && uid && v.owner_id !== uid;
          return (
            <div key={v.id} className="overflow-hidden" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <button onClick={() => { setExpanded(isOpen ? null : v.id); if (!isOpen) setCarId(v.id); }} aria-expanded={isOpen} className="flex w-full items-center gap-3 p-4 text-left">
                <div className="relative flex items-center justify-center"><Ring pct={v.health} color={healthColor(v.health)} size={46} stroke={4.5} track={RING_TRACK} /><span className="absolute font-semibold" style={{ fontSize: 11, color: TEXT }}>{v.health}</span></div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium" style={{ color: TEXT }}>{carLabel(v)}{shared && <span className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: CARD_ALT, color: SUB }}>Shared</span>}</p>
                  <p className="mt-0.5 truncate text-xs" style={{ color: SUB }}>{carFull(v)} · {(v.odometer || 0).toLocaleString()} {unit}</p>
                </div>
                {v.healthInfo.overdue.length > 0 && <span className="shrink-0 rounded-full px-2 py-1 font-medium" style={{ fontSize: 10, backgroundColor: "rgba(244,85,61,0.15)", color: RED }}>Overdue</span>}
                <ChevronDown size={16} style={{ color: SUB, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
              </button>

              {isOpen && (
                <div className="flex flex-col gap-2 px-4 pb-4">
                  <div className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ backgroundColor: BORDER }}>
                    {[["Odometer", `${(v.odometer || 0).toLocaleString()}`], ["Fuel", (FUELS.find((f) => f[0] === v.fuel) || ["", "—"])[1]], ["Health", `${v.health}/100`]].map(([label, val]) => (
                      <div key={label} className="px-2 py-2.5 text-center" style={{ backgroundColor: CARD_ALT }}>
                        <p style={{ fontSize: 10, color: SUB }}>{label}</p>
                        <p className="mt-0.5 truncate font-mono text-xs" style={{ color: TEXT }}>{val}</p>
                      </div>
                    ))}
                  </div>

                  <MiniRow icon={AlertTriangle} color={v.nextDue ? (v.nextDue.urgent ? RED : AMBER) : SUB} text={v.nextDue ? `${v.nextDue.title} — ${v.nextDue.when}` : "No reminders yet — add one"} onClick={() => openSheet("Add a reminder", <ReminderForm car={v} onDone={closeSheet} />)} />

                  {reminders.length > 0 && (
                    <div className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
                      <p className="mb-2 text-xs font-semibold" style={{ color: SUB }}>Coming up</p>
                      {reminders.map((r) => {
                        const st = reminderState(r, v.odometer);
                        return (
                          <div key={r.id} className="flex items-center gap-2 py-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: st === "overdue" ? RED : st === "soon" ? AMBER : SUB }} />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs" style={{ color: TEXT }}>{r.title}</p>
                              <p style={{ fontSize: 10, color: SUB }}>{r.due_on ? dateLabel(r.due_on) : ""}{r.due_on && r.due_odometer != null ? " · " : ""}{r.due_odometer != null ? `${r.due_odometer.toLocaleString()} ${unit}` : ""}</p>
                            </div>
                            <button onClick={async () => { try { await completeReminder(me.id, r, v.odometer); await reload(); showToast(r.every_months || r.every_distance ? "Done — next one scheduled" : "Marked done"); } catch (e) { showToast(e.message); } }} aria-label={`Mark ${r.title} done`} className="flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-medium" style={{ backgroundColor: FILL, color: FILL_TEXT }}><Check size={12} /> Done</button>
                            <button onClick={() => confirm("Delete reminder?", `"${r.title}" will be removed.`, "Delete", async () => { await deleteReminder(r.id); await reload(); })} aria-label={`Delete ${r.title}`} className="p-1"><Trash2 size={13} style={{ color: SUB }} /></button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <SmallButton icon={Wrench} label="Log service" onClick={() => openSheet("Log a service", <ServiceForm car={v} onDone={closeSheet} />)} />
                    <SmallButton icon={Gauge} label="Odometer" onClick={() => openSheet("Update odometer", <OdometerForm car={v} onDone={closeSheet} />)} />
                    <SmallButton icon={ScanLine} label="Scan" onClick={() => { setCarId(v.id); goTo("scan"); }} />
                    <SmallButton icon={Bot} label="Ask AI" onClick={() => { setCarId(v.id); goTo("ai"); }} />
                    <SmallButton icon={Fuel} label="Fuel log" onClick={() => openSheet(`Fuel log — ${carLabel(v)}`, <FuelSheet car={v} />)} />
                    <SmallButton icon={ShieldAlert} label="Recalls & issues" onClick={() => openSheet(`Recalls & known problems`, <RecallsSheet car={v} />)} />
                  </div>
                  <SmallButton icon={Share2} label="Share car history (PDF)" onClick={async () => { if (!isPro(me)) { openSheet("Motiq Pro", <UpgradeSheet />); return; } try { const r = await shareHistory({ car: v, garage, documents, fuel, me, unit }); if (r === "downloaded") showToast("History PDF downloaded"); } catch (e) { showToast(e.message || "Couldn't make the PDF"); } }} />

                  {services.length > 0 && (
                    <div className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
                      <p className="mb-2 text-xs font-semibold" style={{ color: SUB }}>Service history</p>
                      {services.slice(0, 6).map((s) => (
                        <div key={s.id} className="flex items-center gap-2 py-1.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs" style={{ color: TEXT }}>{s.title}</p>
                            <p style={{ fontSize: 10, color: SUB }}>{dateLabel(s.done_on)}{s.odometer ? ` · ${s.odometer.toLocaleString()} ${unit}` : ""}{s.shop ? ` · ${s.shop}` : ""}</p>
                          </div>
                          {s.cost != null && <span className="shrink-0 font-mono text-xs" style={{ color: TEXT }}>{money(s.cost, s.currency)}</span>}
                          <button onClick={() => confirm("Delete this service?", `"${s.title}" will be removed from the history.`, "Delete", async () => { await deleteService(s.id); await reload(); })} aria-label={`Delete ${s.title}`} className="p-1"><Trash2 size={12} style={{ color: SUB }} /></button>
                        </div>
                      ))}
                      {services.length > 6 && <p className="pt-1" style={{ fontSize: 10, color: SUB }}>+{services.length - 6} older</p>}
                    </div>
                  )}

                  <MiniRow icon={FileText} text={docs.length ? `${docs.length} document${docs.length === 1 ? "" : "s"} — warranty, insurance, registration` : "Add warranty, insurance or registration"} onClick={() => goTo("profile")} />

                  {connected ? (
                    <div className="rounded-2xl p-3" style={{ backgroundColor: "rgba(61,220,132,0.1)", border: `1px solid ${BORDER}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2"><BluetoothConnected size={14} style={{ color: GREEN }} /><span className="truncate font-medium" style={{ fontSize: 12, color: TEXT }}>{obd.deviceName}</span></div>
                        <button type="button" onClick={() => disconnectOBD()} className="font-medium" style={{ fontSize: 11, color: RED }}>Disconnect</button>
                      </div>
                      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                        <LiveStat label="RPM" value={liveData && liveData.rpm != null ? liveData.rpm : "—"} />
                        <LiveStat label="Speed" value={liveData && liveData.speed_kmh != null ? fmtSpeed(liveData.speed_kmh, unit) : "—"} />
                        <LiveStat label="Coolant" value={liveData && liveData.coolant_c != null ? fmtTemp(liveData.coolant_c, unit) : "—"} />
                        <LiveStat label="Fuel" value={liveData && liveData.fuel_pct != null ? `${liveData.fuel_pct}%` : "—"} />
                      </div>
                    </div>
                  ) : (
                    <MiniRow icon={Bluetooth} text={obd.status === "connecting" && obd.vehicleId === v.id ? "Looking for your adapter..." : "Connect OBD-II adapter"} onClick={() => openSheet("Connect OBD-II adapter", <OBDConnectSheet onScan={() => { closeSheet(); connectOBD(v.id); }} onDemo={() => { setCarId(v.id); goTo("scan"); }} />)} />
                  )}

                  {shared ? (
                    <SmallButton icon={LogOut} label="Leave this shared car" color={RED} onClick={() => confirm(`Leave ${carLabel(v)}?`, "It will disappear from your garage. What you added stays with the car.", "Leave", async () => { try { await removeMember(v.id, uid); await reload(); showToast("You left the car"); } catch (e) { showToast(e.message); } })} />
                  ) : <SmallButton icon={Users} label={t("Share this car")} onClick={() => openSheet(t("Share this car"), <ShareCarSheet car={v} />)} />}
                  {!shared && <div className="grid grid-cols-2 gap-2">
                    <SmallButton icon={Pencil} label="Edit car" onClick={() => openSheet("Edit car", <CarForm car={v} onDone={closeSheet} />)} />
                    <SmallButton icon={Trash2} label="Remove" color={RED} onClick={() => confirm(`Remove ${carLabel(v)}?`, "This also removes its reminders, service history, scans and documents. This can't be undone.", "Remove", async () => { try { await deleteCar(v.id); await reload(); showToast(`${carLabel(v)} removed`); if (obd.vehicleId === v.id) disconnectOBD(true); } catch (e) { showToast(e.message); } })} />
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniRow({ icon: Icon, color, text, onClick }) {
  const { CARD_ALT, TEXT, SUB } = useTheme();
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD_ALT }}>
      <Icon size={13} style={{ color: color || SUB }} className="shrink-0" />
      <p className="flex-1 text-xs" style={{ color: TEXT }}>{text}</p>
      <ChevronRight size={13} style={{ color: SUB }} />
    </button>
  );
}
function SmallButton({ icon: Icon, label, onClick, color }) {
  const { CARD_ALT, TEXT } = useTheme();
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-medium active:scale-95 transition-transform" style={{ backgroundColor: CARD_ALT, color: color || TEXT }}>
      <Icon size={13} /> {label}
    </button>
  );
}
