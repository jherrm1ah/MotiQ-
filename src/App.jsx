import React, { useCallback, useEffect, useState } from "react";
import { Car, Activity, Mic, MessageCircle, Store } from "lucide-react";
import { supabase } from "./lib/supabase.js";
import { loadProfile, loadGarage } from "./lib/data.js";
import { C, FONT, Toaster, Screen, Card } from "./ui.jsx";
import Auth from "./screens/Auth.jsx";
import Garage from "./screens/Garage.jsx";
import Diagnose from "./screens/Diagnose.jsx";
import Ask from "./screens/Ask.jsx";
import Market from "./screens/Market.jsx";
import CarMode from "./screens/CarMode.jsx";
import Settings, { ProfileForm } from "./screens/Settings.jsx";

const TABS = [["garage", "Garage", Car], ["diagnose", "Diagnose", Activity], ["carmode", "Car Mode", Mic], ["ask", "Ask", MessageCircle], ["market", "Market", Store]];
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} } };

export default function App() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [garage, setGarage] = useState(null);
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get("tab")) || "garage");
  const [carId, setCarIdState] = useState(() => store.get("motiq.car"));
  const [settings, setSettings] = useState(false);
  const setCarId = (id) => { setCarIdState(id); store.set("motiq.car", id); };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const uid = session && session.user && session.user.id;
  const reload = useCallback(async () => {
    if (!uid) return;
    try { const [p, g] = await Promise.all([loadProfile(uid), loadGarage(uid)]); setMe(p); setGarage(g); }
    catch (e) { console.error(e); }
  }, [uid]);
  useEffect(() => { setMe(null); setGarage(null); if (uid) reload(); }, [uid]);

  const shell = (child) => <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: FONT }}>{child}<Toaster /></div>;
  if (session === undefined) return shell(null);
  if (!session) return shell(<Auth />);
  if (!me || !garage) return shell(<Screen><p style={{ color: C.sub }}>Loading your garage…</p></Screen>);
  if (!me.country) return shell(
    <Screen title="Welcome to Motiq" subtitle="Two quick things so prices and distances look right.">
      <Card><ProfileForm me={me} onSaved={setMe} submitLabel="Continue" /></Card>
    </Screen>
  );
  if (settings) return shell(<Settings me={me} setMe={setMe} onBack={() => setSettings(false)} />);
  if (tab === "carmode") return shell(<CarMode me={me} garage={garage} carId={carId} onExit={() => setTab("garage")} />);

  const props = { me, garage, carId, setCarId, reload, go: setTab, openSettings: () => setSettings(true) };
  return shell(
    <>
      {tab === "garage" && <Garage {...props} />}
      {tab === "diagnose" && <Diagnose {...props} />}
      {tab === "ask" && <Ask {...props} />}
      {tab === "market" && <Market {...props} />}
      <nav aria-label="Main" style={{ position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 20, background: "rgba(11,14,19,0.94)", backdropFilter: "blur(12px)", borderTop: `1px solid ${C.line}`, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <div style={{ display: "flex", maxWidth: 560, margin: "0 auto" }}>
          {TABS.map(([id, label, Icon]) => {
            const active = tab === id;
            const center = id === "carmode";
            return (
              <button key={id} onClick={() => setTab(id)} aria-current={active ? "page" : undefined} style={{ flex: 1, padding: "9px 0 10px", border: "none", background: "transparent", color: active ? C.accent : C.sub, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, fontFamily: FONT, fontSize: 11.5, fontWeight: 700, cursor: "pointer" }}>
                {center
                  ? <span style={{ width: 46, height: 46, marginTop: -18, borderRadius: 16, background: C.accent, color: C.accentInk, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 18px rgba(46,230,168,0.35)" }}><Icon size={24} /></span>
                  : <Icon size={22} />}
                {label}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
