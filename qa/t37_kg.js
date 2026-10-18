const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => { const b = await chromium.launch();
  for (const u of ["kg", "lb"]){
    const p = await open(b, { pre: `window.__seen=2;window.__messages=[];window.__reactions=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`, post: `window.__profile.weight_unit="${u}";`, wait: 1500, touch: true });
    await p.evaluate(() => { editPlan("Push", "back"); woPlan.exercises = [{ name: "Tbar Row", done: false, sets: [{ reps: 10, kg: 100 }, { reps: 10, kg: 100 }, { reps: 8, kg: 90 }] }]; render(); }); await p.waitForTimeout(300);
    const f = await p.$("[data-kg='0:0']"); if (!f){ ok(false, u + " no weight field (layout?)"); await p.close(); continue; }
    ok(await f.evaluate(e => e.tagName === "INPUT" && e.inputMode === "decimal"), `${u}: weight is a typing field with the number keypad`);
    await f.fill(u === "kg" ? "112.5" : "247,5"); await f.press("Enter"); await p.waitForTimeout(300);
    const sets = await p.evaluate(() => woPlan.exercises[0].sets.map(s => s.kg));
    ok(u === "kg" ? sets[0] === 112.5 && sets[1] === 112.5 && sets[2] === 90 : Math.abs(sets[0] - 112.264) < 0.01 && sets[2] === 90, `${u}: saved ${JSON.stringify(sets)} (set 2 follows, set 3 untouched)`);
    ok(await p.$eval("[data-kg='0:0']", e => e.value) === (u === "kg" ? "112.5" : "247.5"), `${u}: shows what you typed`);
    const g = await p.$("[data-kg='0:2']"); await g.fill("abc"); await g.press("Enter"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => woPlan.exercises[0].sets[2].kg) === 90, `${u}: nonsense ignored`);
    const h = await p.$("[data-kg='0:2']"); await h.fill(""); await h.press("Enter"); await p.waitForTimeout(200);
    ok(await p.evaluate(() => woPlan.exercises[0].sets[2].kg) === null, `${u}: clearing it = no weight`);
    ok(p.errs.length === 0, `${u}: no errors ${p.errs.join(" | ")}`); await p.shot("kg_" + u); await p.close(); }
  await b.close(); })();
