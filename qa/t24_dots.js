// usage: node t24_dots.js <tag>   → shots/dots_<tag>_*.png + measurements
const { chromium, open } = require("./h.js");
const tag = process.argv[2] || "x";
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[{id:1,from_user:"u2",to_user:"u1",body:"gym at 6?",created_at:new Date(Date.now()-600000).toISOString()}];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => {
  const b = await chromium.launch();
  for (const vp of [{width:390,height:844},{width:320,height:640}]){
    const p = await open(b, { pre: BASE, wait: 1500, vp });
    await p.evaluate(() => openProfile("u2")); await p.waitForTimeout(400);
    const m = await p.evaluate(() => { const d = document.querySelector(".hero .pfmore"), nm = document.querySelector(".hero .work, .hero h2, .hero .nm"); if (!d) return "no button";
      const r = d.getBoundingClientRect(), n = nm && nm.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: d.getAttribute("aria-label"), nameMidY: n && Math.round(n.top + n.height/2), btnMidY: Math.round(r.top + r.height/2), nameRight: n && Math.round(n.right), btnLeft: Math.round(r.left) }; });
    console.log(vp.width, "profile ⋯:", JSON.stringify(m));
    await p.screenshot({ path: __dirname + `/shots/dots_${tag}_profile_${vp.width}.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.min(vp.height, 460) } });
    await p.click(".hero .pfmore"); await p.waitForTimeout(250);
    console.log(vp.width, "menu opens:", await p.$eval(".chgsheet", e => e.innerText.replace(/\n+/g," | ").slice(0,90)).catch(() => "(no menu)"));
    await p.click("[data-sfgo=block]"); await p.waitForTimeout(200);
    console.log(vp.width, "block confirm:", await p.$eval(".chgsheet h3", e => e.innerText).catch(() => "(missing)"), "| button:", await p.$eval("#sf-block", e => e.innerText).catch(() => "(missing)"));
    await p.click(".chgsheet [data-sfclose]"); await p.waitForTimeout(200);
    await p.evaluate(() => { setTab("chats"); openChat("d:u2"); }); await p.waitForTimeout(500);
    const c = await p.evaluate(() => { const d = document.querySelector(".chatmore"); if (!d) return "no button"; const r = d.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), label: d.getAttribute("aria-label") }; });
    console.log(vp.width, "chat ⋯:", JSON.stringify(c));
    await p.screenshot({ path: __dirname + `/shots/dots_${tag}_chat_${vp.width}.png`, clip: { x: 0, y: 0, width: vp.width, height: 140 } });
    console.log("errors:", p.errs); await p.close();
  }
  await b.close();
})();
