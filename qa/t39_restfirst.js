const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, wait: 1500, scheme, vp });
    await p.evaluate(() => startWorkout(today())); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !!myWo(woDay).session_run_at), `${tag} opening the workout starts the workout time`);
    ok(await p.$("#rf-start") !== null && await p.$("#wo-start") === null, `${tag} lands on the rest screen (Start rest), no Start Workout step`);
    const pref = await p.evaluate(() => restPrefs.s);
    await p.click('[data-radj="15"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(p0 => restPrefs.s === p0 + 15, pref), `${tag} +15 before starting changes the rest time`);
    await p.click('[data-radj="-15"]'); await p.click('[data-radj="-15"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(p0 => restPrefs.s === p0 - 15, pref), `${tag} −15 works`);
    await p.click(".rfchg"); await p.waitForTimeout(200); ok(await p.$("[data-rspick]") !== null, `${tag} Change rest opens the rest sheet`);
    await p.click("[data-rspick='90']"); await p.click("[data-rsclose].cta"); await p.waitForTimeout(150);
    await p.screenshot({ path: `shots/rf1_${tag}.png` });
    await p.click("#rf-start"); await p.waitForTimeout(300);
    ok(await p.evaluate(() => !!rest && rest.total === 90000), `${tag} Start rest → 1:30 rest`);
    await p.click('[data-radj="15"]'); await p.click('[data-radj="15"]'); await p.waitForTimeout(150);
    ok(await p.evaluate(() => rest.total === 120000 && restLeft() > 115000), `${tag} +15 twice while resting → 2:00`);
    await p.screenshot({ path: `shots/rf2_${tag}.png` });
    await p.click("#rf-reset"); await p.waitForTimeout(150);
    ok(await p.evaluate(() => rest.total === 90000 && restLeft() > 88000), `${tag} Reset → back to 1:30 from the top`);
    await p.click("#rf-pause"); await p.waitForTimeout(1300);
    const a = await p.evaluate(() => restLeft()); await p.waitForTimeout(1100); const b2 = await p.evaluate(() => restLeft());
    ok(a === b2 && /Resume/.test(await p.$eval("#rf-pause", e => e.textContent)), `${tag} Pause freezes the rest`);
    await p.click("#rf-pause"); await p.waitForTimeout(1100); ok(await p.evaluate(x => restLeft() < x, a), `${tag} Resume carries on`);
    await p.click('[data-trest="skip"]'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !rest) && await p.$("#rf-start") !== null, `${tag} Skip → back to Start rest`);
    await p.click("#wo-time"); await p.waitForTimeout(200);
    ok(/Workout time/i.test(await p.$eval(".chgsheet", e => e.innerText)), `${tag} tap Workout › → workout time sheet`);
    await p.screenshot({ path: `shots/rf3_${tag}.png` });
    await p.click('[data-tses="pause"]'); await p.waitForTimeout(200); ok(await p.evaluate(() => !myWo(woDay).session_run_at), `${tag} can pause the workout time there`);
    await p.click("[data-wtclose].linkbtn"); await p.waitForTimeout(150);
    // short rest runs out → back to start
    await p.evaluate(() => { startRest(2, "x"); render(); }); await p.waitForTimeout(3200);
    ok(await p.evaluate(() => !rest) && await p.$("#rf-start") !== null, `${tag} rest finishing → back to Start rest`);
    { const hs = await p.hscroll(); ok(hs.sw <= hs.v, `${tag} no sideways scroll`); }
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close(); }
  await b.close(); })();
