// Motiq's look: dark (easy on the eyes in a car, day or night), with a mint accent for
// "healthy", amber for "soon" and red for "needs attention".
import React from "react";
import { X } from "lucide-react";

export const C = {
  bg: "#0B0E13", surface: "#141922", raised: "#1B2230", line: "#262F3D",
  text: "#EEF2F7", sub: "#8F9BAD", faint: "#5E6A7C",
  accent: "#2EE6A8", accentInk: "#06281D", accentSoft: "rgba(46,230,168,0.12)",
  warn: "#FFB020", warnSoft: "rgba(255,176,32,0.12)",
  bad: "#FF5A5F", badSoft: "rgba(255,90,95,0.12)",
  blue: "#5B9BFF", blueSoft: "rgba(91,155,255,0.12)",
};
export const FONT = "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

export function Screen({ title, subtitle, right, children, onBack }) {
  return (
    <div style={{ padding: "calc(env(safe-area-inset-top, 0px) + 18px) 18px 110px", maxWidth: 560, margin: "0 auto" }}>
      {(title || onBack) && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
          {onBack && <button onClick={onBack} aria-label="Back" style={iconBtn}>‹</button>}
          <div style={{ flex: 1, minWidth: 0 }}>
            {title && <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: -0.6 }}>{title}</h1>}
            {subtitle && <p style={{ margin: "3px 0 0", color: C.sub, fontSize: 13.5 }}>{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
export const iconBtn = { width: 40, height: 40, borderRadius: 12, border: `1px solid ${C.line}`, background: C.surface, color: C.text, fontSize: 24, lineHeight: 1, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 };

export function Card({ children, style, onClick, ...rest }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} {...rest} style={{ display: "block", width: "100%", textAlign: "left", background: C.surface, border: `1px solid ${C.line}`, borderRadius: 18, padding: 16, color: C.text, fontFamily: FONT, cursor: onClick ? "pointer" : "default", ...style }}>
      {children}
    </Tag>
  );
}

export function Button({ children, kind = "primary", style, ...rest }) {
  const look = {
    primary: { background: C.accent, color: C.accentInk, border: "none" },
    secondary: { background: C.raised, color: C.text, border: `1px solid ${C.line}` },
    danger: { background: C.badSoft, color: C.bad, border: `1px solid ${C.bad}` },
    ghost: { background: "transparent", color: C.accent, border: "none" },
  }[kind];
  return (
    <button {...rest} style={{ padding: "13px 18px", borderRadius: 14, fontFamily: FONT, fontSize: 15, fontWeight: 700, cursor: rest.disabled ? "not-allowed" : "pointer", opacity: rest.disabled ? 0.5 : 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, ...look, ...style }}>
      {children}
    </button>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label style={{ display: "block", marginBottom: 14 }}>
      <span style={{ display: "block", fontSize: 12.5, fontWeight: 700, color: C.sub, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      {children}
      {hint && <span style={{ display: "block", fontSize: 12, color: C.faint, marginTop: 5 }}>{hint}</span>}
    </label>
  );
}
export const input = { width: "100%", boxSizing: "border-box", padding: "13px 14px", borderRadius: 12, border: `1px solid ${C.line}`, background: C.bg, color: C.text, fontFamily: FONT, fontSize: 16, outline: "none" };

export function Chip({ active, children, ...rest }) {
  return (
    <button {...rest} aria-pressed={!!active} style={{ padding: "8px 13px", borderRadius: 999, border: `1px solid ${active ? C.accent : C.line}`, background: active ? C.accentSoft : C.surface, color: active ? C.accent : C.text, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

export function Sheet({ title, onClose, children }) {
  React.useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 560, maxHeight: "92vh", overflowY: "auto", background: C.surface, borderRadius: "22px 22px 0 0", border: `1px solid ${C.line}`, padding: "18px 18px calc(env(safe-area-inset-bottom, 0px) + 22px)", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <h2 style={{ flex: 1, margin: 0, fontSize: 19, fontWeight: 800 }}>{title}</h2>
          <button onClick={onClose} aria-label="Close" style={{ ...iconBtn, width: 34, height: 34 }}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

let toastSet = null;
export function toast(msg) { if (toastSet) toastSet(msg); }
export function Toaster() {
  const [msg, setMsg] = React.useState(null);
  React.useEffect(() => { toastSet = setMsg; return () => { toastSet = null; }; }, []);
  React.useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 2800); return () => clearTimeout(t); }, [msg]);
  if (!msg) return null;
  return <div role="status" style={{ position: "fixed", left: "50%", transform: "translateX(-50%)", bottom: "calc(env(safe-area-inset-bottom, 0px) + 92px)", zIndex: 60, background: C.raised, border: `1px solid ${C.line}`, color: C.text, padding: "11px 16px", borderRadius: 14, fontSize: 14, fontWeight: 600, maxWidth: "88vw", boxShadow: "0 10px 30px rgba(0,0,0,0.4)" }}>{msg}</div>;
}

export function Empty({ icon: Icon, title, body, action, onAction }) {
  return (
    <div style={{ textAlign: "center", padding: "34px 18px", border: `1px dashed ${C.line}`, borderRadius: 18 }}>
      {Icon && <Icon size={30} color={C.faint} />}
      <p style={{ margin: "10px 0 4px", fontWeight: 700, fontSize: 16 }}>{title}</p>
      {body && <p style={{ margin: "0 auto 14px", color: C.sub, fontSize: 14, maxWidth: 320, lineHeight: 1.5 }}>{body}</p>}
      {action && <Button onClick={onAction}>{action}</Button>}
    </div>
  );
}

export function Badge({ tone = "accent", children }) {
  const t = { accent: [C.accentSoft, C.accent], warn: [C.warnSoft, C.warn], bad: [C.badSoft, C.bad], blue: [C.blueSoft, C.blue], muted: [C.raised, C.sub] }[tone];
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 9px", borderRadius: 999, background: t[0], color: t[1], fontSize: 12, fontWeight: 700 }}>{children}</span>;
}
