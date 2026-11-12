// Live dashboard: big gauges from the OBD-II adapter while the engine runs, with warnings
// (overheating, battery not charging) shown here and spoken by the app.
import React from "react";
import { Bluetooth, ScanLine, AlertTriangle, Gauge, Thermometer, BatteryCharging, Fuel, Timer } from "lucide-react";
import { useTheme, useUI, ACCENT, RED, AMBER, GREEN, ScreenHeader, PrimaryButton, NeonButton, kmIn, speedUnit, fmtTemp, fmtDuration } from "../design.jsx";
import { OBDConnectSheet } from "./Garage.jsx";
import { t } from "../lib/i18n.js";

function Dial({ label, value, unit, pct, color, icon: Icon, big }) {
  const { CARD, BORDER, TEXT, SUB, RING_TRACK } = useTheme();
  const size = big ? 168 : 112, stroke = big ? 12 : 9;
  const r = (size - stroke) / 2, c = 2 * Math.PI * r, arc = 0.75;
  const p = Math.max(0, Math.min(1, pct || 0));
  return (
    <div className="flex flex-col items-center justify-center p-4" style={{ borderRadius: 28, backgroundColor: CARD, border: `1px solid ${BORDER}` }} role="meter" aria-label={label} aria-valuenow={typeof value === "number" ? value : undefined}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(135deg)" }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={RING_TRACK} strokeWidth={stroke} strokeDasharray={`${c * arc} ${c}`} strokeLinecap="round" />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeDasharray={`${c * arc * p} ${c}`} strokeLinecap="round" style={{ transition: "stroke-dasharray 600ms ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && <Icon size={big ? 16 : 13} style={{ color: SUB }} />}
          <span className="font-bold tabular-nums" style={{ fontSize: big ? 40 : 24, color: TEXT, lineHeight: 1.1 }}>{value ?? "—"}</span>
          <span style={{ fontSize: big ? 13 : 11, color: SUB }}>{unit}</span>
        </div>
      </div>
      <p className="mt-1 text-xs font-medium" style={{ color: SUB }}>{label}</p>
    </div>
  );
}

export default function Dashboard({ onBack }) {
  const { unit, vehicle, obd, liveData, connectOBD, disconnectOBD, openSheet, closeSheet, goTo } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const d = liveData || {};
  const connected = obd.status === "connected";
  const coolColor = d.coolant_c >= 108 ? RED : d.coolant_c >= 103 ? AMBER : GREEN;
  const batColor = d.battery_v == null ? GREEN : d.battery_v < 12.2 || (d.rpm > 400 && d.battery_v < 12.8) ? AMBER : GREEN;
  const warnings = [];
  if (d.coolant_c >= 108) warnings.push([RED, "Engine overheating — pull over safely and let it cool."]);
  else if (d.coolant_c >= 103) warnings.push([AMBER, "Engine running hot."]);
  if (d.battery_v != null && d.rpm > 400 && d.battery_v < 12.8) warnings.push([AMBER, "Battery not charging properly — check the alternator."]);

  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <ScreenHeader title={t("Live dashboard")} sub={connected ? `Live · ${obd.deviceName}` : "Connect your OBD-II adapter"} onBack={onBack} />
      {!connected ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl p-8 text-center" style={{ backgroundColor: CARD_ALT }}>
          <Bluetooth size={26} style={{ color: TEXT }} />
          <p className="text-sm" style={{ color: SUB }}>Plug the adapter in, start the engine, then connect to see live speed, RPM, temperature and battery.</p>
          <PrimaryButton className="w-full" disabled={obd.status === "connecting"} onClick={() => openSheet("Connect OBD-II adapter", <OBDConnectSheet onScan={() => { closeSheet(); connectOBD(vehicle && vehicle.id); }} />)}><Bluetooth size={15} /> {obd.status === "connecting" ? "Connecting…" : "Connect adapter"}</PrimaryButton>
        </div>
      ) : (
        <>
          {warnings.map(([color, text]) => (
            <div key={text} role="alert" className="flex items-center gap-2.5 rounded-2xl p-3.5" style={{ backgroundColor: `${color}1F` }}>
              <AlertTriangle size={16} style={{ color }} className="shrink-0" /><p className="text-sm font-medium" style={{ color: TEXT }}>{text}</p>
            </div>
          ))}
          <Dial big label="Speed" icon={Gauge} value={d.speed_kmh != null ? Math.round(kmIn(d.speed_kmh, unit)) : null} unit={speedUnit(unit)} pct={(d.speed_kmh || 0) / 200} color={ACCENT} />
          <div className="grid grid-cols-2 gap-3">
            <Dial label="Engine" value={d.rpm != null ? d.rpm : null} unit="rpm" pct={(d.rpm || 0) / 7000} color={d.rpm > 5500 ? RED : ACCENT} />
            <Dial label="Coolant" icon={Thermometer} value={d.coolant_c != null ? fmtTemp(d.coolant_c, unit).replace(/°[CF]/, "") : null} unit={unit === "mi" ? "°F" : "°C"} pct={((d.coolant_c || 0) - 40) / 80} color={coolColor} />
            <Dial label="Battery" icon={BatteryCharging} value={d.battery_v != null ? d.battery_v.toFixed(1) : null} unit="V" pct={((d.battery_v || 0) - 10) / 5} color={batColor} />
            <Dial label="Fuel" icon={Fuel} value={d.fuel_pct != null ? d.fuel_pct : null} unit="%" pct={(d.fuel_pct || 0) / 100} color={d.fuel_pct != null && d.fuel_pct < 12 ? AMBER : ACCENT} />
          </div>
          <div className="flex items-center justify-between rounded-2xl px-4 py-3" style={{ backgroundColor: CARD_ALT }}>
            <span className="flex items-center gap-2 text-sm" style={{ color: SUB }}><Timer size={14} /> Engine running this session</span>
            <span className="font-mono text-sm" style={{ color: TEXT }}>{fmtDuration(d.runtimeSec || 0)}</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NeonButton onClick={() => goTo("scan")} className="rounded-2xl py-3.5 text-sm"><ScanLine size={15} /> Scan codes</NeonButton>
            <button onClick={() => disconnectOBD()} className="rounded-2xl py-3.5 text-sm font-medium" style={{ backgroundColor: CARD_ALT, color: RED }}>Disconnect</button>
          </div>
          <p className="text-center text-[11px]" style={{ color: SUB }}>Not every car reports every reading. Keep your eyes on the road — Motiq speaks warnings out loud.</p>
        </>
      )}
    </div>
  );
}
