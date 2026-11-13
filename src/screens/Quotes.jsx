// Mechanic quotes: a driver describes a job, workshops and mechanics in the same country send a
// price, the driver accepts one and chats with them. Providers see "Jobs near you".
import React, { useEffect, useState } from "react";
import { Wrench, Loader2, Check, MessageCircle, Send, ClipboardList, X } from "lucide-react";
import { useTheme, useUI, GREEN, AMBER, Field, Pill, PrimaryButton, SecondaryButton, Empty, Skeleton, carFull, timeAgo } from "../design.jsx";
import { loadMyQuoteRequests, loadOpenJobs, requestQuote, closeQuoteRequest, sendOffer, acceptOffer, myServiceListing, contactSeller } from "../lib/data.js";
import { money } from "../lib/units.js";
import { FairPriceSheet } from "./Daily.jsx";
import { Scale, Star, BadgeCheck, CalendarDays, ShieldCheck } from "lucide-react";
import { mechanicRating, reviewMechanic, loadMyReviews, loadBookings, requestBooking, setBookingStatus, loadJobPayments, payMechanic, releaseJobPayment, loadPrivate, savePrivate } from "../lib/data.js";

export function QuoteRequestForm({ onDone }) {
  const { me, uid, vehicle, showToast } = useUI();
  const { SUB } = useTheme();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (text.trim().length < 10) return showToast("Describe the job in a few more words.");
    setBusy(true);
    try { await requestQuote(uid, { vehicle_id: vehicle && vehicle.id, car: vehicle ? carFull(vehicle) : "", description: text, country: me.country, city: me.city }); showToast("Sent — mechanics near you can now quote"); onDone && onDone(); }
    catch (e) { showToast(e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      {vehicle && <p className="text-xs" style={{ color: SUB }}>For your {carFull(vehicle)}{me.city ? ` · ${me.city}` : ""}</p>}
      <Field as="textarea" label="What needs doing?" rows={4} maxLength={1500} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Front brake pads and discs replaced, squeaking when I stop." />
      <p className="text-[11px]" style={{ color: SUB }}>Workshops and mechanics who sell services on Motiq in your country will see this and can send a price. Your name and phone number aren't shown.</p>
      <PrimaryButton onClick={send} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Ask for quotes</PrimaryButton>
    </div>
  );
}

function OfferForm({ job, listing, onDone }) {
  const { me, uid, showToast } = useUI();
  const [price, setPrice] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (price !== "" && !(Number(price) >= 0)) return showToast("Check the price.");
    setBusy(true);
    try { await sendOffer(uid, { request_id: job.id, listing_id: listing.id, price, currency: me.currency, message: msg }); showToast("Quote sent"); onDone && onDone(); }
    catch (e) { showToast(/duplicate|unique/i.test(e.message) ? "You've already quoted this job." : e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm leading-relaxed" style={{ color: "inherit" }}>{job.description}</p>
      <Field label={`Your price (${me.currency})`} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Leave empty to discuss" />
      <Field as="textarea" label="Message" rows={3} maxLength={1000} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What's included, how long it takes, when you can start…" />
      <PrimaryButton onClick={send} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send quote</PrimaryButton>
    </div>
  );
}

export default function QuotesView({ onChat }) {
  const { uid, openSheet, closeSheet, showToast, confirm } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const [side, setSide] = useState("mine"); // mine | jobs | work
  const [extra, setExtra] = useState({ bookings: [], payments: [], reviews: [], ratings: {} });
  const [mine, setMine] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [listing, setListing] = useState(undefined);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => { myServiceListing(uid).then(setListing).catch(() => setListing(null)); }, [uid]);
  useEffect(() => {
    let off = false;
    if (side === "work") return;
    if (side === "mine") Promise.all([loadBookings(uid).catch(() => []), loadJobPayments(uid).catch(() => []), loadMyReviews(uid).catch(() => [])]).then(([bookings, payments, reviews]) => !off && setExtra((x) => ({ ...x, bookings, payments, reviews })));
    (side === "mine" ? loadMyQuoteRequests(uid).then((x) => {
      if (off) return; setMine(x);
      const ids = [...new Set(x.flatMap((r) => (r.offers || []).map((o) => o.provider_id)))];
      Promise.all(ids.map((id) => mechanicRating(id).then((r) => [id, r]).catch(() => [id, null]))).then((pairs) => !off && setExtra((e) => ({ ...e, ratings: Object.fromEntries(pairs) })));
    }) : loadOpenJobs(uid).then((x) => !off && setJobs(x)))
      .catch((e) => { if (!off) { showToast(e.message); setMine((m) => m || []); setJobs((j) => j || []); } });
    return () => { off = true; };
  }, [side, version]);

  const ask = () => openSheet("Get quotes", <QuoteRequestForm onDone={() => { closeSheet(); setSide("mine"); bump(); }} />);
  const accept = async (offer) => {
    try {
      await acceptOffer(offer);
      const id = offer.listing_id ? await contactSeller(offer.listing_id) : null;
      bump();
      if (id) onChat({ id, listing: null, other: offer.provider || { name: "Mechanic" } });
      else showToast("Accepted");
    } catch (e) { showToast(e.message); }
  };

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          <Pill small active={side === "mine"} onClick={() => setSide("mine")}>My requests</Pill>
          {listing && <Pill small active={side === "jobs"} onClick={() => setSide("jobs")}>Jobs near you</Pill>}
          {listing && <Pill small active={side === "work"} onClick={() => setSide("work")}>My work</Pill>}
        </div>
        <SecondaryButton className="px-3.5 py-2 text-xs" onClick={ask}><Wrench size={14} /> Get quotes</SecondaryButton>
      </div>

      {side === "mine" ? (
        !mine ? <Skeleton rows={2} height={96} radius={20} /> : mine.length === 0 ? (
          <Empty icon={ClipboardList} title="Get prices before you go" text="Describe the job once and mechanics near you send their prices. Pick the best one and chat with them." action="Get quotes" onAction={ask} />
        ) : (
          <div className="flex flex-col gap-3">
            {mine.map((r) => (
              <div key={r.id} className="flex flex-col gap-2.5 p-4" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: TEXT }}>{r.description}</p>
                    <p className="mt-0.5 text-[11px]" style={{ color: SUB }}>{[r.car, timeAgo(r.created_at)].filter(Boolean).join(" · ")}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: CARD_ALT, color: r.status === "open" ? AMBER : r.status === "accepted" ? GREEN : SUB }}>{r.status === "open" ? "Open" : r.status === "accepted" ? "Accepted" : "Closed"}</span>
                </div>
                {(r.offers || []).length > 0 && <button onClick={() => openSheet("Is this price fair?", <FairPriceSheet initial={r.description} />)} className="flex items-center gap-1 self-start text-[11px] font-medium" style={{ color: SUB }}><Scale size={12} /> Is this price fair?</button>}
                {(r.offers || []).length === 0 ? <p className="text-xs" style={{ color: SUB }}>{r.status === "open" ? "Waiting for quotes…" : "No quotes."}</p> : [...r.offers].sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12)).map((o) => (
                  <div key={o.id} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>{(o.provider && o.provider.name) || "Mechanic"}{o.provider && o.provider.city ? <span className="font-normal" style={{ color: SUB }}> · {o.provider.city}</span> : null}</p>
                      <p className="shrink-0 text-sm font-bold" style={{ color: TEXT }}>{o.price != null ? money(o.price, o.currency) : "Ask"}</p>
                    </div>
                    <RatingBadge rating={extra.ratings[o.provider_id]} verified={o.listing && o.listing.verified} />
                    {o.message && <p className="mt-1 text-xs leading-relaxed" style={{ color: SUB }}>{o.message}</p>}
                    {r.status === "open" && <button onClick={() => accept(o)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: GREEN }}><Check size={13} /> Accept & message</button>}
                    {o.status === "accepted" && <button onClick={async () => { try { const id = await contactSeller(o.listing_id); onChat({ id, listing: null, other: o.provider || { name: "Mechanic" } }); } catch (e) { showToast(e.message); } }} className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: TEXT }}><MessageCircle size={13} /> Message</button>}
                    {o.status === "accepted" && <AcceptedOffer offer={o} booking={extra.bookings.find((b) => b.offer_id === o.id)} payment={extra.payments.find((p) => p.offer_id === o.id && p.status !== "failed")} review={extra.reviews.find((v) => v.offer_id === o.id)} onChanged={bump} />}
                  </div>
                ))}
                {r.status === "open" && <button onClick={() => confirm("Close this request?", "Mechanics won't be able to send more quotes.", "Close", async () => { try { await closeQuoteRequest(r.id); bump(); } catch (e) { showToast(e.message); } })} className="flex items-center gap-1 self-start text-[11px]" style={{ color: SUB }}><X size={12} /> Close request</button>}
              </div>
            ))}
          </div>
        )
      ) : side === "work" ? <ProviderWork version={version} bump={bump} /> : !jobs ? <Skeleton rows={2} height={96} radius={20} /> : jobs.length === 0 ? (
        <Empty icon={Wrench} title="No open jobs right now" text="When drivers in your country ask for quotes, they show up here." />
      ) : (
        <div className="flex flex-col gap-3">
          {jobs.map((j) => {
            const mineOffer = (j.mine || []).find((o) => o.provider_id === uid);
            return (
              <div key={j.id} className="flex flex-col gap-2 p-4" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                <p className="text-sm" style={{ color: TEXT }}>{j.description}</p>
                <p className="text-[11px]" style={{ color: SUB }}>{[j.car, j.city, timeAgo(j.created_at)].filter(Boolean).join(" · ")}</p>
                {mineOffer ? <p className="text-xs font-medium" style={{ color: GREEN }}>You quoted {mineOffer.price != null ? money(mineOffer.price, mineOffer.currency) : "(to discuss)"}</p>
                  : <SecondaryButton onClick={() => openSheet("Send a quote", <OfferForm job={j} listing={listing} onDone={() => { closeSheet(); bump(); }} />)}><Send size={14} /> Send a quote</SecondaryButton>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ---- After a quote is accepted: book a time, pay through Motiq (held until the job is done),
// then rate the mechanic.
export function Stars({ value, onChange, size = 18 }) {
  return (
    <div className="flex gap-1" role={onChange ? "radiogroup" : undefined} aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => {
        const on = n <= value;
        const star = <Star size={size} fill={on ? "#F5B944" : "none"} style={{ color: on ? "#F5B944" : "#9E9E9E" }} />;
        return onChange ? <button key={n} role="radio" aria-checked={n === value} aria-label={`${n} star${n === 1 ? "" : "s"}`} onClick={() => onChange(n)}>{star}</button> : <span key={n}>{star}</span>;
      })}
    </div>
  );
}
export function RatingBadge({ rating, verified }) {
  const { SUB } = useTheme();
  return (
    <span className="flex items-center gap-1.5 text-[11px]" style={{ color: SUB }}>
      {verified && <span className="flex items-center gap-0.5 font-semibold" style={{ color: GREEN }}><BadgeCheck size={12} /> Verified</span>}
      {rating && rating.count > 0 ? <span className="flex items-center gap-0.5"><Star size={11} fill="#F5B944" style={{ color: "#F5B944" }} /> {rating.avg} ({rating.count})</span> : <span>No reviews yet</span>}
    </span>
  );
}

function BookSheet({ offer, onDone }) {
  const { uid, showToast } = useUI();
  const { SUB } = useTheme();
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setHours(9, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const local = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const [when, setWhen] = useState(local(tomorrow));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (new Date(when) <= new Date()) return showToast("Pick a time in the future.");
    setBusy(true);
    try { await requestBooking(uid, offer, when, note); showToast("Booking sent — the mechanic will confirm"); onDone && onDone(); } catch (e) { showToast(/duplicate|unique/i.test(e.message) ? "You've already booked this job. Change the time instead." : e.message); }
    setBusy(false);
  };
  return (
    <div className="flex flex-col gap-4">
      <Field label="Day and time" type="datetime-local" value={when} min={local(new Date())} onChange={(e) => setWhen(e.target.value)} />
      <Field label="Note (optional)" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. I'll drop the car off and collect it at 5" />
      <p className="text-[11px]" style={{ color: SUB }}>We'll remind you on the day. The mechanic can confirm or suggest another time in chat.</p>
      <PrimaryButton onClick={send} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <CalendarDays size={15} />} Request this time</PrimaryButton>
    </div>
  );
}

function ReviewSheet({ offer, existing, onDone }) {
  const { uid, showToast } = useUI();
  const [rating, setRating] = useState(existing ? existing.rating : 0);
  const [comment, setComment] = useState(existing ? existing.comment : "");
  const [busy, setBusy] = useState(false);
  const send = async () => { setBusy(true); try { await reviewMechanic(uid, offer, rating, comment); showToast("Thanks for the review"); onDone && onDone(); } catch (e) { showToast(e.message); } setBusy(false); };
  return (
    <div className="flex flex-col items-center gap-4">
      <Stars value={rating} onChange={setRating} size={30} />
      <div className="w-full"><Field as="textarea" rows={3} label="How did it go? (optional)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Fair price, on time, explained the problem…" /></div>
      <PrimaryButton className="w-full" onClick={send} disabled={busy || !rating}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Star size={15} />} Post review</PrimaryButton>
    </div>
  );
}

export function AcceptedOffer({ offer, booking, payment, review, onChanged }) {
  const { openSheet, closeSheet, showToast, confirm } = useUI();
  const { TEXT, SUB, BORDER } = useTheme();
  const [busy, setBusy] = useState(false);
  const pay = async () => {
    setBusy(true);
    try {
      const { url } = await payMechanic(offer.id);
      const native = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
      if (native) { const { Browser } = await import("@capacitor/browser"); await Browser.open({ url }); } else window.location.href = url;
    } catch (e) { showToast(e.message); }
    setBusy(false);
  };
  const when = booking && new Date(booking.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  const line = "mt-2 flex items-center gap-1.5 text-xs font-semibold";
  return (
    <div className="mt-2 flex flex-col gap-1.5 border-t pt-2" style={{ borderColor: BORDER }}>
      {booking && booking.status !== "cancelled"
        ? <p className="flex items-center gap-1.5 text-xs" style={{ color: TEXT }}><CalendarDays size={13} /> {when} · <span style={{ color: booking.status === "confirmed" ? GREEN : booking.status === "done" ? SUB : AMBER }}>{!booking.status || booking.status === "requested" ? "waiting for the mechanic" : booking.status}</span></p>
        : <button className={line} style={{ color: TEXT }} onClick={() => openSheet("Book a time", <BookSheet offer={offer} onDone={() => { closeSheet(); onChanged(); }} />)}><CalendarDays size={13} /> Book a time</button>}
      {offer.price != null && (!payment || payment.status === "pending" || payment.status === "failed") && (
        <button className={line} style={{ color: TEXT }} onClick={pay} disabled={busy}>{busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Pay {money(offer.price, offer.currency)} through Motiq</button>
      )}
      {payment && payment.status === "held" && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px]" style={{ color: SUB }}>{money(payment.amount, payment.currency)} held safely by Motiq</p>
          <button className="text-xs font-semibold" style={{ color: GREEN }} onClick={() => confirm("Is the job done?", "The mechanic gets paid. Only do this when you're happy with the work.", "Job done", async () => { try { await releaseJobPayment(payment.id); showToast("Thanks — the mechanic will be paid"); onChanged(); } catch (e) { showToast(e.message); } })}>Job done</button>
        </div>
      )}
      {payment && ["released", "paid_out"].includes(payment.status) && <p className="text-[11px]" style={{ color: GREEN }}>Paid {money(payment.amount, payment.currency)} · job done</p>}
      {payment && payment.status === "refunded" && <p className="text-[11px]" style={{ color: SUB }}>Refunded</p>}
      {review ? <button className="flex items-center gap-2 text-[11px]" style={{ color: SUB }} onClick={() => openSheet("Your review", <ReviewSheet offer={offer} existing={review} onDone={() => { closeSheet(); onChanged(); }} />)}><Stars value={review.rating} size={12} /> Edit review</button>
        : (booking && booking.status === "done") || (payment && ["released", "paid_out"].includes(payment.status)) || (booking && new Date(booking.starts_at) < new Date())
          ? <button className={line} style={{ color: "#F5B944" }} onClick={() => openSheet("Rate the mechanic", <ReviewSheet offer={offer} onDone={() => { closeSheet(); onChanged(); }} />)}><Star size={13} /> Rate the mechanic</button> : null}
    </div>
  );
}

// ---- Mechanic side: bookings to confirm, money coming in, and where to send it.
export function ProviderWork({ version, bump }) {
  const { uid, showToast } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const [bookings, setBookings] = useState(null);
  const [payments, setPayments] = useState([]);
  const [payout, setPayout] = useState(null);
  useEffect(() => {
    loadBookings(uid).then((b) => setBookings(b.filter((x) => x.provider_id === uid))).catch(() => setBookings([]));
    loadJobPayments(uid).then((p) => setPayments(p.filter((x) => x.provider_id === uid && x.status !== "pending" && x.status !== "failed"))).catch(() => {});
    loadPrivate(uid).then((p) => setPayout(p.payout_details || "")).catch(() => setPayout(""));
  }, [version]);
  const set = async (b, status) => { try { await setBookingStatus(b.id, status); bump(); showToast(status === "confirmed" ? "Booking confirmed" : "Booking cancelled"); } catch (e) { showToast(e.message); } };
  const owed = payments.filter((p) => p.status === "released").reduce((s, p) => s + Number(p.amount) - Number(p.commission), 0);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Bookings</p>
      {!bookings ? <Skeleton rows={1} height={60} radius={16} /> : bookings.length === 0 ? <p className="text-sm" style={{ color: SUB }}>No bookings yet. When a driver accepts your quote they can book a time here.</p> : bookings.map((b) => (
        <div key={b.id} className="flex items-center justify-between gap-2 rounded-2xl p-3" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
          <div className="min-w-0"><p className="text-sm font-medium" style={{ color: TEXT }}>{new Date(b.starts_at).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</p><p className="truncate text-[11px]" style={{ color: SUB }}>{b.status}{b.note ? ` · ${b.note}` : ""}</p></div>
          {b.status === "requested" && <div className="flex gap-3 text-xs font-semibold"><button style={{ color: GREEN }} onClick={() => set(b, "confirmed")}>Confirm</button><button style={{ color: SUB }} onClick={() => set(b, "cancelled")}>Decline</button></div>}
        </div>
      ))}
      <p className="mt-2 text-xs font-semibold uppercase tracking-wide" style={{ color: SUB }}>Payments through Motiq</p>
      {payments.length === 0 ? <p className="text-sm" style={{ color: SUB }}>When a driver pays through Motiq, the money is held safely and sent to you once they mark the job done (minus a 10% Motiq fee).</p> : (
        <>
          {owed > 0 && <p className="text-sm" style={{ color: TEXT }}>On its way to you: <b>{money(owed, payments[0].currency)}</b></p>}
          {payments.map((p) => <div key={p.id} className="flex items-center justify-between text-sm"><span style={{ color: TEXT }}>{money(p.amount, p.currency)}</span><span className="text-[11px]" style={{ color: p.status === "paid_out" ? GREEN : SUB }}>{({ held: "Held until the job is done", released: "Job done — being sent", paid_out: `Sent · you got ${money(p.amount - p.commission, p.currency)}`, refunded: "Refunded to the driver" })[p.status]}</span></div>)}
        </>
      )}
      <div className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
        <Field as="textarea" rows={2} label="Where should Motiq send your money?" maxLength={300} value={payout ?? ""} onChange={(e) => setPayout(e.target.value)} placeholder="Bank name, account number and account name (or mobile money number)" />
        <p className="mt-1 text-[11px]" style={{ color: SUB }}>Only you and the Motiq team can see this.</p>
        <SecondaryButton className="mt-2 w-full" onClick={async () => { try { await savePrivate(uid, { payout_details: (payout || "").trim() }); showToast("Saved"); } catch (e) { showToast(e.message); } }}>Save payout details</SecondaryButton>
      </div>
    </div>
  );
}
