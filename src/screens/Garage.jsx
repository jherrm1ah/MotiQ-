import React, { useState } from "react";
import { Car, Plus, Wrench, Bell, Gauge, MessageCircle, Mic, Check, Trash2, Pencil, Activity, Settings } from "lucide-react";
import { C, Screen, Card, Button, Field, input, Chip, Sheet, Empty, Badge, toast, iconBtn } from "../ui.jsx";
import { saveCar, deleteCar, addService, deleteService, addReminder, completeReminder, deleteReminder, healthOf, reminderState, reminderTemplates, updateOdometer } from "../lib/data.js";
import { money, distance, dateLabel, daysUntil, todayISO } from "../lib/units.js";
import { describeCode } from "../lib/dtc.js";

const FUELS = [["petrol", "Petrol"], ["diesel", "Diesel"], ["hybrid", "Hybrid"], ["electric", "Electric"], ["lpg", "LPG / CNG"], ["other", "Other"]];
const GEARS = [["automatic", "Automatic"], ["manual", "Manual"], ["cvt", "CVT"], ["other", "Other"]];
const SERVICE_KINDS = [["oil", "Oil"], ["tyres", "Tyres"], ["brakes", "Brakes"], ["battery", "Battery"], ["filters", "Filters"], ["fluids", "Fluids"], ["inspection", "Inspection"], ["repair", "Repair"], ["other", "Other"]];

export const carName = (car) => car.nickname || [car.year, car.make, car.model].filter(Boolean).join(" ");

function HealthRing({ score, tone }) {
  const col = tone === "good" ? C.accent : tone === "warn" ? C.warn : C.bad;
  const r = 34, len = 2 * Math.PI * r;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" role="img" aria-label={`Health ${score} out of 100`}>
      <circle cx="42" cy="42" r={r} fill="none" stroke={C.line} strokeWidth="8" />
      <circle cx="42" cy="42" r={r} fill="none" stroke={col} strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(score / 100) * len} ${len}`} transform="rotate(-90 42 42)" />
      <text x="42" y="48" textAnchor="middle" fill={C.text} fontSize="22" fontWeight="800" fontFamily="Inter, sans-serif">{score}</text>
    </svg>
  );
}

export default function Garage({ me, garage, carId, setCarId, reload, go, openSettings }) {
  const [sheet, setSheet] = useState(null); // {type: "car"|"service"|"reminder"|"odometer", data}
  const cars = garage.cars;
  const car = cars.find((c) => c.id === carId) || cars[0];
  const unit = me.distance_unit;

  if (!cars.length) {
    return (
      <Screen title={`Hi${me.name ? `, ${me.name.split(" ")[0]}` : ""}`} subtitle="Let's get your car set up." right={<button style={iconBtn} aria-label="Settings" onClick={openSettings}><Settings size={18} /></button>}>
        <Empty icon={Car} title="Add your first car" body="Motiq keeps its service history, reminds you what's due, reads its fault codes and answers questions about it." action="Add a car" onAction={() => setSheet({ type: "car", data: {} })} />
        {sheet && <CarSheet me={me} data={sheet.data} onClose={() => setSheet(null)} onSaved={async (c) => { setSheet(null); await reload(); setCarId(c.id); toast("Car added"); }} />}
      </Screen>
    );
  }

  const h = healthOf(car, garage);
  const services = garage.services.filter((s) => s.vehicle_id === car.id);
  const reminders = garage.reminders.filter((r) => r.vehicle_id === car.id && !r.done_at)
    .sort((a, b) => ["overdue", "soon", "later"].indexOf(reminderState(a, car.odometer)) - ["overdue", "soon", "later"].indexOf(reminderState(b, car.odometer)));
  const spent = services.reduce((sum, s) => sum + (s.currency === me.currency && s.cost ? Number(s.cost) : 0), 0);

  return (
    <Screen title="Garage" subtitle={distance(car.odometer, unit) + " on the clock"} right={<div style={{ display: "flex", gap: 8 }}><button style={iconBtn} aria-label="Settings" onClick={openSettings}><Settings size={18} /></button><button style={iconBtn} aria-label="Add a car" onClick={() => setSheet({ type: "car", data: {} })}><Plus size={20} /></button></div>}>
      {cars.length > 1 && (
        <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, scrollbarWidth: "none" }}>
          {cars.map((c) => <Chip key={c.id} active={c.id === car.id} onClick={() => setCarId(c.id)}>{carName(c)}</Chip>)}
        </div>
      )}

      <Card style={{ padding: 18, background: `linear-gradient(160deg, ${C.raised}, ${C.surface})` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <HealthRing score={h.score} tone={h.tone} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 19, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{carName(car)}</p>
            <p style={{ margin: "3px 0 8px", color: h.tone === "good" ? C.accent : h.tone === "warn" ? C.warn : C.bad, fontWeight: 700, fontSize: 14 }}>{h.label}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {h.notes.slice(0, 3).map((n, i) => <Badge key={i} tone={n.tone === "bad" ? "bad" : n.tone === "warn" ? "warn" : "muted"}>{n.text}</Badge>)}
            </div>
          </div>
          <button style={{ ...iconBtn, width: 36, height: 36 }} aria-label="Edit car" onClick={() => setSheet({ type: "car", data: car })}><Pencil size={16} /></button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginTop: 16 }}>
          {[[Activity, "Scan", () => go("diagnose")], [MessageCircle, "Ask", () => go("ask")], [Mic, "Car Mode", () => go("carmode")], [Gauge, "Odometer", () => setSheet({ type: "odometer" })]].map(([Icon, label, fn]) => (
            <button key={label} onClick={fn} style={{ padding: "12px 4px", borderRadius: 14, border: `1px solid ${C.line}`, background: C.bg, color: C.text, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 700, fontFamily: "inherit" }}>
              <Icon size={20} color={C.accent} />{label}
            </button>
          ))}
        </div>
      </Card>

      {h.scan && (h.scan.codes || []).length > 0 && (
        <Card style={{ marginTop: 12, borderColor: C.warn }} onClick={() => go("diagnose")}>
          <p style={{ margin: 0, fontWeight: 800 }}>Fault codes from your last scan</p>
          {(h.scan.codes || []).slice(0, 3).map((c) => <p key={c.code} style={{ margin: "6px 0 0", fontSize: 14, color: C.sub }}><b style={{ color: C.text }}>{c.code}</b> · {describeCode(c.code)}</p>)}
          <p style={{ margin: "10px 0 0", color: C.accent, fontWeight: 700, fontSize: 14 }}>See what to do →</p>
        </Card>
      )}

      <Section title="Coming up" action={<Button kind="ghost" onClick={() => setSheet({ type: "reminder" })} style={{ padding: 6 }}><Plus size={16} /> Reminder</Button>}>
        {reminders.length === 0 ? (
          <Empty icon={Bell} title="No reminders yet" body="Add oil changes, tyres, insurance and licence renewals, and Motiq will tell you when they're due." action="Add a reminder" onAction={() => setSheet({ type: "reminder" })} />
        ) : reminders.map((r) => {
          const st = reminderState(r, car.odometer);
          const when = [r.due_on && (daysUntil(r.due_on) < 0 ? `${-daysUntil(r.due_on)} days overdue` : daysUntil(r.due_on) === 0 ? "today" : `in ${daysUntil(r.due_on)} days`), r.due_odometer != null && `at ${distance(r.due_odometer, unit)}`].filter(Boolean).join(" · ");
          return (
            <Card key={r.id} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, flexShrink: 0, background: st === "overdue" ? C.bad : st === "soon" ? C.warn : C.accent }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>{r.title}</p>
                <p style={{ margin: "2px 0 0", fontSize: 13, color: st === "overdue" ? C.bad : C.sub }}>{when}{(r.every_months || r.every_distance) ? " · repeats" : ""}</p>
              </div>
              <button style={{ ...iconBtn, width: 36, height: 36, color: C.accent }} aria-label={`Mark ${r.title} done`} onClick={async () => {
                try { await completeReminder(me.id, r, car.odometer); await addService(me.id, car.id, { kind: r.kind === "insurance" || r.kind === "licence" ? "other" : r.kind, title: r.title, odometer: car.odometer }, me.currency); await reload(); toast(r.every_months || r.every_distance ? "Done. Next one is set." : "Done"); } catch (e) { toast(e.message); }
              }}><Check size={18} /></button>
              <button style={{ ...iconBtn, width: 36, height: 36 }} aria-label={`Delete ${r.title}`} onClick={async () => { if (!window.confirm(`Delete "${r.title}"?`)) return; await deleteReminder(r.id); await reload(); }}><Trash2 size={16} /></button>
            </Card>
          );
        })}
      </Section>

      <Section title="Service history" subtitle={spent > 0 ? `${money(spent, me.currency)} spent so far` : null} action={<Button kind="ghost" onClick={() => setSheet({ type: "service" })} style={{ padding: 6 }}><Plus size={16} /> Add</Button>}>
        {services.length === 0 ? (
          <Empty icon={Wrench} title="Nothing logged yet" body="Log services and repairs to keep a full history. It helps the AI mechanic, and it helps when you sell the car." action="Log a service" onAction={() => setSheet({ type: "service" })} />
        ) : services.slice(0, 30).map((s) => (
          <Card key={s.id} style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
            <Wrench size={18} color={C.sub} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{s.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 13, color: C.sub }}>{[dateLabel(s.done_on), s.odometer != null && distance(s.odometer, unit), s.shop].filter(Boolean).join(" · ")}</p>
            </div>
            {s.cost != null && <span style={{ fontWeight: 700, fontSize: 14 }}>{money(s.cost, s.currency)}</span>}
            <button style={{ ...iconBtn, width: 34, height: 34 }} aria-label={`Delete ${s.title}`} onClick={async () => { if (!window.confirm(`Delete "${s.title}"?`)) return; await deleteService(s.id); await reload(); }}><Trash2 size={15} /></button>
          </Card>
        ))}
      </Section>

      {sheet?.type === "car" && <CarSheet me={me} data={sheet.data} onClose={() => setSheet(null)} onSaved={async (c) => { setSheet(null); await reload(); setCarId(c.id); toast("Saved"); }} onDeleted={async () => { setSheet(null); await reload(); setCarId(null); toast("Car removed"); }} />}
      {sheet?.type === "service" && <ServiceSheet me={me} car={car} onClose={() => setSheet(null)} onSaved={async () => { setSheet(null); await reload(); toast("Logged"); }} />}
      {sheet?.type === "reminder" && <ReminderSheet me={me} car={car} onClose={() => setSheet(null)} onSaved={async () => { setSheet(null); await reload(); toast("Reminder added"); }} />}
      {sheet?.type === "odometer" && <OdometerSheet me={me} car={car} onClose={() => setSheet(null)} onSaved={async () => { setSheet(null); await reload(); toast("Odometer updated"); }} />}
    </Screen>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <section style={{ marginTop: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{title}</h2>
          {subtitle && <p style={{ margin: "2px 0 0", color: C.sub, fontSize: 13 }}>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function CarSheet({ me, data, onClose, onSaved, onDeleted }) {
  const [c, setC] = useState({ fuel: "petrol", transmission: "automatic", ...data });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  const save = async () => {
    if (!c.make?.trim() || !c.model?.trim()) return toast("Add the make and model.");
    if (c.year && (c.year < 1950 || c.year > new Date().getFullYear() + 1)) return toast("Check the year.");
    setBusy(true);
    try { onSaved(await saveCar(me.id, c)); } catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <Sheet title={c.id ? "Edit car" : "Add a car"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Make"><input style={input} value={c.make || ""} onChange={set("make")} placeholder="Toyota" /></Field>
        <Field label="Model"><input style={input} value={c.model || ""} onChange={set("model")} placeholder="Corolla" /></Field>
        <Field label="Year"><input style={input} inputMode="numeric" value={c.year || ""} onChange={set("year")} placeholder="2016" /></Field>
        <Field label={`Odometer (${me.distance_unit})`}><input style={input} inputMode="numeric" value={c.odometer ?? ""} onChange={set("odometer")} placeholder="85000" /></Field>
      </div>
      <Field label="Fuel"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{FUELS.map(([v, l]) => <Chip key={v} active={c.fuel === v} onClick={() => setC({ ...c, fuel: v })}>{l}</Chip>)}</div></Field>
      <Field label="Gearbox"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{GEARS.map(([v, l]) => <Chip key={v} active={c.transmission === v} onClick={() => setC({ ...c, transmission: v })}>{l}</Chip>)}</div></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Nickname (optional)"><input style={input} value={c.nickname || ""} onChange={set("nickname")} placeholder="Daily driver" /></Field>
        <Field label="Plate (optional)"><input style={input} value={c.plate || ""} onChange={set("plate")} /></Field>
      </div>
      <Field label="VIN (optional)" hint="17 characters, on the windscreen or door frame. Helps with exact parts."><input style={input} value={c.vin || ""} onChange={set("vin")} maxLength={17} /></Field>
      <Button onClick={save} disabled={busy} style={{ width: "100%" }}>{busy ? "Saving…" : c.id ? "Save" : "Add car"}</Button>
      {c.id && <Button kind="danger" style={{ width: "100%", marginTop: 10 }} onClick={async () => { if (!window.confirm(`Remove ${carName(c)} and all its history?`)) return; await deleteCar(c.id); onDeleted(); }}>Remove this car</Button>}
    </Sheet>
  );
}

function ServiceSheet({ me, car, onClose, onSaved }) {
  const [s, setS] = useState({ kind: "oil", title: "", done_on: todayISO(), odometer: car.odometer || "", cost: "", shop: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  return (
    <Sheet title="Log a service" onClose={onClose}>
      <Field label="What was done"><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>{SERVICE_KINDS.map(([v, l]) => <Chip key={v} active={s.kind === v} onClick={() => setS({ ...s, kind: v, title: s.title || (v === "oil" ? "Oil and filter change" : l) })}>{l}</Chip>)}</div>
        <input style={input} value={s.title} onChange={set("title")} placeholder="Oil and filter change" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Date"><input style={input} type="date" value={s.done_on} onChange={set("done_on")} /></Field>
        <Field label={`Odometer (${me.distance_unit})`}><input style={input} inputMode="numeric" value={s.odometer} onChange={set("odometer")} /></Field>
        <Field label={`Cost (${me.currency})`}><input style={input} inputMode="decimal" value={s.cost} onChange={set("cost")} /></Field>
        <Field label="Shop (optional)"><input style={input} value={s.shop} onChange={set("shop")} /></Field>
      </div>
      <Field label="Notes (optional)"><textarea style={{ ...input, minHeight: 70 }} value={s.notes} onChange={set("notes")} /></Field>
      <Button style={{ width: "100%" }} disabled={busy} onClick={async () => {
        if (!s.title.trim()) return toast("Say what was done.");
        setBusy(true);
        try {
          await addService(me.id, car.id, s, me.currency);
          if (s.odometer && Number(s.odometer) > (car.odometer || 0)) await updateOdometer(car.id, Number(s.odometer));
          onSaved();
        } catch (e) { toast(e.message); }
        setBusy(false);
      }}>{busy ? "Saving…" : "Save"}</Button>
    </Sheet>
  );
}

function ReminderSheet({ me, car, onClose, onSaved }) {
  const [r, setR] = useState({ kind: "other", title: "", due_on: "", due_odometer: "", every_months: "", every_distance: "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setR({ ...r, [k]: e.target.value });
  const pick = (t) => {
    const d = new Date(); d.setMonth(d.getMonth() + (t.every_months || 6));
    setR({ kind: t.kind, title: t.title, due_on: d.toISOString().slice(0, 10), due_odometer: t.every_distance ? (car.odometer || 0) + t.every_distance : "", every_months: t.every_months || "", every_distance: t.every_distance || "" });
  };
  return (
    <Sheet title="Add a reminder" onClose={onClose}>
      <p style={{ margin: "0 0 8px", color: C.sub, fontSize: 13 }}>Pick one, or write your own:</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>{reminderTemplates(me.distance_unit).map((t) => <Chip key={t.title} active={r.title === t.title} onClick={() => pick(t)}>{t.title}</Chip>)}</div>
      <Field label="Reminder"><input style={input} value={r.title} onChange={set("title")} placeholder="Oil and filter change" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Due on"><input style={input} type="date" value={r.due_on} onChange={set("due_on")} /></Field>
        <Field label={`or at (${me.distance_unit})`}><input style={input} inputMode="numeric" value={r.due_odometer} onChange={set("due_odometer")} /></Field>
        <Field label="Repeat every (months)"><input style={input} inputMode="numeric" value={r.every_months} onChange={set("every_months")} /></Field>
        <Field label={`or every (${me.distance_unit})`}><input style={input} inputMode="numeric" value={r.every_distance} onChange={set("every_distance")} /></Field>
      </div>
      <Button style={{ width: "100%" }} disabled={busy} onClick={async () => {
        if (!r.title.trim()) return toast("Name the reminder.");
        if (!r.due_on && !r.due_odometer) return toast("Add a date or a distance it's due at.");
        setBusy(true);
        try { await addReminder(me.id, car.id, r); onSaved(); } catch (e) { toast(e.message); }
        setBusy(false);
      }}>{busy ? "Saving…" : "Add reminder"}</Button>
    </Sheet>
  );
}

function OdometerSheet({ me, car, onClose, onSaved }) {
  const [v, setV] = useState(car.odometer || "");
  return (
    <Sheet title="Update odometer" onClose={onClose}>
      <Field label={`Current reading (${me.distance_unit})`} hint="Keeps distance-based reminders accurate."><input style={input} inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} autoFocus /></Field>
      <Button style={{ width: "100%" }} onClick={async () => {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) return toast("Enter a number.");
        if (n < (car.odometer || 0) && !window.confirm("That's lower than before. Save anyway?")) return;
        try { await updateOdometer(car.id, n); onSaved(); } catch (e) { toast(e.message); }
      }}>Save</Button>
    </Sheet>
  );
}
