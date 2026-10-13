const { chromium, open } = require("./h.js");

// new workout screen (b48): opening a workout shows "Start Workout" first
async function woGo(p){ if (await p.$("#wo-start")){ await p.click("#wo-start"); await p.waitForTimeout(250); } }
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const log = (...a) => console.log(...a);
const T = `const t=new Date();const k=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");`;
(async () => {
  const b = await chromium.launch();
  // P1: a finished workout on an unlogged day (e.g. unlogged in the main app) gets repaired on load
  const p = await open(b, { pre: BASE, post: T + `setTimeout(()=>{ __workouts.push({user_id:"u1",day:k(t),label:"Pull",finished_at:new Date(Date.now()-600000).toISOString(),session_ms:300000,session_run_at:null,duration_s:300,exercises:[{name:"Row",done:true,sets:[{reps:8,kg:60,done:true}]}]}); },0);`, wait: 1800 });
  const txt = s => p.$eval(s, e => e.innerText.replace(/\n/g, " ").trim()).catch(() => "(missing)");
  const w = await p.evaluate(() => __workouts.find(x => x.user_id === "u1" && x.day === key(today())));
  log("P1 drift repaired on load: finished =", w.finished_at, "| timer =", w.session_ms, "| ticks =", JSON.stringify(w.exercises.map(e => [e.done, e.sets.filter(s => s.done).length])), "| Today:", await txt("#wo-go"));
  // P1: rapid double tap on Log = one save
  const before = await p.evaluate(() => __writes.filter(x => x.table === "checkins").length);
  await p.evaluate(() => { const b = document.getElementById("logbtn"); b.click(); b.click(); b.click(); }); await p.waitForTimeout(700);
  log("P1 triple-tap Log → saves:", (await p.evaluate(() => __writes.filter(x => x.table === "checkins").length)) - before);
  // P5: finished workout reads as finished
  await p.click("#wo-go"); await p.waitForTimeout(300); await woGo(p); await p.click("#wo-finish"); await p.waitForTimeout(900);
  await p.click("#sum-done").catch(()=>{}); await p.waitForTimeout(300); await p.click("#wo-go"); await p.waitForTimeout(300);
  log("P5 finished view:", await txt(".wohead .label"), "| note:", (await txt(".finnote")).slice(0, 60), "| timers:", await txt("#timers"), "| rest card gone:", !(await p.$("#t-rest")));
  await p.shot("rv1_finished");
  await p.click("#wo-back"); await p.waitForTimeout(200);
  // U2 + U3 on Today
  await p.evaluate(() => { for (let i = 0; i < 8; i++) __people.push({ ...__people[1], id: "bb" + i, name: "Bud" + i, plate: "blue" }); }); await p.evaluate(() => loadAll()); await p.waitForTimeout(800);
  const order = await p.$$eval(".view > .sec h2", es => es.map(e => e.textContent));
  log("U2 Today order:", order.join(" → "), "| crew rows shown:", await p.$$eval(".crewrow", es => es.length), "| button:", await txt("#crew-all"));
  await p.click("[data-streakhelp]"); await p.waitForTimeout(200);
  log("U3 streak help:", await p.$$eval(".shelp dt", es => es.map(e => e.textContent).join(", ")));
  await p.shot("rv2_streakhelp");
  await p.click(".chgsheet [data-shclose]"); await p.waitForTimeout(150); log("   closes:", !(await p.$(".shelp")));
  // P4 + P3 + P6 on Crew → Everyone
  await p.evaluate(() => { __people[0].private = true; crewView = "everyone"; }); await p.evaluate(() => loadAll()); await p.waitForTimeout(600);
  await p.evaluate(() => setTab("crew")); await p.waitForTimeout(300);
  log("P4 floating pill hidden:", await p.$eval("#online", e => e.hidden), "| header:", await txt(".membercount"));
  log("P3 private self note:", await txt(".selfnote"));
  log("P6 tabs:", JSON.stringify(await p.$$eval('.crewseg [role="tab"]', es => es.map(e => [e.textContent, e.getAttribute("aria-selected"), e.tabIndex]))), "| panel:", await p.$eval('[role="tabpanel"]', e => e.getAttribute("aria-labelledby")).catch(() => "none"));
  await p.focus('#crewtab-everyone'); await p.keyboard.press("ArrowRight"); await p.waitForTimeout(200);
  log("   ArrowRight → selected:", await p.$eval('.crewseg [aria-selected="true"]', e => e.textContent), "| focus on:", await p.evaluate(() => document.activeElement.textContent));
  await p.shot("rv3_everyone");
  await p.evaluate(() => { __people[0].private = false; }); await p.evaluate(() => loadAll()); await p.waitForTimeout(500); await p.evaluate(() => { crewView = "everyone"; render(); });
  log("P3 public self → no note:", !(await p.$(".selfnote")));
  // P2 wording + U1 legend on You
  await p.evaluate(() => setTab("you")); await p.waitForTimeout(250);
  log("U1 legend:", await txt(".rellegend"));
  await p.evaluate(() => { youView = "settings"; render(); }); await p.waitForTimeout(250);
  log("P2 private text:", await txt('[data-pv="priv"] .pd'));
  // U4 bonus tile in the recap
  await p.evaluate(() => { recapWhich = "last"; trophyFor = myId; setTab("trophies"); }); await p.waitForTimeout(300);
  log("U4 recap strip:", await p.$$eval(".rday", es => es.map(e => e.className.replace("rday ", "") + ":" + (e.querySelector("i").textContent || "✓")).join(" ")), "| legend:", await txt(".rlegend"));
  await p.evaluate(() => document.querySelector(".recap")?.scrollIntoView()); await p.shot("rv4_recap");
  for (const [vw, tabName] of [[320, "today"], [320, "crew"], [320, "you"]]){ await p.setViewportSize({ width: vw, height: 640 }); await p.evaluate(t => setTab(t), tabName); await p.waitForTimeout(250);
    log(`320px ${tabName}:`, JSON.stringify(await p.hscroll())); }
  log("errors:", p.errs);
  await b.close();
})();
