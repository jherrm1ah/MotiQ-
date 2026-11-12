// Motiq's design system: the dark/light themes, the neon accent and the small building blocks
// every screen shares (cards, sheets, toasts, rings, badges). Screens read colours with useTheme()
// and app-wide actions (navigate, open a sheet, toast, OBD, trips, music) with useUI().
import React, { Component, createContext, useContext, useEffect, useState } from "react";
import { X, ChevronRight, ArrowLeft, AlertTriangle, Disc3, ShieldAlert, ShieldCheck, ShieldQuestion } from "lucide-react";

// The neon stays the same in both modes; only the surfaces and text invert.
export const ACCENT = "#EFFF00";
export const RED = "#F4553D";
export const AMBER = "#F5B944";
export const GREEN = "#3DDC84";
export const BLUE = "#4C8DF5";
export const PURPLE = "#B084F5";
export const CYAN = "#4CD5D9";

export const THEMES = {
  dark: {
    BG: "#212121", CARD: "rgba(97,97,97,0.14)", CARD_ALT: "rgba(97,97,97,0.08)", TEXT: "#FFFFFF", SUB: "#E0E0E0",
    BORDER: "rgba(224,224,224,0.14)", RING_TRACK: "rgba(224,224,224,0.14)", FILL: "#FFFFFF", FILL_TEXT: "#212121",
  },
  light: {
    BG: "#E0E0E0", CARD: "#FFFFFF", CARD_ALT: "#F5F5F5", TEXT: "#212121", SUB: "#616161",
    BORDER: "#E0E0E0", RING_TRACK: "#E0E0E0", FILL: "#212121", FILL_TEXT: "#FFFFFF",
  },
};

export const ThemeContext = createContext(null);
export const useTheme = () => useContext(ThemeContext);
export const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

// Small local preferences (theme, selected car, music favourites) kept on this phone.
export const local = {
  get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch (e) { return fallback; } },
  set(key, value) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} },
};
export function useLocalState(key, initial) {
  const [v, setV] = useState(() => local.get(key, initial));
  useEffect(() => { local.set(key, v); }, [key, v]);
  return [v, setV];
}

// ---- Formatting
export const carLabel = (v) => (v ? v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ") : "");
export const carFull = (v) => (v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : "");
export const healthColor = (h) => (h >= 80 ? GREEN : h >= 55 ? AMBER : RED);
export const toneColor = (tone, SUB) => (tone === "bad" ? RED : tone === "warn" || tone === "watch" ? AMBER : tone === "good" ? GREEN : SUB);
export function timeAgo(ts) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
// Distances are kept in km inside Motiq and shown in the driver's unit.
const KM_PER_MI = 1.609344;
export const distUnit = (unit) => (unit === "mi" ? "mi" : "km");
export const speedUnit = (unit) => (unit === "mi" ? "mph" : "km/h");
export const kmIn = (km, unit) => (unit === "mi" ? km / KM_PER_MI : km);
export const fmtDist = (km, unit, digits = 1) => `${kmIn(km || 0, unit).toFixed(digits)} ${distUnit(unit)}`;
export const fmtSpeed = (kmh, unit) => `${Math.round(kmIn(kmh || 0, unit))} ${speedUnit(unit)}`;
export const fmtTemp = (c, unit) => (c == null ? "—" : unit === "mi" ? `${Math.round(c * 1.8 + 32)}°F` : `${Math.round(c)}°C`);
export const fmtDuration = (sec) => { const m = Math.round((sec || 0) / 60); return m >= 60 ? `${(m / 60).toFixed(1)} h` : `${m} min`; };
export const haversineKm = (a, b) => {
  const R = 6371, rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

// ---- AI verdicts: the reply starts with [VERDICT:safe|caution|stop] (see the motiq-ai function).
export const VERDICT_STYLE = {
  safe: { icon: ShieldCheck, color: GREEN, label: "Safe to drive" },
  caution: { icon: ShieldQuestion, color: AMBER, label: "Drive with caution" },
  stop: { icon: ShieldAlert, color: RED, label: "Stop driving" },
};
export function parseVerdict(text) {
  const m = String(text || "").match(/\[VERDICT:\s*(safe|caution|stop)\]/i);
  return { verdict: m ? m[1].toLowerCase() : null, clean: String(text || "").replace(/\[VERDICT:\s*(safe|caution|stop)\]\s*/gi, "").trim() };
}
export function VerdictBadge({ verdict, small }) {
  const v = VERDICT_STYLE[verdict];
  if (!v) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full" style={{ backgroundColor: `${v.color}1F`, padding: small ? "3px 8px" : "4px 10px" }}>
      <v.icon size={small ? 10 : 13} style={{ color: v.color }} />
      <span className="font-semibold" style={{ color: v.color, fontSize: small ? 10 : 12 }}>{v.label}</span>
    </span>
  );
}

// Where a number came from, so live readings, calculations and estimates never look alike.
export const SOURCE_STYLE = {
  obd: { label: "OBD-II", color: GREEN },
  calculated: { label: "Calculated", color: BLUE },
  estimated: { label: "Estimated", color: AMBER },
  scan: { label: "Last scan", color: PURPLE },
};

// ---- Building blocks
export function GlowIcon({ icon: Icon, glow, size = 22 }) {
  return (
    <div className="flex shrink-0 items-center justify-center rounded-2xl" style={{ width: size + 26, height: size + 26, backgroundColor: `${glow}1F` }}>
      <Icon size={size} style={{ color: glow }} strokeWidth={2} />
    </div>
  );
}

export function Ring({ pct, color, size = 56, stroke = 6, track = "rgba(255,255,255,0.08)" }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={c} strokeDashoffset={c - (Math.max(0, Math.min(100, pct)) / 100) * c} strokeLinecap="round" />
    </svg>
  );
}

export function SectionHeader({ title, action, onAction }) {
  const { TEXT, SUB } = useTheme();
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="font-semibold tracking-tight" style={{ fontSize: 17, color: TEXT }}>{title}</h2>
      {action && <button onClick={onAction} className="rounded-md px-1 py-1 text-xs font-medium active:opacity-60" style={{ color: SUB }}>{action}</button>}
    </div>
  );
}

// Screen title row, with an optional back button and up to two round icon buttons on the right.
export function ScreenHeader({ title, sub, note, onBack, right }) {
  const { TEXT, SUB, CARD, BORDER } = useTheme();
  return (
    <div className="flex items-start justify-between gap-3 pt-2">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button onClick={onBack} aria-label="Back" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <ArrowLeft size={15} style={{ color: TEXT }} />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="font-bold tracking-tight" style={{ fontSize: 20, color: TEXT }}>{title}</h1>
          {sub && <p className={onBack ? "text-xs" : "mt-0.5 text-sm"} style={{ color: SUB }}>{sub}</p>}
          {note && <p className="mt-1.5" style={{ fontSize: 11, color: SUB }}>{note}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}
export function RoundButton({ icon: Icon, label, onClick, fill, badge, color }) {
  const { TEXT, CARD, BORDER, FILL, FILL_TEXT } = useTheme();
  return (
    <button onClick={onClick} aria-label={label} className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform" style={fill ? { backgroundColor: FILL } : { backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <Icon size={15} style={{ color: color || (fill ? FILL_TEXT : TEXT) }} />
      {badge ? <span className="absolute flex items-center justify-center rounded-full font-bold" style={{ top: -3, right: -3, minWidth: 15, height: 15, fontSize: 9, backgroundColor: FILL, color: FILL_TEXT, padding: "0 3px" }}>{badge}</span> : null}
    </button>
  );
}

// A row-style button: icon, label, chevron (the "Connect OBD-II adapter" look).
export function RowButton({ icon: Icon, label, sub, onClick, color, tint, disabled, trailing }) {
  const { TEXT, SUB, CARD, BORDER } = useTheme();
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="flex w-full items-center gap-2 rounded-2xl px-4 py-3.5 text-left active:scale-[0.98] transition-transform disabled:opacity-60" style={{ backgroundColor: tint || CARD, border: `1px solid ${BORDER}` }}>
      {Icon && <Icon size={15} style={{ color: color || SUB }} className="shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-sm" style={{ color: TEXT }}>{label}</span>
        {sub && <span className="mt-0.5 block text-xs" style={{ color: SUB }}>{sub}</span>}
      </span>
      {trailing}
      <ChevronRight size={14} style={{ color: SUB }} className="shrink-0" />
    </button>
  );
}

export function PrimaryButton({ children, onClick, disabled, type = "button", danger, className = "" }) {
  const { FILL, FILL_TEXT } = useTheme();
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold active:scale-95 transition-transform disabled:opacity-40 ${className}`} style={danger ? { backgroundColor: RED, color: "#fff" } : { backgroundColor: FILL, color: FILL_TEXT }}>
      {children}
    </button>
  );
}
export function SecondaryButton({ children, onClick, disabled, color, className = "" }) {
  const { CARD_ALT, TEXT, BORDER } = useTheme();
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium active:scale-95 transition-transform disabled:opacity-40 ${className}`} style={{ backgroundColor: CARD_ALT, color: color || TEXT, border: `1px solid ${BORDER}` }}>
      {children}
    </button>
  );
}

export function Pill({ active, onClick, children, small }) {
  const { CARD, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`shrink-0 whitespace-nowrap rounded-full font-medium active:scale-95 transition-transform ${small ? "px-3 py-1.5 text-xs" : "px-3.5 py-2 text-xs"}`} style={active ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD, color: SUB, border: `1px solid ${BORDER}` }}>
      {children}
    </button>
  );
}

// Text field in the app's style. Pass label for a visible label (and an accessible name).
export function Field({ label, id, as = "input", children, ...props }) {
  const { CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const fid = id || `f-${String(label || props.placeholder || "x").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  const Tag = as;
  return (
    <label htmlFor={fid} className="block">
      {label && <span className="mb-1.5 block text-xs font-medium" style={{ color: SUB }}>{label}</span>}
      <Tag id={fid} className={`w-full rounded-xl px-4 text-sm focus:outline-none ${as === "textarea" ? "py-3" : "h-11"}`} style={{ backgroundColor: CARD_ALT, border: `1px solid ${BORDER}`, color: TEXT }} {...props}>{children}</Tag>
    </label>
  );
}

export function Card({ children, className = "", style, onClick, radius = 24 }) {
  const { CARD, BORDER } = useTheme();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`${onClick ? "text-left active:scale-[0.98] transition-transform" : ""} ${className}`} style={{ borderRadius: radius, backgroundColor: CARD, border: `1px solid ${BORDER}`, ...style }}>
      {children}
    </Tag>
  );
}

export function Empty({ icon: Icon, title, text, action, onAction }) {
  const { TEXT, SUB, CARD, BORDER, FILL, FILL_TEXT } = useTheme();
  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl px-6 py-12 text-center" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      {Icon && <Icon size={20} style={{ color: SUB }} />}
      <p className="text-sm font-medium" style={{ color: TEXT }}>{title}</p>
      {text && <p className="max-w-[240px] text-xs leading-relaxed" style={{ color: SUB }}>{text}</p>}
      {action && <button onClick={onAction} className="mt-2 rounded-2xl px-4 py-2.5 text-xs font-semibold active:scale-95 transition-transform" style={{ backgroundColor: FILL, color: FILL_TEXT }}>{action}</button>}
    </div>
  );
}

export function Stat({ label, value, color, source }) {
  const { TEXT, SUB } = useTheme();
  const s = source ? SOURCE_STYLE[source] : null;
  return (
    <div className="flex items-center justify-between gap-2 text-sm" style={{ color: SUB }}>
      <span className="flex items-center gap-1.5">
        {label}
        {s && <span className="rounded-full px-1.5 py-0.5" style={{ fontSize: 9, backgroundColor: `${s.color}1F`, color: s.color }}>{s.label}</span>}
      </span>
      <span className="shrink-0 text-right font-mono font-medium" style={{ color: color || TEXT }}>{value}</span>
    </div>
  );
}

export function NotifRow({ icon: Icon, color, title, time, text, onClick }) {
  const { TEXT, SUB } = useTheme();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={`flex w-full gap-3 text-left ${onClick ? "active:scale-[0.98] transition-transform" : ""}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1F` }}><Icon size={14} style={{ color }} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium" style={{ color: TEXT }}>{title}</p>
          {time && <p className="shrink-0" style={{ fontSize: 10, color: SUB }}>{time}</p>}
        </div>
        {text && <p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{text}</p>}
      </div>
      {onClick && <ChevronRight size={13} className="mt-0.5 shrink-0" style={{ color: SUB }} />}
    </Tag>
  );
}

export function Toggle({ on, onChange, label }) {
  const { CARD_ALT, SUB, FILL, FILL_TEXT } = useTheme();
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)} className="h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors" style={{ backgroundColor: on ? FILL : CARD_ALT }}>
      <div className="h-5 w-5 rounded-full transition-transform" style={{ transform: on ? "translateX(20px)" : "translateX(0)", backgroundColor: on ? FILL_TEXT : SUB }} />
    </button>
  );
}
export function ToggleRow({ label, on, onChange }) {
  const { TEXT } = useTheme();
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm" style={{ color: TEXT }}>{label}</span>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
  );
}

export function LiveStat({ label, value }) {
  const { TEXT, SUB } = useTheme();
  return (
    <div className="rounded-xl px-1.5 py-2 text-center" style={{ backgroundColor: "rgba(61,220,132,0.1)" }}>
      <p style={{ fontSize: 9, color: SUB }}>{label}</p>
      <p className="mt-0.5 font-mono font-semibold" style={{ fontSize: 12, color: TEXT }}>{value}</p>
    </div>
  );
}

export function TrackThumb({ src, size, dim }) {
  const { TEXT, CARD_ALT } = useTheme();
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="flex shrink-0 items-center justify-center rounded-xl" style={{ width: size, height: size, backgroundColor: dim || CARD_ALT }}><Disc3 size={size * 0.5} style={{ color: TEXT, opacity: 0.4 }} /></div>;
  }
  return <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} className="shrink-0 rounded-xl object-cover" style={{ width: size, height: size }} />;
}

// Bottom sheet: the app-wide pattern for details and small forms without leaving the screen.
export function Sheet({ sheet, onClose }) {
  const { CARD_ALT, TEXT, SUB, BORDER, BG } = useTheme();
  useEffect(() => {
    if (!sheet) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, onClose]);
  if (!sheet) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-end" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="absolute inset-0" style={{ backgroundColor: "rgba(0,0,0,0.65)" }} />
      <div className="no-scrollbar relative z-10 w-full overflow-y-auto p-5" style={{ borderTopLeftRadius: 32, borderTopRightRadius: 32, backgroundColor: BG, border: `1px solid ${BORDER}`, maxHeight: "86%", paddingBottom: "calc(28px + env(safe-area-inset-bottom, 0px))" }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full" style={{ backgroundColor: BORDER }} />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 id="sheet-title" className="text-base font-semibold" style={{ color: TEXT }}>{sheet.title}</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full p-2 active:scale-90 transition-transform" style={{ backgroundColor: CARD_ALT }}><X size={14} style={{ color: SUB }} /></button>
        </div>
        {sheet.body}
      </div>
    </div>
  );
}

export function Toast({ message }) {
  const { FILL, FILL_TEXT } = useTheme();
  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 z-[60] flex justify-center px-8" style={{ bottom: "calc(112px + env(safe-area-inset-bottom, 0px))" }} role="status" aria-live="polite">
      <div className="rounded-full px-4 py-2.5 text-center text-xs font-semibold shadow-2xl" style={{ backgroundColor: FILL, color: FILL_TEXT }}>{message}</div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { console.error("Motiq crashed:", error, info); }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", padding: 32, textAlign: "center", backgroundColor: "#0A0A0A", color: "#fff" }}>
        <AlertTriangle size={30} style={{ color: RED, marginBottom: 14 }} />
        <p style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Something went wrong</p>
        <p style={{ fontSize: 13, color: "#A0A0A0", maxWidth: 280, lineHeight: 1.5, marginBottom: 22 }}>Motiq hit an unexpected error. Your garage is saved — try again.</p>
        <button onClick={() => this.setState({ hasError: false })} style={{ backgroundColor: ACCENT, color: "#000", border: "none", borderRadius: 999, padding: "11px 24px", fontSize: 13, fontWeight: 700 }}>Try again</button>
      </div>
    );
  }
}
