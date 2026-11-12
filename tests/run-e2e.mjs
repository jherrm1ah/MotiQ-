// Runs the browser tests in tests/e2e against a production build served by `vite preview`.
// Each test prints one JSON object of checks: every true/false check must be true and every
// list of errors (keys starting with "err") must be empty. Usage: npm run build && npm run test:e2e
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 4322;
const shots = mkdtempSync(join(tmpdir(), "motiq-e2e-"));
const preview = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { stdio: "ignore", detached: true });
const stop = () => { try { process.kill(-preview.pid); } catch (e) {} };
process.on("exit", stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) return; } catch (e) {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("vite preview didn't start");
}

function runTest(file) {
  return new Promise((resolve) => {
    const child = spawn("node", [file, shots], { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err }));
  });
}

await waitForServer();
const dir = new URL("./e2e/", import.meta.url).pathname;
let failed = 0;
for (const f of readdirSync(dir).filter((f) => f.endsWith(".cjs")).sort()) {
  const { code, out, err } = await runTest(join(dir, f));
  const start = out.indexOf("{"); const end = out.lastIndexOf("}");
  let result = null;
  try { result = JSON.parse(out.slice(start, end + 1)); } catch (e) {}
  const problems = [];
  if (code !== 0 || !result) problems.push(`crashed: ${(out + err).trim().split("\n").slice(-3).join(" | ")}`);
  else for (const [k, v] of Object.entries(result)) {
    if (typeof v === "boolean" && !v) problems.push(`${k} is false`);
    if (k.startsWith("err") && Array.isArray(v) && v.length) problems.push(`${k}: ${v.join(" / ")}`);
  }
  if (problems.length) { failed++; console.log(`✗ ${f}\n    ${problems.join("\n    ")}`); }
  else console.log(`✓ ${f} (${Object.values(result).filter((v) => v === true).length} checks)`);
}
console.log(failed ? `\n${failed} test file(s) failed. Screenshots: ${shots}` : "\nAll browser tests passed.");
stop();
process.exit(failed ? 1 : 0);
