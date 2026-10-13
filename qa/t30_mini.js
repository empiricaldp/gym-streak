const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];window.__workouts=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const T = (p, s) => p.$eval(s, e => e.innerText.replace(/\n+/g, " | ").trim()).catch(() => "(missing)");
(async () => { const b = await chromium.launch();
  for (const [W, H, scheme] of [[390, 844, "light"], [320, 640, "dark"]]){
    const p = await open(b, { pre: BASE, wait: 1500, scheme, vp: { width: W, height: H } }); const tag = `${W}${scheme[0]}`;
    const mini = async () => p.evaluate(() => { const e = document.getElementById("womini"); if (e.hidden) return "hidden";
      const r = e.getBoundingClientRect(), t = document.getElementById("tabbar").getBoundingClientRect();
      return { text: e.innerText.replace(/\n+/g, " | "), gapAboveTabs: Math.round(t.top - r.bottom), inScreen: r.left >= 0 && r.right <= innerWidth }; });
    console.log(tag, "0 nothing started:", JSON.stringify(await mini()));
    await p.click("#t-split"); await p.waitForTimeout(200); await p.click("#split-go"); await p.waitForTimeout(250);
    await p.click("#wo-back"); await p.waitForTimeout(250); console.log(tag, "1 opened but not started → bar:", JSON.stringify(await mini()));
    await p.click("#split-go"); await p.waitForTimeout(200); await p.click("#wo-start"); await p.waitForTimeout(400);
    console.log(tag, "2 on workout screen itself:", JSON.stringify(await mini()));
    await p.click("#wo-back"); await p.waitForTimeout(300);
    for (const t of ["today", "crew", "chats", "you", "split"]) { await p.click("#t-" + t); await p.waitForTimeout(250); console.log(tag, `3 tab ${t}:`, JSON.stringify(await mini())); if (t === "crew") await p.screenshot({ path: __dirname + `/shots/mini_going_${tag}.png` }); }
    const a = await p.$eval("#mini-t", e => e.textContent); await p.waitForTimeout(2100); const c = await p.$eval("#mini-t", e => e.textContent);
    console.log(tag, "4 timer ticks while away:", a, "→", c);
    // last card can scroll clear of the bar
    await p.click("#t-today"); await p.waitForTimeout(200); await p.evaluate(() => window.scrollTo(0, 1e6)); await p.waitForTimeout(200);
    console.log(tag, "5 bottom of Today clear of bar:", await p.evaluate(() => { const last = [...document.querySelectorAll("#main .view > *")].pop().getBoundingClientRect(); return Math.round(document.getElementById("womini").getBoundingClientRect().top - last.bottom) >= 0; }));
    // start a rest, then leave → bar shows the rest
    await p.click("#womini"); await p.waitForTimeout(300); console.log(tag, "6 tap bar → back in workout:", !!(await p.$(".whtime")));
    await p.click('.whfoot [data-trest="start"]'); await p.waitForTimeout(300); await p.click("#wo-back"); await p.waitForTimeout(300);
    console.log(tag, "7 resting, away:", JSON.stringify(await mini()));
    await p.screenshot({ path: __dirname + `/shots/mini_rest_${tag}.png` });
    await p.evaluate(() => { rest.end = Date.now() + 1200; rest.total = 90000; }); await p.waitForTimeout(2200);
    console.log(tag, "8 rest ended while away → banner:", await T(p, "#ibanner"), "| bar back to timer:", JSON.stringify(await mini()));
    await p.click("#womini"); await p.waitForTimeout(300); await p.click('[data-tses="pause"]'); await p.waitForTimeout(200); await p.click("#wo-back"); await p.waitForTimeout(300);
    console.log(tag, "9 paused, away:", JSON.stringify(await mini()));
    await p.click("#womini"); await p.waitForTimeout(300); await p.click("#wo-finish"); await p.waitForTimeout(800); await p.click("#sum-done"); await p.waitForTimeout(300);
    console.log(tag, "10 after finish:", JSON.stringify(await mini()));
    console.log(tag, "errors:", p.errs); await p.close(); }
  await b.close(); })();
