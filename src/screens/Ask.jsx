import React, { useEffect, useRef, useState } from "react";
import { Send, Camera, X, Sparkles, Trash2 } from "lucide-react";
import { C, Screen, Chip, toast, iconBtn, input } from "../ui.jsx";
import { askMotiq, loadAiHistory, uploadPhoto, clearAiHistory } from "../lib/data.js";
import { carName } from "./Garage.jsx";
import Markdown from "./Markdown.jsx";

const STARTERS = [
  "A warning light came on. What does it mean?",
  "My car makes a squealing noise when I brake",
  "What service is my car due for?",
  "Is it safe to drive with the check engine light on?",
  "How can I use less fuel?",
  "What should I check before a long trip?",
];

export default function Ask({ me, garage, carId }) {
  const car = garage.cars.find((c) => c.id === carId) || garage.cars[0] || null;
  const [msgs, setMsgs] = useState(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState(null); // {file, url}
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => { let on = true; loadAiHistory(me.id, car && car.id).then((m) => on && setMsgs(m)).catch(() => on && setMsgs([])); return () => { on = false; }; }, [me.id, car && car.id]);
  useEffect(() => { end.current && end.current.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  const send = async (q = text) => {
    const message = q.trim();
    if ((!message && !photo) || busy) return;
    setText("");
    const shown = { id: `tmp-${Date.now()}`, role: "user", content: message || "What can you see in this photo?", photoUrl: photo && photo.url };
    setMsgs((m) => [...(m || []), shown]);
    setBusy(true);
    try {
      const imagePath = photo ? await uploadPhoto("ai-photos", me.id, photo.file) : null;
      setPhoto(null);
      const reply = await askMotiq({ message: shown.content, vehicleId: car && car.id, imagePath });
      setMsgs((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { id: `e-${Date.now()}`, role: "assistant", content: e.message, error: true }]);
    }
    setBusy(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100dvh" }}>
      <Screen title="Ask Motiq" subtitle={car ? `About your ${carName(car)}` : "Your AI mechanic"} right={msgs && msgs.length > 0 ? <button style={iconBtn} aria-label="Clear chat" onClick={async () => { if (!window.confirm("Clear your chat with Motiq?")) return; await clearAiHistory(me.id); setMsgs([]); }}><Trash2 size={18} /></button> : null}>
        <div style={{ paddingBottom: 140 }}>
          {msgs && msgs.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 4px" }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, margin: "0 auto", background: C.accentSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Sparkles color={C.accent} /></div>
              <p style={{ margin: "12px 0 4px", fontWeight: 800, fontSize: 17 }}>Ask anything about your car</p>
              <p style={{ margin: "0 0 16px", color: C.sub, fontSize: 14, lineHeight: 1.5 }}>Warning lights, noises, costs, maintenance. Add a photo of a dashboard light, a leak or a tyre.</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>{STARTERS.map((s) => <Chip key={s} onClick={() => send(s)}>{s}</Chip>)}</div>
            </div>
          )}
          {(msgs || []).map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "86%", padding: "11px 14px", borderRadius: 18, background: m.role === "user" ? C.accent : m.error ? C.badSoft : C.surface, color: m.role === "user" ? C.accentInk : C.text, border: m.role === "user" ? "none" : `1px solid ${m.error ? C.bad : C.line}`, borderBottomRightRadius: m.role === "user" ? 6 : 18, borderBottomLeftRadius: m.role === "user" ? 18 : 6 }}>
                {m.photoUrl && <img src={m.photoUrl} alt="Your photo" style={{ display: "block", maxWidth: "100%", borderRadius: 12, marginBottom: 6 }} />}
                {m.role === "user" ? <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, whiteSpace: "pre-wrap", fontWeight: 600 }}>{m.content.replace(/^Explain my scan:\n/, "Explain my scan")}</p> : <Markdown text={m.content} />}
              </div>
            </div>
          ))}
          {busy && <p role="status" style={{ color: C.sub, fontSize: 14 }}>Motiq is thinking…</p>}
          <div ref={end} />
        </div>
      </Screen>
      <div style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)", padding: "8px 12px", background: `linear-gradient(transparent, ${C.bg} 30%)` }}>
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          {photo && (
            <div style={{ position: "relative", display: "inline-block", marginBottom: 6 }}>
              <img src={photo.url} alt="Photo to send" style={{ height: 64, borderRadius: 10, display: "block" }} />
              <button aria-label="Remove photo" onClick={() => setPhoto(null)} style={{ position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, border: "none", background: C.raised, color: C.text, cursor: "pointer" }}><X size={14} /></button>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) setPhoto({ file: f, url: URL.createObjectURL(f) }); e.target.value = ""; }} />
            <button type="button" aria-label="Add a photo" onClick={() => fileRef.current.click()} style={{ ...iconBtn, width: 48, height: 48, borderRadius: 16 }}><Camera size={20} /></button>
            <textarea aria-label="Your question" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={1} placeholder="Describe the problem…" style={{ ...input, flex: 1, resize: "none", minHeight: 48, maxHeight: 120, borderRadius: 16 }} />
            <button type="submit" aria-label="Send" disabled={busy || (!text.trim() && !photo)} style={{ width: 48, height: 48, borderRadius: 16, border: "none", background: C.accent, color: C.accentInk, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: busy || (!text.trim() && !photo) ? 0.5 : 1 }}><Send size={20} /></button>
          </form>
        </div>
      </div>
    </div>
  );
}
