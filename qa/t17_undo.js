const { chromium, open } = require("./h.js");

// new workout screen (b48): opening a workout shows "Start Workout" first
async function woGo(p){ if (await p.$("#wo-start")){ await p.click("#wo-start"); await p.waitForTimeout(250); } }
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const log = (...a) => console.log(...a);
(async () => { const b = await chromium.launch(); const p = await open(b, { pre: BASE, wait: 1500 });
  const txt = s => p.$eval(s, e => e.innerText.replace(/\n/g, " ").trim()).catch(() => "(missing)");
  await p.click("#wo-go"); await p.waitForTimeout(300);
  await woGo(p); if (await p.$('[data-tses="start"]')) await p.click('[data-tses="start"]'); await p.evaluate(() => { const w = myWo(woDay); w.session_run_at = new Date(Date.now() - 125000).toISOString(); }); await p.waitForTimeout(600);
  await p.click('[data-tses="pause"]'); await p.waitForTimeout(300);
  log("A paused:", await txt(".whstate"), await txt("#ses-t"), "| Reset link shown:", !!(await p.$('[data-tses="reset"]')));
  await p.click('[data-tses="reset"]'); await p.waitForTimeout(300);
  log("B Reset link → timer:", await txt("#ses-t"), "| Reset link gone:", !(await p.$('[data-tses="reset"]')));
  await woGo(p); if (await p.$('[data-tses="start"]')) await p.click('[data-tses="start"]'); await p.evaluate(() => { const w = myWo(woDay); w.session_run_at = new Date(Date.now() - 300000).toISOString(); }); await p.waitForTimeout(600);
  await p.click('[data-tses="pause"]'); await p.click('[data-tickset="0:0"]'); await p.waitForTimeout(200); await p.click('[data-trest="skip"]').catch(()=>{});
  await woGo(p); await p.click("#wo-finish"); await p.waitForTimeout(900); await p.click("#sum-done"); await p.waitForTimeout(400);
  log("C finished by mistake → Today:", await txt("#logbtn"), "|", await txt("#wo-go"));
  await p.waitForTimeout(600); await p.click("#logbtn"); await p.waitForTimeout(800);
  log("D undo the log:", await txt("#logbtn"), "|", await txt("#wo-go"));
  await p.waitForTimeout(2200); log("  toast:", await txt("#toast"));
  const w = await p.evaluate(() => __workouts.find(x => x.user_id === "u1" && x.day === key(today())));
  log("  saved: finished =", w.finished_at, "| timer ms =", w.session_ms, "| ticks left =", JSON.stringify(w.exercises.map(e => [e.done, e.sets.filter(s => s.done).length])), "| exercises kept:", w.exercises.map(e => e.name).join(","));
  await p.click("#wo-go"); await p.waitForTimeout(300);
  log("E reopen workout → fresh start screen:", !!(await p.$("#wo-start")), "| card:", await txt(".whcard"), "| exercises kept:", await txt(".whblock:last-of-type"));
  log("errors:", p.errs); await b.close(); })();
