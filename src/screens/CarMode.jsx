import React, { useEffect, useRef, useState } from "react";
import { Mic, Square, X, Volume2, VolumeX } from "lucide-react";
import { C, FONT } from "../ui.jsx";
import { askMotiq, healthOf } from "../lib/data.js";
import { listen, stopListening, speak, stopSpeaking, canListen, canSpeak } from "../lib/voice.js";
import { describeCode } from "../lib/dtc.js";
import { carName } from "./Garage.jsx";

// Car Mode: a big, simple screen for the road. Tap the button (or keep the conversation going),
// ask out loud, and Motiq answers out loud in a sentence or two.
const QUICK = ["How's my car?", "What's due next?", "Is it safe to keep driving?", "What does this warning light mean?"];

export default function CarMode({ me, garage, carId, onExit }) {
  const car = garage.cars.find((c) => c.id === carId) || garage.cars[0] || null;
  const [state, setState] = useState("idle"); // idle | listening | thinking | speaking
  const [heard, setHeard] = useState("");
  const [answer, setAnswer] = useState("");
  const [conversation, setConversation] = useState(false);
  const [voiceOn, setVoiceOn] = useState(true);
  const alive = useRef(true);
  const convRef = useRef(false);
  convRef.current = conversation;

  // Keep the screen on, and greet with the car's status.
  useEffect(() => {
    alive.current = true;
    let lock = null;
    (async () => { try { if (navigator.wakeLock) lock = await navigator.wakeLock.request("screen"); } catch (e) {} })();
    const hello = greeting(car, garage, me);
    setAnswer(hello);
    if (voiceOn && canSpeak()) { setState("speaking"); speak(hello).then(() => alive.current && setState("idle")); }
    return () => { alive.current = false; stopSpeaking(); stopListening(); try { lock && lock.release(); } catch (e) {} };
  }, []);

  const ask = async (question) => {
    setHeard(question); setState("thinking"); setAnswer("");
    try {
      const reply = await askMotiq({ message: question, vehicleId: car && car.id, mode: "voice" });
      if (!alive.current) return;
      setAnswer(reply);
      if (voiceOn) { setState("speaking"); await speak(reply); }
    } catch (e) {
      if (!alive.current) return;
      setAnswer(e.message);
      if (voiceOn) { setState("speaking"); await speak(e.message); }
    }
    if (!alive.current) return;
    setState("idle");
    if (convRef.current) talk();
  };
  const talk = async () => {
    if (state === "listening") { await stopListening(); setState("idle"); return; }
    await stopSpeaking();
    setState("listening"); setHeard("");
    try {
      const said = await listen();
      if (!alive.current) return;
      if (!said.trim()) { setState("idle"); if (convRef.current) setConversation(false); return; }
      ask(said);
    } catch (e) { setState("idle"); setAnswer(e.message); }
  };

  const big = state === "listening" ? { bg: C.bad, label: "Listening… tap to stop", Icon: Square }
    : state === "thinking" ? { bg: C.blue, label: "Thinking…", Icon: Mic }
    : state === "speaking" ? { bg: C.accent, label: "Tap to interrupt and talk", Icon: Mic }
    : { bg: C.accent, label: "Tap and ask", Icon: Mic };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 40, background: "#05070A", color: C.text, fontFamily: FONT, display: "flex", flexDirection: "column", padding: "calc(env(safe-area-inset-top, 0px) + 14px) 18px calc(env(safe-area-inset-bottom, 0px) + 18px)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, color: C.sub, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase" }}>Car Mode</p>
          <p style={{ margin: "2px 0 0", fontSize: 18, fontWeight: 800 }}>{car ? carName(car) : "Motiq"}</p>
        </div>
        <button onClick={() => setVoiceOn((v) => { if (v) stopSpeaking(); return !v; })} aria-label={voiceOn ? "Mute Motiq's voice" : "Turn Motiq's voice on"} style={pill}>{voiceOn ? <Volume2 size={22} /> : <VolumeX size={22} />}</button>
        <button onClick={onExit} aria-label="Leave Car Mode" style={pill}><X size={24} /></button>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", gap: 18, minHeight: 0, overflowY: "auto", padding: "16px 0" }}>
        {heard && <p style={{ margin: 0, color: C.sub, fontSize: 18 }}>“{heard}”</p>}
        <p aria-live="polite" style={{ margin: 0, fontSize: 26, lineHeight: 1.35, fontWeight: 700 }}>{state === "thinking" ? "…" : answer}</p>
      </div>

      {!canListen() && <p style={{ margin: "0 0 10px", color: C.warn, fontSize: 14 }}>Voice input isn't available here. Use the Motiq app, or Chrome.</p>}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", marginBottom: 14, scrollbarWidth: "none" }}>
        {QUICK.map((q) => <button key={q} onClick={() => ask(q)} disabled={state === "thinking"} style={{ ...pill, width: "auto", padding: "0 16px", whiteSpace: "nowrap", fontSize: 15, fontWeight: 700 }}>{q}</button>)}
      </div>
      <button onClick={talk} disabled={state === "thinking" || !canListen()} aria-label={big.label} style={{ width: "100%", height: 132, borderRadius: 32, border: "none", background: big.bg, color: "#04140E", fontFamily: FONT, fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, cursor: "pointer", opacity: state === "thinking" ? 0.7 : 1, boxShadow: state === "listening" ? `0 0 0 8px ${C.badSoft}` : "none" }}>
        <big.Icon size={40} /> {big.label}
      </button>
      <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 14, color: C.sub, fontSize: 15 }}>
        <input type="checkbox" checked={conversation} onChange={(e) => setConversation(e.target.checked)} style={{ width: 20, height: 20 }} /> Keep listening after each answer
      </label>
      <p style={{ margin: "10px 0 0", textAlign: "center", color: C.faint, fontSize: 12.5 }}>Keep your eyes on the road. Pull over to read long answers.</p>
    </div>
  );
}

const pill = { width: 52, height: 52, borderRadius: 18, border: `1px solid ${C.line}`, background: C.surface, color: C.text, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: FONT };

// Said out loud when Car Mode opens: short, and only what matters.
function greeting(car, garage, me) {
  const first = me.name ? me.name.split(" ")[0] : "";
  if (!car) return `Hi${first ? ` ${first}` : ""}. Add your car in the garage, then I can tell you how it's doing.`;
  const h = healthOf(car, garage);
  const bits = [];
  if (h.scan && (h.scan.codes || []).length) bits.push(`your last scan found ${h.scan.codes.length === 1 ? `one fault code: ${describeCode(h.scan.codes[0].code).toLowerCase()}` : `${h.scan.codes.length} fault codes`}`);
  if (h.overdue.length) bits.push(`${h.overdue[0].title.toLowerCase()} is overdue`);
  else if (h.soon.length) bits.push(`${h.soon[0].title.toLowerCase()} is due soon`);
  const status = bits.length ? `Heads up: ${bits.join(", and ")}.` : "Everything looks good.";
  return `Hi${first ? ` ${first}` : ""}. ${status} Tap the button and ask me anything about your car.`;
}
