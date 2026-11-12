// Motiq end to end, as a new driver, in the redesigned app: set up the profile, add a car, log a
// service and a reminder, run a demo scan and get it explained, ask the AI mechanic (with a
// verdict), find real places nearby, message a seller and post a listing, save a document, use
// Car Mode Radio and the voice co-pilot, start a trip, and switch to light mode.
// Supabase, OpenStreetMap, routing and Jamendo are small in-memory fakes.
const { chromium } = require("playwright");
const S = process.argv[2];
const ME = "11111111-1111-4111-8111-111111111111";
const SELLER = "22222222-2222-4222-8222-222222222222";
const now = () => new Date().toISOString();
const uuid = () => "xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx".replace(/x/g, () => ((Math.random() * 16) | 0).toString(16));
const HERE = { latitude: 6.5244, longitude: 3.3792 }; // Lagos

const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" }, body: JSON.stringify(body) });

async function fakes(p, db, calls) {
  await p.route("**/*.supabase.co/**", async (route) => {
    const req = route.request(); const u = new URL(req.url()); const path = u.pathname; const m = req.method();
    if (m === "OPTIONS") return json(route, {});
    calls.push(`${m} ${path}${u.search}`);
    if (path.endsWith("/auth/v1/user")) return json(route, { id: ME, email: "ada@example.com", aud: "authenticated", role: "authenticated" });
    if (path.endsWith("/functions/v1/motiq-ai")) {
      const b = JSON.parse(req.postData() || "{}");
      const mode = b.mode === "scan" ? "chat" : b.mode;
      db.ai_messages.push({ id: uuid(), owner_id: ME, vehicle_id: b.vehicleId, mode, role: "user", content: b.message, created_at: now() });
      const reply = b.mode === "scan" ? "[VERDICT:caution]\n**P0171** means the engine is running lean.\n- Check for a vacuum leak\n- Clean the MAF sensor"
        : b.mode === "voice" ? "Your car is mostly fine, but your last scan found a lean fuel mixture. Get it checked this week."
          : "[VERDICT:caution]\nThat squeal is usually the brake wear indicator. Get the pads checked soon.";
      db.ai_messages.push({ id: uuid(), owner_id: ME, vehicle_id: b.vehicleId, mode, role: "assistant", content: reply, created_at: now() });
      return json(route, { reply });
    }
    if (path.includes("/storage/v1/object/")) return json(route, { Key: "x" });
    if (path.endsWith("/rest/v1/rpc/contact_seller")) { const c = { id: uuid(), listing_id: JSON.parse(req.postData()).p_listing, buyer_id: ME, seller_id: SELLER, last_message_at: now(), created_at: now() }; db.conversations.push(c); return json(route, c.id); }
    const table = path.replace("/rest/v1/", "");
    if (!db[table]) return json(route, []);
    const filters = [...u.searchParams.entries()].filter(([k, v]) => !["select", "order", "limit", "offset", "or", "on_conflict", "columns"].includes(k) && /^(eq|neq|is)\./.test(v));
    const match = (row) => filters.every(([k, v]) => { const [op, ...rest] = v.split("."); const val = rest.join("."); return op === "eq" ? String(row[k]) === val : op === "neq" ? String(row[k]) !== val : op === "is" ? row[k] == null : true; });
    const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
    if (m === "GET" || m === "HEAD") { const rows = db[table].filter(match); return json(route, single ? rows[0] || null : rows); }
    if (m === "POST") {
      const body = JSON.parse(req.postData() || "[]");
      const rows = (Array.isArray(body) ? body : [body]).map((r) => ({ id: uuid(), created_at: now(), ended_at: now(), ...r }));
      db[table].push(...rows);
      return json(route, single ? rows[0] : rows, 201);
    }
    if (m === "PATCH") { const patch = JSON.parse(req.postData() || "{}"); const hit = db[table].filter(match); hit.forEach((r) => Object.assign(r, patch)); return json(route, single ? hit[0] : hit); }
    if (m === "DELETE") { db[table] = db[table].filter((r) => !match(r)); return json(route, []); }
    return json(route, []);
  });
  await p.route(/overpass/, (route) => { calls.push("overpass"); return json(route, { elements: [
    { type: "node", id: 1, lat: 6.5262, lon: 3.3801, tags: { shop: "car_repair", name: "Lagos Auto Repair", phone: "+234 801 234 5678", opening_hours: "24/7", "addr:street": "Allen Avenue" } },
    { type: "node", id: 2, lat: 6.5301, lon: 3.3712, tags: { shop: "tyres", name: "Ikeja Tyres", opening_hours: "Mo-Sa 08:00-18:00" } },
    { type: "way", id: 3, center: { lat: 6.5198, lon: 3.3851 }, tags: { amenity: "car_wash", name: "Shine Car Wash" } },
  ] }); });
  await p.route(/tile\.openstreetmap\.org/, (route) => { calls.push("tile"); return route.fulfill({ status: 204, body: "" }); });
  await p.route(/vpic\.nhtsa/, (route) => json(route, { Results: [{ Make: "TOYOTA", Model: "Corolla", ModelYear: "2014", Trim: "LE", FuelTypePrimary: "Gasoline" }] }));
  await p.route(/api\.nhtsa\.gov\/recalls/, (route) => json(route, { results: [{ NHTSACampaignNumber: "19V182000", Component: "AIR BAGS", Summary: "The airbag inflator may rupture.", Remedy: "Dealers will replace the inflator, free of charge.", ReportReceivedDate: "01/03/2019" }] }));
  await p.route(/nominatim/, (route) => json(route, [{ lat: "6.6018", lon: "3.3515", display_name: "Ikeja, Lagos" }]));
  await p.route(/router\.project-osrm/, (route) => json(route, { routes: [{ distance: 12400, duration: 1500, geometry: { coordinates: [[3.3792, 6.5244], [3.37, 6.56], [3.3515, 6.6018]] } }] }));
  await p.route(/api\.jamendo\.com/, (route) => { calls.push("jamendo"); return json(route, { results: [
    { id: 101, name: "Lagos Drive", artist_name: "Test Band", album_image: "", audio: "data:audio/mp3;base64,", duration: 180 },
    { id: 102, name: "Night Road", artist_name: "Other Band", album_image: "", audio: "data:audio/mp3;base64,", duration: 200 },
  ] }); });
}

(async () => {
  const b = await chromium.launch();
  const out = {};
  const errs = [];
  const db = {
    profiles: [{ id: ME, name: "Ada Obi", country: "", currency: "USD", distance_unit: "km", city: "", phone: "", created_at: "2026-03-02T10:00:00Z" }],
    vehicles: [], service_records: [], reminders: [], scans: [], ai_messages: [], conversations: [], messages: [], vehicle_documents: [], trips: [], fuel_logs: [], listing_reports: [], user_blocks: [],
    listings: [{ id: uuid(), seller_id: SELLER, kind: "part", category: "Brakes", title: "Corolla front brake pads", description: "Brand new, still boxed.", price: 25000, currency: "NGN", condition: "new", country: "NG", city: "Lagos", fits_make: "Toyota", fits_model: "Corolla", fits_year_from: 2014, fits_year_to: 2018, photos: [], status: "active", created_at: now(), seller: { id: SELLER, name: "Tunde", city: "Lagos", country: "NG" } }],
  };
  const calls = [];
  const STORE = process.env.STORE_SHOTS;
  const ctx = await b.newContext({ viewport: STORE ? { width: 412, height: 732 } : { width: 390, height: 844 }, deviceScaleFactor: STORE ? 2.625 : 2, acceptDownloads: true, geolocation: HERE, permissions: ["geolocation"] });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await fakes(p, db, calls);
  await p.addInitScript((ME) => {
    localStorage.setItem("sb-qsnooitnvlziladyywho-auth-token", JSON.stringify({ access_token: "x.y.z", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: ME, email: "ada@example.com", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: { name: "Ada Obi" } } }));
    if (window.speechSynthesis) window.speechSynthesis.speak = () => {}; // keep the test quiet and quick
  }, ME);
  const body = async () => (await p.locator("body").innerText()).toLowerCase();
  const wait = (ms = 450) => p.waitForTimeout(ms);
  const nav = (name) => p.getByRole("navigation", { name: "Main" }).getByRole("button", { name, exact: true }).click();
  const dialog = () => p.getByRole("dialog");
  const shot = (n) => p.screenshot({ path: STORE ? `${STORE}/${n}.png` : `${S}/motiq-${n}.png` });

  let t = "";
  // 1) First run: country sets currency and distance.
  await p.goto("http://localhost:4322/", { waitUntil: "domcontentloaded" }); await wait(1500);
  out.welcome = (await body()).includes("welcome to motiq");
  await p.getByLabel("Country").selectOption("NG"); await wait(200);
  out.nairaDefault = (await p.getByLabel("Currency").inputValue()) === "NGN";
  await p.getByLabel("City (for the market)").fill("Lagos");
  await p.getByRole("button", { name: "Continue" }).click(); await wait(900);
  out.profileSaved = db.profiles[0].country === "NG" && db.profiles[0].currency === "NGN";
  out.greetsByName = (await body()).includes("welcome, ada");

  // 2) Add a car from the empty Home.
  await p.getByRole("button", { name: "Add your car" }).click(); await wait();
  await dialog().getByLabel("VIN", { exact: true }).fill("2T1BURHE0EC123456");
  await dialog().getByRole("button", { name: "Look up VIN" }).click(); await wait(700);
  out.vinLookup = (await dialog().getByLabel("Make").inputValue()) === "Toyota" && (await dialog().getByLabel("Model").inputValue()) === "Corolla" && (await dialog().getByLabel("Year").inputValue()) === "2014";
  await dialog().getByLabel("Odometer (km)").fill("85000");
  await dialog().getByRole("button", { name: "Add car" }).click(); await wait(1000);
  t = await body();
  out.carAdded = db.vehicles.length === 1 && db.vehicles[0].vin === "2T1BURHE0EC123456" && t.includes("hi, ada") && t.includes("2014 toyota corolla");
  out.healthShown = t.includes("vehicle health") && t.includes("100%");
  await shot("home");

  // 3) Garage: log a service with a cost, add a reminder from a template.
  await nav("Garage"); await wait(700);
  await p.getByRole("button", { name: "Log service" }).click(); await wait();
  await dialog().getByRole("button", { name: "Brakes", exact: true }).click();
  await dialog().getByLabel("Cost (NGN)").fill("18000");
  await dialog().getByRole("button", { name: "Save" }).click(); await wait(900);
  out.service = db.service_records.length === 1 && db.service_records[0].kind === "brakes" && (await body()).includes("18,000");
  await p.getByRole("button", { name: /No reminders yet/ }).click(); await wait();
  await dialog().getByRole("button", { name: "Oil and filter change" }).click();
  await dialog().getByRole("button", { name: "Add reminder" }).click(); await wait(900);
  out.reminder = db.reminders.length === 1 && db.reminders[0].every_months === 6 && (await body()).includes("oil and filter change");
  await shot("garage");
  await p.getByRole("button", { name: "Fuel log" }).click(); await wait();
  for (const [odo, litres, cost] of [["85000", "40", "30000"], ["85500", "35", "26000"]]) {
    await dialog().getByLabel("Odometer (km)").fill(odo); await dialog().getByLabel("Fuel (L)").fill(litres); await dialog().getByLabel("Cost (NGN)").fill(cost);
    await dialog().getByRole("button", { name: "Add fill-up" }).click(); await wait(600);
  }
  t = (await dialog().innerText()).toLowerCase();
  out.fuelLog = db.fuel_logs.length === 2 && t.includes("7.0 l/100 km") && t.includes("₦56,000");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await p.getByRole("button", { name: "Recalls & issues" }).click(); await wait(900);
  t = (await dialog().innerText()).toLowerCase();
  out.recalls = t.includes("air bags") && t.includes("free of charge") && t.includes("known problems for this model");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  const dl = p.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await p.getByRole("button", { name: /Share car history/ }).click();
  const file = await dl;
  out.historyPdf = !!file && /history\.pdf$/.test(file.suggestedFilename());

  // 4) Scan: demo with problems, explained with a verdict.
  await p.getByRole("button", { name: "Scan", exact: true }).click(); await wait(600);
  await p.getByRole("button", { name: /Car with problems/ }).click(); await wait(1000);
  t = await body();
  out.scanCodes = db.scans.length === 1 && t.includes("p0171") && t.includes("p0420") && t.includes("engine running too lean");
  await p.getByRole("button", { name: "Explain this scan" }).click(); await wait(1200);
  t = await body();
  out.scanExplained = t.includes("vacuum leak") && t.includes("drive with caution") && !t.includes("[verdict");
  await shot("scan");
  await p.getByRole("button", { name: "Back" }).click(); await wait(600);
  t = await body();
  out.homeShowsCodes = t.includes("2 fault codes from your last scan") && !t.includes("100%");

  // 5) AI Diagnostics: a question gets a verdict badge.
  await p.getByRole("button", { name: "AI", exact: true }).click(); await wait(900);
  out.aiRemembers = (await body()).includes("vacuum leak"); // the scan explanation is part of this car's chat
  await p.getByLabel("Describe the symptom").fill("My car squeals when I brake");
  await p.getByRole("button", { name: "Send", exact: true }).click(); await wait(1200);
  t = await body();
  out.askReply = t.includes("brake wear indicator") && (t.match(/drive with caution/g) || []).length >= 2;
  await shot("ai");

  // 6) Nearby: real places around you, with directions.
  await nav("Nearby"); await wait(1500);
  t = await body();
  out.realMap = calls.includes("tile") && (await p.locator(".leaflet-interactive").count()) >= 4;
  out.placesListed = calls.includes("overpass") && t.includes("lagos auto repair") && t.includes("ikeja tyres") && t.includes("3 nearby");
  await shot("nearby");
  await p.getByRole("button", { name: /Lagos Auto Repair/ }).first().click(); await wait();
  t = await (dialog().innerText());
  out.placeSheet = /open now/i.test(t) && /allen avenue/i.test(t) && (await dialog().getByRole("button", { name: "Directions" }).count()) === 1 && (await dialog().getByRole("link", { name: /Call/ }).count()) === 1;
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await p.getByRole("button", { name: "Tyres", exact: true }).click(); await wait(300);
  t = await body();
  out.placeFilter = t.includes("ikeja tyres") && !t.includes("lagos auto repair");

  // 7) Market: message a seller, post a listing.
  await p.getByRole("tab", { name: "Market" }).click(); await wait(900);
  out.marketList = (await body()).includes("corolla front brake pads");
  await p.getByRole("button", { name: "Corolla front brake pads" }).click(); await wait();
  await dialog().getByRole("button", { name: "Report" }).click(); await wait();
  await dialog().getByRole("button", { name: "Looks like a scam" }).click();
  await dialog().getByRole("button", { name: "Send report" }).click(); await wait(700);
  out.reported = db.listing_reports.length === 1 && db.listing_reports[0].reason === "scam";
  await p.getByRole("button", { name: "Corolla front brake pads" }).click(); await wait();
  await dialog().getByRole("button", { name: "Message the seller" }).click(); await wait(800);
  await p.getByLabel("Message", { exact: true }).fill("Is this still available?");
  await p.getByRole("button", { name: "Send message" }).click(); await wait(800);
  out.messaged = db.conversations.length === 1 && db.messages.length === 1 && (await body()).includes("is this still available?");
  await p.getByRole("button", { name: "Back" }).click(); await wait(600);
  await p.getByRole("button", { name: "Sell something" }).first().click(); await wait();
  await dialog().getByLabel("Title").fill("Corolla headlight, left side");
  await dialog().getByLabel("Price (leave empty to ask)").fill("40000");
  await dialog().getByRole("button", { name: "Post listing" }).click(); await wait(900);
  out.posted = db.listings.length === 2 && db.listings[1].currency === "NGN" && db.listings[1].fits_make === "Toyota" && (await body()).includes("corolla headlight");

  // 8) Profile: real name and stats; save a document.
  await nav("Profile"); await wait(700);
  t = await body();
  out.profile = t.includes("ada obi") && t.includes("ada@example.com") && t.includes("scans run");
  await p.getByRole("button", { name: "Documents & warranty" }).click(); await wait();
  await dialog().getByRole("button", { name: "Add document" }).click(); await wait(300);
  await dialog().getByRole("button", { name: /Insurance/ }).click();
  await dialog().getByLabel("Expires on").fill(new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10));
  await dialog().getByRole("button", { name: "Save" }).click(); await wait(800);
  t = await dialog().innerText();
  out.document = db.vehicle_documents.length === 1 && /expires in (9|10|11) days/i.test(t);
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);

  // 9) Home bell lists real alerts (codes, document expiring).
  await nav("Home"); await wait(600);
  await p.getByRole("button", { name: /^Notifications/ }).click(); await wait();
  t = (await dialog().innerText()).toLowerCase();
  out.notifications = t.includes("2 fault codes") && t.includes("insurance expires soon");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);

  // 10) Car Mode Radio and the voice co-pilot.
  await p.getByRole("button", { name: /Car Mode Radio/ }).click(); await wait(1000);
  out.music = calls.includes("jamendo") && (await body()).includes("lagos drive");
  await shot("radio");
  await p.getByRole("button", { name: /Open Car Mode/ }).click(); await wait(900);
  t = await body();
  out.carModeGreeting = t.includes("car mode") && t.includes("fault code");
  out.carModeDark = (await p.getByRole("dialog", { name: "Car Mode" }).evaluate((el) => getComputedStyle(el).backgroundColor)) === "rgb(10, 10, 10)";
  await p.getByRole("button", { name: "How's my car?" }).click(); await wait(1500);
  out.carModeAnswer = (await body()).includes("lean fuel mixture");
  await shot("carmode");
  await p.getByRole("button", { name: "Leave Car Mode" }).click(); await wait(500);
  out.leftCarMode = (await body()).includes("car mode radio");

  // 11) Trip: a real route to a typed destination.
  await p.getByRole("button", { name: "Back" }).click(); await wait(500);
  await p.getByRole("button", { name: /Start a trip/ }).click(); await wait(500);
  await p.getByLabel("Destination").fill("Ikeja");
  await p.getByRole("button", { name: "Start trip" }).click(); await wait(1500);
  t = await body();
  out.tripStarted = t.includes("real route") && t.includes("12.4") && t.includes("km to go");
  await shot("trip");
  await p.getByRole("button", { name: "End trip" }).click(); await wait(400);

  // 12) Light mode.
  await nav("Profile"); await wait(500);
  await p.getByRole("button", { name: "Appearance" }).click(); await wait();
  await dialog().getByRole("button", { name: "Light" }).click(); await wait(300);
  await dialog().getByRole("button", { name: "Close" }).click(); await nav("Home"); await wait(500);
  out.lightMode = (await p.evaluate(() => getComputedStyle(document.querySelector("#root > div")).backgroundColor)) === "rgb(224, 224, 224)";
  await shot("home-light");

  // 13) No signal: the saved garage stays, with a banner.
  await ctx.setOffline(true); await wait(400);
  t = await body();
  out.offlineBanner = t.includes("you're offline") && t.includes("2014 toyota corolla");
  await ctx.setOffline(false);

  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.log("FAILED", e.message.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
