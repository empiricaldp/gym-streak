const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => {
  const b = await chromium.launch();
  for (const vp of [{width:390,height:844},{width:320,height:640}]){
    const p = await open(b, { pre: BASE + "window.GYM_DELETE=1;", wait: 1500, vp });
    const check = async label => {
      const r = await p.evaluate(() => {
        const box = e => e && !e.hidden && e.getBoundingClientRect();
        const hc = box(document.getElementById("hcount")); if (!hc || !hc.width) return { shown: false };
        const hit = (a, x) => x && x.width && !(a.right <= x.left || x.right <= a.left || a.bottom <= x.top || x.bottom <= a.top);
        const t = document.getElementById("title"), titleFits = t.scrollWidth <= t.clientWidth + 1, nameHits = hit(box(document.getElementById("mebadge")), t.getBoundingClientRect());
        const others = { title: box(document.getElementById("title")), me: box(document.getElementById("mebadge")), date: box(document.getElementById("date")), main: box(document.getElementById("main")) };
        return { shown: true, text: document.getElementById("hcount").innerText.replace(/\n/g," "), overlaps: Object.entries(others).filter(([k,x]) => hit(hc,x)).map(([k])=>k),
                 titleFits, titleVsName: nameHits ? "OVERLAP" : "ok", titlePx: getComputedStyle(t).fontSize, inView: hc.right <= innerWidth && hc.left >= 0, hscroll: document.documentElement.scrollWidth > innerWidth };
      });
      console.log(`${vp.width} ${label.padEnd(14)}`, JSON.stringify(r));
    };
    for (const t of ["today","crew","chats","split","you"]){ await p.evaluate(t => setTab(t), t); await p.waitForTimeout(250); await check(t); if (vp.width===320) await p.shot("hc_"+t+"_320"); else await p.shot("hc_"+t); }
    await p.click("#you-settings"); await p.waitForTimeout(200); await check("settings");
    await p.click("#del-open"); await p.waitForTimeout(200); await check("delete (long)"); await p.shot("hc_delete_"+vp.width);
    await p.evaluate(() => { const m = me(); m.name = "Alexandrina Montgomery"; render(); }); await p.waitForTimeout(200); await check("long name"); await p.shot("hc_longname_"+vp.width);
    console.log("errors:", p.errs); await p.close();
  }
  // signed out: no count
  const p = await open(b, { pre: BASE + "window.__nosession=1;", wait: 1500 });
  console.log("signed out, count hidden:", await p.$eval("#hcount", e => e.hidden));
  await b.close();
})();
