// shared harness
const { chromium } = require("playwright");
const Q = __dirname, SH = Q + "/shots/"; try { require("fs").mkdirSync(SH, { recursive: true }); } catch(e){}
async function open(b, o = {}){
  const ctx = await b.newContext({ viewport: o.vp || {width:390,height:844}, deviceScaleFactor: 2, colorScheme: o.scheme || "dark", hasTouch: !!o.touch, userAgent: o.ua });
  const p = await ctx.newPage(); p.errs = [];
  p.on("pageerror", e => p.errs.push("PAGEERROR " + e.message));
  p.on("console", m => { if (m.type() === "error" && !/fonts\.g|Failed to load resource/.test(m.text())) p.errs.push("CONSOLE " + m.text()); });
  p.on("dialog", d => { p.errs.push("DIALOG " + d.message()); d.dismiss(); });
  await p.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ body: "", contentType: "text/javascript" }));
  await p.route("https://fonts.**", r => r.fulfill({ body: "", contentType: "text/css" }));
  await p.addInitScript(o.pre || `window.__seen = 1; window.__reactions = []; window.__messages = [];`);
  if (!o.tour) await p.addInitScript(() => { try { localStorage.setItem("gs-tour-beta-4c-u1", "1"); localStorage.setItem("gs-tour-acct-4-u1", "1"); if (!localStorage.getItem("gs-push-snooze")) localStorage.setItem("gs-push-snooze", String(Date.now() + 864e5)); } catch(e){} });   // + no "turn on notifications" prompt (main app) unless a test wants it   // b54 update screens: off unless a test wants them
  await p.addInitScript({ path: Q + "/stub_chat.js" });
  if (o.post) await p.addInitScript(o.post);
  await p.goto((o.base || process.env.QBASE || "http://localhost:8766") + (process.env.QPATH || "/beta/index.html") + (o.hash || "")); await p.waitForTimeout(o.wait || 1000);
  p.shot = n => p.screenshot({ path: SH + n + ".png" });
  p.full = n => p.screenshot({ path: SH + n + ".png", fullPage: true });
  p.hscroll = () => p.evaluate(() => { const w = document.documentElement.scrollWidth, v = innerWidth; const bad = [...document.querySelectorAll("#main *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > v + 1 || r.left < -1); }).slice(0,5).map(e => e.tagName + "." + e.className + ":" + Math.round(e.getBoundingClientRect().right) + " " + (e.textContent||"").slice(0,30)); return { sw: w, v, bad }; });
  // elements whose text is clipped (scrollWidth > clientWidth) and not ellipsis-intended
  p.clipped = () => p.evaluate(() => [...document.querySelectorAll("#main *")].filter(e => e.children.length === 0 && e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible" && e.clientWidth > 0).slice(0,8).map(e => e.tagName + "." + e.className + " [" + getComputedStyle(e).textOverflow + "] " + (e.textContent||"").slice(0,40)));
  return p;
}
// Real Archivo font for screenshots (DP wants real fonts, not fallbacks): put Archivo.ttf (Google Fonts, OFL) in qa/font/ or set CREW_FONT
function fontB64(){ const fs = require("fs"), p = process.env.CREW_FONT || Q + "/font/Archivo.ttf"; try { return fs.readFileSync(p).toString("base64"); } catch(e){ return ""; } }
module.exports = { chromium, open, Q, SH, fontB64 };
