const { chromium, open } = require("./h.js");
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const txt = (p, s) => p.$eval(s, e => e.innerText.replace(/\n+/g, " | ").trim()).catch(() => "(missing)");
(async () => { const b = await chromium.launch();
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 640 }]){
  const p = await open(b, { pre: BASE + "window.__workouts=[];", wait: 1500, scheme: "light", vp }); const W = vp.width;
  await p.click("#t-split"); await p.waitForTimeout(300);
  console.log(W, "1 has plan → card:", await txt(p, ".stcard"), "| week list hidden:", !(await p.$(".sweek")), "| add link:", !!(await p.$("#split-add")));
  await p.screenshot({ path: __dirname + `/shots/st_detailsuser_${W}.png` });
  await p.click("#split-details"); await p.waitForTimeout(250);
  console.log(W, "2 details:", await txt(p, ".stoday"));
  await p.screenshot({ path: __dirname + `/shots/st_detailsopen_${W}.png` });
  await p.click("#split-editplan"); await p.waitForTimeout(250); console.log(W, "3 Edit opens plan editor:", await p.$eval("#title", e => e.innerText));
  await p.click("#pl-back"); await p.waitForTimeout(250); console.log(W, "4 back from editor →", await p.$("#split-editplan") ? "details" : await txt(p, ".stcard"));
  await p.click("#split-back"); await p.waitForTimeout(200);
  // simple user: no plan
  await p.evaluate(() => { plans = []; render(); }); await p.waitForTimeout(200);
  console.log(W, "5 no plan → card:", await txt(p, ".stcard"), "| links:", await txt(p, ".stlinks"), "| details row:", !!(await p.$("#split-details")));
  await p.screenshot({ path: __dirname + `/shots/st_simple_${W}.png` });
  await p.click("#split-change"); await p.waitForTimeout(250); console.log(W, "6 Change opens sheet:", !!(await p.$(".chgsheet")));
  await p.click(".chgsheet [data-chgclose], .chgdim").catch(() => {}); await p.evaluate(() => { chg = null; render(); });
  await p.click("#split-week"); await p.waitForTimeout(250); console.log(W, "7 See my week:", await p.$$eval(".sday", e => e.length), "days | back:", !!(await p.$("#split-back")));
  await p.click("#t-split"); await p.waitForTimeout(250); console.log(W, "8 tap Split tab → today again:", !!(await p.$(".stcard")));
  // swapped + logged + rest
  await p.evaluate(() => { const k = key(today()); swaps.set(myId + "|" + k, "Push"); render(); }); await p.waitForTimeout(200);
  console.log(W, "9 swapped:", await txt(p, ".stcard"));
  await p.evaluate(() => { const k = key(today()); swaps.delete(myId + "|" + k); const m = me(); m.days = { ...(m.days||{}), [k]: true }; render(); }); await p.waitForTimeout(200);
  console.log(W, "10 logged:", await txt(p, ".stcard"));
  await p.evaluate(() => { const k = key(today()); const m = me(); delete m.days[k]; const plan = [...m.plan]; plan[dow(today())] = null; m.plan = plan; render(); }); await p.waitForTimeout(200);
  console.log(W, "11 rest day:", await txt(p, ".stcard"), "| start btn:", !!(await p.$("#split-go")));
  await p.screenshot({ path: __dirname + `/shots/st_rest_${W}.png` });
  console.log(W, "sideways scroll:", await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), "| errors:", p.errs);
  await p.close(); }
  await b.close(); })();
