// Trips: where you're going, a real route when the address is found, live GPS speed and distance,
// alerts (hard braking, leaving the route) read aloud, and a saved history.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Volume2, VolumeX, MapPin, Navigation, Loader2, Gauge, Timer, ShieldCheck, X, Check, Flag, AlertTriangle, Trash2 } from "lucide-react";
import { useTheme, useUI, ACCENT, RED, AMBER, GREEN, ScreenHeader, RoundButton, SectionHeader, PrimaryButton, fmtDist, kmIn, distUnit, speedUnit } from "../design.jsx";
import { clearTrips, updateTrip, voteRoadAlert } from "../lib/data.js";
import { ReportRoadSheet, SosButton } from "./Daily.jsx";
import { scoreColor, tripScore } from "../lib/daily.js";
import { Briefcase, Download, ThumbsUp, ThumbsDown } from "lucide-react";

const DEFAULT_PATH = "M 20 108 C 70 108 60 40 120 40 C 175 40 165 96 224 96 C 265 96 260 32 300 32";

function TripMap({ progress, color, track, route }) {
  const pathRef = useRef(null);
  const [marker, setMarker] = useState({ x: 20, y: 108 });
  const [length, setLength] = useState(0);
  const projected = useMemo(() => {
    if (!route || route.length < 2) return null;
    const lats = route.map((c) => c[0]), lons = route.map((c) => c[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLon = Math.min(...lons), maxLon = Math.max(...lons);
    const sLat = Math.max(maxLat - minLat, 0.0006), sLon = Math.max(maxLon - minLon, 0.0006);
    return route.map(([la, lo]) => [20 + ((lo - minLon) / sLon) * 280, 20 + (1 - (la - minLat) / sLat) * 100]);
  }, [route]);
  const d = projected ? projected.map(([x, y], i) => `${i ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ") : DEFAULT_PATH;
  const start = projected ? projected[0] : [20, 108];
  const end = projected ? projected[projected.length - 1] : [300, 32];
  useEffect(() => { if (pathRef.current) setLength(pathRef.current.getTotalLength()); }, [d]);
  useEffect(() => {
    if (!pathRef.current || !length) return;
    const p = pathRef.current.getPointAtLength(Math.max(0, Math.min(1, progress)) * length);
    setMarker({ x: p.x, y: p.y });
  }, [progress, length]);
  return (
    <svg viewBox="0 0 320 140" width="100%" height={140} className="block" role="img" aria-label="Route progress">
      <path d={d} fill="none" stroke={track} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      <path ref={pathRef} d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={length || 1} strokeDashoffset={length ? length * (1 - Math.max(0, Math.min(1, progress))) : 0} />
      <circle cx={start[0]} cy={start[1]} r={5} fill={track} />
      <g transform={`translate(${Math.min(end[0], 305) - 8}, ${Math.max(end[1], 16) - 16})`}><Flag size={15} style={{ color: track }} /></g>
      <circle cx={marker.x} cy={marker.y} r={7} fill={color} stroke="#212121" strokeWidth={2} />
    </svg>
  );
}

export function TripScreen({ onBack, onHistory }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT, RING_TRACK } = useTheme();
  const { trip, setTrip, startTrip, endTrip, dismissTrip, voiceAlerts, setVoiceAlerts, unit, openSheet, closeSheet } = useUI();
  const [origin, setOrigin] = useState("Current location");
  const [destination, setDestination] = useState("");
  const progress = trip.totalKm > 0 ? trip.coveredKm / trip.totalKm : 0;
  const remaining = Math.max(0, trip.totalKm - trip.coveredKm);
  const mins = Math.floor(trip.elapsedSec / 60), secs = trip.elapsedSec % 60;
  const alertIcon = (a) => (a.kind === "on" ? [Check, GREEN] : a.kind === "off" ? [Navigation, AMBER] : [AlertTriangle, RED]);

  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <ScreenHeader title="Trip" sub="Live journey tracking & safety alerts" onBack={onBack}
        right={<><RoundButton icon={Clock} label="Trip history" onClick={onHistory} /><RoundButton icon={voiceAlerts ? Volume2 : VolumeX} label={voiceAlerts ? "Mute voice alerts" : "Turn on voice alerts"} onClick={() => setVoiceAlerts(!voiceAlerts)} /></>} />

      {trip.status === "idle" && (
        <form onSubmit={(e) => { e.preventDefault(); if (destination.trim()) startTrip(origin.trim() || "Current location", destination.trim()); }} className="flex flex-col gap-4 rounded-3xl p-5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <label className="flex items-center gap-2 rounded-2xl px-4 py-3.5" style={{ backgroundColor: CARD_ALT }}>
            <span className="flex h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: FILL }} />
            <input value={origin} onChange={(e) => setOrigin(e.target.value)} aria-label="Starting from" placeholder="Your location" className="flex-1 bg-transparent text-sm outline-none" style={{ color: TEXT }} />
          </label>
          <label className="flex items-center gap-2 rounded-2xl px-4 py-3.5" style={{ backgroundColor: CARD_ALT }}>
            <MapPin size={13} style={{ color: SUB }} className="shrink-0" />
            <input value={destination} onChange={(e) => setDestination(e.target.value)} aria-label="Destination" placeholder="Where are you headed?" className="flex-1 bg-transparent text-sm outline-none" style={{ color: TEXT }} />
          </label>
          <PrimaryButton type="submit" disabled={!destination.trim()}><Navigation size={15} /> Start trip</PrimaryButton>
          <p className="text-center text-xs leading-relaxed" style={{ color: SUB }}>Motiq uses your phone's GPS for real speed and progress, and warns you about hard braking and leaving the route — out loud if voice alerts are on.</p>
        </form>
      )}

      {trip.status === "locating" && (
        <div className="flex flex-col items-center gap-3 rounded-3xl p-10 text-center" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <Loader2 size={22} className="animate-spin" style={{ color: ACCENT }} />
          <p className="text-sm font-medium" style={{ color: TEXT }}>Finding your route…</p>
          <p className="text-xs" style={{ color: SUB }}>{trip.origin} to {trip.destination}</p>
        </div>
      )}

      {(trip.status === "active" || trip.status === "arrived") && (
        <>
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center gap-1 rounded-full p-1" role="group" aria-label="Trip type" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              {[["personal", "Personal"], ["work", "Work"]].map(([k, l]) => <button key={k} aria-pressed={trip.purpose === k} onClick={() => setTrip((t) => ({ ...t, purpose: k }))} className="flex-1 rounded-full py-1.5 text-xs font-semibold" style={{ backgroundColor: trip.purpose === k ? FILL : "transparent", color: trip.purpose === k ? FILL_TEXT : SUB }}>{l}</button>)}
            </div>
            <button onClick={() => openSheet("Report a road problem", <ReportRoadSheet onDone={closeSheet} />)} className="flex h-10 items-center gap-1.5 rounded-full px-3 text-xs font-semibold" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, color: AMBER }} aria-label="Report a road problem"><AlertTriangle size={14} /> Report</button>
            <SosButton />
          </div>
          <div className="rounded-3xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs" style={{ color: trip.gps === "gps" ? GREEN : trip.gps === "off" ? AMBER : SUB }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: trip.gps === "gps" ? GREEN : trip.gps === "off" ? AMBER : SUB }} />
                {trip.gps === "gps" ? "Live GPS" : trip.gps === "off" ? "GPS unavailable — check location is on" : "Locating…"}
              </span>
              <span className="rounded-full px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: CARD_ALT, color: trip.realRoute ? GREEN : SUB }}>{trip.realRoute ? "Real route" : "Estimated route"}</span>
            </div>
            <TripMap progress={progress} color={FILL} track={RING_TRACK} route={trip.route} />
            <div className="mt-3 flex items-center justify-between gap-3 text-xs" style={{ color: SUB }}>
              <span className="flex min-w-0 items-center gap-1"><span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: FILL }} /><span className="truncate">{trip.origin}</span></span>
              <span className="flex min-w-0 items-center gap-1"><span className="truncate">{trip.destination}</span><Flag size={11} className="shrink-0" /></span>
            </div>
          </div>

          {trip.status === "arrived" ? (
            <div className="flex flex-col items-center gap-2 rounded-3xl p-6 text-center" style={{ backgroundColor: "rgba(61,220,132,0.1)", border: `1px solid ${BORDER}` }}>
              <Check size={22} style={{ color: GREEN }} />
              <p className="text-sm font-semibold" style={{ color: TEXT }}>You've arrived at {trip.destination}</p>
              <p className="text-xs" style={{ color: SUB }}>{fmtDist(trip.coveredKm, unit)} in {mins}m {secs}s · driving score <b style={{ color: scoreColor(tripScore(trip).score) }}>{tripScore(trip).score}</b></p>
              <PrimaryButton onClick={() => { dismissTrip(); setDestination(""); }} className="mt-2 px-6">Done</PrimaryButton>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                {[[Gauge, Math.round(kmIn(trip.kmh, unit)), speedUnit(unit)], trip.free ? [MapPin, kmIn(trip.coveredKm, unit).toFixed(1), `${distUnit(unit)} driven`] : [MapPin, kmIn(remaining, unit).toFixed(1), `${distUnit(unit)} to go`], [Timer, `${mins}:${String(secs).padStart(2, "0")}`, "elapsed"]].map(([Icon, v, l]) => (
                  <div key={l} className="flex flex-col items-center gap-1 rounded-2xl p-3.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                    <Icon size={14} style={{ color: SUB }} /><p className="font-bold" style={{ fontSize: 18, color: TEXT }}>{v}</p><p style={{ fontSize: 10, color: SUB }}>{l}</p>
                  </div>
                ))}
              </div>
              {trip.free ? <p className="text-xs" style={{ color: SUB }}>Started automatically when you began driving. It saves itself after you've been parked for a few minutes.</p> : <div>
                <div className="mb-1.5 flex items-center justify-between text-xs" style={{ color: SUB }}><span>{fmtDist(trip.coveredKm, unit)} covered</span><span>{fmtDist(trip.totalKm, unit)} total</span></div>
                <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: CARD_ALT }}><div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, progress * 100)}%`, backgroundColor: FILL }} /></div>
              </div>}
              <div className="flex items-center gap-2 rounded-2xl px-4 py-3" style={{ backgroundColor: "rgba(239,255,0,0.08)", border: `1px solid ${BORDER}` }}>
                <ShieldCheck size={14} style={{ color: ACCENT }} className="shrink-0" />
                <p className="text-xs leading-relaxed" style={{ color: TEXT }}>Eyes on the road. Keep your seatbelt on and let a passenger handle the phone.</p>
              </div>
              <SectionHeader title="Journey alerts" />
              {trip.alerts.length === 0 ? (
                <div className="flex flex-col items-center gap-1.5 rounded-2xl py-8 text-center" style={{ backgroundColor: CARD_ALT }}>
                  <ShieldCheck size={16} style={{ color: SUB }} /><p className="text-xs" style={{ color: SUB }}>No alerts so far — smooth driving.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {trip.alerts.map((a) => { const [Icon, color] = alertIcon(a); return (
                    <div key={a.id} className="flex gap-3 rounded-2xl p-3.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}1F` }}><Icon size={14} style={{ color }} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between"><p className="text-sm font-medium" style={{ color: TEXT }}>{a.title}</p><p style={{ fontSize: 10, color: SUB }}>{Math.floor(a.at / 60)}:{String(a.at % 60).padStart(2, "0")}</p></div>
                        <p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{a.detail}</p>
                        {a.roadId && !a.voted && <div className="mt-1.5 flex gap-3 text-[11px] font-medium" style={{ color: SUB }}>
                          {[[true, "Still there", ThumbsUp], [false, "Gone", ThumbsDown]].map(([still, l, I]) => <button key={l} onClick={() => { voteRoadAlert(a.roadId, still).catch(() => {}); setTrip((t) => ({ ...t, alerts: t.alerts.map((x) => (x.id === a.id ? { ...x, voted: true } : x)) })); }} className="flex items-center gap-1"><I size={12} /> {l}</button>)}
                        </div>}
                      </div>
                    </div>
                  ); })}
                </div>
              )}
              <button onClick={endTrip} className="mt-1 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold active:scale-95 transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, color: RED }}><X size={14} /> End trip</button>
            </>
          )}
        </>
      )}
    </div>
  );
}

export function TripHistoryScreen({ onBack }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const { trips, setTrips, uid, unit, confirm, showToast, vehicles } = useUI();
  const [only, setOnly] = useState("all");
  const shown = trips.filter((t) => only === "all" || t.purpose === only);
  const setPurpose = async (t, purpose) => {
    setTrips((list) => list.map((x) => (x.id === t.id ? { ...x, purpose } : x)));
    try { await updateTrip(t.id, { purpose }); } catch (e) { setTrips((list) => list.map((x) => (x.id === t.id ? t : x))); showToast(/purpose/.test(e.message) ? "Work trips need one more setup step in the database." : e.message); }
  };
  const exportLog = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const car = (id) => { const v = vehicles.find((x) => x.id === id); return v ? [v.year, v.make, v.model].filter(Boolean).join(" ") : ""; };
    const rows = shown.map((t) => [new Date(t.ended_at).toISOString().slice(0, 10), new Date(new Date(t.ended_at).getTime() - t.duration_sec * 1000).toTimeString().slice(0, 5), t.origin, t.destination, kmIn(Number(t.distance_km), unit).toFixed(1), distUnit(unit), t.purpose || "personal", car(t.vehicle_id), t.note || ""]);
    const csv = ["Date,Start time,From,To,Distance,Unit,Purpose,Car,Note", ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); a.download = `motiq-mileage-${only}.csv`; document.body.appendChild(a); a.click(); a.remove();
    showToast("Mileage log downloaded");
  };
  const workKm = trips.filter((t) => t.purpose === "work").reduce((s, t) => s + Number(t.distance_km || 0), 0);
  const fmt = (sec) => { const m = Math.floor(sec / 60), s = sec % 60; return m > 0 ? `${m}m ${s}s` : `${s}s`; };
  const when = (ts) => { const d = new Date(ts); return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`; };
  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <ScreenHeader title="Trip history" sub={`${trips.length} past ${trips.length === 1 ? "trip" : "trips"}`} onBack={onBack}
        right={trips.length > 0 && <RoundButton icon={Trash2} color={RED} label="Clear trip history" onClick={() => confirm("Clear trip history?", "All your saved trips will be deleted. This can't be undone.", "Clear", async () => { try { await clearTrips(uid); setTrips([]); } catch (e) { showToast(e.message); } })} />} />
      {trips.length > 0 && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">{[["all", "All"], ["work", "Work"], ["personal", "Personal"]].map(([k, l]) => <button key={k} onClick={() => setOnly(k)} aria-pressed={only === k} className="rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: only === k ? TEXT : CARD_ALT, color: only === k ? CARD : SUB }}>{l}</button>)}</div>
          <button onClick={exportLog} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: TEXT }} aria-label="Export mileage log"><Download size={13} /> Mileage log</button>
        </div>
      )}
      {workKm > 0 && <p className="-mt-2 text-xs" style={{ color: SUB }}>{fmtDist(workKm, unit)} of work driving recorded</p>}
      {trips.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl py-14 text-center" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <Navigation size={20} style={{ color: SUB }} /><p className="text-sm font-medium" style={{ color: TEXT }}>No trips yet</p>
          <p className="max-w-[220px] text-xs leading-relaxed" style={{ color: SUB }}>Trips you start and finish will show up here.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-2xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" style={{ color: TEXT }}>{t.origin} → {t.destination}</p><p className="mt-0.5 text-xs" style={{ color: SUB }}>{when(t.ended_at)}</p></div>
                <span className="shrink-0 rounded-full px-2 py-1 text-[10px] font-medium" style={{ backgroundColor: CARD_ALT, color: t.completed ? GREEN : AMBER }}>{t.completed ? "Completed" : "Ended early"}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: SUB }}>
                <span className="flex items-center gap-1"><MapPin size={11} />{fmtDist(Number(t.distance_km), unit)}</span>
                <span className="flex items-center gap-1"><Timer size={11} />{fmt(t.duration_sec)}</span>
                {t.alerts > 0 && <span className="flex items-center gap-1"><AlertTriangle size={11} />{t.alerts} alert{t.alerts === 1 ? "" : "s"}</span>}
                <span>{t.real_route ? "Real route" : "Estimated"}</span>
                {t.score != null && <span className="font-semibold" style={{ color: scoreColor(t.score) }}>Score {t.score}</span>}
              </div>
              <div className="flex gap-2">{[["personal", "Personal"], ["work", "Work"]].map(([k, l]) => <button key={k} onClick={() => setPurpose(t, k)} aria-pressed={(t.purpose || "personal") === k} aria-label={`${l} trip`} className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: (t.purpose || "personal") === k ? CARD_ALT : "transparent", color: (t.purpose || "personal") === k ? TEXT : SUB, border: `1px solid ${BORDER}` }}>{k === "work" && <Briefcase size={11} />}{l}</button>)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
