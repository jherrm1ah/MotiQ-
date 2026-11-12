// Motiq's root: sign-in, loading the driver's garage, and the app-wide state that has to survive
// moving between screens (the OBD-II connection, a live trip, the music player, sheets and toasts).
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "./lib/supabase.js";
import { loadProfile, loadGarage, loadDocuments, loadTrips, loadFuel, loadBlocks, saveTrip, healthOf, reminderState } from "./lib/data.js";
import { syncReminders } from "./lib/notify.js";
import { connectAdapter, readLive } from "./lib/obd.js";
import { currentPosition, geocode, drivingRoute } from "./lib/geo.js";
import { speak as speakText, stopSpeaking } from "./lib/voice.js";
import { daysUntil } from "./lib/units.js";
import {
  Logo, AMBER, THEMES, ThemeContext, UIContext, Sheet, Toast, ErrorBoundary,
  PrimaryButton, SecondaryButton, useLocalState, haversineKm, local,
} from "./design.jsx";
import BottomNav from "./screens/BottomNav.jsx";
import { HeroScreen, LoginScreen, SignupScreen } from "./screens/Auth.jsx";
import Home from "./screens/Home.jsx";
import AIScreen from "./screens/AI.jsx";
import Nearby from "./screens/Nearby.jsx";
import Garage from "./screens/Garage.jsx";
import Profile, { Welcome } from "./screens/Profile.jsx";
import { TripScreen, TripHistoryScreen } from "./screens/Trip.jsx";
import MusicScreen, { MiniPlayer, CarMode } from "./screens/Music.jsx";
import ScanScreen from "./screens/Scan.jsx";
import Dashboard from "./screens/Dashboard.jsx";
import AdminScreen from "./screens/Admin.jsx";
import { setLanguage } from "./lib/i18n.js";

const IDLE_TRIP = { free: false, still: 0, status: "idle", origin: "", destination: "", totalKm: 0, coveredKm: 0, kmh: 0, elapsedSec: 0, alerts: [], gps: "pending", route: null, realRoute: false, offRoute: false, dest: null };

// Next open reminder for a car, e.g. { title: "Oil and filter change", when: "in 12 days" }.
function nextDueOf(car, reminders, unit) {
  const open = reminders.filter((r) => r.vehicle_id === car.id && !r.done_at);
  if (!open.length) return null;
  const rank = { overdue: 0, soon: 1, later: 2 };
  const r = [...open].sort((a, b) => rank[reminderState(a, car.odometer)] - rank[reminderState(b, car.odometer)] || String(a.due_on || "9").localeCompare(String(b.due_on || "9")))[0];
  const state = reminderState(r, car.odometer);
  let when = "";
  if (r.due_on) { const d = daysUntil(r.due_on); when = d < 0 ? `overdue by ${-d} day${d === -1 ? "" : "s"}` : d === 0 ? "due today" : `in ${d} day${d === 1 ? "" : "s"}`; }
  else if (r.due_odometer != null) { const left = r.due_odometer - (car.odometer || 0); when = left <= 0 ? "overdue" : `in ${left.toLocaleString()} ${unit}`; }
  return { reminder: r, state, title: r.title, when, urgent: state === "overdue" };
}

export default function App() {
  return <ErrorBoundary><Motiq /></ErrorBoundary>;
}

function Motiq() {
  const [session, setSession] = useState(undefined);
  const [authStep, setAuthStep] = useState("hero");
  const [me, setMe] = useState(null);
  const [garage, setGarage] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [trips, setTrips] = useState([]);
  const [fuel, setFuel] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  const [fromCache, setFromCache] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [active, setActive] = useState(() => new URLSearchParams(window.location.search).get("tab") || "home");
  const [marketFilter, setMarketFilter] = useState(null);
  const [aiPrompt, setAiPrompt] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [mode, setMode] = useLocalState("motiq.theme", "dark");
  const [carId, setCarId] = useLocalState("motiq.car", null);
  const [prefs, setPrefs] = useLocalState("motiq.prefs", { alertsService: true, alertsDocuments: true, alertsScans: true, alertsTrips: true });
  const theme = { ...(THEMES[mode] || THEMES.dark), mode, setMode };

  // ---- Session and data
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const uid = session && session.user && session.user.id;
  // Everything loads in one go; a copy is kept on the phone so Motiq opens instantly and still
  // shows your garage with no signal (changes need a connection).
  const cacheKey = uid ? `motiq.cache.${uid}` : null;
  const reload = useCallback(async () => {
    if (!uid) return;
    try {
      const [p, g, d, t, f, b] = await Promise.all([loadProfile(uid), loadGarage(uid), loadDocuments(uid).catch(() => []), loadTrips(uid).catch(() => []), loadFuel(uid).catch(() => []), loadBlocks(uid).catch(() => [])]);
      setMe(p); setGarage(g); setDocuments(d); setTrips(t); setFuel(f); setBlocks(b); setLoadError(""); setFromCache(false);
      local.set(`motiq.cache.${uid}`, { p, g, d, t, f, b, at: Date.now() });
    } catch (e) {
      const c = local.get(`motiq.cache.${uid}`, null);
      if (c && c.p) { setMe((m) => m || c.p); setGarage((x) => x || c.g); setFromCache(true); }
      else setLoadError(e.message || "Couldn't load your garage.");
    }
  }, [uid]);
  useEffect(() => {
    setMe(null); setGarage(null);
    if (!uid) return;
    const c = local.get(`motiq.cache.${uid}`, null);
    if (c && c.p && c.g) { setMe(c.p); setGarage(c.g); setDocuments(c.d || []); setTrips(c.t || []); setFuel(c.f || []); setBlocks(c.b || []); }
    reload();
  }, [uid]);
  // Back from paying for Motiq Pro (web: ?pro=done; app: the payment browser closes). The webhook
  // may take a few seconds, so check a few times.
  useEffect(() => {
    if (!uid) return;
    const check = (n) => loadProfile(uid).then((p) => { if (!p) return; if (p.plan === "pro") { setMe(p); showToast("Welcome to Motiq Pro"); } else if (n > 0) setTimeout(() => check(n - 1), 3000); }).catch(() => {});
    if (/[?&]pro=done/.test(window.location.search)) { window.history.replaceState(null, "", window.location.pathname); check(5); }
    let sub;
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      import("@capacitor/browser").then(({ Browser }) => Browser.addListener("browserFinished", () => check(3))).then((h) => { sub = h; }).catch(() => {});
    }
    return () => { sub && sub.remove(); };
  }, [uid]);
  useEffect(() => {
    const on = () => { setOnline(true); reload(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [reload]);
  // Phone reminders follow whatever's due (Android app).
  useEffect(() => { if (garage) syncReminders({ vehicles: garage.cars, reminders: garage.reminders, documents, prefs }); }, [garage, documents, prefs]);

  const unit = me && me.distance_unit === "mi" ? "mi" : "km";
  const vehicles = useMemo(() => (garage ? garage.cars.map((c) => {
    const h = healthOf(c, garage);
    return { ...c, health: h.score, healthInfo: h, nextDue: nextDueOf(c, garage.reminders, unit) };
  }) : []), [garage, unit]);
  const vehicle = vehicles.find((v) => v.id === carId) || vehicles[0] || null;

  // ---- Sheets, toasts, navigation
  const showToast = useCallback((message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }, []);
  const openSheet = useCallback((title, body) => setSheet({ title, body }), []);
  const closeSheet = useCallback(() => setSheet(null), []);
  const confirm = useCallback((title, text, actionLabel, onYes) => {
    setSheet({ title, body: (
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed" style={{ color: theme.SUB }}>{text}</p>
        <div className="grid grid-cols-2 gap-3">
          <SecondaryButton onClick={() => setSheet(null)}>Cancel</SecondaryButton>
          <PrimaryButton danger onClick={() => { setSheet(null); onYes(); }}>{actionLabel}</PrimaryButton>
        </div>
      </div>
    ) });
  }, [theme.SUB]);
  const scrollRef = useRef(null);
  const goTo = useCallback((tab, opts = {}) => {
    if (opts.filter !== undefined) setMarketFilter(opts.filter);
    if (opts.ask) setAiPrompt(opts.ask);
    setSheet(null);
    setActive(tab);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, []);

  // ---- OBD-II: one connection for the whole app, with live readings while connected.
  const [obd, setObd] = useState({ status: "disconnected", deviceName: null, vehicleId: null });
  const linkRef = useRef(null);
  const [liveData, setLiveData] = useState(null);
  const liveRun = useRef(0);
  async function connectOBD(vehicleId) {
    if (linkRef.current) { setObd((o) => ({ ...o, vehicleId })); return linkRef.current; }
    if (obd.status === "connecting") return null;
    setObd({ status: "connecting", deviceName: null, vehicleId });
    try {
      const link = await connectAdapter();
      linkRef.current = link;
      setObd({ status: "connected", deviceName: link.name, vehicleId });
      showToast(`Connected to ${link.name}`);
      startLive();
      return link;
    } catch (e) {
      setObd({ status: "disconnected", deviceName: null, vehicleId: null });
      showToast(/cancel|chooser|no device/i.test(e.message || "") ? "No adapter picked" : e.message || "Couldn't connect to the adapter.");
      return null;
    }
  }
  function startLive() {
    const run = ++liveRun.current;
    let runtimeSec = 0, idleSec = 0, last = Date.now();
    (async () => {
      while (liveRun.current === run && linkRef.current) {
        try {
          const r = await readLive(linkRef.current, ["rpm", "speed_kmh", "coolant_c", "fuel_pct", "battery_v"]);
          const now = Date.now(), dt = (now - last) / 1000; last = now;
          if (r.rpm > 0) { runtimeSec += dt; if (!r.speed_kmh) idleSec += dt; }
          if (liveRun.current === run) setLiveData({ ...r, runtimeSec, idleSec });
        } catch (e) { break; }
        await new Promise((res) => setTimeout(res, 1500));
      }
    })();
  }
  async function disconnectOBD(quiet) {
    liveRun.current++;
    const link = linkRef.current; linkRef.current = null;
    setLiveData(null);
    setObd({ status: "disconnected", deviceName: null, vehicleId: null });
    if (link) await link.close();
    if (!quiet) showToast("Adapter disconnected");
  }
  useEffect(() => () => { liveRun.current++; if (linkRef.current) linkRef.current.close(); }, []);

  // ---- Trips: real GPS distance and speed, and a real route when the address is found.
  const [trip, setTrip] = useState(IDLE_TRIP);
  const [voiceAlerts, setVoiceAlerts] = useLocalState("motiq.voiceAlerts", true);
  const lastFix = useRef(null);
  const watchId = useRef(null);
  const speakAlert = useCallback((text) => { if (voiceAlerts) speakText(text).catch(() => {}); }, [voiceAlerts]);
  async function startTrip(origin, destination) {
    lastFix.current = null;
    setTrip({ ...IDLE_TRIP, status: "locating", origin, destination });
    try {
      const here = await currentPosition();
      const from = /current location/i.test(origin) || !origin.trim() ? here : await geocode(origin, here);
      const to = await geocode(destination, here);
      let route = null;
      try { route = await drivingRoute(from, to); } catch (e) {}
      const totalKm = route ? route.km : haversineKm(from, to) * 1.3;
      setTrip((t) => (t.status !== "locating" ? t : { ...t, status: "active", totalKm, route: route ? route.coords : null, realRoute: !!route, dest: to }));
      showToast(route ? "Route found — trip started" : "Trip started with an estimated distance");
      speakAlert("Trip started. Buckle up and drive safely.");
    } catch (e) {
      setTrip(IDLE_TRIP);
      showToast(e.message || "Couldn't start the trip.");
    }
  }
  async function recordTrip(t, completed) {
    if (t.coveredKm < 0.05 || !uid) return;
    try {
      const row = await saveTrip(uid, { vehicle_id: vehicle ? vehicle.id : null, origin: t.origin, destination: t.destination, distance_km: t.coveredKm, duration_sec: t.elapsedSec, alerts: t.alerts.length, real_route: t.realRoute, completed });
      setTrips((prev) => [row, ...prev]);
    } catch (e) { showToast("Couldn't save the trip"); }
  }
  function endTrip() { if (trip.status === "active") recordTrip(trip, false); setTrip(IDLE_TRIP); }
  function dismissTrip() { if (trip.status === "arrived") recordTrip(trip, true); setTrip(IDLE_TRIP); }
  useEffect(() => {
    if (trip.status !== "active") return;
    const id = setInterval(() => setTrip((t) => (t.status === "active" ? { ...t, elapsedSec: t.elapsedSec + 1 } : t)), 1000);
    return () => clearInterval(id);
  }, [trip.status]);
  useEffect(() => {
    if (trip.status !== "active") return;
    if (!navigator.geolocation) { setTrip((t) => ({ ...t, gps: "off" })); return; }
    watchId.current = navigator.geolocation.watchPosition((pos) => {
      const { latitude: lat, longitude: lon, speed } = pos.coords;
      const now = pos.timestamp || Date.now();
      setTrip((t) => {
        if (t.status !== "active") return t;
        let covered = t.coveredKm, kmh = t.kmh;
        const last = lastFix.current;
        if (last) {
          const dt = (now - last.t) / 1000, dKm = haversineKm(last, { lat, lon });
          if (dt > 0 && dKm > 0.0025) covered += dKm; // ignore GPS jitter while standing still
          kmh = speed != null && speed >= 0 ? speed * 3.6 : dt > 0 ? (dKm / dt) * 3600 : t.kmh;
        } else if (speed != null && speed >= 0) kmh = speed * 3.6;
        lastFix.current = { lat, lon, t: now };
        kmh = Math.max(0, Math.min(250, kmh));
        const alerts = [...t.alerts];
        if (t.kmh - kmh > 25 && t.kmh > 32) alerts.unshift({ id: `brake-${now}`, kind: "brake", title: "Hard braking detected", detail: "Keep a safe distance and stay alert.", at: t.elapsedSec, ts: now });
        let offRoute = t.offRoute;
        if (t.route) {
          let min = Infinity;
          for (const [la, lo] of t.route) { const d = haversineKm({ lat, lon }, { lat: la, lon: lo }); if (d < min) min = d; }
          const off = min > 0.55;
          if (off && !t.offRoute) alerts.unshift({ id: `off-${now}`, kind: "off", title: "Off the suggested route", detail: "You've left the planned route.", at: t.elapsedSec, ts: now });
          if (!off && t.offRoute) alerts.unshift({ id: `on-${now}`, kind: "on", title: "Back on route", detail: "You're back on the planned route.", at: t.elapsedSec, ts: now });
          offRoute = off;
        }
        // Auto trips have no destination: they end after 4 minutes standing still.
        const still = kmh < 3 ? (t.still || now) : 0;
        if (t.free) return { ...t, coveredKm: covered, kmh, gps: "gps", alerts: alerts.slice(0, 12), still, status: still && now - still > 240000 ? "arrived" : "active" };
        const arrived = (t.dest && haversineKm({ lat, lon }, t.dest) < 0.15) || covered >= t.totalKm * 1.02;
        return { ...t, coveredKm: covered, kmh, gps: "gps", alerts: alerts.slice(0, 12), offRoute, status: arrived ? "arrived" : "active" };
      });
    }, () => setTrip((t) => (t.status === "active" ? { ...t, gps: "off" } : t)), { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 });
    return () => { if (watchId.current != null) navigator.geolocation.clearWatch(watchId.current); watchId.current = null; };
  }, [trip.status]);
  const alertCount = useRef(0);
  useEffect(() => {
    if (trip.alerts.length > alertCount.current && trip.alerts[0]) { showToast(trip.alerts[0].title); speakAlert(`${trip.alerts[0].title}. ${trip.alerts[0].detail}`); }
    alertCount.current = trip.alerts.length;
  }, [trip.alerts]);
  useEffect(() => { if (trip.status === "arrived") { showToast(`You've arrived at ${trip.destination}`); speakAlert(`You've arrived at ${trip.destination}.`); } }, [trip.status]);

  // Auto trips: while Motiq is open and the setting is on, a trip starts by itself once you've
  // been moving faster than 15 km/h for about 20 seconds, and saves itself when you park.
  const moving = useRef(null);
  useEffect(() => {
    if (!prefs.autoTrips || trip.status !== "idle" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition((pos) => {
      const kmh = pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed * 3.6 : 0;
      if (kmh < 15) { moving.current = null; return; }
      if (!moving.current) moving.current = pos.timestamp || Date.now();
      else if ((pos.timestamp || Date.now()) - moving.current > 20000) {
        moving.current = null;
        lastFix.current = null;
        setTrip({ ...IDLE_TRIP, status: "active", free: true, origin: "Auto trip", destination: new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) });
        showToast("Trip started automatically");
      }
    }, () => {}, { enableHighAccuracy: false, maximumAge: 5000, timeout: 20000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [prefs.autoTrips, trip.status]);
  useEffect(() => { if (trip.status === "arrived" && trip.free) { recordTrip(trip, true); setTrip(IDLE_TRIP); showToast(`Trip saved — ${trip.coveredKm.toFixed(1)} km`); } }, [trip.status]);

  // Live engine warnings from the adapter, spoken once every few minutes at most.
  const warned = useRef({});
  useEffect(() => {
    if (!liveData) return;
    const warn = (key, text) => {
      const last = warned.current[key] || 0;
      if (Date.now() - last < 300000) return;
      warned.current[key] = Date.now();
      showToast(text); speakText(text).catch(() => {});
    };
    if (liveData.coolant_c != null && liveData.coolant_c >= 108) warn("hot", "Engine temperature is very high. Pull over safely, turn the engine off and let it cool.");
    else if (liveData.coolant_c != null && liveData.coolant_c >= 103) warn("warm", "Engine is running hot. Watch the temperature and avoid hard driving.");
    if (liveData.battery_v != null && liveData.rpm > 400 && liveData.battery_v < 12.8) warn("charge", "The battery isn't charging properly. Get the alternator checked soon.");
  }, [liveData]);

  // ---- Music (Car Mode Radio): keeps playing across screens.
  const audioRef = useRef(null);
  const [browseList, setBrowseList] = useState([]);
  const [current, setCurrent] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [carMode, setCarMode] = useState(false);
  const [queue, setQueue] = useState([]);
  const [favorites, setFavorites] = useLocalState("motiq.favorites", []);
  const [recentlyPlayed, setRecentlyPlayed] = useLocalState("motiq.recent", []);
  const playTrack = (track) => { setCurrent(track); setIsPlaying(true); setQueue((q) => q.filter((t) => t.id !== track.id)); setRecentlyPlayed((r) => [track, ...r.filter((t) => t.id !== track.id)].slice(0, 20)); };
  const togglePlay = () => { if (current) setIsPlaying((p) => !p); };
  const playAdjacent = (dir) => {
    if (dir === 1 && queue.length) { const [next, ...rest] = queue; setQueue(rest); playTrack(next); return; }
    if (!current || !browseList.length) return;
    const i = browseList.findIndex((t) => t.id === current.id);
    playTrack(browseList[(i + dir + browseList.length) % browseList.length]);
  };
  const addToQueue = (t) => { setQueue((q) => (q.some((x) => x.id === t.id) ? q : [...q, t])); showToast(`Added "${t.name}" to the queue`); };
  const removeFromQueue = (id) => setQueue((q) => q.filter((t) => t.id !== id));
  const toggleFavorite = (t) => setFavorites((f) => (f.some((x) => x.id === t.id) ? f.filter((x) => x.id !== t.id) : [t, ...f]));
  const isFavorite = (id) => favorites.some((t) => t.id === id);
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) audioRef.current.play().catch(() => setIsPlaying(false)); else audioRef.current.pause();
  }, [isPlaying, current]);
  // Music goes quiet while Motiq talks in Car Mode.
  const duck = useCallback((on) => { if (audioRef.current) audioRef.current.volume = on ? 0.15 : 1; }, []);

  async function signOut() {
    if (linkRef.current) await disconnectOBD(true);
    setTrip(IDLE_TRIP); setIsPlaying(false); setCurrent(null); setCarMode(false); stopSpeaking();
    await supabase.auth.signOut();
    setActive("home"); setAuthStep("hero");
    local.set("motiq.car", null);
  }

  const ui = {
    me, setMe, uid, email: session && session.user ? session.user.email : "", unit, garage, vehicles, vehicle, setCarId, documents, setDocuments, trips, setTrips, fuel, setFuel, blocks, setBlocks, online, reload, prefs, setPrefs,
    goTo, active, marketFilter, aiPrompt, clearAiPrompt: () => setAiPrompt(null), openSheet, closeSheet, confirm, showToast, signOut,
    obd, liveData, connectOBD, disconnectOBD, getLink: () => linkRef.current,
    trip, startTrip, endTrip, dismissTrip, voiceAlerts, setVoiceAlerts,
    browseList, setBrowseList, current, isPlaying, carMode, setCarMode, queue, favorites, recentlyPlayed,
    playTrack, togglePlay, playAdjacent, addToQueue, removeFromQueue, toggleFavorite, isFavorite, duck, setIsPlaying,
  };

  const frame = (child, bg) => (
    <UIContext.Provider value={ui}>
      <ThemeContext.Provider value={theme}>
        <div className="flex justify-center" style={{ minHeight: "100dvh", backgroundColor: bg || theme.BG }}>
          <div className="relative w-full max-w-[480px] overflow-hidden" style={{ height: "100dvh", backgroundColor: bg || theme.BG }}>
            {child}
            <Sheet sheet={sheet} onClose={closeSheet} />
            <Toast message={toast} />
          </div>
        </div>
      </ThemeContext.Provider>
    </UIContext.Provider>
  );

  if (session === undefined) return frame(<Splash />, "#212121");
  if (!session) {
    return frame(
      authStep === "login" ? <LoginScreen onCreateAccount={() => setAuthStep("signup")} onToast={showToast} />
        : authStep === "signup" ? <SignupScreen onBack={() => setAuthStep("login")} onToast={showToast} />
          : <HeroScreen onStart={() => setAuthStep("login")} />,
      authStep === "hero" ? "#212121" : "#E0E0E0"
    );
  }
  if (loadError && !garage) return frame(
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <AlertTriangle size={22} style={{ color: AMBER }} />
      <p className="text-sm" style={{ color: theme.TEXT }}>{loadError}</p>
      <PrimaryButton onClick={reload} className="px-6">Try again</PrimaryButton>
    </div>
  );
  if (!me || !garage) return frame(<Splash />, theme.BG);
  setLanguage(me.language || "en");
  if (!me.country) return frame(<div className="no-scrollbar h-full overflow-y-auto" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}><Welcome /></div>);

  const subScreen = ["trip", "trip-history", "scan", "music", "dash", "admin"].includes(active);
  return frame(
    <>
      <div className="flex h-full flex-col">
        {(!online || fromCache) && (
          <div role="status" className="flex items-center justify-center gap-2 px-4 text-xs font-medium" style={{ backgroundColor: "rgba(245,185,68,0.16)", color: AMBER, paddingTop: "calc(8px + env(safe-area-inset-top, 0px))", paddingBottom: 8 }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: AMBER }} /> {online ? "Couldn't reach Motiq — showing your saved garage" : "You're offline — showing your saved garage"}
          </div>
        )}
        <div ref={scrollRef} key={active} className="screen-in no-scrollbar flex-1 overflow-y-auto" style={{ paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
          {active === "home" && <Home />}
          {active === "market" && <Nearby />}
          {active === "ai" && <AIScreen />}
          {active === "garage" && <Garage />}
          {active === "profile" && <Profile />}
          {active === "music" && <MusicScreen onBack={() => goTo("home")} />}
          {active === "trip" && <TripScreen onBack={() => goTo("home")} onHistory={() => goTo("trip-history")} />}
          {active === "trip-history" && <TripHistoryScreen onBack={() => goTo("trip")} />}
          {active === "scan" && <ScanScreen onBack={() => goTo("home")} />}
          {active === "dash" && <Dashboard onBack={() => goTo("home")} />}
          {active === "admin" && <AdminScreen onBack={() => goTo("profile")} />}
        </div>
      </div>
      <BottomNav active={subScreen ? null : active} setActive={goTo} />
      {current && !carMode && (active === "home" || active === "music") && <MiniPlayer onOpen={() => setCarMode(true)} />}
      {carMode && <CarMode />}
      <audio ref={audioRef} src={current ? current.audio : undefined} onEnded={() => playAdjacent(1)} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} />
    </>
  );
}

function Splash() {
  return <div className="flex h-full w-full items-center justify-center" style={{ backgroundColor: "#212121" }}><Logo size={72} /></div>;
}
