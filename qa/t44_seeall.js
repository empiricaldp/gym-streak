const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const font = `@font-face{font-family:Archivo;src:url(data:font/ttf;base64,${require("./h.js").fontB64()});font-weight:100 900;font-stretch:62% 125%}`;
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => { const b = await chromium.launch();
  for (const qp of ["/beta/index.html"]) for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE, wait: 1500, scheme, vp }); await p.addStyleTag({ content: font });
    await p.evaluate(() => { for (let i = 0; i < 8; i++) __people.push({ ...__people[1], id: "bb" + i, name: "Bud" + i, plate: "blue", plan: Array(7).fill({ w: "Legs", opt: false }) }); }); await p.evaluate(() => loadAll()); await p.waitForTimeout(800);
    const rows = () => p.$$eval(".crewrow", e => e.length), total = await p.evaluate(() => roster().filter(o => o.id !== myId && isBud(o) && sharesStats(o) && !o.watcher).length);
    ok(await rows() === 5, `${tag} Today shows 5 first`);
    ok(await p.$eval("#crew-all", e => e.textContent) === `See all ${total}`, `${tag} button See all ${total}`);
    await p.click("#crew-all"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => tab) === "today", `${tag} stays on Today`);
    ok(await rows() === total, `${tag} all ${total} rows shown (${await rows()})`);
    const nudges = await p.$$eval("[data-nudge]", e => e.length); ok(nudges > 5, `${tag} nudge buttons for everyone (${nudges})`);
    ok(await p.$eval("#crew-all", e => e.textContent) === "Show less", `${tag} button now Show less`);
    await p.click("[data-nudge] >> nth=6"); await p.waitForTimeout(300);
    const w = await p.evaluate(() => (window.__writes||[]).filter(x => x.table === "nudges").length + (window.__rpc||[]).length);
    ok(w > 0 || await p.evaluate(() => (window.__nudges||[]).length) > 0, `${tag} 7th person nudged from Today (${w})`);
    await p.full(`seeall_${tag}`);
    await p.click("#crew-all"); await p.waitForTimeout(200); ok(await rows() === 5, `${tag} Show less back to 5`);
    await p.click("#crew-all"); await p.evaluate(() => setTab("crew")); await p.evaluate(() => setTab("today")); ok(await rows() === 5, `${tag} collapses after leaving Today`);
    ok(p.errs.length === 0, `${tag} no errors ` + p.errs.join("|")); await p.close(); }
  await b.close(); })();
