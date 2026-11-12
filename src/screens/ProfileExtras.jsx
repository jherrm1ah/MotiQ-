// Profile extras: language, the costs & expenses report, and Motiq Pro.
import React, { useMemo, useState } from "react";
import { Check, Crown, Download, Loader2, Sparkles } from "lucide-react";
import { useTheme, useUI, ACCENT, GREEN, Pill, PrimaryButton, NeonButton, carLabel } from "../design.jsx";
import { saveProfile, isPro, startProCheckout } from "../lib/data.js";
import { LANGUAGES, TRANSLATED, setLanguage } from "../lib/i18n.js";
import { money, dateLabel } from "../lib/units.js";

export function LanguagePicker() {
  const { me, setMe, showToast } = useUI();
  const { CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const pick = async (code) => {
    try { const row = await saveProfile(me.id, { language: code }); setLanguage(code); setMe(row); }
    catch (e) { showToast(/language/.test(e.message) ? "Languages need one more setup step in the database." : e.message); }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {LANGUAGES.map(([code, name]) => {
          const on = (me.language || "en") === code;
          return (
            <button key={code} onClick={() => pick(code)} aria-pressed={on} className="flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium" style={on ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD_ALT, color: TEXT, border: `1px solid ${BORDER}` }}>
              {name}{on && <Check size={14} />}
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>The AI mechanic and Car Mode voice answer in your language. Main screens are translated into {LANGUAGES.filter((l) => TRANSLATED.includes(l[0]) && l[0] !== "en").map((l) => l[1]).join(", ")}; the rest of the app is in English for now.</p>
    </div>
  );
}

// Every cost Motiq knows about (services and fill-ups), by month, by car and by kind.
export function ExpensesSheet() {
  const { me, vehicles, garage, fuel, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT, FILL, BORDER } = useTheme();
  const years = useMemo(() => {
    const ys = new Set([new Date().getFullYear()]);
    for (const s of garage.services) ys.add(Number(String(s.done_on).slice(0, 4)));
    for (const f of fuel) ys.add(Number(String(f.filled_on).slice(0, 4)));
    return [...ys].sort((a, b) => b - a);
  }, [garage, fuel]);
  const [year, setYear] = useState(years[0]);
  const rows = useMemo(() => [
    ...garage.services.filter((s) => s.cost != null).map((s) => ({ date: String(s.done_on), car: s.vehicle_id, kind: s.kind === "other" ? "Repairs & other" : s.kind[0].toUpperCase() + s.kind.slice(1), what: s.title, amount: Number(s.cost), currency: s.currency })),
    ...fuel.filter((f) => f.cost != null).map((f) => ({ date: String(f.filled_on), car: f.vehicle_id, kind: "Fuel", what: `${Number(f.amount)} ${me.distance_unit === "mi" ? "gal" : "L"}`, amount: Number(f.cost), currency: f.currency })),
  ].filter((r) => r.date.startsWith(String(year)) && r.currency === me.currency).sort((a, b) => b.date.localeCompare(a.date)), [garage, fuel, year, me]);
  const total = rows.reduce((s, r) => s + r.amount, 0);
  const months = Array.from({ length: 12 }, (_, i) => rows.filter((r) => Number(r.date.slice(5, 7)) === i + 1).reduce((s, r) => s + r.amount, 0));
  const max = Math.max(1, ...months);
  const sum = (key) => Object.entries(rows.reduce((m, r) => ((m[r[key]] = (m[r[key]] || 0) + r.amount), m), {})).sort((a, b) => b[1] - a[1]);
  const carName = (id) => carLabel(vehicles.find((v) => v.id === id)) || "Removed car";

  const exportCsv = async () => {
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ["Date,Car,Kind,What,Amount,Currency", ...rows.map((r) => [r.date, carName(r.car), r.kind, r.what, r.amount.toFixed(2), r.currency].map(esc).join(","))].join("\n");
    const name = `motiq-expenses-${year}.csv`;
    const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
    try {
      if (native) {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([import("@capacitor/filesystem"), import("@capacitor/share")]);
        const { uri } = await Filesystem.writeFile({ path: name, data: csv, directory: Directory.Cache, encoding: Encoding.UTF8 });
        await Share.share({ title: name, files: [uri] });
      } else {
        const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" })); a.download = name; document.body.appendChild(a); a.click(); a.remove();
        showToast("Spreadsheet downloaded");
      }
    } catch (e) { showToast(e.message || "Couldn't export"); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="no-scrollbar flex gap-2 overflow-x-auto">{years.map((y) => <Pill key={y} small active={y === year} onClick={() => setYear(y)}>{y}</Pill>)}</div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: CARD_ALT }}>
        <p className="text-xs" style={{ color: SUB }}>Spent in {year}</p>
        <p className="text-2xl font-bold" style={{ color: TEXT }}>{money(total, me.currency)}</p>
        <div className="mt-3 flex h-20 items-end gap-1" aria-label="Spending by month">
          {months.map((m, i) => <div key={i} className="flex flex-1 flex-col items-center gap-1"><div className="w-full rounded-md" style={{ height: `${Math.max(2, (m / max) * 64)}px`, backgroundColor: m ? FILL : BORDER }} title={money(m, me.currency)} /><span style={{ fontSize: 8, color: SUB }}>{"JFMAMJJASOND"[i]}</span></div>)}
        </div>
      </div>
      {rows.length === 0 ? <p className="text-sm" style={{ color: SUB }}>No costs recorded for {year}. Add a cost when you log a service or a fill-up.</p> : (
        <>
          {[["By car", sum("car").map(([k, v]) => [carName(k), v])], ["By kind", sum("kind")]].map(([title, list]) => (
            <div key={title}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>{title}</p>
              {list.map(([k, v]) => <div key={k} className="flex items-center justify-between py-1 text-sm"><span style={{ color: TEXT }}>{k}</span><span className="font-mono" style={{ color: TEXT }}>{money(v, me.currency)}</span></div>)}
            </div>
          ))}
          <PrimaryButton onClick={exportCsv}><Download size={15} /> Export to Excel (CSV)</PrimaryButton>
        </>
      )}
      <p className="text-[11px]" style={{ color: SUB }}>Totals in {me.currency}; costs entered in other currencies aren't included.</p>
    </div>
  );
}

const PRICES = { NGN: { 1: 2500, 12: 25000 }, GHS: { 1: 30, 12: 300 }, KES: { 1: 400, 12: 4000 }, ZAR: { 1: 55, 12: 550 }, USD: { 1: 3, 12: 30 } };
export const PRO_PERKS = ["Unlimited cars (free: 2)", "100 AI mechanic questions a day (free: 15)", "Share your car's history as a PDF", "Priority for new features"];

export function UpgradeSheet() {
  const { me, showToast } = useUI();
  const { TEXT, SUB, CARD_ALT, BORDER, FILL } = useTheme();
  const currency = PRICES[me.currency] ? me.currency : "USD";
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await startProCheckout(months);
      const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (native) { const { Browser } = await import("@capacitor/browser"); await Browser.open({ url }); }
      else window.location.href = url;
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {PRO_PERKS.map((p) => <p key={p} className="flex items-center gap-2 text-sm" style={{ color: TEXT }}><Check size={15} style={{ color: GREEN }} /> {p}</p>)}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[[1, "Monthly"], [12, "Yearly"]].map(([m, label]) => (
          <button key={m} onClick={() => setMonths(m)} aria-pressed={months === m} className="flex flex-col items-start gap-0.5 rounded-2xl p-4 text-left" style={{ backgroundColor: CARD_ALT, border: `2px solid ${months === m ? FILL : BORDER}` }}>
            <span className="text-xs" style={{ color: SUB }}>{label}{m === 12 ? " · 2 months free" : ""}</span>
            <span className="text-lg font-bold" style={{ color: TEXT }}>{money(PRICES[currency][m], currency)}</span>
          </button>
        ))}
      </div>
      <NeonButton onClick={pay} disabled={busy} className="rounded-2xl py-4 text-sm">{busy ? <Loader2 size={15} className="animate-spin" /> : <Crown size={15} />} Get Motiq Pro</NeonButton>
      <p className="text-[11px] leading-relaxed" style={{ color: SUB }}>Paid securely with Paystack (card, bank or mobile money). Pro starts as soon as the payment goes through. It doesn't renew by itself.</p>
    </div>
  );
}

export function ProCard() {
  const { me, openSheet } = useUI();
  const { TEXT, SUB, CARD, BORDER } = useTheme();
  const pro = isPro(me);
  return (
    <button onClick={() => !pro && openSheet("Motiq Pro", <UpgradeSheet />)} className="flex items-center gap-3 p-4 text-left active:scale-[0.98] transition-transform" style={{ borderRadius: 24, backgroundColor: pro ? "rgba(239,255,0,0.1)" : CARD, border: `1px solid ${pro ? "rgba(239,255,0,0.4)" : BORDER}` }}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: ACCENT }}><Crown size={17} color="#000" /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: TEXT }}>{pro ? "Motiq Pro" : "Upgrade to Motiq Pro"}</p>
        <p className="text-xs" style={{ color: SUB }}>{pro ? (me.pro_until ? `Active until ${dateLabel(me.pro_until)}` : "Active") : "More cars, more AI, history PDF"}</p>
      </div>
      {!pro && <Sparkles size={16} style={{ color: SUB }} />}
    </button>
  );
}
