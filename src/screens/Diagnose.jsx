import React, { useEffect, useRef, useState } from "react";
import { Bluetooth, Activity, AlertTriangle, CheckCircle2, Sparkles, Trash2, PlayCircle, Car } from "lucide-react";
import { C, Screen, Card, Button, Badge, Empty, toast, Chip } from "../ui.jsx";
import { bluetoothAvailable, connectAdapter, runScan, clearCodes, demoScan, readLive, READING_LABELS, readingTone } from "../lib/obd.js";
import { describeCode, severityOf } from "../lib/dtc.js";
import { saveScan, setScanSummary, askMotiq } from "../lib/data.js";
import { dateLabel } from "../lib/units.js";
import { carName } from "./Garage.jsx";
import Markdown from "./Markdown.jsx";

const SEV = { safety: ["bad", "Get it checked now"], soon: ["warn", "Fix soon"], watch: ["muted", "Keep an eye on it"] };

export function scanText(scan) {
  const codes = (scan.codes || []).map((c) => `${c.code} (${c.kind}) - ${describeCode(c.code)}`).join("\n") || "No fault codes.";
  const readings = Object.entries(scan.readings || {}).map(([k, v]) => `${(READING_LABELS[k] || [k])[0]}: ${v} ${(READING_LABELS[k] || ["", ""])[1]}`).join("\n");
  return `Check engine light: ${scan.check_engine ? "ON" : "off"}${scan.source === "demo" ? " (demo data)" : ""}\nCodes:\n${codes}\nLive readings:\n${readings || "none"}`;
}

export default function Diagnose({ me, garage, carId, reload, go }) {
  const car = garage.cars.find((c) => c.id === carId) || garage.cars[0];
  const [link, setLink] = useState(null);
  const [step, setStep] = useState("");
  const [busy, setBusy] = useState(false);
  const [current, setCurrent] = useState(null); // the scan on screen (saved row)
  const [explaining, setExplaining] = useState(false);
  const [live, setLive] = useState(null);
  const liveOn = useRef(false);
  useEffect(() => () => { liveOn.current = false; if (link) link.close(); }, [link]);

  if (!car) return <Screen title="Diagnose"><Empty icon={Car} title="Add a car first" body="Add your car in the Garage, then scan it here." action="Go to Garage" onAction={() => go("garage")} /></Screen>;
  const past = garage.scans.filter((s) => s.vehicle_id === car.id);
  const shown = current || past[0] || null;

  const finish = async (scan) => {
    const row = await saveScan(me.id, car.id, scan);
    setCurrent(row);
    await reload();
    return row;
  };
  const scanCar = async () => {
    setBusy(true);
    try {
      let l = link;
      if (!l) { setStep("Choose your adapter…"); l = await connectAdapter(); setLink(l); toast(`Connected to ${l.name}`); }
      const scan = await runScan(l, setStep);
      await finish(scan);
      toast(scan.codes.length ? `${scan.codes.length} code${scan.codes.length === 1 ? "" : "s"} found` : "No fault codes");
    } catch (e) {
      toast(/cancel|User cancelled|chooser/i.test(e.message || "") ? "No adapter picked" : e.message || "Couldn't scan. Try again.");
    }
    setStep(""); setBusy(false);
  };
  const tryDemo = async (kind) => { setBusy(true); try { await finish(demoScan(kind)); toast("Demo scan saved"); } catch (e) { toast(e.message); } setBusy(false); };
  const explain = async (scan) => {
    setExplaining(true);
    try {
      const reply = await askMotiq({ message: scanText(scan), vehicleId: car.id, mode: "scan" });
      await setScanSummary(scan.id, reply);
      setCurrent({ ...scan, summary: reply });
      reload();
    } catch (e) { toast(e.message); }
    setExplaining(false);
  };
  const toggleLive = async () => {
    if (liveOn.current) { liveOn.current = false; setLive(null); return; }
    liveOn.current = true; setLive({});
    while (liveOn.current && link) { try { setLive(await readLive(link)); } catch (e) { break; } await new Promise((r) => setTimeout(r, 700)); }
  };

  return (
    <Screen title="Diagnose" subtitle={carName(car)}>
      <Card style={{ padding: 18 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: C.blueSoft, display: "flex", alignItems: "center", justifyContent: "center" }}><Bluetooth color={C.blue} /></div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontWeight: 800 }}>{link ? `Connected: ${link.name}` : "Scan with an OBD-II adapter"}</p>
            <p style={{ margin: "3px 0 0", color: C.sub, fontSize: 13, lineHeight: 1.45 }}>{link ? "Engine running or ignition on." : "Plug a Bluetooth (BLE) OBD-II adapter into the port under the dashboard, turn the ignition on, then scan."}</p>
          </div>
        </div>
        {step && <p role="status" style={{ margin: "12px 0 0", color: C.accent, fontWeight: 700, fontSize: 14 }}>{step}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          {bluetoothAvailable()
            ? <Button onClick={scanCar} disabled={busy} style={{ flex: 1 }}><Activity size={18} /> {busy ? "Scanning…" : link ? "Scan again" : "Connect and scan"}</Button>
            : <p style={{ margin: 0, color: C.sub, fontSize: 13 }}>Bluetooth scanning works in the Motiq Android app and in Chrome on a computer or Android phone.</p>}
          {link && <Button kind="secondary" onClick={toggleLive}>{live ? "Stop live data" : "Live data"}</Button>}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ color: C.faint, fontSize: 13 }}>No adapter? Try a demo:</span>
          <Chip onClick={() => tryDemo("issues")} disabled={busy}><PlayCircle size={14} style={{ verticalAlign: -2 }} /> Car with problems</Chip>
          <Chip onClick={() => tryDemo("healthy")} disabled={busy}>Healthy car</Chip>
        </div>
      </Card>

      {live && (
        <Card style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 10px", fontWeight: 800 }}>Live</p>
          <Readings readings={live} />
        </Card>
      )}

      {shown && <ScanResult scan={shown} explaining={explaining} onExplain={() => explain(shown)} onAsk={() => go("ask")}
        onClear={link && (shown.codes || []).length && shown.source === "obd" ? async () => {
          if (!window.confirm("Clear the codes and turn off the check engine light? Only do this after the problem is fixed: the codes are useful to your mechanic.")) return;
          try { await clearCodes(link); toast("Codes cleared"); await scanCar(); } catch (e) { toast(e.message); }
        } : null} />}

      {past.length > 1 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 10px", fontSize: 18, fontWeight: 800 }}>Past scans</h2>
          {past.slice(0, 20).map((s) => (
            <Card key={s.id} onClick={() => setCurrent(s)} style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 10, borderColor: shown && shown.id === s.id ? C.accent : C.line }}>
              {(s.codes || []).length ? <AlertTriangle size={18} color={C.warn} /> : <CheckCircle2 size={18} color={C.accent} />}
              <span style={{ flex: 1 }}>{dateLabel(s.created_at)}{s.source === "demo" ? " · demo" : ""}</span>
              <span style={{ color: C.sub, fontSize: 13 }}>{(s.codes || []).length ? `${s.codes.length} code${s.codes.length === 1 ? "" : "s"}` : "No codes"}</span>
            </Card>
          ))}
        </section>
      )}
    </Screen>
  );
}

function Readings({ readings }) {
  const entries = Object.entries(readings || {});
  if (!entries.length) return <p style={{ margin: 0, color: C.sub, fontSize: 14 }}>Waiting for data…</p>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
      {entries.map(([k, v]) => {
        const [label, unit] = READING_LABELS[k] || [k, ""];
        const tone = readingTone(k, v);
        return (
          <div key={k} style={{ padding: 12, borderRadius: 12, background: C.bg, border: `1px solid ${tone === "bad" ? C.bad : tone === "watch" ? C.warn : C.line}` }}>
            <p style={{ margin: 0, color: C.sub, fontSize: 12 }}>{label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 20, fontWeight: 800, color: tone === "bad" ? C.bad : tone === "watch" ? C.warn : C.text }}>{v}<span style={{ fontSize: 13, color: C.sub, fontWeight: 600 }}> {unit}</span></p>
          </div>
        );
      })}
    </div>
  );
}

function ScanResult({ scan, explaining, onExplain, onAsk, onClear }) {
  const codes = (scan.codes || []).slice().sort((a, b) => ["safety", "soon", "watch"].indexOf(severityOf(a.code)) - ["safety", "soon", "watch"].indexOf(severityOf(b.code)));
  return (
    <Card style={{ marginTop: 12, padding: 18 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {codes.length ? <AlertTriangle color={C.warn} /> : <CheckCircle2 color={C.accent} />}
        <div style={{ flex: 1 }}>
          <p style={{ margin: 0, fontWeight: 800, fontSize: 17 }}>{codes.length ? `${codes.length} fault code${codes.length === 1 ? "" : "s"}` : "No fault codes"}</p>
          <p style={{ margin: "2px 0 0", color: C.sub, fontSize: 13 }}>{dateLabel(scan.created_at)} · check engine light {scan.check_engine ? "on" : "off"}{scan.source === "demo" ? " · demo data" : ""}</p>
        </div>
      </div>
      {codes.map((c) => {
        const [tone, label] = SEV[severityOf(c.code)];
        return (
          <div key={c.code} style={{ padding: "12px 0", borderTop: `1px solid ${C.line}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <b style={{ fontSize: 16, letterSpacing: 0.5 }}>{c.code}</b>
              <Badge tone={tone}>{label}</Badge>
              {c.kind === "pending" && <Badge tone="blue">Pending</Badge>}
            </div>
            <p style={{ margin: "5px 0 0", color: C.sub, fontSize: 14 }}>{describeCode(c.code)}</p>
          </div>
        );
      })}
      {Object.keys(scan.readings || {}).length > 0 && <div style={{ marginTop: 12 }}><Readings readings={scan.readings} /></div>}
      {scan.summary ? (
        <div style={{ marginTop: 16, padding: 14, borderRadius: 14, background: C.bg, border: `1px solid ${C.line}` }}>
          <p style={{ margin: "0 0 6px", fontWeight: 800, display: "flex", alignItems: "center", gap: 6 }}><Sparkles size={16} color={C.accent} /> What Motiq says</p>
          <Markdown text={scan.summary} />
        </div>
      ) : (
        <Button onClick={onExplain} disabled={explaining} style={{ width: "100%", marginTop: 14 }}><Sparkles size={18} /> {explaining ? "Motiq is looking…" : "Explain this scan"}</Button>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <Button kind="secondary" onClick={onAsk} style={{ flex: 1 }}>Ask a follow-up</Button>
        {onClear && <Button kind="danger" onClick={onClear}><Trash2 size={16} /> Clear codes</Button>}
      </div>
    </Card>
  );
}
