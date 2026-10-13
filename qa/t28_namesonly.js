const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];window.__workouts=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => { const b = await chromium.launch();
  const p = await open(b, { pre: BASE, wait: 1500, scheme: "light" });
  await p.click("#t-split"); await p.waitForTimeout(250); await p.evaluate(() => { plans = []; render(); }); await p.waitForTimeout(150);
  await p.click("#split-add"); await p.waitForTimeout(250);
  console.log("1 editor:", await p.$eval("#title", e => e.innerText), "| sets shown:", await p.$$eval(".wosrow", e => e.length), "| kg/lb shown:", !!(await p.$(".worow")), "| link:", await p.$eval("[data-addset]", e => e.innerText));
  for (const n of ["Bench press", "Incline press", "Dips"]) { await p.keyboard.type(n); await p.keyboard.press("Enter"); await p.waitForTimeout(120); }
  console.log("2 typed 3 names with Enter → rows:", await p.$$eval("[data-name]", e => e.map(x => x.value || "(empty)").join(", ")));
  await p.screenshot({ path: __dirname + "/shots/plan_namesonly.png" });
  await p.click('[data-addset="0"]'); await p.waitForTimeout(200);
  console.log("3 + Add sets on Bench →", await p.$$eval(".wosrow", e => e.length), "set row | kg/lb now shown:", !!(await p.$(".worow")));
  await p.click("#pl-save"); await p.waitForTimeout(400);
  console.log("4 saved plan:", JSON.stringify(await p.evaluate(() => plans.map(x => x.exercises.map(e => e.name + ":" + e.sets.length)))));
  console.log("5 back on Split:", await p.$eval(".stcard", e => e.innerText.replace(/\n+/g, " | ")).catch(() => "(missing)"));
  await p.click("#split-details"); await p.waitForTimeout(200); console.log("6 details:", await p.$eval(".stlist", e => e.innerText.replace(/\n+/g, " | ")));
  await p.click("#split-go"); await p.waitForTimeout(400); console.log("7 workout opens with:", await p.$$eval(".woex", e => e.map(x => (x.querySelector(".woexhead") || x).innerText.split("\n")[0]).join(", ")));
  console.log("errors:", p.errs); await b.close(); })();
