const { chromium, open } = require("./h.js");
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
const font = `@font-face{font-family:Archivo;src:url(data:font/ttf;base64,${require("./h.js").fontB64()});font-weight:100 900;font-stretch:62% 125%}`;
const SEED = `(()=>{const k=n=>{const d=new Date();d.setDate(d.getDate()-n);return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
window.__meals=[{id:"a",day:k(0),kind:"breakfast",name:null,amount:400,unit:"kcal",protein_g:20,carbs_g:null,fat_g:null,created_at:new Date().toISOString()},
{id:"b",day:k(2),kind:"lunch",name:"Butter chicken",amount:900,unit:"kcal",protein_g:45,carbs_g:80,fat_g:35,created_at:new Date(Date.now()-2*864e5).toISOString()},
{id:"c",day:k(2),kind:"snack",name:"Shake",amount:null,unit:null,protein_g:30,carbs_g:10,fat_g:5,created_at:new Date(Date.now()-2*864e5).toISOString()},
{id:"d",day:k(9),kind:"dinner",name:"Old",amount:700,unit:"kcal",protein_g:null,carbs_g:null,fat_g:null,created_at:new Date(Date.now()-9*864e5).toISOString()}];})();`;
const BASE = `window.__seen=2;window.__reactions=[];window.__messages=[];try{localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}` + SEED;
(async () => { const b = await chromium.launch();
  for (const [scheme, vp] of [["dark",{width:390,height:844}],["light",{width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE, wait: 1500, scheme, vp }); await p.addStyleTag({ content: font });
    await p.click("#hhealth"); await p.waitForTimeout(200); await p.click('[data-hgo="cal"]'); await p.waitForTimeout(150);
    const name = () => p.$eval("#h-dayname", e => e.textContent), num = () => p.$eval(".hcalnum", e => e.textContent);
    ok(await name() === "Today" && await p.$eval("#h-next", e => e.disabled) && await num() === "400", `${tag} starts on Today, 400, next disabled`);
    await p.click("#h-prev"); await p.waitForTimeout(100); ok(await name() === "Yesterday" && await num() === "0", `${tag} yesterday 0`);
    ok(/Nothing logged/.test(await p.$eval(".hlist", e => e.innerText)) && !(await p.$("#h-addmeal")), `${tag} empty day message, no Add meal`);
    await p.click("#h-prev"); await p.waitForTimeout(100);
    ok(await num() === "900", `${tag} 2 days ago only typed = 900 (${await num()})`);
    ok(await p.$$eval("[data-meal]", e => e.length) === 0 && await p.$$eval(".hpast", e => e.length) === 2, `${tag} past rows are view only`);
    ok(/View only/i.test(await p.$eval(".hsechead", e => e.innerText)), `${tag} says view only`);
    await p.click(".hpast >> nth=0"); await p.waitForTimeout(150); ok(!(await p.$("#mealwrap")), `${tag} tapping past meal does nothing`);
    await p.full(`wk_cal_${tag}`);
    for (let i = 0; i < 8; i++) if (!(await p.$eval("#h-prev", e => e.disabled))) await p.click("#h-prev");
    ok(await p.evaluate(() => hBackDays) === 6, `${tag} stops at 6 days back`);
    await p.click("#h-back"); await p.waitForTimeout(150); await p.click('[data-hgo="mac"]'); await p.waitForTimeout(150);
    ok(await p.$eval("#h-dayname", e => e.textContent) === "Today", `${tag} Macros opens on today`);
    await p.click("#h-prev"); await p.click("#h-prev"); await p.waitForTimeout(100);
    ok(/PROTEIN 75/i.test(await p.$eval(".hmacs", e => e.innerText.replace(/\s+/g, " "))), `${tag} macros 2 days ago protein 75`);
    await p.full(`wk_mac_${tag}`);
    ok((await p.hscroll()).sw <= vp.width, `${tag} no sideways scroll`); ok(p.errs.length === 0, `${tag} no errors ` + p.errs.join("|")); await p.close(); }
  await b.close(); })();
