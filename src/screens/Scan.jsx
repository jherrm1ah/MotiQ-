// Scan: read the car's fault codes and live readings through the OBD-II adapter (or try a demo),
// see what each code means and how urgent it is, and have the AI mechanic explain it.
import React, { useState } from "react";
import { Bluetooth, ScanLine, AlertTriangle, CheckCircle2, Sparkles, Trash2, PlayCircle, Car, Loader2, Bot } from "lucide-react";
import { useTheme, useUI, RED, AMBER, GREEN, BLUE, ScreenHeader, PrimaryButton, SecondaryButton, Pill, Empty, VerdictBadge, parseVerdict, carLabel, timeAgo, fmtTemp, fmtSpeed } from "../design.jsx";
import { bluetoothAvailable, runScan, clearCodes, demoScan, READING_LABELS, readingTone } from "../lib/obd.js";
import { describeCode, severityOf } from "../lib/dtc.js";
import { saveScan, setScanSummary, askMotiq } from "../lib/data.js";
import { dateLabel } from "../lib/units.js";
import Markdown from "./Markdown.jsx";

const SEV = { safety: [RED, "Get it checked now"], soon: [AMBER, "Fix soon"], watch: [BLUE, "Keep an eye on it"] };

export function scanText(scan) {
  const codes = (scan.codes || []).map((c) => `${c.code} (${c.kind}) - ${describeCode(c.code)}`).join("\n") || "No fault codes.";
  const readings = Object.entries(scan.readings || {}).map(([k, v]) => `${(READING_LABELS[k] || [k])[0]}: ${v} ${(READING_LABELS[k] || ["", ""])[1]}`).join("\n");
  return `Check engine light: ${scan.check_engine ? "ON" : "off"}${scan.source === "demo" ? " (demo data)" : ""}\nCodes:\n${codes}\nLive readings:\n${readings || "none"}`;
}

export default function ScanScreen({ onBack }) {
  const { uid, unit, vehicles, vehicle, setCarId, garage, reload, obd, connectOBD, getLink, goTo, confirm, showToast } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState(null);
  const [explaining, setExplaining] = useState(false);

  if (!vehicle) return <div className="px-5 pt-2"><ScreenHeader title="Scan" onBack={onBack} /><div className="mt-5"><Empty icon={Car} title="Add a car first" text="Add your car in the Garage, then scan it here." action="Go to Garage" onAction={() => goTo("garage")} /></div></div>;
  const past = garage.scans.filter((s) => s.vehicle_id === vehicle.id);
  const shown = past.find((s) => s.id === currentId) || past[0] || null;
  const connected = obd.status === "connected";

  const finish = async (scan) => { const row = await saveScan(uid, vehicle.id, scan); setCurrentId(row.id); await reload(); return row; };
  const scanCar = async () => {
    setBusy(true);
    try {
      let link = getLink();
      if (!link) { setStep("Choose your adapter…"); link = await connectOBD(vehicle.id); }
      if (link) {
        const scan = await runScan(link, setStep);
        await finish(scan);
        showToast(scan.codes.length ? `${scan.codes.length} code${scan.codes.length === 1 ? "" : "s"} found` : "No fault codes");
      }
    } catch (e) { showToast(e.message || "Couldn't scan. Try again."); }
    setStep(""); setBusy(false);
  };
  const tryDemo = async (kind) => { setBusy(true); try { await finish(demoScan(kind)); showToast("Demo scan saved"); } catch (e) { showToast(e.message); } setBusy(false); };
  const explain = async (scan) => {
    setExplaining(true);
    try { const reply = await askMotiq({ message: scanText(scan), vehicleId: vehicle.id, mode: "scan" }); await setScanSummary(scan.id, reply); await reload(); }
    catch (e) { showToast(e.message); }
    setExplaining(false);
  };

  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <ScreenHeader title="Scan" sub={carLabel(vehicle)} onBack={onBack} />
      {vehicles.length > 1 && <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">{vehicles.map((v) => <Pill key={v.id} small active={v.id === vehicle.id} onClick={() => { setCarId(v.id); setCurrentId(null); }}>{carLabel(v)}</Pill>)}</div>}

      <div className="flex flex-col gap-3 rounded-3xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: connected ? "rgba(61,220,132,0.14)" : CARD_ALT }}><Bluetooth size={18} style={{ color: connected ? GREEN : TEXT }} /></div>
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: TEXT }}>{connected ? `Connected: ${obd.deviceName}` : "Scan with an OBD-II adapter"}</p>
            <p className="mt-0.5 text-xs leading-relaxed" style={{ color: SUB }}>{connected ? "Ignition on or engine running." : "Plug a Bluetooth (BLE) adapter into the port under the dashboard and turn the ignition on."}</p>
          </div>
        </div>
        {step && <p role="status" className="text-sm font-semibold" style={{ color: TEXT }}>{step}</p>}
        {bluetoothAvailable()
          ? <PrimaryButton onClick={scanCar} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <ScanLine size={15} />}{busy ? "Scanning…" : connected ? "Scan again" : "Connect and scan"}</PrimaryButton>
          : <p className="text-xs" style={{ color: SUB }}>Bluetooth scanning works in the Motiq Android app, and in Chrome on Android or a computer.</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: SUB }}>No adapter? Try a demo:</span>
          <Pill small onClick={() => tryDemo("issues")}><span className="flex items-center gap-1"><PlayCircle size={12} /> Car with problems</span></Pill>
          <Pill small onClick={() => tryDemo("healthy")}>Healthy car</Pill>
        </div>
      </div>

      {shown ? <ScanResult scan={shown} unit={unit} explaining={explaining} onExplain={() => explain(shown)} onAsk={() => goTo("ai")}
        onClear={connected && (shown.codes || []).length && shown.source === "obd" ? () => confirm("Clear the codes?", "This turns off the check engine light. Only do it after the problem is fixed — the codes help your mechanic.", "Clear codes", async () => { try { await clearCodes(getLink()); showToast("Codes cleared"); await scanCar(); } catch (e) { showToast(e.message); } }) : null} />
        : <Empty icon={ScanLine} title="No scans yet" text="Scan your car to see fault codes and live readings, or try a demo." />}

      {past.length > 1 && (
        <div className="flex flex-col gap-2">
          <p className="px-1 text-sm font-semibold" style={{ color: TEXT }}>Past scans</p>
          {past.slice(0, 20).map((s) => (
            <button key={s.id} onClick={() => setCurrentId(s.id)} className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left" style={{ backgroundColor: CARD, border: `1px solid ${shown && shown.id === s.id ? TEXT : BORDER}` }}>
              {(s.codes || []).length ? <AlertTriangle size={15} style={{ color: AMBER }} /> : <CheckCircle2 size={15} style={{ color: GREEN }} />}
              <span className="flex-1 text-sm" style={{ color: TEXT }}>{dateLabel(s.created_at)}{s.source === "demo" ? " · demo" : ""}</span>
              <span className="text-xs" style={{ color: SUB }}>{(s.codes || []).length ? `${s.codes.length} code${s.codes.length === 1 ? "" : "s"}` : "No codes"}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function reading(k, v, unit) {
  if (k === "coolant_c" || k === "intake_c") return fmtTemp(v, unit);
  if (k === "speed_kmh") return fmtSpeed(v, unit);
  return `${v} ${(READING_LABELS[k] || ["", ""])[1]}`;
}

function ScanResult({ scan, unit, explaining, onExplain, onAsk, onClear }) {
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const codes = (scan.codes || []).slice().sort((a, b) => ["safety", "soon", "watch"].indexOf(severityOf(a.code)) - ["safety", "soon", "watch"].indexOf(severityOf(b.code)));
  const readings = Object.entries(scan.readings || {});
  const summary = scan.summary ? parseVerdict(scan.summary) : null;
  return (
    <div className="flex flex-col gap-3 rounded-3xl p-4" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center gap-3">
        {codes.length ? <AlertTriangle size={20} style={{ color: AMBER }} /> : <CheckCircle2 size={20} style={{ color: GREEN }} />}
        <div className="min-w-0">
          <p className="text-base font-semibold" style={{ color: TEXT }}>{codes.length ? `${codes.length} fault code${codes.length === 1 ? "" : "s"}` : "No fault codes"}</p>
          <p className="text-xs" style={{ color: SUB }}>{timeAgo(scan.created_at)} · check engine light {scan.check_engine ? "on" : "off"}{scan.source === "demo" ? " · demo data" : ""}</p>
        </div>
      </div>
      {codes.map((c) => {
        const [color, label] = SEV[severityOf(c.code)];
        return (
          <div key={c.code} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-bold tracking-wide" style={{ color: TEXT }}>{c.code}</span>
              <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${color}1F`, color }}>{label}</span>
              {c.kind === "pending" && <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: `${BLUE}1F`, color: BLUE }}>Pending</span>}
            </div>
            <p className="mt-1 text-sm" style={{ color: SUB }}>{describeCode(c.code)}</p>
          </div>
        );
      })}
      {readings.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {readings.map(([k, v]) => {
            const tone = readingTone(k, v);
            const color = tone === "bad" ? RED : tone === "watch" ? AMBER : TEXT;
            return (
              <div key={k} className="rounded-2xl px-3 py-2.5" style={{ backgroundColor: CARD_ALT, border: `1px solid ${tone === "bad" ? RED : tone === "watch" ? AMBER : "transparent"}` }}>
                <p style={{ fontSize: 11, color: SUB }}>{(READING_LABELS[k] || [k])[0]}</p>
                <p className="mt-0.5 font-mono text-sm font-semibold" style={{ color }}>{reading(k, v, unit)}</p>
              </div>
            );
          })}
        </div>
      )}
      {summary ? (
        <div className="rounded-2xl p-4" style={{ backgroundColor: CARD_ALT }}>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold" style={{ color: TEXT }}><Sparkles size={14} /> What Motiq says</p>
          {summary.verdict && <div className="mb-2"><VerdictBadge verdict={summary.verdict} /></div>}
          <Markdown text={summary.clean} />
        </div>
      ) : (
        <PrimaryButton onClick={onExplain} disabled={explaining}>{explaining ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}{explaining ? "Motiq is looking…" : "Explain this scan"}</PrimaryButton>
      )}
      <div className="flex gap-2">
        <SecondaryButton onClick={onAsk} className="flex-1"><Bot size={14} /> Ask a follow-up</SecondaryButton>
        {onClear && <SecondaryButton onClick={onClear} color={RED} className="px-4"><Trash2 size={14} /> Clear codes</SecondaryButton>}
      </div>
    </div>
  );
}
