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
// Everything that comes in the request body is only used to FIND a row; it's validated first and every
// value that ends up in a notification is re-read from the database.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (x: unknown) => typeof x === "string" && UUID.test(x);
const isDay = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const isId = (x: unknown) => /^\d{1,15}$/.test(String(x ?? ""));
const fresh = (ts: string, mins = 15) => Date.now() - Date.parse(ts) < mins * 60e3;   // only notify about things that just happened
const inList = (ids: string[]) => `in.(${ids.map(encodeURIComponent).join(",")})`;
const sydneyDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());   // "2026-10-09"
// each person's own date ("today" for someone in India isn't always today in Sydney)
const dayIn = (tz?: string | null) => { try { return new Intl.DateTimeFormat("en-CA", { timeZone: tz || TZ }).format(new Date()); }
                                        catch { return sydneyDay(); } };
let vapid: { pub: string; priv: string } | null = null;
async function keys(){
  if (!vapid){
    const rows = await rest("push_config?select=k,v&k=in.(vapid_public,vapid_private)");
    const get = (k: string) => rows.find((r: any) => r.k === k)?.v;
    const v = { pub: get("vapid_public"), priv: get("vapid_private") };
    if (!v.pub || !v.priv) return v;                     // don't cache a half-set config
    vapid = v;
  }
  return vapid;
}
let secretCache: string | null = null;
async function hookSecret(){
  if (!secretCache){ const [row] = await rest("push_config?select=v&k=eq.hook_secret"); secretCache = row?.v || null; }
  return secretCache || "\u0000no-secret";          // no secret set = nothing gets in
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
type Ctx = { id: string; name: string; plan: any[]; since: string; track_start: string; tz?: string; days: Set<string>; frozen: Set<string> };
const slotOf = (m: Ctx, d: string) => (m.plan || [])[dowOf(d)] || null;
const gymDay = (m: Ctx, d: string) => { const s = slotOf(m, d); return !!s && !s.opt; };
const hasDay = (m: Ctx, d: string) => m.days.has(d) || (d < m.track_start && d >= m.since && gymDay(m, d));
function streak(m: Ctx){
  const t = dayIn(m.tz); let n = 0;
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
  const from = addDays(sydneyDay(), -801);
  const [ps, cs, fs] = await Promise.all([
    rest(`profiles?select=id,name,plan,since,track_start,tz&id=${inList(ids)}`),
    Promise.all(ids.map(id => rest(`checkins?select=user_id,day&user_id=eq.${id}&day=gte.${from}&order=day.desc&limit=1000`))).then(x => x.flat()),
    rest(`freezes?select=user_id,day&user_id=${inList(ids)}&day=gte.${from}`),
  ]);
  for (const p of ps) out.set(p.id, { ...p, days: new Set(), frozen: new Set() });
  for (const c of cs) out.get(c.user_id)?.days.add(c.day);
  for (const f of fs) out.get(f.user_id)?.frozen.add(f.day);
  return out;
}
const dayWord = (d: string, tz?: string) => d === dayIn(tz) ? "today" : d === addDays(dayIn(tz), -1) ? "yesterday"
  : "on " + new Date(d + "T12:00:00Z").toLocaleDateString("en-AU", { weekday: "long", timeZone: "UTC" });

const people = async (ids: string[]) =>
  ids.length ? await rest(`profiles?select=id,name,tz,plan,is_public,share_attendance,share_split,account,hide_split,notif_nudge,notif_react,notif_crew,notif_circle,notif_chat,notif_buds&id=${inList(ids)}`) : [];
const EMOJI: Record<string, string> = { fire: "🔥", muscle: "💪", clap: "👏" };

// ---------- the wording ----------
// Style E (picked by DP): short and to the point.
//   title = CAPITALS, what happened          ("DEVAM'S DONE. YOU'RE UP.")
//   body  = one short line of detail, joined with " · "   ("Lower ✓ · Uni gym boys 4 of 6 today")
// Pure functions (no database), so tests can check every variation.
const U = (x: string) => (x || "").toLocaleUpperCase("en");
const join = (...parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join(" · ");
const streakBit = (n: number) => n >= 2 ? `${n}-day streak` : null;
// time left before midnight, in that person's time zone ("4h 56m left")
export function leftToday(tz?: string | null, now = new Date()){
  const hm = new Intl.DateTimeFormat("en-GB", { timeZone: tz || TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
  const [h, m] = hm.split(":").map(Number), mins = 24 * 60 - (h * 60 + m);
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins}m left`;
}
export function nudgeNote(fromName: string, me: Ctx): Note {
  const t = dayIn(me.tz), w = slotOf(me, t)?.w, n = streak(me);
  const body = me.days.has(t) ? "Already trained today. Show them the receipts."
    : gymDay(me, t) ? `${w || "Today's session"}'s not logged. ${n >= 2 ? n + "-day streak on the line." : "Start a streak today."}`
    : "Rest day. Bonus session?";
  return { title: `${U(fromName)} NUDGED YOU`, body, tag: "nudge" };
}
export function reactionNote(fromName: string, emoji: string, me: Ctx, day: string): Note {
  const w = slotOf(me, day)?.w, n = streak(me), today = day === dayIn(me.tz);
  return { title: `${U(fromName)} ${EMOJI[emoji] || "👏"} YOUR SESSION`,
    body: join(w || "Session", today ? (n >= 2 ? `day ${n}` : "today") : dayWord(day, me.tz).replace(/^on /, "")), tag: "react" };
}
// circle = "🔥 Uni gym boys" when this came through a circle, tally = "4 of 6" trained today in it
export function crewNote(who: Ctx, showWorkout: boolean, me: Ctx, circle?: string | null, tally?: string | null): Note {
  const tw = dayIn(who.tz), t = dayIn(me.tz);                 // their day (what they trained) vs my day (what I've got on)
  const w = showWorkout ? slotOf(who, tw)?.w : null, name = U(who.name);
  const title = me.days.has(t) ? `${name} TRAINED TOO`
    : gymDay(me, t) ? `${name}'S DONE. YOU'RE UP.`
    : `${name} JUST TRAINED`;
  const body = join(`${w || "Session"} ✓`, circle ? `${circle}${tally ? " " + tally + " today" : ""}` : streakBit(streak(who)));
  return { title, body, tag: "crew-" + who.id };
}
export function reminderNote(me: Ctx, now = new Date()): Note {
  const w = slotOf(me, dayIn(me.tz))?.w;
  return { title: `${U(w || "Gym day")}. NOT LOGGED.`, body: join(streakBit(streak(me)) || "Start a streak", leftToday(me.tz, now) + " today"), tag: "remind" };
}
export const circleAddNote = (adder: string, circle: string, tally?: string | null): Note => ({ title: `YOU'RE IN ${U(circle)}`,
  body: join(`Added by ${adder}`, tally && `${tally} trained today`), tag: "circle" });
// A chat message: "MEHA" / "you coming tonight?"   or   "MEHA · 🔥 UNI GYM BOYS" / "gym at 6"
export function messageNote(fromName: string, body: string, chatKey: string, circle?: string | null): Note {
  const text = body.replace(/\s+/g, " ").trim();
  return { title: circle ? `${U(fromName)} · ${U(circle)}` : U(fromName),
    body: Array.from(text).length > 140 ? Array.from(text).slice(0, 139).join("") + "…" : text, tag: "chat-" + chatKey };
}
// Buds: someone budded you / asked to / accepted your request
export function budNote(fromName: string, kind: "budded" | "request" | "accepted", mutual: boolean): Note {
  const n = U(fromName);
  if (kind === "request") return { title: `${n} WANTS TO BE YOUR BUD`, body: "You're private. Open CREW to accept.", tag: "bud" };
  if (kind === "accepted") return { title: `${n} ACCEPTED`, body: mutual ? "You're Buds now 🤝" : "You're spotting them now.", tag: "bud" };
  return mutual ? { title: `${n} BUDDED YOU BACK`, body: "You're Buds now 🤝 Nudge and chat any time.", tag: "bud" }
                : { title: `${n} BUDDED YOU`, body: "Bud back to become Buds.", tag: "bud" };
}
export const testNote = (): Note => ({ title: "NOTIFICATIONS ON",
  body: "Nudges, reactions, crew sessions and reminders land here.", tag: "test" });

// How many people in a circle have trained today (each by their own date): "4 of 6"
async function circleTally(circleId: string){
  const ms = await rest(`circle_members?select=user_id&circle_id=eq.${circleId}`);
  const ids = ms.map((m: any) => m.user_id); if (!ids.length) return null;
  const [ps, cs] = await Promise.all([rest(`profiles?select=id,tz&id=${inList(ids)}`),
    rest(`checkins?select=user_id,day&user_id=${inList(ids)}&day=gte.${addDays(sydneyDay(), -2)}`)]);
  const done = new Set(cs.map((c: any) => c.user_id + "|" + c.day));
  const n = ps.filter((p: any) => done.has(p.id + "|" + dayIn(p.tz))).length;
  return `${n} of ${ids.length}`;
}

// ---------- the four kinds of notification ----------
async function onNudge(b: any){
  if (!isId(b?.id)) return { skipped: "bad" };
  const [r] = await rest(`nudges?select=id,from_user,to_user,day,created_at&id=eq.${b.id}`);   // the real row, by its id
  if (!r || !fresh(r.created_at)) return { skipped: "not found" };
  const [from, to] = await Promise.all([people([r.from_user]), people([r.to_user])]);
  if (!from[0] || !to[0]?.notif_nudge) return { skipped: "off" };
  // each nudge is its own row (Buds can nudge every 10 min), so dedupe per nudge id
  if (!await firstTime("nudge", r.to_user, r.from_user + ":" + r.id, r.day)) return { skipped: "dupe" };
  const me = (await contexts([r.to_user])).get(r.to_user)!;
  return send([r.to_user], nudgeNote(from[0].name, me));
}
async function onReaction(b: any){
  if (!isUuid(b?.from_user) || !isUuid(b?.to_user) || !isDay(b?.day) || !(b?.emoji in EMOJI)) return { skipped: "bad" };
  const [r] = await rest(`reactions?select=from_user,to_user,day,emoji,created_at&from_user=eq.${b.from_user}&to_user=eq.${b.to_user}&day=eq.${b.day}&emoji=eq.${b.emoji}`);
  if (!r || !fresh(r.created_at)) return { skipped: "not found" };
  const [from, to] = await Promise.all([people([r.from_user]), people([r.to_user])]);
  if (!from[0] || !to[0]?.notif_react) return { skipped: "off" };
  if (!await firstTime("react", r.to_user, r.from_user + ":" + r.emoji, r.day)) return { skipped: "dupe" };
  const me = (await contexts([r.to_user])).get(r.to_user)!;
  return send([r.to_user], reactionNote(from[0].name, r.emoji, me, r.day));
}
async function onCheckin(b: any){
  if (!isUuid(b?.user_id) || !isDay(b?.day)) return { skipped: "bad" };
  const [r] = await rest(`checkins?select=user_id,day,created_at&user_id=eq.${b.user_id}&day=eq.${b.day}`);
  if (!r || !fresh(r.created_at)) return { skipped: "not found" };
  const [who] = await people([r.user_id]);
  if (!who) return { skipped: "no profile" };
  if (r.day !== dayIn(who.tz)) return { skipped: "not today" };          // filling in old days isn't news (by THEIR date)
  const found = await rest(`checkins?select=day&user_id=eq.${r.user_id}&day=eq.${r.day}`);
  if (!found.length) return { skipped: "not found" };
  // recipient → circle label (null = not via a circle). One notification per person, however they're connected.
  const recips = new Map<string, { label: string; cid: string } | null>();
  // Who hears about it: their Spotters (everyone who buds them, request accepted) with crew activity on,
  // plus their circle-mates (below). Not the whole app any more.
  const spotters = (await rest(`buds?select=follower&followee=eq.${r.user_id}&status=eq.accepted`)).map((x: any) => x.follower);
  if (spotters.length)
    for (const o of await rest(`profiles?select=id&notif_crew=eq.true&id=${inList(spotters)}`)) recips.set(o.id, null);
  const mine = await rest(`circle_members?select=circle_id&user_id=eq.${r.user_id}`);   // circle-mates (even if private)
  if (mine.length){
    const ids = mine.map((x: any) => x.circle_id);
    const [mates, circles] = await Promise.all([
      rest(`circle_members?select=user_id,circle_id,muted&circle_id=${inList(ids)}&user_id=neq.${r.user_id}`),
      rest(`circles?select=id,name,emoji&id=${inList(ids)}`)]);
    const unmuted = mates.filter((m: any) => !m.muted);
    const wants = unmuted.length ? new Set((await rest(`profiles?select=id&notif_circle=eq.true&id=${inList([...new Set(unmuted.map((m: any) => m.user_id))] as string[])}`)).map((p: any) => p.id)) : new Set();
    for (const m of unmuted) if (wants.has(m.user_id) && !recips.has(m.user_id)){
      const c = circles.find((c: any) => c.id === m.circle_id); recips.set(m.user_id, c ? { label: `${c.emoji ? c.emoji + " " : ""}${c.name}`, cid: c.id } : null); }
  }
  const to: string[] = [];
  for (const id of recips.keys()) if (await firstTime("crew", id, r.user_id, r.day)) to.push(id);   // once per person per day, even if they untick + tick
  const ctx = await contexts([r.user_id, ...to]);
  const showWorkout = who.account ? !who.hide_split : who.share_split;
  let sent = 0;
  const tallies = new Map<string, string | null>();              // one count per circle, shared by everyone in it
  for (const id of to){
    const me = ctx.get(id), via = recips.get(id); if (!me) continue;
    if (via && !tallies.has(via.cid)) tallies.set(via.cid, await circleTally(via.cid).catch(() => null));
    sent += (await send([id], crewNote(ctx.get(r.user_id)!, showWorkout, me, via?.label, via ? tallies.get(via.cid) : null))).sent;
  }
  return { to: to.length, sent };
}
async function onCircleAdd(r: any){
  if (!isUuid(r?.circle_id) || !isUuid(r?.user_id)) return { skipped: "bad" };
  const found = await rest(`circle_members?select=added_by,joined_at&circle_id=eq.${r.circle_id}&user_id=eq.${r.user_id}`);
  if (!found.length || !found[0].added_by || found[0].added_by === r.user_id || !fresh(found[0].joined_at)) return { skipped: "not an add" };
  const [[adder], [to], [circle]] = await Promise.all([people([found[0].added_by]), people([r.user_id]),
    rest(`circles?select=name,emoji&id=eq.${r.circle_id}`)]);
  if (!adder || !circle || !to?.notif_circle) return { skipped: "off" };
  if (!await firstTime("circle_add", r.user_id, r.circle_id, sydneyDay())) return { skipped: "dupe" };
  return send([r.user_id], circleAddNote(adder.name, `${circle.emoji ? circle.emoji + " " : ""}${circle.name}`, await circleTally(r.circle_id).catch(() => null)));
}
async function onMessage(r: any){
  if (!isId(r?.id)) return { skipped: "bad" };
  const found = await rest(`messages?select=id,body,from_user,to_user,circle_id,created_at&id=eq.${r.id}`);   // still there (not deleted)?
  if (!found.length || !fresh(found[0].created_at, 5)) return { skipped: "not found" };
  const m = found[0], [from] = await people([m.from_user]);
  if (!from) return { skipped: "no sender" };
  let to: string[] = [], circle: string | null = null, key: string;
  if (m.to_user){
    to = [m.to_user]; key = "d:" + m.from_user;                       // the reader's key for this chat is the sender's id
  } else {
    const [mates, cs] = await Promise.all([
      rest(`circle_members?select=user_id,muted&circle_id=eq.${m.circle_id}&user_id=neq.${m.from_user}`),
      rest(`circles?select=name,emoji&id=eq.${m.circle_id}`)]);
    if (!cs.length) return { skipped: "no circle" };
    to = mates.filter((x: any) => !x.muted).map((x: any) => x.user_id);  // a muted circle stays quiet
    circle = `${cs[0].emoji ? cs[0].emoji + " " : ""}${cs[0].name}`; key = "c:" + m.circle_id;
  }
  if (!to.length) return { to: 0 };
  const wants = (await people(to)).filter((p: any) => p.notif_chat !== false).map((p: any) => p.id);
  const go: string[] = [];
  for (const id of wants) if (await firstTime("chat", id, String(m.id), sydneyDay())) go.push(id);
  return send(go, messageNote(from.name, m.body, key, circle));
}
async function budRow(b: any){
  if (!isUuid(b?.follower) || !isUuid(b?.followee)) return null;
  const [r] = await rest(`buds?select=follower,followee,status,created_at,accepted_at&follower=eq.${b.follower}&followee=eq.${b.followee}`);
  if (!r) return null;
  const [back] = await rest(`buds?select=status&follower=eq.${r.followee}&followee=eq.${r.follower}&status=eq.accepted`);
  return { ...r, mutual: !!back };
}
async function onBud(b: any){                                   // a new bud: tell the person who got budded
  const r = await budRow(b); if (!r || !fresh(r.created_at)) return { skipped: "not found" };
  const [[from], [to]] = await Promise.all([people([r.follower]), people([r.followee])]);
  if (!from || !to?.notif_buds) return { skipped: "off" };
  if (!await firstTime("bud", r.followee, r.follower, sydneyDay())) return { skipped: "dupe" };   // bud/unbud/bud again: once a day
  return send([r.followee], budNote(from.name, r.status === "pending" ? "request" : "budded", r.status === "accepted" && r.mutual));
}
async function onBudAccept(b: any){                             // a request was accepted: tell the person who asked
  const r = await budRow(b); if (!r || r.status !== "accepted" || !r.accepted_at || !fresh(r.accepted_at)) return { skipped: "not found" };
  const [[by], [to]] = await Promise.all([people([r.followee]), people([r.follower])]);
  if (!by || !to?.notif_buds) return { skipped: "off" };
  if (!await firstTime("bud_ok", r.follower, r.followee, sydneyDay())) return { skipped: "dupe" };
  return send([r.follower], budNote(by.name, "accepted", r.mutual));
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
    // Only the database (which knows the secret) may trigger notifications. "test" is checked separately
    // (it needs the person's own login and only ever notifies them).
    if (b.type !== "test" && req.headers.get("x-push-secret") !== await hookSecret())
      return new Response(JSON.stringify({ error: "not allowed" }), { status: 401, headers: { "Content-Type": "application/json", ...CORS } });
    if (b.type === "nudges") out = await onNudge(b.record);
    else if (b.type === "reactions") out = await onReaction(b.record);
    else if (b.type === "checkins") out = await onCheckin(b.record);
    else if (b.type === "circle_members") out = await onCircleAdd(b.record);
    else if (b.type === "messages") out = await onMessage(b.record);
    else if (b.type === "buds") out = await onBud(b.record);
    else if (b.type === "bud_accept") out = await onBudAccept(b.record);
    else if (b.type === "reminders") out = await onReminders();
    else if (b.type === "test") out = await onTest(req);
    else if (b.type === "ping") out = { ok: true, vapid: !!(await keys()).priv };
    else out = { error: "unknown type" };
  } catch (e){ console.log(String(e)); out = { error: "failed" }; }      // details stay in the logs
  return new Response(JSON.stringify(out), { headers: { "Content-Type": "application/json", ...CORS } });
}
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
if ((globalThis as any).Deno) (globalThis as any).Deno.serve(handle);
