// Floating pill navigation: the active tab expands into a labelled pill; AI is its own circle.
import React from "react";
import { Home, MapPin, Car, User, Bot } from "lucide-react";
import { t } from "../lib/i18n.js";
import { useTheme, ACCENT } from "../design.jsx";

const NAV_ITEMS = [
  { key: "home", label: "Home", icon: Home },
  { key: "market", label: "Nearby", icon: MapPin },
  { key: "garage", label: "Garage", icon: Car },
  { key: "profile", label: "Profile", icon: User },
];

export default function BottomNav({ active, setActive }) {
  const { BORDER, FILL, FILL_TEXT, mode } = useTheme();
  const neon = mode === "dark";
  return (
    <nav aria-label="Main" className="pointer-events-none absolute inset-x-0 z-20 flex items-center justify-center gap-3 px-6" style={{ bottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="pointer-events-auto flex items-center shadow-2xl" style={{ borderRadius: 999, backgroundColor: FILL, padding: 6, gap: 2, border: `1px solid ${BORDER}` }}>
        {NAV_ITEMS.map((item) => {
          const on = active === item.key;
          return (
            <button key={item.key} onClick={() => setActive(item.key)} aria-label={item.label} title={t(item.label)} aria-current={on ? "page" : undefined} className="flex items-center active:scale-95 transition-all duration-200" style={{ borderRadius: 999, gap: 8, padding: on ? "10px 16px" : "10px", backgroundColor: on ? FILL_TEXT : "transparent" }}>
              <item.icon size={18} strokeWidth={2} style={{ color: on ? (neon ? ACCENT : FILL) : FILL_TEXT, opacity: on ? 1 : 0.55 }} />
              {on && <span className="fade-in font-semibold" style={{ fontSize: 14, color: FILL }}>{t(item.label)}</span>}
            </button>
          );
        })}
      </div>
      <button onClick={() => setActive("ai")} aria-label="AI" aria-current={active === "ai" ? "page" : undefined} className={`pointer-events-auto flex shrink-0 items-center justify-center shadow-2xl active:scale-95 transition-transform ${neon && active !== "ai" ? "neon-pulse" : ""}`} style={{ width: 56, height: 56, borderRadius: 999, backgroundColor: active === "ai" && neon ? ACCENT : FILL, border: `1px solid ${BORDER}`, boxShadow: active === "ai" ? (neon ? "0 0 28px rgba(239,255,0,0.45)" : `0 0 0 2px ${FILL_TEXT}`) : undefined }}>
        <Bot size={22} strokeWidth={2} style={{ color: active === "ai" && neon ? "#000" : FILL_TEXT }} />
      </button>
    </nav>
  );
}
