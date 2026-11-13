// Admin: how Motiq is doing (users, cars, scans, AI use, Pro), reported and hidden listings to
// review, and the latest app errors. Only people marked is_admin in the database can open it.
import React, { useEffect, useState } from "react";
import { Users, Car, ScanLine, Bot, Crown, Flag, EyeOff, Bug, RefreshCw, Store, Wrench } from "lucide-react";
import { useTheme, useUI, RED, AMBER, GREEN, ScreenHeader, RoundButton, Skeleton, timeAgo } from "../design.jsx";
import { adminStats, adminReports, adminErrors, adminSetListingStatus, adminUsage, adminJobPayments, adminSetJobPayment, adminServiceListings, adminSetVerified } from "../lib/data.js";
import { money } from "../lib/units.js";
import { BadgeCheck, Activity, Banknote } from "lucide-react";

// Which features people use, daily active users and the sign-up → car → AI → came-back funnel.
function UsagePanel() {
  const { TEXT, SUB, CARD, BORDER, FILL } = useTheme();
  const [days, setDays] = useState(7);
  const [u, setU] = useState(null);
  useEffect(() => { setU(null); adminUsage(days).then(setU).catch(() => setU({ events: [], daily: [], funnel: {}, active: 0 })); }, [days]);
  const max = u ? Math.max(1, ...u.daily.map((d) => d.users)) : 1;
  const f = (u && u.funnel) || {};
  const pct = (a) => (f.signed_up ? `${Math.round(((a || 0) / f.signed_up) * 100)}%` : "—");
  return (
    <section className="flex flex-col gap-3 p-4" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <div className="flex items-center justify-between"><p className="flex items-center gap-2 text-sm font-semibold" style={{ color: TEXT }}><Activity size={15} /> Usage</p>
        <div className="flex gap-1.5">{[7, 30].map((d) => <button key={d} onClick={() => setDays(d)} className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ backgroundColor: days === d ? FILL : "transparent", color: days === d ? "#000" : SUB }}>{d}d</button>)}</div></div>
      {!u ? <Skeleton rows={2} height={40} radius={12} /> : (
        <>
          <p className="text-xs" style={{ color: SUB }}>{u.active} active users in the last {days} days</p>
          <div className="flex h-16 items-end gap-1" aria-label="Daily active users">{u.daily.map((d) => <div key={d.day} className="flex-1 rounded-sm" title={`${d.day}: ${d.users}`} style={{ height: `${Math.max(4, (d.users / max) * 60)}px`, backgroundColor: FILL }} />)}</div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SUB }}>New users who…</p>
          <div className="grid grid-cols-4 gap-1.5 text-center">{[["signed up", f.signed_up], ["added a car", f.added_car], ["asked AI", f.asked_ai], ["came back", f.came_back]].map(([l, v], i) => <div key={l}><p className="text-sm font-bold" style={{ color: TEXT }}>{v || 0}</p><p className="text-[10px]" style={{ color: SUB }}>{l}{i ? ` · ${pct(v)}` : ""}</p></div>)}</div>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: SUB }}>Most used</p>
          {u.events.slice(0, 12).map((e) => <div key={e.event} className="flex justify-between text-xs"><span style={{ color: TEXT }}>{e.event.replace(/_/g, " ")}</span><span style={{ color: SUB }}>{e.users} people · {e.uses} uses</span></div>)}
          {u.events.length === 0 && <p className="text-xs" style={{ color: SUB }}>No usage recorded yet.</p>}
        </>
      )}
    </section>
  );
}

// Mechanic payments: held (waiting for the driver) and released (send the money, then mark sent).
function PayoutsPanel() {
  const { showToast, confirm } = useUI();
  const { TEXT, SUB, CARD, CARD_ALT, BORDER } = useTheme();
  const [rows, setRows] = useState(null);
  const load = () => adminJobPayments().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  const act = (p, status, title, text) => confirm(title, text, status === "paid_out" ? "Mark sent" : "Mark refunded", async () => { try { await adminSetJobPayment(p.id, status); showToast("Updated"); load(); } catch (e) { showToast(e.message); } });
  return (
    <section className="flex flex-col gap-2 p-4" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: TEXT }}><Banknote size={15} /> Mechanic payments</p>
      {!rows ? <Skeleton rows={1} height={40} radius={12} /> : rows.length === 0 ? <p className="text-xs" style={{ color: SUB }}>Nothing held or waiting to be sent.</p> : rows.map((p) => (
        <div key={p.id} className="rounded-xl p-3" style={{ backgroundColor: CARD_ALT }}>
          <div className="flex justify-between text-sm"><span style={{ color: TEXT }}>{(p.provider && p.provider.name) || "Mechanic"}</span><span className="font-semibold" style={{ color: TEXT }}>{money(p.amount - p.commission, p.currency)}</span></div>
          <p className="text-[11px]" style={{ color: SUB }}>{p.status === "held" ? "Held — waiting for the driver to mark the job done" : "Released — send this to the mechanic"} · paid {money(p.amount, p.currency)}, fee {money(p.commission, p.currency)} · ref {p.reference}</p>
          {p.status === "released" && <p className="mt-1 whitespace-pre-wrap text-xs" style={{ color: p.payout_details ? TEXT : AMBER }}>{p.payout_details || "No payout details yet — ask the mechanic to add them in Market → Get quotes → My work."}</p>}
          <div className="mt-1.5 flex gap-4 text-xs font-semibold">
            {p.status === "released" && <button style={{ color: GREEN }} onClick={() => act(p, "paid_out", "Money sent?", "Mark this only after you've sent the money to the mechanic.")}>Mark sent</button>}
            <button style={{ color: RED }} onClick={() => act(p, "refunded", "Refund the driver?", "Refund it in your Paystack dashboard first, then mark it here.")}>Refunded</button>
          </div>
        </div>
      ))}
    </section>
  );
}

// Give mechanics and workshops a Verified badge once you've checked them.
function VerifyPanel() {
  const { showToast } = useUI();
  const { TEXT, SUB, CARD, BORDER } = useTheme();
  const [rows, setRows] = useState(null);
  const load = () => adminServiceListings().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []);
  return (
    <section className="flex flex-col gap-2 p-4" style={{ borderRadius: 20, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
      <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: TEXT }}><BadgeCheck size={15} /> Verify mechanics</p>
      {!rows ? <Skeleton rows={1} height={40} radius={12} /> : rows.length === 0 ? <p className="text-xs" style={{ color: SUB }}>No service listings yet.</p> : rows.map((l) => (
        <div key={l.id} className="flex items-center justify-between gap-2 py-1">
          <div className="min-w-0"><p className="truncate text-sm" style={{ color: TEXT }}>{l.title}</p><p className="text-[11px]" style={{ color: SUB }}>{(l.seller && l.seller.name) || "—"} · {[l.city, l.country].filter(Boolean).join(", ")}</p></div>
          <button className="shrink-0 text-xs font-semibold" style={{ color: l.verified ? SUB : GREEN }} onClick={async () => { try { await adminSetVerified(l.id, !l.verified); showToast(l.verified ? "Badge removed" : "Verified"); load(); } catch (e) { showToast(e.message); } }}>{l.verified ? "Remove badge" : "Verify"}</button>
        </div>
      ))}
    </section>
  );
}

export default function AdminScreen({ onBack }) {
  const { showToast, confirm } = useUI();
  const { CARD, CARD_ALT, TEXT, SUB, BORDER } = useTheme();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = async () => {
    setError("");
    try { const [stats, reports, errors] = await Promise.all([adminStats(), adminReports(), adminErrors()]); setData({ stats, reports, errors }); }
    catch (e) { setError(/Admins only|admin_stats/i.test(e.message) ? "This page is for Motiq admins." : e.message); }
  };
  useEffect(() => { load(); }, []);
  const moderate = async (id, status) => { try { await adminSetListingStatus(id, status); showToast(status === "hidden" ? "Listing hidden" : "Listing restored"); load(); } catch (e) { showToast(e.message); } };

  // One row per reported listing, with how many reports and why.
  const byListing = {};
  for (const r of (data && data.reports) || []) {
    if (!r.listing) continue;
    const x = byListing[r.listing.id] || (byListing[r.listing.id] = { listing: r.listing, reasons: [], last: r.created_at });
    x.reasons.push(r.reason + (r.details ? `: ${r.details}` : ""));
  }
  const s = data ? data.stats : {};
  const tiles = [[Users, "Users", s.users, `+${s.new_users_7d || 0} this week`], [Crown, "Pro", s.pro], [Car, "Cars", s.cars], [ScanLine, "Scans (7d)", s.scans_7d], [Bot, "AI today", s.ai_today], [Store, "Listings", s.listings_active, `${s.listings_hidden || 0} hidden`], [Flag, "Reports (7d)", s.reports_7d], [Wrench, "Open quotes", s.quotes_open], [Bug, "Errors (24h)", s.errors_24h]];

  return (
    <div className="flex flex-col gap-4 px-5 pt-2" style={{ paddingBottom: 120 }}>
      <ScreenHeader title="Admin" sub="Motiq at a glance" onBack={onBack} right={<RoundButton icon={RefreshCw} label="Refresh" onClick={load} />} />
      {error ? <p className="rounded-2xl p-4 text-sm" style={{ backgroundColor: CARD_ALT, color: SUB }}>{error}</p> : !data ? <Skeleton rows={4} height={80} /> : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            {tiles.map(([Icon, label, v, sub]) => (
              <div key={label} className="p-3" style={{ borderRadius: 18, backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
                <Icon size={13} style={{ color: SUB }} />
                <p className="mt-1 text-lg font-bold" style={{ color: TEXT }}>{Number(v || 0).toLocaleString()}</p>
                <p style={{ fontSize: 10, color: SUB }}>{label}</p>
                {sub && <p style={{ fontSize: 9, color: SUB }}>{sub}</p>}
              </div>
            ))}
          </div>

          <UsagePanel />
          <PayoutsPanel />
          <VerifyPanel />
          <p className="px-1 text-sm font-semibold" style={{ color: TEXT }}>Reported listings</p>
          {Object.values(byListing).length === 0 ? <p className="text-xs" style={{ color: SUB }}>No reports. </p> : Object.values(byListing).map(({ listing, reasons, last }) => (
            <div key={listing.id} className="flex flex-col gap-2 rounded-2xl p-3.5" style={{ backgroundColor: CARD, border: `1px solid ${BORDER}` }}>
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium" style={{ color: TEXT }}>{listing.title}</p>
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: listing.status === "hidden" ? `${AMBER}26` : `${GREEN}26`, color: listing.status === "hidden" ? AMBER : GREEN }}>{listing.status}</span>
              </div>
              <p className="text-xs" style={{ color: SUB }}>{reasons.length} report{reasons.length === 1 ? "" : "s"} · last {timeAgo(last)}</p>
              <ul className="list-disc pl-4 text-xs" style={{ color: SUB }}>{reasons.slice(0, 5).map((r, i) => <li key={i}>{r}</li>)}</ul>
              <div className="flex gap-2">
                {listing.status !== "hidden"
                  ? <button onClick={() => moderate(listing.id, "hidden")} className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: `${RED}1F`, color: RED }}><EyeOff size={12} /> Hide</button>
                  : <button onClick={() => moderate(listing.id, "active")} className="rounded-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: CARD_ALT, color: TEXT }}>Restore</button>}
              </div>
            </div>
          ))}

          <p className="px-1 text-sm font-semibold" style={{ color: TEXT }}>Latest app errors</p>
          {data.errors.length === 0 ? <p className="text-xs" style={{ color: SUB }}>No errors reported. </p> : data.errors.map((e) => (
            <details key={e.id} className="rounded-2xl p-3" style={{ backgroundColor: CARD_ALT }}>
              <summary className="cursor-pointer text-xs" style={{ color: TEXT }}><b>{e.message}</b><span style={{ color: SUB }}> · {e.screen || "app"} · {e.platform} {e.app_version} · {timeAgo(e.created_at)}</span></summary>
              {e.stack && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[10px]" style={{ color: SUB }}>{e.stack}</pre>}
            </details>
          ))}
        </>
      )}
    </div>
  );
}
