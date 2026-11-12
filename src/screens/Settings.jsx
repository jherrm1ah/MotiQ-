import React, { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { C, Screen, Card, Button, Field, input, Chip, toast } from "../ui.jsx";
import { saveProfile, clearAiHistory } from "../lib/data.js";
import { COUNTRIES, CURRENCIES, defaultsFor, guessCountry } from "../lib/units.js";

// Your details, where you are and how Motiq shows money and distance. Also the first-time setup.
export function ProfileForm({ me, onSaved, submitLabel = "Save" }) {
  const guessed = me.country || guessCountry();
  const [p, setP] = useState({ name: me.name || "", country: guessed, city: me.city || "", ...(!me.country && guessed ? defaultsFor(guessed) : { currency: me.currency, distance_unit: me.distance_unit }) });
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Field label="Your name"><input style={input} value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} /></Field>
      <Field label="Country"><select style={input} value={p.country} onChange={(e) => setP({ ...p, country: e.target.value, ...defaultsFor(e.target.value) })}>
        <option value="">Choose your country</option>
        {COUNTRIES.slice().sort((a, b) => a[1].localeCompare(b[1])).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select></Field>
      <Field label="City (for the market)"><input style={input} value={p.city} onChange={(e) => setP({ ...p, city: e.target.value })} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Currency"><select style={input} value={p.currency} onChange={(e) => setP({ ...p, currency: e.target.value })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Distance"><div style={{ display: "flex", gap: 6 }}>{[["km", "Kilometres"], ["mi", "Miles"]].map(([v, l]) => <Chip key={v} active={p.distance_unit === v} onClick={() => setP({ ...p, distance_unit: v })}>{l}</Chip>)}</div></Field>
      </div>
      <Button style={{ width: "100%" }} disabled={busy} onClick={async () => {
        if (!p.country) return toast("Choose your country.");
        setBusy(true);
        try { onSaved(await saveProfile(me.id, { name: p.name.trim().slice(0, 60), country: p.country, city: p.city.trim().slice(0, 60), currency: p.currency, distance_unit: p.distance_unit })); } catch (e) { toast(e.message); }
        setBusy(false);
      }}>{busy ? "Saving…" : submitLabel}</Button>
    </>
  );
}

export default function Settings({ me, setMe, onBack }) {
  return (
    <Screen title="Settings" onBack={onBack}>
      <Card><ProfileForm me={me} onSaved={(p) => { setMe(p); toast("Saved"); }} /></Card>
      <Card style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 4px", fontWeight: 800 }}>Your AI chats</p>
        <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 14 }}>Motiq keeps your questions so it remembers the conversation. Clear them any time.</p>
        <Button kind="secondary" onClick={async () => { if (!window.confirm("Delete all your chats with Motiq?")) return; await clearAiHistory(me.id); toast("Chats deleted"); }}>Delete my AI chats</Button>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <p style={{ margin: "0 0 12px", color: C.sub, fontSize: 14 }}>Motiq's advice is a guide, not a replacement for a qualified mechanic. For brakes, steering, airbags or anything that feels unsafe, stop and get the car checked.</p>
        <Button kind="danger" onClick={() => supabase.auth.signOut()}>Sign out</Button>
      </Card>
    </Screen>
  );
}
