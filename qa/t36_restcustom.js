const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  for (const [scheme, vp] of [["light", {width:390,height:844}], ["dark", {width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, wait: 1500, scheme, vp });
    await p.evaluate(() => { startWorkout(today()); }); await p.waitForTimeout(300);
    // default rest sheet
    await p.evaluate(() => { restSheet = { ex: null }; render(); }); await p.waitForTimeout(200);
    await p.click("[data-rscustom]"); await p.waitForTimeout(200);
    await p.fill("#rs-m", "1"); await p.fill("#rs-sec", "45");
    ok((await p.$eval("#rs-set", e => e.textContent)) === "Set 1:45", `${tag} button says Set 1:45`); await p.shot("rest_custom_" + tag);
    await p.fill("#rs-m", "12"); ok(await p.$eval("#rs-set", e => e.disabled && /10 min max/.test(e.textContent)), `${tag} over 10 min blocked`);
    await p.fill("#rs-m", "0"); await p.fill("#rs-sec", "3"); ok(await p.$eval("#rs-set", e => e.disabled), `${tag} under 5 sec blocked`);
    await p.fill("#rs-m", "1"); await p.fill("#rs-sec", "45"); await p.click("#rs-set"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => restPrefs.s === 105 && window.__writes.some(x => x.table === "profiles" && x.vals && x.vals.rest_s === 105)), `${tag} default rest saved 105s`);
    ok(/1:45/.test(await p.$eval("[data-rscustom]", e => e.textContent)), `${tag} custom chip shows 1:45 and is selected`);
    await p.click("[data-rspick='90']"); await p.waitForTimeout(150); ok(await p.evaluate(() => restPrefs.s === 90), `${tag} preset still works`);
    { const hs = await p.hscroll(); ok(hs.sw <= hs.v, `${tag} no sideways scroll`); }
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close(); }
  await b.close(); })();
