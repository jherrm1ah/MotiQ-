// Admin: how Motiq is doing (users, cars, scans, AI use, Pro), reported and hidden listings to
// review, and the latest app errors. Only people marked is_admin in the database can open it.
import React, { useEffect, useState } from "react";
import { Users, Car, ScanLine, Bot, Crown, Flag, EyeOff, Bug, RefreshCw, Store, Wrench } from "lucide-react";
import { useTheme, useUI, RED, AMBER, GREEN, ScreenHeader, RoundButton, Skeleton, timeAgo } from "../design.jsx";
import { adminStats, adminReports, adminErrors, adminSetListingStatus } from "../lib/data.js";

export default function AdminScreen({ onBack }) {
  const { showToast } = useUI();
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
