const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const BASE = `window.__seen=4;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => { const b = await chromium.launch();
  for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE, wait: 1500, scheme, vp });
    await p.evaluate(() => startWorkout(today())); await p.waitForTimeout(400);
    ok(!!(await p.$("#rf-finish")) && !!(await p.$("#rf-start")), `${tag} Finish + Start rest on the ready screen`);
    const pos = await p.evaluate(() => [document.getElementById("rf-finish").getBoundingClientRect(), document.getElementById("rf-start").getBoundingClientRect()].map(r => ({ top: r.top, bottom: r.bottom, w: r.width })));
    ok(pos[0].bottom <= pos[1].top && Math.abs(pos[0].w - pos[1].w) < 2 && pos[1].bottom <= vp.height, `${tag} Finish sits above a full-width Start rest, both on screen ${JSON.stringify(pos)}`);
    await p.screenshot({ path: `shots/rffin_${tag}.png` });
    await p.click("#rf-finish"); await p.waitForTimeout(700);
    const st = await p.evaluate(() => { const w = myWo(key(today())); return { fin: !!(w && w.finished_at), run: !!(w && w.session_run_at), logged: has(me(), today()) }; });
    ok(st.fin && !st.run && st.logged, `${tag} tapping Finish stops the clock and logs today ${JSON.stringify(st)}`);
    await p.screenshot({ path: `shots/rffin_after_${tag}.png` });
    ok(p.errs.length === 0, `${tag} no errors ` + p.errs.join("|")); await p.close(); }
  await b.close(); })();
