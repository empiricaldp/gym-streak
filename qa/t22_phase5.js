const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const log = (...a) => console.log(...a);
(async () => {
  const b = await chromium.launch();
  // Leaderboard: Everyone has no global board; My crew still ranks Buds
  let p = await open(b, { pre: BASE, wait: 1500 });
  await p.evaluate(() => { crewView = "everyone"; setTab("crew"); }); await p.waitForTimeout(250);
  log("1 Everyone: board titles:", JSON.stringify(await p.$$eval(".view .sec h2", es => es.map(e => e.textContent))), "| hint:", await p.$eval(".boardhint", e => e.textContent).catch(() => "(missing)"), "| people listed:", await p.$$eval("#people .prow", es => es.length));
  await p.shot("p5_everyone");
  await p.evaluate(() => { crewView = "buds"; render(); }); await p.waitForTimeout(250);
  log("2 My crew still has its leaderboard:", await p.$$eval(".view .sec h2", es => es.map(e => e.textContent).join(" / ")));
  // Delete button hidden while switched off
  await p.evaluate(() => setTab("you")); await p.waitForTimeout(250); await p.click("#you-settings"); await p.waitForTimeout(250);
  log("3 on", await p.$eval("#title", e => e.textContent), "| delete button hidden when off:", !(await p.$("#del-open")));
  await p.close();
  // switched on
  p = await open(b, { pre: BASE + "window.GYM_DELETE=1;", wait: 1500 });
  await p.evaluate(() => setTab("you")); await p.waitForTimeout(250); await p.click("#you-settings"); await p.waitForTimeout(250);
  log("4 delete link shown at bottom of Settings:", !!(await p.$("#del-open")));
  await p.click("#del-open"); await p.waitForTimeout(200);
  log("5 screen:", await p.$eval("#title", e => e.textContent), "| button locked:", await p.$eval("#del-go", e => e.disabled));
  await p.fill("#del-word", "delete"); log("6 lowercase still locked:", await p.$eval("#del-go", e => e.disabled));
  await p.fill("#del-word", "DELETE"); log("7 DELETE unlocks:", !(await p.$eval("#del-go", e => e.disabled)));
  await p.shot("p5_delete");
  await p.click("#del-back"); await p.waitForTimeout(150); log("8 back goes to Settings:", await p.$eval("#title", e => e.textContent));
  await p.click("#del-open"); await p.fill("#del-word", "DELETE"); await p.click("#del-go"); await p.waitForTimeout(400);
  log("9 sent:", JSON.stringify(await p.evaluate(() => __writes.filter(w => w.rpc === "delete_my_account"))));
  log("errors:", p.errs);
  await p.setViewportSize({ width: 320, height: 640 });
  await b.close();
})();
