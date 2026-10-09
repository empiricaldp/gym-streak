// CREW (repo: gym-streak) — the whole app. Screens are drawn from the `members` data; Supabase stores it.
"use strict";
// ================= Config =================
const PLATES = [
  {id:"red",name:"Red"},{id:"blue",name:"Blue"},{id:"yellow",name:"Butter"},{id:"green",name:"Green"},
  {id:"white",name:"Silver"},{id:"lavender",name:"Lavender"},{id:"pink",name:"Pink"}
];
const plateName = id => PLATES.find(p => p.id === id)?.name || "Silver";
// A little bumper plate with CREW stamped around the top of the rim (like a brand on real plates)
let plateSvgN = 0;
function plateSvg(id, size = 48){
  const arc = "crewarc" + (++plateSvgN);
  return `<svg class="plate-svg" width="${size}" height="${size}" viewBox="0 0 100 100" style="${pc({plate:id})}" aria-hidden="true">
    <circle cx="50" cy="50" r="48" class="ps-plate"/><circle cx="50" cy="50" r="44" class="ps-rim"/>
    <circle cx="50" cy="50" r="20" class="ps-hub"/><circle cx="50" cy="50" r="10" class="ps-hole"/>
    <path id="${arc}" d="M 23 50 A 27 27 0 0 1 77 50" fill="none"/>
    <text class="ps-brand"><textPath href="#${arc}" startOffset="51.77%" text-anchor="middle">CREW</textPath></text>
    <circle cx="50" cy="82" r="2.4" class="ps-dot"/></svg>`;
}

const MILESTONES = [
  {n:1,name:"Empty Bar"},{n:2,name:"Warm-Up Set"},{n:4,name:"Iron Month"},{n:6,name:"Six Pack"},
  {n:8,name:"Two Plates"},{n:12,name:"Quarter Grind"},{n:16,name:"Locked In"},{n:26,name:"Half Year"},{n:52,name:"Year of Iron"}
];
// SPLITS, BASICS, PRESETS and normalizeWorkout() come from split.js
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DAYS_LONG = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const BOLT = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>';

// ================= Dates =================
const pad = n => String(n).padStart(2,"0");
const key = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parse = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y,(m||1)-1,d||1); };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const dow = d => (d.getDay()+6)%7;
const today = () => { const n = new Date(); return new Date(n.getFullYear(),n.getMonth(),n.getDate()); };
const startOfWeek = d => addDays(new Date(d.getFullYear(),d.getMonth(),d.getDate()), -dow(d));
const fmt = d => d.getDate()+" "+d.toLocaleString("en-AU",{month:"short"});
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

// ================= Member maths =================
// A member doc: {name, plate, plan:[{w,opt}|null x7], since, trackStart, days:{date:1}}
const slot = (m,d) => (m.plan||[])[dow(d)] || null;
const isGym = (m,d) => { const s = slot(m,d); return !!s && !s.opt; };
const credited = (m,d) => d < parse(m.trackStart) && d >= parse(m.since) && isGym(m,d);
const ticked = (m,d) => !!(m.days && m.days[key(d)]);
const has = (m,d) => credited(m,d) || ticked(m,d);
// A streak freeze covers one missed gym day: it doesn't add to your streak, but it doesn't break it either.
const frozen = (m,d) => !!(m.frozen && m.frozen[key(d)]);
// Plate colour for a member. Butter yellow is pale, so things drawn ON it use dark ink (--on-c),
// and text drawn IN it uses a deeper gold on light backgrounds (--ct on cards, --cti on the dark "iron" panels).
// Pastel plates (butter yellow, lavender, pink) get dark ink on top and a deeper shade for text.
const PASTEL = { yellow:["#3b2f0a","yel"], lavender:["#2c2150","lav"], pink:["#4a1630","pink"] };
const pc = m => { const id = PLATES.some(p=>p.id===m.plate) ? m.plate : "white", p = PASTEL[id];
  return p ? `--c:var(--p-${id});--on-c:${p[0]};--ct:var(--${p[1]}-card);--cti:var(--${p[1]}-iron)` : `--c:var(--p-${id})`; };

// Day streak as it stood at the end of `end` (today, or e.g. the last day of a week for a recap)
function dayStreakAt(m, end){
  const t = today(), floor = parse(m.since);
  let n = 0;
  for (let d = new Date(end); d >= floor; d = addDays(d,-1)){
    if (!isGym(m,d)) continue;
    if (has(m,d)) n++;
    else if (frozen(m,d)) continue;            // frozen: skip over it
    else if (key(d) === key(t)) continue;      // today isn't over yet
    else break;
  }
  return n;
}
const dayStreak = m => dayStreakAt(m, today());
function bestStreak(m){
  let run=0,best=0; const t = today();
  for (let d = parse(m.since); d <= t; d = addDays(d,1)){
    if (!isGym(m,d)) continue;
    if (has(m,d)){ run++; best=Math.max(best,run); }
    else if (frozen(m,d)) continue;
    else if (d < t) run = 0;
  }
  return best;
}
function weekStats(m,start){
  let target=0,hit=0,bonus=0,missed=0,froze=0; const t = today();
  for (let i=0;i<7;i++){ const d = addDays(start,i);
    if (isGym(m,d)){ target++;
      if (has(m,d)) hit++;
      else if (frozen(m,d)){ hit++; froze++; }   // a freeze counts toward the week so your week number survives
      else if (d<t) missed++; }
    else if (ticked(m,d)) bonus++; }
  return {target,hit,bonus,missed,froze,over:addDays(start,6)<t,left:Math.max(0,target-hit)};
}
function weeksDone(m){
  const floor = startOfWeek(parse(m.since)); let n = 0;
  for (let s = addDays(startOfWeek(today()),-7); s >= floor; s = addDays(s,-7)){
    const w = weekStats(m,s); if (w.target && w.hit >= w.target) n++; else break;
  }
  return n;
}
const weekNo = m => weeksDone(m)+1;

// ================= State =================
let db = null, members = new Map(), myId = null, ready = false;
let reactions = [], nudges = [];                      // social bits
const body = { goals: [], height: null, weights: [], trainedSince: null };   // my private body data
let tab = "today", weekOffset = 0, trophyFor = null, ob = null; // ob = onboarding draft
try { tab = localStorage.getItem("gs-tab") || "today"; } catch(e){}
const me = () => myId ? members.get(myId) : null;
const roster = () => [...members.entries()].map(([id,m])=>({id,...m})).filter(m=>m.name && m.plan)
  .sort((a,b)=> (a.id===myId?-1:b.id===myId?1:0) || String(a.joined||"").localeCompare(String(b.joined||"")));
// Can I see this person's attendance, streaks and trophies? (Always yes for yourself.)
const sharesStats = m => !!m && (m.id === myId || (m.visible && !!m.since));
// ---- Buds (stage 1) ----
const BETA = !!window.GYM_BETA;
const ICON = (window.GYM_BETA ? "../" : "") + "icons/apple-touch-icon.png";
let youView = "profile";   // You tab: "profile" | "edit" | "settings"
let crewView = "buds", profileId = null, findQ = "", sentNudgeTo = new Set(), wnActive = false, wnDone = false, wnStep = 1, wnPv = null;
try { crewView = localStorage.getItem("gs-crewview") || "buds"; } catch(e){}
const isBud = m => !!m && m.iBud === "accepted";                       // I'm their bud (I can see them if private)
const budsCrew = () => statsCrew().filter(o => o.id === myId || isBud(o));
const requestsIn = () => [...members.values()].filter(m => m.theyBud === "pending");
const followersOf = () => [...members.values()].filter(m => m.theyBud === "accepted");
// Terminology: both budded each other = "Buds"; only you → you're "Spotting" them; only them → they're your "Spotter"
const isMutual = m => !!m && m.iBud === "accepted" && m.theyBud === "accepted";
const relation = m => isMutual(m) ? "buds" : m?.iBud === "accepted" ? "spotting" : m?.theyBud === "accepted" ? "spotter" : m?.iBud === "pending" ? "requested" : "";
const counts = () => { const all = [...members.values()].filter(m => m.id !== myId);
  // like Instagram: a Bud also counts in Spotting and in Spotters
  return { buds: all.filter(isMutual).length, spotting: all.filter(m => m.iBud === "accepted").length, spotters: all.filter(m => m.theyBud === "accepted").length }; };
const everyone = () => [...members.values()].filter(m => m.name && m.id !== myId).sort((a,b) => a.name.localeCompare(b.name));
// Nudges: Buds (both bud each other) every 10 minutes; circle-mates once a day; nobody else
const NUDGE_GAP_MIN = 10;
const nudgeWait = o => {   // minutes until I can nudge them again (0 = now)
  const last = nudges.filter(n => n.from_user === myId && n.to_user === o.id).map(n => Date.parse(n.created_at || 0)).sort((a,b) => b-a)[0];
  return last ? Math.max(0, Math.ceil(NUDGE_GAP_MIN - (Date.now() - last) / 60000)) : 0; };
let circles = [], circleId = null, circleMode = "view", circleDraft = null, pendingJoin = null, joinPreview = null;
const circleMate = o => !!o && circles.some(c => c.members.some(m => m.user_id === o.id));
const canNudge = o => !!o && o.id !== myId && (isMutual(o) ? nudgeWait(o) === 0 : circleMate(o) && !nudgedToday(o.id));
// the nudge control: a button, or "Nudged · 7m" (Buds) / "Nudged today" (circle-mates) while waiting; nothing for anyone else
const nudgeCtl = (o, attr) => o.id === myId || !(isMutual(o) || circleMate(o)) ? "" : canNudge(o)
  ? `<button type="button" class="${attr === "data-pnudge" ? "chip" : "nudge"}" ${attr}="${esc(o.id)}">👀 Nudge</button>`
  : isMutual(o) ? `<span class="nudged" data-wait>👀 Nudged · ${nudgeWait(o)}m</span>` : `<span class="nudged">👀 Nudged today</span>`;
const statsCrew = () => roster().filter(sharesStats);
const quietCrew = () => roster().filter(o => o.id !== myId && !sharesStats(o));
const workLabel = s => s && s.w ? esc(s.w) : "Gym day";   // split hidden -> just "Gym day"

// ---- Steps (from Apple Health via an iPhone Shortcut) ----
// Steps from Apple Health: built and working, but hidden for now (setup was too much effort for users).
// Flip to true to bring the steps card, steps leaderboard and setup guide back. The database side stays live.
const STEPS_ENABLED = false;
let stepsKey = null;
let stepsMode = "day";   // Crew steps leaderboard: "day" or "week"
try { stepsMode = localStorage.getItem("gs-steps") || "day"; } catch(e){}
const STEPS_URL = () => (window.GYM_CONFIG.SUPABASE_URL || "") + "/rest/v1/rpc/log_steps";
const num = n => Number(n || 0).toLocaleString("en-AU");
const hasSteps = m => !!m && Object.keys(m.steps || {}).length > 0;
const seesSteps = m => !!m && (m.id === myId || (m.isPublic && m.shareSteps)) && hasSteps(m);
const stepsOn = (m,d) => (m.steps || {})[key(d)];
const weekSteps = (m,start) => Array.from({length:7}, (_,i) => stepsOn(m, addDays(start,i)) || 0);
function stepsBars(m, start){
  const vals = weekSteps(m,start), max = Math.max(10000, ...vals), t = today();
  const bw = 30, gap = 14, h = 64;
  const bars = vals.map((v,i) => { const d = addDays(start,i), bh = v ? Math.max(3, Math.round(v/max*h)) : 0, x = i*(bw+gap);
    return `<rect x="${x}" y="${h-bh}" width="${bw}" height="${bh}" rx="4" class="${key(d)===key(t)?"sb-now":"sb"}"/>
      <rect x="${x}" y="${h-1}" width="${bw}" height="1" class="sb-base"/>
      <text x="${x+bw/2}" y="${h+14}" text-anchor="middle" class="sb-l">${DAYS[i][0]}</text>`; }).join("");
  const goal = h - Math.round(10000/max*h);
  return `<svg class="stepsbars" viewBox="0 0 ${7*bw+6*gap} ${h+18}" role="img" aria-label="Steps per day this week">
    <line x1="0" x2="${7*bw+6*gap}" y1="${goal}" y2="${goal}" class="sb-goal"/>${bars}</svg>`;
}
const LOCK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

// ================= Rendering =================
const $ = id => document.getElementById(id);
const main = () => $("main");

let newPlate = -1;   // index of the plate you just loaded, so only that one animates
function barbell(m, w){
  const n = Math.max(1, Math.min(8, w.target)), left = Math.ceil(n/2), right = Math.floor(n/2);
  const H = [64,58,52,46]; let svg = "";
  const plate = (x, i, k) => {
    const h = H[Math.min(i,3)], y = 44 - h/2, filled = k < w.hit;
    // A loaded plate: colour, a soft highlight down its face, and a small engraved "CREW" reading upwards
    return filled ? `<g class="pl${k === newPlate && m.id === myId ? " new" : ""}"><rect class="plate" x="${x}" y="${y}" width="13" height="${h}" rx="3"/>
        <rect class="sheen" x="${x}" y="${y}" width="13" height="${h}" rx="3"/>
        <rect class="rim" x="${x+1}" y="${y+1}" width="11" height="${h-2}" rx="2.5"/>
        <text class="pbrand" x="0" y="0" dy="2.1" text-anchor="middle" transform="translate(${x+6.5} 44) rotate(-90) translate(.75 0)">CREW</text></g>`
                  : `<rect class="slot" x="${x}" y="${y}" width="13" height="${h}" rx="3"/>`;
  };
  // fill order: L0, R0, L1, R1 ...
  for (let i=0;i<left;i++) svg += plate(98 - i*16, i, i*2);
  for (let i=0;i<right;i++) svg += plate(209 + i*16, i, i*2+1);
  let knurl = ""; for (let x=128;x<=192;x+=4) knurl += `<line class="knurl" x1="${x}" y1="41" x2="${x+3}" y2="47" stroke-width="1"/>`;
  return `<svg class="barbell" viewBox="0 0 320 88" role="img" aria-label="${w.hit} of ${w.target} plates loaded this week">
    <defs><linearGradient id="plsheen" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/>
      <stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient></defs>
    <rect class="rod" x="6" y="40" width="308" height="8" rx="3"/>
    <rect class="rod" x="20" y="37" width="96" height="14" rx="3"/><rect class="rod" x="204" y="37" width="96" height="14" rx="3"/>
    ${knurl}<rect class="collar" x="114" y="32" width="6" height="24" rx="2"/><rect class="collar" x="200" y="32" width="6" height="24" rx="2"/>${svg}</svg>`;
}

function quote(m){
  const t = today(), ds = dayStreak(m), w = weekStats(m,startOfWeek(t)), done = weeksDone(m);
  const next = MILESTONES.find(x=>x.n>done), s = slot(m,t);
  const others = statsCrew().filter(o=>o.id!==myId).sort((a,b)=>dayStreak(b)-dayStreak(a));
  const L = [];
  if (isGym(m,t) && !has(m,t)) L.push([`Day ${ds+1} is on the bar.`, `${s.w} today. Load it up.`]);
  if (isGym(m,t) && has(m,t)) L.push([`${ds} gym days straight.`, w.left ? `${w.left} more to close out Week ${weekNo(m)}.` : `Week ${weekNo(m)} is locked. Anything else is a bonus.`]);
  if (!isGym(m,t)) L.push(["Rest day. Growth happens here.", s?.opt ? `${s.w} is optional today. Log it as a bonus.` : "Eat, sleep, come back heavier."]);
  if (next) L.push([`${next.n-done} week${next.n-done===1?"":"s"} to “${next.name}”.`, `Finish Week ${weekNo(m)} to get there.`]);
  if (others[0] && dayStreak(others[0]) > ds) L.push([`${esc(others[0].name)} is on ${dayStreak(others[0])}. You're on ${ds}.`, "Just saying."]);
  if (w.hit===w.target && w.target) L.push(["Full bar this week.", "Every plate loaded. Respect."]);
  const G = { lose:["Every session burns. Stay consistent.","Fat loss is a streak game, not a sprint."],
              cut:["Cutting? Train heavy to keep the muscle.","Lift like you're bulking, eat like you're cutting."],
              maintain:["Maintenance mode: just show up.","Consistency keeps what you've built."],
              bulk:["Building muscle: eat, lift, sleep, repeat.","Growth needs fuel. Hit your protein."],
              recomp:["Recomp is slow and steady. Keep stacking days.","Lift heavy, eat clean, trust the process."],
              strength:["Stronger every week. Add a little weight.","Strength is a skill. Practise it."],
              fitness:["Moving every day beats perfect days.","Show up. That's the whole trick."],
              happy:["Be happy. The gym's just the bonus.","Good music, good set, good mood. That's a win."] };
  for (const g of (body.goals || [])) if (G[g]) L.push(G[g]);
  // "Keep an eye on my friends": point at someone who hasn't trained yet today
  if ((body.goals || []).includes("friends")){
    const slacker = others.find(o => isGym(o,t) && !has(o,t));
    L.push(slacker ? [`${esc(slacker.name)} hasn't trained yet today.`, "Keep an eye on them. Send a nudge from the crew list."]
                   : ["Your crew's all on it today.", "Keep an eye out. Keep each other honest."]);
  }
  if (trendLine()) L.push(["Your scale this month", trendLine()]);
  return L[(new Date().getHours()+t.getDate()) % L.length] || L[0];
}

function viewToday(){
  const m = me();
  if (!m) return viewJoin();
  const t = today(), s = slot(m,t), w = weekStats(m,startOfWeek(t)), done = ticked(m,t), gym = isGym(m,t);
  const [qa,qb] = quote(m);
  let hero = `<div class="card hero" style="${pc(m)}">
    <span class="label">Week ${weekNo(m)} · ${DAYS_LONG[dow(t)]}</span>
    <div class="work sign">${gym ? esc(s.w) : "Rest day"}</div>
    ${barbell(m,w)}
    <div class="plates-cap"><span>${w.hit}/${w.target} PLATES LOADED</span><span>${w.left ? w.left+" TO GO" : "FULL BAR"}</span></div>`;
  if (gym) hero += `<button class="cta ${done?"done":""}" id="logbtn" ${db?"":"disabled"}>${done?CHECK+" Session logged":"Log today's session"}</button>
      <p class="note" style="text-align:center">${done?"Tap again to undo.":"Tap after you've trained."}</p>`;
  else hero += `<button class="cta ghost ${done?"done":""}" id="logbtn" ${db?"":"disabled"}>${done?CHECK+" Bonus logged":"+ Log a bonus session"}</button>
      <p class="note" style="text-align:center">Rest days never break your streak.</p>`;
  if (receivedLine(t)) hero += `<p class="recv">${receivedLine(t)}</p>`;
  hero += `</div>`;
  const tiles = `<div class="tiles" style="${pc(m)}">
    <div class="tile accent"><b class="sign mono-n">${dayStreak(m)}</b><span class="label">Day streak</span></div>
    <div class="tile"><b class="sign">${weekNo(m)}</b><span class="label">Week</span></div>
    <div class="tile"><b class="sign">${bestStreak(m)}</b><span class="label">Best run</span></div></div>`;
  const q = `<div class="card quote"><span class="bolt">${BOLT}</span><div class="q">${qa}<small>${qb}</small></div></div>`;
  const crew = roster().filter(o => o.id !== myId && isBud(o) && sharesStats(o));   // just your buds
  let crewHtml = "";
  if (crew.length){
    crewHtml = `<div class="sec"><h2 class="sign">Your crew today</h2><span class="label">${crew.length} ${crew.length===1?"person":"people"}</span></div><div class="list">` +
      crew.map(o=>{
        if (!sharesStats(o)) return `<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
          <span class="note">${isGym(o,t)?workLabel(slot(o,t)):"Rest day"} · keeps stats private</span></div><span class="status rest">${LOCK}</span></div>`;
        const st = isGym(o,t) ? (has(o,t)?"done":"todo") : (ticked(o,t) ? "done" : "rest");
        const action = st === "done" ? reactBar(o,t)
          : st === "todo" ? nudgeCtl(o, "data-nudge") : "";
        return `<div class="li crewrow tappable" data-profile="${esc(o.id)}" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
          <span class="note">${isGym(o,t)?workLabel(slot(o,t)):"Rest day"} · ${dayStreak(o)} day streak</span>${action ? `<span class="rowact">${action}</span>` : ""}</div>
          <span class="status ${st}">${st==="done"?"Done":st==="todo"?"Not yet":"Rest"}</span></div>`; }).join("") + `</div>`;
  } else crewHtml = `<div class="card"><span class="label">Your crew</span><p style="margin:6px 0 0;font-weight:600">Your buds' sessions show up here.</p>
      <p class="note">Bud your gym mates to see who's trained today and nudge them. Bud each other and you're Buds.</p>
      <button class="cta ghost" data-goto-find style="margin-top:10px;font-size:18px">Find your buds</button></div>`;

  // Existing members get asked once; anyone hidden gets a gentle nudge to share.
  let pvHtml = "";
  // Bud requests waiting for me
  for (const r of requestsIn().slice(0,3)) pvHtml += `<div class="card banner"><span class="big-emoji">🤝</span><div class="grow"><b>${esc(r.name)} wants to be your bud</b>
      <span class="note">Accept to let them see your profile and streak.</span>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" data-accept="${esc(r.id)}">Accept</button><button type="button" class="linkbtn" data-decline="${esc(r.id)}">Decline</button></span></div></div>`;
  if (false){
    pvDraft = pvDraft || pvFrom(m);
    pvHtml = `<div class="card pvcard"><span class="label">New</span><h2 class="sign" style="margin:4px 0 2px;font-size:30px">Choose what your crew sees</h2>
      <p class="note">You can change this any time in the You tab.</p>${privacyPicker(pvDraft)}
      <button class="cta" id="pv-save">Save</button></div>`;
  } else if (false){
    pvHtml = `<div class="card quote"><span class="bolt">${LOCK}</span><div class="q">You're hidden from the leaderboard.<small>Share your streak so the crew can see you showing up.</small>
      <button class="linkbtn" id="pv-open" style="padding-left:0">Privacy settings</button></div></div>`;
  }
  // Nudges, freeze offer, goal question, Monday recap: at most a couple of cards at the top
  let topHtml = "";
  const myNudges = nudgesForMe();
  if (myNudges.length){
    const who = [...new Set(myNudges.map(n => nameOf(n.from_user)))];
    topHtml += `<div class="card banner nudgebanner"><span class="big-emoji">👀</span><div class="grow"><b>${esc(who.join(" & "))} nudged you</b>
      <span class="note">${isGym(m,t) && !has(m,t) ? `${esc(s.w)} is waiting. Go get it.` : "They're keeping you honest."}</span></div>
      <button type="button" class="chip" id="nudge-ok">Got it</button></div>`;
  }
  // Names made before the name rules (e.g. emoji): ask them to pick a new one
  if (nameProblem(m.name)) topHtml += `<div class="card banner"><span class="big-emoji">✏️</span><div class="grow"><b>Pick a new name</b>
      <span class="note">Names can't have emoji any more, so the crew can find and nudge you.</span></div>
      <button type="button" class="chip" id="rename-go">Rename</button></div>`;
  const fo = freezeOffer(m);
  if (fo) topHtml += `<div class="card banner freezebanner"><span class="big-emoji">❄️</span><div class="grow"><b>You missed ${DAYS_LONG[dow(fo.day)]}</b>
      <span class="note">Use this month's streak freeze to keep your ${fo.saved}-day streak. One per month.</span></div>
      <button type="button" class="cta" id="freeze-go" style="font-size:16px;padding:10px 14px">Use freeze</button></div>`;
  if (m.privacyChosen && !(body.goals || []).length) topHtml += `<div class="card"><span class="label">One quick thing</span>
      <h2 class="sign" style="margin:4px 0 8px;font-size:28px">What are your goals?</h2>${goalPicker(goalDraft)}
      <button class="cta" id="goal-save" style="margin-top:10px" ${goalDraft.length ? "" : "disabled"}>Save</button>
      <p class="note" style="margin-top:8px">Only you see this. It tunes your motivation messages.</p></div>`;
  const recapKey = "gs-recap-" + key(startOfWeek(t));
  let recapSeen = false; try { recapSeen = !!localStorage.getItem(recapKey); } catch(_){}
  const lastWk = weekStats(m, addDays(startOfWeek(t), -7));
  if (dow(t) <= 1 && !recapSeen && lastWk.target && addDays(startOfWeek(t),-7) >= startOfWeek(parse(m.since)))
    topHtml += `<div class="card banner"><span class="big-emoji">📊</span><div class="grow"><b>Your weekly recap is ready</b>
      <span class="note">${lastWk.hit}/${lastWk.target} last week. See it and share it.</span></div>
      <button type="button" class="chip" id="recap-open">See it</button></div>`;

  let stepsHtml = "";
  if (!STEPS_ENABLED){ /* steps hidden */ }
  else if (hasSteps(m)){
    const ws = startOfWeek(t), vals = weekSteps(m, ws), tot = vals.reduce((a,b)=>a+b,0);
    const daysIn = Math.max(1, vals.filter(v=>v>0).length), todayN = stepsOn(m,t), yN = stepsOn(m, addDays(t,-1));
    const synced = m.stepsAt ? new Date(m.stepsAt).toLocaleString("en-AU",{weekday:"short",hour:"numeric",minute:"2-digit"}) : "";
    stepsHtml = `<div class="card stepscard" style="${pc(m)}">
      <div class="steps-top"><div><span class="label">Steps ${todayN != null ? "today" : "yesterday"}</span>
        <b class="sign steps-n">${num(todayN != null ? todayN : yN)}</b></div>
        <div class="steps-side"><span class="label">This week</span><b class="mono">${num(tot)}</b><span class="note">avg ${num(Math.round(tot/daysIn))}/day</span></div></div>
      ${stepsBars(m, ws)}
      <p class="note">Dashed line = 10,000. Last synced ${esc(synced)}.${m.shareSteps && m.isPublic ? " Shared with crew." : " Only you can see these."}</p></div>`;
  } else {
    stepsHtml = `<div class="card quote"><span class="bolt"><svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8.5 2.5c1.6 0 2.6 1.6 2.6 3.7 0 2.4-1.2 4.1-2.8 4.1S5.6 8.8 5.6 6.5c0-2.2 1.3-4 2.9-4zm6.8 4.8c1.6 0 2.9 1.8 2.9 4 0 2.3-1.1 3.8-2.7 3.8s-2.8-1.7-2.8-4.1c0-2.1 1-3.7 2.6-3.7zM6.4 12.6c1.3-.2 2.6.8 2.8 2.6.3 2-.6 3.3-1.9 3.5-1.3.2-2.4-.9-2.6-2.7-.3-1.9.4-3.2 1.7-3.4zm11.2 4.6c1.3.2 2 1.5 1.7 3.4-.2 1.8-1.3 2.9-2.6 2.7-1.3-.2-2.2-1.5-1.9-3.5.2-1.8 1.5-2.8 2.8-2.6z"/></svg></span>
      <div class="q">Track your steps here<small>Connect Apple Health with a 2-minute Shortcut.</small>
      <button class="linkbtn" id="steps-setup" style="padding-left:0">Set it up</button></div></div>`;
  }
  const circleRow = circles.length ? `<div class="sec"><h2 class="sign">Your circles</h2></div><div class="circlerow">${circles.map(c => circleCard(c, true)).join("")}</div>` : "";
  main().innerHTML = `<div class="view">${pvHtml}${topHtml}${hero}${tiles}${stepsHtml}${q}${crewHtml}${circleRow}</div>`;
  $("logbtn").onclick = () => toggleDay(t);
  main().querySelectorAll("[data-react]").forEach(b => b.onclick = () => toggleReaction(b.dataset.react, b.dataset.to, b.dataset.day));
  main().querySelectorAll("[data-nudge]").forEach(b => b.onclick = () => { b.disabled = true; sendNudge(b.dataset.nudge); });
  main().querySelectorAll("[data-goal]").forEach(b => b.onclick = () => { goalDraft = toggleIn(goalDraft, b.dataset.goal); render(); });
  if ($("goal-save")) $("goal-save").onclick = async () => { $("goal-save").disabled = true; if (await saveGoals(goalDraft)){ goalDraft = []; toast("Goals saved"); } };
  if ($("nudge-ok")) $("nudge-ok").onclick = dismissNudges;
  if ($("rename-go")) $("rename-go").onclick = () => startOnboarding(true, "name");
  if ($("freeze-go")) $("freeze-go").onclick = () => { $("freeze-go").disabled = true; useFreeze(fo.day); };
  if ($("recap-open")) $("recap-open").onclick = () => { try { localStorage.setItem(recapKey, "1"); } catch(_){} recapWhich = "last"; trophyFor = myId; setTab("trophies"); };
  if ($("steps-setup")) $("steps-setup").onclick =() => { setTab("you"); setTimeout(() => $("health")?.scrollIntoView({behavior:"smooth"}), 50); };
  if ($("pv-save")){
    wirePrivacy(pvDraft, render);
    $("pv-save").onclick = async () => { const b = $("pv-save"); b.disabled = true;
      if (await savePrivacy(pvDraft)){ pvDraft = null; toast("Privacy saved"); } else if ($("pv-save")) $("pv-save").disabled = false; };
  }
  if ($("pv-open")) $("pv-open").onclick = () => setTab("you");
}
let pvDraft = null, goalDraft = [];

function viewJoin(){
  main().innerHTML = `<div class="view">
    <div class="card hero" style="--c:var(--iron)">
      <span class="label">Welcome</span>
      <div class="work sign">Set up your plan</div>
      <p class="sub">6 quick questions: your name, your goal, your plate colour, your weekly split, how long you've been going, and what the crew can see. Then tick off every session and keep the streak alive.</p>
      <button class="cta" id="startob">Get started</button>
    </div>
    ${roster().length ? `<div class="sec"><h2 class="sign">Already here</h2><span class="label">${roster().length} lifting</span></div>
      <div class="list">${roster().map(o=>`<div class="li" style="${pc(o)}"><span class="dot"></span><span class="grow"><span class="nm">${esc(o.name)}</span><span class="note">${sharesStats(o) ? `Week ${weekNo(o)} · ${dayStreak(o)} day streak` : "Keeps stats private"}</span></span></div>`).join("")}</div>` : ""}
  </div>`;
  $("startob").onclick = () => startOnboarding(false);
}

function cellBtn(o,d){
  const s = slot(o,d), t = today(), done = has(o,d), cred = credited(o,d);
  const fz = !done && frozen(o,d);
  const st = !s ? (done?"done":"rest") : done ? "done" : fz ? "froze" : (!s.opt && d<t) ? "missed" : "open";
  const mine = o.id===myId && d<=t && !cred && db;
  const label = !s ? (done?"Bonus":"Rest") : workLabel(s);
  const small = fz ? "❄️ Freeze" : s?.opt ? "Optional" : "";
  return `<button class="cell ${st} ${mine?"mine":""}" ${mine?`data-day="${key(d)}"`:"disabled"} style="${pc(o)}" aria-label="${esc(o.name)} ${DAYS_LONG[dow(d)]}: ${label}, ${done?"done":"not done"}">
    <span class="t">${label}${small?`<small>${small}</small>`:""}</span><span class="ck">${CHECK}</span></button>`;
}

function viewCrew(){
  const seg = `<div class="seg levelseg crewseg" role="tablist">${[["buds","My crew"],["circles","Circles"],["everyone","Everyone"]].map(([id,l]) =>
    `<button type="button" role="tab" data-crewview="${id}" aria-pressed="${crewView===id}">${l}</button>`).join("")}</div>`;
  if (crewView === "circles"){ viewCirclesTab(seg); }
  else if (crewView === "everyone"){
    const top = seg + `<input class="field findq" id="find-q" type="search" placeholder="Search people" value="${esc(findQ)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="list peoplelist" id="people">${everyone().map(personRow).join("")}</div>
      <p class="note" id="find-none" hidden style="text-align:center">No one by that name.</p>`;
    crewBoard(statsCrew().filter(o => o.id === myId || !o.private), [], top, { title: "Public leaderboard", weekBoard: false });
    wireFind();
  } else {
    const list = budsCrew();
    const empty = list.length <= 1 ? `<div class="card"><p style="margin:0;font-weight:600">No one here yet.</p><p class="note">Bud your gym mates to see their weeks and streaks here.</p>
      <button class="cta ghost" data-goto-find style="margin-top:10px;font-size:18px">Find your buds</button></div>` : "";
    crewBoard(list, [], seg + empty, { title: "My crew", weekBoard: list.length > 1 });
  }
  main().querySelectorAll("[data-crewview]").forEach(b => b.onclick = () => { crewView = b.dataset.crewview; try { localStorage.setItem("gs-crewview", crewView); } catch(e){} render(); });
}
// One row in "Find people": plate, name, streak (or Private), bud button
function personRow(o){
  const rel = relation(o) === "spotter" ? " · Spots you" : relation(o) === "buds" ? " · 🤝 Buds" : "";
  const sub = (o.visible && sharesStats(o) ? `${dayStreak(o)} day streak · Week ${weekNo(o)}` : o.private ? `${LOCK} Private` : "Just joined") + rel;
  return `<div class="li prow tappable" data-profile="${esc(o.id)}" data-name="${esc(tidyName(o.name).toLowerCase())}" style="${pc(o)}"><span class="dot"></span>
    <div class="grow"><span class="nm">${esc(o.name)}</span><span class="note">${sub}</span></div>${budBtn(o)}</div>`;
}
function wireFind(){
  const q = $("find-q"); if (!q) return;
  const apply = () => { findQ = q.value; const n = tidyName(q.value).toLowerCase(); let shown = 0;
    main().querySelectorAll("#people [data-name]").forEach(r => { const hit = !n || r.dataset.name.includes(n); r.hidden = !hit; if (hit) shown++; });
    $("find-none").hidden = shown > 0; };
  q.oninput = apply; apply();
}
function crewBoard(list, quiet, top, opts){
  const t = today(), ws = startOfWeek(t);
  if (!list.length){ main().innerHTML = `<div class="view">${top}${opts.bottom || ""}</div>`; return; }
  const quietHtml = quiet.length ? `<div class="sec"><h2 class="sign">Keeping it private</h2><span class="label">${quiet.length}</span></div>
    <div class="list">${quiet.map(o=>`<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
      <span class="note">Not sharing attendance</span></div><span class="status rest">${LOCK}</span></div>`).join("")}</div>` : "";
  const ranked = [...list].sort((a,b)=> dayStreak(b)-dayStreak(a) || weeksDone(b)-weeksDone(a));
  const board = `<div class="list">${ranked.map((o,i)=>{
      const days = Array.from({length:7},(_,k)=>{ const d=addDays(ws,k); return `<i class="${has(o,d)?"d":frozen(o,d)?"f":isGym(o,d)?(d<t?"m":"g"):""}"></i>`; }).join("");
      return `<div class="li tappable" data-profile="${esc(o.id)}" style="${pc(o)}"><span class="rank">${i+1}</span><span class="dot"></span>
        <div class="grow"><span class="nm">${esc(o.name)}${o.id===myId?'<span class="youtag">YOU</span>':""}</span>
        <span class="week7" aria-label="This week">${days}</span><span class="note">Week ${weekNo(o)} · best ${bestStreak(o)}</span></div>
        <div class="big-n sign">${dayStreak(o)}<small>DAY STREAK</small></div></div>`; }).join("")}</div>`;
  const start = addDays(ws, weekOffset*7);
  const cols = `56px repeat(${list.length}, minmax(112px,1fr))`;
  let grid = `<div class="grid" style="grid-template-columns:${cols}"><div class="h"></div>` +
    list.map(o=>`<div class="h" style="${pc(o)}"><span class="dot"></span><span>${esc(o.name)}</span></div>`).join("");
  for (let i=0;i<7;i++){ const d = addDays(start,i);
    grid += `<div class="d ${key(d)===key(t)?"today":""}"><b class="sign">${DAYS[i]}</b><span>${fmt(d)}</span></div>` + list.map(o=>`<div class="c">${cellBtn(o,d)}</div>`).join("");
  }
  grid += `</div>`;
  const sums = list.map(o=>{ const w = weekStats(o,start);
    const tag = (w.over||!w.left) ? (w.hit>=w.target?["done","Target hit"]:["todo","Missed "+(w.target-w.hit)]) : w.missed?["todo","Missed "+w.missed]:["todo",w.left+" to go"];
    return `<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span><span class="note">${w.hit} of ${w.target} gym days${w.bonus?` · +${w.bonus} bonus`:""}</span></div><span class="status ${tag[0]}">${tag[1]}</span></div>`; }).join("");
  main().innerHTML = `<div class="view">
    ${top}<div class="sec"><h2 class="sign">${opts.title}</h2><span class="label">By day streak</span></div>
    <div class="crewkey" aria-hidden="true"><span><span class="week7"><i class="d"></i></span>Trained</span><span><span class="week7"><i class="m"></i></span>Missed</span><span><span class="week7"><i class="f"></i></span>Freeze</span><span><span class="week7"><i class="g"></i></span>To come</span></div>${board}
    ${(() => { if (!STEPS_ENABLED) return "";
      const sharers = roster().filter(seesSteps);
      if (!sharers.length) return "";
      // Daily view: today's steps. Steps usually sync at night, so if nobody has today yet, show yesterday.
      let dayRef = t, dayLabel = "Today";
      if (stepsMode === "day" && !sharers.some(o => stepsOn(o, t) > 0)){ dayRef = addDays(t, -1); dayLabel = "Yesterday"; }
      const sp = sharers.map(o => ({o, tot: stepsMode === "day" ? (stepsOn(o, dayRef) || 0) : weekSteps(o, ws).reduce((a,b)=>a+b,0)}))
        .filter(x => x.tot > 0).sort((a,b) => b.tot - a.tot);
      const top = sp[0]?.tot || 1;
      const toggle = `<div class="chips" role="group" aria-label="Steps period" style="margin-bottom:-4px">
        <button class="chip" data-sm="day" aria-pressed="${stepsMode==="day"}">Daily</button>
        <button class="chip" data-sm="week" aria-pressed="${stepsMode==="week"}">Weekly</button></div>`;
      const sub = stepsMode === "day" ? `${dayLabel} · ${fmt(dayRef)}` : `This week · ${fmt(ws)} – ${fmt(addDays(ws,6))}`;
      if (!sp.length) return `<div class="sec"><h2 class="sign">Steps</h2><span class="label">${sub}</span></div>${toggle}
        <div class="card"><p class="note" style="margin:0">No steps synced for ${stepsMode==="day" ? dayLabel.toLowerCase() : "this week"} yet.</p></div>`;
      return `<div class="sec"><h2 class="sign">Steps</h2><span class="label">${sub}</span></div>${toggle}<div class="list">${sp.map((x,i) =>
        `<div class="li" style="${pc(x.o)}"><span class="rank">${i+1}</span><span class="dot"></span><div class="grow"><span class="nm">${esc(x.o.name)}${x.o.id===myId?'<span class="youtag">YOU</span>':""}</span>
          <span class="stepmeter"><i style="width:${Math.round(x.tot/top*100)}%"></i></span></div><div class="big-n sign" style="font-size:28px">${num(x.tot)}<small>STEPS</small></div></div>`).join("")}</div>`; })()}
    ${opts.weekBoard === false ? "" : `<div class="sec"><h2 class="sign">Week board</h2></div>
    <div class="weeknav"><button class="navbtn" id="prev" aria-label="Previous week">‹</button>
      <div class="mid"><b class="sign">${weekOffset===0?"This week":weekOffset===-1?"Last week":"Week of "+fmt(start)}</b><span class="label">${fmt(start)} – ${fmt(addDays(start,6))}</span></div>
      <button class="navbtn" id="next" aria-label="Next week" ${weekOffset>=0?"disabled":""}>›</button></div>
    <div class="scrollx">${grid}</div>
    <p class="note">Tap your own column to tick a day you forgot, or to undo one.</p>
    <div class="list">${sums}</div>`}${quietHtml}${opts.bottom || ""}</div>`;
  main().querySelectorAll("[data-sm]").forEach(b => b.onclick = () => { stepsMode = b.dataset.sm; try{localStorage.setItem("gs-steps",stepsMode);}catch(e){} render(); });
  if ($("prev")) $("prev").onclick = () => { weekOffset--; render(); };
  if ($("next")) $("next").onclick = () => { if (weekOffset<0){ weekOffset++; render(); } };
  main().querySelectorAll("[data-day]").forEach(b => b.onclick = () => toggleDay(parse(b.dataset.day)));
}

function viewTrophies(){
  const list = statsCrew().filter(o => o.id === myId || isBud(o) || o.id === trophyFor);
  if (!list.length){ main().innerHTML = `<div class="card"><p style="margin:0;font-weight:600">Trophies show up once you join.</p></div>`; return; }
  if (!trophyFor || !list.some(o=>o.id===trophyFor)) trophyFor = myId && members.has(myId) ? myId : list[0].id;
  const m = list.find(o=>o.id===trophyFor);
  const done = weeksDone(m), next = MILESTONES.find(x=>x.n>done), prev = [...MILESTONES].reverse().find(x=>x.n<=done);
  const base = prev?prev.n:0, frac = next ? (done-base)/(next.n-base) : 1;
  let hist = ""; const ws = startOfWeek(today()), floor = startOfWeek(parse(m.since)); let c = 0;
  for (let s = addDays(ws,-7); s >= floor && c < 12; s = addDays(s,-7), c++){
    const w = weekStats(m,s);
    hist += `<div class="li hist"><span>Week of ${fmt(s)}</span><span class="mono">${w.hit}/${w.target}</span><span class="status ${w.hit>=w.target?"done":"todo"}">${w.hit>=w.target?"Hit":"Missed"}</span></div>`;
  }
  main().innerHTML = `<div class="view">
    <div class="chips" role="group" aria-label="Whose trophies">${list.map(o=>`<button class="chip" data-tp="${esc(o.id)}" aria-pressed="${o.id===m.id}" style="${pc(o)}"><span class="dot"></span>${esc(o.name)}</button>`).join("")}</div>
    ${m.id === myId ? `<div class="sec" style="margin-top:4px"><h2 class="sign">Weekly recap</h2></div>${recapCard(m)}<div class="sec"><h2 class="sign">Trophies</h2></div>` : ""}
    <div class="whero" style="${pc(m)}"><span class="ring"></span><span class="label">${esc(m.name)} is on</span>
      <span class="n sign">Week ${weekNo(m)}</span>
      <span class="s">${done} week${done===1?"":"s"} in a row · ${dayStreak(m)} day streak · best run ${bestStreak(m)}</span>
      ${next?`<span class="label" style="margin-top:10px">Next: ${next.name} in ${next.n-done} week${next.n-done===1?"":"s"}</span><div class="pg"><i style="width:${Math.round(frac*100)}%"></i></div>`:`<span class="label" style="margin-top:10px">Every milestone unlocked. Legend.</span>`}
    </div>
    <div class="sec"><h2 class="sign">Milestones</h2><span class="label">${MILESTONES.filter(x=>done>=x.n).length}/${MILESTONES.length}</span></div>
    <div class="badges">${MILESTONES.map(x=>`<div class="badge ${done>=x.n?"":"locked"}" style="${pc(m)}"><div class="medal"><b>${x.n}W</b></div><b class="bn sign">${x.name}</b><span>${done>=x.n?"Unlocked":x.n+" weeks"}</span></div>`).join("")}</div>
    <div class="sec"><h2 class="sign">History</h2></div>
    <div class="list">${hist || `<div class="li"><span class="note">The first finished week lands here next Monday.</span></div>`}</div></div>`;
  main().querySelectorAll("[data-tp]").forEach(b => b.onclick = () => { trophyFor = b.dataset.tp; render(); });
  if (m.id === myId) wireRecap(m);
}

function viewYou(){
  const m = me();
  if (m && youView === "profile") return viewProfile(true);
  if (m && youView.startsWith("list:")) return viewPeopleList(youView.slice(5));
  const link = location.origin + location.pathname.replace(/beta\/(index\.html)?$/, "");   // invites always go to the main app
  const invite = `<div class="card"><span class="label">Bring a friend in</span>
    <ol style="margin:10px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:15px">
      <li>Send them this link: <b class="mono" style="font-size:13px;word-break:break-all">${esc(link)}</b></li>
      <li>The app shows them how to add it to their Home Screen.</li>
      <li>They open it from there, tap <b>Create account</b> and answer 6 quick questions.</li></ol>
    <button class="cta ghost" id="copylink" style="margin-top:12px;font-size:18px">Copy link</button></div>`;
  const acct = `<p class="note" style="text-align:center">Signed in as ${esc(session?.user?.email || "")}</p>
    <button class="cta ghost" id="logout">Log out</button>`;
  if (!m){ main().innerHTML = `<div class="view"><div class="card"><p style="margin:0;font-weight:600">You haven't set up your plan yet.</p><p class="note">Go to Today and tap Get started.</p></div>${invite}${acct}</div>`; }
  else {
    const backBtn = `<button type="button" class="linkbtn pfback" id="you-back">‹ Profile</button>`;
    if (youView === "edit"){
      $("title").textContent = "Edit profile";
      main().innerHTML = `<div class="view">${backBtn}
      <div class="list editrows">
        <button type="button" class="li editrow" data-edit="name"><span class="grow"><span class="label">Name</span><b>${esc(m.name)}</b></span><span class="note">Edit</span><i class="chev r"></i></button>
        <button type="button" class="li editrow" data-edit="plate"><span class="grow"><span class="label">Plate colour</span><b style="display:flex;align-items:center;gap:8px">${plateSvg(m.plate, 22)}${plateName(m.plate)}</b></span><span class="note">Edit</span><i class="chev r"></i></button>
        <button type="button" class="li editrow" data-edit="split"><span class="grow"><span class="label">Split</span><b>${esc(splitLabel(m))}</b></span><span class="note">Edit</span><i class="chev r"></i></button>
      </div>
      <p class="note" style="text-align:center">Goals, height and weight are in ⚙️ Settings → Goal &amp; body.</p></div>`;
      main().querySelectorAll("[data-edit]").forEach(b => b.onclick = () => startOnboarding(true, b.dataset.edit));
      $("you-back").onclick = () => { youView = "profile"; render(); window.scrollTo(0,0); };
      return;
    }
    $("title").textContent = "Settings";
    main().innerHTML = `<div class="view">${backBtn}
      <div class="sec" style="margin-top:0"><h2 class="sign">Account</h2><span class="label">${privacySummary(m)}</span></div>
      <div class="card">${privacyPicker(pvFrom(m))}<p class="note" id="pv-status" style="margin-top:10px">Changes save straight away.</p></div>
      ${bodyCard()}
      ${STEPS_ENABLED ? healthCard(m) : ""}
      ${notifCard()}
      ${lockCard()}
      <div class="sec"><h2 class="sign">Invite</h2></div>
      ${invite}${acct}</div>`;
    $("you-back").onclick = () => { youView = "profile"; render(); window.scrollTo(0,0); };
    wireNotifCard();
    wireHealth();
    wireBody();
    wireLockCard();
    const p = pvFrom(m);
    wirePrivacy(p, async () => {
      if ($("pv-status")) $("pv-status").textContent = "Saving…";
      if (await savePrivacy(p)) toast("Privacy updated");
    });
  }
  $("copylink").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch(e){ toast("Copy failed"); } };
  $("logout").onclick = async () => {
    // stop this device getting your notifications once you've logged out
    try { const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager?.getSubscription();
          if (sub) await sb.rpc("remove_push_sub", { p_endpoint: sub.endpoint }); } catch(_) {}
    pushOn = false;
    await sb.auth.signOut();
  };
}

// ================= Goals & body (private) =================
const GOALS = [
  { id:"lose",     label:"Lose weight",     sub:"Drop body fat overall" },
  { id:"cut",      label:"Cut",             sub:"Lean out, keep the muscle" },
  { id:"maintain", label:"Maintain",        sub:"Stay where you are" },
  { id:"bulk",     label:"Build muscle",    sub:"Bulk up and grow" },
  { id:"recomp",   label:"Recomp",          sub:"Lose fat and build muscle at once" },
  { id:"strength", label:"Get stronger",    sub:"Lift heavier" },
  { id:"fitness",  label:"General fitness", sub:"Feel good, stay consistent" },
  { id:"happy",    label:"Be happy",        sub:"Enjoy it and leave smiling" },
  { id:"friends",  label:"Keep an eye on my friends", sub:"Make sure the crew keeps showing up" },
];
const goalLabel = id => GOALS.find(g => g.id === id)?.label || "";
// Which way the scale should move for each goal (+1 up, -1 down, 0 steady, null = doesn't matter)
const GOAL_DIR = { lose:-1, cut:-1, maintain:0, bulk:1, recomp:null, strength:null, fitness:null, happy:null, friends:null };
// The old single-goal column only accepts the original 7, so it gets the first of those (or nothing)
const LEGACY_GOALS = ["lose","cut","maintain","bulk","recomp","strength","fitness"];
const legacyGoal = goals => goals.find(g => LEGACY_GOALS.includes(g)) || null;

// Pick as many as apply (e.g. Build muscle + Get stronger)
function goalPicker(sel){
  sel = sel || [];
  return `<div class="goals" role="group" aria-label="Your goals">${GOALS.map(g => { const on = sel.includes(g.id);
    return `<button type="button" class="goal ${on?"on":""}" data-goal="${g.id}" aria-pressed="${on}">
      <span class="gtick" aria-hidden="true">${on ? CHECK : ""}</span><b>${g.label}</b><span>${g.sub}</span></button>`; }).join("")}</div>
    <p class="note" style="margin:6px 0 0">Pick as many as you like.</p>`;
}
const toggleIn = (arr, id) => arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id];
const goalsText = gs => (gs || []).map(goalLabel).filter(Boolean).join(", ");
async function saveGoals(goals){
  const { error } = await sb.from("profiles").update({ goals, goal: legacyGoal(goals) }).eq("id", myId);
  if (error){ showWarn("Couldn't save goals: " + error.message); return false; }
  body.goals = goals; render(); return true;
}
// Scale direction for your goals combined: only when they all agree (e.g. Lose weight + Cut = down)
function goalDir(){
  const dirs = [...new Set((body.goals || []).map(g => GOAL_DIR[g]).filter(d => d !== null && d !== undefined))];
  return dirs.length === 1 ? dirs[0] : null;
}

// BMI = weight (kg) / height (m)^2
const bmiOf = (kg, cm) => kg && cm ? kg / Math.pow(cm/100, 2) : null;
const bmiBand = b => b < 18.5 ? ["Underweight","warn"] : b < 25 ? ["Healthy range","good"] : b < 30 ? ["Overweight","warn"] : ["Obese","bad"];
const latestWeight = () => body.weights.length ? body.weights[body.weights.length-1] : null;
function weightChange(days){
  const w = body.weights; if (w.length < 2) return null;
  const last = w[w.length-1], cutoff = key(addDays(parse(last.day), -days));
  const base = [...w].reverse().find(r => r.day <= cutoff) || w[0];
  return base === last ? null : { kg: +(last.kg - base.kg).toFixed(1), from: base.day };
}
function weightChart(){
  const w = body.weights.slice(-60); if (w.length < 2) return "";
  const W = 320, H = 110, pl = 30, pr = 8, pt = 10, pb = 18;
  const xs = w.map(r => parse(r.day).getTime()), ys = w.map(r => r.kg);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), lo = Math.floor(Math.min(...ys) - 0.5), hi = Math.ceil(Math.max(...ys) + 0.5);
  const X = v => pl + (x1 === x0 ? 0 : (v - x0) / (x1 - x0)) * (W - pl - pr), Y = v => pt + (hi - v) / (hi - lo) * (H - pt - pb);
  const pts = w.map((r,i) => `${X(xs[i]).toFixed(1)},${Y(r.kg).toFixed(1)}`).join(" ");
  const area = `${X(xs[0]).toFixed(1)},${H-pb} ${pts} ${X(xs[xs.length-1]).toFixed(1)},${H-pb}`;
  const last = w[w.length-1];
  return `<svg class="wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Weight trend: ${w[0].kg} to ${last.kg} kg">
    <line class="wc-grid" x1="${pl}" x2="${W-pr}" y1="${Y(hi)}" y2="${Y(hi)}"/><line class="wc-grid" x1="${pl}" x2="${W-pr}" y1="${Y(lo)}" y2="${Y(lo)}"/>
    <text class="wc-l" x="${pl-6}" y="${Y(hi)+4}" text-anchor="end">${hi}</text><text class="wc-l" x="${pl-6}" y="${Y(lo)+4}" text-anchor="end">${lo}</text>
    <polygon class="wc-area" points="${area}"/><polyline class="wc-line" points="${pts}"/>
    <circle class="wc-dot" cx="${X(xs[xs.length-1])}" cy="${Y(last.kg)}" r="4"/>
    <text class="wc-l" x="${pl}" y="${H-3}">${fmt(parse(w[0].day))}</text><text class="wc-l" x="${W-pr}" y="${H-3}" text-anchor="end">${fmt(parse(last.day))}</text></svg>`;
}
// One line about the scale, judged against the goal
function trendLine(){
  const ch = weightChange(28); if (!ch) return "";
  const dir = goalDir(), sign = ch.kg > 0 ? "+" : "";
  let verdict = "";
  if (dir === -1) verdict = ch.kg < 0 ? "Heading the right way." : "Not moving down yet. Keep at it.";
  if (dir ===  1) verdict = ch.kg > 0 ? "Gaining, right on plan." : "Not moving up yet. Eat a bit more.";
  if (dir ===  0) verdict = Math.abs(ch.kg) <= 1 ? "Holding steady." : "Drifting a little.";
  return `${sign}${ch.kg} kg since ${fmt(parse(ch.from))}. ${verdict}`;
}

function bodyCard(){
  const lw = latestWeight(), b = bmiOf(lw?.kg, body.height), band = b ? bmiBand(b) : null;
  const loggedToday = lw && lw.day === key(today());
  return `<div class="sec" id="body"><h2 class="sign">Goal &amp; body</h2><span class="label">${LOCK} Only you see this</span></div>
  <div class="card bodycard">
    <span class="label">Your goal</span>
    ${goalPicker(body.goals)}
    <div class="xpbox"><span class="label">Gym experience</span>
      <p class="note" style="margin:2px 0 0">How long you've been going to the gym, breaks included.</p>
      ${durPicker("xp", xpDraft(), ["days","weeks","months","years"])}
      <div class="xprow"><p class="note dprev" id="xp-prev" style="margin:0">${xpPreview()}</p>
        <button class="cta ghost" id="xp-save" style="font-size:16px;padding:10px 16px">Save</button></div></div>
    <div class="bodyrow">
      <label class="bfield"><span class="label">Height</span><span class="bin"><input type="number" id="b-height" inputmode="decimal" min="100" max="250" step="0.5" placeholder="178" value="${body.height ?? ""}"><i>cm</i></span></label>
      <label class="bfield"><span class="label">Weight ${loggedToday ? "today" : ""}</span><span class="bin"><input type="number" id="b-kg" inputmode="decimal" min="25" max="350" step="0.1" placeholder="${lw ? lw.kg : "75.0"}" value="${loggedToday ? lw.kg : ""}"><i>kg</i></span></label>
      <button class="cta" id="b-save" style="font-size:18px;padding:12px 16px">Save</button>
    </div>
    ${lw ? `<div class="wtop"><div><span class="label">Latest</span><b class="sign wbig">${lw.kg}<small> kg</small></b><span class="note">${fmt(parse(lw.day))}</span></div>
      ${b ? `<div class="bmi ${band[1]}"><span class="label">BMI</span><b class="sign wbig">${b.toFixed(1)}</b><span class="note">${band[0]}</span></div>` : ""}</div>` : ""}
    ${trendLine() ? `<p class="trend">${esc(trendLine())}</p>` : ""}
    ${weightChart()}
    ${lw ? "" : `<p class="note">Log your weight now and then (once a week is plenty) to see your trend.</p>`}
    <details class="bmihelp"><summary>What's BMI?</summary>
      <p><b>Body Mass Index</b> = your weight in kg ÷ your height in metres, squared. Example: 75 kg at 1.78 m → 75 ÷ 1.78² ≈ 23.7.</p>
      <p>Rough bands: under 18.5 underweight, 18.5–24.9 healthy, 25–29.9 overweight, 30+ obese.</p>
      <p>It's a quick check, but it <b>can't tell muscle from fat</b>, so people who lift often read “overweight” while being lean. Your trend over time matters more than one number.</p>
    </details>
  </div>`;
}
// ---- Gym experience (You tab) ----
let xpEdit = null;   // what you're editing; starts from your saved answer
function xpDraft(){
  if (xpEdit) return xpEdit;
  const ts = body.trainedSince ? parse(body.trainedSince) : null;
  if (!ts) return (xpEdit = { n: 0, unit: "months" });
  // turn the saved date back into the friendliest unit
  const t = today(), days = Math.round((t - ts) / 864e5);
  const months = (t.getFullYear() - ts.getFullYear()) * 12 + (t.getMonth() - ts.getMonth());
  xpEdit = months >= 24 ? { n: Math.round(months / 12), unit: "years" }
         : months >= 2  ? { n: months, unit: "months" }
         : days >= 14   ? { n: Math.round(days / 7), unit: "weeks" }
         :                { n: days, unit: "days" };
  return xpEdit;
}
function xpPreview(){
  const d = xpDraft();
  if (d.n === 0) return body.trainedSince ? "Set to just starting." : "Not set yet.";
  return `Lifting since about <b>${durStart(d).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</b>.`;
}
async function saveExperience(){
  const d = xpDraft(), btn = $("xp-save"); if (btn) btn.disabled = true;
  const trained_since = d.n === 0 ? key(today()) : key(durStart(d));
  const { error } = await sb.from("profiles").update({ trained_since }).eq("id", myId);
  if (error){ if (btn) btn.disabled = false; return showWarn("Couldn't save: " + error.message); }
  body.trainedSince = trained_since; xpEdit = null; toast("Experience saved"); render();
}

function wireBody(){
  if ($("xp-n")){
    wireDur("xp", xpDraft(), () => { $("xp-prev").innerHTML = xpPreview(); });
    $("xp-save").onclick = saveExperience;
  }
  main().querySelectorAll("[data-goal]").forEach(b => b.onclick = async () => { if (await saveGoals(toggleIn(body.goals, b.dataset.goal))) toast("Goals saved"); });
  const save = $("b-save"); if (!save) return;
  save.onclick = async () => {
    const h = parseFloat($("b-height").value), kg = parseFloat($("b-kg").value);
    if ($("b-height").value && !(h >= 100 && h <= 250)) return showWarn("Height should be in cm, between 100 and 250.");
    if ($("b-kg").value && !(kg >= 25 && kg <= 350)) return showWarn("Weight should be in kg, between 25 and 350.");
    if (!$("b-height").value && !$("b-kg").value) return toast("Enter height or weight");
    save.disabled = true;
    if ($("b-height").value && h !== body.height){
      const { error } = await sb.from("profiles").update({ height_cm: h }).eq("id", myId);
      if (error){ save.disabled = false; return showWarn("Couldn't save height: " + error.message); }
    }
    if ($("b-kg").value){
      const { error } = await sb.from("bodyweight").upsert({ user_id: myId, day: key(today()), kg: Math.round(kg*10)/10 });
      if (error){ save.disabled = false; return showWarn("Couldn't save weight: " + error.message); }
    }
    toast("Saved"); await loadAll();
  };
}

// ================= Reactions, nudges, streak freezes =================
const EMOJI = { fire:"🔥", muscle:"💪", clap:"👏" };
const nameOf = id => members.get(id)?.name || "Someone";
const reactsFor = (to, d) => reactions.filter(r => r.to_user === to && r.day === key(d));
function reactBar(o, d){
  const rs = reactsFor(o.id, d);
  return `<span class="reacts">${Object.keys(EMOJI).map(e => {
    const n = rs.filter(r => r.emoji === e).length, mine = rs.some(r => r.emoji === e && r.from_user === myId);
    return `<button type="button" class="react ${mine?"on":""}" data-react="${e}" data-to="${esc(o.id)}" data-day="${key(d)}" aria-pressed="${mine}" aria-label="${e} ${n}">${EMOJI[e]}${n ? `<b>${n}</b>` : ""}</button>`;
  }).join("")}</span>`;
}
// What I got today, e.g. "🔥 2 · 💪 1 from Meha and Sam"
function receivedLine(d){
  const rs = reactsFor(myId, d); if (!rs.length) return "";
  const counts = Object.keys(EMOJI).map(e => [e, rs.filter(r => r.emoji === e).length]).filter(x => x[1]);
  const who = [...new Set(rs.map(r => nameOf(r.from_user)))];
  return `${counts.map(([e,n]) => `${EMOJI[e]} ${n}`).join(" · ")} from ${esc(who.length > 2 ? who.slice(0,2).join(", ") + " +" + (who.length-2) : who.join(" and "))}`;
}
async function toggleReaction(e, to, day){
  const mine = reactions.find(r => r.from_user === myId && r.to_user === to && r.day === day && r.emoji === e);
  if (mine){
    reactions = reactions.filter(r => r !== mine); render();
    const { error } = await sb.from("reactions").delete().match({ from_user: myId, to_user: to, day, emoji: e });
    if (error){ reactions.push(mine); render(); showWarn("Couldn't remove that: " + error.message); }
  } else {
    const r = { from_user: myId, to_user: to, day, emoji: e };
    reactions.push(r); render();
    try { navigator.vibrate && navigator.vibrate(8); } catch(_){}
    const { error } = await sb.from("reactions").insert(r);
    if (error){ reactions = reactions.filter(x => x !== r); render(); showWarn("Couldn't react: " + error.message); }
  }
}

const nudgedToday = to => nudges.some(n => n.from_user === myId && n.to_user === to && n.day === key(today()));
const nudgesForMe = () => nudges.filter(n => n.to_user === myId && !n.seen);
async function sendNudge(to){
  const n = { from_user: myId, to_user: to, day: key(today()), seen: false, created_at: new Date().toISOString() };
  nudges.push(n); sentNudgeTo.add(to); render();
  const { error } = await sb.from("nudges").insert({ from_user: myId, to_user: to });
  if (error){ nudges = nudges.filter(x => x !== n); sentNudgeTo.delete(to); render(); return showWarn("Couldn't nudge: " + error.message); }
  toast(`Nudged ${nameOf(to)} 👀`);
}
async function dismissNudges(){
  const mineN = nudgesForMe(); mineN.forEach(n => n.seen = true); render();
  await sb.from("nudges").update({ seen: true }).eq("to_user", myId).eq("seen", false);
}

// Freeze: the missed gym day that's currently breaking your streak (within the last week), if you still have this month's freeze
const freezesInMonth = (m, d) => Object.keys(m.frozen || {}).filter(k => k.slice(0,7) === key(d).slice(0,7)).length;
function freezeOffer(m){
  const t = today(), floor = parse(m.trackStart);
  for (let d = addDays(t,-1); d >= addDays(t,-7) && d >= floor; d = addDays(d,-1)){
    if (!isGym(m,d) || has(m,d) || frozen(m,d)) continue;
    // first missed day walking back = the one that broke the streak
    if (freezesInMonth(m,d) > 0) return null;
    const saved = dayStreakAt({ ...m, frozen: { ...(m.frozen||{}), [key(d)]: 1 } }, t);
    if (saved <= dayStreak(m)) return null;
    return { day: d, saved };
  }
  return null;
}
async function useFreeze(d){
  const { error } = await sb.from("freezes").insert({ user_id: myId, day: key(d) });
  if (error) return showWarn("Couldn't use the freeze: " + error.message);
  toast("❄️ Streak saved"); burst(); await loadAll();
}

// ================= Weekly recap =================
let recapWhich = "last";   // "last" (finished week) or "this" (so far)
function recapData(m, start){
  const end = addDays(start, 6), t = today(), upTo = end < t ? end : t;
  const w = weekStats(m, start);
  const days = Array.from({length:7}, (_,i) => { const d = addDays(start,i);
    return { d, state: has(m,d) ? "done" : frozen(m,d) ? "froze" : isGym(m,d) ? (d < t ? "missed" : "todo") : (ticked(m,d) ? "bonus" : "rest") }; });
  const got = reactions.filter(r => r.to_user === myId && r.day >= key(start) && r.day <= key(end)).length;
  // which week number this was: weeks completed before it, +1
  let before = 0; const floor = startOfWeek(parse(m.since));
  for (let s = addDays(start,-7); s >= floor; s = addDays(s,-7)){ const x = weekStats(m,s); if (x.target && x.hit >= x.target) before++; else break; }
  return { start, end, w, days, got, weekNo: before + 1, streak: dayStreakAt(m, upTo), hitTarget: w.target && w.hit >= w.target, final: end < t };
}
function recapHeadline(r){
  if (!r.final) return r.w.left ? `${r.w.left} to go` : "Target hit";
  if (r.hitTarget && r.w.bonus) return "Beast week";
  if (r.hitTarget) return "Week locked in";
  if (r.w.hit >= r.w.target - 1) return "So close";
  return "Bounce back";
}
function recapCard(m){
  const ws = startOfWeek(today()), start = recapWhich === "last" ? addDays(ws,-7) : ws;
  if (start < startOfWeek(parse(m.since))) return "";
  const r = recapData(m, start);
  const strip = r.days.map((x,i) => `<span class="rday ${x.state}"><i>${x.state==="done"||x.state==="bonus"?CHECK:x.state==="froze"?"❄️":""}</i><small>${DAYS[i][0]}</small></span>`).join("");
  return `<div class="recap" style="${pc(m)}">
    <div class="chips" role="group" aria-label="Which week" style="margin-bottom:2px">
      <button class="chip" data-recap="last" aria-pressed="${recapWhich==="last"}">Last week</button>
      <button class="chip" data-recap="this" aria-pressed="${recapWhich==="this"}">This week so far</button></div>
    <div class="rcard">
      <span class="label">Week ${r.weekNo} recap · ${fmt(r.start)} – ${fmt(r.end)}</span>
      <b class="sign rhead">${recapHeadline(r)}</b>
      <div class="rbig"><b class="sign">${r.w.hit - r.w.froze}<small>/${r.w.target}</small></b><span class="label">sessions</span></div>
      <div class="rstrip">${strip}</div>
      <div class="rstats">
        <div><b class="sign">${r.streak}</b><span class="label">day streak</span></div>
        <div><b class="sign">${r.w.bonus}</b><span class="label">bonus</span></div>
        <div><b class="sign">${r.got}</b><span class="label">reactions</span></div>
      </div>
    </div>
    <button class="cta" id="recap-share">Share recap</button>
  </div>`;
}
function wireRecap(m){
  main().querySelectorAll("[data-recap]").forEach(b => b.onclick = () => { recapWhich = b.dataset.recap; render(); });
  const sh = $("recap-share"); if (sh) sh.onclick = () => shareRecap(m);
}

// Draw the recap as a 1080x1350 image (Instagram portrait size) and open the share sheet
async function shareRecap(m){
  const ws = startOfWeek(today()), r = recapData(m, recapWhich === "last" ? addDays(ws,-7) : ws);
  try { await document.fonts.ready; } catch(_){}
  const cs = getComputedStyle(document.documentElement), plate = (cs.getPropertyValue("--p-" + (m.plate || "white")) || "#c4473d").trim();
  const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const font = (wt, px, cond) => { x.font = `${wt} ${px}px Archivo, "Arial Narrow", sans-serif`; if ("fontStretch" in x) x.fontStretch = cond ? "condensed" : "normal"; };
  // background + plate stripe + faint plate rings
  x.fillStyle = "#141516"; x.fillRect(0,0,W,H);
  x.fillStyle = plate; x.fillRect(0,0,22,H);
  x.globalAlpha = .14; x.strokeStyle = plate; x.lineWidth = 90; x.beginPath(); x.arc(W-60, 220, 260, 0, 7); x.stroke();
  x.lineWidth = 16; x.beginPath(); x.arc(W-60, 220, 120, 0, 7); x.stroke(); x.globalAlpha = 1;
  // text
  x.fillStyle = "#8d9196"; font(700, 34, false); x.fillText(`CREW · WEEK ${r.weekNo} RECAP`, 90, 140);
  x.fillText(`${fmt(r.start).toUpperCase()} – ${fmt(r.end).toUpperCase()}`, 90, 190);
  x.fillStyle = "#ececea"; font(900, 120, true); x.fillText((m.name || "").toUpperCase(), 90, 340);
  x.fillStyle = plate; font(900, 96, true); x.fillText(recapHeadline(r).toUpperCase(), 90, 450);
  x.fillStyle = "#ececea"; font(900, 300, true); const sess = String(r.w.hit - r.w.froze); x.fillText(sess, 82, 760);
  const sw = x.measureText(sess).width; x.fillStyle = "#8d9196"; font(900, 120, true); x.fillText(`/${r.w.target}`, 92 + sw, 760);
  font(700, 34, false); x.fillText("SESSIONS", 90, 810);
  // week strip
  r.days.forEach((d,i) => {
    const cx = 90 + i*130, cy = 900, s = 96;
    x.lineWidth = 6; x.strokeStyle = d.state === "missed" ? "#d65a4f" : "#3a3e43";
    x.fillStyle = d.state === "done" || d.state === "bonus" ? plate : d.state === "froze" ? "#5d8bd0" : "transparent";
    x.beginPath(); x.roundRect ? x.roundRect(cx, cy, s, s, 18) : x.rect(cx, cy, s, s); x.fill(); if (!(d.state === "done" || d.state === "bonus" || d.state === "froze")) x.stroke();
    if (d.state === "done" || d.state === "bonus"){ x.strokeStyle = PASTEL[m.plate] ? PASTEL[m.plate][0] : "#fff"; x.lineWidth = 10; x.lineCap = "round"; x.lineJoin = "round"; x.beginPath(); x.moveTo(cx+24, cy+50); x.lineTo(cx+42, cy+68); x.lineTo(cx+74, cy+32); x.stroke(); }
    x.fillStyle = "#8d9196"; font(700, 30, false); x.textAlign = "center"; x.fillText(DAYS[i][0], cx + s/2, cy + s + 46); x.textAlign = "left";
  });
  // stats
  [[r.streak,"DAY STREAK"],[r.w.bonus,"BONUS"],[r.got,"REACTIONS"]].forEach(([v,l],i) => {
    const sx = 90 + i*320; x.fillStyle = "#ececea"; font(900, 110, true); x.fillText(String(v), sx, 1170); x.fillStyle = "#8d9196"; font(700, 30, false); x.fillText(l, sx, 1215);
  });
  x.fillStyle = "#5c6066"; font(700, 28, false); x.fillText("empiricaldp.github.io/gym-streak", 90, 1290);

  const blob = await new Promise(res => c.toBlob(res, "image/png"));
  const file = new File([blob], `gym-streak-week-${r.weekNo}.png`, { type: "image/png" });
  const text = `Week ${r.weekNo}: ${r.w.hit - r.w.froze}/${r.w.target} sessions, ${r.streak} day streak 🔥`;
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })){ await navigator.share({ files: [file], text }); return; }
  } catch(e){ if (e && e.name === "AbortError") return; }
  // fallback: show the image so it can be long-pressed / right-clicked and saved
  const url = URL.createObjectURL(blob);
  const ov = document.createElement("div"); ov.className = "imgov";
  ov.innerHTML = `<div class="imgbox"><img src="${url}" alt="Week ${r.weekNo} recap"><p class="note">Long-press (or right-click) the image to save it.</p><button class="cta ghost" type="button">Close</button></div>`;
  ov.querySelector("button").onclick = () => { ov.remove(); URL.revokeObjectURL(url); };
  document.body.appendChild(ov);
}

// ================= Privacy =================
// p = {pub, att, split}. Sharing is the default and the recommended choice.
function privacyPicker(p){
  // p = {priv, hide}
  return `<div class="privacy">
    <button type="button" class="popt ${!p.priv?"on":""}" data-pv="pub" aria-pressed="${!p.priv}">
      <span class="pt">🔓 Public <span class="rec">Recommended</span></span>
      <span class="pd">Anyone can see your profile and bud you straight away.</span></button>
    <button type="button" class="popt ${p.priv?"on":""}" data-pv="priv" aria-pressed="${p.priv}">
      <span class="pt">${LOCK} Private</span>
      <span class="pd">People send a bud request. Only buds you approve see your profile and streak.</span></button>
    <div class="toggles"><label class="tg" for="pv-hide"><span><b>Hide my split</b><small>Show that you trained, not what you trained</small></span>
      <input type="checkbox" class="sw" id="pv-hide" ${p.hide?"checked":""}></label></div>
  </div>`;
}
function wirePrivacy(p, onChange){
  main().querySelectorAll("[data-pv]").forEach(b => b.onclick = () => { p.priv = b.dataset.pv === "priv"; onChange(); });
  const h = $("pv-hide"); if (h) h.onchange = () => { p.hide = h.checked; onChange(); };
}
const pvFrom = m => ({ priv: !!m?.private, hide: !!m?.splitHidden });
// Phone signal drops show up as "TypeError: Load failed" (Safari) / "Failed to fetch" (Chrome): the request may or may not have landed.
const netErr = e => /load failed|failed to fetch|networkerror|network request failed|network connection was lost/i.test(String(e?.message || e || ""));
async function retryNet(run){            // for saves that are safe to repeat: try once more after a blip
  let r = await run();
  if (r.error && netErr(r.error)){ await new Promise(ok => setTimeout(ok, 900)); r = await run(); }
  return r;
}
// Saves the new settings AND the old ones, so the live (pre-buds) app stays consistent during the beta
async function savePrivacy(p, extra = {}){
  const row = { account: p.priv ? "private" : "public", hide_split: !!p.hide,
    is_public: !p.priv, share_attendance: !p.priv, share_split: !p.hide, privacy_chosen: true, ...extra };
  let { error } = await retryNet(() => sb.from("profiles").update(row).eq("id", myId));
  if (error && netErr(error)){
    // the reply got lost: check whether the save actually landed before calling it a failure
    const chk = await sb.from("profiles").select("account,hide_split,seen_update").eq("id", myId).maybeSingle().catch(() => ({}));
    const d = chk?.data;
    if (d && d.account === row.account && d.hide_split === row.hide_split && (extra.seen_update == null || d.seen_update === extra.seen_update)) error = null;
  }
  if (error){ showWarn(netErr(error) ? "Connection dropped. Check your signal and tap Continue again." : "Couldn't save privacy: " + error.message); return false; }
  $("warn").hidden = true;
  await loadAll(); return true;
}
const privacySummary = m => (m.private ? "Private" : "Public") + (m.splitHidden ? " · split hidden" : "");

// ================= Apple Health setup =================
// The iPhone Shortcut reads today's steps from Health and POSTs them to log_steps with your secret key.
function healthCard(m){
  const connected = hasSteps(m);
  const copyRow = (label, id, value, secret) => `<div class="copyrow"><span class="label">${label}</span>
    <code id="${id}" class="mono">${esc(secret ? value.slice(0,8) + "••••••••" : value)}</code>
    <button class="chip" data-copy="${esc(value)}" aria-label="Copy ${label}">Copy</button></div>`;
  return `<div class="sec" id="health"><h2 class="sign">Apple Health</h2><span class="label">${connected ? "Connected" : "Not set up"}</span></div>
  <div class="card health">
    <p style="margin:0;font-weight:700">${connected ? `Last synced ${esc(new Date(m.stepsAt).toLocaleString("en-AU",{weekday:"short",day:"numeric",month:"short",hour:"numeric",minute:"2-digit"}))}` : "Send your daily steps here automatically."}</p>
    <p class="note">iPhone only lets real App Store apps read Health directly, so we use Apple's <b>Shortcuts</b> app as the bridge. One-time setup, about 2 minutes.</p>
    <details ${connected ? "" : "open"}><summary>Setup steps</summary>
    <ol class="howto">
      <li>Open <b>Shortcuts</b> → <b>+</b> (new shortcut). Name it <b>Log Steps</b>.</li>
      <li>Add <b>Find Health Samples</b>. Set type to <b>Steps</b>, then add the filter <b>Start Date · is today</b>.</li>
      <li>Add <b>Calculate Statistics</b> and set it to <b>Sum</b> (it picks up the Health Samples).</li>
      <li>Add <b>Get Contents of URL</b>, paste the <b>URL</b> below, tap <b>Show More</b>:
        <br>Method <b>POST</b>. Headers: add <b>apikey</b> = the <b>App key</b> below.
        <br>Request Body <b>JSON</b>: add a <b>Text</b> field <b>p_key</b> = <b>Your steps key</b>, and a <b>Number</b> field <b>p_steps</b> = the <b>Statistics</b> result.</li>
      <li>Tap ▶ to test. You should see “Saved … steps”. Allow Health access when asked.</li>
      <li><b>Automation</b> tab → <b>+</b> → <b>Time of Day</b> → <b>11:30 PM</b>, Daily → <b>Run Immediately</b> → pick <b>Log Steps</b>.</li>
      <li>Want the <b>daily</b> leaderboard to update during the day? Repeat step 6 for a few more times, e.g. <b>12 PM</b> and <b>6 PM</b>. Each run replaces that day's count, so nothing doubles up.</li>
    </ol></details>
    ${copyRow("URL", "h-url", STEPS_URL())}
    ${copyRow("App key", "h-api", window.GYM_CONFIG.SUPABASE_ANON_KEY)}
    ${stepsKey ? copyRow("Your steps key", "h-key", stepsKey, true) : `<p class="note">Your steps key is loading…</p>`}
    <p class="note">Keep your steps key to yourself: it lets anything send steps as you. If it leaks, reset it and update the Shortcut.</p>
    <button class="linkbtn" id="h-reset" style="padding-left:0">Reset my steps key</button>
  </div>`;
}
let resetArmed = false;
function wireHealth(){
  main().querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = "Copied"; setTimeout(() => b.textContent = "Copy", 1500); }
    catch(e){ toast("Copy failed: long-press to copy"); }
  });
  const r = $("h-reset"); if (!r) return;
  r.textContent = resetArmed ? "Tap again to confirm reset (your Shortcut will stop until updated)" : "Reset my steps key";
  r.onclick = async () => {
    if (!resetArmed){ resetArmed = true; return wireHealth(); }
    resetArmed = false;
    const { data, error } = await sb.rpc("reset_steps_key");
    if (error) return showWarn("Couldn't reset: " + error.message);
    stepsKey = data; toast("New steps key"); render();
  };
}


// ---- "How long?" picker: type a number (or use − / +) and pick Days / Weeks / Months / Years ----
const UNIT_MAX = { days: 3650, weeks: 520, months: 120, years: 40 };
const UNIT_ONE = { days: "day", weeks: "week", months: "month", years: "year" };
const durText = d => d.n === 0 ? "Just starting" : `${d.n} ${d.n === 1 ? UNIT_ONE[d.unit] : d.unit}`;
// The date that's d before today
function durStart(d){
  const t = today(), x = new Date(t);
  if (d.unit === "days") x.setDate(x.getDate() - d.n);
  if (d.unit === "weeks") x.setDate(x.getDate() - 7 * d.n);
  if (d.unit === "months") x.setMonth(x.getMonth() - d.n);
  if (d.unit === "years") x.setFullYear(x.getFullYear() - d.n);
  return x;
}
// Streak start: weeks/months/years line up with a Monday so whole weeks count; days stay exact.
// Days in the current week are never pre-filled: you tick those yourself.
function streakStart(d){
  const ws = startOfWeek(today());
  if (d.n === 0) return ws;
  let x = durStart(d);
  if (d.unit !== "days") x = d.unit === "weeks" ? addDays(ws, -7 * d.n) : startOfWeek(x);
  return x < ws ? x : ws;
}
function previewMember(){
  const plan = ob.plan.map((w,i) => { const t = normalizeWorkout(w); return t ? { w: t, opt: !!ob.opt[i] } : null; });
  return { plan, since: key(streakStart(ob.streak)), trackStart: key(startOfWeek(today())), days: {}, frozen: {} };
}
function streakPreview(){
  const pm = previewMember();
  let credited = 0;
  for (let d = parse(pm.since); d < parse(pm.trackStart); d = addDays(d,1)) if (isGym(pm,d)) credited++;
  if (!credited) return `You'll start fresh on <b>Week 1</b>. Tick this week's sessions once you're in.`;
  return `You'll start on <b>Week ${weekNo(pm)}</b> with <b>${credited}</b> past session${credited === 1 ? "" : "s"} counted. Tick this week's sessions once you're in.`;
}
function expPreview(){
  if (ob.exp.n === 0) return "Everyone starts somewhere. Welcome.";
  return `Lifting since about <b>${durStart(ob.exp).toLocaleDateString("en-AU", { month: "long", year: "numeric" })}</b>.`;
}
function durPicker(id, d, units){
  return `<div class="dur">
      <button type="button" class="dstep" id="${id}-minus" aria-label="Less">−</button>
      <input class="dnum" id="${id}-n" type="number" inputmode="numeric" pattern="[0-9]*" min="0" max="${UNIT_MAX[d.unit]}" value="${d.n}" aria-label="Number of ${d.unit}">
      <button type="button" class="dstep" id="${id}-plus" aria-label="More">+</button>
    </div>
    <div class="seg dunits" role="group" aria-label="Unit">${units.map(u => `<button type="button" data-unit="${u}" aria-pressed="${d.unit === u}">${u[0].toUpperCase() + u.slice(1)}</button>`).join("")}</div>`;
}
function wireDur(id, d, onChange){
  const inp = $(id + "-n");
  const set = n => { d.n = Math.max(0, Math.min(UNIT_MAX[d.unit], Math.round(Number(n) || 0))); inp.value = d.n; onChange(); };
  inp.oninput = () => { if (inp.value !== "") set(inp.value); };
  inp.onblur = () => set(inp.value);
  inp.onfocus = () => inp.select();
  $(id + "-minus").onclick = () => set(d.n - 1);
  $(id + "-plus").onclick = () => set(d.n + 1);
  main().querySelectorAll("[data-unit]").forEach(b => b.onclick = () => {
    d.unit = b.dataset.unit; d.n = Math.min(d.n, UNIT_MAX[d.unit]);
    main().querySelectorAll("[data-unit]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.unit === d.unit)));
    inp.max = UNIT_MAX[d.unit]; inp.value = d.n; inp.setAttribute("aria-label", "Number of " + d.unit); onChange();
  });
}
// ================= Onboarding =================
// startOnboarding(true, "split") edits just that one thing (from the You tab); no review screen
function startOnboarding(edit, only){
  const m = edit ? me() : null;
  ob = { edit, only: edit ? only || null : null, step:0, name: m?.name || "", plate: m?.plate || PLATES[members.size % PLATES.length].id,
    plan: m ? m.plan.map(s=>s?s.w:"") : ["","","","","","",""], opt: m ? m.plan.map(s=>!!s?.opt) : [false,false,false,false,false,false,false],
    exp: { n: 6, unit: "months" },      // how long you've been going to the gym at all
    streak: { n: 0, unit: "weeks" },    // how long you've been going consistently (sets your streak)
    pv: { priv:false, hide:false }, goals: [...(body.goals || [])] };
  render();
}
function viewOnboarding(){
  // Steps by name, so adding a question is just adding a word here
  const STEPS = ob.only ? [ob.only] : ob.edit ? ["name","goal","plate","split","review"] : ["name","goal","plate","split","experience","streak","privacy","review"];
  const total = STEPS.length, s = ob.step, k = STEPS[s], qn = s + 1;
  const ql = ob.only ? "Edit" : "Question " + qn;      // label above each question
  const dots = ob.only ? "" : `<div class="steps">${Array.from({length:total},(_,i)=>`<i class="${i<=s?"on":""}"></i>`).join("")}</div>`;
  let body = "", canNext = true;
  if (k==="name"){ body = `<span class="label">${ql}</span><h2 class="sign">What should the crew call you?</h2>
      <input class="field" id="f-name" type="text" maxlength="20" placeholder="e.g. DP" value="${esc(ob.name)}" autocomplete="nickname" autocapitalize="words" spellcheck="false">
      <p class="note namemsg ${ob.nameState === "taken" || ob.nameState === "bad" ? "bad" : ob.nameState === "ok" ? "ok" : ""}" id="name-msg">${esc(ob.nameMsg || "Letters and numbers only, no emoji. Each name can only be used once.")}</p>`;
    canNext = ob.nameState === "ok"; }
  if (k==="goal"){ body = `<span class="label">${ql}</span><h2 class="sign">What are your goals?</h2>
      <p class="note">Only you see this. It tunes your motivation messages and your weight trend.</p>${goalPicker(ob.goals)}`;
    canNext = ob.goals.length > 0; }
  if (k==="plate"){ body = `<span class="label">${ql}</span><h2 class="sign">Pick your plate</h2>
      <p class="note">Your colour across the app. Everyone in the crew gets their own plate.</p>
      <div class="platepick">${PLATES.map(p=>`<button data-plate="${p.id}" aria-pressed="${ob.plate===p.id}" aria-label="${p.name} plate">${plateSvg(p.id, 52)}<small>${p.name}</small></button>`).join("")}</div>`; }
  if (k==="split"){ body = splitStepHtml(ql); canNext = splitReady(); }
  if (k==="experience"){ body = `<span class="label">${ql}</span><h2 class="sign">How long have you been going to the gym?</h2>
      <p class="note">Overall, even with breaks. Only you see this.</p>
      ${durPicker("exp", ob.exp, ["days","weeks","months","years"])}
      <p class="note dprev" id="exp-prev">${expPreview()}</p>`; }
  if (k==="streak"){ body = `<span class="label">${ql}</span><h2 class="sign">How long have you been going consistently?</h2>
      <p class="note">Without missing your planned gym days. This sets your starting streak, so be honest. 0 is fine.</p>
      ${durPicker("stk", ob.streak, ["days","weeks","months","years"])}
      <p class="note dprev" id="stk-prev">${streakPreview()}</p>`; }
  if (k==="privacy"){ body = `<span class="label">${ql}</span><h2 class="sign">Public or private?</h2>
      <p class="note">You can change this any time in the You tab.</p>${privacyPicker(ob.pv)}`; }
  const isReview = k === "review", last = isReview || !!ob.only;
  if (isReview){ const gym = ob.plan.filter((w,i)=>normalizeWorkout(w)&&!ob.opt[i]).length;
    body = `<span class="label">Check it</span><h2 class="sign">${ob.edit?"Save changes":"Ready to lift"}</h2>
      <div class="review" style="--c:var(--p-${ob.plate})">
        <div><span>Name</span><b>${esc(ob.name)}</b></div>
        <div><span>Goals</span><b>${esc(goalsText(ob.goals) || "Not set")}</b></div>
        <div><span>Plate</span><b style="display:flex;align-items:center;gap:6px">${plateSvg(ob.plate, 22)}${plateName(ob.plate)}</b></div>
        <div><span>Gym days a week</span><b>${gym}</b></div>
        ${ob.edit?"":`<div><span>Gym experience</span><b>${esc(durText(ob.exp))}</b></div>
          <div><span>Starting on</span><b>Week ${weekNo(previewMember())}</b></div>
          <div><span>Crew sees</span><b>${privacySummary({private:ob.pv.priv, splitHidden:ob.pv.hide})}</b></div>`}
        ${DAYS.map((d,i)=>{ const w = normalizeWorkout(ob.plan[i]); return `<div><span>${d}</span><b>${w?esc(w)+(ob.opt[i]?" (optional)":""):"Rest"}</b></div>`; }).join("")}
      </div>`; }
  main().innerHTML = `<div class="card ob">${dots}${body}
    <div class="row2"><button class="cta ghost" id="ob-back">${s===0 && !(k==="split" && (ob.splitMode==="ready" || ob.splitMode==="custom" || (ob.splitMode==="review" && !ob.edit))) ? "Cancel" : "Back"}</button>
    <button class="cta" id="ob-next" ${canNext?"":"disabled"} ${k==="split" && (ob.splitMode===null || ob.splitMode==="ready") ? "hidden" : ""}>${last?(ob.edit?"Save":"Join the crew"):"Next"}</button></div></div>`;
  const nextBtn = $("ob-next");
  const refresh = () => { const ok = k==="name" ? ob.nameState === "ok" : k==="goal" ? ob.goals.length > 0 : k==="split" ? splitReady() : true; nextBtn.disabled = !ok; };
  if (k==="name"){
    const f = $("f-name"), msg = $("name-msg");
    const show = (state, text) => { ob.nameState = state; ob.nameMsg = text; msg.textContent = text;
      msg.className = "note namemsg " + (state === "taken" || state === "bad" ? "bad" : state === "ok" ? "ok" : ""); refresh(); };
    const check = () => {
      clearTimeout(nameCheckT);
      const n = tidyName(f.value), problem = nameProblem(n);
      if (problem) return show("bad", problem);
      if (ob.edit && me() && tidyName(me().name).toLowerCase() === n.toLowerCase() && !nameProblem(me().name)) return show("ok", "That's your current name.");
      show("checking", "Checking…");
      const seq = ++nameCheckSeq;
      nameCheckT = setTimeout(async () => {
        const taken = await checkNameTaken(n);
        if (seq !== nameCheckSeq) return;            // they kept typing; an older answer doesn't count
        if (taken === null) show("ok", "Couldn't check right now. We'll check again when you save.");
        else show(taken ? "taken" : "ok", taken ? `“${n}” is taken. Try adding an initial, like “${n} K”.` : `“${n}” is free.`);
      }, 350);
    };
    f.oninput = () => { ob.name = f.value; check(); };
    f.focus(); f.onkeydown = e => { if (e.key==="Enter" && ob.nameState === "ok") nextBtn.click(); };
    if (!ob.nameState) check();
  }
  if (k==="goal") main().querySelectorAll("[data-goal]").forEach(b => b.onclick = () => { ob.goals = toggleIn(ob.goals, b.dataset.goal); render(); });
  if (k==="plate") main().querySelectorAll("[data-plate]").forEach(b => b.onclick = () => { ob.plate = b.dataset.plate; render(); });
  if (k==="split") wireSplitStep();
  if (k==="privacy") wirePrivacy(ob.pv, render);
  if (k==="experience") wireDur("exp", ob.exp, () => { $("exp-prev").innerHTML = expPreview(); });
  if (k==="streak") wireDur("stk", ob.streak, () => { $("stk-prev").innerHTML = streakPreview(); });
  $("ob-back").onclick = () => {
    if (k==="split" && (ob.splitMode === "ready" || ob.splitMode === "custom")){ ob.splitMode = hasPlan() ? "review" : null; render(); return; }
    if (k==="split" && ob.splitMode === "review" && !ob.edit){ ob.splitMode = null; render(); return; }
    if (s===0){ ob = null; } else ob.step--; render(); };
  nextBtn.onclick = () => { if (last) saveOnboarding(); else { ob.step++; render(); } };
}
// ---- Split step: a simple choice first, then either a ready-made split or building it day by day ----
//   choose  → "Pick a ready-made split" / "Build my own"
//   ready   → cards grouped Beginner / Popular / Advanced; one tap picks one
//   custom  → 7 day rows; tap a day to pick from the basics (or Rest)
//   review  → your week at a glance, with "Change a day"
// "Push Pull Legs" if your week matches a ready-made split, otherwise "Custom · 4 gym days"
function splitLabel(m){
  const mine = (m.plan || []).map(x => x ? normalizeWorkout(x.w) : "");
  const hit = SPLITS.find(x => x.days.every((d,i) => normalizeWorkout(d) === mine[i]));
  const n = (m.plan || []).filter(x => x && !x.opt).length;
  return (hit ? hit.name : "Custom") + ` · ${n} gym day${n===1?"":"s"}`;
}
const LEVELS = [["beginner","Beginner"],["popular","Popular"],["advanced","Advanced"]];
const hasPlan = () => ob.plan.some(w => normalizeWorkout(w));
const splitReady = () => ob.plan.some((w,i) => normalizeWorkout(w) && !ob.opt[i]) && (ob.splitMode === "review" || ob.splitMode === "custom");
const shortName = w => w.replace(/Upper Body/g,"Upper").replace(/Lower Body/g,"Lower");
const gymDays = days => days.filter(Boolean).length;
const weekStrip = days => `<span class="wstrip">${days.map((w,i)=>`<i class="${w?"on":""}" title="${DAYS[i]}: ${esc(w||"Rest")}">${DAYS[i][0]}</i>`).join("")}</span>`;
function splitStepHtml(ql){
  if (ob.splitMode === undefined) ob.splitMode = ob.edit && hasPlan() ? "review" : null;
  const head = (title, sub) => `<span class="label">${ql}</span><h2 class="sign">${title}</h2>${sub ? `<p class="note">${sub}</p>` : ""}`;
  if (ob.splitMode === null) return head("Your weekly split") + `
    <div class="pathpick">
      <button type="button" class="path" data-path="ready"><span class="rec">Recommended</span><b>Pick a ready-made split</b><small>Popular plans. One tap.</small></button>
      <button type="button" class="path" data-path="custom"><b>Build my own</b><small>Choose what you train each day.</small></button>
    </div>`;
  if (ob.splitMode === "ready"){
    const lvl = ob.splitLevel || "popular";
    const cards = SPLITS.filter(x => x.level === lvl).map(x => `<button type="button" class="splitcard" data-split="${esc(x.name)}">
        <span class="sc-top"><b>${esc(x.name)}</b><span class="sc-days">${gymDays(x.days)} days</span></span>
        <small>${esc(x.desc)}</small>${weekStrip(x.days)}</button>`).join("");
    return head("Pick a split") + `<div class="seg levelseg" role="tablist">${LEVELS.map(([id,l]) =>
        `<button type="button" role="tab" data-level="${id}" aria-pressed="${id===lvl}">${l}</button>`).join("")}</div>
      <div class="splitcards">${cards}
        <button type="button" class="splitcard buildown" data-path="custom"><span class="sc-top"><b>Build my own</b><span class="sc-days">Custom</span></span>
          <small>None of these fit? Choose what you train each day.</small></button></div>`;
  }
  if (ob.splitMode === "custom"){
    const a = ob.active ?? -1;
    const rows = DAYS.map((d,i) => { const w = normalizeWorkout(ob.plan[i]), open = a === i, parts = w ? w.split(" + ") : [];
      return `<div class="crow ${open?"open":""}">
        <button type="button" class="crow-h" data-day="${i}"><b class="sign">${d}</b><span id="crow-v-${i}" class="${w?"":"rest"}">${esc(w ? shortName(w) : "Rest")}${ob.opt[i]&&w?' <em>optional</em>':""}</span><i class="chev"></i></button>
        ${open ? `<div class="crow-b">
          <input class="field daytype" id="f-type-${i}" data-type="${i}" type="text" maxlength="40" value="${esc(w)}" placeholder="Type it… e.g. back and biceps" autocapitalize="words" autocomplete="off" spellcheck="false" enterkeyhint="done">
          <small class="tidy" id="tidy-${i}"></small>
          <span class="label orlabel">Or tap</span><div class="basics">${BASICS.map(q => `<button type="button" class="chip" data-basic="${esc(q)}" aria-pressed="${parts.includes(q)}">${esc(shortName(q))}</button>`).join("")}
            <button type="button" class="chip ghostchip" data-basic="__rest" aria-pressed="${!w}">Rest</button></div>
          ${w ? `<label class="tg optrow" for="f-opt-${i}"><span><b>Optional day</b><small>Skipping it won't break your streak</small></span><input type="checkbox" class="sw" id="f-opt-${i}" data-o="${i}" ${ob.opt[i]?"checked":""}></label>` : ""}
        </div>` : ""}</div>`; }).join("");
    return head("Build your week", "Tap a day, then type it or tap the buttons.") + `<div class="clist">${rows}</div>`;
  }
  // review
  const list = DAYS.map((d,i) => { const w = normalizeWorkout(ob.plan[i]);
    return `<div class="rv"><b class="sign">${d}</b><span class="${w?"":"rest"}">${esc(w || "Rest")}</span>${w && ob.opt[i] ? '<span class="label">Optional</span>' : ""}</div>`; }).join("");
  return head("Your week", `${ob.plan.filter((w,i)=>normalizeWorkout(w)&&!ob.opt[i]).length} gym days. Looks right?`) + `<div class="rvlist">${list}</div>
    <div class="rvbtns"><button type="button" class="path small" data-path="custom"><b>Build my own</b><small>Change any day</small></button>
      <button type="button" class="path small" data-path="ready"><b>Ready-made</b><small>Pick a different split</small></button></div>`;
}
function wireSplitStep(){
  main().querySelectorAll("[data-path]").forEach(b => b.onclick = () => { ob.splitMode = b.dataset.path; if (ob.splitMode === "custom" && ob.active === undefined) ob.active = 0; render(); });
  main().querySelectorAll("[data-level]").forEach(b => b.onclick = () => { ob.splitLevel = b.dataset.level; render(); });
  main().querySelectorAll("[data-split]").forEach(b => b.onclick = () => {
    const x = SPLITS.find(s => s.name === b.dataset.split); if (!x) return;
    ob.plan = [...x.days]; ob.opt = ob.opt.map(() => false); ob.splitMode = "review"; render(); window.scrollTo(0,0); });
  main().querySelectorAll("[data-day]").forEach(b => b.onclick = () => { const i = +b.dataset.day; ob.active = ob.active === i ? -1 : i; ob.focusType = ob.active === i; render(); });
  // Typing a day: show the tidied name live WITHOUT re-drawing the screen (that would close the keyboard);
  // save + re-draw when they press Enter or tap away.
  main().querySelectorAll("[data-type]").forEach(inp => {
    const i = +inp.dataset.type, tidy = $("tidy-"+i), head = $("crow-v-"+i);
    const pressButtons = clean => { const parts = clean ? clean.split(" + ") : [];     // buttons follow what's typed
      main().querySelectorAll("[data-basic]").forEach(c => c.setAttribute("aria-pressed", c.dataset.basic === "__rest" ? String(!clean) : String(parts.includes(c.dataset.basic)))); };
    const live = () => { ob.plan[i] = inp.value; const clean = normalizeWorkout(inp.value), typed = inp.value.trim();
      tidy.textContent = typed && clean !== typed ? (clean ? "→ " + clean : "→ Rest day") : "";
      head.textContent = clean ? shortName(clean) : "Rest"; head.className = clean ? "" : "rest";
      const nx = $("ob-next"); if (nx) nx.disabled = !splitReady(); pressButtons(clean); };
    // tidy in place (no re-draw), so a tap on Save or another day straight after typing still counts
    const commit = () => { const clean = normalizeWorkout(inp.value); ob.plan[i] = clean; if (!clean) ob.opt[i] = false;
      inp.value = clean; tidy.textContent = ""; pressButtons(clean); };
    inp.oninput = live;
    inp.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); inp.blur(); } };
    inp.onblur = commit;
    live();
    if (ob.focusType){ ob.focusType = false; inp.focus(); }
  });
  main().querySelectorAll("[data-basic]").forEach(b => b.onpointerdown = e => e.preventDefault());
  main().querySelectorAll("[data-basic]").forEach(b => b.onclick = () => {
    const i = ob.active, q = b.dataset.basic; if (i < 0) return;
    if (q === "__rest"){ ob.plan[i] = ""; ob.opt[i] = false; }
    else { const have = normalizeWorkout(ob.plan[i]).split(" + ").filter(Boolean);
      ob.plan[i] = (have.includes(q) ? have.filter(x => x !== q) : [...have, q]).join(" + "); }
    render(); });
  main().querySelectorAll("[data-o]").forEach(cb => cb.onchange = () => { ob.opt[+cb.dataset.o] = cb.checked; render(); });
}

// ---- Name rules: letters (any language), numbers, spaces and . ' - _ only; no emoji; one of each name in the crew ----
const tidyName = n => String(n || "").replace(/\s+/g, " ").trim();
function nameProblem(n){
  n = tidyName(n);
  if (!n) return "Type a name.";
  if (/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}‍️]/u.test(n)) return "No emoji in names, just letters and numbers.";
  if (!/^[\p{L}\p{M}\p{N} .'\-_]+$/u.test(n)) return "Only letters, numbers, spaces and . ' - _ please.";
  if (n.length > 20) return "20 characters max.";
  return "";
}
let nameCheckT = null, nameCheckSeq = 0;
// Asks the database (which can see everyone, including private members) whether someone else already has this name
async function checkNameTaken(n){
  const { data, error } = await sb.rpc("name_taken", { p_name: tidyName(n) });
  return error ? null : !!data;
}

async function saveOnboarding(){
  const plan = ob.plan.map((w,i)=> { const t = normalizeWorkout(w); return t ? {w:t, opt:!!ob.opt[i]} : null; });
  const old = ob.edit ? me() : null;
  const ws = startOfWeek(today());
  const row = { id: myId, name: tidyName(ob.name).slice(0,20), plate: ob.plate, plan, goals: ob.goals, goal: legacyGoal(ob.goals) };
  if (!old){ row.since = key(streakStart(ob.streak)); row.track_start = key(ws);
    // you can't have been consistent for longer than you've been going at all
    const exp = durStart(ob.exp); row.trained_since = key(exp < parse(row.since) ? exp : parse(row.since));
    Object.assign(row, { account: ob.pv.priv ? "private" : "public", hide_split: !!ob.pv.hide, seen_update: 1,
      is_public: !ob.pv.priv, share_attendance: !ob.pv.priv, share_split: !ob.pv.hide, share_steps: false, privacy_chosen: true }); }
  const wasEdit = ob.edit;
  const btn = $("ob-next"); if (btn) btn.disabled = true;
  // Editing: UPDATE only the changed fields. (An upsert is checked like a brand-new row,
  // and a new row must have a start date, which is why editing used to fail.)
  // Joining: INSERT the full profile.
  const { error } = old
    ? await sb.from("profiles").update(
        // editing one thing from the You tab only sends that one thing
        ob.only === "name" ? { name: row.name } : ob.only === "plate" ? { plate: row.plate } : ob.only === "split" ? { plan: row.plan }
        : { name: row.name, plate: row.plate, plan: row.plan, goals: row.goals, goal: row.goal }).eq("id", myId)
    : await sb.from("profiles").insert(row);
  if (error){
    if (btn) btn.disabled = false;
    // someone grabbed the name between typing and saving, or it broke a name rule: back to the name question
    const nameErr = error.code === "23505" ? `“${row.name}” was just taken by someone else. Pick another.` : /NAME_RULES/.test(error.message) ? "No emoji in names, just letters and numbers." : "";
    if (nameErr){ ob.step = 0; ob.nameState = "bad"; ob.nameMsg = nameErr; render(); return; }   // the name question is step 0
    showWarn("Couldn't save: " + error.message); return;
  }
  ob = null; tab = wasEdit ? "you" : "today";
  await loadAll();
  if (!wasEdit){ toast("Welcome to the crew"); burst(); } else toast("Saved");
}


// ================= Data (Supabase) =================
// Two tables: profiles (one row per person) and checkins (one row per person per day they trained).
// We load everything, build the same "members" shape the screens use, and reload when anything changes.
async function fetchAll(table, cols, filter){
  const out = []; const page = 1000;
  for (let from = 0; ; from += page){
    let q = sb.from(table).select(cols);
    if (filter) q = filter(q);
    const { data, error } = await q.range(from, from + page - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < page) break;
  }
  return out;
}
let loading = null;
async function loadAll(){
  if (loading) return loading;
  loading = (async () => {
    try {
      const [profiles, checkins] = await Promise.all([
        // "crew" is a database view that already strips out whatever each person keeps private
        // "people" (database view) = everyone, with only what I'm allowed to see about each person
        fetchAll("people", "id,name,plate,plan,since,track_start,created_at,private,visible,split_hidden,account,seen_update,i_bud,they_bud,n_buds,n_spotting,n_spotters"),
        fetchAll("checkins", "user_id,day")
      ]);
      // Steps: only the last ~8 weeks (the database already hides anyone who keeps steps private)
      let stepRows = [];
      if (STEPS_ENABLED){
        stepRows = await fetchAll("steps", "user_id,day,count,updated_at", q => q.gte("day", key(addDays(today(), -56)))).catch(() => []);
        const own = await sb.from("profiles").select("steps_token").eq("id", myId).maybeSingle();
        stepsKey = own.data?.steps_token || null;
      }
      const next = new Map();
      // tidy older, hand-typed split names on the way in ("back bicep" -> "Back + Biceps")
      const tidyPlan = plan => Array.isArray(plan) ? plan.map(s => s && s.w ? { ...s, w: normalizeWorkout(s.w) || s.w } : s) : plan;
      for (const p of profiles) next.set(p.id, { id:p.id, name:p.name, plate:p.plate, plan:tidyPlan(p.plan), since:p.since, trackStart:p.track_start, joined:p.created_at,
        isPublic:!p.private, shareAtt:p.visible, shareSplit:!p.split_hidden, privacyChosen:true, shareSteps:false,
        private:p.private, visible:p.visible, splitHidden:p.split_hidden, account:p.account, seenUpdate:p.seen_update || 0, iBud:p.i_bud, theyBud:p.they_bud, nBuds:p.n_buds || 0, nSpotting:p.n_spotting || 0, nSpotters:p.n_spotters || 0,
        days:{}, steps:{}, stepsAt:null });
      for (const c of checkins){ const m = next.get(c.user_id); if (m) m.days[c.day] = 1; }
      for (const s of stepRows){ const m = next.get(s.user_id); if (m){ m.steps[s.day] = s.count; if (!m.stepsAt || s.updated_at > m.stepsAt) m.stepsAt = s.updated_at; } }
      // Streak freezes (the database only returns your own + people who share attendance)
      // Circles I'm in (the database only returns those) and their members
      const [cRows, cmRows] = await Promise.all([
        fetchAll("circles", "id,name,emoji,invite_code,created_by,created_at").catch(() => []),
        fetchAll("circle_members", "circle_id,user_id,role,muted,added_by,joined_at").catch(() => [])]);
      circles = cRows.map(c => ({ ...c, members: cmRows.filter(m => m.circle_id === c.id).sort((a,b) => String(a.joined_at).localeCompare(String(b.joined_at))) }))
        .sort((a,b) => String(a.created_at).localeCompare(String(b.created_at)));
      const freezeRows = await fetchAll("freezes", "user_id,day").catch(() => []);
      for (const f of freezeRows){ const m = next.get(f.user_id); if (m){ (m.frozen = m.frozen || {})[f.day] = 1; } }
      // Reactions from the last week, nudges to/from me from the last 2 days
      reactions = await fetchAll("reactions", "from_user,to_user,day,emoji", q => q.gte("day", key(addDays(today(), -8)))).catch(() => []);
      nudges = await fetchAll("nudges", "from_user,to_user,day,seen,created_at", q => q.gte("day", key(addDays(today(), -1)))).catch(() => []);
      // everyone I've ever nudged (non-buds only get one nudge, ever)
      sentNudgeTo = new Set((await fetchAll("nudges", "to_user", q => q.eq("from_user", myId)).catch(() => [])).map(n => n.to_user));
      // My private stuff: goal, height and weight log (nobody else can read these)
      const mine = await sb.from("profiles").select("goal,goals,height_cm,trained_since,notif_nudge,notif_react,notif_crew,notif_remind,remind_at").eq("id", myId).maybeSingle();
      if (mine.data && "notif_nudge" in mine.data) notif = { nudge: mine.data.notif_nudge, react: mine.data.notif_react, crew: mine.data.notif_crew,
        remind: mine.data.notif_remind, at: String(mine.data.remind_at || "19:00").slice(0,5) };
      syncPush();
      body.goals = mine.data?.goals?.length ? mine.data.goals : (mine.data?.goal ? [mine.data.goal] : []);
      body.trainedSince = mine.data?.trained_since || null;
      body.height = mine.data?.height_cm ? Number(mine.data.height_cm) : null;
      body.weights = (await fetchAll("bodyweight", "day,kg", q => q.order("day")).catch(() => [])).map(r => ({ day: r.day, kg: Number(r.kg) }));
      members = next; ready = true; $("warn").hidden = true;
    } catch(e){ showWarn("Couldn't load the crew: " + (e.message || e)); ready = true; }
    finally { loading = null; render(); loadMemberCount(); }
  })();
  return loading;
}
let reloadT;
const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(loadAll, 300); };
let channel = null;
function subscribe(){
  if (channel) return;
  channel = sb.channel("crew")
    .on("postgres_changes", { event:"*", schema:"public", table:"checkins" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"profiles" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"steps" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"reactions" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"nudges" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"freezes" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"buds" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"circles" }, reloadSoon)
    .on("postgres_changes", { event:"*", schema:"public", table:"circle_members" }, reloadSoon)
    .subscribe();
}

// ================= Writes =================
const busy = new Set();
async function toggleDay(d){
  const m = me(); if (!m || !db) return;
  const k = key(d); if (busy.has(k)) return; busy.add(k);
  const was = !!(m.days && m.days[k]), before = weekStats(m,startOfWeek(d));
  const days = {...(m.days||{})}; if (was) delete days[k]; else days[k] = 1;
  members.set(myId, {...m, days});
  if (!was && isGym(m,d) && key(startOfWeek(d)) === key(startOfWeek(today()))){   // the new plate slides on
    newPlate = weekStats(me(), startOfWeek(d)).hit - 1; setTimeout(() => { newPlate = -1; }, 700); }
  render();   // show it instantly, save in the background
  if (!was){
    try{ navigator.vibrate && navigator.vibrate(15); }catch(e){}
    burst();
    const nm = me(), w = weekStats(nm,startOfWeek(d));
    if (isGym(nm,d) && w.target && w.hit===w.target && before.hit<before.target) toast(`Week ${weekNo(nm)} — full bar`);
    else if (isGym(nm,d)) toast(`${dayStreak(nm)} day streak`);
    else toast("Bonus session");
  }
  // Both saves are safe to repeat: logging a day that's already logged (e.g. an earlier save that
  // looked like it failed but actually landed) just does nothing instead of a "duplicate key" error.
  const save = () => was
    ? sb.from("checkins").delete().eq("user_id", myId).eq("day", k)
    : sb.from("checkins").upsert({ user_id: myId, day: k }, { onConflict: "user_id,day", ignoreDuplicates: true });
  let { error } = await save();
  if (error && /load failed|failed to fetch|network/i.test(error.message||"")){ await new Promise(r => setTimeout(r, 1200)); ({ error } = await save()); }
  busy.delete(k);
  if (error){
    // Before undoing on screen, ask the server what's really saved (the save may have landed anyway)
    const chk = await sb.from("checkins").select("day").eq("user_id", myId).eq("day", k);
    if (!chk.error && (chk.data.length > 0) === !was) return;   // it did save: keep it, no warning
    members.set(myId, m); render(); showWarn("Couldn't save that — check your internet and try again.");
  }
}

// ================= FX: chalk burst =================
let toastT;
function toast(msg){ const t=$("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("show"),2200); }
function showWarn(t){ const w=$("warn"); w.textContent=t; w.hidden=false; }
function burst(){
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cv=$("fx"), ctx=cv.getContext("2d"), dpr=window.devicePixelRatio||1;
  cv.width=innerWidth*dpr; cv.height=innerHeight*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
  const cs=getComputedStyle(document.documentElement), m=me();
  const col=(cs.getPropertyValue("--p-"+(m?.plate||"white"))||"#888").trim();
  const cx=innerWidth/2, cy=innerHeight*.45;
  const P=Array.from({length:140},(_,i)=>{const a=Math.random()*Math.PI*2, v=Math.random()*9+2;
    return {x:cx,y:cy,vx:Math.cos(a)*v,vy:Math.sin(a)*v-3,r:Math.random()*5+1.5,life:1,decay:Math.random()*.012+.01,c:i%4===0?col:(i%2?"#f2f2ef":"#c9cbcd")};});
  (function step(){ ctx.clearRect(0,0,innerWidth,innerHeight); let alive=false;
    for(const p of P){ if(p.life<=0) continue; alive=true; p.vx*=.95; p.vy=p.vy*.95+.12; p.x+=p.vx; p.y+=p.vy; p.life-=p.decay; p.r*=1.01;
      ctx.globalAlpha=Math.max(0,p.life)*.9; ctx.fillStyle=p.c; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,7); ctx.fill(); }
    ctx.globalAlpha=1; if(alive) requestAnimationFrame(step); else ctx.clearRect(0,0,innerWidth,innerHeight); })();
}



// ================= Member count =================
// How many people have signed up (everyone, including private profiles). Just a number, no names.
// member_count() is a tiny database function; it refreshes whenever the app loads its data.
let memberCount = 0;
async function loadMemberCount(){
  const { data, error } = await sb.rpc("member_count");
  if (!error && typeof data === "number"){ memberCount = data; renderOnline(); }
}
function renderOnline(){
  const el = $("online"); if (!el) return;
  const show = !!session && !ob && memberCount > 0 && !needsInstall() && !locked && authKnown;
  el.hidden = !show; if (!show) return;
  el.setAttribute("aria-label", `${memberCount} ${memberCount === 1 ? "person has" : "people have"} joined CREW`);
  el.innerHTML = `<span class="live" aria-hidden="true"></span><b class="mono">${memberCount}</b><span class="olabel">${memberCount === 1 ? "member" : "members"}</span>`;
}

// ================= Login screens =================
let authMode = "signin", authMsg = "", authErr = "";
function viewAuth(){
  $("title").textContent = authMode==="signup" ? "Join" : authMode==="reset" ? "Reset" : authMode==="newpass" ? "New password" : "Sign in";
  const isUp = authMode==="signup";
  let body;
  if (authMode==="newpass"){
    body = `<span class="label">Almost there</span><h2 class="sign" style="font-size:40px;margin:0">Choose a new password</h2>
      <input class="field" id="a-pass" type="password" placeholder="New password (8+ characters)" autocomplete="new-password">
      <button class="cta" id="a-go">Save password</button>`;
  } else if (authMode==="reset"){
    body = `<span class="label">Forgot it?</span><h2 class="sign" style="font-size:40px;margin:0">Reset your password</h2>
      <input class="field" id="a-email" type="email" placeholder="Email" autocomplete="email" inputmode="email">
      <button class="cta" id="a-go">Send reset email</button>
      <button class="linkbtn" id="a-switch">Back to sign in</button>`;
  } else {
    body = `<span class="label">${isUp ? "New here" : "Welcome back"}</span>
      <h2 class="sign" style="font-size:48px;margin:0">${isUp ? "Join the crew" : "Load the bar"}</h2>
      <p class="note">${isUp ? "Make an account, set your split, then tick off every session." : "Sign in to log today's session."}</p>
      <input class="field" id="a-email" type="email" placeholder="Email" autocomplete="email" inputmode="email">
      <input class="field" id="a-pass" type="password" placeholder="Password${isUp?" (8+ characters)":""}" autocomplete="${isUp?"new-password":"current-password"}">
      <button class="cta" id="a-go">${isUp ? "Create account" : "Sign in"}</button>
      <button class="linkbtn" id="a-switch">${isUp ? "Already have an account? Sign in" : "New here? Create an account"}</button>
      ${isUp ? "" : `<button class="linkbtn" id="a-forgot">Forgot password?</button>`}`;
  }
  main().innerHTML = `<div class="card auth">${body}<div class="err" id="a-err">${esc(authErr)}</div>${authMsg?`<div class="okmsg">${esc(authMsg)}</div>`:""}</div>`;
  const go = $("a-go"), email = $("a-email"), pass = $("a-pass");
  const submit = async () => {
    authErr = ""; authMsg = ""; go.disabled = true;
    let res;
    if (authMode==="signin") res = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pass.value });
    else if (authMode==="signup"){
      if (pass.value.length < 8){ authErr = "Use at least 8 characters for your password."; go.disabled = false; return render(); }
      res = await sb.auth.signUp({ email: email.value.trim(), password: pass.value, options:{ emailRedirectTo: location.origin + location.pathname } });
      if (!res.error && !res.data.session){ authMode = "signin"; authMsg = "Check your email and tap the confirm link, then sign in here."; }
    }
    else if (authMode==="reset"){
      res = await sb.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: location.origin + location.pathname });
      if (!res.error){ authMode = "signin"; authMsg = "Reset email sent. Open the link in it to choose a new password."; }
    }
    else if (authMode==="newpass"){
      res = await sb.auth.updateUser({ password: pass.value });
      if (!res.error){ authMode = "signin"; toast("Password updated"); }
    }
    if (res && res.error) authErr = res.error.message;
    go.disabled = false; render();
  };
  go.onclick = submit;
  [email, pass].forEach(f => f && (f.onkeydown = e => { if (e.key === "Enter") submit(); }));
  const sw = $("a-switch"); if (sw) sw.onclick = () => { authMode = authMode==="signup" ? "signin" : authMode==="reset" ? "signin" : "signup"; authErr = authMsg = ""; render(); };
  const fg = $("a-forgot"); if (fg) fg.onclick = () => { authMode = "reset"; authErr = authMsg = ""; render(); };
  (email || pass)?.focus();
}
function viewSetup(){
  $("title").textContent = "Setup";
  main().innerHTML = `<div class="card"><span class="label">Almost ready</span>
    <h2 class="sign" style="font-size:40px;margin:6px 0">Database not connected yet</h2>
    <p class="note">Add the Supabase URL and anon key to <b>config.js</b>, then reload.</p></div>`;
}

// ================= Get the app (install screen) =================
// People open the shared link in a browser. On a phone we want them to add it to the
// Home Screen FIRST: it opens full-screen, stays logged in, and (on iPhone) the Home Screen
// app keeps its own login, so signing up in Safari first would mean signing in twice.
// iPhone: Apple doesn't let websites install themselves, so we show 3 clear steps.
// Android Chrome: the browser gives us a real one-tap "Install" prompt.
const UA = navigator.userAgent || "";
const device = {
  standalone: (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true,
  ios: /iPhone|iPad|iPod/.test(UA) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
  iphone: /iPhone|iPod/.test(UA),
  android: /Android/.test(UA),
  // apps that open links in their own mini-browser, where "Add to Home Screen" doesn't exist
  inApp: /Instagram|FBAN|FBAV|FB_IAB|Messenger|WhatsApp|Snapchat|TikTok|musical_ly|LinkedInApp|Line\/|GSA\/|Twitter/i.test(UA),
};
device.phone = device.ios || device.android;
let installPrompt = null, installed = false;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; if (needsInstall()) render(); });
window.addEventListener("appinstalled", () => { installed = true; installPrompt = null; render(); });

const skipKey = "gs-skip-install";
const installSkipped = () => { try { return sessionStorage.getItem(skipKey) === "1"; } catch(_) { return false; } };
const needsInstall = () => device.phone && !device.standalone && !installSkipped();

const ICON_SHARE = '<svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg>';
const ICON_ADD   = '<svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8.5v7M8.5 12h7"/></svg>';
const ICON_DOTS  = '<svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/></svg>';
const ICON_KEBAB = '<svg class="gl" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="6" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18" r="1.6"/></svg>';

function viewInstall(){
  $("title").textContent = "Welcome";
  const link = location.origin + location.pathname;
  const head = `<div class="ihead"><img class="iapp" src="${ICON}" alt="" width="72" height="72">
    <div><span class="label">CREW</span><h2 class="sign">Put it on your Home Screen</h2>
    <p class="note">It takes 10 seconds. Then it opens like a normal app, full screen, and stays logged in.</p></div></div>`;
  const step = (n, title, sub) => `<li class="istep"><span class="inum mono">${n}</span><div><b>${title}</b>${sub ? `<span class="note">${sub}</span>` : ""}</div></li>`;
  let body = "", pointer = false;
  const inv = pendingJoin ? `<div class="card invitecode"><b>🎉 You've been invited to a circle</b>
      <span class="note">Copy this code. After you open CREW from your Home Screen, go to <b>Crew → Circles → Join with code</b>.</span>
      <span class="codebox mono">${esc(pendingJoin)}</span><button type="button" class="chip" id="inv-copy">Copy code</button></div>` : "";

  if (installed){
    body = `<ol class="isteps">${step("✓", "Done! It's on your Home Screen", "Close this browser and open <b>CREW</b> from your Home Screen to sign up.")}</ol>`;
  } else if (device.inApp){
    body = `<p class="ilead">You opened this inside another app. Open it in your normal browser to add it:</p>
      <ol class="isteps">
        ${step(1, "Copy the link", "")}
        ${step(2, device.ios ? "Open <b>Safari</b> and paste it" : "Open <b>Chrome</b> and paste it", "")}
      </ol>
      <button class="cta" id="i-copy">Copy link</button>
      <p class="note" style="text-align:center">Or tap ${ICON_DOTS} / ${ICON_SHARE} in this app and choose <b>Open in ${device.ios ? "Safari" : "browser"}</b>.</p>`;
  } else if (device.ios){
    pointer = device.iphone;   // iPhone Safari's toolbar is at the bottom
    body = `<ol class="isteps">
        ${step(1, `Tap the Share button ${ICON_SHARE}`, `${device.iphone ? "It's in the bar at the bottom." : "It's at the top of the screen."} Can't see it? Tap ${ICON_DOTS} first.`)}
        ${step(2, `Tap <span class="pill">${ICON_ADD} Add to Home Screen</span>`, "You may need to scroll down a little.")}
        ${step(3, "Tap <b>Add</b>", "Then open CREW from your Home Screen and sign up there.")}
      </ol>`;
  } else if (device.android && installPrompt){
    body = `<button class="cta" id="i-install">Install app</button>
      <p class="note" style="text-align:center">One tap. It goes on your Home Screen like any other app.</p>`;
  } else {
    body = `<ol class="isteps">
        ${step(1, `Tap the menu ${ICON_KEBAB}`, "Top right of your browser.")}
        ${step(2, `Tap <b>Install app</b> or <b>Add to Home screen</b>`, "")}
        ${step(3, "Open CREW from your Home Screen", "Sign up there.")}
      </ol>`;
  }
  main().innerHTML = `${inv}<div class="card install">${head}${body}
    <button class="linkbtn" id="i-skip">Use it in the browser for now</button></div>
    ${pointer ? `<div class="ipoint" aria-hidden="true"><span>Share is down here</span><svg viewBox="0 0 24 24"><path d="M12 4v15M6 13l6 6 6-6"/></svg></div>` : ""}`;

  const ic = $("inv-copy"); if (ic) ic.onclick = async () => { try { await navigator.clipboard.writeText(pendingJoin); ic.textContent = "Copied ✓"; } catch(_) {} };
  const cp = $("i-copy"); if (cp) cp.onclick = async () => {
    try { await navigator.clipboard.writeText(link); cp.textContent = "Copied ✓"; }
    catch(_) { cp.textContent = link; }
  };
  const ins = $("i-install"); if (ins) ins.onclick = async () => {
    installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    installPrompt = null;
    if (choice && choice.outcome === "accepted") installed = true;
    render();
  };
  $("i-skip").onclick = () => { try { sessionStorage.setItem(skipKey, "1"); } catch(_) {} render(); };
}

// ================= Face ID / fingerprint lock (optional) =================
// Uses the phone's built-in biometrics through WebAuthn (the same tech as passkeys).
// It's a privacy lock on THIS device, like the Face ID lock in WhatsApp: you stay logged in,
// and opening the app asks for your face or finger first. Nothing biometric ever leaves the phone.
const LOCK_KEY = "gs-lock";               // { uid, cred } saved on this device only
const LOCK_AFTER_MS = 60 * 1000;          // re-lock if the app was in the background for a minute
let locked = false, lockErr = "", bioAvailable = false, hiddenAt = 0;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => crypto.getRandomValues(new Uint8Array(n));
function lockInfo(){ try { const v = JSON.parse(localStorage.getItem(LOCK_KEY) || "null"); return v && v.uid === myId ? v : null; } catch(_) { return null; } }
// iPhones with a notch/island (taller screens) have Face ID; older ones (e.g. iPhone SE) have Touch ID
const bioName = () => device.ios ? (Math.max(screen.width, screen.height) >= 812 ? "Face ID" : "Touch ID")
  : device.android ? "your fingerprint" : /Mac/.test(navigator.platform) ? "Touch ID" : /Win/.test(navigator.platform) ? "Windows Hello" : "your fingerprint";
(async () => {
  try { bioAvailable = !!(window.PublicKeyCredential && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()); }
  catch(_) { bioAvailable = false; }
  if (tab === "you" && session) render();
})();

async function enableLock(){
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: rand(32),
      rp: { name: "CREW", id: location.hostname },
      user: { id: new TextEncoder().encode(myId), name: session?.user?.email || "CREW", displayName: me()?.name || "CREW" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "discouraged" },
      timeout: 60000,
    }});
    if (!cred) throw new Error("cancelled");
    localStorage.setItem(LOCK_KEY, JSON.stringify({ uid: myId, cred: b64u(cred.rawId) }));
    toast(`${bioName()} lock on`); render();
  } catch(e){
    if (e && e.name === "NotAllowedError") toast("Cancelled");
    else showWarn(`Couldn't turn on ${bioName()}: ${e && e.message ? e.message : e}`);
  }
}
function disableLock(){ try { localStorage.removeItem(LOCK_KEY); } catch(_) {} toast("Lock off"); render(); }

async function unlock(){
  const info = lockInfo(); if (!info){ locked = false; return render(); }
  lockErr = "";
  try {
    const ok = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), rpId: location.hostname, timeout: 60000, userVerification: "required",
      allowCredentials: [{ type: "public-key", id: unb64u(info.cred) }],
    }});
    if (ok){ locked = false; render(); return; }
  } catch(e){
    lockErr = e && e.name === "NotAllowedError" ? "Didn't work. Try again." : "Couldn't use " + bioName() + ".";
  }
  render();
}
function viewLock(){
  $("title").textContent = "Locked";
  const m = me();
  main().innerHTML = `<div class="card lockcard">
    <img class="iapp" src="${ICON}" alt="" width="72" height="72">
    <h2 class="sign">CREW</h2>
    <p class="note">${m ? esc(m.name) + ", unlock" : "Unlock"} with ${bioName()} to open the app.</p>
    <button class="cta" id="lk-go">Unlock</button>
    ${lockErr ? `<p class="err">${esc(lockErr)}</p>` : ""}
    <button class="linkbtn" id="lk-pass">Use my password instead</button></div>`;
  $("lk-go").onclick = unlock;
  // Fallback: sign out and log back in with email + password (also turns the lock off on this device)
  $("lk-pass").onclick = async () => { try { localStorage.removeItem(LOCK_KEY); } catch(_) {} locked = false; await sb.auth.signOut(); };
}
function lockCard(){
  if (!bioAvailable) return "";
  const on = !!lockInfo();
  return `<div class="sec"><h2 class="sign">Security</h2><span class="label">${on ? "On" : "Off"}</span></div>
  <div class="card"><label class="tg" for="lk-toggle" style="background:transparent;padding:0"><span><b>Lock with ${bioName()}</b>
    <small>Asks for ${bioName()} when you open the app. You stay logged in either way.</small></span>
    <input type="checkbox" class="sw" id="lk-toggle" ${on ? "checked" : ""}></label></div>`;
}
function wireLockCard(){
  const t = $("lk-toggle"); if (!t) return;
  t.onchange = () => { if (t.checked) enableLock(); else disableLock(); };
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  else if (hiddenAt && Date.now() - hiddenAt > LOCK_AFTER_MS && session && lockInfo()){ locked = true; lockErr = ""; render(); }
});

// ================= Notifications (Web Push) =================
// Turning them on asks the phone for a private "push address" at Apple/Google plus two encryption keys.
// We save that in push_subs; the server's "push" function encrypts each message for this phone and posts it there.
// On iPhone this only works once the app is on the Home Screen (iOS 16.4 or newer).
let notif = { nudge: true, react: true, crew: true, remind: true, at: "19:00" };
let pushOn = false, pushBusy = false;
const PUSH_URL = () => window.GYM_CONFIG.SUPABASE_URL + "/functions/v1/push";
const pushSupported = () => !BETA && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function pushState(){
  if (!pushSupported()) return device.ios && !device.standalone ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return pushOn ? "on" : "off";
}
// "Maybe later" hides the big popup for a day (3 days if they've blocked notifications, since fixing that is more effort)
const SNOOZE_KEY = "gs-push-snooze";
const snoozedPush = () => { try { return Number(localStorage.getItem(SNOOZE_KEY) || 0) > Date.now(); } catch(_) { return true; } };
const setAskedPush = (days = 1) => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + days * 864e5)); } catch(_) {} };

// ----- The big "turn notifications on" popup, shown when the app opens -----
let sheetShown = false;
function maybeShowPushSheet(){
  if (BETA) return;
  if (sheetShown || document.getElementById("pushsheet")) return;
  const st = pushState();
  if (!(st === "off" && Notification.permission === "default") && st !== "denied") return;
  if (snoozedPush() || !me() || ob || locked || tab !== "today") return;
  sheetShown = true;
  setTimeout(showPushSheet, 600);   // let the Today screen land first
}
function showPushSheet(){
  const m = me(); if (!m || document.getElementById("pushsheet")) return;
  const t = today(), w = slot(m, t)?.w, friend = "Your gym buddy";   // made-up on purpose: a real name here looked like a real nudge
  const denied = pushState() === "denied";
  // same wording as the real notifications (supabase/functions/push), using your own split and streak
  const n = dayStreak(m), day = w ? w + " day" : "Gym day", line = n >= 2 ? `Your ${n}-day streak is on the line.` : "Start a streak today.";
  const pn = (title, body, when) => `<div class="pn"><img src="${ICON}" alt="" width="34" height="34">
    <div class="grow"><span class="pn-top"><b>CREW</b><span class="pn-ex">Example</span></span><b class="pn-t">${esc(title)}</b><span class="pn-b">${esc(body)}</span></div></div>`;
  const wrap = document.createElement("div");
  wrap.id = "pushsheet"; wrap.className = "sheetwrap";
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="ps-title">
    <span class="rec">Recommended</span>
    <h2 class="sign" id="ps-title">Don't miss a nudge</h2>
    <p class="note">${denied ? "Notifications are blocked for CREW right now. Examples of what you're missing:" : "Examples of what you'll get. You choose which ones."}</p>
    <div class="pns">
      ${pn(`👊 ${friend} nudged you`, `${day} and it's not logged yet. ${line}`, "now")}
      ${pn(`⏰ ${day}: not logged yet`, `${line} Train, then tap to log it.`, "7:00 pm")}
      ${pn(`💪 ${friend} just trained`, `Session logged. Your ${w ? w + " session" : "session"} is still waiting.`, "2h ago")}
    </div>
    ${denied
      ? `<ol class="psteps">${device.ios
          ? "<li>Open the iPhone <b>Settings</b> app</li><li>Tap <b>Notifications</b>, then <b>CREW</b> (or <b>Streak</b> if you added it before the rename)</li><li>Turn on <b>Allow Notifications</b>, then reopen CREW</li>"
          : "<li>Open your browser or phone settings for this site</li><li>Allow <b>Notifications</b></li><li>Reopen CREW</li>"}</ol>
         <button class="cta" id="ps-ok">Got it</button>`
      : `<button class="cta" id="ps-yes">Turn on notifications</button>`}
    <button class="linkbtn" id="ps-later">Maybe later</button>
    <p class="note ps-foot">Change them any time in You → Notifications.</p>
  </div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add("open"));
  const close = () => { wrap.classList.remove("open"); setTimeout(() => wrap.remove(), 250); };
  wrap.onclick = e => { if (e.target === wrap){ setAskedPush(denied ? 3 : 1); close(); } };
  $("ps-later").onclick = () => { setAskedPush(denied ? 3 : 1); close(); };
  if ($("ps-ok")) $("ps-ok").onclick = () => { setAskedPush(3); close(); };
  if ($("ps-yes")) $("ps-yes").onclick = async () => {
    $("ps-yes").disabled = true; $("ps-yes").textContent = "Turning on…";
    await enablePush();      // straight from the tap, so iPhone shows its "Allow" box
    setAskedPush(1); close();
  };
}
const keyBytes = s => Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/") + "===".slice((s.length+3)%4)), c => c.charCodeAt(0));
async function saveSub(sub){
  const j = sub.toJSON();
  const { error } = await sb.rpc("save_push_sub", { p_endpoint: j.endpoint, p_p256dh: j.keys.p256dh, p_auth: j.keys.auth });
  if (error) throw error;
}
async function enablePush(){
  if (pushBusy) return; pushBusy = true;
  try {
    // must be called straight from a tap, or iPhone refuses to ask
    const perm = await Notification.requestPermission();
    if (perm !== "granted"){ toast(perm === "denied" ? "Notifications blocked" : "Not turned on"); return; }
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(window.GYM_CONFIG.VAPID_PUBLIC_KEY) });
    await saveSub(sub);
    pushOn = true; toast("Notifications on");
  } catch(e){ showWarn("Couldn't turn on notifications: " + (e.message || e)); }
  finally { pushBusy = false; render(); }
}
async function disablePush(){
  if (pushBusy) return; pushBusy = true;
  try {
    const reg = await navigator.serviceWorker.ready, sub = await reg.pushManager.getSubscription();
    if (sub){ await sb.rpc("remove_push_sub", { p_endpoint: sub.endpoint }); await sub.unsubscribe(); }
    pushOn = false; toast("Notifications off on this device");
  } catch(e){ showWarn("Couldn't turn them off: " + (e.message || e)); }
  finally { pushBusy = false; render(); }
}
// Every launch: if this phone already said yes, re-save its address (it can change, or a friend may
// have logged in on this phone before you). No popups here: only an existing yes counts.
async function syncPush(){
  if (!pushSupported() || Notification.permission !== "granted" || !myId) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(window.GYM_CONFIG.VAPID_PUBLIC_KEY) });
    await saveSub(sub);
    if (!pushOn){ pushOn = true; if (tab === "you" || tab === "today") render(); }
  } catch(e){ /* try again next launch */ }
}
async function saveNotif(patch){
  const before = notif; notif = { ...notif, ...patch };
  const row = {}; for (const [k, v] of Object.entries(patch)) row[{ nudge:"notif_nudge", react:"notif_react", crew:"notif_crew", remind:"notif_remind", at:"remind_at" }[k]] = v;
  const { error } = await sb.from("profiles").update(row).eq("id", myId);
  if (error){ notif = before; showWarn("Couldn't save that: " + error.message); render(); return false; }
  return true;
}
async function sendTestPush(){
  const { data } = await sb.auth.getSession();
  const r = await fetch(PUSH_URL(), { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + (data.session?.access_token || "") },
    body: JSON.stringify({ type: "test" }) });
  const out = await r.json().catch(() => ({}));
  if (out.sent) toast("Sent. Check your notifications");
  else showWarn("Test didn't send: " + (out.error || (out.removed ? "this phone's address expired, turn notifications off and on" : "no device found, try turning them off and on")));
}
const NOTIF_TYPES = [
  ["nudge",  "Nudges", "When a friend nudges you to train"],
  ["react",  "Reactions", "When someone reacts to your session"],
  ["crew",   "Crew activity", "When a friend logs today's session"],
  ["remind", "Gym reminder", "On gym days, if you haven't logged yet"],
];
function notifCard(){
  const st = pushState();
  const head = `<div class="sec"><h2 class="sign">Notifications</h2><span class="label">${st === "on" ? "On" : "Off"}</span></div>`;
  if (BETA) return head.replace(/>(On|Off)</, ">Main app<") + `<div class="card"><p style="margin:0" class="note">During the beta, notifications keep coming from the normal CREW app.</p></div>`;
  if (st === "needs-install") return head + `<div class="card"><p style="margin:0" class="note">On iPhone, notifications only work when CREW is opened from your Home Screen. Add it there, open it from the icon, then come back here.</p></div>`;
  if (st === "unsupported") return head + `<div class="card"><p style="margin:0" class="note">This browser can't show notifications. On iPhone you need iOS 16.4 or newer, with the app on your Home Screen.</p></div>`;
  if (st === "denied") return head + `<div class="card"><p style="margin:0" class="note">Notifications are blocked for this app. ${device.ios
    ? "Open the iPhone <b>Settings</b> app → <b>Notifications</b> → <b>CREW</b> (or <b>Streak</b>) → turn on <b>Allow Notifications</b>, then reopen the app."
    : "Allow them in your browser or phone settings for this site, then reopen the app."}</p></div>`;
  const types = NOTIF_TYPES.map(([k, t, sub]) => `<label class="tg" for="nt-${k}"><span><b>${t}</b><small>${sub}</small></span>
      <input type="checkbox" class="sw" id="nt-${k}" data-nt="${k}" ${notif[k] ? "checked" : ""}></label>`).join("");
  return head + `<div class="card ncard">
    <label class="tg" for="nt-main" style="background:transparent;padding:0"><span><b>Notifications on this ${device.phone ? "phone" : "device"}</b>
      <small>${st === "on" ? "You'll get the ones switched on below." : "Nudges, reactions, crew activity and gym reminders."}</small></span>
      <input type="checkbox" class="sw" id="nt-main" ${st === "on" ? "checked" : ""} ${pushBusy ? "disabled" : ""}></label>
    ${st === "on" ? `<div class="ntypes">${types}</div>
      <div class="ntime ${notif.remind ? "" : "off"}"><span><b>Reminder time</b><small>Only sent if you haven't logged by then</small></span>
        <input type="time" id="nt-at" value="${esc(notif.at)}" step="300" ${notif.remind ? "" : "disabled"}></div>
      <button class="cta ghost" id="nt-test" style="margin-top:12px;font-size:18px">Send me a test</button>` : ""}
  </div>`;
}
function wireNotifCard(){
  const main = $("nt-main"); if (!main) return;
  main.onchange = () => { main.checked ? enablePush() : disablePush(); };
  document.querySelectorAll("[data-nt]").forEach(c => c.onchange = async () => { if (await saveNotif({ [c.dataset.nt]: c.checked })) render(); });
  const at = $("nt-at");
  if (at) at.onchange = async () => { if (/^\d\d:\d\d$/.test(at.value) && await saveNotif({ at: at.value })) toast("Reminder set for " + at.value); };
  const test = $("nt-test");
  if (test) test.onclick = async () => { test.disabled = true; test.textContent = "Sending…"; await sendTestPush(); test.disabled = false; test.textContent = "Send me a test"; };
}

// ================= Circles (WhatsApp-style groups) =================
const CIRCLE_EMOJI = ["","🔥","💪","🏋️","⚡","🦍","🌅","🏆","🐺","🚀","🥊","🧠","🍑"];   // "" = no emoji
const circleLabel = c => ((c.emoji ? c.emoji + " " : "") + c.name).trim();
// the circle's emoji, or (no emoji) the first letter of its name in a rounded badge
const circleBadge = (c, big) => c.emoji ? `<span class="cc-emoji ${big ? "big" : ""}">${esc(c.emoji)}</span>`
  : `<span class="cc-mono ${big ? "big" : ""}">${esc((c.name || "?").trim().charAt(0).toUpperCase())}</span>`;
const circleOf = id => circles.find(c => c.id === id);
const amAdmin = c => !!c && c.members.some(m => m.user_id === myId && m.role === "admin");
const myRow = c => c?.members.find(m => m.user_id === myId);
const circlePeople = c => c.members.map(m => members.get(m.user_id)).filter(Boolean);
const trainedToday = c => circlePeople(c).filter(o => sharesStats(o) && has(o, today())).length;
const inviteLink = c => location.origin + location.pathname.replace(/index\.html$/, "") + "#join=" + c.invite_code;
function circleCard(c, small){
  const ppl = circlePeople(c), n = trainedToday(c);
  return `<button type="button" class="circlecard ${small ? "small" : ""}" data-circle="${esc(c.id)}">
    ${circleBadge(c)}
    <span class="cc-main"><b>${esc(c.name)}</b><small>${n} of ${ppl.length} trained today</small>
      <span class="cc-dots">${ppl.slice(0, 12).map(o => `<i style="${pc(o)}" class="${sharesStats(o) && has(o, today()) ? "on" : ""}"></i>`).join("")}</span></span>
    ${small ? "" : `<i class="chev r"></i>`}</button>`;
}
function viewCirclesTab(seg){
  main().innerHTML = `<div class="view">${seg}
    ${circles.length ? `<div class="circlelist">${circles.map(c => circleCard(c)).join("")}</div>`
      : `<div class="card"><p style="margin:0;font-weight:600">No circles yet.</p><p class="note">Make a circle for your gym group, like a WhatsApp group: add people, see who's trained today and nudge each other.</p></div>`}
    <button class="cta" id="circle-new" style="margin-top:4px">＋ New circle</button>
    <div class="card joincode"><b>Got an invite?</b><span class="note">Paste the link or code.</span>
      <div class="joinrow"><input class="field" id="join-q" placeholder="Invite code" autocomplete="off" autocapitalize="off" spellcheck="false"><button type="button" class="chip" id="join-go">Join</button></div></div></div>`;
  $("join-go").onclick = () => { const m = $("join-q").value.match(/([a-f0-9]{10})/i);
    if (!m) return toast("That code doesn't look right"); pendingJoin = m[1].toLowerCase(); render(); };
  $("circle-new").onclick = () => { circleDraft = { name: "", emoji: "🔥", picked: new Set() }; circleMode = "new"; circleId = null; render(); window.scrollTo(0,0); };
  main().querySelectorAll("[data-crewview]").forEach(b => b.onclick = () => { crewView = b.dataset.crewview; try { localStorage.setItem("gs-crewview", crewView); } catch(e){} render(); });
}
// People picker with search (used to create a circle and to add people). Buds first.
function pickerHtml(exclude){
  const list = everyone().filter(o => !exclude.has(o.id)).sort((a,b) => (isMutual(b) - isMutual(a)) || (b.iBud === "accepted") - (a.iBud === "accepted") || a.name.localeCompare(b.name));
  return `<input class="field findq" id="find-q" type="search" placeholder="Search people" autocomplete="off" autocapitalize="off" spellcheck="false">
    <div class="list peoplelist" id="people">${list.map(o => `<button type="button" class="li pickrow ${circleDraft.picked.has(o.id) ? "on" : ""}" data-pick="${esc(o.id)}" data-name="${esc(tidyName(o.name).toLowerCase())}" style="${pc(o)}">
      <span class="dot"></span><span class="grow"><span class="nm">${esc(o.name)}</span><span class="note">${isMutual(o) ? "🤝 Buds" : o.iBud === "accepted" ? "Spotting" : o.private ? `${LOCK} Private` : ""}</span></span><span class="tick">${CHECK}</span></button>`).join("")}</div>
    <p class="note" id="find-none" hidden style="text-align:center">No one by that name.</p>`;
}
function wirePicker(onChange){
  wireFind();
  main().querySelectorAll("[data-pick]").forEach(b => b.onclick = () => {
    const id = b.dataset.pick; if (circleDraft.picked.has(id)) circleDraft.picked.delete(id); else circleDraft.picked.add(id);
    b.classList.toggle("on", circleDraft.picked.has(id)); onChange(); });
}
function viewCircleRoute(){
  if (circleMode === "new") return viewCircleNew();
  const c = circleOf(circleId);
  if (!c){ circleId = null; circleMode = "view"; return render(); }      // left / removed / deleted
  if (circleMode === "add") return viewCircleAdd(c);
  if (circleMode === "edit") return viewCircleEdit(c);
  return viewCircle(c);
}
const backTo = (label, fn) => { const b = `<button type="button" class="linkbtn pfback" id="c-back">‹ ${label}</button>`; setTimeout(() => { if ($("c-back")) $("c-back").onclick = fn; }); return b; };
function emojiPicker(sel){ return `<div class="emojis">${CIRCLE_EMOJI.map(e => `<button type="button" class="emo ${e === sel ? "on" : ""} ${e ? "" : "none"}" data-emoji="${e}" aria-label="${e || "No emoji"}">${e || "None"}</button>`).join("")}</div>`; }
function viewCircleNew(){
  $("title").textContent = "New circle";
  const d = circleDraft;
  main().innerHTML = `<div class="view">${backTo("Circles", () => { circleMode = "view"; circleDraft = null; render(); })}
    <div class="card ob"><span class="label">Name</span>
      <input class="field" id="c-name" maxlength="30" placeholder="e.g. Uni gym boys" value="${esc(d.name)}" autocapitalize="words">
      <span class="label" style="margin-top:12px">Emoji</span>${emojiPicker(d.emoji)}</div>
    <div class="sec"><h2 class="sign">Add people</h2><span class="label" id="c-count">${d.picked.size} added</span></div>
    ${pickerHtml(new Set())}
    <button class="cta" id="c-create" ${d.name.trim() ? "" : "disabled"}>Create circle</button></div>`;
  const name = $("c-name"), go = $("c-create");
  name.oninput = () => { d.name = name.value; go.disabled = !d.name.trim(); };
  main().querySelectorAll("[data-emoji]").forEach(b => b.onclick = () => { d.emoji = b.dataset.emoji; main().querySelectorAll("[data-emoji]").forEach(x => x.classList.toggle("on", x === b)); });
  wirePicker(() => { $("c-count").textContent = `${d.picked.size} added`; });
  go.onclick = async () => {
    go.disabled = true; go.textContent = "Creating…";
    const { data, error } = await sb.rpc("create_circle", { p_name: d.name.trim(), p_emoji: d.emoji, p_members: [...d.picked] });
    if (error){ go.disabled = false; go.textContent = "Create circle"; return showWarn("Couldn't create the circle: " + error.message); }
    circleDraft = null; circleMode = "view"; circleId = data; toast(`${circleLabel({ emoji: d.emoji, name: d.name })} created`);
    await loadAll(); window.scrollTo(0,0);
  };
}
function viewCircleAdd(c){
  $("title").textContent = "Add people";
  circleDraft = circleDraft || { picked: new Set() };
  main().innerHTML = `<div class="view">${backTo(c.name, () => { circleMode = "view"; circleDraft = null; render(); })}
    <p class="note" style="margin:0">They'll be added straight in, like a WhatsApp group. They can leave any time.</p>
    ${pickerHtml(new Set(c.members.map(m => m.user_id)))}
    <button class="cta" id="c-add" disabled>Add</button></div>`;
  const go = $("c-add");
  wirePicker(() => { go.disabled = !circleDraft.picked.size; go.textContent = circleDraft.picked.size ? `Add ${circleDraft.picked.size}` : "Add"; });
  go.onclick = async () => {
    go.disabled = true;
    const { error } = await sb.rpc("add_to_circle", { p_circle: c.id, p_members: [...circleDraft.picked] });
    if (error){ go.disabled = false; return showWarn("Couldn't add: " + error.message); }
    toast(`Added ${circleDraft.picked.size} to ${c.name}`); circleDraft = null; circleMode = "view"; await loadAll();
  };
}
function viewCircleEdit(c){
  $("title").textContent = "Edit circle";
  const d = circleDraft = circleDraft || { name: c.name, emoji: c.emoji };
  main().innerHTML = `<div class="view">${backTo(c.name, () => { circleMode = "view"; circleDraft = null; render(); })}
    <div class="card ob"><span class="label">Name</span>
      <input class="field" id="c-name" maxlength="30" value="${esc(d.name)}" autocapitalize="words">
      <span class="label" style="margin-top:12px">Emoji</span>${emojiPicker(d.emoji)}
      <button class="cta" id="c-save" style="margin-top:12px">Save</button></div>
    <div class="card"><b>Invite link</b><p class="note">Resetting makes the old link stop working.</p>
      <button class="cta ghost" id="c-reset" style="font-size:18px">Reset invite link</button></div></div>`;
  const name = $("c-name");
  name.oninput = () => { d.name = name.value; $("c-save").disabled = !d.name.trim(); };
  main().querySelectorAll("[data-emoji]").forEach(b => b.onclick = () => { d.emoji = b.dataset.emoji; main().querySelectorAll("[data-emoji]").forEach(x => x.classList.toggle("on", x === b)); });
  $("c-save").onclick = async () => {
    const { error } = await sb.rpc("edit_circle", { p_circle: c.id, p_name: d.name.trim(), p_emoji: d.emoji });
    if (error) return showWarn("Couldn't save: " + error.message);
    toast("Saved"); circleDraft = null; circleMode = "view"; await loadAll(); };
  $("c-reset").onclick = async () => {
    const { error } = await sb.rpc("reset_invite", { p_circle: c.id });
    if (error) return showWarn("Couldn't reset: " + error.message);
    toast("New invite link made"); await loadAll(); };
}
let circleAsk = null;   // "leave" or a user id to remove, waiting for "are you sure?"
function viewCircle(c){
  $("title").textContent = "Circle";
  const t = today(), admin = amAdmin(c), mine = myRow(c);
  const ppl = circlePeople(c), list = ppl.filter(sharesStats);
  const todayRows = ppl.map(o => {
    const st = !sharesStats(o) ? "rest" : isGym(o,t) ? (has(o,t) ? "done" : "todo") : (ticked(o,t) ? "done" : "rest");
    const act = st === "todo" ? nudgeCtl(o, "data-pnudge") : "";
    return `<div class="li crewrow tappable" data-profile="${esc(o.id)}" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}${o.id===myId?'<span class="youtag">YOU</span>':""}</span>
      <span class="note">${sharesStats(o) ? `${isGym(o,t) ? workLabel(slot(o,t)) : "Rest day"} · ${dayStreak(o)} day streak` : "Hasn't logged yet"}</span>${act ? `<span class="rowact">${act}</span>` : ""}</div>
      <span class="status ${st}">${st==="done"?"Done":st==="todo"?"Not yet":"Rest"}</span></div>`; }).join("");
  const ask = circleAsk === "leave" ? `<div class="card banner"><div class="grow"><b>Leave ${esc(c.name)}?</b><span class="note">${admin && c.members.filter(m => m.role === "admin").length === 1 && c.members.length > 1 ? "You're the only admin, so the longest-standing member becomes admin." : "You can rejoin with the invite link."}</span>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" id="c-leave-yes">Leave</button><button type="button" class="linkbtn" id="c-ask-no">Stay</button></span></div></div>`
    : circleAsk ? `<div class="card banner"><div class="grow"><b>Remove ${esc(nameOf(circleAsk))}?</b>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" id="c-remove-yes">Remove</button><button type="button" class="linkbtn" id="c-ask-no">Cancel</button></span></div></div>` : "";
  const memberRows = c.members.map(m => { const o = members.get(m.user_id); if (!o) return "";
    const isMe = m.user_id === myId;
    const tools = admin && !isMe ? `<span class="mtools"><button type="button" class="linkbtn" data-role="${esc(m.user_id)}" data-to="${m.role === "admin" ? "member" : "admin"}">${m.role === "admin" ? "Remove admin" : "Make admin"}</button>
      <button type="button" class="linkbtn danger" data-remove="${esc(m.user_id)}">Remove</button></span>` : "";
    return `<div class="li tappable" data-profile="${esc(o.id)}" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}${isMe ? '<span class="youtag">YOU</span>' : ""}${m.role === "admin" ? '<span class="admintag">Admin</span>' : ""}</span>${tools}</div></div>`; }).join("");
  const top = `${backTo("Circles", () => { circleId = null; circleAsk = null; crewView = "circles"; render(); })}${ask}
    <div class="card hero circlehero">${circleBadge(c, true)}<div class="work sign">${esc(c.name)}</div>
      <p class="sub">${c.members.length} member${c.members.length===1?"":"s"} · ${trainedToday(c)} trained today</p>
      <div class="pfacts"><button type="button" class="chip" id="c-invite">🔗 Invite</button>
        <button type="button" class="chip" id="c-mute">${mine?.muted ? "🔕 Muted" : "🔔 Notifications on"}</button>
        ${admin ? `<button type="button" class="chip" id="c-edit">⚙️ Edit</button>` : ""}</div></div>
    <div class="sec"><h2 class="sign">Today</h2><span class="label">${trainedToday(c)}/${ppl.length} done</span></div><div class="list">${todayRows}</div>`;
  const bottom = `<div class="sec"><h2 class="sign">Members</h2><span class="label">${c.members.length}</span></div>
    <div class="list">${memberRows}</div>
    ${admin ? `<button class="cta ghost" id="c-addppl" style="font-size:18px">＋ Add people</button>` : ""}
    <button class="cta ghost danger" id="c-leave" style="font-size:18px">Leave circle</button>`;
  crewBoard(list, [], top, { title: "Leaderboard", weekBoard: list.length > 1, bottom });
  $("title").textContent = "Circle";
  $("c-invite").onclick = async () => {
    const url = inviteLink(c), text = `Join my circle ${circleLabel(c)} on CREW! In the app: Crew → Circles → Join with code: ${c.invite_code}`;
    try { if (navigator.share){ await navigator.share({ title: "CREW", text, url }); return; } } catch(e){ if (e.name === "AbortError") return; }
    try { await navigator.clipboard.writeText(url); toast("Invite link copied"); } catch(e){ toast("Copy failed"); } };
  $("c-mute").onclick = async () => {
    const to = !mine?.muted; if (mine) mine.muted = to; render();
    const { error } = await sb.rpc("mute_circle", { p_circle: c.id, p_muted: to });
    if (error){ if (mine) mine.muted = !to; render(); return showWarn("Couldn't change that: " + error.message); }
    toast(to ? "Circle muted" : "Circle notifications on"); };
  if ($("c-edit")) $("c-edit").onclick = () => { circleDraft = null; circleMode = "edit"; render(); window.scrollTo(0,0); };
  if ($("c-addppl")) $("c-addppl").onclick = () => { circleDraft = { picked: new Set() }; circleMode = "add"; render(); window.scrollTo(0,0); };
  $("c-leave").onclick = () => { circleAsk = "leave"; render(); window.scrollTo(0,0); };
  if ($("c-ask-no")) $("c-ask-no").onclick = () => { circleAsk = null; render(); };
  if ($("c-leave-yes")) $("c-leave-yes").onclick = async () => {
    const { error } = await sb.rpc("leave_circle", { p_circle: c.id });
    if (error) return showWarn("Couldn't leave: " + error.message);
    toast(`Left ${c.name}`); circleAsk = null; circleId = null; crewView = "circles"; await loadAll(); };
  if ($("c-remove-yes")) $("c-remove-yes").onclick = async () => {
    const who = circleAsk; const { error } = await sb.rpc("remove_from_circle", { p_circle: c.id, p_user: who });
    if (error) return showWarn("Couldn't remove: " + error.message);
    toast(`Removed ${nameOf(who)}`); circleAsk = null; await loadAll(); };
  main().querySelectorAll("[data-remove]").forEach(b => b.onclick = e => { e.stopPropagation(); circleAsk = b.dataset.remove; render(); window.scrollTo(0,0); });
  main().querySelectorAll("[data-role]").forEach(b => b.onclick = async e => {
    e.stopPropagation(); const { error } = await sb.rpc("set_circle_role", { p_circle: c.id, p_user: b.dataset.role, p_role: b.dataset.to });
    if (error) return showWarn(error.message.includes("at least one admin") ? "A circle needs at least one admin." : "Couldn't change that: " + error.message);
    toast(b.dataset.to === "admin" ? `${nameOf(b.dataset.role)} is now an admin` : `${nameOf(b.dataset.role)} is no longer an admin`); await loadAll(); });
}
// Opening an invite link: "Join 🔥 Uni gym boys? 6 members"
async function checkJoinLink(){
  const m = location.hash.match(/join=([a-f0-9]{6,20})/i); if (!m) return;
  pendingJoin = m[1];
  try { history.replaceState(null, "", location.pathname + location.search); } catch(e){}
}
function viewJoinCircle(){
  $("title").textContent = "Join circle";
  if (!joinPreview){
    main().innerHTML = `<div class="skel">Opening invite…</div>`;
    const code = pendingJoin; pendingJoin = null;
    sb.rpc("circle_preview", { p_code: code }).then(({ data }) => {
      joinPreview = data && data[0] ? { ...data[0], code } : { bad: true };
      if (joinPreview.already){ circleId = joinPreview.id; joinPreview = null; crewView = "circles"; tab = "crew"; }
      render(); });
    return;
  }
  const j = joinPreview;
  if (j.bad){ main().innerHTML = `<div class="view"><div class="card"><b>This invite link doesn't work any more.</b><p class="note">Ask for a new link.</p>
      <button class="cta ghost" id="j-ok" style="margin-top:10px;font-size:18px">OK</button></div></div>`;
    $("j-ok").onclick = () => { joinPreview = null; render(); }; return; }
  main().innerHTML = `<div class="view"><div class="card hero circlehero"><span class="label">You're invited</span>${circleBadge(j, true)}
      <div class="work sign">${esc(j.name)}</div><p class="sub">${j.members} member${j.members===1?"":"s"}</p>
      <p class="note">Members see each other's streak, week and split, and can nudge each other once a day.</p>
      <div class="row2" style="margin-top:12px"><button class="cta ghost" id="j-no" style="font-size:18px">Not now</button><button class="cta" id="j-yes" style="font-size:18px">Join</button></div></div></div>`;
  $("j-no").onclick = () => { joinPreview = null; render(); };
  $("j-yes").onclick = async () => {
    $("j-yes").disabled = true;
    const { data, error } = await sb.rpc("join_circle", { p_code: j.code });
    if (error){ $("j-yes").disabled = false; return showWarn("Couldn't join: " + error.message); }
    joinPreview = null; circleId = data; tab = "crew"; crewView = "circles"; toast(`Joined ${circleLabel(j)}`); await loadAll(); window.scrollTo(0,0); };
}
checkJoinLink();
window.addEventListener("hashchange", () => { checkJoinLink(); if (pendingJoin) render(); });   // link opened while the app is already open
document.addEventListener("click", e => {          // open a circle from any card
  const c = e.target.closest("[data-circle]"); if (!c || !c.closest("#main")) return;
  circleId = c.dataset.circle; circleMode = "view"; circleAsk = null; if (tab !== "crew"){ tab = "crew"; crewView = "circles"; } render(); window.scrollTo(0,0);
});

// ================= Buds: actions =================
function budBtn(o){
  if (!o || o.id === myId) return "";
  if (o.iBud === "accepted") return `<button type="button" class="chip budbtn on" data-unbud="${esc(o.id)}">${isMutual(o) ? "Buds ✓" : "Spotting ✓"}</button>`;
  if (o.iBud === "pending")  return `<button type="button" class="chip budbtn" data-unbud="${esc(o.id)}">Requested</button>`;
  return `<button type="button" class="chip budbtn go" data-bud="${esc(o.id)}">${o.theyBud === "accepted" ? "Bud back" : "Bud"}</button>`;
}
async function budUp(id){
  const o = members.get(id); if (!o) return;
  o.iBud = o.private ? "pending" : "accepted"; render();
  const { error } = await sb.from("buds").insert({ follower: myId, followee: id });
  if (error && error.code !== "23505"){ o.iBud = null; render(); return showWarn("Couldn't bud: " + error.message); }
  toast(o.private ? `Bud request sent to ${o.name}` : o.theyBud === "accepted" ? `You and ${o.name} are Buds 🤝` : `You're spotting ${o.name}`);
  loadAll();
}
async function unBud(id, confirmed){
  const o = members.get(id); if (!o) return;
  if (!confirmed && o.iBud === "accepted"){ unbudAsk = id; render(); return; }      // ask once before unbudding
  unbudAsk = null; const was = o.iBud; o.iBud = null; render();
  const { error } = await sb.from("buds").delete().eq("follower", myId).eq("followee", id);
  if (error){ o.iBud = was; render(); return showWarn("Couldn't undo: " + error.message); }
  toast(was === "pending" ? "Request cancelled" : `Stopped spotting ${o.name}`); loadAll();
}
let unbudAsk = null;
async function answerRequest(id, accept){
  const o = members.get(id); if (o) o.theyBud = accept ? "accepted" : null; render();
  const { error } = accept ? await sb.rpc("accept_bud", { p_follower: id })
                           : await sb.from("buds").delete().eq("follower", id).eq("followee", myId);
  if (error) return showWarn("Couldn't save that: " + error.message);
  const r = members.get(id);
  toast(!accept ? "Request declined" : r && r.iBud === "accepted" ? `You and ${nameOf(id)} are Buds 🤝` : `${nameOf(id)} is now spotting you`); loadAll();
}
async function removeFollower(id){
  const { error } = await sb.from("buds").delete().eq("follower", id).eq("followee", myId);
  if (error) return showWarn("Couldn't remove: " + error.message);
  toast(`Removed ${nameOf(id)}`); loadAll();
}
function openProfile(id){ if (!members.has(id)) return; profileId = id; unbudAsk = null; render(); window.scrollTo(0,0); }
function goFind(){ profileId = null; crewView = "everyone"; try { localStorage.setItem("gs-crewview", crewView); } catch(e){} setTab("crew"); }   // no auto-keyboard: tapping the search box is enough
// One click handler for the whole app: profiles, bud buttons, requests (works on every screen)
document.addEventListener("click", e => {
  const t = e.target.closest("[data-bud],[data-unbud],[data-accept],[data-decline],[data-unfollow],[data-pnudge],[data-goto-find],[data-goto-buds],[data-list],[data-profile],[data-unbud-yes],[data-unbud-no]");
  if (!t || !t.closest("#main, #wn")) return;
  if (t.hasAttribute("data-profile") && (wnActive || e.target.closest("button, input, label, a"))) return;   // a button inside a row does its own thing
  e.stopPropagation();
  if (t.dataset.bud) budUp(t.dataset.bud);
  else if (t.dataset.unbud) unBud(t.dataset.unbud);
  else if (t.dataset.unbudYes) unBud(t.dataset.unbudYes, true);
  else if (t.hasAttribute("data-unbud-no")){ unbudAsk = null; render(); }
  else if (t.dataset.accept) answerRequest(t.dataset.accept, true);
  else if (t.dataset.decline) answerRequest(t.dataset.decline, false);
  else if (t.dataset.unfollow) removeFollower(t.dataset.unfollow);
  else if (t.dataset.pnudge){ t.disabled = true; sendNudge(t.dataset.pnudge); }
  else if (t.hasAttribute("data-goto-find")) goFind();
  else if (t.hasAttribute("data-goto-buds")){ crewView = "buds"; setTab("crew"); }
  else if (t.dataset.list){ youView = "list:" + t.dataset.list; render(); window.scrollTo(0,0); }
  else if (t.dataset.profile) openProfile(t.dataset.profile);
});

// ================= Profile =================
// inYou = the You tab (your own profile, with Edit profile + Settings); otherwise someone you tapped
function viewProfile(inYou){
  const o = members.get(inYou ? myId : profileId); if (!o){ profileId = null; return render(); }
  const self = o.id === myId, t = today(), ws = startOfWeek(t);
  $("title").textContent = inYou ? "You" : self ? "Your profile" : "Profile";
  const back = inYou ? "" : `<button type="button" class="linkbtn pfback" id="pf-back">‹ Back</button>`;
  const badge = o.private ? `${LOCK} Private` : "Public";
  if (!o.visible || !sharesStats(o)){
    main().innerHTML = `<div class="view">${back}<div class="card hero" style="${pc(o)}"><span class="label">${badge} · ${plateName(o.plate)} plate</span>
      <div class="work sign">${esc(o.name)}</div>
      ${countsRow(o, false)}
      <p class="sub">${o.private ? "This account is private. Send a bud request to see their week and streak." : "Hasn't logged anything yet."}</p>
      <div class="pfacts">${budBtn(o)}</div></div></div>`;
    $("pf-back").onclick = () => { profileId = null; render(); }; return;
  }
  const boxes = Array.from({length:7},(_,k)=>{ const d = addDays(ws,k);
    const c = has(o,d) ? "d" : frozen(o,d) ? "f" : isGym(o,d) ? (d<t ? "m" : "g") : "";
    return `<span class="pfday"><i class="${c}"></i><b>${DAYS[k][0]}</b></span>`; }).join("");
  const w = weekStats(o, ws);
  const nudge = !self && isGym(o,t) && !has(o,t) ? nudgeCtl(o, "data-pnudge") : "";
  const req = o.theyBud === "pending" ? `<div class="card banner"><span class="big-emoji">🤝</span><div class="grow"><b>${esc(o.name)} wants to be your bud</b>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" data-accept="${esc(o.id)}">Accept</button><button type="button" class="linkbtn" data-decline="${esc(o.id)}">Decline</button></span></div></div>` : "";
  const ask = unbudAsk === o.id ? `<div class="card banner"><div class="grow"><b>${isMutual(o) ? "Unbud" : "Stop spotting"} ${esc(o.name)}?</b><span class="note">${o.private ? "You'll need to send a bud request again to see their profile." : "You can bud them again any time."}</span>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" data-unbud-yes="${esc(o.id)}">${isMutual(o) ? "Unbud" : "Stop spotting"}</button><button type="button" class="linkbtn" data-unbud-no>Keep</button></span></div></div>` : "";
  const split = o.plan ? o.plan.map((s,i)=>`<div class="li"><b class="sign" style="font-size:20px;width:44px">${DAYS[i]}</b><span class="grow">${s ? (s.w ? esc(s.w) : '<span class="note">Gym day</span>') : '<span class="note">Rest</span>'}</span>${s?.opt?'<span class="label">Optional</span>':""}</div>`).join("") : "";
  // Your own profile (You tab): requests, bud counts, Edit profile + Settings
  const mine = inYou ? `${requestsIn().map(r => `<div class="card banner"><span class="big-emoji">🤝</span><div class="grow"><b>${esc(r.name)} wants to be your bud</b>
      <span style="display:flex;gap:8px;margin-top:8px"><button type="button" class="chip" data-accept="${esc(r.id)}">Accept</button><button type="button" class="linkbtn" data-decline="${esc(r.id)}">Decline</button></span></div></div>`).join("")}` : "";
  const youBar = inYou ? `<div class="row2"><button class="cta ghost" id="you-edit" style="font-size:18px">Edit profile</button><button class="cta ghost" id="you-settings" style="font-size:18px">⚙️ Settings</button></div>` : "";
  main().innerHTML = `<div class="view">${back}${mine}${req}${ask}
    <div class="card hero" style="${pc(o)}"><span class="label">${badge} · ${plateName(o.plate)} plate${self && !inYou ? " · how others see you" : ""}</span>
      <div class="work sign">${esc(o.name)}</div>
      ${!self && relation(o) ? `<span class="reltag">${({buds:"🤝 Buds", spotting:"You're spotting them", spotter:"Spots you", requested:"Request sent"})[relation(o)]}</span>` : ""}
      ${countsRow(o, inYou)}
      <div class="pfweek">${boxes}</div>
      <p class="sub">This week: ${w.hit} of ${w.target} gym days${w.bonus ? ` · +${w.bonus} bonus` : ""}</p>
      ${self ? "" : `<div class="pfacts">${budBtn(o)}${nudge}</div>`}
      ${!self && o.theyBud === "accepted" && me()?.private ? `<button type="button" class="linkbtn" data-unfollow="${esc(o.id)}" style="padding-left:0">Remove as spotter</button>` : ""}</div>
    <div class="card statstrip" style="${pc(o)}">
      <div class="accent"><b class="sign">${dayStreak(o)}</b><span class="label">Day streak</span></div>
      <div><b class="sign">${weekNo(o)}</b><span class="label">Week</span></div>
      <div><b class="sign">${bestStreak(o)}</b><span class="label">Best run</span></div></div>
    ${youBar}
    <button class="cta ghost" id="pf-trophies" style="font-size:18px">See trophies</button>
    <div class="sec"><h2 class="sign">Split</h2>${o.splitHidden && !self ? '<span class="label">Hidden</span>' : ""}</div>
    ${o.splitHidden && !self ? `<div class="card"><p class="note" style="margin:0">${esc(o.name)} keeps their split private.</p></div>` : `<div class="list">${split}</div>`}</div>`;
  if ($("pf-back")) $("pf-back").onclick = () => { profileId = null; render(); };
  $("pf-trophies").onclick = () => { trophyFor = o.id; profileId = null; setTab("trophies"); };
  if (inYou){ $("you-edit").onclick = () => { youView = "edit"; render(); window.scrollTo(0,0); };
              $("you-settings").onclick = () => { youView = "settings"; render(); window.scrollTo(0,0); }; }
}

// Buds · Spotting · Spotters, like Instagram's followers/following. On your own profile they open the lists.
function countsRow(o, mine){
  const self = o.id === myId, c = self ? counts() : { buds: o.nBuds, spotting: o.nSpotting, spotters: o.nSpotters };
  const cell = (k, label) => mine ? `<button type="button" data-list="${k}"><b>${c[k]}</b><span>${label}</span></button>`
                                  : `<span><b>${c[k]}</b><span>${label}</span></span>`;
  return `<div class="pfcounts">${cell("buds","Buds")}${cell("spotting","Spotting")}${cell("spotters","Spotters")}</div>`;
}
const LISTS = { buds: ["Buds", "You bud each other.", o => isMutual(o)],
                spotting: ["Spotting", "Everyone you bud. 🤝 = they bud you back.", o => o.iBud === "accepted"],
                spotters: ["Spotters", "Everyone who buds you. Bud them back to become Buds.", o => o.theyBud === "accepted"] };
function viewPeopleList(kind){
  const [title, sub, rel] = LISTS[kind];
  $("title").textContent = title;
  const list = everyone().filter(rel);
  main().innerHTML = `<div class="view"><button type="button" class="linkbtn pfback" id="you-back">‹ Profile</button>
    <p class="note" style="margin:0">${sub}</p>
    ${list.length ? `<div class="list peoplelist">${list.map(personRow).join("")}</div>`
      : `<div class="card"><p class="note" style="margin:0">No one here yet.</p><button class="cta ghost" data-goto-find style="margin-top:10px;font-size:18px">Find people</button></div>`}</div>`;
  $("you-back").onclick = () => { youView = "profile"; render(); window.scrollTo(0,0); };
}

// ================= What's new (shown once to existing members) =================
function viewWhatsNew(){
  const m = me(); $("title").textContent = "What's new";
  wnPv = wnPv || pvFrom(m);
  const dots = `<div class="steps">${[1,2,3,4].map(i => `<i class="${i<=wnStep?"on":""}"></i>`).join("")}</div>`;
  let body = "";
  if (wnStep === 1) body = `<div class="wnhero"><span class="wnemoji">🎉</span><span class="rec">New</span><h2 class="sign">Big update</h2>
      <p class="note">CREW just got more personal. Your crew, your way.</p></div>
      <button class="cta" id="wn-next">See what's new</button>`;
  if (wnStep === 2) body = `<span class="label">What's new</span><h2 class="sign">Three things</h2>
      <div class="wnlist">
        <div><span>👤</span><p><b>Profiles</b><small>Tap anyone to see their week, streak and trophies.</small></p></div>
        <div><span>🤝</span><p><b>Buds</b><small>Tap Bud on your gym mates. Bud each other and you're Buds. One way, you're spotting them. Today shows just your crew.</small></p></div>
        <div><span>🔍</span><p><b>Find people</b><small>Search the crew and bud them in one tap.</small></p></div>
      </div><button class="cta" id="wn-next">Next</button>`;
  if (wnStep === 3) body = `<span class="label">Your account</span><h2 class="sign">Public or private?</h2>
      <p class="note">We've picked the one that matches your old settings. Change it any time in You.</p>${privacyPicker(wnPv)}
      <button class="cta" id="wn-next">Continue</button>`;
  if (wnStep === 4) body = `<span class="label">Last step</span><h2 class="sign">Find your buds</h2>
      <p class="note">Bud the people you train with. You can always do this later in Crew.</p>
      <input class="field findq" id="find-q" type="search" placeholder="Search people" value="${esc(findQ)}" autocomplete="off" autocapitalize="off" spellcheck="false">
      <div class="list peoplelist" id="people">${everyone().map(personRow).join("")}</div>
      <p class="note" id="find-none" hidden style="text-align:center">No one by that name.</p>
      <button class="cta" id="wn-next">Done</button>`;
  main().innerHTML = `<div class="view" id="wn"><div class="card ob">${dots}${body}</div></div>`;
  if (wnStep === 3) wirePrivacy(wnPv, render);
  if (wnStep === 4) wireFind();
  $("wn-next").onclick = async () => {
    if (wnStep === 3){ $("wn-next").disabled = true; if (!await savePrivacy(wnPv, { seen_update: 1 })){ $("wn-next").disabled = false; return; } }
    if (wnStep === 4){ wnActive = false; wnDone = true; tab = "today"; render(); window.scrollTo(0,0); return; }
    wnStep++; render(); window.scrollTo(0,0);
  };
}

// ================= Shell =================
const TITLES = {today:"Today",crew:"Crew",trophies:"Trophies",you:"You"};
// iPhone Home Screen apps: if a text box still has the keyboard up when the screen is redrawn, iOS drops the keyboard
// but leaves the page pushed up, so the bottom bar floats mid-screen. Close the keyboard first, then nudge iOS back.
function settleKeyboard(){ const ae = document.activeElement; if (ae && ae.matches && ae.matches("input, textarea") && $("main").contains(ae)) ae.blur(); }
document.addEventListener("focusout", e => { if (e.target.matches && e.target.matches("input, textarea"))
  setTimeout(() => { if (!document.activeElement || !document.activeElement.matches("input, textarea")) window.scrollTo(window.scrollX, window.scrollY); }, 120); });
if (window.visualViewport) visualViewport.addEventListener("resize", () => {   // keyboard closed → snap fixed bars back
  if (visualViewport.height > window.innerHeight * 0.85 && !(document.activeElement || {}).matches?.("input, textarea")) window.scrollTo(window.scrollX, window.scrollY); });
function render(){
  settleKeyboard();
  $("date").textContent = today().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"});
  const m = me();
  $("mebadge").innerHTML = m ? `<span class="dot" style="${pc(m)}"></span>${esc(m.name)}` : "";
  const signedIn = !!session;
  const gate = !!sb && authMode !== "newpass" && needsInstall();
  if (ready && session && !ob && !locked && !wnDone && me() && (me().seenUpdate || 0) < 1) wnActive = true;
  $("tabbar").hidden = !signedIn || !!ob || gate || !authKnown || locked || wnActive;
  for (const k of Object.keys(TITLES)) $("t-"+k).setAttribute("aria-selected", k===tab && !ob);
  renderOnline();
  if (!sb) return viewSetup();
  if (authMode==="newpass") return viewAuth();
  if (gate) return viewInstall();            // phones in a browser: get it on the Home Screen first
  // Wait until we KNOW whether you're logged in. Renewing your login can take a few seconds on
  // gym signal; showing the sign-in form during that made it look like you'd been logged out.
  if (!authKnown){ $("title").textContent = TITLES[tab]; main().innerHTML = `<div class="splash"><img class="iapp" src="${ICON}" alt="" width="72" height="72"><span class="label">Loading…</span></div>`; return; }
  if (!signedIn) return viewAuth();
  if (locked) return viewLock();
  if (!ready){ $("title").textContent = TITLES[tab]; main().innerHTML = `<div class="skel">Loading the crew…</div>`; return; }
  if (ob){ $("title").textContent = ob.edit ? "Edit" : "Set up"; viewOnboarding(); return; }
  if (wnActive) return viewWhatsNew();
  if (profileId) return viewProfile();
  if (joinPreview || (pendingJoin && me())) return viewJoinCircle();
  if (circleId || circleMode === "new") return viewCircleRoute();
  $("title").textContent = TITLES[tab];
  ({today:viewToday,crew:viewCrew,trophies:viewTrophies,you:viewYou})[tab]();
  maybeShowPushSheet();
}
function setTab(t){ if (t !== tab || t === "you") youView = "profile"; tab=t; ob=null; profileId=null; circleId=null; circleMode="view"; try{localStorage.setItem("gs-tab",t);}catch(e){} render(); window.scrollTo(0,0); }
for (const k of Object.keys(TITLES)) $("t-"+k).onclick = () => setTab(k);

let sb = null, session = null, authKnown = false;
(function boot(){
  const cfg = window.GYM_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase){ render(); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });   // keep the default storage key: changing it would log everyone out
  // Ask the phone to treat our saved data (including your login) as important, so it isn't cleared to save space
  try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch(_) {}
  // Safety net: if the login check somehow never answers, stop waiting after 8 s
  setTimeout(() => { if (!authKnown){ authKnown = true; render(); } }, 8000);
  db = sb;
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") authMode = "newpass";
    const was = session?.user?.id;
    session = s; myId = s?.user?.id || null;
    if (event === "INITIAL_SESSION" && myId && lockInfo()) locked = true;   // Face ID lock on app open
    if (event === "SIGNED_OUT") locked = false;
    authKnown = true;
    if (myId && myId !== was){ ready = false; loadAll(); subscribe(); }
    if (!myId){ members = new Map(); ready = false; memberCount = 0; renderOnline(); }
    render();
  });
  render();
})();

// ================= Auto-update =================
// Home-screen apps keep running the copy they loaded. Each time the app opens or comes back
// to the front, compare our version with the live one and reload if there's a newer one.
const APP_VERSION = "b11";   // bump together with version.json on every release
async function checkForUpdate(){
  try {
    const r = await fetch("version.json", { cache: "no-store" });
    const { v } = await r.json();
    if (v && v !== APP_VERSION && !sessionStorage.getItem("gs-reloaded-" + v)){
      sessionStorage.setItem("gs-reloaded-" + v, "1");   // never loop if something's off
      location.reload();
    }
  } catch(e){ /* offline: keep running the current version */ }
}
checkForUpdate();
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("controllerchange", () => checkForUpdate());

// Phones pause apps in the background: refresh when it comes back, and roll over at midnight.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible"){ sheetShown = false; checkForUpdate(); if (session) loadAll(); } });
let lastDay = key(today());
setInterval(() => { if (key(today()) !== lastDay){ lastDay = key(today()); render(); }
  else if (document.querySelector("[data-wait]") && !document.activeElement?.matches("input")) render(); }, 30000);   // tick the "Nudged · 7m" countdown

// Offline app shell (makes it installable and load instantly)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
