const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const BASE = s => `window.__seen=${s};window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => {
  const b = await chromium.launch();
  for (const [scheme, vp] of [["light", {width:390,height:844}], ["dark", {width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE(2), tour: true, wait: 1500, scheme, vp });
    ok(await p.$("#wn") !== null, `${tag} saw tour 2 → update shows on open`);
    const steps = await p.$$eval(".steps i", e => e.length); ok(steps === 4, `${tag} 4 dots (hello + 3 screens) = ${steps}`);
    ok(/what.s new since/i.test(await p.$eval(".wnline", e => e.innerText)), `${tag} hello line`);
    const titles = [];
    for (let i = 1; i <= 4; i++){ await p.waitForTimeout(600); await p.shot(`wn_${i}_${tag}`); titles.push(await p.$eval(".wnbig", e => e.innerText.replace(/\n/g, " ")));
      const w = await p.$eval("#wn", e => e.scrollWidth <= innerWidth + 1); if (!w) ok(false, `${tag} step ${i} too wide`);
      await p.click("#wn-next"); await p.waitForTimeout(200); }
    ok(titles.join("|").toUpperCase() === "WHAT'S NEW|WORKOUTS|TIMERS|HEALTH", `${tag} order: ${titles.join(" | ")}`);
    ok(await p.$("#wn") === null && await p.$eval("#title", e => e.textContent) === "Today", `${tag} Got it → Today`);
    const w = await p.evaluate(() => window.__writes.filter(x => x.table === "profiles" && x.vals && "seen_update" in x.vals).map(x => x.vals.seen_update));
    ok(!w.includes(4), `${tag} beta does NOT save update 4 to the account (test only)`);
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`);
    await p.reload(); await p.waitForTimeout(1500);
    ok(await p.$("#wn") === null, `${tag} doesn't show again on this phone`); await p.close();
  }
  { const p = await open(b, { pre: BASE(3), tour: true, wait: 1500 });
    ok((await p.$$eval(".steps i", e => e.length)) === 2 && /what.s new since/i.test(await p.$eval(".wnline", e => e.innerText)), "saw update 3 → only Health");
    await p.click("#wn-next"); await p.waitForTimeout(150); await p.click("#wn-skip"); await p.waitForTimeout(200);
    ok(await p.$("#wn") === null, "Skip closes it"); await p.close(); }
  { const p = await open(b, { pre: BASE(4), tour: true, wait: 1500 });
    ok(await p.$("#wn") === null, "already saw update 4 (e.g. in the other app or another phone) → nothing"); await p.close(); }
  { const p = await open(b, { pre: BASE(0), tour: true, wait: 1500 });
    const n = await p.$$eval(".steps i", e => e.length);
    const names = []; for (let i = 0; i < 8; i++){ const t = await p.$(".wnbig"); if (!t) break; names.push((await t.innerText()).replace(/\n/g, " ")); await p.click("#wn-next"); await p.waitForTimeout(150); }
    ok(n === 10 && /Public or private/i.test(await p.$eval("#main", e => e.innerText)), `never saw any → everything + privacy: ${n} steps, ${names.join(" | ")}`);
    await p.close(); }
  await b.close();
})();
