// AI Diagnostics: describe a symptom (type, speak or send a photo) and get a clear
// "safe / caution / stop" verdict first, then the reasoning — from Motiq's AI mechanic, which knows
// this car's details, service history and last scan.
import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, ScanLine, Gauge, ShieldAlert, Timer, Droplets, Sparkles, Camera, Plus, Send, Mic, Loader2, Clock, Wrench, AudioLines, Bot, Trash2, ImagePlus } from "lucide-react";
import { t } from "../lib/i18n.js";
import { useTheme, useUI, RED, VERDICT_STYLE, VerdictBadge, parseVerdict, ScreenHeader, RoundButton, carLabel, timeAgo, SecondaryButton, Skeleton } from "../design.jsx";
import { askMotiq, loadAiHistory, clearAiHistory, uploadPhoto } from "../lib/data.js";
import { canListen, listen, stopListening } from "../lib/voice.js";
import { describeCode } from "../lib/dtc.js";
import Markdown from "./Markdown.jsx";

// Scans sent for an explanation are stored with all their readings; show them as one short line.
function questionText(content) {
  if (!/^(Explain my scan|Check engine light:)/.test(content || "")) return content;
  const codes = (content.match(/\b[PCBU][0-9A-F]{4}\b/g) || []).filter((c, i, a) => a.indexOf(c) === i);
  return `Explain my scan${codes.length ? ` (${codes.join(", ")})` : " (no fault codes)"}`;
}

const SYMPTOMS = [
  { label: "Warning light on", icon: AlertTriangle },
  { label: "Strange noise", icon: ScanLine },
  { label: "Won't start", icon: Gauge },
  { label: "Brake issue", icon: ShieldAlert },
  { label: "Overheating", icon: Timer },
  { label: "Fluid leak", icon: Droplets },
];

export default function AIScreen() {
  const { uid, me, vehicles, vehicle, setCarId, goTo, openSheet, closeSheet, confirm, showToast, aiPrompt, clearAiPrompt } = useUI();
  const { BG, CARD, CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const fileRef = useRef(null);
  const endRef = useRef(null);
  const firstName = (me.name || "").trim().split(/\s+/)[0];

  useEffect(() => {
    let off = false;
    setLoaded(false);
    loadAiHistory(uid, vehicle ? vehicle.id : null).then((rows) => { if (!off) { setMessages(rows.map((m) => ({ ...m, ...(m.role === "assistant" ? parseVerdict(m.content) : { clean: questionText(m.content) }) }))); setLoaded(true); } }).catch(() => setLoaded(true));
    return () => { off = true; };
  }, [uid, vehicle && vehicle.id]);
  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ block: "end" }); }, [messages.length, loading]);
  useEffect(() => {
    if (!aiPrompt) return;
    if (aiPrompt === "__photo__") openAttach(); else send(aiPrompt);
    clearAiPrompt();
  }, [aiPrompt]);

  async function send(text, imagePath = null, previewUrl = null) {
    const msg = (text || "").trim();
    if ((!msg && !imagePath) || loading) return;
    const question = msg || "Here's a photo of my car — a warning light, damage or something I'm worried about. What do you see, and what should I do?";
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: "user", content: question, clean: question, preview: previewUrl, image_path: imagePath }]);
    setInput("");
    setLoading(true);
    try {
      const reply = await askMotiq({ message: question, vehicleId: vehicle ? vehicle.id : null, mode: "chat", imagePath });
      setMessages((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: reply, ...parseVerdict(reply), created_at: new Date().toISOString() }]);
    } catch (e) {
      setMessages((m) => [...m, { id: `e${Date.now()}`, role: "assistant", error: true, clean: e.message || "Couldn't reach the AI mechanic. Check your connection and try again." }]);
    }
    setLoading(false);
  }
  async function sendPhoto(file) {
    if (!file) return;
    setLoading(true);
    let path = null;
    try { path = await uploadPhoto("ai-photos", uid, file); } catch (e) { setLoading(false); showToast(e.message || "Couldn't upload the photo"); return; }
    setLoading(false);
    send(input, path, URL.createObjectURL(file));
  }
  function openAttach() {
    openSheet("Add a photo", (
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => { closeSheet(); fileRef.current && fileRef.current.click(); }} className="flex items-center gap-3 rounded-2xl p-3.5 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <Camera size={17} style={{ color: TEXT }} />
          <div><p className="text-sm font-medium" style={{ color: TEXT }}>Take or choose a photo</p><p className="text-xs" style={{ color: SUB }}>A warning light, damage, a leak — anything you're unsure about</p></div>
        </button>
      </div>
    ));
  }
  async function dictate() {
    if (!canListen()) { showToast("Voice isn't available here. Type instead, or use Chrome or the Motiq app."); return; }
    setListening(true);
    try { const heard = await listen(); setListening(false); if (heard) send(heard); else showToast("Didn't catch that. Try again."); }
    catch (e) { setListening(false); showToast(e.message); }
  }
  const verdictHistory = messages.filter((m) => m.role === "assistant" && m.verdict).map((m) => {
    const i = messages.indexOf(m);
    const q = messages.slice(0, i).reverse().find((x) => x.role === "user");
    return { ...m, question: q ? q.clean : "", photo: !!(q && q.image_path) };
  }).reverse();

  const codes = vehicle && vehicle.healthInfo.scan ? vehicle.healthInfo.scan.codes || [] : [];
  const flag = vehicle && (codes.length ? { text: `${codes.length} fault code${codes.length === 1 ? "" : "s"} from your last scan (${codes.map((c) => c.code).join(", ")}). Tap to ask what to do.`, ask: `My last scan found ${codes.map((c) => `${c.code} (${describeCode(c.code)})`).join(", ")}. Is it safe to drive, and what should I do first?` }
    : vehicle.healthInfo.overdue.length ? { text: `${vehicle.healthInfo.overdue.map((r) => r.title).join(", ")} ${vehicle.healthInfo.overdue.length === 1 ? "is" : "are"} overdue. Tap to ask how urgent it is.`, ask: `${vehicle.healthInfo.overdue.map((r) => r.title).join(", ")} ${vehicle.healthInfo.overdue.length === 1 ? "is" : "are"} overdue on my car. How urgent is it and what happens if I wait?` } : null);

  return (
    <div className="relative flex min-h-full flex-col px-5 pt-2" style={{ paddingBottom: 176 }}>
      <ScreenHeader title={t("AI Diagnostics")} sub="Describe what's happening — get a real triage answer." note="AI-generated guidance, not a certified inspection."
        right={<RoundButton icon={Clock} label="Diagnosis history" onClick={() => openSheet("Diagnosis history", <History items={verdictHistory} onClear={() => confirm("Clear AI history?", "Deletes all your conversations with the AI mechanic, for every car.", "Clear", async () => { await clearAiHistory(uid); setMessages([]); showToast("AI history cleared"); })} />)} />} />

      {vehicles.length > 1 && (
        <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
          {vehicles.map((v) => <button key={v.id} onClick={() => setCarId(v.id)} aria-pressed={v.id === vehicle.id} className="shrink-0 whitespace-nowrap rounded-full px-3.5 py-2 text-xs font-medium active:scale-95 transition-transform" style={v.id === vehicle.id ? { backgroundColor: FILL, color: FILL_TEXT } : { backgroundColor: CARD_ALT, color: SUB, border: `1px solid ${BORDER}` }}>{carLabel(v)}</button>)}
        </div>
      )}

      {loaded && messages.length === 0 && flag && (
        <button onClick={() => send(flag.ask)} className="mt-4 flex items-start gap-3 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform" style={{ backgroundColor: "rgba(244,85,61,0.08)", border: "1px solid rgba(244,85,61,0.3)" }}>
          <ShieldAlert size={16} style={{ color: RED }} className="mt-0.5 shrink-0" />
          <div className="min-w-0"><p className="text-xs font-semibold" style={{ color: RED }}>Heads up</p><p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{carLabel(vehicle)} — {flag.text}</p></div>
        </button>
      )}

      {loaded && messages.length === 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {SYMPTOMS.map((p) => (
            <button key={p.label} onClick={() => send(p.label)} className="flex items-center gap-2 rounded-2xl px-3.5 py-3 text-left active:scale-95 transition-transform" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <p.icon size={15} style={{ color: TEXT }} className="shrink-0" /><span className="text-xs font-medium" style={{ color: TEXT }}>{p.label}</span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex-1">
        {!loaded ? (
          <Skeleton rows={3} height={64} radius={18} />
        ) : messages.length === 0 ? (
          <div className="mt-8 flex flex-col items-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: CARD }}><Sparkles size={20} style={{ color: TEXT }} /></div>
            <p className="text-xs leading-relaxed" style={{ color: SUB, maxWidth: 260 }}>Pick a symptom above, or say exactly what you're noticing — a sound, a light, a smell. You'll get a clear safe / caution / stop verdict first, then the reasoning.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                {m.role === "user" ? (
                  <div className="overflow-hidden rounded-2xl" style={{ backgroundColor: FILL, maxWidth: "85%" }}>
                    {m.preview && <img src={m.preview} alt="Photo sent to the AI mechanic" className="block w-full" style={{ maxHeight: 220, objectFit: "cover" }} />}
                    {!m.preview && m.image_path && <p className="flex items-center gap-1.5 px-4 pt-2.5 text-xs" style={{ color: FILL_TEXT, opacity: 0.7 }}><ImagePlus size={12} /> Photo</p>}
                    <p className="px-4 py-2.5 text-sm" style={{ color: FILL_TEXT }}>{m.clean}</p>
                  </div>
                ) : (
                  <div className="rounded-2xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${m.error ? "rgba(244,85,61,0.4)" : BORDER}`, maxWidth: "92%" }}>
                    {m.verdict && <div className="mb-2.5"><VerdictBadge verdict={m.verdict} /></div>}
                    {m.error ? <p className="text-sm" style={{ color: RED }}>{m.clean}</p> : <Markdown text={m.clean} />}
                    {m.verdict === "stop" && (
                      <button onClick={() => goTo("market", { filter: "Mechanics" })} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold active:scale-95 transition-transform" style={{ backgroundColor: RED, color: "#fff" }}><Wrench size={13} /> Find help nearby</button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-2xl px-4 py-3 text-sm" style={{ backgroundColor: CARD, color: SUB }}><Loader2 size={14} className="animate-spin" /> Diagnosing</div></div>}
            <div ref={endRef} style={{ scrollMarginBottom: 190 }} />
          </div>
        )}
      </div>

      {listening && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-between px-8" style={{ background: "linear-gradient(165deg, #0B1220 0%, #1E293B 45%, #64748B 100%)", paddingTop: 64, paddingBottom: 64 }}>
          <div className="flex items-center gap-2"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" /><span className="font-medium uppercase" style={{ fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.7)" }}>Listening</span></div>
          <p className="text-center leading-relaxed text-white" style={{ fontSize: 19 }}>{firstName ? `Hey ${firstName},` : "Hey,"}<br />tell me what's happening —<br />the sound, the light, the smell.</p>
          <button type="button" onClick={() => { stopListening(); setListening(false); }} aria-label="Stop listening" className="flex items-center justify-center rounded-full bg-white active:scale-95 transition-transform" style={{ width: 64, height: 64 }}><AudioLines size={22} style={{ color: "#111" }} /></button>
        </div>
      )}

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="fixed inset-x-0 z-10 mx-auto flex max-w-[480px] items-center gap-2 px-5" style={{ bottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <input ref={fileRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files && e.target.files[0]; e.target.value = ""; sendPhoto(f); }} className="hidden" aria-hidden="true" tabIndex={-1} />
        <button type="button" onClick={openAttach} disabled={loading} aria-label="Add a photo" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 active:scale-95 transition-transform" style={{ backgroundColor: CARD_ALT, border: `1px solid ${BORDER}`, backdropFilter: "blur(12px)" }}><Plus size={18} style={{ color: TEXT }} /></button>
        <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Describe the symptom" placeholder="Describe the symptom..." className="h-11 min-w-0 flex-1 rounded-full px-4 text-sm focus:outline-none" style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: TEXT }} />
        {input.trim() ? (
          <button type="submit" disabled={loading} aria-label="Send" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 active:scale-95 transition-transform" style={{ backgroundColor: FILL }}><Send size={16} style={{ color: FILL_TEXT }} /></button>
        ) : (
          <button type="button" onClick={dictate} disabled={loading} aria-label="Speak your question" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full disabled:opacity-40 active:scale-95 transition-transform" style={{ backgroundColor: FILL }}><Mic size={16} style={{ color: FILL_TEXT }} /></button>
        )}
      </form>
    </div>
  );
}

function History({ items, onClear }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Bot size={18} style={{ color: SUB }} />
        <p className="text-sm font-medium" style={{ color: TEXT }}>No diagnoses yet</p>
        <p className="max-w-[240px] text-xs leading-relaxed" style={{ color: SUB }}>Symptoms you describe and photos you send for this car will show up here with their verdict.</p>
        <SecondaryButton onClick={onClear} color={RED} className="mt-3 px-4"><Trash2 size={13} /> Clear all AI history</SecondaryButton>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <button onClick={onClear} className="self-end text-xs font-medium" style={{ color: RED }}>Clear history</button>
      {items.map((d) => {
        const v = VERDICT_STYLE[d.verdict];
        return (
          <div key={d.id} className="flex flex-col gap-2 rounded-2xl p-3.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-medium" style={{ color: TEXT }}>{d.question || "Question"}</p>
              {v && <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold" style={{ backgroundColor: `${v.color}1F`, color: v.color }}><v.icon size={10} />{v.label}</span>}
            </div>
            <p className="line-clamp-3 text-xs leading-relaxed" style={{ color: SUB }}>{d.clean.replace(/[#*`]/g, "").slice(0, 240)}</p>
            <div className="flex items-center gap-3 text-[10px]" style={{ color: SUB }}>
              <span>{d.created_at ? timeAgo(d.created_at) : "Just now"}</span>
              <span className="rounded-full px-1.5 py-0.5" style={{ backgroundColor: CARD_ALT }}>{d.photo ? "Photo" : "Text"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
