const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];window.__workouts=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const T = (p, s) => p.$eval(s, e => e.innerText.replace(/\n+/g, " | ").trim()).catch(() => "(missing)");
(async () => { const b = await chromium.launch();
  for (const [W, H, scheme] of [[390, 844, "light"], [320, 640, "light"], [390, 844, "dark"]]){
    const p = await open(b, { pre: BASE, wait: 1500, scheme, vp: { width: W, height: H } }); const tag = `${W}${scheme[0]}`;
    await p.click("#t-split"); await p.waitForTimeout(200); await p.evaluate(() => { plans = []; render(); });
    await p.click("#split-go"); await p.waitForTimeout(300);
    console.log(tag, "H1:", await T(p, ".whv"));
    await p.screenshot({ path: __dirname + `/shots/wo2_before_${tag}.png`, fullPage: false });
    await p.click("#wo-start"); await p.waitForTimeout(1300);
    console.log(tag, "H2 clock running:", await p.$eval("#ses-t", e => e.textContent), "| buttons:", await T(p, ".whfoot"));
    await p.screenshot({ path: __dirname + `/shots/wo2_going_${tag}.png` });
    await p.click('.whfoot [data-trest="start"]'); await p.waitForTimeout(700);
    console.log(tag, "H3:", await T(p, ".whring"), "| buttons:", await T(p, ".whfoot"), "| alarm:", !!(await p.evaluate(() => window.__alarm || (window.__writes||[]).some(w => JSON.stringify(w).includes("rest_alarms")))));
    await p.screenshot({ path: __dirname + `/shots/wo2_rest_${tag}.png` });
    const before = await p.evaluate(() => rest.end); await p.click('[data-trest="plus"]'); await p.waitForTimeout(200);
    console.log(tag, "+30 sec adds:", Math.round((await p.evaluate(() => rest.end) - before) / 1000), "s");
    await p.click('[data-trest="skip"]'); await p.waitForTimeout(300); console.log(tag, "Skip → back to going:", !!(await p.$(".whtime")), "| rests counted:", await T(p, ".whlist"));
    await p.click('[data-tses="pause"]'); await p.waitForTimeout(300); console.log(tag, "Pause →", await T(p, ".whstate"), "| button:", await T(p, '[data-tses]'));
    await p.click('[data-tses="start"]'); await p.waitForTimeout(300); console.log(tag, "Resume →", await T(p, ".whstate"));
    await p.click("#wo-add"); await p.fill("#wo-newex", "Bench press"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    console.log(tag, "noted exercise:", await T(p, ".woex .woname"), "| kg/lb hidden (no sets):", !(await p.$(".whsec .unitseg, .whsec [data-unit]")));
    await p.click('[data-tick="0"]'); await p.waitForTimeout(400); console.log(tag, "tick → auto rest screen:", !!(await p.$(".whring")));
    await p.click('[data-trest="skip"]'); await p.waitForTimeout(300);
    console.log(tag, "sideways scroll:", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth));
    await p.click("#wo-finish"); await p.waitForTimeout(800); console.log(tag, "Finish →", await T(p, ".wosum"));
    console.log(tag, "errors:", p.errs); await p.close(); }
  // plan user + yellow plate
  const p = await open(b, { pre: BASE, wait: 1500, scheme: "light" });
  await p.evaluate(() => { me().plate = "yellow"; render(); }); await p.click("#t-split"); await p.waitForTimeout(200); await p.click("#split-go"); await p.waitForTimeout(300);
  console.log("plan H1 exercises:", await T(p, ".whv .whblock:last-of-type"));
  const c = await p.$eval(".whbtn.red", e => { const cs = getComputedStyle(e); return cs.backgroundColor + " / " + cs.color; }); console.log("yellow plate Start button bg/text:", c);
  await p.screenshot({ path: __dirname + "/shots/wo2_before_yellowplan.png" });
  await p.click("#wo-start"); await p.waitForTimeout(300); console.log("plan H2 list:", await p.$$eval(".woex .woname b", e => e.map(x => x.textContent).join(", ")));
  await p.screenshot({ path: __dirname + "/shots/wo2_going_plan.png", fullPage: true });
  console.log("errors:", p.errs); await b.close(); })();
