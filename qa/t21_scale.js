const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  // normal (today: ~40 members): unchanged
  let p = await open(b, { pre: BASE, wait: 1500 });
  log("A normal mode: scoped =", await p.evaluate(() => scoped), "| members loaded:", await p.evaluate(() => members.size), "| narrowed reads:", await p.evaluate(() => (window.__reads || []).length));
  await p.evaluate(() => { crewView = "everyone"; setTab("crew"); }); await p.waitForTimeout(250);
  log("  Everyone list shows all:", await p.$$eval("#people .prow", es => es.length), "| board:", await p.$eval(".view .sec h2", e => e.textContent).catch(()=>"?"));
  await p.close();
  // big CREW (forced: limit 3, stub has 6+)
  p = await open(b, { pre: BASE + "window.GYM_SCALE_LIMIT=3;", wait: 1500 });
  const txt = s => p.$eval(s, e => e.innerText.replace(/\n/g, " ").trim()).catch(() => "(missing)");
  log("B big mode: scoped =", await p.evaluate(() => scoped), "| loaded only who I know:", await p.evaluate(() => [...members.values()].map(m => m.name).join(", ")), "| reads:", JSON.stringify(await p.evaluate(() => window.__reads)));
  log("  Today still works:", await txt("#logbtn"));
  await p.evaluate(() => { crewView = "everyone"; setTab("crew"); }); await p.waitForTimeout(250);
  log("  Everyone before search:", await p.$$eval("#people .prow", es => es.length), "rows |", await txt("#people + p.note"), "| board title:", await p.$$eval(".view .sec h2", es => es.map(e => e.textContent).join(" / ")));
  await p.fill("#find-q", "de"); await p.waitForTimeout(700);
  log("  search 'de' →", await p.$$eval("#people .prow .nm", es => es.map(e => e.textContent).join(", ")), "| server asked:", JSON.stringify(await p.evaluate(() => window.__reads.slice(-1))));
  await p.shot("sc1_search");
  await p.click('#people .prow[data-profile="x0"]'); await p.waitForTimeout(500);
  log("  open Dev from search:", await txt(".hero .work"), "| his days loaded:", await p.evaluate(() => Object.keys(members.get("x0").days).length), "| kept on reload:", await p.evaluate(() => extraIds.has("x0")));
  await p.evaluate(() => loadAll()); await p.waitForTimeout(600);
  log("  after reload still loaded:", await p.evaluate(() => members.has("x0")));
  log("errors:", p.errs);
  await b.close();
})();
