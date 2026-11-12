// Hands-free voice for Car Mode: listen to one question, and read answers aloud.
// Android app: the phone's own speech recognition and text-to-speech (Capacitor plugins).
// Website: the browser's (Chrome and Edge listen; most browsers can speak).
import { SpeechRecognition } from "@capacitor-community/speech-recognition";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

const native = () => typeof window !== "undefined" && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const WebRecognition = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
const lang = () => (typeof navigator !== "undefined" && navigator.language) || "en-US";

export function canListen() { return native() || !!WebRecognition; }
export function canSpeak() { return native() || (typeof window !== "undefined" && "speechSynthesis" in window); }

let webRec = null;
// Resolves with what was said ("" if nothing was heard).
export async function listen() {
  if (native()) {
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== "granted") throw new Error("Allow the microphone so Motiq can hear you.");
    const { matches } = await SpeechRecognition.start({ language: lang(), maxResults: 1, popup: false, partialResults: false });
    return (matches && matches[0]) || "";
  }
  if (!WebRecognition) throw new Error("Voice isn't available in this browser. Try Chrome, or the Motiq app.");
  return new Promise((resolve, reject) => {
    const rec = new WebRecognition();
    webRec = rec;
    rec.lang = lang(); rec.interimResults = false; rec.maxAlternatives = 1;
    let heard = "";
    rec.onresult = (e) => { heard = e.results[0][0].transcript || ""; };
    rec.onerror = (e) => { webRec = null; if (e.error === "no-speech" || e.error === "aborted") resolve(""); else reject(new Error(e.error === "not-allowed" ? "Allow the microphone so Motiq can hear you." : "Motiq couldn't hear you. Try again.")); };
    rec.onend = () => { webRec = null; resolve(heard); };
    rec.start();
  });
}
export async function stopListening() {
  try { if (native()) await SpeechRecognition.stop(); else if (webRec) webRec.stop(); } catch (e) {}
}

// Reads text aloud; resolves when it's finished (or straight away if speech isn't available).
export async function speak(text) {
  const clean = String(text || "").replace(/[*_#`>]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (native()) { try { await TextToSpeech.speak({ text: clean, lang: lang(), rate: 1.0, pitch: 1.0, volume: 1.0 }); } catch (e) {} return; }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang(); u.rate = 1.0;
    // Some browsers never say they've finished: don't wait longer than the words could take.
    const t = setTimeout(resolve, 1500 + clean.split(" ").length * 450);
    const done = () => { clearTimeout(t); resolve(); };
    u.onend = done; u.onerror = done;
    window.speechSynthesis.speak(u);
  });
}
export async function stopSpeaking() {
  try { if (native()) await TextToSpeech.stop(); else if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch (e) {}
}
