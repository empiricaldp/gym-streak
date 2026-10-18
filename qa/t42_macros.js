const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const font = `@font-face{font-family:Archivo;src:url(data:font/ttf;base64,${require("./h.js").fontB64()});font-weight:100 900;font-stretch:62% 125%}`;
(async () => {
  const b = await chromium.launch();
  // 032 not applied: Health still works, no Macros anywhere, old-style meal save
  { const p = await open(b, { pre: BASE + "window.__noMacros=1;", wait: 1500 });
    ok(await p.evaluate(() => healthOk && !macrosOk), "no 032 → Health on, Macros off");
    await p.click("#hhealth"); await p.waitForTimeout(200);
    ok(!(await p.$('[data-hgo="mac"]')), "no Macros card without 032");
    await p.click('[data-hgo="cal"]'); await p.click("#h-addmeal"); await p.waitForTimeout(200);
    ok(!(await p.$("#m-p")), "no macro boxes without 032");
    await p.fill("#m-amt", "500"); await p.click("#m-save"); await p.waitForTimeout(250);
    const w = await p.evaluate(() => __writes.filter(x => x.table === "meals").pop().vals);
    ok(!("protein_g" in w) && w.unit === "kcal", "old DB: no macro fields sent " + JSON.stringify(w));
    ok(p.errs.length === 0, "no errors without 032 " + p.errs.join(" | ")); await p.close(); }

  for (const [scheme, vp] of [["dark", {width:390,height:844}], ["light", {width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE, wait: 1500, scheme, vp });
    await p.addStyleTag({ content: font });
    await p.click("#hhealth"); await p.waitForTimeout(200);
    ok(!!(await p.$('[data-hgo="mac"]')), `${tag} Macros card on the hub`);
    await p.click('[data-hgo="mac"]'); await p.waitForTimeout(150);
    ok(await p.$eval("#title", e => e.textContent) === "Macros", `${tag} Macros page`);
    // 1. protein only
    await p.click("#h-addmeal"); await p.waitForTimeout(200);
    ok(await p.$eval("#m-save", e => e.disabled), `${tag} empty → Add disabled`);
    await p.fill("#m-p", "30");
    ok(!(await p.$eval("#m-save", e => e.disabled)), `${tag} only protein → Add enabled`);
    ok(await p.$eval("#m-other", e => e.textContent) === "", `${tag} only protein → no calorie guess`);
    if (vp.width === 390) await p.screenshot({ path: `shots/mac_sheet1_${tag}.png` });
    await p.click("#m-save"); await p.waitForTimeout(250);
    let w = await p.evaluate(() => __writes.filter(x => x.table === "meals").pop().vals);
    ok(w.amount === null && w.unit === null && w.protein_g === 30 && w.carbs_g === null && w.fat_g === null, `${tag} protein-only saved ` + JSON.stringify(w));
    // 2. all three macros, no energy → ≈ 410 kcal
    await p.click("#h-addmeal"); await p.waitForTimeout(200); await p.click('[data-mkind="lunch"]'); await p.fill("#m-name", "Chicken rice");
    await p.fill("#m-p", "40"); await p.fill("#m-c", "50"); await p.fill("#m-f", "6");
    ok(await p.$eval("#m-other", e => e.textContent) === "", `${tag} 40/50/6 → no worked-out calories (${await p.$eval("#m-other", e => e.textContent)})`);
    if (vp.width === 390) await p.screenshot({ path: `shots/mac_sheet2_${tag}.png` });
    await p.click("#m-save"); await p.waitForTimeout(250);
    // 3. energy + macros: typed energy wins
    await p.click("#h-addmeal"); await p.waitForTimeout(200); await p.fill("#m-amt", "600"); await p.fill("#m-p", "50"); await p.fill("#m-c", "60"); await p.fill("#m-f", "20");
    ok(await p.$eval("#m-other", e => e.textContent) === "= 2,510 kJ", `${tag} typed energy shows conversion, not guess`);
    await p.click("#m-save"); await p.waitForTimeout(250);
    const t = await p.$eval(".hmacs", e => e.innerText.replace(/\s+/g, " "));
    ok(/Protein 120 g/i.test(t) && /Carbs 110 g/i.test(t) && /Fat 26 g/i.test(t), `${tag} totals P120 C110 F26 (${t})`);
    ok(await p.$$eval(".hmeal", e => e.length) === 3, `${tag} 3 meals listed`);
    // 4. goals
    await p.click("#h-macgoal"); await p.waitForTimeout(200); await p.fill("#g-p", "150"); await p.fill("#g-c", "250"); await p.fill("#g-f", "70");
    if (vp.width === 390) await p.screenshot({ path: `shots/mac_goals_${tag}.png` });
    await p.click("#b-save"); await p.waitForTimeout(250);
    const pr = await p.evaluate(() => __profile); ok(pr.protein_goal === 150 && pr.carbs_goal === 250 && pr.fat_goal === 70, `${tag} goals saved`);
    ok(/120 \/ 150 g/i.test(await p.$eval(".hmacs", e => e.innerText.replace(/\s+/g, " "))), `${tag} shows 120 / 150 g`);
    ok(/150 · 250 · 70 g/.test(await p.$eval("#h-macgoal", e => e.innerText)), `${tag} goals row`);
    await p.full(`mac_page_${tag}`);
    // calories page: 414 + 600 = 1,014; protein-only shows NO CALORIES; macro meal shows ≈
    await p.click("#h-back"); await p.waitForTimeout(150); await p.full(`mac_hub_${tag}`);
    ok(/120\s*g protein/i.test(await p.$eval('[data-hgo="mac"]', e => e.innerText)), `${tag} hub card shows 120 g protein`);
    await p.click('[data-hgo="cal"]'); await p.waitForTimeout(150);
    ok(await p.$eval(".hcalnum", e => e.textContent) === "600", `${tag} calories only what was typed = 600 (${await p.$eval(".hcalnum", e => e.textContent)})`);
    const rows = await p.$$eval(".hmeal", e => e.map(x => x.innerText.replace(/\s+/g, " ")));
    ok(/\*\s*$/.test(rows[0]) && /\*\s*$/.test(rows[1]) && !/\d{3}/.test(rows[1].replace(/\d+:\d+/,"")) && /600/.test(rows[2]), `${tag} rows ` + rows.join(" | "));
    await p.full(`mac_cal_${tag}`);
    // edit the protein-only meal: add 300 kcal
    await p.click(".hmeal >> nth=0"); await p.waitForTimeout(200);
    ok(await p.$eval("#m-p", e => e.value) === "30" && await p.$eval("#m-amt", e => e.value) === "", `${tag} edit sheet keeps 30 g protein`);
    await p.fill("#m-amt", "300"); await p.click("#m-save"); await p.waitForTimeout(250);
    ok(await p.$eval(".hcalnum", e => e.textContent) === "900", `${tag} after edit 900`);
    ok((await p.hscroll()).sw <= vp.width, `${tag} no sideways scroll`);
    ok(p.errs.length === 0, `${tag} no errors ` + p.errs.join(" | ")); await p.close();
  }
  await b.close();
})();
