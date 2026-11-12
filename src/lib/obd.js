// OBD-II over Bluetooth Low Energy, through an ELM327-style adapter plugged into the car's
// diagnostic port (under the dashboard, driver's side). Works in the Android app and in Chrome
// (Web Bluetooth). Classic-Bluetooth-only adapters aren't supported yet: use a BLE one
// (most "Bluetooth 4.0 / BLE" ELM327, Vgate iCar Pro BLE, OBDLink CX, Veepeak BLE).
//
//   const link = await connectAdapter();          // the phone shows a list of nearby adapters
//   const scan = await runScan(link, onProgress);  // codes + live readings
//   await clearCodes(link);                        // turns off the check engine light
//   await link.close();
//
// Demo mode (no adapter): demoScan() returns a realistic scan so people can try Motiq.
import { BleClient } from "@capacitor-community/bluetooth-le";
import { parseDtcResponse } from "./dtc.js";

// GATT services ELM327 BLE adapters commonly use for their serial port.
const SERVICES = [
  "0000fff0-0000-1000-8000-00805f9b34fb",
  "0000ffe0-0000-1000-8000-00805f9b34fb",
  "000018f0-0000-1000-8000-00805f9b34fb",
  "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
  "0000beef-0000-1000-8000-00805f9b34fb",
];
const enc = new TextEncoder();
const dec = new TextDecoder();

export function bluetoothAvailable() {
  const native = typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  return !!native || (typeof navigator !== "undefined" && !!navigator.bluetooth);
}

export async function connectAdapter() {
  await BleClient.initialize({ androidNeverForLocation: true });
  const device = await BleClient.requestDevice({ optionalServices: SERVICES });
  await BleClient.connect(device.deviceId);
  // Find a characteristic we can write commands to and one that sends answers back.
  const services = await BleClient.getServices(device.deviceId);
  let tx = null, rx = null;
  for (const s of services) {
    for (const ch of s.characteristics || []) {
      const p = ch.properties || {};
      if (!tx && (p.write || p.writeWithoutResponse)) tx = { service: s.uuid, char: ch.uuid, noResponse: !p.write };
      if (!rx && (p.notify || p.indicate)) rx = { service: s.uuid, char: ch.uuid };
    }
    if (tx && rx && tx.service === rx.service) break;
  }
  if (!tx || !rx) { await BleClient.disconnect(device.deviceId).catch(() => {}); throw new Error("That doesn't look like an OBD-II adapter. Pick the adapter plugged into your car."); }

  let buffer = "";
  let waiter = null;
  await BleClient.startNotifications(device.deviceId, rx.service, rx.char, (value) => {
    buffer += dec.decode(value);
    if (buffer.includes(">") && waiter) { const w = waiter; waiter = null; w(); }
  });
  // One command at a time; the adapter ends every answer with ">".
  let chain = Promise.resolve();
  const send = (cmd, timeout = 5000) => (chain = chain.then(() => new Promise((resolve, reject) => {
    buffer = "";
    const t = setTimeout(() => { waiter = null; reject(new Error("The adapter stopped answering. Check it's plugged in and the ignition is on.")); }, timeout);
    waiter = () => { clearTimeout(t); resolve(buffer.replace(/>/g, "").replace(new RegExp(`^${cmd}`), "").trim()); };
    const bytes = enc.encode(`${cmd}\r`);
    const view = new DataView(bytes.buffer);
    (tx.noResponse ? BleClient.writeWithoutResponse : BleClient.write)(device.deviceId, tx.service, tx.char, view).catch((e) => { clearTimeout(t); waiter = null; reject(e); });
  })));

  // Reset, echo off, no spaces or headers, then let the adapter find the car's protocol.
  await send("ATZ", 8000);
  for (const c of ["ATE0", "ATL0", "ATS0", "ATH0", "ATSP0"]) await send(c);
  return {
    name: device.name || "OBD-II adapter",
    send,
    close: async () => { try { await BleClient.stopNotifications(device.deviceId, rx.service, rx.char); } catch (e) {} await BleClient.disconnect(device.deviceId).catch(() => {}); },
  };
}

const noData = (r) => !r || /NO ?DATA|ERROR|UNABLE|STOPPED|\?/i.test(r);
const bytesAfter = (r, pid) => {
  const hex = String(r).toUpperCase().replace(/[^0-9A-F]/g, "");
  const at = hex.indexOf(`41${pid}`);
  return at < 0 ? null : hex.slice(at + 4).match(/../g)?.map((b) => parseInt(b, 16)) || null;
};

// Live readings (only the ones the car answers).
const PIDS = {
  rpm: ["0C", (b) => Math.round((b[0] * 256 + b[1]) / 4)],
  speed_kmh: ["0D", (b) => b[0]],
  coolant_c: ["05", (b) => b[0] - 40],
  intake_c: ["0F", (b) => b[0] - 40],
  load_pct: ["04", (b) => Math.round((b[0] * 100) / 255)],
  throttle_pct: ["11", (b) => Math.round((b[0] * 100) / 255)],
  fuel_pct: ["2F", (b) => Math.round((b[0] * 100) / 255)],
  battery_v: ["42", (b) => Math.round(((b[0] * 256 + b[1]) / 1000) * 10) / 10],
  short_trim_pct: ["06", (b) => Math.round(((b[0] - 128) * 100) / 128)],
  long_trim_pct: ["07", (b) => Math.round(((b[0] - 128) * 100) / 128)],
};

export async function runScan(link, onProgress = () => {}) {
  onProgress("Talking to your car…");
  const status = await link.send("0101", 10000); // first real request also finds the protocol
  const s = bytesAfter(status, "01");
  const checkEngine = !!(s && s[0] & 0x80);
  onProgress("Reading fault codes…");
  const storedRaw = await link.send("03", 8000).catch(() => "");
  const stored = noData(storedRaw) ? [] : parseDtcResponse(storedRaw, "03");
  const pendingRaw = await link.send("07", 8000).catch(() => "");
  const pending = noData(pendingRaw) ? [] : parseDtcResponse(pendingRaw, "07");
  const codes = [...stored.map((code) => ({ code, kind: "stored" })), ...pending.filter((c) => !stored.includes(c)).map((code) => ({ code, kind: "pending" }))];
  onProgress("Reading live data…");
  const readings = {};
  for (const [key, [pid, fn]] of Object.entries(PIDS)) {
    try { const b = bytesAfter(await link.send(`01${pid}`, 4000), pid); if (b && b.length) readings[key] = fn(b); } catch (e) { /* the car doesn't report this one */ }
  }
  if (readings.battery_v == null) { // older cars: the adapter can still read the voltage it's powered by
    try { const v = parseFloat((await link.send("ATRV", 3000)).replace(/[^0-9.]/g, "")); if (v > 5 && v < 20) readings.battery_v = v; } catch (e) {}
  }
  return { source: "obd", check_engine: checkEngine || codes.some((c) => c.kind === "stored"), codes, readings };
}

// Live gauge readings only (for the live view while the engine runs).
export async function readLive(link, keys = ["rpm", "speed_kmh", "coolant_c", "battery_v"]) {
  const out = {};
  for (const k of keys) {
    const [pid, fn] = PIDS[k];
    try { const b = bytesAfter(await link.send(`01${pid}`, 3000), pid); if (b && b.length) out[k] = fn(b); } catch (e) {}
  }
  return out;
}

export async function clearCodes(link) {
  const r = await link.send("04", 8000);
  if (noData(r) && !/44/.test(r)) throw new Error("The car didn't clear the codes. Turn the ignition on with the engine off and try again.");
}

// A believable scan for trying Motiq without an adapter.
export function demoScan(kind = "issues") {
  const healthy = kind === "healthy";
  return {
    source: "demo",
    check_engine: !healthy,
    codes: healthy ? [] : [{ code: "P0171", kind: "stored" }, { code: "P0420", kind: "pending" }],
    readings: healthy
      ? { rpm: 760, speed_kmh: 0, coolant_c: 89, intake_c: 31, load_pct: 22, throttle_pct: 14, fuel_pct: 62, battery_v: 14.1, short_trim_pct: 1, long_trim_pct: 2 }
      : { rpm: 820, speed_kmh: 0, coolant_c: 92, intake_c: 34, load_pct: 27, throttle_pct: 15, fuel_pct: 38, battery_v: 13.2, short_trim_pct: 9, long_trim_pct: 14 },
  };
}

export const READING_LABELS = {
  rpm: ["Engine speed", "rpm"], speed_kmh: ["Speed", "km/h"], coolant_c: ["Coolant", "°C"], intake_c: ["Intake air", "°C"],
  load_pct: ["Engine load", "%"], throttle_pct: ["Throttle", "%"], fuel_pct: ["Fuel level", "%"], battery_v: ["Battery", "V"],
  short_trim_pct: ["Short-term fuel trim", "%"], long_trim_pct: ["Long-term fuel trim", "%"],
};
// "good" | "watch" | "bad" for a reading, so the screen can colour it.
export function readingTone(key, v) {
  if (v == null) return "muted";
  if (key === "coolant_c") return v > 108 ? "bad" : v > 102 ? "watch" : "good";
  if (key === "battery_v") return v < 11.8 ? "bad" : v < 12.2 || v > 15 ? "watch" : "good";
  if (key === "long_trim_pct" || key === "short_trim_pct") return Math.abs(v) > 20 ? "bad" : Math.abs(v) > 10 ? "watch" : "good";
  return "good";
}
