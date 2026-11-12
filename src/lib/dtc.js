// OBD-II fault codes (DTCs): turning the car's raw answer into codes like P0300, and a short plain
// description for the common generic ones. The AI mechanic explains any code in detail.

// Mode 03/07/0A answers look like "43 01 33 00 00 00 00" (or several lines, or with a count
// byte on CAN cars). Every 2 bytes after the 43/47/4A header is one code; 0000 is padding.
export function parseDtcResponse(raw, mode = "03") {
  const header = { "03": "43", "07": "47", "0A": "4A" }[mode];
  const hex = String(raw || "").toUpperCase().replace(/[^0-9A-F\r\n]/g, "");
  const codes = [];
  for (let line of hex.split(/[\r\n]+/)) {
    line = line.replace(/\s+/g, "");
    if (!line) continue;
    // Drop a CAN frame index ("0:", "1:") or ISO-TP length prefix, then find the mode header.
    const at = line.indexOf(header);
    if (at < 0) continue;
    let data = line.slice(at + 2);
    // CAN (ISO 15765) answers include how many codes follow: "43 02 0133 0420".
    if (data.length % 4 === 2) data = data.slice(2);
    for (let i = 0; i + 4 <= data.length; i += 4) {
      const code = bytesToCode(data.slice(i, i + 4));
      if (code && !codes.includes(code)) codes.push(code);
    }
  }
  return codes;
}
export function bytesToCode(four) {
  if (!/^[0-9A-F]{4}$/.test(four) || four === "0000") return null;
  const first = parseInt(four[0], 16);
  const system = "PCBU"[first >> 2];
  const digit2 = (first & 3).toString();
  return `${system}${digit2}${four.slice(1)}`;
}

const SYSTEMS = { P: "Engine and transmission", C: "Chassis (brakes, steering, suspension)", B: "Body (airbags, seats, lights, doors)", U: "Network (modules can't talk to each other)" };

const COMMON = {
  P0100: "Mass air flow (MAF) sensor circuit problem", P0101: "Mass air flow (MAF) sensor reading out of range", P0102: "Mass air flow sensor reading too low", P0103: "Mass air flow sensor reading too high",
  P0106: "Manifold pressure (MAP) sensor reading out of range", P0110: "Intake air temperature sensor circuit problem", P0113: "Intake air temperature sensor reading too high",
  P0115: "Engine coolant temperature sensor circuit problem", P0117: "Coolant temperature sensor reading too low", P0118: "Coolant temperature sensor reading too high",
  P0120: "Throttle position sensor circuit problem", P0121: "Throttle position sensor reading out of range", P0125: "Engine takes too long to warm up (thermostat or sensor)", P0128: "Coolant below thermostat temperature (thermostat stuck open)",
  P0130: "Oxygen sensor (bank 1, before catalyst) circuit problem", P0131: "Oxygen sensor (bank 1, before catalyst) low voltage", P0133: "Oxygen sensor (bank 1, before catalyst) slow response", P0134: "Oxygen sensor (bank 1, before catalyst) no activity",
  P0135: "Oxygen sensor heater (bank 1, before catalyst) circuit problem", P0136: "Oxygen sensor (bank 1, after catalyst) circuit problem", P0141: "Oxygen sensor heater (bank 1, after catalyst) circuit problem",
  P0171: "Engine running too lean (bank 1)", P0172: "Engine running too rich (bank 1)", P0174: "Engine running too lean (bank 2)", P0175: "Engine running too rich (bank 2)",
  P0200: "Fuel injector circuit problem", P0201: "Fuel injector, cylinder 1, circuit problem", P0217: "Engine overheating detected", P0230: "Fuel pump circuit problem",
  P0300: "Random or multiple cylinder misfire", P0301: "Cylinder 1 misfire", P0302: "Cylinder 2 misfire", P0303: "Cylinder 3 misfire", P0304: "Cylinder 4 misfire", P0305: "Cylinder 5 misfire", P0306: "Cylinder 6 misfire", P0307: "Cylinder 7 misfire", P0308: "Cylinder 8 misfire",
  P0325: "Knock sensor circuit problem", P0335: "Crankshaft position sensor circuit problem", P0340: "Camshaft position sensor circuit problem",
  P0351: "Ignition coil A circuit problem", P0352: "Ignition coil B circuit problem", P0353: "Ignition coil C circuit problem", P0354: "Ignition coil D circuit problem",
  P0400: "Exhaust gas recirculation (EGR) flow problem", P0401: "EGR flow too low", P0402: "EGR flow too high", P0411: "Secondary air injection flow problem",
  P0420: "Catalytic converter efficiency below normal (bank 1)", P0430: "Catalytic converter efficiency below normal (bank 2)",
  P0440: "Evaporative emission (EVAP) system problem", P0441: "EVAP system purge flow problem", P0442: "Small leak in the EVAP system (often a loose fuel cap)", P0446: "EVAP vent control problem", P0455: "Large leak in the EVAP system (check the fuel cap)", P0456: "Very small leak in the EVAP system",
  P0480: "Cooling fan 1 control circuit problem", P0500: "Vehicle speed sensor problem", P0505: "Idle air control system problem", P0506: "Idle speed lower than expected", P0507: "Idle speed higher than expected",
  P0562: "System (battery) voltage low", P0563: "System (battery) voltage high", P0571: "Brake switch circuit problem",
  P0600: "Engine computer communication problem", P0601: "Engine computer memory error", P0606: "Engine computer processor fault",
  P0700: "Transmission control system fault (check transmission codes)", P0705: "Transmission range sensor circuit problem", P0715: "Transmission input speed sensor problem", P0720: "Transmission output speed sensor problem",
  P0730: "Incorrect gear ratio", P0740: "Torque converter clutch circuit problem", P0741: "Torque converter clutch stuck off", P0750: "Shift solenoid A problem", P0755: "Shift solenoid B problem",
  P2096: "Fuel trim after catalyst too lean (bank 1)", P2097: "Fuel trim after catalyst too rich (bank 1)", P2135: "Throttle position sensors disagree", P2187: "Engine lean at idle (bank 1)", P2195: "Oxygen sensor stuck lean (bank 1)",
  P2270: "Oxygen sensor (after catalyst) stuck lean", P2463: "Diesel particulate filter soot build-up", P244A: "Diesel particulate filter pressure too low",
  C0035: "Front left wheel speed sensor problem (ABS)", C0040: "Front right wheel speed sensor problem (ABS)", C0045: "Rear left wheel speed sensor problem (ABS)", C0050: "Rear right wheel speed sensor problem (ABS)", C0265: "ABS pump motor relay problem",
  B0001: "Driver front airbag circuit problem", B0100: "Airbag system fault", U0100: "Lost communication with the engine computer", U0101: "Lost communication with the transmission computer", U0121: "Lost communication with the ABS module", U0155: "Lost communication with the instrument cluster",
};

// "safety": stop or get help soon. "soon": fix it soon. "watch": not urgent.
const SAFETY = /^(C0|B00|B01|P0217|P0335|P0300|P030[1-8]|P0118|U0121)/;
const SOON = /^(P01[0-9][0-9]|P02|P03|P04[0-9][0-9]|P05|P06|P07|P2|U0)/;
export function severityOf(code) {
  if (SAFETY.test(code)) return "safety";
  if (/^P04(4|5)/.test(code)) return "watch";
  if (SOON.test(code)) return "soon";
  return "watch";
}
export function describeCode(code) {
  const c = String(code || "").toUpperCase();
  return COMMON[c] || `${SYSTEMS[c[0]] || "Unknown system"} fault${c[1] === "1" || c[1] === "3" ? " (maker-specific code)" : ""}`;
}
