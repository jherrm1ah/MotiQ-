// Nearby: real places that help with cars (from OpenStreetMap, around where you are) and the
// Motiq market where people sell parts, services and cars.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, MapPin, Clock, Phone, Globe, ChevronRight, Navigation, LocateFixed, Loader2, Store, Plus, MessageCircle, Send, Package, Wrench, Car as CarIcon, Inbox, X, Camera, ArrowLeft, RefreshCw, Flag, Ban } from "lucide-react";
import { t } from "../lib/i18n.js";
import { supabase } from "../lib/supabase.js";
import { useTheme, useUI, RED, AMBER, GREEN, GlowIcon, Pill, Field, PrimaryButton, SecondaryButton, Empty, Card, ScreenHeader, RoundButton, Skeleton, fmtDist, carLabel } from "../design.jsx";
import { PLACE_CATEGORIES, findPlaces } from "../lib/places.js";
import { currentPosition, directionsUrl } from "../lib/geo.js";
import { loadListings, saveListing, setListingStatus, uploadPhoto, listingPhotoUrl, contactSeller, loadInbox, loadMessages, sendMessage, markRead, reportListing, blockUser } from "../lib/data.js";
import { money, countryName, CURRENCIES, dateLabel } from "../lib/units.js";
import { PLACE_ICONS } from "./Home.jsx";
import PlaceMap from "./PlaceMap.jsx";
import QuotesView from "./Quotes.jsx";

const openExternal = (url) => { const w = window.open(url, "_blank", "noopener"); if (!w) window.location.href = url; };

export default function Nearby() {
  const { marketFilter, marketView } = useUI();
  const { TEXT, SUB, CARD, BORDER, FILL, FILL_TEXT } = useTheme();
  const [tab, setTab] = useState(marketView ? "market" : "places");
  return (
    <div className="flex flex-col gap-5 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <div className="flex items-end justify-between gap-3 pt-2">
        <div className="min-w-0">
          <h1 className="font-bold tracking-tight" style={{ fontSize: 20, color: TEXT }}>{tab === "places" ? t("Nearby Help") : t("Market")}</h1>
          <p className="mt-0.5 text-sm" style={{ color: SUB }}>{tab === "places" ? "Find and get directions to help near you" : "Parts, services and cars from people near you"}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 self-start rounded-full p-1" role="tablist" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        {[["places", t("Places")], ["market", t("Market")]].map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className="rounded-full px-4 py-1.5 text-xs font-semibold transition-all" style={{ backgroundColor: tab === k ? FILL : "transparent", color: tab === k ? FILL_TEXT : SUB }}>{l}</button>
        ))}
      </div>
      {tab === "places" ? <Places initialFilter={marketFilter || "All"} /> : <Market initialView={marketView} />}
    </div>
  );
}

// ---- Places
function Places({ initialFilter }) {
  const { unit, openSheet, showToast } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const [filter, setFilter] = useState(PLACE_CATEGORIES.some((c) => c.key === initialFilter) ? initialFilter : "All");
  const [query, setQuery] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [radius, setRadius] = useState(8);
  const [pos, setPos] = useState(null);
  const [places, setPlaces] = useState(null);
  const [status, setStatus] = useState("locating"); // locating | loading | ready | error
  const [error, setError] = useState("");
  const req = useRef(0);

  const locate = async () => {
    setStatus("locating"); setError("");
    try { setPos(await currentPosition()); } catch (e) { setStatus("error"); setError(e.message); }
  };
  useEffect(() => { locate(); }, []);
  useEffect(() => {
    if (!pos) return;
    const id = ++req.current;
    setStatus("loading");
    findPlaces(pos, { radiusKm: radius }).then((list) => { if (req.current === id) { setPlaces(list); setStatus("ready"); } }).catch((e) => { if (req.current === id) { setStatus("error"); setError(e.message); } });
  }, [pos, radius]);

  const shown = useMemo(() => (places || []).filter((p) => (filter === "All" || p.category === filter) && (!openOnly || p.open === true) && (!query.trim() || `${p.name} ${p.category} ${p.address}`.toLowerCase().includes(query.trim().toLowerCase()))), [places, filter, openOnly, query]);

  const openPlace = (p) => openSheet(p.name, <PlaceSheet p={p} here={pos} />);

  return (
    <>
      <div className="flex items-center gap-2 rounded-full px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
        <Search size={15} style={{ color: SUB }} className="shrink-0" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search mechanics, parts, tyres..." aria-label="Search nearby places" className="w-full bg-transparent text-sm focus:outline-none" style={{ color: TEXT }} />
        {query && <button onClick={() => setQuery("")} aria-label="Clear search"><X size={14} style={{ color: SUB }} /></button>}
      </div>

      <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
        {["All", ...PLACE_CATEGORIES.map((c) => c.key)].map((c) => <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>{c}</Pill>)}
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-full p-1" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          {[5, 8, 15, 30].map((r) => (
            <button key={r} onClick={() => setRadius(r)} aria-pressed={radius === r} className="rounded-full px-2.5 py-1.5 font-medium transition-all" style={{ fontSize: 11, backgroundColor: radius === r ? FILL : "transparent", color: radius === r ? FILL_TEXT : SUB }}>{fmtDist(r, unit, 0)}</button>
          ))}
        </div>
        <button onClick={() => setOpenOnly((v) => !v)} aria-pressed={openOnly} className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 transition-all" style={{ backgroundColor: openOnly ? "rgba(61,220,132,0.14)" : CARD, border: `1px solid ${openOnly ? GREEN : BORDER}` }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: openOnly ? GREEN : SUB }} />
          <span className="font-medium" style={{ fontSize: 11, color: openOnly ? GREEN : SUB }}>Open now</span>
        </button>
      </div>

      {status === "locating" || status === "loading" ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="text-xs" style={{ color: SUB }}>{status === "locating" ? "Finding where you are…" : "Looking for places near you…"}</p>
          <div className="skeleton" style={{ height: 250, borderRadius: 22 }} />
          <Skeleton rows={3} height={84} />
        </div>
      ) : status === "error" ? (
        <div className="flex flex-col items-center gap-3 px-6 py-12 text-center" style={{ borderRadius: 24, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <LocateFixed size={20} style={{ color: SUB }} />
          <p className="max-w-[260px] text-sm" style={{ color: TEXT }}>{error}</p>
          <PrimaryButton className="px-5" onClick={() => (pos ? setPos({ ...pos }) : locate())}><RefreshCw size={14} /> Try again</PrimaryButton>
        </div>
      ) : shown.length === 0 ? (
        <Empty icon={Search} title={query ? `Nothing matches "${query}"` : `No ${filter === "All" ? "places" : filter.toLowerCase()} found nearby`} text={radius < 30 ? "Try a wider area, or another category." : "OpenStreetMap may not list places here yet."} action={radius < 30 ? "Search a wider area" : null} onAction={() => setRadius(radius < 15 ? 15 : 30)} />
      ) : (
        <>
          <PlaceMap here={pos} places={shown} colorOf={(p) => (PLACE_ICONS[p.category] || PLACE_ICONS.Mechanics)[1]} onPick={openPlace} />
          <div className="flex flex-col gap-3">
            {shown.slice(0, 60).map((p) => {
              const [icon, glow] = PLACE_ICONS[p.category] || PLACE_ICONS.Mechanics;
              return (
                <button key={p.id} onClick={() => openPlace(p)} className="flex items-center gap-3 p-4 text-left active:scale-[0.98] transition-transform" style={{ borderRadius: 22, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                  <GlowIcon icon={icon} glow={glow} size={19} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" style={{ color: TEXT }}>{p.name}</p>
                    <div className="mt-1 flex items-center gap-2.5 text-xs" style={{ color: SUB }}>
                      <span>{p.category}</span>
                      <span className="flex items-center gap-1"><MapPin size={11} />{fmtDist(p.km, unit)}</span>
                    </div>
                    <p className="mt-1" style={{ fontSize: 11, color: p.open === true ? GREEN : p.open === false ? RED : SUB }}>{p.open === true ? "Open now" : p.open === false ? "Closed now" : p.hours ? "Hours listed" : "Hours not listed"}</p>
                  </div>
                  <ChevronRight size={16} style={{ color: SUB }} />
                </button>
              );
            })}
          </div>
          <p className="text-center" style={{ fontSize: 10, color: SUB }}>Places from OpenStreetMap contributors. Call ahead to check they can help.</p>
        </>
      )}
    </>
  );
}

function PlaceSheet({ p, here }) {
  const { unit } = useUI();
  const { CARD_ALT, TEXT, SUB, BORDER, FILL } = useTheme();
  const [icon, glow] = PLACE_ICONS[p.category] || PLACE_ICONS.Mechanics;
  const etaMin = Math.max(1, Math.round((p.km * 1.3) / 30 * 60)); // ~30 km/h in town
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <GlowIcon icon={icon} glow={glow} size={20} />
        <div className="min-w-0">
          <p className="text-xs" style={{ color: SUB }}>{p.category}{p.brand && p.brand !== p.name ? ` · ${p.brand}` : ""} · {fmtDist(p.km, unit)}</p>
          <p className="mt-0.5 text-xs" style={{ color: p.open === true ? GREEN : p.open === false ? RED : SUB }}>{p.open === true ? "Open now" : p.open === false ? "Closed now" : "Opening hours not confirmed"}</p>
        </div>
      </div>
      <div className="overflow-hidden" style={{ borderRadius: 20, backgroundColor: CARD_ALT }}>
        <svg viewBox="0 0 320 110" className="block w-full" aria-hidden="true">
          <path d="M 28 84 C 100 84, 150 30, 226 24" fill="none" stroke={SUB} strokeWidth="2" strokeDasharray="7 7" strokeLinecap="round" opacity="0.5" />
          <circle cx="28" cy="84" r="8" fill={FILL} /><circle cx="28" cy="84" r="3" fill="white" />
          <circle cx="226" cy="24" r="8" fill={RED} /><circle cx="226" cy="24" r="3" fill="white" />
        </svg>
        <div className="flex items-center justify-between px-4 pb-3.5 pt-1">
          <span className="text-xs" style={{ color: SUB }}>Your location</span>
          <span className="text-xs font-semibold" style={{ color: TEXT }}>{fmtDist(p.km, unit)} straight line · ~{etaMin} min drive</span>
        </div>
      </div>
      <div className="flex flex-col gap-2.5 text-sm" style={{ color: SUB }}>
        {p.address && <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0" />{p.address}</div>}
        {p.hours && <div className="flex items-start gap-2"><Clock size={14} className="mt-0.5 shrink-0" /><span className="break-words">{p.hours}</span></div>}
        {p.phone && <div className="flex items-center gap-2"><Phone size={14} className="shrink-0" />{p.phone}</div>}
        {p.website && <button onClick={() => openExternal(p.website)} className="flex items-center gap-2 text-left underline"><Globe size={14} className="shrink-0" /><span className="truncate">{p.website.replace(/^https?:\/\//, "")}</span></button>}
      </div>
      <div className="mt-1 grid grid-cols-2 gap-3">
        {p.phone ? <a href={`tel:${p.phone.split(/[;,]/)[0].replace(/[^+\d]/g, "")}`} className="flex items-center justify-center gap-2 rounded-2xl py-3 text-sm font-medium active:scale-95 transition-transform" style={{ backgroundColor: CARD_ALT, color: TEXT, border: `1px solid ${BORDER}` }}><Phone size={14} /> Call</a>
          : <SecondaryButton disabled><Phone size={14} /> No phone listed</SecondaryButton>}
        <PrimaryButton onClick={() => openExternal(directionsUrl(p.lat, p.lon))}><Navigation size={14} /> Directions</PrimaryButton>
      </div>
    </div>
  );
}

// ---- Market
const KINDS = [["part", "Parts", Package], ["service", "Services", Wrench], ["car", "Cars", CarIcon]];
const CATEGORIES = {
  part: ["Engine", "Brakes", "Suspension", "Electrical", "Tyres & wheels", "Body", "Interior", "Lights", "Filters & fluids", "Other"],
  service: ["Mechanic", "Auto electrician", "Panel & paint", "Tyres & alignment", "Car wash & detailing", "Towing", "AC repair", "Inspection", "Other"],
  car: ["Sedan", "SUV", "Pickup", "Hatchback", "Van & bus", "Other"],
};

function Market({ initialView }) {
  const { me, vehicle, openSheet, closeSheet, showToast, blocks } = useUI();
  const { CARD, TEXT, SUB, BORDER, FILL, FILL_TEXT } = useTheme();
  const [view, setView] = useState(initialView || "browse"); // browse | quotes | mine | inbox
  const [kind, setKind] = useState("part");
  const [q, setQ] = useState("");
  const [fits, setFits] = useState(false);
  const [list, setList] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [chat, setChat] = useState(null);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => {
    let off = false;
    const t = setTimeout(async () => {
      try {
        if (view === "quotes") return;
        if (view === "inbox") { const x = await loadInbox(me.id); if (!off) setInbox(x.filter((c) => !blocks.includes(c.buyer_id === me.id ? c.seller_id : c.buyer_id))); }
        else { const x = await loadListings(view === "mine" ? { mine: true, uid: me.id } : { kind, q, fitsMake: fits && vehicle ? vehicle.make : "" }); if (!off) setList(x.filter((l) => !blocks.includes(l.seller_id))); }
      } catch (e) { if (!off) { showToast(e.message); setList([]); setInbox([]); } }
    }, q ? 300 : 0);
    return () => { off = true; clearTimeout(t); };
  }, [view, kind, q, fits, version, blocks]);
  useEffect(() => { loadInbox(me.id).then(setInbox).catch(() => {}); }, []);
  const unread = (inbox || []).reduce((n, c) => n + c.unread, 0);

  const newListing = () => openSheet("Sell something", <ListingForm l={{ kind, currency: me.currency, country: me.country, city: me.city, condition: "used", photos: [] }} onSaved={() => { closeSheet(); setView("mine"); bump(); showToast("Listed"); }} />);
  const openListing = (l) => openSheet(l.title, <ListingSheet l={l} onChanged={() => { closeSheet(); bump(); }} onEdit={() => openSheet("Edit listing", <ListingForm l={l} onSaved={() => { closeSheet(); bump(); showToast("Saved"); }} />)}
    onContact={async () => { try { const id = await contactSeller(l.id); closeSheet(); setChat({ id, listing: l, other: l.seller || { name: "Seller" } }); } catch (e) { showToast(e.message); } }} />);

  if (chat) return <ChatThread conv={chat} onBack={() => { setChat(null); bump(); }} />;

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="no-scrollbar flex gap-2 overflow-x-auto">
          {[["browse", "Browse"], ["quotes", t("Get quotes")], ["mine", "My listings"], ["inbox", `Messages${unread ? ` (${unread})` : ""}`]].map(([v, l]) => <Pill key={v} small active={view === v} onClick={() => setView(v)}>{l}</Pill>)}
        </div>
        <RoundButton icon={Plus} label="Sell something" fill onClick={newListing} />
      </div>

      {view === "browse" && (
        <>
          <div className="flex gap-2">{KINDS.map(([v, l, Icon]) => <Pill key={v} active={kind === v} onClick={() => setKind(v)}><span className="flex items-center gap-1.5"><Icon size={13} />{l}</span></Pill>)}</div>
          <div className="flex items-center gap-2 rounded-full px-4 py-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
            <Search size={15} style={{ color: SUB }} className="shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the market" placeholder={kind === "service" ? "Mechanic, towing, car wash…" : kind === "car" ? "Corolla, Camry, Hilux…" : "Brake pads, battery, headlight…"} className="w-full bg-transparent text-sm focus:outline-none" style={{ color: TEXT }} />
          </div>
          {vehicle && kind === "part" && (
            <button onClick={() => setFits((f) => !f)} aria-pressed={fits} className="flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: fits ? "rgba(61,220,132,0.14)" : CARD, border: `1px solid ${fits ? GREEN : BORDER}`, color: fits ? GREEN : SUB }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: fits ? GREEN : SUB }} /> Fits my {vehicle.make}
            </button>
          )}
        </>
      )}

      {view === "quotes" ? <QuotesView onChat={setChat} /> : view === "inbox" ? (
        !inbox ? <Loading /> : inbox.length === 0 ? <Empty icon={Inbox} title="No messages yet" text="When you message a seller, or someone asks about your listing, it shows up here." /> : (
          <div className="flex flex-col gap-2.5">
            {inbox.map((c) => (
              <button key={c.id} onClick={() => setChat(c)} className="flex items-center gap-3 p-3 text-left active:scale-[0.98] transition-transform" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                <Thumb photos={c.listing && c.listing.photos} size={48} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" style={{ color: TEXT }}>{c.other.name || "Someone"} <span style={{ color: SUB, fontWeight: 400 }}>· {c.listing ? c.listing.title : "Listing removed"}</span></p>
                  <p className={`mt-0.5 truncate text-xs ${c.unread ? "font-semibold" : ""}`} style={{ color: c.unread ? TEXT : SUB }}>{c.last ? c.last.body : "Say hello"}</p>
                </div>
                {c.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold" style={{ backgroundColor: FILL, color: FILL_TEXT }}>{c.unread}</span>}
              </button>
            ))}
          </div>
        )
      ) : !list ? <Loading /> : list.length === 0 ? (
        <Empty icon={Store} title={view === "mine" ? "You're not selling anything" : "Nothing here yet"} text={view === "mine" ? "List parts you don't need, offer your workshop's services, or sell a car." : q ? "Try a different search." : "Be the first to list something."} action="Sell something" onAction={newListing} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {list.map((l) => (
            <button key={l.id} onClick={() => openListing(l)} aria-label={l.title} className="overflow-hidden text-left active:scale-[0.98] transition-transform" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <Thumb photos={l.photos} kind={l.kind} />
              <div className="p-3">
                <p className="text-sm font-bold" style={{ color: TEXT }}>{l.price != null ? money(l.price, l.currency) : "Ask for price"}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug" style={{ color: TEXT }}>{l.title}</p>
                <p className="mt-1 truncate" style={{ fontSize: 10, color: SUB }}>{[l.city, countryName(l.country)].filter(Boolean).join(", ")}</p>
                {l.status !== "active" && <span className="mt-1 inline-block rounded-full px-2 py-0.5 text-[10px]" style={{ backgroundColor: "rgba(245,185,68,0.15)", color: AMBER }}>{l.status === "sold" ? "Sold" : "Hidden"}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

const Loading = () => <Skeleton rows={3} height={96} radius={20} />;

function Thumb({ photos, kind, size }) {
  const { CARD_ALT, SUB } = useTheme();
  const p = photos && photos[0];
  const Icon = kind === "service" ? Wrench : kind === "car" ? CarIcon : Package;
  const style = size ? { width: size, height: size, borderRadius: 12, flexShrink: 0 } : { width: "100%", aspectRatio: "4 / 3" };
  return p
    ? <img src={listingPhotoUrl(p)} alt="" loading="lazy" decoding="async" style={{ ...style, objectFit: "cover", display: "block", background: CARD_ALT }} />
    : <div style={{ ...style, background: CARD_ALT, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon style={{ color: SUB, opacity: 0.6 }} size={size ? 20 : 28} /></div>;
}

function ListingSheet({ l, onContact, onEdit, onChanged }) {
  const { me, confirm, showToast, openSheet, setBlocks } = useUI();
  const { TEXT, SUB, CARD_ALT } = useTheme();
  const mine = l.seller_id === me.id;
  const [i, setI] = useState(0);
  const fit = [l.fits_make, l.fits_model, l.fits_year_from && `${l.fits_year_from}${l.fits_year_to && l.fits_year_to !== l.fits_year_from ? `–${l.fits_year_to}` : ""}`].filter(Boolean).join(" ");
  const tag = (t, color) => <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: color ? `${color}1F` : CARD_ALT, color: color || SUB }}>{t}</span>;
  return (
    <div className="flex flex-col gap-3">
      {l.photos.length > 0 && (
        <div className="relative">
          <img src={listingPhotoUrl(l.photos[i])} alt={`Photo ${i + 1} of ${l.photos.length}`} onClick={() => setI((i + 1) % l.photos.length)} className="block w-full rounded-2xl object-cover" style={{ maxHeight: 300 }} />
          {l.photos.length > 1 && <span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] text-white">{i + 1} / {l.photos.length} · tap for next</span>}
        </div>
      )}
      <p className="text-2xl font-bold" style={{ color: TEXT }}>{l.price != null ? money(l.price, l.currency) : "Ask for price"}</p>
      <div className="flex flex-wrap gap-1.5">{tag(l.category)}{l.condition !== "na" && tag(l.condition[0].toUpperCase() + l.condition.slice(1))}{fit && tag(`Fits ${fit}`, GREEN)}{l.verified && tag("✓ Verified by Motiq", GREEN)}</div>
      {l.kind === "car" && l.car_since && (
        <div className="rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: "rgba(61,220,132,0.1)", color: TEXT }}>
          <b>Motiq history:</b> on Motiq since {new Date(l.car_since).toLocaleDateString(undefined, { month: "short", year: "numeric" })} ({Math.max(1, Math.round((Date.now() - new Date(l.car_since).getTime()) / (30 * 86400000)))} month{Math.round((Date.now() - new Date(l.car_since).getTime()) / (30 * 86400000)) === 1 ? "" : "s"}) · {l.car_services || 0} service{l.car_services === 1 ? "" : "s"} logged
        </div>
      )}
      {l.description && <p className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: TEXT }}>{l.description}</p>}
      <p className="text-xs" style={{ color: SUB }}>{mine ? "Your listing" : `Sold by ${(l.seller && l.seller.name) || "a Motiq user"}`} · {[l.city, countryName(l.country)].filter(Boolean).join(", ")} · listed {dateLabel(l.created_at)}</p>
      <p className="rounded-xl p-3 text-xs leading-relaxed" style={{ backgroundColor: "rgba(245,185,68,0.12)", color: AMBER }}>Meet in a public place, check the item before you pay, and never send money in advance to someone you don't know.</p>
      {mine ? (
        <div className="grid grid-cols-3 gap-2">
          <SecondaryButton onClick={onEdit}>Edit</SecondaryButton>
          {l.status === "active"
            ? <PrimaryButton onClick={async () => { await setListingStatus(l.id, "sold"); showToast("Marked as sold"); onChanged(); }}>Sold</PrimaryButton>
            : <PrimaryButton onClick={async () => { await setListingStatus(l.id, "active"); showToast("Listed again"); onChanged(); }}>Relist</PrimaryButton>}
          <SecondaryButton color={RED} onClick={() => confirm("Remove this listing?", "People won't see it in the market any more.", "Remove", async () => { await setListingStatus(l.id, "hidden"); onChanged(); })}>Remove</SecondaryButton>
        </div>
      ) : (
        <>
          <PrimaryButton onClick={onContact}><MessageCircle size={16} /> Message the seller</PrimaryButton>
          <div className="flex items-center justify-center gap-5 pt-1">
            <button onClick={() => openSheet("Report this listing", <ReportForm listing={l} />)} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: SUB }}><Flag size={13} /> Report</button>
            <button onClick={() => confirm(`Block ${(l.seller && l.seller.name) || "this seller"}?`, "You won't see their listings, and they can't message you. You can unblock them in Profile → Privacy.", "Block", async () => { try { await blockUser(me.id, l.seller_id); setBlocks((b) => [...b, l.seller_id]); showToast("Blocked"); onChanged(); } catch (e) { showToast(e.message); } })} className="flex items-center gap-1.5 text-xs font-medium" style={{ color: RED }}><Ban size={13} /> Block seller</button>
          </div>
        </>
      )}
    </div>
  );
}

const REASONS = [["scam", "Looks like a scam"], ["fake", "Fake or stolen item"], ["wrong_price", "Misleading price or details"], ["offensive", "Offensive"], ["sold", "Already sold"], ["other", "Something else"]];
function ReportForm({ listing }) {
  const { me, closeSheet, showToast } = useUI();
  const { SUB } = useTheme();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!reason) return showToast("Pick a reason.");
    setBusy(true);
    try { await reportListing(me.id, listing.id, reason, details); closeSheet(); showToast("Thanks — we'll take a look"); }
    catch (err) { showToast(/listing_reports/.test(err.message) ? "Reporting needs one more setup step in the database." : err.message); }
    setBusy(false);
  };
  return (
    <form onSubmit={send} className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed" style={{ color: SUB }}>Listings reported by several people are hidden until they're reviewed. The seller isn't told who reported it.</p>
      <div className="flex flex-wrap gap-2">{REASONS.map(([k, label]) => <Pill key={k} small active={reason === k} onClick={() => setReason(k)}>{label}</Pill>)}</div>
      <Field label="Anything else? (optional)" as="textarea" rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={500} />
      <PrimaryButton type="submit" disabled={busy}>Send report</PrimaryButton>
    </form>
  );
}

export function ListingForm({ l, onSaved }) {
  const { me, uid, vehicle, vehicles, showToast } = useUI();
  const ownCars = vehicles.filter((v) => v.owner_id === uid);
  const readyOn = (v) => new Date(new Date(v.created_at).getTime() + 30 * 86400000);
  const ready = (v) => v.created_at && readyOn(v) <= new Date();
  const pickCar = (v) => setD((x) => ({ ...x, vehicle_id: v.id, title: x.title || [v.year, v.make, v.model, v.trim_level].filter(Boolean).join(" "), fits_make: v.make, fits_model: v.model, fits_year_from: v.year || "" }));
  const { SUB, CARD_ALT, BORDER } = useTheme();
  const [d, setD] = useState({ category: CATEGORIES[l.kind][0], fits_make: l.kind === "part" && vehicle ? vehicle.make : "", fits_model: l.kind === "part" && vehicle ? vehicle.model : "", ...l });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const addPhotos = async (files) => {
    setBusy(true);
    try { const paths = []; for (const f of [...files].slice(0, 8 - d.photos.length)) paths.push(await uploadPhoto("listing-photos", me.id, f)); setD((x) => ({ ...x, photos: [...x.photos, ...paths] })); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  const save = async (e) => {
    e.preventDefault();
    if (!d.title || d.title.trim().length < 3) return showToast("Give it a title.");
    setBusy(true);
    try { await saveListing(me.id, d); onSaved(); } catch (err) { showToast(err.message); }
    setBusy(false);
  };
  const label = (t) => <p className="mb-1.5 text-xs font-medium" style={{ color: SUB }}>{t}</p>;
  return (
    <form onSubmit={save} className="flex flex-col gap-3">
      <div>{label("What are you listing?")}<div className="flex gap-2">{KINDS.map(([v, lab]) => <Pill key={v} small active={d.kind === v} onClick={() => setD({ ...d, kind: v, category: CATEGORIES[v][0] })}>{lab.replace(/s$/, "")}</Pill>)}</div></div>
      <div>{label("Photos")}
        <div className="flex flex-wrap gap-2">
          {d.photos.map((p) => (
            <div key={p} className="relative"><img src={listingPhotoUrl(p)} alt="" className="h-16 w-16 rounded-xl object-cover" />
              <button type="button" aria-label="Remove photo" onClick={() => setD({ ...d, photos: d.photos.filter((x) => x !== p) })} className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70"><X size={11} color="#fff" /></button></div>
          ))}
          {d.photos.length < 8 && <button type="button" onClick={() => fileRef.current.click()} disabled={busy} aria-label="Add photos" className="flex h-16 w-16 items-center justify-center rounded-xl" style={{ border: `1px dashed ${BORDER}`, backgroundColor: CARD_ALT }}>{busy ? <Loader2 size={16} className="animate-spin" style={{ color: SUB }} /> : <Camera size={18} style={{ color: SUB }} />}</button>}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files.length) addPhotos(e.target.files); e.target.value = ""; }} />
        </div>
      </div>
      {d.kind === "car" && !l.id && (
        <div>
          {label("Which car? (from your garage)")}
          {ownCars.length === 0 ? <p className="text-xs" style={{ color: SUB }}>Add the car to your garage first. Cars can be sold on Motiq after 30 days of history.</p> : (
            <div className="flex flex-col gap-2">
              {ownCars.map((v) => (
                <button type="button" key={v.id} disabled={!ready(v)} onClick={() => pickCar(v)} aria-pressed={d.vehicle_id === v.id} className="flex items-center justify-between rounded-2xl px-3 py-2.5 text-left disabled:opacity-60" style={{ backgroundColor: CARD_ALT, border: `1px solid ${d.vehicle_id === v.id ? GREEN : BORDER}` }}>
                  <span className="text-sm" style={{ color: "inherit" }}>{carLabel(v)}</span>
                  <span className="text-[11px]" style={{ color: ready(v) ? GREEN : SUB }}>{ready(v) ? (d.vehicle_id === v.id ? "Selected" : "Ready to sell") : `Can be listed from ${readyOn(v).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`}</span>
                </button>
              ))}
              <p className="text-[11px]" style={{ color: SUB }}>To protect buyers, a car needs at least 30 days of history in Motiq before it can be sold. Buyers see how long it's been on Motiq and how many services are logged.</p>
            </div>
          )}
        </div>
      )}
      <Field label="Title" value={d.title || ""} onChange={set("title")} maxLength={90} placeholder={d.kind === "service" ? "Engine diagnostics and repairs" : d.kind === "car" ? "2014 Toyota Corolla LE" : "Front brake pads, Corolla 2014–2018"} />
      <div>{label("Category")}<div className="flex flex-wrap gap-2">{CATEGORIES[d.kind].map((c) => <Pill key={c} small active={d.category === c} onClick={() => setD({ ...d, category: c })}>{c}</Pill>)}</div></div>
      <div className="grid grid-cols-[1fr_110px] gap-3">
        <Field label="Price (leave empty to ask)" value={d.price ?? ""} onChange={set("price")} inputMode="decimal" />
        <Field label="Currency" as="select" value={d.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Field>
      </div>
      {d.kind !== "service" && <div>{label("Condition")}<div className="flex gap-2">{["new", "used", "refurbished"].map((c) => <Pill key={c} small active={d.condition === c} onClick={() => setD({ ...d, condition: c })}>{c[0].toUpperCase() + c.slice(1)}</Pill>)}</div></div>}
      {d.kind !== "service" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label={d.kind === "car" ? "Make" : "Fits make"} value={d.fits_make || ""} onChange={set("fits_make")} placeholder="Toyota" />
          <Field label={d.kind === "car" ? "Model" : "Fits model"} value={d.fits_model || ""} onChange={set("fits_model")} placeholder="Corolla" />
          <Field label={d.kind === "car" ? "Year" : "From year"} value={d.fits_year_from || ""} onChange={set("fits_year_from")} inputMode="numeric" />
          {d.kind === "part" && <Field label="To year" value={d.fits_year_to || ""} onChange={set("fits_year_to")} inputMode="numeric" />}
        </div>
      )}
      <Field label="City" value={d.city || ""} onChange={set("city")} />
      <Field label="Description" as="textarea" rows={4} value={d.description || ""} onChange={set("description")} maxLength={3000} placeholder="Condition, part number, what's included, opening hours…" />
      <PrimaryButton type="submit" disabled={busy || (d.kind === "car" && !l.id && !d.vehicle_id)}>{busy && <Loader2 size={15} className="animate-spin" />}{l.id ? "Save" : "Post listing"}</PrimaryButton>
    </form>
  );
}

function ChatThread({ conv, onBack }) {
  const { me, showToast } = useUI();
  const { TEXT, SUB, CARD, BORDER, FILL, FILL_TEXT, BG } = useTheme();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const end = useRef(null);
  useEffect(() => {
    let on = true;
    const load = () => loadMessages(conv.id).then((m) => { if (on) { setMsgs(m); markRead(me.id, conv.id); } }).catch(() => {});
    load();
    const ch = supabase.channel(`conv-${conv.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, load).subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
  }, [conv.id]);
  useEffect(() => { end.current && end.current.scrollIntoView({ block: "end" }); }, [msgs]);
  const send = async (e) => {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setText("");
    try { const m = await sendMessage(me.id, conv.id, body); setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); } catch (err) { showToast(err.message); setText(body); }
  };
  return (
    <div className="flex flex-col gap-3" style={{ paddingBottom: 70 }}>
      <ScreenHeader title={conv.other.name || "Chat"} sub={conv.listing ? conv.listing.title : ""} onBack={onBack} />
      {msgs.length === 0 && <p className="py-6 text-center text-sm" style={{ color: SUB }}>Say hello and ask about the item.</p>}
      {msgs.map((m) => {
        const mine = m.sender_id === me.id;
        return (
          <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
            <div className="whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm" style={{ maxWidth: "80%", backgroundColor: mine ? FILL : CARD, color: mine ? FILL_TEXT : TEXT, border: mine ? "none" : `1px solid ${BORDER}` }}>{m.body}</div>
          </div>
        );
      })}
      <div ref={end} />
      <form onSubmit={send} className="fixed inset-x-0 z-10 mx-auto flex max-w-[480px] gap-2 px-5" style={{ bottom: "calc(100px + env(safe-area-inset-bottom, 0px))" }}>
        <input aria-label="Message" value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" className="h-11 min-w-0 flex-1 rounded-full px-4 text-sm focus:outline-none" style={{ backgroundColor: BG, border: `1px solid ${BORDER}`, color: TEXT }} />
        <button type="submit" aria-label="Send message" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: FILL }}><Send size={16} style={{ color: FILL_TEXT }} /></button>
      </form>
    </div>
  );
}
