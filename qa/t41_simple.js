const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  const font = `@font-face{font-family:Archivo;src:url(data:font/ttf;base64,${require("./h.js").fontB64()});font-weight:100 900;font-stretch:62% 125%}`;
  for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, wait: 1500, scheme, vp });
    await p.addStyleTag({ content: font });
    await p.evaluate(() => startWorkout(today())); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !!myWo(woDay).session_run_at) && await p.$("#rf-start") && !(await p.$("[data-radj]")) && !(await p.$(".rfchg")), `${tag} ready: ring + Start rest only, workout time running`);
    await p.click(".rfmid"); await p.waitForTimeout(200); ok(await p.$("[data-rspick]") !== null, `${tag} tap the time → rest options`);
    await p.click("[data-rspick='60']"); await p.click("[data-rsclose].cta"); await p.waitForTimeout(150);
    await p.screenshot({ path: `shots/s1_${tag}.png` });
    await p.click("#rf-start"); await p.waitForTimeout(300);
    ok(await p.evaluate(() => rest && rest.total === 60000) && await p.$("#rf-reset") && await p.$('[data-trest="skip"]') && !(await p.$("#rf-pause")), `${tag} resting: Reset + Skip only, 1:00`);
    await p.screenshot({ path: `shots/s2_${tag}.png` });
    await p.waitForTimeout(1500); await p.click("#rf-reset"); await p.waitForTimeout(150);
    ok(await p.evaluate(() => restLeft() > 59000), `${tag} Reset starts it again from the top`);
    await p.click('[data-trest="skip"]'); await p.waitForTimeout(250);
    ok(await p.evaluate(() => !rest) && await p.$("#rf-start") !== null, `${tag} Skip → back to ready`);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector("header.top")).display === "none") && !(await p.$(".woex")), `${tag} no app header, no exercise list on the screen`);
    await p.click("#wo-time"); await p.waitForTimeout(250);
    ok(await p.$(".chgsheet .woex") !== null && await p.$("#wo-finish") !== null, `${tag} tap Workout → exercises + Finish workout`);
    await p.screenshot({ path: `shots/s3_${tag}.png` });
    await p.click("[data-wtclose].linkbtn"); await p.waitForTimeout(150);
    await p.click("#wo-back"); await p.waitForTimeout(250);
    ok(await p.evaluate(() => getComputedStyle(document.querySelector("header.top")).display !== "none"), `${tag} header comes back after leaving`);
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close(); }
  await b.close(); })();
