// push: sends phone notifications (Web Push) for CREW.
//
// Who calls it:
//   * the database, straight after a nudge / reaction / today's tick is saved (triggers in 008_notifications.sql)
//   * a timer (pg_cron) every 5 minutes, to send gym reminders at each person's chosen time
//   * the app's "Send a test" button (signed in, so we know who to send it to)
//
// Deployed with JWT verification OFF, because the database calls it without a login. That's safe because
// it never trusts what it's told: it re-reads every nudge/reaction/tick from the database before sending,
// and logs what it sent so the same notification can't go out twice.
//
// How Web Push works, in short: when you turn notifications on, your phone gives the app an address at
// Apple's (or Google's) push service plus two keys. To notify you we ENCRYPT the message with your keys
// (so Apple can't read it), SIGN the request with our VAPID key (so Apple knows it's really us), and POST it
// to that address. Apple then wakes your phone and our service worker shows the notification.

const SB_URL = (globalThis as any).Deno?.env.get("SUPABASE_URL") ?? "";
// (also handy for checking the setup: POST {"type":"ping"} says whether the server key and VAPID keys were found)
// The server key: newer projects get "sb_secret_…" keys (SUPABASE_SECRET_KEYS), older ones a JWT service-role key.
const env = (k: string) => (globalThis as any).Deno?.env.get(k) ?? "";
const SB_KEY = (() => { try { const s = JSON.parse(env("SUPABASE_SECRET_KEYS") || "{}"); return s.default || Object.values(s)[0] || ""; } catch { return ""; } })()
  || env("SUPABASE_SERVICE_ROLE_KEY");
const keyHeaders = (): Record<string, string> => SB_KEY.startsWith("eyJ") ? { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } : { apikey: SB_KEY };
const APP_URL = "https://empiricaldp.github.io/gym-streak/";
const TZ = "Australia/Sydney";

// ---------- small helpers ----------
const enc = new TextEncoder();
export const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const cat = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of parts){ out.set(p, i); i += p.length; } return out; };
const hkdf = async (salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) => {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
};

// ---------- VAPID: proves the notification comes from us (a signed token, RFC 8292) ----------
export async function vapidHeader(endpoint: string, pub: string, priv: string, subject = APP_URL){
  const p = unb64u(pub);
  const key = await crypto.subtle.importKey("jwk",
    { kty: "EC", crv: "P-256", d: priv, x: b64u(p.slice(1, 33)), y: b64u(p.slice(33, 65)), ext: true },
    { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(head + "." + body)));
  return `vapid t=${head}.${body}.${b64u(sig)}, k=${pub}`;
}

// ---------- Encryption: only the receiving phone can read the message (RFC 8291, "aes128gcm") ----------
export async function encrypt(payload: string, p256dh: string, auth: string){
  const uaPub = unb64u(p256dh), authSecret = unb64u(auth);
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]) as CryptoKeyPair;
  const asPub = new Uint8Array(await crypto.subtle.exportKey("raw", eph.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", uaPub, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, eph.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, cat(enc.encode("WebPush: info\0"), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aes, cat(enc.encode(payload), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);            // record size 4096
  return cat(salt, rs, new Uint8Array([asPub.length]), asPub, sealed);
}

// ---------- database (service role: this function can see everything, so it's careful what it sends) ----------
async function rest(path: string, init: RequestInit = {}){
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, { ...init,
    headers: { ...keyHeaders(), "Content-Type": "application/json", ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`${path.split("?")[0]}: ${r.status} ${await r.text()}`);
  return r.status === 204 ? null : r.json();
}
const inList = (ids: string[]) => `in.(${ids.map(encodeURIComponent).join(",")})`;
const sydneyDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());   // "2026-10-09"
let vapid: { pub: string; priv: string } | null = null;
async function keys(){
  if (!vapid){
    const rows = await rest("push_config?select=k,v&k=in.(vapid_public,vapid_private)");
    const get = (k: string) => rows.find((r: any) => r.k === k)?.v;
    vapid = { pub: get("vapid_public"), priv: get("vapid_private") };
  }
  return vapid;
}
// "first time only": returns true if this exact notification hasn't been sent before
async function firstTime(kind: string, to: string, ref: string, day: string){
  const rows = await rest("push_log?on_conflict=kind,to_user,ref,day", { method: "POST",
    headers: { Prefer: "resolution=ignore-duplicates,return=representation" }, body: JSON.stringify({ kind, to_user: to, ref, day }) });
  return Array.isArray(rows) && rows.length > 0;
}

type Note = { title: string; body: string; tag?: string; url?: string };
async function send(userIds: string[], note: Note){
  if (!userIds.length) return { sent: 0, removed: 0 };
  const { pub, priv } = await keys();
  const subs = await rest(`push_subs?select=endpoint,p256dh,auth&user_id=${inList(userIds)}`);
  let sent = 0, removed = 0;
  await Promise.all(subs.map(async (s: any) => {
    try {
      const r = await fetch(s.endpoint, { method: "POST", body: await encrypt(JSON.stringify({ url: APP_URL, ...note }), s.p256dh, s.auth),
        headers: { Authorization: await vapidHeader(s.endpoint, pub, priv), "Content-Encoding": "aes128gcm",
                   "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "normal" } });
      if (r.ok) sent++;
      else if (r.status === 404 || r.status === 410){       // phone unsubscribed / app deleted: forget this address
        await rest(`push_subs?endpoint=eq.${encodeURIComponent(s.endpoint)}`, { method: "DELETE" }); removed++;
      } else console.log("push failed", r.status, await r.text());
    } catch (e){ console.log("push error", String(e)); }
  }));
  return { sent, removed };
}
// ---------- dates + streak maths (same rules as the app: rest days skipped, freezes keep it alive, today isn't over yet) ----------
const addDays = (d: string, n: number) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const dowOf = (d: string) => (new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7;      // Mon = 0
type Ctx = { id: string; name: string; plan: any[]; since: string; track_start: string; days: Set<string>; frozen: Set<string> };
const slotOf = (m: Ctx, d: string) => (m.plan || [])[dowOf(d)] || null;
const gymDay = (m: Ctx, d: string) => { const s = slotOf(m, d); return !!s && !s.opt; };
const hasDay = (m: Ctx, d: string) => m.days.has(d) || (d < m.track_start && d >= m.since && gymDay(m, d));
function streak(m: Ctx){
  const t = sydneyDay(); let n = 0;
  for (let d = t, i = 0; d >= m.since && i < 800; d = addDays(d, -1), i++){
    if (!gymDay(m, d)) continue;
    if (hasDay(m, d)) n++;
    else if (m.frozen.has(d) || d === t) continue;
    else break;
  }
  return n;
}
// Everything needed to personalise a message, for several people in 3 queries
async function contexts(ids: string[]): Promise<Map<string, Ctx>> {
  const out = new Map<string, Ctx>(); if (!ids.length) return out;
  const from = addDays(sydneyDay(), -800);
  const [ps, cs, fs] = await Promise.all([
    rest(`profiles?select=id,name,plan,since,track_start&id=${inList(ids)}`),
    rest(`checkins?select=user_id,day&user_id=${inList(ids)}&day=gte.${from}&limit=20000`),
    rest(`freezes?select=user_id,day&user_id=${inList(ids)}&day=gte.${from}`),
  ]);
  for (const p of ps) out.set(p.id, { ...p, days: new Set(), frozen: new Set() });
  for (const c of cs) out.get(c.user_id)?.days.add(c.day);
  for (const f of fs) out.get(f.user_id)?.frozen.add(f.day);
  return out;
}
const dayWord = (d: string) => d === sydneyDay() ? "today" : d === addDays(sydneyDay(), -1) ? "yesterday"
  : "on " + new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });

const people = async (ids: string[]) =>
  ids.length ? await rest(`profiles?select=id,name,plan,is_public,share_attendance,share_split,notif_nudge,notif_react,notif_crew&id=${inList(ids)}`) : [];
const EMOJI: Record<string, string> = { fire: "🔥", muscle: "💪", clap: "👏" };

// ---------- the wording ----------
// Every notification has the same shape:
//   title = emoji + who/what happened           ("👊 Meha nudged you")
//   body  = the detail about YOU + what to do     ("Push day and it's not logged yet. Your 6-day streak is on the line.")
// Pure functions (no database), so tests can check every variation.
const streakLine = (n: number) => n >= 2 ? `Your ${n}-day streak is on the line.` : "Start a streak today.";
export function nudgeNote(fromName: string, me: Ctx): Note {
  const t = sydneyDay(), w = slotOf(me, t)?.w;
  const body = me.days.has(t) ? "You've already trained today. Show them the receipts 😤"
    : gymDay(me, t) ? `${w ? w + " day" : "Gym day"} and it's not logged yet. ${streakLine(streak(me))}`
    : "It's a rest day for you, but they're keeping you honest. Bonus session?";
  return { title: `👊 ${fromName} nudged you`, body, tag: "nudge" };
}
export function reactionNote(fromName: string, emoji: string, me: Ctx, day: string): Note {
  const w = slotOf(me, day)?.w, n = streak(me);
  return { title: `${EMOJI[emoji] || "👏"} ${fromName} reacted to your session`,
    body: `${w ? w + " session" : "Your session"} ${dayWord(day)}.${n >= 2 ? ` ${n}-day streak and counting.` : " Keep it rolling."}`, tag: "react" };
}
export function crewNote(who: Ctx, showWorkout: boolean, me: Ctx): Note {
  const t = sydneyDay(), w = showWorkout ? slotOf(who, t)?.w : null, n = streak(who), mine = slotOf(me, t)?.w;
  const done = `${w ? w + " done" : "Session logged"}${n >= 2 ? ` · ${n}-day streak` : ""}.`;
  const you = me.days.has(t) ? "You've both trained today 🤝"
    : gymDay(me, t) ? `Your ${mine ? mine + " session" : "session"} is still waiting.`
    : "Rest day for you, so enjoy it.";
  return { title: `💪 ${who.name} just trained`, body: `${done} ${you}`, tag: "crew-" + who.id };
}
export function reminderNote(me: Ctx): Note {
  const w = slotOf(me, sydneyDay())?.w;
  return { title: `⏰ ${w ? w + " day" : "Gym day"}: not logged yet`, body: `${streakLine(streak(me))} Train, then tap to log it.`, tag: "remind" };
}
export const testNote = (): Note => ({ title: "✅ Notifications are on",
  body: "You'll get nudges, reactions, crew sessions and gym reminders here. Change them any time in the You tab.", tag: "test" });

// ---------- the four kinds of notification ----------
async function onNudge(r: any){
  const found = await rest(`nudges?select=from_user&from_user=eq.${r.from_user}&to_user=eq.${r.to_user}&day=eq.${r.day}`);
  if (!found.length) return { skipped: "not found" };
  const [from, to] = await Promise.all([people([r.from_user]), people([r.to_user])]);
  if (!from[0] || !to[0]?.notif_nudge) return { skipped: "off" };
  if (!await firstTime("nudge", r.to_user, r.from_user, r.day)) return { skipped: "dupe" };
  const me = (await contexts([r.to_user])).get(r.to_user)!;
  return send([r.to_user], nudgeNote(from[0].name, me));
}
async function onReaction(r: any){
  const found = await rest(`reactions?select=emoji&from_user=eq.${r.from_user}&to_user=eq.${r.to_user}&day=eq.${r.day}&emoji=eq.${r.emoji}`);
  if (!found.length) return { skipped: "not found" };
  const [from, to] = await Promise.all([people([r.from_user]), people([r.to_user])]);
  if (!from[0] || !to[0]?.notif_react) return { skipped: "off" };
  if (!await firstTime("react", r.to_user, r.from_user + ":" + r.emoji, r.day)) return { skipped: "dupe" };
  const me = (await contexts([r.to_user])).get(r.to_user)!;
  return send([r.to_user], reactionNote(from[0].name, r.emoji, me, r.day));
}
async function onCheckin(r: any){
  if (r.day !== sydneyDay()) return { skipped: "not today" };          // filling in old days isn't news
  const found = await rest(`checkins?select=day&user_id=eq.${r.user_id}&day=eq.${r.day}`);
  if (!found.length) return { skipped: "not found" };
  const [who] = await people([r.user_id]);
  if (!who || !who.is_public || !who.share_attendance) return { skipped: "private" };   // respect their privacy choice
  const others = await rest(`profiles?select=id&notif_crew=eq.true&id=neq.${r.user_id}`);
  const to: string[] = [];
  for (const o of others) if (await firstTime("crew", o.id, r.user_id, r.day)) to.push(o.id);   // once per person per day, even if they untick + tick
  const ctx = await contexts([r.user_id, ...to]);
  let sent = 0;
  for (const id of to){ const me = ctx.get(id); if (me) sent += (await send([id], crewNote(ctx.get(r.user_id)!, who.share_split, me))).sent; }
  return { to: to.length, sent };
}
async function onReminders(){
  const due = await rest("rpc/due_reminders", { method: "POST", body: "{}" });   // also marks them as reminded today
  const ctx = await contexts(due.map((d: any) => d.uid));
  let sent = 0;
  for (const d of due){ const me = ctx.get(d.uid); if (me) sent += (await send([d.uid], reminderNote(me))).sent; }
  return { due: due.length, sent };
}
async function onTest(req: Request){
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const u = await fetch(`${SB_URL}/auth/v1/user`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${token}` } });
  if (!u.ok) return { error: "sign in first" };
  const { id } = await u.json();
  return send([id], testNote());
}

export async function handle(req: Request){
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  let out: unknown;
  try {
    const b = await req.json().catch(() => ({}));
    if (b.type === "nudges") out = await onNudge(b.record);
    else if (b.type === "reactions") out = await onReaction(b.record);
    else if (b.type === "checkins") out = await onCheckin(b.record);
    else if (b.type === "reminders") out = await onReminders();
    else if (b.type === "test") out = await onTest(req);
    else if (b.type === "ping") out = { key: SB_KEY ? SB_KEY.slice(0, 8) + "…" : "missing", vapid: !!(await keys()).priv };
    else out = { error: "unknown type" };
  } catch (e){ console.log(String(e)); out = { error: String(e) }; }
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...CORS } });
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
