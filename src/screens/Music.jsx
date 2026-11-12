// Car Mode Radio: free Creative Commons music (Jamendo) that keeps playing across the app, and
// Car Mode — a big, simple screen for the road with the music controls and Motiq's hands-free
// voice co-pilot (tap the mic, ask out loud, hear the answer).
import { reportRoadAlert } from "../lib/data.js";
import { currentPosition } from "../lib/geo.js";
import { emergencyNumber } from "../lib/daily.js";
import { AlertTriangle } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import { ArrowLeft, ListMusic, Search, Heart, Plus, Play, Pause, SkipBack, SkipForward, X, Mic, Square, Volume2, VolumeX, Loader2, Music2 } from "lucide-react";
import { useTheme, useUI, RED, ACCENT, Skeleton, ScreenHeader, RoundButton, Pill, TrackThumb, carLabel } from "../design.jsx";
import { fetchTracks, MUSIC_GENRES } from "../lib/music.js";
import { askMotiq } from "../lib/data.js";
import { listen, stopListening, speak, stopSpeaking, canListen, canSpeak } from "../lib/voice.js";
import { describeCode } from "../lib/dtc.js";

export default function MusicScreen({ onBack }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const { current, isPlaying, playTrack, setBrowseList, queue, addToQueue, toggleFavorite, isFavorite, openSheet, closeSheet, setCarMode } = useUI();
  const [query, setQuery] = useState("");
  const [genre, setGenre] = useState("Chill");
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const req = useRef(0);

  useEffect(() => {
    const id = ++req.current;
    const q = query.trim();
    setLoading(true); setError(null);
    const t = setTimeout(() => {
      fetchTracks({ query: q, tag: q ? "" : genre })
        .then((r) => { if (req.current === id) { setTracks(r); setBrowseList(r); } })
        .catch(() => { if (req.current === id) setError("Couldn't load music — check your connection."); })
        .finally(() => { if (req.current === id) setLoading(false); });
    }, q ? 350 : 0);
    return () => clearTimeout(t);
  }, [genre, query]);

  return (
    <div className="flex flex-col gap-5 px-5 pt-2" style={{ paddingBottom: current ? 190 : 120 }}>
      <ScreenHeader title="Car Mode Radio" sub="Free music via Jamendo" onBack={onBack}
        right={<><RoundButton icon={ListMusic} label="Your library" badge={queue.length || null} onClick={() => openSheet("Your library", <LibrarySheet onPlay={(t) => { playTrack(t); closeSheet(); }} />)} /></>} />

      <button onClick={() => setCarMode(true)} className="flex items-center gap-3 rounded-3xl p-4 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: FILL }}>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(128,128,128,0.2)" }}><Mic size={18} style={{ color: FILL_TEXT }} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold" style={{ color: FILL_TEXT }}>Open Car Mode</p>
          <p className="text-xs" style={{ color: FILL_TEXT, opacity: 0.7 }}>Big controls and a voice co-pilot for the road</p>
        </div>
      </button>

      <div className="flex items-center gap-2 rounded-full px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        <Search size={15} style={{ color: SUB }} className="shrink-0" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search songs, artists..." aria-label="Search music" className="w-full bg-transparent text-sm focus:outline-none" style={{ color: TEXT }} />
      </div>
      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {MUSIC_GENRES.map((g) => <Pill key={g} active={genre === g && !query} onClick={() => { setGenre(g); setQuery(""); }}>{g}</Pill>)}
      </div>

      {loading ? <Skeleton rows={5} height={60} radius={18} />
        : error ? <div className="rounded-3xl py-14 text-center text-sm" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}`, color: SUB }}>{error}</div>
          : tracks.length === 0 ? <div className="py-14 text-center text-sm" style={{ color: SUB }}>No tracks found.</div>
            : (
              <div className="flex flex-col gap-1">
                {tracks.map((t) => {
                  const fav = isFavorite(t.id);
                  const on = current && current.id === t.id;
                  return (
                    <div key={t.id} className="flex items-center gap-2.5 p-2.5" style={{ borderRadius: 18, backgroundColor: on ? CARD_ALT : "transparent" }}>
                      <button onClick={() => playTrack(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <TrackThumb src={t.image} size={44} />
                        <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" style={{ color: TEXT }}>{t.name}</p><p className="truncate text-xs" style={{ color: SUB }}>{t.artist}</p></div>
                      </button>
                      <button onClick={() => toggleFavorite(t)} aria-label={fav ? "Remove from favourites" : "Add to favourites"} className="shrink-0 p-1"><Heart size={16} style={{ color: fav ? RED : SUB }} fill={fav ? RED : "none"} /></button>
                      <button onClick={() => addToQueue(t)} aria-label="Add to queue" className="shrink-0 p-1"><Plus size={16} style={{ color: SUB }} /></button>
                      <button onClick={() => playTrack(t)} aria-label={on && isPlaying ? "Playing" : `Play ${t.name}`} className="shrink-0">{on && isPlaying ? <Pause size={16} style={{ color: TEXT }} /> : <Play size={16} style={{ color: SUB }} />}</button>
                    </div>
                  );
                })}
              </div>
            )}
    </div>
  );
}

function LibrarySheet({ onPlay }) {
  const { TEXT, SUB, BORDER } = useTheme();
  const { queue, favorites, recentlyPlayed, removeFromQueue, toggleFavorite, isFavorite } = useUI();
  const section = (title, items, empty, trailing) => (
    <div className="mb-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>{title}</p>
      {items.length === 0 ? <p className="py-3 text-sm" style={{ color: SUB }}>{empty}</p> : items.map((t, i) => (
        <div key={t.id} className="flex items-center gap-3 py-2" style={i > 0 ? { borderTop: `1px solid ${BORDER}` } : undefined}>
          <button onClick={() => onPlay(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><TrackThumb src={t.image} size={40} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium" style={{ color: TEXT }}>{t.name}</p><p className="truncate text-xs" style={{ color: SUB }}>{t.artist}</p></div></button>
          {trailing(t)}
        </div>
      ))}
    </div>
  );
  return (
    <div>
      {section("Up next", queue, "Nothing queued — tap + on any track.", (t) => <button onClick={() => removeFromQueue(t.id)} aria-label="Remove from queue" className="p-1"><X size={15} style={{ color: SUB }} /></button>)}
      {section("Favourites", favorites, "No favourites yet — tap the heart on any track.", (t) => <button onClick={() => toggleFavorite(t)} aria-label="Remove from favourites" className="p-1"><Heart size={15} style={{ color: RED }} fill={RED} /></button>)}
      {section("Recently played", recentlyPlayed, "Play something and it'll show up here.", (t) => <button onClick={() => toggleFavorite(t)} aria-label="Favourite" className="p-1"><Heart size={15} style={{ color: isFavorite(t.id) ? RED : SUB }} fill={isFavorite(t.id) ? RED : "none"} /></button>)}
    </div>
  );
}

export function MiniPlayer({ onOpen }) {
  const { current, isPlaying, togglePlay } = useUI();
  const { FILL, FILL_TEXT, BORDER } = useTheme();
  if (!current) return null;
  return (
    <div className="absolute inset-x-5 z-10" style={{ bottom: "calc(96px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="flex w-full items-center gap-3 p-2.5 shadow-2xl" style={{ borderRadius: 20, backgroundColor: FILL, border: `1px solid ${BORDER}` }}>
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Open Car Mode">
          <TrackThumb src={current.image} size={40} dim="rgba(128,128,128,0.2)" />
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold" style={{ color: FILL_TEXT }}>{current.name}</p><p className="truncate text-xs" style={{ color: FILL_TEXT, opacity: 0.7 }}>{current.artist}</p></div>
        </button>
        <button onClick={togglePlay} aria-label={isPlaying ? "Pause" : "Play"} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "rgba(128,128,128,0.2)" }}>
          {isPlaying ? <Pause size={15} style={{ color: FILL_TEXT }} /> : <Play size={15} style={{ color: FILL_TEXT }} />}
        </button>
      </div>
    </div>
  );
}

const QUICK = ["How's my car?", "What's due next?", "Is it safe to keep driving?", "What does this warning light mean?"];

function greeting(me, vehicle) {
  const first = me.name ? me.name.split(" ")[0] : "";
  if (!vehicle) return `Hi${first ? ` ${first}` : ""}. Add your car in the garage, then I can tell you how it's doing.`;
  const h = vehicle.healthInfo;
  const bits = [];
  if (h.scan && (h.scan.codes || []).length) bits.push(`your last scan found ${h.scan.codes.length === 1 ? `one fault code: ${describeCode(h.scan.codes[0].code).toLowerCase()}` : `${h.scan.codes.length} fault codes`}`);
  if (h.overdue.length) bits.push(`${h.overdue[0].title.toLowerCase()} is overdue`);
  else if (h.soon.length) bits.push(`${h.soon[0].title.toLowerCase()} is due soon`);
  return `Hi${first ? ` ${first}` : ""}. ${bits.length ? `Heads up: ${bits.join(", and ")}.` : "Everything looks good."} Tap the mic and ask me anything.`;
}

// Car Mode: the music player and the voice co-pilot on one big, glanceable screen.
export function CarMode() {
  const { me, uid, vehicle, current, isPlaying, togglePlay, playAdjacent, setCarMode, duck, goTo, trip, showToast } = useUI();
  // One tap, eyes on the road: mark a hazard where you are now.
  const reportHazard = async () => {
    try {
      const p = trip && trip.pos ? trip.pos : await currentPosition();
      await reportRoadAlert(uid, { kind: "hazard", lat: p.lat, lon: p.lon, note: "" });
      say("Thanks. Drivers near you will be warned.");
    } catch (e) { showToast(e.message); }
  };
  const { FILL, FILL_TEXT, mode } = useTheme();
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [voiceOn, setVoiceOn] = useState(true);
  const alive = useRef(true);
  const voiceRef = useRef(true);
  voiceRef.current = voiceOn;

  const say = async (text) => {
    if (!voiceRef.current || !canSpeak()) return;
    setState("speaking"); duck(true);
    try { await speak(text); } finally { duck(false); }
  };
  useEffect(() => {
    alive.current = true;
    let lock = null;
    (async () => { try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) {} })();
    const hello = greeting(me, vehicle);
    setAnswer(hello);
    say(hello).then(() => alive.current && setState("idle"));
    return () => { alive.current = false; stopSpeaking(); stopListening(); duck(false); try { lock && lock.release(); } catch (e) {} };
  }, []);

  const ask = async (question) => {
    setHeard(question); setState("thinking"); setAnswer("");
    let reply;
    try { reply = await askMotiq({ message: question, vehicleId: vehicle ? vehicle.id : null, mode: "voice" }); }
    catch (e) { reply = e.message || "I couldn't answer that. Try again."; }
    if (!alive.current) return;
    setAnswer(reply);
    await say(reply);
    if (alive.current) setState("idle");
  };
  const talk = async () => {
    if (state === "listening") { await stopListening(); setState("idle"); return; }
    if (!canListen()) { setAnswer("Voice isn't available here. Use Chrome or the Motiq app, or tap a question below."); return; }
    await stopSpeaking(); duck(false);
    setState("listening"); setHeard("");
    duck(true);
    try {
      const said = await listen();
      duck(false);
      if (!alive.current) return;
      if (!said.trim()) { setState("idle"); return; }
      ask(said);
    } catch (e) { duck(false); setState("idle"); setAnswer(e.message); }
  };

  // Dark whenever the app is dark or it's night (7pm–6am), so it never lights up the car at night.
  const hour = new Date().getHours();
  const night = mode === "dark" || hour >= 19 || hour < 6;
  const bg = night ? "#0A0A0A" : FILL;
  const ink = night ? "#FFFFFF" : FILL_TEXT;
  const dim = night ? "rgba(255,255,255,0.1)" : "rgba(128,128,128,0.2)";
  const micBg = night ? ACCENT : ink, micInk = night ? "#000" : FILL;
  const mic = state === "listening" ? { bg: RED, fg: "#fff", label: "Listening… tap to stop", Icon: Square } : state === "thinking" ? { bg: dim, fg: ink, label: "Thinking…", Icon: Loader2 } : state === "speaking" ? { bg: micBg, fg: micInk, label: "Tap to interrupt and ask", Icon: Mic } : { bg: micBg, fg: micInk, label: "Tap and ask Motiq", Icon: Mic };

  return (
    <div className="absolute inset-0 z-50 flex flex-col px-6" role="dialog" aria-label="Car Mode" style={{ backgroundColor: bg, paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(24px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="flex items-center gap-3">
        <button onClick={() => setCarMode(false)} aria-label="Leave Car Mode" className="rounded-full p-2.5 active:scale-95 transition-transform" style={{ backgroundColor: dim }}><ArrowLeft size={20} style={{ color: ink }} /></button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: ink, opacity: 0.6 }}>Car Mode</p>
          <p className="truncate text-base font-bold" style={{ color: ink }}>{vehicle ? carLabel(vehicle) : "Motiq"}</p>
        </div>
        <button onClick={reportHazard} aria-label="Report a road hazard here" className="rounded-full p-2.5 active:scale-95 transition-transform" style={{ backgroundColor: dim }}><AlertTriangle size={20} style={{ color: "#F5B944" }} /></button>
        <a href={`tel:${emergencyNumber(me.country)}`} aria-label="Call emergency" className="rounded-full px-3 py-2.5 text-xs font-bold" style={{ backgroundColor: "#FF5A5F", color: "#fff" }}>SOS</a>
        <button onClick={() => setVoiceOn((v) => { if (v) stopSpeaking(); return !v; })} aria-label={voiceOn ? "Mute Motiq's voice" : "Turn Motiq's voice on"} className="rounded-full p-2.5 active:scale-95 transition-transform" style={{ backgroundColor: dim }}>
          {voiceOn ? <Volume2 size={20} style={{ color: ink }} /> : <VolumeX size={20} style={{ color: ink }} />}
        </button>
      </div>

      <div className="mt-6 flex items-center gap-4">
        {current ? <TrackThumb src={current.image} size={84} dim={dim} /> : <div className="flex h-[84px] w-[84px] items-center justify-center rounded-xl" style={{ backgroundColor: dim }}><Music2 size={30} style={{ color: ink, opacity: 0.5 }} /></div>}
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold" style={{ color: ink }}>{current ? current.name : "No music playing"}</p>
          <p className="truncate text-sm" style={{ color: ink, opacity: 0.65 }}>{current ? current.artist : "Pick something in Car Mode Radio"}</p>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-center gap-10">
        <button onClick={() => playAdjacent(-1)} disabled={!current} aria-label="Previous track" className="p-2 disabled:opacity-30"><SkipBack size={28} style={{ color: ink }} /></button>
        <button onClick={current ? togglePlay : () => { setCarMode(false); goTo("music"); }} aria-label={current ? (isPlaying ? "Pause" : "Play") : "Choose music"} className="flex items-center justify-center rounded-full active:scale-95 transition-transform" style={{ width: 68, height: 68, backgroundColor: dim }}>
          {current && isPlaying ? <Pause size={28} style={{ color: ink }} /> : <Play size={28} style={{ color: ink }} />}
        </button>
        <button onClick={() => playAdjacent(1)} disabled={!current} aria-label="Next track" className="p-2 disabled:opacity-30"><SkipForward size={28} style={{ color: ink }} /></button>
      </div>

      <div className="mt-6 flex min-h-0 flex-1 flex-col justify-end gap-4">
        <div className="no-scrollbar max-h-[30vh] overflow-y-auto rounded-3xl p-4" style={{ backgroundColor: dim }} aria-live="polite">
          {heard && <p className="mb-1.5 text-sm" style={{ color: ink, opacity: 0.6 }}>"{heard}"</p>}
          {state === "thinking" ? <p className="text-lg font-semibold" style={{ color: ink }}>Thinking…</p> : <p className="text-lg font-semibold leading-snug" style={{ color: ink }}>{answer}</p>}
        </div>
        <div className="no-scrollbar -mx-6 flex gap-2 overflow-x-auto px-6">
          {QUICK.map((q) => <button key={q} onClick={() => ask(q)} disabled={state === "thinking"} className="shrink-0 whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium disabled:opacity-50" style={{ backgroundColor: dim, color: ink }}>{q}</button>)}
        </div>
        <button onClick={talk} disabled={state === "thinking"} aria-label={mic.label} className="flex w-full items-center justify-center gap-3 rounded-full py-6 text-lg font-bold active:scale-[0.98] transition-transform disabled:opacity-80" style={{ backgroundColor: mic.bg, color: mic.fg, boxShadow: mic.bg === ACCENT ? "0 0 32px rgba(239,255,0,0.35)" : "none" }}>
          <mic.Icon size={24} className={state === "thinking" ? "animate-spin" : ""} /> {mic.label}
        </button>
      </div>
    </div>
  );
}
