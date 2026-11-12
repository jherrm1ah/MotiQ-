// Home: the selected car at a glance (health, fault codes, what's due, live OBD data, trips)
// and quick ways into everything else. Every number here comes from the driver's real data.
import React, { useMemo } from "react";
import {
  Bell, ChevronRight, Search, SlidersHorizontal, Camera, Car, Bluetooth, BluetoothConnected, Navigation, Music2,
  Timer, ShieldAlert, AlertTriangle, ScanLine, CircleDot, FileText, Wrench, Package, Droplets, BatteryCharging, Building2, Fuel, Zap, Plus,
} from "lucide-react";
import { t } from "../lib/i18n.js";
import {
  useTheme, useUI, ACCENT, RED, AMBER, GREEN, BLUE, PURPLE, CYAN, GlowIcon, Ring, NotifRow, Stat, LiveStat, RowButton, PrimaryButton, SecondaryButton, NeonButton,
  carLabel, carFull, healthColor, toneColor, timeAgo, fmtDist, fmtSpeed, fmtTemp, fmtDuration,
} from "../design.jsx";
import { reminderState } from "../lib/data.js";
import { daysUntil, dateLabel } from "../lib/units.js";
import { CarForm, ReminderForm, ServiceForm, OBDConnectSheet } from "./Garage.jsx";

export const PLACE_ICONS = {
  Mechanics: [Wrench, ACCENT], "Auto parts": [Package, BLUE], Tyres: [CircleDot, RED], Batteries: [BatteryCharging, PURPLE],
  "Car wash": [Droplets, CYAN], "Service centres": [Building2, GREEN], Fuel: [Fuel, AMBER], "EV charging": [Zap, GREEN],
};

export default function Home() {
  const ui = useUI();
  const { me, unit, vehicles, vehicle, setCarId, garage, documents, trips, trip, obd, liveData, connectOBD, disconnectOBD, goTo, openSheet, closeSheet, prefs } = ui;
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, RING_TRACK, FILL, FILL_TEXT, mode } = useTheme();
  const firstName = (me.name || "").trim().split(/\s+/)[0];

  // Real alerts: overdue/soon service, documents expiring, fault codes, a live trip.
  const notifications = useMemo(() => {
    const list = [];
    if (trip.status === "active") list.push({ key: "trip", icon: Navigation, color: ACCENT, title: "Trip in progress", time: "Live", text: trip.free ? `${fmtDist(trip.coveredKm, unit)} driven — started automatically` : `${fmtDist(Math.max(0, trip.totalKm - trip.coveredKm), unit)} to ${trip.destination}`, go: "trip" });
    if (prefs.alertsTrips) trip.alerts.slice(0, 3).forEach((a) => list.push({ key: a.id, icon: AlertTriangle, color: AMBER, title: a.title, time: timeAgo(a.ts), text: a.detail, go: "trip" }));
    for (const v of vehicles) {
      const scan = v.healthInfo.scan;
      if (prefs.alertsScans && scan && (scan.codes || []).length) list.push({ key: `scan-${v.id}`, icon: ShieldAlert, color: RED, title: `${scan.codes.length} fault code${scan.codes.length === 1 ? "" : "s"}`, time: timeAgo(scan.created_at), text: `${carLabel(v)} — ${scan.codes.map((c) => c.code).join(", ")}`, go: "scan", car: v.id });
      if (prefs.alertsService) {
        for (const r of garage.reminders.filter((r) => r.vehicle_id === v.id && !r.done_at)) {
          const st = reminderState(r, v.odometer);
          if (st === "overdue" || st === "soon") list.push({ key: r.id, icon: CircleDot, color: st === "overdue" ? RED : BLUE, title: st === "overdue" ? "Service overdue" : "Service due soon", time: r.due_on ? dateLabel(r.due_on) : "", text: `${carLabel(v)} — ${r.title}`, go: "garage" });
        }
      }
    }
    if (prefs.alertsDocuments) {
      for (const d of documents) {
        const days = d.expires_on ? daysUntil(d.expires_on) : null;
        if (days != null && days <= 30) {
          const v = vehicles.find((x) => x.id === d.vehicle_id);
          list.push({ key: d.id, icon: FileText, color: days < 0 ? RED : AMBER, title: days < 0 ? `${d.title} expired` : `${d.title} expires soon`, time: dateLabel(d.expires_on), text: `${carLabel(v)} — ${days < 0 ? `${-days} days ago` : days === 0 ? "today" : `in ${days} days`}`, go: "profile" });
        }
      }
    }
    return list;
  }, [vehicles, garage, documents, trip, prefs, unit]);

  // Last 7 days of real trip distance, one bar per day (today last).
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return { start: d.getTime(), km: 0 }; });
    for (const t of trips) { const ts = new Date(t.ended_at).getTime(); const day = days.find((d) => ts >= d.start && ts < d.start + 86400000); if (day) day.km += Number(t.distance_km) || 0; }
    return days;
  }, [trips]);
  if (!vehicle) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-8 text-center">
        <GlowIcon icon={Car} glow={ACCENT} size={22} />
        <p className="text-base font-semibold" style={{ color: TEXT }}>{firstName ? `Welcome, ${firstName}` : "Welcome to Motiq"}</p>
        <p className="max-w-[260px] text-sm leading-relaxed" style={{ color: SUB }}>Add your car to see its health, what's due, live data from an OBD-II adapter, and AI help.</p>
        <PrimaryButton className="mt-2 px-5" onClick={() => openSheet("Add a vehicle", <CarForm onDone={(c) => { setCarId(c.id); closeSheet(); }} />)}><Plus size={15} /> Add your car</PrimaryButton>
      </div>
    );
  }

  const info = vehicle.healthInfo;
  const scan = info.scan;
  const codes = (scan && scan.codes) || [];
  const connectedHere = obd.status === "connected" && obd.vehicleId === vehicle.id;
  const fuelPct = liveData && liveData.fuel_pct != null ? liveData.fuel_pct : scan && scan.readings && scan.readings.fuel_pct != null ? scan.readings.fuel_pct : null;
  const fuelSource = liveData && liveData.fuel_pct != null ? "obd" : "scan";
  const battery = liveData && liveData.battery_v != null ? liveData.battery_v : scan && scan.readings ? scan.readings.battery_v : null;
  const openReminders = garage.reminders.filter((r) => r.vehicle_id === vehicle.id && !r.done_at);
  const dueCount = vehicles.reduce((n, v) => n + v.healthInfo.overdue.length + v.healthInfo.soon.length, 0);

  const weekTrips = trips.filter((t) => Date.now() - new Date(t.ended_at).getTime() < 7 * 86400000);
  const weekKm = weekTrips.reduce((s, t) => s + Number(t.distance_km || 0), 0);
  const maxKm = Math.max(1, ...week.map((d) => d.km));

  const openHealth = () => openSheet(`Vehicle health — ${vehicle.health}/100`, <HealthSheet />);
  const openFuel = () => openSheet("Fuel & battery", (
    <div className="flex flex-col gap-3">
      <Stat label="Fuel level" value={fuelPct != null ? `${fuelPct}%` : "—"} source={fuelPct != null ? fuelSource : null} />
      <Stat label="12V battery" value={battery != null ? `${battery} V` : "Connect OBD-II to check"} color={battery == null ? null : battery < 12.2 ? RED : battery < 12.6 ? AMBER : GREEN} source={battery != null ? (liveData && liveData.battery_v != null ? "obd" : "scan") : null} />
      <p className="mt-1 text-xs leading-relaxed" style={{ color: SUB }}>Fuel and battery come from your OBD-II adapter (live) or your last scan. Not every car reports fuel level over OBD-II. Battery health isn't a standard reading, so Motiq judges it from voltage: about 12.6 V with the engine off and 13.7–14.7 V running is normal.</p>
      {!connectedHere && <PrimaryButton onClick={() => openSheet("Connect OBD-II adapter", <OBDConnectSheet onScan={() => { closeSheet(); connectOBD(vehicle.id); }} />)}><Bluetooth size={15} /> Connect adapter</PrimaryButton>}
    </div>
  ));
  const openService = () => openSheet("Service", <ServiceDueSheet />);
  const openTrips = () => openSheet("Trips & runtime", (
    <div className="flex flex-col gap-3">
      {liveData ? (<><Stat label="Engine running this session" value={fmtDuration(liveData.runtimeSec)} source="obd" /><Stat label="Idling this session" value={fmtDuration(liveData.idleSec)} source="calculated" /></>) : <Stat label="Engine runtime" value="Connect OBD-II to track" />}
      <Stat label="Trips this week" value={String(weekTrips.length)} source="calculated" />
      <Stat label="Distance this week" value={fmtDist(weekKm, unit)} source="calculated" />
      {weekTrips.length > 0 && <Stat label="Longest trip" value={fmtDuration(Math.max(...weekTrips.map((t) => t.duration_sec)))} source="calculated" />}
      <PrimaryButton onClick={() => goTo("trip")}><Navigation size={15} /> {trip.status === "active" ? "Open live trip" : "Start a trip"}</PrimaryButton>
    </div>
  ));
  const due = vehicle.nextDue;
  const tripLive = trip.status === "active" || trip.status === "arrived" || trip.status === "locating";
  const openAdapter = () => (connectedHere ? goTo("dash") : openSheet("Connect OBD-II adapter", <OBDConnectSheet onScan={() => { closeSheet(); connectOBD(vehicle.id); }} onDemo={() => goTo("scan")} />));

  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <div className="flex items-start justify-between pt-2">
        <div>
          <h1 className="font-bold tracking-tight" style={{ fontSize: 22, color: TEXT }}>{t("Hi")}{firstName ? `, ${firstName}` : ""}</h1>
          <p className="mt-0.5 text-sm" style={{ color: SUB }}>{t(codes.length ? "Your car needs a look." : vehicle.healthInfo.overdue.length ? "Something's overdue." : "Here's your car today.")}</p>
        </div>
        <button onClick={() => openSheet("Notifications", <Notifications items={notifications} />)} className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform" style={{ backgroundColor: CARD }} aria-label={`Notifications${notifications.length ? ` (${notifications.length})` : ""}`}>
          <Bell size={16} style={{ color: TEXT }} />
          {notifications.length > 0 && <span className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ backgroundColor: notifications.some((n) => n.color === RED) ? RED : ACCENT }} />}
        </button>
      </div>

      {vehicles.length > 1 && (
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {vehicles.map((v) => (
            <button key={v.id} onClick={() => setCarId(v.id)} aria-pressed={v.id === vehicle.id} className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium active:scale-95 transition-transform" style={v.id === vehicle.id ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD_ALT, color: SUB, border: `1px solid ${BORDER}` }}>{carLabel(v)}</button>
          ))}
        </div>
      )}

      {/* The car, at a glance: health, what's wrong, what's next. */}
      <section aria-label="Your car" className="p-5" style={{ borderRadius: 28, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        <button onClick={openHealth} className="flex w-full items-center gap-4 text-left" aria-label={`Vehicle health ${vehicle.health} out of 100, ${info.label}. Open report`}>
          <div className="relative flex shrink-0 items-center justify-center">
            <Ring pct={vehicle.health} color={healthColor(vehicle.health)} track={RING_TRACK} size={84} stroke={7} />
            <div className="absolute flex flex-col items-center leading-none">
              <span className="font-bold" style={{ fontSize: 20, color: TEXT }}>{vehicle.health}%</span>
              <span className="mt-1" style={{ fontSize: 9, color: SUB }}>health</span>
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p style={{ fontSize: 11, color: SUB }}>{t("Vehicle health")}</p>
            <p className="truncate font-bold tracking-tight" style={{ fontSize: 17, color: TEXT }}>{carLabel(vehicle)}</p>
            <p className="mt-0.5 truncate text-xs" style={{ color: SUB }}>{vehicle.nickname ? `${carFull(vehicle)} · ` : ""}{(vehicle.odometer || 0).toLocaleString()} {unit}</p>
            <p className="mt-1 text-xs font-semibold" style={{ color: healthColor(vehicle.health) }}>{info.label}</p>
          </div>
          <ChevronRight size={16} style={{ color: SUB }} className="shrink-0" />
        </button>

        <div className="mt-4 flex flex-col gap-2">
          {codes.length > 0 && (
            <button onClick={() => goTo("scan")} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: "rgba(244,85,61,0.12)" }}>
              <ShieldAlert size={15} style={{ color: RED }} className="shrink-0" />
              <span className="min-w-0 flex-1"><span className="block text-sm font-medium" style={{ color: TEXT }}>{codes.length} fault code{codes.length === 1 ? "" : "s"} from your last scan</span><span className="block text-xs" style={{ color: SUB }}>{codes.map((c) => c.code).join(", ")} · {timeAgo(scan.created_at)}</span></span>
              <ChevronRight size={14} style={{ color: SUB }} />
            </button>
          )}
          <button onClick={openService} className="flex items-center gap-2.5 rounded-2xl px-3.5 py-3 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD_ALT }}>
            <CircleDot size={15} style={{ color: due ? (due.urgent ? RED : due.state === "soon" ? AMBER : SUB) : SUB }} className="shrink-0" />
            <span className="min-w-0 flex-1"><span className="block text-sm" style={{ color: TEXT }}>{due ? due.title : "No service reminders yet"}</span><span className="block text-xs" style={{ color: due && due.urgent ? RED : SUB }}>{due ? due.when : "Add one so Motiq can tell you when it's due"}</span></span>
            <ChevronRight size={14} style={{ color: SUB }} />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={openHealth} className="rounded-2xl py-3 text-xs font-semibold active:scale-95 transition-transform" style={{ backgroundColor: CARD_ALT, color: TEXT, border: `1px solid ${BORDER}` }}>{t("Health report")}</button>
          <NeonButton onClick={() => goTo("scan")} className="rounded-2xl py-3 text-xs"><ScanLine size={13} /> {t("Scan car")}</NeonButton>
        </div>
      </section>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3">
        <QuickTile icon={connectedHere ? BluetoothConnected : Bluetooth} label={t("Adapter")} aria={connectedHere ? "Adapter connected, scan" : "Connect OBD-II adapter"}
          status={connectedHere ? t("Connected") : obd.status === "connecting" ? "…" : t("Connect")} color={connectedHere ? GREEN : null} onClick={openAdapter} disabled={obd.status === "connecting"} />
        <QuickTile icon={Navigation} label={t("Trip")} aria={tripLive ? "Open live trip" : "Start a trip"}
          status={trip.status === "active" && trip.free ? `${fmtDist(trip.coveredKm, unit, 1)}` : trip.status === "active" ? `${fmtDist(Math.max(0, trip.totalKm - trip.coveredKm), unit, 0)} to go` : trip.status === "arrived" ? "Arrived" : trip.status === "locating" ? "…" : t("Start")} color={tripLive ? (mode === "light" ? "#6B7500" : ACCENT) : null} onClick={() => goTo("trip")} />
        <QuickTile icon={Music2} label={t("Car Mode")} aria="Car Mode Radio" status={t("Radio & voice")} onClick={() => goTo("music")} />
      </div>

      {connectedHere && (
        <div className="rounded-3xl p-3.5" style={{ backgroundColor: "rgba(61,220,132,0.1)", border: `1px solid ${BORDER}` }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 animate-pulse rounded-full" style={{ backgroundColor: GREEN }} /><span className="truncate font-medium" style={{ fontSize: 12, color: TEXT }}>Live · {obd.deviceName}</span></div>
            <button type="button" onClick={() => goTo("dash")} className="shrink-0 font-semibold" style={{ fontSize: 11, color: TEXT }}>{t("Live dashboard")} →</button>
          </div>
          <div className="mt-2.5 grid grid-cols-4 gap-1.5">
            <LiveStat label="RPM" value={liveData && liveData.rpm != null ? liveData.rpm : "—"} />
            <LiveStat label="Speed" value={liveData && liveData.speed_kmh != null ? fmtSpeed(liveData.speed_kmh, unit) : "—"} />
            <LiveStat label="Coolant" value={liveData && liveData.coolant_c != null ? fmtTemp(liveData.coolant_c, unit) : "—"} />
            <LiveStat label="Battery" value={liveData && liveData.battery_v != null ? `${liveData.battery_v}V` : "—"} />
          </div>
        </div>
      )}

      <button onClick={() => goTo("ai", { ask: "__photo__" })} className="flex items-center gap-3 p-4 text-left active:scale-[0.98] transition-transform" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: CARD_ALT }}><Camera size={18} style={{ color: TEXT }} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: TEXT }}>{t("AI Vision Scan")}</p>
          <p className="text-xs leading-snug" style={{ color: SUB }}>{t("Snap a warning light or damage — get a verdict")}</p>
        </div>
        <span className="shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold" style={{ backgroundColor: FILL, color: FILL_TEXT }}>{t("Open AI")}</span>
      </button>

      <div className="flex items-center gap-2">
        <button onClick={() => goTo("market", { filter: "All" })} className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full px-4 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <Search size={15} style={{ color: SUB }} className="shrink-0" />
          <span className="truncate text-sm" style={{ color: SUB }}>{t("Search mechanics, parts, tyres...")}</span>
        </button>
        <button onClick={() => openSheet("Browse by category", <CategoryList />)} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform" style={{ backgroundColor: FILL }} aria-label="Browse categories">
          <SlidersHorizontal size={17} style={{ color: FILL_TEXT }} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button onClick={openFuel} className="p-4 text-left active:scale-[0.97] transition-transform" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, color: SUB }}>{t("Fuel & battery")}</p>
          <p className="mt-1 font-bold" style={{ fontSize: 24, color: TEXT }}>{fuelPct != null ? `${fuelPct}%` : "—"}</p>
          <p className="mt-0.5 truncate" style={{ fontSize: 11, color: SUB }}>{fuelPct != null ? (fuelSource === "obd" ? "Live from adapter" : "From last scan") : "Connect OBD-II"}</p>
          <p className="mt-2 truncate font-mono" style={{ fontSize: 11, color: battery == null ? SUB : battery < 12.2 ? RED : TEXT }}>{battery != null ? `${battery} V battery` : "Battery —"}</p>
        </button>
        <button onClick={openTrips} className="p-4 text-left active:scale-[0.97] transition-transform" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <p style={{ fontSize: 11, color: SUB }}>{t("This week")}</p>
          <p className="mt-1 font-bold" style={{ fontSize: 24, color: TEXT }}>{fmtDist(weekKm, unit, 0)}</p>
          <p className="mt-0.5" style={{ fontSize: 11, color: SUB }}>{weekTrips.length} trip{weekTrips.length === 1 ? "" : "s"}{liveData ? ` · ${fmtDuration(liveData.runtimeSec)} engine` : ""}</p>
          <div className="mt-2 flex h-6 items-end gap-1" aria-label={`Distance driven each day this week, ${fmtDist(weekKm, unit)} in total`}>
            {week.map((d, i) => <div key={i} className="flex-1 rounded-full" style={{ height: `${Math.max(3, (d.km / maxKm) * 22)}px`, backgroundColor: i === 6 ? FILL : BORDER }} />)}
          </div>
        </button>
      </div>

      <div className="relative flex items-center gap-2.5">
        {dueCount > 0 && <span className="absolute -left-1 -top-2 z-10 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold" style={{ fontSize: 9, backgroundColor: FILL, color: FILL_TEXT }} aria-label={`${dueCount} service items due`}>{dueCount}</span>}
        <button onClick={() => goTo("market", { filter: "Service centres" })} className="flex-1 rounded-2xl py-3 text-center active:scale-95 transition-transform" style={{ fontSize: 12, backgroundColor: CARD, border: `1px solid ${BORDER}`, color: TEXT }}>{t("Service centres")}</button>
        <button onClick={() => goTo("market", { filter: "Mechanics" })} className="flex-1 rounded-2xl py-3 text-center font-semibold active:scale-95 transition-transform" style={{ fontSize: 12, backgroundColor: FILL, color: FILL_TEXT }}>{t("Mechanics near me")}</button>
      </div>
    </div>
  );
}

function QuickTile({ icon: Icon, label, status, color, onClick, aria, disabled }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  return (
    <button onClick={onClick} disabled={disabled} aria-label={aria} className="flex flex-col items-start gap-2.5 p-3.5 text-left active:scale-95 transition-transform disabled:opacity-60" style={{ borderRadius: 22, backgroundColor: color ? `${color}14` : CARD, border: `1px solid ${color ? `${color}55` : BORDER}` }}>
      <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ backgroundColor: color ? `${color}26` : CARD_ALT }}><Icon size={16} style={{ color: color || TEXT }} /></span>
      <span className="w-full min-w-0">
        <span className="block truncate text-sm font-semibold" style={{ color: TEXT }}>{label}</span>
        <span className="block truncate" style={{ fontSize: 11, color: color || SUB }}>{status}</span>
      </span>
    </button>
  );
}

function Notifications({ items }) {
  const { SUB } = useTheme();
  const { goTo, setCarId } = useUI();
  if (!items.length) return <p className="py-6 text-center text-sm" style={{ color: SUB }}>You're all caught up. Motiq will tell you here when something's due, a scan finds a problem or a document is about to expire.</p>;
  return <div className="flex flex-col gap-4">{items.map((n) => <NotifRow key={n.key} icon={n.icon} color={n.color} title={n.title} time={n.time} text={n.text} onClick={() => { if (n.car) setCarId(n.car); goTo(n.go); }} />)}</div>;
}

function CategoryList() {
  const { CARD_ALT, TEXT } = useTheme();
  const { goTo } = useUI();
  return (
    <div className="flex flex-col gap-2">
      {Object.entries(PLACE_ICONS).map(([label, [icon, glow]]) => (
        <button key={label} onClick={() => goTo("market", { filter: label })} className="flex items-center gap-3 rounded-2xl p-3 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD_ALT }}>
          <GlowIcon icon={icon} glow={glow} size={16} /><span className="text-sm" style={{ color: TEXT }}>{label}</span>
        </button>
      ))}
    </div>
  );
}

// What makes up the health score, all from this car's scans, reminders and service history.
function HealthSheet() {
  const { vehicle, goTo, openSheet, closeSheet } = useUI();
  const { TEXT, SUB, CARD_ALT, RING_TRACK } = useTheme();
  if (!vehicle) return null;
  const info = vehicle.healthInfo;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-4 rounded-2xl p-4" style={{ backgroundColor: CARD_ALT }}>
        <div className="relative flex items-center justify-center"><Ring pct={vehicle.health} color={healthColor(vehicle.health)} track={RING_TRACK} size={58} stroke={6} /><span className="absolute text-sm font-bold" style={{ color: TEXT }}>{vehicle.health}</span></div>
        <div className="min-w-0">
          <p className="text-sm font-semibold" style={{ color: TEXT }}>{info.label}</p>
          <p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{carFull(vehicle)} · from your last scan, service reminders and history.</p>
        </div>
      </div>
      {info.notes.map((n, i) => (
        <div key={i} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ backgroundColor: CARD_ALT }}>
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: toneColor(n.tone, SUB) }} />
          <span className="text-sm" style={{ color: TEXT }}>{n.text}</span>
        </div>
      ))}
      {info.notes.length === 0 && <p className="text-sm" style={{ color: SUB }}>Nothing to flag. Keep logging services and scanning now and then.</p>}
      <div className="mt-1 grid grid-cols-2 gap-3">
        <SecondaryButton onClick={() => openSheet("Add a reminder", <ReminderForm car={vehicle} onDone={closeSheet} />)}>Add reminder</SecondaryButton>
        <PrimaryButton onClick={() => goTo(info.scan ? "scan" : "scan")}><ScanLine size={15} /> Scan</PrimaryButton>
      </div>
      {info.tone === "bad" && <SecondaryButton onClick={() => goTo("market", { filter: "Mechanics" })}><Wrench size={14} /> Find a mechanic nearby</SecondaryButton>}
    </div>
  );
}

function ServiceDueSheet() {
  const { vehicle, garage, unit, me, goTo, openSheet, closeSheet } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const open = garage.reminders.filter((r) => r.vehicle_id === vehicle.id && !r.done_at);
  const last = garage.services.find((s) => s.vehicle_id === vehicle.id);
  return (
    <div className="flex flex-col gap-3">
      {open.length === 0 && <p className="text-sm" style={{ color: SUB }}>No reminders for this car yet. Add the oil change, tyres, insurance and licence so Motiq can tell you when they're due.</p>}
      {open.map((r) => {
        const st = reminderState(r, vehicle.odometer);
        const color = st === "overdue" ? RED : st === "soon" ? AMBER : SUB;
        return (
          <div key={r.id} className="flex items-center justify-between gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD_ALT }}>
            <div className="min-w-0">
              <p className="text-sm" style={{ color: TEXT }}>{r.title}</p>
              <p className="mt-0.5 text-xs" style={{ color }}>{st === "overdue" ? "Overdue" : st === "soon" ? "Due soon" : "Coming up"}{r.due_on ? ` · ${dateLabel(r.due_on)}` : ""}{r.due_odometer != null ? ` · at ${r.due_odometer.toLocaleString()} ${unit}` : ""}</p>
            </div>
          </div>
        );
      })}
      {last && <Stat label="Last service" value={`${last.title} · ${dateLabel(last.done_on)}`} />}
      <div className="mt-1 grid grid-cols-2 gap-3">
        <SecondaryButton onClick={() => openSheet("Add a reminder", <ReminderForm car={vehicle} onDone={closeSheet} />)}>Add reminder</SecondaryButton>
        <SecondaryButton onClick={() => openSheet("Log a service", <ServiceForm car={vehicle} onDone={closeSheet} />)}>Log service</SecondaryButton>
      </div>
      <PrimaryButton onClick={() => goTo("market", { filter: "Service centres" })}>Browse service centres</PrimaryButton>
    </div>
  );
}
