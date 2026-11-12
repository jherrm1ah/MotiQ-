// Motiq end to end, as a new driver: set up the profile, add a car, add a reminder and a service,
// run a demo scan and get it explained, ask the AI mechanic, post a part in the market, message
// about a listing, and use Car Mode. The server is a small in-memory fake of Supabase.
const { chromium } = require("playwright");
const S = process.argv[2];
const ME = "11111111-1111-4111-8111-111111111111";
const SELLER = "22222222-2222-4222-8222-222222222222";
const now = () => new Date().toISOString();
const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));

function fakeServer(p, db, calls) {
  return p.route("**/*.supabase.co/**", async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname; const m = req.method();
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(body) });
    if (m === "OPTIONS") return json({});
    calls.push(`${m} ${path}${u.search}`);
    if (path.endsWith("/functions/v1/motiq-ai")) {
      const b = JSON.parse(req.postData() || "{}");
      db.ai_messages.push({ id: uuid(), owner_id: ME, vehicle_id: b.vehicleId, mode: b.mode === "scan" ? "chat" : b.mode, role: "user", content: b.message, created_at: now() });
      const reply = b.mode === "scan" ? "**P0171** means the engine is running lean.\n- Check for a vacuum leak\n- Clean the MAF sensor" : b.mode === "voice" ? "Your car looks fine. Your oil change is due in about six months." : "That squeal is usually the brake wear indicator. Get the pads checked soon.";
      db.ai_messages.push({ id: uuid(), owner_id: ME, vehicle_id: b.vehicleId, mode: b.mode === "scan" ? "chat" : b.mode, role: "assistant", content: reply, created_at: now() });
      return json({ reply });
    }
    if (path.includes("/storage/v1/object/")) return json({ Key: "x" });
    if (path.endsWith("/rest/v1/rpc/contact_seller")) { const c = { id: uuid(), listing_id: JSON.parse(req.postData()).p_listing, buyer_id: ME, seller_id: SELLER, last_message_at: now(), created_at: now() }; db.conversations.push(c); return json(c.id); }
    const table = path.replace("/rest/v1/", "");
    if (!db[table]) return json([]);
    // Equality filters only (enough for this app's reads).
    const filters = [...u.searchParams.entries()].filter(([k, v]) => !["select", "order", "limit", "offset", "or", "on_conflict", "columns"].includes(k) && /^(eq|neq|is)\./.test(v));
    const match = (row) => filters.every(([k, v]) => { const [op, ...rest] = v.split("."); const val = rest.join("."); return op === "eq" ? String(row[k]) === val : op === "neq" ? String(row[k]) !== val : op === "is" ? row[k] == null : true; });
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    if (m === "GET" || m === "HEAD") { const rows = db[table].filter(match); return json(single ? rows[0] || null : rows); }
    if (m === "POST") {
      const body = JSON.parse(req.postData() || "[]");
      const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ id: uuid(), created_at: now(), ...r }));
      db[table].push(...rows);
      return json(single ? rows[0] : rows, 201);
    }
    if (m === "PATCH") { const patch = JSON.parse(req.postData() || "{}"); const hit = db[table].filter(match); hit.forEach((r) => Object.assign(r, patch)); return json(single ? hit[0] : hit); }
    if (m === "DELETE") { db[table] = db[table].filter((r) => !match(r)); return json([]); }
    return json([]);
  });
}

(async () => {
  const b = await chromium.launch();
  const out = {};
  const errs = [];
  const db = {
    profiles: [{ id: ME, name: "Ada Obi", country: "", currency: "USD", distance_unit: "km", city: "", phone: "", created_at: now() }],
    vehicles: [], service_records: [], reminders: [], scans: [], ai_messages: [], conversations: [], messages: [],
    listings: [{ id: uuid(), seller_id: SELLER, kind: "part", category: "Brakes", title: "Corolla front brake pads", description: "Brand new, still boxed.", price: 25000, currency: "NGN", condition: "new", country: "NG", city: "Lagos", fits_make: "Toyota", fits_model: "Corolla", fits_year_from: 2014, fits_year_to: 2018, photos: [], status: "active", created_at: now() }],
  };
  const calls = [];
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await fakeServer(p, db, calls);
  await p.addInitScript((ME) => {
    localStorage.setItem("sb-qsnooitnvlziladyywho-auth-token", JSON.stringify({ access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "ada@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { name: "Ada Obi" } } }));
  }, ME);
  const body = async () => (await p.locator("body").innerText()).toLowerCase();
  const wait = (ms = 400) => p.waitForTimeout(ms);
  const tab = (name) => p.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true }).click();

  // 1) First run: country sets currency and distance.
  await p.goto("http://localhost:4322/", { waitUntil: "domcontentloaded" }); await wait(1500);
  out.welcome = (await body()).includes("welcome to motiq");
  await p.getByLabel("Country").selectOption("NG"); await wait(200);
  out.nairaDefault = (await p.getByLabel("Currency").inputValue()) === "NGN";
  await p.getByLabel("City (for the market)").fill("Lagos");
  await p.getByRole("button", { name: "Continue" }).click(); await wait(900);
  out.profileSaved = db.profiles[0].country === "NG" && db.profiles[0].currency === "NGN";
  await p.screenshot({ path: S + "/motiq-empty.png" });

  // 2) Add a car.
  await p.getByRole("button", { name: "Add a car" }).first().click(); await wait();
  await p.getByLabel("Make").fill("Toyota"); await p.getByLabel("Model").fill("Corolla"); await p.getByLabel("Year").fill("2014"); await p.getByLabel("Odometer (km)").fill("85000");
  await p.getByRole("dialog").getByRole("button", { name: "Add car" }).click(); await wait(1000);
  out.carAdded = db.vehicles.length === 1 && (await body()).includes("2014 toyota corolla") && (await body()).includes("85,000 km");
  out.healthy = (await body()).includes("healthy");

  // 3) A reminder from a template, and a service with a cost.
  await p.getByRole("button", { name: "Add a reminder" }).click(); await wait();
  await p.getByRole("dialog").getByRole("button", { name: "Oil and filter change" }).click();
  await p.getByRole("dialog").getByRole("button", { name: "Add reminder" }).click(); await wait(900);
  out.reminder = db.reminders.length === 1 && db.reminders[0].every_months === 6 && (await body()).includes("oil and filter change");
  await p.getByRole("button", { name: "Log a service" }).click(); await wait();
  await p.getByRole("dialog").getByRole("button", { name: "Brakes", exact: true }).click();
  await p.getByLabel("Cost (NGN)").fill("18000");
  await p.getByRole("dialog").getByRole("button", { name: "Save" }).click(); await wait(900);
  out.service = db.service_records.length === 1 && (await body()).includes("18,000");
  await p.screenshot({ path: S + "/motiq-garage.png" });

  // 4) Diagnose with the demo, and get it explained.
  await tab("Diagnose"); await wait();
  await p.getByRole("button", { name: /Car with problems/ }).click(); await wait(1000);
  let t = await body();
  out.scanCodes = db.scans.length === 1 && t.includes("p0171") && t.includes("p0420") && t.includes("engine running too lean");
  await p.getByRole("button", { name: "Explain this scan" }).click(); await wait(1000);
  out.scanExplained = (await body()).includes("vacuum leak") && calls.some((c) => c.includes("functions/v1/motiq-ai"));
  await p.screenshot({ path: S + "/motiq-diagnose.png" });
  await tab("Garage"); await wait();
  t = await body();
  out.garageShowsCodes = t.includes("fault codes from your last scan") && !t.includes("\nhealthy\n");

  // 5) Ask the AI mechanic.
  await tab("Ask"); await wait(800);
  await p.getByLabel("Your question").fill("My car squeals when I brake");
  await p.getByRole("button", { name: "Send", exact: true }).click(); await wait(1200);
  out.askReply = (await body()).includes("brake wear indicator");
  await p.screenshot({ path: S + "/motiq-ask.png" });

  // 6) Market: see a part, message the seller, and post one.
  await tab("Market"); await wait(800);
  out.marketList = (await body()).includes("corolla front brake pads");
  await p.screenshot({ path: S + "/motiq-market.png" });
  await p.getByRole("button", { name: "Corolla front brake pads" }).click(); await wait();
  await p.getByRole("button", { name: "Message the seller" }).click(); await wait(800);
  await p.getByLabel("Message", { exact: true }).fill("Is this still available?");
  await p.getByRole("button", { name: "Send message" }).click(); await wait(800);
  out.messaged = db.conversations.length === 1 && db.messages.length === 1 && (await body()).includes("is this still available?");
  await p.getByRole("button", { name: "Back" }).click(); await wait(600);
  await p.getByRole("button", { name: "Sell something" }).click(); await wait();
  await p.getByLabel("Title").fill("Corolla headlight, left side");
  await p.getByLabel("Price (leave empty to ask)").fill("40000");
  await p.getByRole("dialog").getByRole("button", { name: "Post listing" }).click(); await wait(900);
  out.posted = db.listings.length === 2 && db.listings[1].currency === "NGN" && db.listings[1].fits_make === "Toyota" && (await body()).includes("corolla headlight");

  // 7) Car Mode: greets with the car's status, answers a quick question.
  await tab("Car Mode"); await wait(800);
  t = await body();
  out.carModeGreeting = t.includes("car mode") && t.includes("fault code");
  await p.getByRole("button", { name: "How's my car?" }).click(); await wait(1500);
  out.carModeAnswer = (await body()).includes("your car looks fine");
  await p.screenshot({ path: S + "/motiq-carmode.png" });
  await p.getByRole("button", { name: "Leave Car Mode" }).click(); await wait(500);
  out.leftCarMode = (await body()).includes("coming up");

  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.log("FAILED", e.message.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
