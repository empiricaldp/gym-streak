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
const PRESETS = {
  "Push Pull Legs":["Push","Pull","Legs","Push","Pull","Legs",""],
  "Upper / Lower":["Upper","Lower","","Upper","Lower","",""],
  "Bro split":["Chest","Back","","Shoulders","Arms","Legs",""],
  "Full body ×3":["Full body","","Full body","","Full body","",""]
};
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
  main().innerHTML = `<div class="view">${pvHtml}${hero}${tiles}${q}${crewHtml}</div>`;
  $("logbtn").onclick = () => toggleDay(t);
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
    <div class="sec"><h2 class="sign">Week board</h2></div>
    <div class="weeknav"><button class="navbtn" id="prev" aria-label="Previous week">‹</button>
      <div class="mid"><b class="sign">${weekOffset===0?"This week":weekOffset===-1?"Last week":"Week of "+fmt(start)}</b><span class="label">${fmt(start)} – ${fmt(addDays(start,6))}</span></div>
      <button class="navbtn" id="next" aria-label="Next week" ${weekOffset>=0?"disabled":""}>›</button></div>
    <div class="scrollx">${grid}</div>
    <p class="note">Tap your own column to tick a day you forgot, or to undo one.</p>
    <div class="list">${sums}</div>${quietHtml}</div>`;
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
      ${invite}${acct}</div>`;
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
}
const pvFrom = m => ({ pub: m?.isPublic ?? true, att: m?.shareAtt ?? true, split: m?.shareSplit ?? true });
async function savePrivacy(p){
  const { error } = await sb.from("profiles").update({ is_public:p.pub, share_attendance:p.att, share_split:p.split, privacy_chosen:true }).eq("id", myId);
  if (error){ showWarn("Couldn't save privacy: " + error.message); return false; }
  await loadAll(); return true;
}
const privacySummary = m => !m.isPublic ? "Private: only you see your sessions"
  : m.shareAtt && m.shareSplit ? "Sharing attendance, streaks and split"
  : m.shareAtt ? "Sharing attendance and streaks · split hidden"
  : m.shareSplit ? "Sharing split only · attendance hidden" : "Visible by name only";

// ================= Onboarding =================
function startOnboarding(edit){
  const m = edit ? me() : null;
  ob = { edit, step:0, name: m?.name || "", plate: m?.plate || PLATES[members.size % PLATES.length].id,
    plan: m ? m.plan.map(s=>s?s.w:"") : ["","","","","","",""], opt: m ? m.plan.map(s=>!!s?.opt) : [false,false,false,false,false,false,false], weeks: 0,
    pv: { pub:true, att:true, split:true } };
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
  if (s===2){ body = `<span class="label">Question 3</span><h2 class="sign">Your weekly split</h2>
      <p class="note">Type what you train each day. Leave a day empty for rest. Tick “optional” for days that shouldn't break your streak.</p>
      <div class="presets">${Object.keys(PRESETS).map(k=>`<button class="chip" data-preset="${esc(k)}">${k}</button>`).join("")}</div>
      ${DAYS.map((d,i)=>`<div class="dayrow"><b class="sign">${d}</b><input type="text" id="f-day-${i}" data-i="${i}" maxlength="32" placeholder="Rest" value="${esc(ob.plan[i])}"><label class="opt"><input type="checkbox" id="f-opt-${i}" data-o="${i}" ${ob.opt[i]?"checked":""}>Optional</label></div>`).join("")}`;
    canNext = ob.plan.some((w,i)=>w.trim() && !ob.opt[i]); }
  if (s===3 && !ob.edit){ body = `<span class="label">Question 4</span><h2 class="sign">How many weeks have you already been going?</h2>
      <p class="note">Count full weeks in a row before today. They count toward your milestones.</p>
      <div class="stepper"><button id="w-minus" aria-label="Fewer weeks">−</button><b class="sign" id="w-n">${ob.weeks}</b><button id="w-plus" aria-label="More weeks">+</button></div>
      <p class="note" style="text-align:center">You'll start on <b>Week ${ob.weeks+1}</b>.</p>`; }
  if (s===4 && !ob.edit){ body = `<span class="label">Question 5</span><h2 class="sign">What can the crew see?</h2>
      <p class="note">You can change this any time in the You tab.</p>${privacyPicker(ob.pv)}`; }
  const last = s === total-1;
  if (last){ const gym = ob.plan.filter((w,i)=>w.trim()&&!ob.opt[i]).length;
    body = `<span class="label">Check it</span><h2 class="sign">${ob.edit?"Save changes":"Ready to lift"}</h2>
      <div class="review" style="--c:var(--p-${ob.plate})">
        <div><span>Name</span><b>${esc(ob.name)}</b></div>
        <div><span>Plate</span><b style="display:flex;align-items:center;gap:6px"><span class="dot"></span>${PLATES.find(p=>p.id===ob.plate).kg} kg</b></div>
        <div><span>Gym days a week</span><b>${gym}</b></div>
        ${ob.edit?"":`<div><span>Starting on</span><b>Week ${ob.weeks+1}</b></div>
          <div><span>Crew sees</span><b>${privacySummary({isPublic:ob.pv.pub, shareAtt:ob.pv.att, shareSplit:ob.pv.split}).replace(/^Private: /,"Private · ")}</b></div>`}
        ${DAYS.map((d,i)=>`<div><span>${d}</span><b>${ob.plan[i].trim()?esc(ob.plan[i].trim())+(ob.opt[i]?" (optional)":""):"Rest"}</b></div>`).join("")}
      </div>`; }
  main().innerHTML = `<div class="card ob">${dots}${body}
    <div class="row2"><button class="cta ghost" id="ob-back">${s===0?"Cancel":"Back"}</button>
    <button class="cta" id="ob-next" ${canNext?"":"disabled"}>${last?(ob.edit?"Save":"Join the crew"):"Next"}</button></div></div>`;
  const nextBtn = $("ob-next");
  const refresh = () => { const ok = s===0 ? !!ob.name.trim() : s===2 ? ob.plan.some((w,i)=>w.trim()&&!ob.opt[i]) : true; nextBtn.disabled = !ok; };
  if (s===0){ const f = $("f-name"); f.oninput = () => { ob.name = f.value; refresh(); }; f.focus(); f.onkeydown = e => { if (e.key==="Enter" && ob.name.trim()) nextBtn.click(); }; }
  if (s===1) main().querySelectorAll("[data-plate]").forEach(b => b.onclick = () => { ob.plate = b.dataset.plate; render(); });
  if (s===2){
    main().querySelectorAll("[data-i]").forEach(inp => inp.oninput = () => { ob.plan[+inp.dataset.i] = inp.value; refresh(); });
    main().querySelectorAll("[data-o]").forEach(cb => cb.onchange = () => { ob.opt[+cb.dataset.o] = cb.checked; refresh(); });
    main().querySelectorAll("[data-preset]").forEach(b => b.onclick = () => { ob.plan = [...PRESETS[b.dataset.preset]]; ob.opt = ob.opt.map(()=>false); render(); });
  }
  if (s===4 && !ob.edit) wirePrivacy(ob.pv, render);
  if (s===3 && !ob.edit){ $("w-minus").onclick = () => { ob.weeks = Math.max(0,ob.weeks-1); render(); }; $("w-plus").onclick = () => { ob.weeks = Math.min(260,ob.weeks+1); render(); }; }
  $("ob-back").onclick = () => { if (s===0){ ob = null; } else ob.step--; render(); };
  nextBtn.onclick = () => { if (last) saveOnboarding(); else { ob.step++; render(); } };
}
async function saveOnboarding(){
  const plan = ob.plan.map((w,i)=> w.trim() ? {w:w.trim().slice(0,32), opt:!!ob.opt[i]} : null);
  const old = ob.edit ? me() : null;
  const ws = startOfWeek(today());
  const row = { id: myId, name: ob.name.trim().slice(0,20), plate: ob.plate, plan };
  if (!old){ row.since = key(addDays(ws,-7*ob.weeks)); row.track_start = key(ws);
    Object.assign(row, { is_public:ob.pv.pub, share_attendance:ob.pv.att, share_split:ob.pv.split, privacy_chosen:true }); }
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
async function fetchAll(table, cols){
  const out = []; const page = 1000;
  for (let from = 0; ; from += page){
    const { data, error } = await sb.from(table).select(cols).range(from, from + page - 1);
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
        fetchAll("crew", "id,name,plate,plan,since,track_start,created_at,is_public,share_attendance,share_split,privacy_chosen"),
        fetchAll("checkins", "user_id,day")
      ]);
      const next = new Map();
      for (const p of profiles) next.set(p.id, { id:p.id, name:p.name, plate:p.plate, plan:p.plan, since:p.since, trackStart:p.track_start, joined:p.created_at,
        isPublic:p.is_public, shareAtt:p.share_attendance, shareSplit:p.share_split, privacyChosen:p.privacy_chosen, days:{} });
      for (const c of checkins){ const m = next.get(c.user_id); if (m) m.days[c.day] = 1; }
      members = next; ready = true; $("warn").hidden = true;
    } catch(e){ showWarn("Couldn't load the crew: " + (e.message || e)); ready = true; }
    finally { loading = null; render(); }
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
    if (!myId){ members = new Map(); ready = false; }
    render();
  });
  render();
})();

// Phones pause apps in the background: refresh when it comes back, and roll over at midnight.
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) loadAll(); });
let lastDay = key(today());
setInterval(() => { if (key(today()) !== lastDay){ lastDay = key(today()); render(); } }, 60000);

// Offline app shell (makes it installable and load instantly)
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(()=>{}));
