// Phone reminders (Android app): Motiq schedules a notification 3 days before and on the day a
// service is due, and 14 days before and on the day a document expires. They're rebuilt every
// time your garage loads, so done or deleted items disappear. Nothing is sent from a server.
import { LocalNotifications } from "@capacitor/local-notifications";

const native = () => typeof window !== "undefined" && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
export const canNotify = native;

// A stable 31-bit id from a string, so the same reminder keeps the same notification.
const idOf = (s) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h) % 2000000000; };
const daysTo = (iso) => Math.round((new Date(`${iso}T00:00:00`).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
const at9 = (iso, daysBefore) => { const d = new Date(`${iso}T09:00:00`); d.setDate(d.getDate() - daysBefore); return d; };

export async function askNotificationPermission() {
  if (!native()) return false;
  const p = await LocalNotifications.requestPermissions();
  return p.display === "granted";
}

export async function syncReminders({ vehicles, reminders, documents, prefs }) {
  if (!native()) return;
  try {
    const perm = await LocalNotifications.checkPermissions();
    if (perm.display !== "granted") return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    const now = Date.now();
    const name = (id) => { const v = vehicles.find((x) => x.id === id); return v ? v.nickname || [v.make, v.model].join(" ") : "Your car"; };
    const list = [];
    if (prefs.alertsService !== false) {
      for (const r of reminders.filter((x) => !x.done_at && x.due_on)) {
        for (const [days, when] of [[3, "in 3 days"], [0, "today"]]) {
          const t = at9(r.due_on, days);
          if (t.getTime() > now) list.push({ id: idOf(`r${r.id}${days}`), title: `${r.title} due ${when}`, body: `${name(r.vehicle_id)} — tap to see what's due.`, schedule: { at: t, allowWhileIdle: true }, smallIcon: "ic_stat_motiq", iconColor: "#212121" });
        }
      }
    }
    if (prefs.alertsDocuments !== false) {
      for (const d of documents.filter((x) => x.expires_on)) {
        for (const [days, when] of [[14, "in 2 weeks"], [0, "today"]]) {
          const t = at9(d.expires_on, days);
          if (t.getTime() > now) list.push({ id: idOf(`d${d.id}${days}`), title: `${d.title} expires ${when}`, body: `${name(d.vehicle_id)} — renew it so you're covered.`, schedule: { at: t, allowWhileIdle: true }, smallIcon: "ic_stat_motiq", iconColor: "#212121" });
        }
      }
    }
    // Morning car check: every day at the chosen time, with what's on today.
    if (prefs.morningCheck) {
      const [hh, mm] = String(prefs.morningTime || "07:30").split(":").map(Number);
      const due = reminders.filter((x) => !x.done_at && x.due_on && daysTo(x.due_on) <= 7).length;
      const docs = documents.filter((x) => x.expires_on && daysTo(x.expires_on) <= 14).length;
      const body = due || docs ? [due && `${due} service${due === 1 ? "" : "s"} due this week`, docs && `${docs} document${docs === 1 ? "" : "s"} expiring`].filter(Boolean).join(" · ") + " — tap for today's check." : "Your car looks good. Tap for today's weather and fuel prices.";
      list.push({ id: idOf("morning"), title: "Good morning — your car check", body, schedule: { on: { hour: hh || 7, minute: mm || 0 }, allowWhileIdle: true }, smallIcon: "ic_stat_motiq", iconColor: "#212121" });
    }
    // Weekly summary: Sundays at 6 pm.
    if (prefs.weeklySummary !== false) list.push({ id: idOf("weekly"), title: "Your week with Motiq", body: "Distance, money spent, your driving score and what's coming up.", schedule: { on: { weekday: 1, hour: 18, minute: 0 }, allowWhileIdle: true }, smallIcon: "ic_stat_motiq", iconColor: "#212121" });
    if (list.length) await LocalNotifications.schedule({ notifications: list.slice(0, 60) });
  } catch (e) { console.warn("reminders", e); }
}
