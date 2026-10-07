// Gym Streak — the whole app. Screens are drawn from the `members` data; Supabase stores it.
"use strict";
// ================= Config =================
const PLATES = [
  {id:"red",kg:25},{id:"blue",kg:20},{id:"yellow",kg:15},{id:"green",kg:10},{id:"white",kg:5}
];
const MILESTONES = [
  {n:1,name:"Empty Bar"},{n:2,name:"Warm-Up Set"},{n:4,name:"Iron Month"},{n:6,name:"Six Pack"},
  {n:8,name:"Two Plates"},{n:12,name:"Quarter Grind"},{n:16,name:"Locked In"},{n:26,name:"Half Year"},{n:52,name:"Year of Iron"}
];
// PRESETS, QUICK and normalizeWorkout() come from split.js
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
const pc = m => `--c:var(--p-${PLATES.some(p=>p.id===m.plate)?m.plate:"white"})`;

function dayStreak(m){
  const t = today(), floor = parse(m.since);
  let n = isGym(m,t) && has(m,t) ? 1 : 0;
  for (let d = addDays(t,-1); d >= floor; d = addDays(d,-1)){
    if (!isGym(m,d)) continue; if (has(m,d)) n++; else break;
  }
  return n;
}
function bestStreak(m){
  let run=0,best=0; const t = today();
  for (let d = parse(m.since); d <= t; d = addDays(d,1)){
    if (!isGym(m,d)) continue;
    if (has(m,d)){ run++; best=Math.max(best,run); } else if (d < t) run = 0;
  }
  return best;
}
function weekStats(m,start){
  let target=0,hit=0,bonus=0,missed=0; const t = today();
  for (let i=0;i<7;i++){ const d = addDays(start,i);
    if (isGym(m,d)){ target++; if (has(m,d)) hit++; else if (d<t) missed++; }
    else if (ticked(m,d)) bonus++; }
  return {target,hit,bonus,missed,over:addDays(start,6)<t,left:Math.max(0,target-hit)};
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
let tab = "today", weekOffset = 0, trophyFor = null, ob = null; // ob = onboarding draft
try { tab = localStorage.getItem("gs-tab") || "today"; } catch(e){}
const me = () => myId ? members.get(myId) : null;
const roster = () => [...members.entries()].map(([id,m])=>({id,...m})).filter(m=>m.name && m.plan)
  .sort((a,b)=> (a.id===myId?-1:b.id===myId?1:0) || String(a.joined||"").localeCompare(String(b.joined||"")));
// Can I see this person's attendance, streaks and trophies? (Always yes for yourself.)
const sharesStats = m => !!m && (m.id === myId || (m.isPublic && m.shareAtt && !!m.since));
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

function barbell(m, w){
  const n = Math.max(1, Math.min(8, w.target)), left = Math.ceil(n/2), right = Math.floor(n/2);
  const H = [64,58,52,46]; let svg = "";
  const plate = (x, i, k) => {
    const h = H[Math.min(i,3)], y = 44 - h/2, filled = k < w.hit;
    return filled ? `<rect class="plate" x="${x}" y="${y}" width="13" height="${h}" rx="3"/><rect class="rim" x="${x+1}" y="${y+1}" width="11" height="${h-2}" rx="2.5"/>`
                  : `<rect class="slot" x="${x}" y="${y}" width="13" height="${h}" rx="3"/>`;
  };
  // fill order: L0, R0, L1, R1 ...
  for (let i=0;i<left;i++) svg += plate(98 - i*16, i, i*2);
  for (let i=0;i<right;i++) svg += plate(209 + i*16, i, i*2+1);
  let knurl = ""; for (let x=128;x<=192;x+=4) knurl += `<line class="knurl" x1="${x}" y1="41" x2="${x+3}" y2="47" stroke-width="1"/>`;
  return `<svg class="barbell" viewBox="0 0 320 88" role="img" aria-label="${w.hit} of ${w.target} plates loaded this week">
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
  hero += `</div>`;
  const tiles = `<div class="tiles" style="${pc(m)}">
    <div class="tile accent"><b class="sign mono-n">${dayStreak(m)}</b><span class="label">Day streak</span></div>
    <div class="tile"><b class="sign">${weekNo(m)}</b><span class="label">Week</span></div>
    <div class="tile"><b class="sign">${bestStreak(m)}</b><span class="label">Best run</span></div></div>`;
  const q = `<div class="card quote"><span class="bolt">${BOLT}</span><div class="q">${qa}<small>${qb}</small></div></div>`;
  const crew = roster().filter(o=>o.id!==myId);
  let crewHtml = "";
  if (crew.length){
    crewHtml = `<div class="sec"><h2 class="sign">Crew today</h2><span class="label">${crew.length} member${crew.length===1?"":"s"}</span></div><div class="list">` +
      crew.map(o=>{
        if (!sharesStats(o)) return `<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
          <span class="note">${isGym(o,t)?workLabel(slot(o,t)):"Rest day"} · keeps stats private</span></div><span class="status rest">${LOCK}</span></div>`;
        const st = isGym(o,t) ? (has(o,t)?"done":"todo") : "rest";
        return `<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
          <span class="note">${isGym(o,t)?workLabel(slot(o,t)):"Rest day"} · ${dayStreak(o)} day streak</span></div>
          <span class="status ${st}">${st==="done"?"Done":st==="todo"?"Not yet":"Rest"}</span></div>`; }).join("") + `</div>`;
  } else crewHtml = `<div class="card"><span class="label">Crew</span><p style="margin:6px 0 0;font-weight:600">You're the first one here.</p><p class="note">Open the You tab to see how to bring your friends in.</p></div>`;

  // Existing members get asked once; anyone hidden gets a gentle nudge to share.
  let pvHtml = "";
  if (!m.privacyChosen){
    pvDraft = pvDraft || pvFrom(m);
    pvHtml = `<div class="card pvcard"><span class="label">New</span><h2 class="sign" style="margin:4px 0 2px;font-size:30px">Choose what your crew sees</h2>
      <p class="note">You can change this any time in the You tab.</p>${privacyPicker(pvDraft)}
      <button class="cta" id="pv-save">Save</button></div>`;
  } else if (!m.isPublic || !m.shareAtt){
    pvHtml = `<div class="card quote"><span class="bolt">${LOCK}</span><div class="q">You're hidden from the leaderboard.<small>Share your streak so the crew can see you showing up.</small>
      <button class="linkbtn" id="pv-open" style="padding-left:0">Privacy settings</button></div></div>`;
  }
  let stepsHtml = "";
  if (!STEPS_ENABLED){ /* steps hidden */ }
  else if (hasSteps(m)){
    const ws = startOfWeek(t), vals = weekSteps(m, ws), tot = vals.reduce((a,b)=>a+b,0);
    const daysIn = Math.max(1, vals.filter(v=>v>0).length), todayN = stepsOn(m,t), yN = stepsOn(m, addDays(t,-1));
    const synced = m.stepsAt ? new Date(m.stepsAt).toLocaleString("en-AU",{weekday:"short",hour:"numeric",minute:"2-digit"}) : "";
    stepsHtml = `<div class="card steps" style="${pc(m)}">
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
  main().innerHTML = `<div class="view">${pvHtml}${hero}${tiles}${stepsHtml}${q}${crewHtml}</div>`;
  $("logbtn").onclick = () => toggleDay(t);
  if ($("steps-setup")) $("steps-setup").onclick = () => { setTab("you"); setTimeout(() => $("health")?.scrollIntoView({behavior:"smooth"}), 50); };
  if ($("pv-save")){
    wirePrivacy(pvDraft, render);
    $("pv-save").onclick = async () => { const b = $("pv-save"); b.disabled = true;
      if (await savePrivacy(pvDraft)){ pvDraft = null; toast("Privacy saved"); } else if ($("pv-save")) $("pv-save").disabled = false; };
  }
  if ($("pv-open")) $("pv-open").onclick = () => setTab("you");
}
let pvDraft = null;

function viewJoin(){
  main().innerHTML = `<div class="view">
    <div class="card hero" style="--c:var(--iron)">
      <span class="label">Welcome</span>
      <div class="work sign">Set up your plan</div>
      <p class="sub">5 quick questions: what to call you, your plate colour, your weekly split, how long you've been going, and what the crew can see. Then tick off every session and keep the streak alive.</p>
      <button class="cta" id="startob">Get started</button>
    </div>
    ${roster().length ? `<div class="sec"><h2 class="sign">Already here</h2><span class="label">${roster().length} lifting</span></div>
      <div class="list">${roster().map(o=>`<div class="li" style="${pc(o)}"><span class="dot"></span><span class="grow"><span class="nm">${esc(o.name)}</span><span class="note">${sharesStats(o) ? `Week ${weekNo(o)} · ${dayStreak(o)} day streak` : "Keeps stats private"}</span></span></div>`).join("")}</div>` : ""}
  </div>`;
  $("startob").onclick = () => startOnboarding(false);
}

function cellBtn(o,d){
  const s = slot(o,d), t = today(), done = has(o,d), cred = credited(o,d);
  const st = !s ? (done?"done":"rest") : done ? "done" : (!s.opt && d<t) ? "missed" : "open";
  const mine = o.id===myId && d<=t && !cred && db;
  const label = !s ? (done?"Bonus":"Rest") : workLabel(s);
  const small = s?.opt ? "Optional" : "";
  return `<button class="cell ${st} ${mine?"mine":""}" ${mine?`data-day="${key(d)}"`:"disabled"} style="${pc(o)}" aria-label="${esc(o.name)} ${DAYS_LONG[dow(d)]}: ${label}, ${done?"done":"not done"}">
    <span class="t">${label}${small?`<small>${small}</small>`:""}</span><span class="ck">${CHECK}</span></button>`;
}

function viewCrew(){
  const t = today(), ws = startOfWeek(t), list = statsCrew(), quiet = quietCrew();
  if (!list.length){ main().innerHTML = `<div class="card"><p style="margin:0;font-weight:600">No one's joined yet.</p><p class="note">Join from the Today tab and you'll show up here.</p></div>`; return; }
  const quietHtml = quiet.length ? `<div class="sec"><h2 class="sign">Keeping it private</h2><span class="label">${quiet.length}</span></div>
    <div class="list">${quiet.map(o=>`<div class="li" style="${pc(o)}"><span class="dot"></span><div class="grow"><span class="nm">${esc(o.name)}</span>
      <span class="note">Not sharing attendance</span></div><span class="status rest">${LOCK}</span></div>`).join("")}</div>` : "";
  const ranked = [...list].sort((a,b)=> dayStreak(b)-dayStreak(a) || weeksDone(b)-weeksDone(a));
  const board = `<div class="list">${ranked.map((o,i)=>{
      const days = Array.from({length:7},(_,k)=>{ const d=addDays(ws,k); return `<i class="${has(o,d)?"d":isGym(o,d)?(d<t?"m":"g"):""}"></i>`; }).join("");
      return `<div class="li" style="${pc(o)}"><span class="rank">${i+1}</span><span class="dot"></span>
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
    <div class="sec" style="margin-top:0"><h2 class="sign">Leaderboard</h2><span class="label">By day streak</span></div>${board}
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
    <div class="sec"><h2 class="sign">Week board</h2></div>
    <div class="weeknav"><button class="navbtn" id="prev" aria-label="Previous week">‹</button>
      <div class="mid"><b class="sign">${weekOffset===0?"This week":weekOffset===-1?"Last week":"Week of "+fmt(start)}</b><span class="label">${fmt(start)} – ${fmt(addDays(start,6))}</span></div>
      <button class="navbtn" id="next" aria-label="Next week" ${weekOffset>=0?"disabled":""}>›</button></div>
    <div class="scrollx">${grid}</div>
    <p class="note">Tap your own column to tick a day you forgot, or to undo one.</p>
    <div class="list">${sums}</div>${quietHtml}</div>`;
  main().querySelectorAll("[data-sm]").forEach(b => b.onclick = () => { stepsMode = b.dataset.sm; try{localStorage.setItem("gs-steps",stepsMode);}catch(e){} render(); });
  $("prev").onclick = () => { weekOffset--; render(); };
  $("next").onclick = () => { if (weekOffset<0){ weekOffset++; render(); } };
  main().querySelectorAll("[data-day]").forEach(b => b.onclick = () => toggleDay(parse(b.dataset.day)));
}

function viewTrophies(){
  const list = statsCrew();
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
}

function viewYou(){
  const m = me();
  const link = location.origin + location.pathname;
  const invite = `<div class="card"><span class="label">Bring a friend in</span>
    <ol style="margin:10px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:15px">
      <li>Send them this link: <b class="mono" style="font-size:13px;word-break:break-all">${esc(link)}</b></li>
      <li>They tap <b>Create account</b> and answer 5 quick questions.</li>
      <li>On iPhone: Safari → Share → <b>Add to Home Screen</b>.</li></ol>
    <button class="cta ghost" id="copylink" style="margin-top:12px;font-size:18px">Copy link</button></div>`;
  const acct = `<p class="note" style="text-align:center">Signed in as ${esc(session?.user?.email || "")}</p>
    <button class="cta ghost" id="logout">Log out</button>`;
  if (!m){ main().innerHTML = `<div class="view"><div class="card"><p style="margin:0;font-weight:600">You haven't set up your plan yet.</p><p class="note">Go to Today and tap Get started.</p></div>${invite}${acct}</div>`; }
  else {
    const plan = m.plan.map((s,i)=>`<div class="li"><b class="sign" style="font-size:20px;width:44px">${DAYS[i]}</b><span class="grow">${s?esc(s.w):'<span class="note">Rest</span>'}</span>${s?.opt?'<span class="label">Optional</span>':""}</div>`).join("");
    main().innerHTML = `<div class="view">
      <div class="card hero" style="${pc(m)}"><span class="label">${PLATES.find(p=>p.id===m.plate)?.kg||5} kg plate · since ${fmt(parse(m.since))}</span>
        <div class="work sign">${esc(m.name)}</div>
        <p class="sub">Week ${weekNo(m)} · ${dayStreak(m)} day streak · ${Object.keys(m.days||{}).length} sessions logged</p></div>
      <div class="sec"><h2 class="sign">Your split</h2></div>
      <div class="list">${plan}</div>
      <button class="cta ghost" id="editob">Edit name, plate or split</button>
      <div class="sec"><h2 class="sign">Privacy</h2><span class="label">${privacySummary(m)}</span></div>
      <div class="card">${privacyPicker(pvFrom(m))}<p class="note" id="pv-status" style="margin-top:10px">Changes save straight away.</p></div>
      ${STEPS_ENABLED ? healthCard(m) : ""}
      ${invite}${acct}</div>`;
    wireHealth();
    $("editob").onclick = () => startOnboarding(true);
    const p = pvFrom(m);
    wirePrivacy(p, async () => {
      if ($("pv-status")) $("pv-status").textContent = "Saving…";
      if (await savePrivacy(p)) toast("Privacy updated");
    });
  }
  $("copylink").onclick = async () => { try { await navigator.clipboard.writeText(link); toast("Link copied"); } catch(e){ toast("Copy failed"); } };
  $("logout").onclick = async () => { await sb.auth.signOut(); };
}

// ================= Privacy =================
// p = {pub, att, split}. Sharing is the default and the recommended choice.
function privacyPicker(p){
  return `<div class="privacy">
    <button type="button" class="popt ${p.pub?"on":""}" data-pv="pub" aria-pressed="${p.pub}">
      <span class="pt">Share with the crew <span class="rec">Recommended</span></span>
      <span class="pd">Your crew keeps you honest. They see if you went, you show up on the leaderboard, and they can hype you up.</span></button>
    ${p.pub ? `<div class="toggles">
      <label class="tg" for="pv-att"><span><b>Attendance &amp; streaks</b><small>Whether you went each day, your streak, week number and trophies</small></span>
        <input type="checkbox" class="sw" id="pv-att" ${p.att?"checked":""}></label>
      <label class="tg" for="pv-split"><span><b>My split</b><small>What you train each day (e.g. Push, Legs)</small></span>
        <input type="checkbox" class="sw" id="pv-split" ${p.split?"checked":""}></label>
      ${STEPS_ENABLED ? `<label class="tg" for="pv-steps"><span><b>Steps</b><small>Daily steps from Apple Health, if you connect it</small></span>
        <input type="checkbox" class="sw" id="pv-steps" ${p.steps?"checked":""}></label>` : ""}
      ${p.att ? "" : `<p class="nudge">Heads up: with attendance off you're not on the leaderboard, and nobody can tell if you went. Streaks hit different when people are watching.</p>`}
    </div>` : ""}
    <button type="button" class="popt ${!p.pub?"on":""}" data-pv="priv" aria-pressed="${!p.pub}">
      <span class="pt">${LOCK} Keep it private</span>
      <span class="pd">Only you see your sessions. You won't appear in the crew at all.</span></button>
  </div>`;
}
function wirePrivacy(p, onChange){
  main().querySelectorAll("[data-pv]").forEach(b => b.onclick = () => { p.pub = b.dataset.pv === "pub"; if (p.pub && !p.att && !p.split){ p.att = true; } onChange(); });
  const a = $("pv-att"), s = $("pv-split");
  if (a) a.onchange = () => { p.att = a.checked; onChange(); };
  if (s) s.onchange = () => { p.split = s.checked; onChange(); };
  const st = $("pv-steps");
  if (st) st.onchange = () => { p.steps = st.checked; onChange(); };
}
const pvFrom = m => ({ pub: m?.isPublic ?? true, att: m?.shareAtt ?? true, split: m?.shareSplit ?? true, steps: m?.shareSteps ?? false });
async function savePrivacy(p){
  const { error } = await sb.from("profiles").update({ is_public:p.pub, share_attendance:p.att, share_split:p.split, share_steps:!!p.steps, privacy_chosen:true }).eq("id", myId);
  if (error){ showWarn("Couldn't save privacy: " + error.message); return false; }
  await loadAll(); return true;
}
const privacySummary = m => !m.isPublic ? "Private: only you see your sessions"
  : m.shareAtt && m.shareSplit ? "Sharing attendance, streaks and split"
  : m.shareAtt ? "Sharing attendance and streaks · split hidden"
  : m.shareSplit ? "Sharing split only · attendance hidden" : "Visible by name only";

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

// ================= Onboarding =================
function startOnboarding(edit){
  const m = edit ? me() : null;
  ob = { edit, step:0, name: m?.name || "", plate: m?.plate || PLATES[members.size % PLATES.length].id,
    plan: m ? m.plan.map(s=>s?s.w:"") : ["","","","","","",""], opt: m ? m.plan.map(s=>!!s?.opt) : [false,false,false,false,false,false,false], weeks: 0,
    pv: { pub:true, att:true, split:true, steps:false } };
  render();
}
function viewOnboarding(){
  const total = ob.edit ? 4 : 6, s = ob.step;
  const dots = `<div class="steps">${Array.from({length:total},(_,i)=>`<i class="${i<=s?"on":""}"></i>`).join("")}</div>`;
  let body = "", canNext = true;
  if (s===0){ body = `<span class="label">Question 1</span><h2 class="sign">What should the crew call you?</h2>
      <input class="field" id="f-name" type="text" maxlength="20" placeholder="e.g. DP" value="${esc(ob.name)}" autocomplete="nickname">`;
    canNext = !!ob.name.trim(); }
  if (s===1){ body = `<span class="label">Question 2</span><h2 class="sign">Pick your plate</h2>
      <p class="note">Your colour across the app, like competition plates.</p>
      <div class="platepick">${PLATES.map(p=>`<button data-plate="${p.id}" aria-pressed="${ob.plate===p.id}" style="--c:var(--p-${p.id})"><span class="pd"></span><small>${p.kg} KG</small></button>`).join("")}</div>`; }
  if (s===2){ ob.active = ob.active ?? ob.plan.findIndex(w=>!w.trim()); if (ob.active < 0) ob.active = 0;
    body = `<span class="label">Question 3</span><h2 class="sign">Your weekly split</h2>
      <p class="note">Pick a ready-made split, or tap a day and build it with the buttons below it. You can also just type: we'll tidy it up.</p>
      <div class="presets">${Object.keys(PRESETS).map(k=>`<button class="chip" data-preset="${esc(k)}">${k}</button>`).join("")}</div>
      <div class="daylist">${DAYS.map((d,i)=>`<div class="dayrow ${ob.active===i?"active":""}" id="row-${i}" data-row="${i}">
        <b class="sign">${d}</b>
        <div class="dayin"><input type="text" id="f-day-${i}" data-i="${i}" maxlength="40" placeholder="Rest" value="${esc(ob.plan[i])}" autocapitalize="words" enterkeyhint="next">
          <small class="tidy" id="tidy-${i}"></small></div>
        <label class="opt"><input type="checkbox" id="f-opt-${i}" data-o="${i}" ${ob.opt[i]?"checked":""}>Optional</label></div>`).join("")}</div>
      <div class="quicktray" id="tray"><span class="label" id="tray-label"></span>
        <div class="trayc">${QUICK.map(q=>`<button type="button" class="chip" data-q="${esc(q)}">${q}</button>`).join("")}
          <button type="button" class="chip ghostchip" data-q="__rest">Rest day</button></div></div>`;
    canNext = ob.plan.some((w,i)=>normalizeWorkout(w) && !ob.opt[i]); }
  if (s===3 && !ob.edit){ body = `<span class="label">Question 4</span><h2 class="sign">How many weeks have you already been going?</h2>
      <p class="note">Count full weeks in a row before today. They count toward your milestones.</p>
      <div class="stepper"><button id="w-minus" aria-label="Fewer weeks">−</button><b class="sign" id="w-n">${ob.weeks}</b><button id="w-plus" aria-label="More weeks">+</button></div>
      <p class="note" style="text-align:center">You'll start on <b>Week ${ob.weeks+1}</b>.</p>`; }
  if (s===4 && !ob.edit){ body = `<span class="label">Question 5</span><h2 class="sign">What can the crew see?</h2>
      <p class="note">You can change this any time in the You tab.</p>${privacyPicker(ob.pv)}`; }
  const last = s === total-1;
  if (last){ const gym = ob.plan.filter((w,i)=>normalizeWorkout(w)&&!ob.opt[i]).length;
    body = `<span class="label">Check it</span><h2 class="sign">${ob.edit?"Save changes":"Ready to lift"}</h2>
      <div class="review" style="--c:var(--p-${ob.plate})">
        <div><span>Name</span><b>${esc(ob.name)}</b></div>
        <div><span>Plate</span><b style="display:flex;align-items:center;gap:6px"><span class="dot"></span>${PLATES.find(p=>p.id===ob.plate).kg} kg</b></div>
        <div><span>Gym days a week</span><b>${gym}</b></div>
        ${ob.edit?"":`<div><span>Starting on</span><b>Week ${ob.weeks+1}</b></div>
          <div><span>Crew sees</span><b>${privacySummary({isPublic:ob.pv.pub, shareAtt:ob.pv.att, shareSplit:ob.pv.split}).replace(/^Private: /,"Private · ")}</b></div>`}
        ${DAYS.map((d,i)=>{ const w = normalizeWorkout(ob.plan[i]); return `<div><span>${d}</span><b>${w?esc(w)+(ob.opt[i]?" (optional)":""):"Rest"}</b></div>`; }).join("")}
      </div>`; }
  main().innerHTML = `<div class="card ob">${dots}${body}
    <div class="row2"><button class="cta ghost" id="ob-back">${s===0?"Cancel":"Back"}</button>
    <button class="cta" id="ob-next" ${canNext?"":"disabled"}>${last?(ob.edit?"Save":"Join the crew"):"Next"}</button></div></div>`;
  const nextBtn = $("ob-next");
  const refresh = () => { const ok = s===0 ? !!ob.name.trim() : s===2 ? ob.plan.some((w,i)=>normalizeWorkout(w)&&!ob.opt[i]) : true; nextBtn.disabled = !ok; };
  if (s===0){ const f = $("f-name"); f.oninput = () => { ob.name = f.value; refresh(); }; f.focus(); f.onkeydown = e => { if (e.key==="Enter" && ob.name.trim()) nextBtn.click(); }; }
  if (s===1) main().querySelectorAll("[data-plate]").forEach(b => b.onclick = () => { ob.plate = b.dataset.plate; render(); });
  if (s===2) wireSplitStep(refresh);
  if (s===4 && !ob.edit) wirePrivacy(ob.pv, render);
  if (s===3 && !ob.edit){ $("w-minus").onclick = () => { ob.weeks = Math.max(0,ob.weeks-1); render(); }; $("w-plus").onclick = () => { ob.weeks = Math.min(260,ob.weeks+1); render(); }; }
  $("ob-back").onclick = () => { if (s===0){ ob = null; } else ob.step--; render(); };
  nextBtn.onclick = () => { if (last) saveOnboarding(); else { ob.step++; render(); } };
}
// ---- Split step: tap a day, then tap buttons to build it; typing gets tidied ----
function wireSplitStep(refresh){
  const tray = $("tray");
  const parts = i => normalizeWorkout(ob.plan[i]).split(" + ").filter(Boolean);
  const paint = i => {                       // update one day's input, tidy hint and the button states
    const inp = $("f-day-"+i), tidy = $("tidy-"+i), clean = normalizeWorkout(ob.plan[i]);
    if (document.activeElement !== inp) inp.value = clean || "";
    const typed = ob.plan[i].trim();
    tidy.textContent = typed && clean !== typed ? (clean ? "→ " + clean : "→ Rest day") : "";
    if (i === ob.active){
      const have = parts(i);
      tray.querySelectorAll("[data-q]").forEach(b => b.setAttribute("aria-pressed", b.dataset.q === "__rest" ? String(!clean) : String(have.includes(b.dataset.q))));
      $("tray-label").textContent = `Building ${DAYS_LONG[i]}` + (clean ? `: ${clean}` : " (rest)");
    }
  };
  const select = i => {                       // move the button tray under the chosen day
    ob.active = i;
    main().querySelectorAll(".dayrow").forEach(r => r.classList.toggle("active", +r.dataset.row === i));
    $("row-"+i).insertAdjacentElement("afterend", tray);
    paint(i);
  };
  main().querySelectorAll("[data-i]").forEach(inp => {
    const i = +inp.dataset.i;
    inp.onfocus = () => { if (ob.active !== i) select(i); };
    inp.oninput = () => { ob.plan[i] = inp.value; paint(i); refresh(); };
    inp.onblur  = () => { ob.plan[i] = normalizeWorkout(inp.value); inp.value = ob.plan[i]; paint(i); refresh(); };
    inp.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); const nx = $("f-day-"+(i+1)); nx ? nx.focus() : inp.blur(); } };
  });
  main().querySelectorAll(".dayrow").forEach(r => r.onclick = e => { if (e.target.closest("input,label")) return; select(+r.dataset.row); });
  main().querySelectorAll("[data-o]").forEach(cb => cb.onchange = () => { ob.opt[+cb.dataset.o] = cb.checked; refresh(); });
  tray.querySelectorAll("[data-q]").forEach(b => {
    b.onpointerdown = e => e.preventDefault();         // keep the keyboard from jumping around
    b.onclick = () => {
      const i = ob.active, q = b.dataset.q;
      if (q === "__rest"){ ob.plan[i] = ""; ob.opt[i] = false; $("f-opt-"+i).checked = false; }
      else { const have = parts(i); ob.plan[i] = (have.includes(q) ? have.filter(x => x !== q) : [...have, q]).join(" + "); }
      $("f-day-"+i).value = ob.plan[i];
      paint(i); refresh();
    };
  });
  main().querySelectorAll("[data-preset]").forEach(b => b.onclick = () => {
    ob.plan = [...PRESETS[b.dataset.preset]]; ob.opt = ob.opt.map(()=>false);
    for (let i = 0; i < 7; i++){ $("f-day-"+i).value = ob.plan[i]; $("f-opt-"+i).checked = false; paint(i); }
    refresh(); toast(b.dataset.preset);
  });
  for (let i = 0; i < 7; i++) paint(i);
  select(ob.active);
}

async function saveOnboarding(){
  const plan = ob.plan.map((w,i)=> { const t = normalizeWorkout(w); return t ? {w:t, opt:!!ob.opt[i]} : null; });
  const old = ob.edit ? me() : null;
  const ws = startOfWeek(today());
  const row = { id: myId, name: ob.name.trim().slice(0,20), plate: ob.plate, plan };
  if (!old){ row.since = key(addDays(ws,-7*ob.weeks)); row.track_start = key(ws);
    Object.assign(row, { is_public:ob.pv.pub, share_attendance:ob.pv.att, share_split:ob.pv.split, share_steps:!!ob.pv.steps, privacy_chosen:true }); }
  const wasEdit = ob.edit;
  const btn = $("ob-next"); if (btn) btn.disabled = true;
  const { error } = await sb.from("profiles").upsert(row);
  if (error){ if (btn) btn.disabled = false; showWarn("Couldn't save: " + error.message); return; }
  ob = null; tab = "today";
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
        fetchAll("crew", "id,name,plate,plan,since,track_start,created_at,is_public,share_attendance,share_split,privacy_chosen,share_steps"),
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
        isPublic:p.is_public, shareAtt:p.share_attendance, shareSplit:p.share_split, privacyChosen:p.privacy_chosen, shareSteps:p.share_steps,
        days:{}, steps:{}, stepsAt:null });
      for (const c of checkins){ const m = next.get(c.user_id); if (m) m.days[c.day] = 1; }
      for (const s of stepRows){ const m = next.get(s.user_id); if (m){ m.steps[s.day] = s.count; if (!m.stepsAt || s.updated_at > m.stepsAt) m.stepsAt = s.updated_at; } }
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
    .subscribe();
}

// ================= Writes =================
const busy = new Set();
async function toggleDay(d){
  const m = me(); if (!m || !db) return;
  const k = key(d); if (busy.has(k)) return; busy.add(k);
  const was = !!(m.days && m.days[k]), before = weekStats(m,startOfWeek(d));
  const days = {...(m.days||{})}; if (was) delete days[k]; else days[k] = 1;
  members.set(myId, {...m, days}); render();   // show it instantly, save in the background
  if (!was){
    try{ navigator.vibrate && navigator.vibrate(15); }catch(e){}
    burst();
    const nm = me(), w = weekStats(nm,startOfWeek(d));
    if (isGym(nm,d) && w.target && w.hit===w.target && before.hit<before.target) toast(`Week ${weekNo(nm)} — full bar`);
    else if (isGym(nm,d)) toast(`${dayStreak(nm)} day streak`);
    else toast("Bonus session");
  }
  const { error } = was
    ? await sb.from("checkins").delete().eq("user_id", myId).eq("day", k)
    : await sb.from("checkins").insert({ user_id: myId, day: k });
  busy.delete(k);
  if (error){ members.set(myId, m); render(); showWarn("Couldn't save that: " + error.message); }
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
  const show = !!session && !ob && memberCount > 0;
  el.hidden = !show; if (!show) return;
  el.setAttribute("aria-label", `${memberCount} ${memberCount === 1 ? "person has" : "people have"} joined Gym Streak`);
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

// ================= Shell =================
const TITLES = {today:"Today",crew:"Crew",trophies:"Trophies",you:"You"};
function render(){
  $("date").textContent = today().toLocaleDateString("en-AU",{weekday:"long",day:"numeric",month:"short"});
  const m = me();
  $("mebadge").innerHTML = m ? `<span class="dot" style="${pc(m)}"></span>${esc(m.name)}` : "";
  const signedIn = !!session;
  $("tabbar").hidden = !signedIn || !!ob;
  for (const k of Object.keys(TITLES)) $("t-"+k).setAttribute("aria-selected", k===tab && !ob);
  renderOnline();
  if (!sb) return viewSetup();
  if (authMode==="newpass") return viewAuth();
  if (!signedIn) return viewAuth();
  if (!ready){ $("title").textContent = TITLES[tab]; main().innerHTML = `<div class="skel">Loading the crew…</div>`; return; }
  if (ob){ $("title").textContent = ob.edit ? "Edit" : "Set up"; viewOnboarding(); return; }
  $("title").textContent = TITLES[tab];
  ({today:viewToday,crew:viewCrew,trophies:viewTrophies,you:viewYou})[tab]();
}
function setTab(t){ tab=t; ob=null; try{localStorage.setItem("gs-tab",t);}catch(e){} render(); window.scrollTo(0,0); }
for (const k of Object.keys(TITLES)) $("t-"+k).onclick = () => setTab(k);

let sb = null, session = null;
(function boot(){
  const cfg = window.GYM_CONFIG || {};
  if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || !window.supabase){ render(); return; }
  sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } });
  db = sb;
  sb.auth.onAuthStateChange((event, s) => {
    if (event === "PASSWORD_RECOVERY") authMode = "newpass";
    const was = session?.user?.id;
    session = s; myId = s?.user?.id || null;
    if (myId && myId !== was){ ready = false; loadAll(); subscribe(); }
    if (!myId){ members = new Map(); ready = false; memberCount = 0; renderOnline(); }
    render();
  });
  render();
})();

// ================= Auto-update =================
// Home-screen apps keep running the copy they loaded. Each time the app opens or comes back
// to the front, compare our version with the live one and reload if there's a newer one.
const APP_VERSION = "11";   // bump together with version.json on every release
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
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible"){ checkForUpdate(); if (session) loadAll(); } });
let lastDay = key(today());
setInterval(() => { if (key(today()) !== lastDay){ lastDay = key(today()); render(); } }, 60000);

// Offline app shell (makes it installable and load instantly)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
