const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  { const p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];`, tour: true, wait: 1500, scheme: "light" });
    const bad = []; p.on("response", r => { if (r.status() >= 400 && r.url().includes("localhost")) bad.push(r.status() + " " + r.url()); });
    ok(await p.evaluate(() => APP_VERSION === "55" && !BETA && WORKOUTS && document.title === "CREW"), "main build: v55, not beta, new app on");
    ok((await p.$$eval(".steps i", e => e.length)) === 4, "update shows: 4 screens");
    for (let i = 0; i < 4; i++){ await p.click("#wn-next"); await p.waitForTimeout(250); }
    const w = await p.evaluate(() => window.__writes.filter(x => x.table === "profiles" && x.vals && "seen_update" in x.vals).map(x => x.vals.seen_update));
    ok(w.includes(4), "main app saves it to the account (once per account)");
    ok(await p.$eval("#t-split", e => !e.hidden) && !(await p.$("#t-trophies")), "tab bar: Split, no Trophies tab");
    await p.evaluate(() => { setTab("you"); }); await p.waitForTimeout(200);
    await p.click("#you-settings"); await p.waitForTimeout(300);
    const st = await p.$eval("#main", e => e.innerText);
    ok(!/During the beta/i.test(st), "settings: real notification settings (not the beta note)");
    await p.reload(); await p.waitForTimeout(1500);
    ok(await p.$("#wn") === null, "not shown again");
    ok(bad.length === 0, "no missing files " + bad.join(", "));
    ok(p.errs.length === 0, "no errors " + p.errs.join(" | ")); await p.close(); }
  { const p = await open(b, { pre: `window.__seen=4;window.__messages=[];window.__reactions=[];`, tour: true, wait: 1500 });
    ok(await p.$("#wn") === null, "already saw update 4 → nothing"); await p.close(); }
  await b.close(); })();
