// Profile: who you are, your stats, and settings (account, appearance, units, alerts, music,
// documents & warranty, privacy, help). Also the first-run welcome where you pick your country.
import React, { useState } from "react";
import { Globe, Wallet, User, Sun, Moon, Gauge, Bell, Music2, FileText, Shield, HelpCircle, ChevronRight, LogOut, Mail, Plus, Trash2, ShieldCheck, Loader2, Car } from "lucide-react";
import { t } from "../lib/i18n.js";
import { useTheme, useUI, RED, AMBER, GREEN, ACCENT, Field, Pill, PrimaryButton, SecondaryButton, ToggleRow, Stat, TrackThumb, Logo, carLabel } from "../design.jsx";
import { saveProfile, clearAiHistory, addDocument, deleteDocument, unblockUser } from "../lib/data.js";
import { LanguagePicker, ExpensesSheet, ProCard } from "./ProfileExtras.jsx";
import { canNotify, askNotificationPermission, syncReminders } from "../lib/notify.js";
import { COUNTRIES, CURRENCIES, defaultsFor, guessCountry, countryName, daysUntil, dateLabel } from "../lib/units.js";

export function ProfileForm({ submitLabel = "Save", onSaved }) {
  const { me, setMe, showToast } = useUI();
  const guessed = me.country || guessCountry();
  const [p, setP] = useState({ name: me.name || "", country: guessed, city: me.city || "", phone: me.phone || "", ...(!me.country && guessed ? defaultsFor(guessed) : { currency: me.currency, distance_unit: me.distance_unit }) });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!p.country) return showToast("Choose your country.");
    setBusy(true);
    try {
      const row = await saveProfile(me.id, { name: p.name.trim().slice(0, 60), country: p.country, city: p.city.trim().slice(0, 60), phone: p.phone.trim().slice(0, 20), currency: p.currency, distance_unit: p.distance_unit });
      setMe(row); showToast("Saved"); onSaved && onSaved(row);
    } catch (err) { showToast(err.message); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <Field label="Your name" value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} autoComplete="name" />
      <Field label="Country" as="select" value={p.country} onChange={(e) => setP({ ...p, country: e.target.value, ...defaultsFor(e.target.value) })}>
        <option value="">Choose your country</option>
        {COUNTRIES.slice().sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </Field>
      <Field label="City (for the market)" value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Currency" as="select" value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Field>
        <Field label="Phone (optional)" value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} inputMode="tel" />
      </div>
      <div>
        <p className="mb-1.5 text-xs font-medium" style={{ color: useTheme().SUB }}>Distance</p>
        <div className="flex gap-2">{[["km", "Kilometres"], ["mi", "Miles"]].map(([v, l]) => <Pill key={v} small active={p.distance_unit === v} onClick={() => setP({ ...p, distance_unit: v })}>{l}</Pill>)}</div>
      </div>
      <PrimaryButton type="submit" disabled={busy} className="mt-1">{busy && <Loader2 size={15} className="animate-spin" />}{submitLabel}</PrimaryButton>
    </form>
  );
}

export function Welcome() {
  const { me } = useUI();
  const { TEXT, SUB, CARD, BORDER } = useTheme();
  return (
    <div className="flex flex-col gap-5 px-5 pb-10 pt-10">
      <Logo size={48} />
      <div>
        <h1 className="font-bold tracking-tight" style={{ fontSize: 24, color: TEXT }}>Welcome to Motiq{me.name ? `, ${me.name.split(" ")[0]}` : ""}</h1>
        <p className="mt-1 text-sm" style={{ color: SUB }}>Two quick things so prices and distances look right.</p>
      </div>
      <div className="p-5" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}><ProfileForm submitLabel="Continue" /></div>
    </div>
  );
}

const DOC_TYPES = [["warranty", "Warranty", ShieldCheck], ["registration", "Registration", FileText], ["insurance", "Insurance", Shield], ["other", "Other", FileText]];
const expiryColor = (d) => (d == null ? null : d < 0 ? RED : d <= 30 ? AMBER : GREEN);
const expiryLabel = (d) => (d == null ? "No expiry date" : d < 0 ? `Expired ${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "Expires today" : `Expires in ${d} day${d === 1 ? "" : "s"}`);

function DocumentsSheet() {
  const { uid, vehicles, documents, setDocuments, showToast, confirm } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return showToast("Give it a title.");
    setBusy(true);
    try { const row = await addDocument(uid, form); setDocuments((d) => [...d, row].sort((a, b) => String(a.expires_on || "9").localeCompare(String(b.expires_on || "9")))); setForm(null); showToast("Document saved"); }
    catch (err) { showToast(/vehicle_documents/.test(err.message) ? "Documents need one more setup step in the database." : err.message); }
    setBusy(false);
  };
  const groups = vehicles.map((v) => ({ v, docs: documents.filter((d) => d.vehicle_id === v.id) })).filter((g) => g.docs.length);
  return (
    <div className="flex flex-col gap-4">
      {vehicles.length === 0 ? (
        <p className="rounded-2xl py-6 text-center text-xs" style={{ backgroundColor: CARD_ALT, color: SUB }}>Add a car in Garage before adding documents for it.</p>
      ) : !form ? (
        <PrimaryButton onClick={() => setForm({ vehicle_id: vehicles[0].id, kind: "warranty", title: "", expires_on: "", notes: "" })}><Plus size={15} /> Add document</PrimaryButton>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3 rounded-2xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">{vehicles.map((v) => <Pill key={v.id} small active={form.vehicle_id === v.id} onClick={() => setForm({ ...form, vehicle_id: v.id })}>{carLabel(v)}</Pill>)}</div>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">{DOC_TYPES.map(([k, l, Icon]) => <Pill key={k} small active={form.kind === k} onClick={() => setForm({ ...form, kind: k, title: form.title || (k === "other" ? "" : l) })}><span className="flex items-center gap-1"><Icon size={12} />{l}</span></Pill>)}</div>
          <Field label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Extended warranty" />
          <Field label="Expires on" type="date" value={form.expires_on} onChange={(e) => setForm({ ...form, expires_on: e.target.value })} />
          <Field label="Notes (optional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Policy number, cover, insurer…" />
          <div className="grid grid-cols-2 gap-2">
            <SecondaryButton onClick={() => setForm(null)}>Cancel</SecondaryButton>
            <PrimaryButton type="submit" disabled={busy}>Save</PrimaryButton>
          </div>
        </form>
      )}
      {groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <FileText size={18} style={{ color: SUB }} />
          <p className="text-sm font-medium" style={{ color: TEXT }}>No documents yet</p>
          <p className="max-w-[240px] text-xs leading-relaxed" style={{ color: SUB }}>Add warranties, registration and insurance. Motiq reminds you 30 days before they expire.</p>
        </div>
      ) : groups.map(({ v, docs }) => (
        <div key={v.id} className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>{carLabel(v)}</p>
          {docs.map((d) => {
            const days = d.expires_on ? daysUntil(d.expires_on) : null;
            const Icon = (DOC_TYPES.find((t) => t[0] === d.kind) || DOC_TYPES[3])[2];
            return (
              <div key={d.id} className="flex items-start gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: CARD_ALT }}><Icon size={14} style={{ color: SUB }} /></div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium" style={{ color: TEXT }}>{d.title}</p>
                  {d.notes && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{d.notes}</p>}
                  <p className="mt-1 text-xs font-medium" style={{ color: expiryColor(days) || SUB }}>{expiryLabel(days)}{d.expires_on ? ` · ${dateLabel(d.expires_on)}` : ""}</p>
                </div>
                <button onClick={() => confirm("Delete document?", `"${d.title}" will be removed.`, "Delete", async () => { await deleteDocument(d.id); setDocuments((x) => x.filter((y) => y.id !== d.id)); })} aria-label={`Delete ${d.title}`} className="shrink-0 rounded-full p-1.5" style={{ backgroundColor: CARD_ALT }}><Trash2 size={12} style={{ color: RED }} /></button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function AppearancePicker() {
  const { CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT, mode, setMode } = useTheme();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>Same Motiq in both modes — only the surfaces invert.</p>
      <div className="grid grid-cols-2 gap-3">
        {[["light", "Light", Sun], ["dark", "Dark", Moon]].map(([k, l, Icon]) => (
          <button key={k} onClick={() => setMode(k)} aria-pressed={mode === k} className="flex flex-col items-center gap-2 rounded-2xl py-4 active:scale-95 transition-transform" style={mode === k ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD_ALT, color: TEXT, border: `1px solid ${BORDER}` }}>
            <Icon size={18} /><span className="text-xs font-semibold">{l}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function UnitsPicker() {
  const { me, setMe, showToast } = useUI();
  const { CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const pick = async (u) => { try { setMe(await saveProfile(me.id, { distance_unit: u })); } catch (e) { showToast(e.message); } };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>Used for speed, distance, odometer and temperature across Motiq.</p>
      <div className="grid grid-cols-2 gap-3">
        {[["mi", "Imperial", "mph · mi · °F"], ["km", "Metric", "km/h · km · °C"]].map(([k, l, s]) => (
          <button key={k} onClick={() => pick(k)} aria-pressed={me.distance_unit === k} className="flex flex-col items-center gap-1 rounded-2xl py-4 active:scale-95 transition-transform" style={me.distance_unit === k ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD_ALT, color: TEXT, border: `1px solid ${BORDER}` }}>
            <span className="text-xs font-semibold">{l}</span><span className="text-[10px]" style={{ opacity: 0.75 }}>{s}</span>
          </button>
        ))}
      </div>
      <p className="text-[11px]" style={{ color: SUB }}>Changing this doesn't convert odometer readings you've already entered.</p>
    </div>
  );
}

function AlertsPicker() {
  const { prefs, setPrefs, garage, documents, showToast } = useUI();
  const { SUB } = useTheme();
  const row = (label, key) => <ToggleRow label={label} on={prefs[key] !== false} onChange={(v) => setPrefs({ ...prefs, [key]: v })} />;
  return (
    <div className="flex flex-col gap-4">
      {row("Service due and overdue", "alertsService")}
      {row("Fault codes from scans", "alertsScans")}
      {row("Documents about to expire", "alertsDocuments")}
      {row("Trip alerts", "alertsTrips")}
      <ToggleRow label="Start trips automatically when I drive (while Motiq is open)" on={!!prefs.autoTrips} onChange={(v) => setPrefs({ ...prefs, autoTrips: v })} />
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>These show in the bell on Home.{canNotify() ? " In the app, Motiq also reminds you on your phone: 3 days before a service is due and 2 weeks before a document expires." : " Phone reminders work in the Motiq Android app."}</p>
      {canNotify() && <PrimaryButton onClick={async () => { const ok = await askNotificationPermission(); if (ok) { await syncReminders({ vehicles: garage.cars, reminders: garage.reminders, documents, prefs }); showToast("Phone reminders are on"); } else showToast("Allow notifications for Motiq in your phone's settings"); }}><Bell size={15} /> Turn on phone reminders</PrimaryButton>}
    </div>
  );
}

function MusicInfo() {
  const { current, isPlaying, queue, favorites, goTo } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>Car Mode Radio streams free Creative Commons music from Jamendo — no account needed. Spotify, Apple Music and YouTube Music aren't connected yet.</p>
      {current ? (
        <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD_ALT }}>
          <TrackThumb src={current.image} size={38} />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" style={{ color: TEXT }}>{current.name}</p><p className="truncate text-xs" style={{ color: SUB }}>{isPlaying ? "Now playing" : "Paused"} · {current.artist}</p></div>
        </div>
      ) : <div className="flex items-center gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD_ALT }}><Music2 size={16} style={{ color: TEXT }} /><p className="text-sm" style={{ color: TEXT }}>Nothing playing right now</p></div>}
      <div className="grid grid-cols-2 gap-3">
        {[[queue.length, "Queued"], [favorites.length, "Favourites"]].map(([n, l]) => <div key={l} className="rounded-2xl p-3 text-center" style={{ backgroundColor: CARD_ALT }}><p className="text-base font-semibold" style={{ color: TEXT }}>{n}</p><p style={{ fontSize: 11, color: SUB }}>{l}</p></div>)}
      </div>
      <PrimaryButton onClick={() => goTo("music")}><Music2 size={15} /> Open Car Mode Radio</PrimaryButton>
    </div>
  );
}

function PrivacySheet() {
  const { uid, confirm, showToast, blocks, setBlocks } = useUI();
  const { SUB, TEXT, CARD_ALT } = useTheme();
  return (
    <div className="flex flex-col gap-3 text-sm" style={{ color: SUB }}>
      <p className="leading-relaxed">Your cars, service history, scans, documents, trips and AI chats are private to your account. Only your market listings (and your name and city on them) are public.</p>
      <p className="leading-relaxed">Your location is used on this phone to find places near you and track trips. It isn't stored, except the start and end names of trips you save.</p>
      <p className="leading-relaxed">Questions and photos you send to the AI mechanic are processed by Anthropic's Claude to answer you.</p>
      {blocks.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD_ALT }}>
          <span className="text-sm" style={{ color: TEXT }}>{blocks.length} blocked {blocks.length === 1 ? "person" : "people"}</span>
          <button onClick={async () => { for (const b of blocks) await unblockUser(uid, b).catch(() => {}); setBlocks([]); showToast("Unblocked everyone"); }} className="text-xs font-semibold" style={{ color: TEXT }}>Unblock all</button>
        </div>
      )}
      <SecondaryButton color={RED} onClick={() => confirm("Delete your AI chats?", "Deletes every conversation with the AI mechanic, for all your cars.", "Delete", async () => { await clearAiHistory(uid); showToast("AI chats deleted"); })}>Delete my AI chats</SecondaryButton>
    </div>
  );
}

function HelpSheet() {
  const { SUB, TEXT } = useTheme();
  const items = [
    ["Connecting an adapter", "Plug a Bluetooth Low Energy (BLE) OBD-II adapter into the port under the dashboard, turn the ignition on, then Connect on Home or in the Garage."],
    ["Scans and fault codes", "A scan reads stored and pending codes and live readings. Tap Explain to get it in plain words. Clearing codes turns off the check engine light but doesn't fix the cause."],
    ["Car Mode", "Opens a big, simple screen with music and a voice co-pilot. Tap the mic and ask anything; Motiq answers out loud. Pull over before typing."],
    ["Safety", "Motiq's advice is a guide, not a replacement for a qualified mechanic. For brakes, steering, airbags, smoke, fuel smell or overheating, stop and get help."],
  ];
  return (
    <div className="flex flex-col gap-4">
      {items.map(([t, b]) => <div key={t}><p className="text-sm font-semibold" style={{ color: TEXT }}>{t}</p><p className="mt-1 text-xs leading-relaxed" style={{ color: SUB }}>{b}</p></div>)}
    </div>
  );
}

export default function Profile() {
  const { me, email: authEmail, vehicles, garage, openSheet, closeSheet, confirm, signOut, goTo } = useUI();
  const theme = useTheme();
  const { CARD, TEXT, SUB, BORDER, FILL } = theme;
  const since = me.created_at ? new Date(me.created_at).toLocaleDateString(undefined, { month: "short", year: "2-digit" }).replace(" ", " '") : "—";
  const items = [
    ["Account details", User, () => <ProfileForm onSaved={closeSheet} />],
    ["Appearance", theme.mode === "dark" ? Moon : Sun, () => <AppearancePicker />],
    ["Units", Gauge, () => <UnitsPicker />],
    ["Notifications", Bell, () => <AlertsPicker />],
    ["Language", Globe, () => <LanguagePicker />],
    ["Costs & expenses", Wallet, () => <ExpensesSheet />],
    ["Music & media", Music2, () => <MusicInfo />],
    ["Documents & warranty", FileText, () => <DocumentsSheet />],
    ["Privacy & security", Shield, () => <PrivacySheet />],
    ["Help & support", HelpCircle, () => <HelpSheet />],
  ];
  if (me.is_admin) items.push(["Admin", ShieldCheck, null]);
  return (
    <div className="flex flex-col gap-6 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold" style={{ backgroundColor: CARD, color: TEXT, boxShadow: `0 0 0 3px ${FILL}` }}>{(me.name || authEmail || "M").trim()[0].toUpperCase()}</div>
        <div>
          <p className="font-semibold" style={{ fontSize: 17, color: TEXT }}>{me.name || "Motiq driver"}</p>
          {authEmail && <p className="mt-0.5 flex items-center justify-center gap-1 text-xs" style={{ color: SUB }}><Mail size={11} /> {authEmail}</p>}
          <p className="mt-0.5 text-xs" style={{ color: SUB }}>{[me.city, countryName(me.country)].filter(Boolean).join(", ")}</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[[String(vehicles.length), vehicles.length === 1 ? "Vehicle" : "Vehicles"], [String(garage.scans.length), "Scans run"], [since, "Member since"]].map(([val, label]) => (
          <div key={label} className="px-3 py-4 text-center" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <p className="text-base font-semibold" style={{ color: TEXT }}>{val}</p>
            <p className="mt-0.5" style={{ fontSize: 10, color: SUB }}>{label}</p>
          </div>
        ))}
      </div>
      <ProCard />
      <div style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        {items.map(([label, Icon, body], i) => (
          <button key={label} onClick={() => (body ? openSheet(t(label), body()) : goTo("admin"))} className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors" style={i !== items.length - 1 ? { borderBottom: `1px solid ${BORDER}` } : {}}>
            <Icon size={16} style={{ color: SUB }} /><span className="flex-1 text-sm" style={{ color: TEXT }}>{t(label)}</span><ChevronRight size={15} style={{ color: SUB }} />
          </button>
        ))}
      </div>
      <button onClick={() => confirm("Sign out?", "You'll need to sign back in to see your garage and history.", "Sign out", signOut)} className="flex items-center justify-center gap-2 py-4 text-sm font-medium active:scale-95 transition-transform" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}`, color: RED }}>
        <LogOut size={15} /> {t("Sign out")}
      </button>
      <p className="text-center" style={{ fontSize: 10, color: SUB }}>Motiq's advice is a guide, not a replacement for a qualified mechanic.</p>
    </div>
  );
}
