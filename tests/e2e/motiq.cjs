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
    if (path.endsWith("/functions/v1/paystack-init")) { // pretend the payment went through and Paystack sent the driver back
      Object.assign(db.profiles[0], { plan: "pro", pro_until: new Date(Date.now() + 365 * 86400000).toISOString() });
      return json(route, { url: "http://localhost:4322/?pro=done", reference: "mq_test", amount: 25000, currency: "NGN" });
    }
    if (path.endsWith("/rest/v1/rpc/my_referral_code")) return json(route, "K7M2QX");
    if (path.endsWith("/rest/v1/rpc/vote_road_alert")) return json(route, null);
    if (path.endsWith("/rest/v1/rpc/job_price_stats")) { calls.push("price-stats " + req.postData()); return json(route, { count: 5, low: 30000, median: 40000, high: 50000 }); }
    if (path.endsWith("/rest/v1/rpc/admin_stats")) return json(route, { users: 1234, new_users_7d: 56, pro: 7, cars: 1500, scans_7d: 89, ai_today: 40, listings_active: 300, listings_hidden: 2, reports_7d: db.listing_reports.length, quotes_open: db.quote_requests.length, errors_24h: 0 });
    if (path.endsWith("/rest/v1/rpc/redeem_vehicle_invite")) {
      const v = { id: uuid(), owner_id: SELLER, make: "Honda", model: "Civic", year: 2017, nickname: "Mum's Civic", odometer: 64000, fuel: "petrol", transmission: "automatic", health: 100, created_at: now() };
      db.vehicles.push(v); return json(route, v.id);
    }
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
  await p.route(/api\.open-meteo\.com/, (route) => { calls.push("weather"); return json(route, { current: { temperature_2m: 27.4, weather_code: 61 }, daily: { precipitation_probability_max: [80], temperature_2m_max: [30], temperature_2m_min: [24] } }); });
  await p.route(/overpass/, (route) => {
    const q = decodeURIComponent(route.request().postData() || "");
    if (/fuel/.test(q) && !/car_repair/.test(q)) return json(route, { elements: [
      { type: "node", id: 91, lat: 6.5270, lon: 3.3810, tags: { amenity: "fuel", name: "Total Allen" } },
      { type: "node", id: 92, lat: 6.5310, lon: 3.3740, tags: { amenity: "fuel", name: "Mobil Ikeja" } },
    ] });
    calls.push("overpass"); return json(route, { elements: [
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
    profiles: [{ id: ME, name: "Ada Obi", country: "", currency: "USD", distance_unit: "km", city: "", phone: "", plan: "free", is_admin: true, language: "en", created_at: "2026-03-02T10:00:00Z" }],
    vehicles: [], service_records: [], reminders: [], scans: [], ai_messages: [], conversations: [], messages: [], vehicle_documents: [], trips: [], fuel_logs: [], listing_reports: [], user_blocks: [], vehicle_invites: [], vehicle_members: [], fuel_prices: [], road_alerts: [], driver_earnings: [], referrals: [], quote_requests: [], quote_offers: [], client_errors: [], payments: [],
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
  // History PDF is a Pro feature: free drivers get the upgrade sheet; paying brings them back as Pro.
  await p.getByRole("button", { name: /Share car history/ }).click(); await wait();
  t = (await dialog().innerText()).toLowerCase();
  out.proGate = t.includes("motiq pro") && t.includes("₦25,000") && t.includes("paystack");
  await dialog().getByRole("button", { name: "Get Motiq Pro" }).click(); await wait(2500);
  out.proActive = db.profiles[0].plan === "pro" && (await body()).includes("welcome to motiq pro") && !/pro=done/.test(p.url());
  await nav("Garage"); await wait(700);
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

  // 7b) Mechanic quotes: ask, get a price back, accept and chat.
  await p.getByRole("button", { name: "Get quotes", exact: true }).first().click(); await wait(600);
  await p.getByRole("button", { name: "Get quotes", exact: true }).last().click(); await wait();
  await dialog().getByLabel("What needs doing?").fill("Front brake pads and discs replaced, squeaking when I stop.");
  await dialog().getByRole("button", { name: "Ask for quotes" }).click(); await wait(900);
  out.quoteAsked = db.quote_requests.length === 1 && db.quote_requests[0].country === "NG" && /corolla/i.test(db.quote_requests[0].car);
  const offer = { id: uuid(), request_id: db.quote_requests[0].id, provider_id: SELLER, listing_id: db.listings[0].id, price: 45000, currency: "NGN", message: "Pads and discs, done in 2 hours.", status: "sent", provider: { name: "Tunde", city: "Lagos" } };
  db.quote_offers.push(offer); Object.assign(db.quote_requests[0], { status: "open", offers: [offer] }); // status: the database default
  await p.getByRole("button", { name: "My listings" }).click(); await wait(400);
  await p.getByRole("button", { name: "Get quotes", exact: true }).first().click(); await wait(800);
  t = await body();
  out.quoteOffer = t.includes("tunde") && t.includes("₦45,000") && t.includes("done in 2 hours");
  await shot("quotes");
  await p.getByRole("button", { name: /Accept & message/ }).click(); await wait(1000);
  out.quoteAccepted = db.quote_offers[0].status === "accepted" && db.quote_requests[0].status === "accepted" && db.conversations.length === 2 && (await body()).includes("tunde");
  await p.getByRole("button", { name: "Back" }).click(); await wait(500);

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

  // 8b) Costs & expenses: services and fill-ups added up, with a spreadsheet.
  await p.getByRole("button", { name: "Costs & expenses" }).click(); await wait(500);
  t = (await dialog().innerText()).toLowerCase();
  out.expenses = t.includes("₦74,000") && t.includes("fuel") && t.includes("₦56,000") && t.includes("brakes");
  const csv = p.waitForEvent("download", { timeout: 6000 }).catch(() => null);
  await dialog().getByRole("button", { name: /Export to Excel/ }).click();
  const csvFile = await csv;
  out.expensesCsv = !!csvFile && /motiq-expenses-\d{4}\.csv$/.test(csvFile.suggestedFilename());
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  out.proCard = (await body()).includes("active until");

  // 8c) Language: French menus, saved to the profile; then back to English.
  await p.getByRole("button", { name: "Language" }).click(); await wait(300);
  await dialog().getByRole("button", { name: "Français" }).click(); await wait(700);
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  t = await body();
  out.french = db.profiles[0].language === "fr" && t.includes("se déconnecter") && t.includes("langue") && t.includes("dépenses") && (await p.evaluate(() => document.documentElement.lang)) === "fr";
  await p.getByRole("button", { name: "Langue" }).click(); await wait(300);
  await dialog().getByRole("button", { name: "English" }).click(); await wait(700);
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  out.english = db.profiles[0].language === "en" && (await body()).includes("language");

  // 8d) Admin: stats and reported listings.
  db.listing_reports.forEach((r) => { const l = db.listings.find((x) => x.id === r.listing_id); r.listing = l && { id: l.id, title: l.title, status: l.status, seller_id: l.seller_id }; });
  await p.getByRole("button", { name: "Admin" }).click(); await wait(900);
  t = await body();
  out.admin = t.includes("1,234") && t.includes("corolla front brake pads");
  await p.getByRole("button", { name: "Back" }).click(); await wait(400);

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

  // 12b) Shared cars: make an invite code; join someone else's car.
  await nav("Garage"); await wait(600);
  await p.getByRole("button", { name: "Share this car" }).click(); await wait(400);
  await dialog().getByRole("button", { name: "Make an invite code" }).click(); await wait(700);
  const code = (await dialog().getByLabel("Invite code").innerText()).trim();
  out.inviteMade = db.vehicle_invites.length === 1 && db.vehicle_invites[0].code === code && /^[A-Z0-9]{8}$/.test(code);
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await p.getByRole("button", { name: "Join a shared car" }).click(); await wait(300);
  await dialog().getByLabel("Invite code").fill("abcd2345");
  await dialog().getByRole("button", { name: "Join car" }).click(); await wait(1200);
  await p.getByRole("button", { name: /Mum's Civic/ }).first().click(); await wait(500);
  t = await body();
  out.joinedCar = db.vehicles.length === 2 && t.includes("mum's civic") && t.includes("shared") && t.includes("leave this shared car");

  // 14) Everyday tools.
  await nav("Home"); await wait(600);
  await p.getByRole("button", { name: "Show today's weather" }).click(); await wait(1200);
  t = await body();
  out.todayWeather = calls.includes("weather") && t.includes("rain likely") && t.includes("80% rain") && t.includes("today's check");
  // Fuel prices: report one, then see the cheapest and the saving.
  db.fuel_prices.push({ id: "fp-1", reporter_id: SELLER, station_key: "92", station_name: "Mobil Ikeja", lat: 6.531, lon: 3.374, country: "NG", fuel: "petrol", price: 950, currency: "NGN", created_at: now() });
  await p.getByRole("button", { name: "Fuel prices", exact: true }).click(); await wait(1200);
  await dialog().getByRole("button", { name: /Total Allen/ }).click(); await wait(200);
  await dialog().getByLabel("Price per litre (NGN)").fill("990");
  await dialog().getByRole("button", { name: "Share" }).click(); await wait(800);
  t = (await dialog().innerText()).toLowerCase();
  out.fuelReported = db.fuel_prices.length === 2 && db.fuel_prices[1].price === 990 && db.fuel_prices[1].station_name === "Total Allen";
  out.fuelCheapest = t.includes("mobil ikeja") && t.includes("₦950") && t.includes("saves you about");
  await shot("fuel-prices");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  // Road alert.
  await p.getByRole("button", { name: "Road alerts", exact: true }).click(); await wait(900);
  await dialog().getByRole("button", { name: "Report a road problem" }).click(); await wait(300);
  await dialog().getByRole("button", { name: "Pothole" }).click();
  await dialog().getByLabel("Note (optional)").fill("big one after the bridge");
  await dialog().getByRole("button", { name: "Report", exact: true }).click(); await wait(800);
  out.roadAlert = db.road_alerts.length === 1 && db.road_alerts[0].kind === "pothole" && Math.abs(db.road_alerts[0].lat - HERE.latitude) < 0.01;
  // Parking.
  await p.getByRole("button", { name: "My parking", exact: true }).click(); await wait(300);
  out.parkingAuto = (await dialog().innerText()).includes("Walk me to my car"); // saved when the earlier trip ended
  await dialog().getByRole("button", { name: /Update to here/ }).click(); await wait(800);
  await dialog().getByRole("button", { name: "1 hour" }).click(); await wait(300);
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  t = await body();
  out.parking = t.includes("parked just now") && t.includes("meter ends");
  // Fair price.
  await p.getByRole("button", { name: "Fair price?", exact: true }).click(); await wait(300);
  await dialog().getByLabel("What's the job?").fill("replace front brake pads");
  await dialog().getByLabel("Price you were quoted (NGN, optional)").fill("45000");
  await dialog().getByRole("button", { name: "Check the price" }).click(); await wait(700);
  t = (await dialog().innerText()).toLowerCase();
  out.fairPrice = t.includes("fair price") && t.includes("₦30,000") && t.includes("₦50,000") && calls.some((c) => c.includes("brake"));
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  // SOS with an emergency contact.
  await p.getByRole("button", { name: "SOS emergency" }).first().click(); await wait(900);
  t = (await dialog().innerText()).toLowerCase();
  out.sos = t.includes("call emergency (112)") && (await dialog().getByRole("link", { name: /Call emergency/ }).getAttribute("href")) === "tel:112";
  await dialog().getByRole("button", { name: "Add a contact" }).click();
  await dialog().getByLabel("Name").fill("Mum"); await dialog().getByLabel("Phone").fill("+234 803 000 0000");
  await dialog().getByRole("button", { name: "Save contact" }).click(); await wait(700);
  out.sosContact = Array.isArray(db.profiles[0].sos_contacts) && db.profiles[0].sos_contacts[0].name === "Mum" && (await dialog().innerText()).includes("Text my location to Mum");
  await shot("sos");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  // Driving score, work trips and the mileage log (a scored trip from earlier this week).
  db.trips.push({ id: "trip-1", owner_id: ME, vehicle_id: db.vehicles[0].id, origin: "Home", destination: "Office", distance_km: 18.2, duration_sec: 1900, alerts: 1, real_route: true, completed: true, score: 88, hard_brakes: 1, speeding_sec: 0, night: false, purpose: "personal", ended_at: new Date(Date.now() - 3600000).toISOString() });
  await nav("Profile"); await wait(300);
  await p.getByRole("button", { name: /Driver earnings/ }).click(); await wait(300);
  await dialog().getByRole("switch").or(dialog().getByRole("checkbox")).first().click(); await wait(700);
  await dialog().getByLabel("Earned (NGN)").fill("20000"); await dialog().getByLabel("Rides").fill("9");
  await dialog().getByRole("button", { name: "Add earnings" }).click(); await wait(700);
  out.earnings = db.profiles[0].driver_mode === true && db.driver_earnings.length === 1 && Number(db.driver_earnings[0].amount) === 20000;
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await p.getByRole("button", { name: "Invite friends" }).click(); await wait(700);
  out.invite = (await dialog().getByLabel("Your invite code").innerText()).trim() === "K7M2QX";
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await p.reload(); await wait(1800);
  t = await body();
  out.driverToday = t.includes("today's profit") && t.includes("₦20,000");
  out.scoreCard = t.includes("driving score") && t.includes("88");
  await shot("home-daily");
  await p.getByRole("button", { name: /Start a trip|Open live trip/ }).first().click(); await wait(500);
  await p.getByRole("button", { name: "Trip history" }).click(); await wait(500);
  await p.getByRole("button", { name: "Work trip" }).first().click(); await wait(600);
  out.workTrip = db.trips.find((x) => x.id === "trip-1").purpose === "work" && (await body()).includes("score 88");
  const mileage = p.waitForEvent("download", { timeout: 6000 }).catch(() => null);
  await p.getByRole("button", { name: "Export mileage log" }).click();
  const mileageFile = await mileage;
  out.mileageLog = !!mileageFile && /motiq-mileage-all\.csv$/.test(mileageFile.suggestedFilename());
  await p.getByRole("button", { name: "Back" }).click(); await wait(300);
  await nav("Profile"); await wait(400);
  await p.getByRole("button", { name: "Your week" }).click(); await wait(400);
  t = (await dialog().innerText()).toLowerCase();
  out.weekly = t.includes("distance") && t.includes("driving score");
  await dialog().getByRole("button", { name: "Close" }).click(); await wait(300);
  await nav("Garage"); await wait(400);

  // 13) No signal: the saved garage stays, with a banner.
  await ctx.setOffline(true); await wait(400);
  t = await body();
  out.offlineBanner = t.includes("you're offline") && t.includes("2014 toyota corolla");
  await ctx.setOffline(false);

  out.errs = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.log("FAILED", e.message.split("\n").slice(0, 3).join(" | ")); process.exit(1); });
