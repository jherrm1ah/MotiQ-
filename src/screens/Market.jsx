import React, { useEffect, useRef, useState } from "react";
import { Search, Plus, MessageCircle, Store, Camera, X, Send, Wrench, Package, Car as CarIcon, Inbox } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { C, Screen, Card, Button, Chip, Field, input, Sheet, Empty, Badge, toast, iconBtn } from "../ui.jsx";
import { loadListings, saveListing, setListingStatus, uploadPhoto, listingPhotoUrl, contactSeller, loadInbox, loadMessages, sendMessage, markRead } from "../lib/data.js";
import { money, countryName, CURRENCIES, dateLabel } from "../lib/units.js";

const KINDS = [["part", "Parts", Package], ["service", "Services", Wrench], ["car", "Cars", CarIcon]];
const CATEGORIES = {
  part: ["Engine", "Brakes", "Suspension", "Electrical", "Tyres & wheels", "Body", "Interior", "Lights", "Filters & fluids", "Other"],
  service: ["Mechanic", "Auto electrician", "Panel & paint", "Tyres & alignment", "Car wash & detailing", "Towing", "AC repair", "Inspection", "Other"],
  car: ["Sedan", "SUV", "Pickup", "Hatchback", "Van & bus", "Other"],
};

export default function Market({ me, garage, carId }) {
  const car = garage.cars.find((c) => c.id === carId) || garage.cars[0] || null;
  const [kind, setKind] = useState("part");
  const [q, setQ] = useState("");
  const [fits, setFits] = useState(false);
  const [list, setList] = useState(null);
  const [view, setView] = useState("browse"); // browse | mine | inbox
  const [open, setOpen] = useState(null);
  const [editing, setEditing] = useState(null);
  const [chat, setChat] = useState(null);
  const [inbox, setInbox] = useState(null);

  const refresh = async () => {
    try {
      if (view === "inbox") setInbox(await loadInbox(me.id));
      else setList(await loadListings(view === "mine" ? { mine: true, uid: me.id } : { kind, q, fitsMake: fits && car ? car.make : "" }));
    } catch (e) { toast(e.message); setList([]); }
  };
  useEffect(() => { const t = setTimeout(refresh, q ? 300 : 0); return () => clearTimeout(t); }, [kind, q, fits, view]);
  const unread = (inbox || []).reduce((n, c) => n + c.unread, 0);

  if (chat) return <ChatThread me={me} conv={chat} onBack={() => { setChat(null); if (view === "inbox") refresh(); }} />;

  return (
    <Screen title="Market" subtitle="Parts, services and cars near you" right={<button style={iconBtn} aria-label="Sell something" onClick={() => setEditing({ kind, currency: me.currency, country: me.country, city: me.city, condition: "used", photos: [] })}><Plus size={20} /></button>}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {[["browse", "Browse"], ["mine", "My listings"], ["inbox", `Messages${unread ? ` (${unread})` : ""}`]].map(([v, l]) => <Chip key={v} active={view === v} onClick={() => setView(v)}>{l}</Chip>)}
      </div>

      {view === "browse" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {KINDS.map(([v, l, Icon]) => <Chip key={v} active={kind === v} onClick={() => setKind(v)}><Icon size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{l}</Chip>)}
          </div>
          <div style={{ position: "relative", marginBottom: 10 }}>
            <Search size={18} color={C.faint} style={{ position: "absolute", left: 13, top: 15 }} />
            <input aria-label="Search the market" style={{ ...input, paddingLeft: 40 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder={kind === "service" ? "Mechanic, towing, car wash…" : kind === "car" ? "Corolla, Camry, Hilux…" : "Brake pads, battery, headlight…"} />
          </div>
          {car && kind === "part" && <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, color: C.sub, fontSize: 14 }}><input type="checkbox" checked={fits} onChange={(e) => setFits(e.target.checked)} /> Only parts for my {car.make}</label>}
        </>
      )}

      {view === "inbox" ? (
        !inbox ? <p style={{ color: C.sub }}>Loading…</p> : inbox.length === 0 ? <Empty icon={Inbox} title="No messages yet" body="When you message a seller, or someone asks about your listing, it shows up here." /> :
          inbox.map((c) => (
            <Card key={c.id} onClick={() => setChat(c)} style={{ marginBottom: 8, display: "flex", gap: 12, alignItems: "center" }}>
              <Thumb photos={c.listing && c.listing.photos} size={48} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.other.name || "Someone"} · <span style={{ color: C.sub, fontWeight: 600 }}>{c.listing ? c.listing.title : "Listing removed"}</span></p>
                <p style={{ margin: "3px 0 0", color: c.unread ? C.text : C.sub, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: c.unread ? 700 : 400 }}>{c.last ? c.last.body : "Say hello"}</p>
              </div>
              {c.unread > 0 && <Badge>{c.unread}</Badge>}
            </Card>
          ))
      ) : !list ? <p style={{ color: C.sub }}>Loading…</p> : list.length === 0 ? (
        view === "mine"
          ? <Empty icon={Store} title="You're not selling anything" body="List parts you don't need, offer your workshop's services, or sell a car." action="Sell something" onAction={() => setEditing({ kind: "part", currency: me.currency, country: me.country, city: me.city, condition: "used", photos: [] })} />
          : <Empty icon={Store} title="Nothing here yet" body={q ? "Try a different search." : "Be the first to list something."} action="Sell something" onAction={() => setEditing({ kind, currency: me.currency, country: me.country, city: me.city, condition: "used", photos: [] })} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 10 }}>
          {list.map((l) => (
            <Card key={l.id} onClick={() => setOpen(l)} style={{ padding: 0, overflow: "hidden" }} aria-label={l.title}>
              <Thumb photos={l.photos} kind={l.kind} />
              <div style={{ padding: 11 }}>
                <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>{l.price != null ? money(l.price, l.currency) : "Ask for price"}</p>
                <p style={{ margin: "3px 0 0", fontSize: 13.5, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{l.title}</p>
                <p style={{ margin: "5px 0 0", color: C.faint, fontSize: 12 }}>{[l.city, countryName(l.country)].filter(Boolean).join(", ")}</p>
                {l.status !== "active" && <Badge tone="muted">{l.status === "sold" ? "Sold" : "Hidden"}</Badge>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {open && <ListingSheet me={me} l={open} onClose={() => setOpen(null)} onEdit={() => { setEditing(open); setOpen(null); }}
        onChanged={() => { setOpen(null); refresh(); }}
        onContact={async () => { try { const id = await contactSeller(open.id); setChat({ id, listing: open, other: open.seller || { name: "Seller" }, role: "buying" }); setOpen(null); } catch (e) { toast(e.message); } }} />}
      {editing && <ListingForm me={me} car={car} l={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setView("mine"); refresh(); toast("Listed"); }} />}
    </Screen>
  );
}

function Thumb({ photos, kind, size }) {
  const p = photos && photos[0];
  const Icon = kind === "service" ? Wrench : kind === "car" ? CarIcon : Package;
  const style = size ? { width: size, height: size, borderRadius: 12, flexShrink: 0 } : { width: "100%", aspectRatio: "4 / 3" };
  return p
    ? <img src={listingPhotoUrl(p)} alt="" loading="lazy" decoding="async" style={{ ...style, objectFit: "cover", display: "block", background: C.raised }} />
    : <div style={{ ...style, background: C.raised, display: "flex", alignItems: "center", justifyContent: "center" }}><Icon color={C.faint} size={size ? 20 : 30} /></div>;
}

function ListingSheet({ me, l, onClose, onContact, onEdit, onChanged }) {
  const mine = l.seller_id === me.id;
  const [i, setI] = useState(0);
  const fit = [l.fits_make, l.fits_model, l.fits_year_from && `${l.fits_year_from}${l.fits_year_to && l.fits_year_to !== l.fits_year_from ? `–${l.fits_year_to}` : ""}`].filter(Boolean).join(" ");
  return (
    <Sheet title={l.title} onClose={onClose}>
      {l.photos.length > 0 && (
        <div style={{ position: "relative", marginBottom: 12 }}>
          <img src={listingPhotoUrl(l.photos[i])} alt={`Photo ${i + 1} of ${l.photos.length}`} style={{ width: "100%", maxHeight: 320, objectFit: "cover", borderRadius: 14, display: "block" }} onClick={() => setI((i + 1) % l.photos.length)} />
          {l.photos.length > 1 && <Badge tone="muted">{i + 1} / {l.photos.length} · tap for next</Badge>}
        </div>
      )}
      <p style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>{l.price != null ? money(l.price, l.currency) : "Ask for price"}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0 12px" }}>
        <Badge tone="blue">{l.category}</Badge>
        {l.condition !== "na" && <Badge tone="muted">{l.condition[0].toUpperCase() + l.condition.slice(1)}</Badge>}
        {fit && <Badge>Fits {fit}</Badge>}
      </div>
      {l.description && <p style={{ margin: "0 0 12px", whiteSpace: "pre-wrap", lineHeight: 1.55, color: C.text }}>{l.description}</p>}
      <p style={{ margin: "0 0 16px", color: C.sub, fontSize: 13.5 }}>{mine ? "Your listing" : `Sold by ${(l.seller && l.seller.name) || "a Motiq user"}`} · {[l.city, countryName(l.country)].filter(Boolean).join(", ")} · listed {dateLabel(l.created_at)}</p>
      <p style={{ margin: "0 0 14px", padding: 12, borderRadius: 12, background: C.warnSoft, color: C.warn, fontSize: 13, lineHeight: 1.45 }}>Meet in a public place, check the item before you pay, and never send money in advance to someone you don't know.</p>
      {mine ? (
        <div style={{ display: "flex", gap: 8 }}>
          <Button kind="secondary" style={{ flex: 1 }} onClick={onEdit}>Edit</Button>
          {l.status === "active"
            ? <Button style={{ flex: 1 }} onClick={async () => { await setListingStatus(l.id, "sold"); toast("Marked as sold"); onChanged(); }}>Mark as sold</Button>
            : <Button style={{ flex: 1 }} onClick={async () => { await setListingStatus(l.id, "active"); toast("Listed again"); onChanged(); }}>List again</Button>}
          <Button kind="danger" onClick={async () => { if (!window.confirm("Remove this listing?")) return; await setListingStatus(l.id, "hidden"); onChanged(); }}>Remove</Button>
        </div>
      ) : <Button style={{ width: "100%" }} onClick={onContact}><MessageCircle size={18} /> Message the seller</Button>}
    </Sheet>
  );
}

function ListingForm({ me, car, l, onClose, onSaved }) {
  const [d, setD] = useState({ category: CATEGORIES[l.kind][0], fits_make: l.kind === "part" && car ? car.make : "", fits_model: l.kind === "part" && car ? car.model : "", ...l });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  const addPhotos = async (files) => {
    setBusy(true);
    try { const paths = []; for (const f of [...files].slice(0, 8 - d.photos.length)) paths.push(await uploadPhoto("listing-photos", me.id, f)); setD((x) => ({ ...x, photos: [...x.photos, ...paths] })); }
    catch (e) { toast(e.message); }
    setBusy(false);
  };
  return (
    <Sheet title={l.id ? "Edit listing" : "Sell something"} onClose={onClose}>
      <Field label="What are you listing?"><div style={{ display: "flex", gap: 6 }}>{KINDS.map(([v, lab]) => <Chip key={v} active={d.kind === v} onClick={() => setD({ ...d, kind: v, category: CATEGORIES[v][0] })}>{lab.replace(/s$/, "")}</Chip>)}</div></Field>
      <Field label="Photos"><div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {d.photos.map((p) => <div key={p} style={{ position: "relative" }}><img src={listingPhotoUrl(p)} alt="" style={{ width: 70, height: 70, objectFit: "cover", borderRadius: 10 }} /><button aria-label="Remove photo" onClick={() => setD({ ...d, photos: d.photos.filter((x) => x !== p) })} style={{ position: "absolute", top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: "none", background: C.raised, color: C.text, cursor: "pointer" }}><X size={12} /></button></div>)}
        {d.photos.length < 8 && <button type="button" onClick={() => fileRef.current.click()} disabled={busy} style={{ width: 70, height: 70, borderRadius: 10, border: `1px dashed ${C.line}`, background: C.bg, color: C.sub, cursor: "pointer" }} aria-label="Add photos"><Camera size={20} /></button>}
        <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files.length) addPhotos(e.target.files); e.target.value = ""; }} />
      </div></Field>
      <Field label="Title"><input style={input} value={d.title || ""} onChange={set("title")} placeholder={d.kind === "service" ? "Engine diagnostics and repairs" : d.kind === "car" ? "2014 Toyota Corolla LE" : "Front brake pads, Corolla 2014–2018"} maxLength={90} /></Field>
      <Field label="Category"><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{CATEGORIES[d.kind].map((c) => <Chip key={c} active={d.category === c} onClick={() => setD({ ...d, category: c })}>{c}</Chip>)}</div></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 10 }}>
        <Field label="Price (leave empty to ask)"><input style={input} inputMode="decimal" value={d.price ?? ""} onChange={set("price")} /></Field>
        <Field label="Currency"><select style={input} value={d.currency} onChange={set("currency")}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
      </div>
      {d.kind !== "service" && <Field label="Condition"><div style={{ display: "flex", gap: 6 }}>{["new", "used", "refurbished"].map((c) => <Chip key={c} active={d.condition === c} onClick={() => setD({ ...d, condition: c })}>{c[0].toUpperCase() + c.slice(1)}</Chip>)}</div></Field>}
      {d.kind !== "service" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={d.kind === "car" ? "Make" : "Fits make"}><input style={input} value={d.fits_make || ""} onChange={set("fits_make")} placeholder="Toyota" /></Field>
          <Field label={d.kind === "car" ? "Model" : "Fits model"}><input style={input} value={d.fits_model || ""} onChange={set("fits_model")} placeholder="Corolla" /></Field>
          <Field label={d.kind === "car" ? "Year" : "From year"}><input style={input} inputMode="numeric" value={d.fits_year_from || ""} onChange={set("fits_year_from")} /></Field>
          {d.kind === "part" && <Field label="To year"><input style={input} inputMode="numeric" value={d.fits_year_to || ""} onChange={set("fits_year_to")} /></Field>}
        </div>
      )}
      <Field label="City"><input style={input} value={d.city || ""} onChange={set("city")} /></Field>
      <Field label="Description"><textarea style={{ ...input, minHeight: 90 }} value={d.description || ""} onChange={set("description")} maxLength={3000} placeholder="Condition, part number, what's included, opening hours…" /></Field>
      <Button style={{ width: "100%" }} disabled={busy} onClick={async () => {
        if (!d.title || d.title.trim().length < 3) return toast("Give it a title.");
        setBusy(true);
        try { await saveListing(me.id, d); onSaved(); } catch (e) { toast(e.message); }
        setBusy(false);
      }}>{busy ? "Please wait…" : l.id ? "Save" : "Post listing"}</Button>
    </Sheet>
  );
}

function ChatThread({ me, conv, onBack }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const end = useRef(null);
  useEffect(() => {
    let on = true;
    const load = () => loadMessages(conv.id).then((m) => { if (on) { setMsgs(m); markRead(me.id, conv.id); } });
    load();
    const ch = supabase.channel(`conv-${conv.id}`).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conv.id}` }, load).subscribe();
    return () => { on = false; supabase.removeChannel(ch); };
  }, [conv.id]);
  useEffect(() => { end.current && end.current.scrollIntoView({ block: "end" }); }, [msgs]);
  const send = async () => {
    const body = text.trim(); if (!body) return;
    setText("");
    try { const m = await sendMessage(me.id, conv.id, body); setMsgs((x) => (x.some((y) => y.id === m.id) ? x : [...x, m])); } catch (e) { toast(e.message); setText(body); }
  };
  return (
    <Screen title={conv.other.name || "Chat"} subtitle={conv.listing ? conv.listing.title : ""} onBack={onBack}>
      <div style={{ paddingBottom: 90 }}>
        {msgs.length === 0 && <p style={{ color: C.sub, textAlign: "center" }}>Say hello and ask about the item.</p>}
        {msgs.map((m) => (
          <div key={m.id} style={{ display: "flex", justifyContent: m.sender_id === me.id ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div style={{ maxWidth: "80%", padding: "10px 13px", borderRadius: 16, background: m.sender_id === me.id ? C.accent : C.surface, color: m.sender_id === me.id ? C.accentInk : C.text, border: m.sender_id === me.id ? "none" : `1px solid ${C.line}`, whiteSpace: "pre-wrap", fontSize: 15 }}>{m.body}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ position: "fixed", left: 0, right: 0, bottom: "calc(env(safe-area-inset-bottom, 0px) + 70px)", padding: "8px 12px", background: C.bg, display: "flex", gap: 8, maxWidth: 560, margin: "0 auto" }}>
        <input aria-label="Message" style={{ ...input, flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" />
        <button type="submit" aria-label="Send message" style={{ width: 48, borderRadius: 14, border: "none", background: C.accent, color: C.accentInk, cursor: "pointer" }}><Send size={18} /></button>
      </form>
    </Screen>
  );
}
