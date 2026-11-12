// Mechanic quotes: a driver describes a job, workshops and mechanics in the same country send a
// price, the driver accepts one and chats with them. Providers see "Jobs near you".
import React, { useEffect, useState } from "react";
import { Wrench, Loader2, Check, MessageCircle, Send, ClipboardList, X } from "lucide-react";
import { useTheme, useUI, GREEN, AMBER, Field, Pill, PrimaryButton, SecondaryButton, Empty, Skeleton, carFull, timeAgo } from "../design.jsx";
import { loadMyQuoteRequests, loadOpenJobs, requestQuote, closeQuoteRequest, sendOffer, acceptOffer, myServiceListing, contactSeller } from "../lib/data.js";
import { money } from "../lib/units.js";

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
  const [side, setSide] = useState("mine"); // mine | jobs
  const [mine, setMine] = useState(null);
  const [jobs, setJobs] = useState(null);
  const [listing, setListing] = useState(undefined);
  const [version, setVersion] = useState(0);
  const bump = () => setVersion((v) => v + 1);

  useEffect(() => { myServiceListing(uid).then(setListing).catch(() => setListing(null)); }, [uid]);
  useEffect(() => {
    let off = false;
    (side === "mine" ? loadMyQuoteRequests(uid).then((x) => !off && setMine(x)) : loadOpenJobs(uid).then((x) => !off && setJobs(x)))
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
                {(r.offers || []).length === 0 ? <p className="text-xs" style={{ color: SUB }}>{r.status === "open" ? "Waiting for quotes…" : "No quotes."}</p> : [...r.offers].sort((a, b) => (a.price ?? 1e12) - (b.price ?? 1e12)).map((o) => (
                  <div key={o.id} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold" style={{ color: TEXT }}>{(o.provider && o.provider.name) || "Mechanic"}{o.provider && o.provider.city ? <span className="font-normal" style={{ color: SUB }}> · {o.provider.city}</span> : null}</p>
                      <p className="shrink-0 text-sm font-bold" style={{ color: TEXT }}>{o.price != null ? money(o.price, o.currency) : "Ask"}</p>
                    </div>
                    {o.message && <p className="mt-1 text-xs leading-relaxed" style={{ color: SUB }}>{o.message}</p>}
                    {r.status === "open" && <button onClick={() => accept(o)} className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: GREEN }}><Check size={13} /> Accept & message</button>}
                    {o.status === "accepted" && <button onClick={async () => { try { const id = await contactSeller(o.listing_id); onChat({ id, listing: null, other: o.provider || { name: "Mechanic" } }); } catch (e) { showToast(e.message); } }} className="mt-2 flex items-center gap-1.5 text-xs font-semibold" style={{ color: TEXT }}><MessageCircle size={13} /> Message</button>}
                  </div>
                ))}
                {r.status === "open" && <button onClick={() => confirm("Close this request?", "Mechanics won't be able to send more quotes.", "Close", async () => { try { await closeQuoteRequest(r.id); bump(); } catch (e) { showToast(e.message); } })} className="flex items-center gap-1 self-start text-[11px]" style={{ color: SUB }}><X size={12} /> Close request</button>}
              </div>
            ))}
          </div>
        )
      ) : !jobs ? <Skeleton rows={2} height={96} radius={20} /> : jobs.length === 0 ? (
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
