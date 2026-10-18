const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  const p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, wait: 1500 });
  await p.evaluate(() => startWorkout(today())); await p.waitForTimeout(300);
  await p.click("#rf-start"); await p.waitForTimeout(200);
  await p.click("#wo-back"); await p.waitForTimeout(400);
  ok(await p.$eval("#womini", e => !e.hidden && /Rest/i.test(e.innerText)), "leave the screen while resting → mini bar shows the rest");
  await p.click("#womini"); await p.waitForTimeout(300);
  ok(await p.$("#rf-reset") !== null, "tap the mini bar → back to the rest screen");
  await p.click('[data-trest="skip"]'); await p.waitForTimeout(200);
  
  await p.evaluate(() => restSkip()); await p.waitForTimeout(200);
  await p.click("#wo-time"); await p.waitForTimeout(250); await p.click("#wo-finish"); await p.waitForTimeout(500);
  ok(await p.evaluate(() => !!myWo(woDay)?.finished_at) || /done|finished/i.test(await p.$eval("#main", e => e.innerText)), "Finish workout → finished screen");
  ok(p.errs.length === 0, "no errors " + p.errs.join(" | ")); await p.close(); await b.close(); })();
