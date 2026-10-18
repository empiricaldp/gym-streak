const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, wait: 1500, scheme, vp });
    await p.evaluate(() => { startWorkout(today()); const w = myWo(woDay); w.exercises = [{ name: "Weighted Pull Ups", done: false, sets: [{ reps: 6, kg: 20 }, { reps: 6, kg: 20 }] }, { name: "Tbar Row", done: false, sets: [{ reps: 10, kg: 50 }] }]; sesStart(); render(); });
    await p.waitForTimeout(300);
    await p.click('[data-tickset="0:0"]'); await p.waitForTimeout(300);
    ok(/Rest for Weighted Pull Ups\?/i.test(await p.$eval("#main", e => e.innerText)), `${tag} asks "Rest for Weighted Pull Ups?" on first rest`);
    await p.screenshot({ path: `shots/rsask_${tag}.png` });
    await p.click('[data-rsask="120"]'); await p.waitForTimeout(300);
    const st = await p.evaluate(() => ({ r: myWo(woDay).exercises[0].rest, total: rest && rest.total, left: rest && Math.round((rest.end - Date.now()) / 1000) }));
    ok(st.r === 120 && st.total === 120000 && st.left > 110 && st.left <= 120, `${tag} saved 2:00 to the exercise and the running rest became 2:00 (${JSON.stringify(st)})`);
    ok(!/Rest for /i.test(await p.$eval("#main", e => e.innerText)), `${tag} question disappears`);
    await p.evaluate(() => restSkip()); await p.waitForTimeout(200);
    await p.click('[data-tickset="0:1"]'); await p.waitForTimeout(300);
    ok(!/Rest for /i.test(await p.$eval("#main", e => e.innerText)) && await p.evaluate(() => rest.total === 120000), `${tag} second set: no question, uses 2:00`);
    await p.evaluate(() => restSkip()); await p.waitForTimeout(200);
    await p.click('[data-tickset="1:0"]'); await p.waitForTimeout(300);
    ok(/Rest for Tbar Row\?/i.test(await p.$eval("#main", e => e.innerText)), `${tag} a new exercise asks once too`);
    await p.click('[data-rsask="custom"]'); await p.waitForTimeout(300);
    ok(await p.$("#rs-m") !== null, `${tag} Custom opens minutes/seconds`);
    await p.reload(); await p.waitForTimeout(1500);
    await p.evaluate(() => { const w = myWo(woDay) || (startWorkout(today()), myWo(woDay)); restSkip && restSkip(); w.exercises = [{ name: "Tbar Row", done: false, sets: [{ reps: 10, kg: 50 }, { reps: 10, kg: 50 }] }]; render(); }); await p.waitForTimeout(300);
    const t = await p.$('[data-tickset="0:1"]'); if (t){ await t.click(); await p.waitForTimeout(300); ok(!/Rest for /i.test(await p.$eval("#main", e => e.innerText)), `${tag} only ever asked once per exercise`); }
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close(); }
  await b.close(); })();
