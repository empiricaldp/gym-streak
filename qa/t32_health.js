const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => {
  const b = await chromium.launch();
  // 1. database not upgraded yet: no heart, nothing breaks
  { const p = await open(b, { pre: BASE + "window.__noHealth=1;", wait: 1500 });
    ok(await p.$eval("#hhealth", e => e.hidden), "no 029 yet → heart hidden");
    ok(!(await p.$eval("#hcount", e => e.hidden)), "member count still shows");
    ok(p.errs.length === 0, "no errors without 029 " + p.errs.join(" | ")); await p.close(); }
  for (const scheme of ["light", "dark"]) for (const vp of [{width:390,height:844},{width:320,height:640}]){
    const tag = `${scheme}_${vp.width}`, p = await open(b, { pre: BASE, wait: 1500, scheme, vp });
    const pill = () => p.$eval("#hhealth", e => ({ hidden: e.hidden, text: e.innerText.trim(), fill: !!e.querySelector(".hhfill"), h: e.getBoundingClientRect().height, ch: document.getElementById("hcount").getBoundingClientRect().height }));
    let s = await pill(); ok(!s.hidden && s.text === "", `${tag} heart shows on Today, empty`); ok(Math.abs(s.h - s.ch) < 1.5, `${tag} same height as members pill (${s.h} vs ${s.ch.toFixed(1)})`);
    if (vp.width === 390 && scheme === "light") await p.screenshot({ path: "shots/h_pill0.png", clip: { x: 0, y: 0, width: 390, height: 120 } });
    await p.evaluate(() => setTab("crew")); ok((await pill()).hidden, `${tag} hidden on other tabs`); await p.evaluate(() => setTab("today"));
    await p.click("#hhealth"); await p.waitForTimeout(200);
    ok(await p.$eval("#title", e => e.textContent) === "Health", `${tag} opens Health`); await p.full(`h_hub_${tag}`);
    await p.click('[data-hgo="cal"]'); await p.waitForTimeout(150);
    ok(await p.$eval("#title", e => e.textContent) === "Calories", `${tag} Calories page`);
    // add 450 kcal breakfast-ish
    await p.click("#h-addmeal"); await p.waitForTimeout(250); await p.full(`h_sheet_${tag}`);
    await p.click('[data-mkind="breakfast"]'); await p.fill("#m-amt", "450"); await p.click("#m-save"); await p.waitForTimeout(250);
    // add 2300 kJ named lunch
    await p.click("#h-addmeal"); await p.waitForTimeout(200); await p.click('[data-mkind="lunch"]'); await p.fill("#m-name", "Chicken wrap");
    await p.click('#m-unit [data-u="kj"]'); await p.fill("#m-amt", "2300");
    ok((await p.$eval("#m-other", e => e.textContent)) === "= 550 kcal", `${tag} sheet shows = 550 kcal`);
    await p.click("#m-save"); await p.waitForTimeout(250);
    ok((await p.$eval(".hcalnum", e => e.textContent)) === "1,000", `${tag} total 450 kcal + 2300 kJ = 1,000 kcal`);
    ok((await p.$$eval(".hmeal", e => e.length)) === 2, `${tag} two meal rows`);
    // daily goal 2500
    await p.click("#h-goal"); await p.waitForTimeout(200); await p.fill("#b-v", "2500"); await p.click("#b-save"); await p.waitForTimeout(250);
    ok(await p.evaluate(() => window.__profile.cal_goal) === 2500, `${tag} goal saved`);
    ok(/1,500 left of 2,500/i.test(await p.$eval(".hcal", e => e.innerText.replace(/\s+/g, " "))), `${tag} shows 1,500 left of 2,500`);
    // nightly total on at 21:30
    await p.click("#h-notify"); await p.waitForTimeout(200); await p.fill("#h-at", "21:30"); await p.dispatchEvent("#h-at", "change"); await p.waitForTimeout(200);
    const pr = await p.evaluate(() => window.__profile); ok(pr.cal_notify === true && pr.cal_notify_at === "21:30", `${tag} nightly total saved (${pr.cal_notify}, ${pr.cal_notify_at})`);
    await p.evaluate(() => document.getElementById("pushsheet")?.remove()); await p.evaluate(() => document.querySelectorAll(".sheetwrap").forEach(x => x.remove()));
    await p.full(`h_cal_${tag}`);
    // switch the page to kJ
    await p.click('#h-unit [data-u="kj"]'); await p.waitForTimeout(200);
    ok((await p.$eval(".hcalnum", e => e.textContent)) === "4,183" && (await p.evaluate(() => window.__profile.energy_unit)) === "kj", `${tag} kJ view: 4,183 kJ, saved`);
    await p.click('#h-unit [data-u="kcal"]'); await p.waitForTimeout(200);
    // edit + delete the lunch
    await p.click(".hmeal >> nth=1"); await p.waitForTimeout(200); await p.fill("#m-amt", "2092"); await p.click("#m-save"); await p.waitForTimeout(200);
    ok((await p.$eval(".hcalnum", e => e.textContent)) === "950", `${tag} edit lunch to 2092 kJ → 950 total`);
    await p.click(".hmeal >> nth=1"); await p.waitForTimeout(200); await p.click("#m-del"); await p.waitForTimeout(100);
    ok((await p.$$eval(".hmeal", e => e.length)) === 2, `${tag} first tap only arms delete`); await p.click("#m-del"); await p.waitForTimeout(200);
    ok((await p.$$eval(".hmeal", e => e.length)) === 1, `${tag} second tap deletes`);
    // back to hub, BMI + body
    await p.click("#h-back"); await p.waitForTimeout(150); await p.click('[data-hgo="body"]'); await p.waitForTimeout(150);
    await p.click('[data-bedit="weight"] >> nth=0'); await p.waitForTimeout(200); await p.fill("#b-v", "72.4"); await p.click("#b-save"); await p.waitForTimeout(250);
    await p.click('.htile[data-bedit="height"]'); await p.waitForTimeout(200); await p.click('#b-unit [data-u="ft"]'); await p.waitForTimeout(150);
    await p.fill("#b-v", "5"); await p.fill("#b-v2", "10");
    ok((await p.$eval("#b-other", e => e.textContent)) === "= 177.8 cm", `${tag} 5 ft 10 in = 177.8 cm`); await p.full(`h_heightsheet_${tag}`);
    await p.click("#b-save"); await p.waitForTimeout(250);
    ok(await p.evaluate(() => window.__profile.height_cm) === 177.8, `${tag} height saved 177.8`);
    ok(/5′10″/i.test(await p.$eval(".htile", e => e.innerText)), `${tag} height tile shows ft in`); await p.full(`h_body_${tag}`);
    await p.click("#h-back"); await p.waitForTimeout(150); await p.click('[data-hgo="bmi"]'); await p.waitForTimeout(150);
    const bmi = await p.$eval(".hbmi .sign", e => e.textContent); ok(bmi === "22.9", `${tag} BMI 72.4 kg / 177.8 cm = 22.9 (${bmi})`); await p.full(`h_bmi_${tag}`);
    await p.click("#h-back"); await p.waitForTimeout(150); await p.full(`h_hub2_${tag}`);
    await p.click("#h-back"); await p.waitForTimeout(150);
    ok(await p.$eval("#title", e => e.textContent) === "Today", `${tag} back to Today`);
    s = await pill(); ok(s.text === "450" && s.fill, `${tag} pill shows 450 with red fill (${s.text})`);
    if (vp.width === 390) await p.screenshot({ path: `shots/h_pill_${scheme}.png`, clip: { x: 0, y: 0, width: 390, height: 120 } });
    { const hs = await p.hscroll(); ok(hs.sw <= hs.v && !hs.bad.length, `${tag} no sideways scroll ${JSON.stringify(hs)}`); }
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close();
  }
  await b.close();
})();
