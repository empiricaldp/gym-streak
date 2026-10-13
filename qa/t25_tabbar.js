// Installed-iPhone-app simulation: iPhone UA + touch + navigator.standalone = true. Measures the tab bar's position.
const { chromium, open } = require("./h.js");
const which = process.argv[2] || "new", base = which === "old" ? "http://localhost:8767" : "http://localhost:8766";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const PRE = `Object.defineProperty(Navigator.prototype,"standalone",{get:()=>true});window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
(async () => {
  const b = await chromium.launch(); const H = 844;
  const p = await open(b, { pre: PRE, wait: 1600, base, ua: UA, touch: true, vp: { width: 390, height: H } });
  const bar = () => p.evaluate(() => { const r = document.getElementById("tabbar").getBoundingClientRect(); const sc = document.getElementById("scroller");
    return { top: Math.round(r.top * 10) / 10, bottom: Math.round(r.bottom * 10) / 10, kbgap: getComputedStyle(document.documentElement).getPropertyValue("--kbgap").trim() || "0",
      pageScroll: Math.round(document.scrollingElement.scrollTop), pageScrollable: document.scrollingElement.scrollHeight > document.scrollingElement.clientHeight + 1, inner: sc ? Math.round(sc.scrollTop) : null }; });
  const scrollBy = async (dy) => { await p.mouse.move(195, 400); await p.mouse.wheel(0, dy); await p.waitForTimeout(250); };
  const log = (k, v) => console.log((which + " " + k).padEnd(38), JSON.stringify(v));
  console.log("standalone detected:", await p.evaluate(() => device.standalone && device.iphone));
  await p.evaluate(() => { crewView = "buds"; setTab("crew"); }); await p.waitForTimeout(300);   // long page (leaderboard + week board)
  log("Crew (long) at rest", await bar());
  for (const dy of [300, 600, 900]) { await scrollBy(dy); log(`scrolled +${dy}`, await bar()); }
  // what iOS does mid-scroll: tiny height changes (status bar / rubber-band). Simulate a 20px wobble while scrolling.
  await p.setViewportSize({ width: 390, height: H - 20 }); await p.waitForTimeout(150); log("height wobble -20 while scrolling", await bar());
  await p.setViewportSize({ width: 390, height: H }); await p.waitForTimeout(150); log("height back", await bar());
  await scrollBy(5000); const reach = await p.evaluate(() => { const last = [...document.querySelectorAll("#main .view > *")].pop(); return { lastBottom: Math.round(last.getBoundingClientRect().bottom), barTop: Math.round(document.getElementById("tabbar").getBoundingClientRect().top) }; });
  log("scrolled to the very bottom", { ...(await bar()), lastContentBottom: reach.lastBottom, clearOfBar: reach.lastBottom <= reach.barTop });
  await p.screenshot({ path: __dirname + `/shots/tb_${which}_bottom.png` });
  // switch tabs: new tab should start at the top, bar unchanged
  for (const t of ["chats", "today", "split", "you"]) { await p.click("#t-" + t); await p.waitForTimeout(300); log(`tab → ${t}`, await bar()); }
  // short page: Chats
  await p.click("#t-chats"); await p.waitForTimeout(300); await scrollBy(400); log("Chats (short), tried to scroll", await bar());
  // menu open/close: profile ⋯ sheet
  await p.evaluate(() => openProfile("u2")); await p.waitForTimeout(300);
  if (await p.$(".pfmore")) { await p.click(".pfmore"); await p.waitForTimeout(250); log("⋯ menu open", await bar()); await p.click(".chgsheet [data-sfclose]"); await p.waitForTimeout(250); log("⋯ menu closed", await bar()); }
  // keyboard: focus Everyone search, iOS shrinks the screen ~300px, type, then dismiss
  await p.evaluate(() => { profileId = null; crewView = "everyone"; setTab("crew"); }); await p.waitForTimeout(300);
  await p.focus("#find-q"); await p.setViewportSize({ width: 390, height: H - 300 }); await p.waitForTimeout(200); await p.keyboard.type("me"); await p.waitForTimeout(400);
  log("keyboard open (typing)", await bar());
  await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: 390, height: H }); await p.waitForTimeout(1200);
  log("keyboard dismissed", await bar());
  // iOS keyboard bug: screen stays 59px short after the keyboard closes → bar must be pushed onto the real bottom
  await p.focus("#find-q"); await p.setViewportSize({ width: 390, height: H - 300 }); await p.waitForTimeout(200);
  await p.evaluate(() => document.activeElement.blur()); await p.setViewportSize({ width: 390, height: H - 59 }); await p.waitForTimeout(1200);
  log("iOS 59px bug after keyboard", await bar());
  console.log("errors:", p.errs);
  await b.close();
})();
