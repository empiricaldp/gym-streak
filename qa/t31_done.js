const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];window.__workouts=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const T = (p, s) => p.$eval(s, e => e.innerText.replace(/\n+/g, " | ").trim()).catch(() => "(missing)");
(async () => { const b = await chromium.launch();
  for (const [W, H, sc] of [[390, 844, "light"], [320, 640, "dark"]]){ const p = await open(b, { pre: BASE, wait: 1500, scheme: sc, vp: { width: W, height: H } });
    await p.click("#t-split"); await p.waitForTimeout(200); await p.evaluate(() => { plans = []; render(); }); await p.click("#split-go"); await p.waitForTimeout(200);
    await p.click("#wo-start"); await p.evaluate(() => { const w = myWo(woDay); w.session_run_at = new Date(Date.now() - 6618000).toISOString(); }); await p.waitForTimeout(300);
    await p.click("#wo-finish"); await p.waitForTimeout(800); await p.click("#sum-done"); await p.waitForTimeout(300);
    await p.click("#t-today"); await p.waitForTimeout(200); await p.click("#wo-go"); await p.waitForTimeout(300);
    console.log(W, "screen:", await T(p, ".wdone"));
    await p.screenshot({ path: __dirname + `/shots/done_${W}${sc[0]}.png` });
    await p.click("#wo-add"); await p.fill("#wo-newex", "Bench press"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    console.log(W, "added after finishing:", await T(p, ".woex .woname"), "| still finished screen:", !!(await p.$(".wdone")));
    await p.click("#wo-finish"); await p.waitForTimeout(300); console.log(W, "Done → back:", await p.$eval("#title", e => e.innerText));
    console.log(W, "sideways:", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), "errors:", p.errs); await p.close(); }
  await b.close(); })();
