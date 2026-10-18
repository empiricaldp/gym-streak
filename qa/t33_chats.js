const { chromium, open } = require("./h.js");
const iso = m => new Date(Date.now() - m * 60000).toISOString();
const MSGS = `window.__messages=[{id:1,from_user:"u2",to_user:"u1",circle_id:null,body:"you coming tonight?",created_at:"${iso(30)}"},{id:2,from_user:"u1",to_user:"u2",circle_id:null,body:"yeah 6pm",created_at:"${iso(20)}"},{id:3,from_user:"u2",to_user:null,circle_id:"cA",body:"legs day boys",created_at:"${iso(10)}"}];`;
const BASE = `window.__seen=2;window.__reactions=[];try{localStorage.setItem("gs-tour-beta-2-u1","1");localStorage.setItem("gs-tip-spot-u1","1");localStorage.setItem("gs-split-guide-u1","1");}catch(e){}`;
const ok = (c, m) => console.log((c ? "PASS " : "FAIL ") + m);
(async () => {
  const b = await chromium.launch();
  { // before 030: compose works, no Edit, no delete circle
    const p = await open(b, { pre: BASE + "window.__messages=[];window.__noChatDel=1;", wait: 1500, scheme: "light" });
    await p.evaluate(() => setTab("chats")); await p.waitForTimeout(200);
    ok(await p.$("#ch-new") && !(await p.$("#ch-edit")), "no 030: new-chat button, no Edit");
    ok(!(await p.$('[data-openchat="d:u2"]')) && !!(await p.$('[data-openchat="c:cA"]')), "Buds you haven't messaged aren't listed; circles are");
    await p.click("#ch-new"); await p.waitForTimeout(150); await p.shot("c_new");
    ok(await p.$eval("#title", e => e.textContent) === "New chat", "new chat screen");
    ok(/Meha/.test(await p.$eval("#nc-list", e => e.innerText)), "Buds listed");
    await p.fill("#nc-q", "zzz"); ok(/No matches/.test(await p.$eval("#nc-list", e => e.innerText)), "search filters");
    await p.fill("#nc-q", "meh"); await p.click('#nc-list [data-openchat="d:u2"]'); await p.waitForTimeout(200);
    ok(await p.$("#chat-input") !== null, "tapping a Bud opens the chat");
    ok(p.errs.length === 0, "no errors " + p.errs.join(" | ")); await p.close(); }
  for (const [scheme, vp] of [["light", {width:390,height:844}], ["dark", {width:320,height:640}]]){
    const tag = scheme + vp.width, p = await open(b, { pre: BASE + MSGS, post: "window.__cm[1].role='admin';", wait: 1500, scheme, vp });
    await p.evaluate(() => setTab("chats")); await p.waitForTimeout(200); await p.shot("c_list_" + tag);
    ok((await p.$$eval(".chatrow", e => e.length)) === 2, `${tag} two chats (Meha + circle)`);
    await p.click("#ch-edit"); await p.waitForTimeout(150); await p.shot("c_edit_" + tag);
    await p.click('[data-chatdel="d:u2"]'); await p.waitForTimeout(150); await p.shot("c_ask_" + tag);
    ok(/Delete your chat with Meha/.test(await p.$eval("#main", e => e.innerText)), `${tag} asks first`);
    await p.click("#ch-del-yes"); await p.waitForTimeout(300);
    const cr = await p.evaluate(() => window.__cr);
    const last = await p.evaluate(() => window.__messages[1].created_at); ok(cr && cr[0].chat === "d:u2" && cr[0].cleared_at === last, `${tag} saved "deleted up to" = newest message time`);
    ok(!(await p.$('[data-chatdel="d:u2"]')) && (await p.$$eval(".chatrow", e => e.length)) === 1, `${tag} Meha chat gone from list`);
    await p.click("#ch-edit"); await p.waitForTimeout(100);
    await p.click("#ch-new"); await p.waitForTimeout(100); await p.click('#nc-list [data-openchat="d:u2"]'); await p.waitForTimeout(200);
    ok(!/you coming tonight/.test(await p.$eval("#chatlog", e => e.innerText)), `${tag} old messages hidden when reopened`);
    await p.click("#chat-back"); await p.waitForTimeout(150);
    // Meha messages again → comes back with only the new message
    await p.evaluate(() => { window.__messages.push({ id: 9, from_user: "u2", to_user: "u1", circle_id: null, body: "gym?", created_at: new Date().toISOString() }); return loadAll(); }); await p.waitForTimeout(300);
    const txt = await p.$eval("#main", e => e.innerText);
    ok(/gym\?/.test(txt) && (await p.$$eval(".chatrow", e => e.length)) === 2, `${tag} new message brings the chat back`);
    // reload: still deleted (comes from the database)
    await p.evaluate(() => { chatCleared = {}; return loadAll(); }); await p.waitForTimeout(300);   // forget it on the phone: it must come back from the database
    await p.click('[data-openchat="d:u2"]'); await p.waitForTimeout(200);
    const log = await p.$eval("#chatlog", e => e.innerText); ok(/gym\?/.test(log) && !/yeah 6pm/.test(log), `${tag} reloaded from the database: only the new message`);
    await p.click("#chat-back"); await p.waitForTimeout(150);
    // clear circle chat
    await p.click("#ch-edit"); await p.click('[data-chatdel="c:cA"]'); await p.waitForTimeout(100);
    ok(/Clear the chat in/.test(await p.$eval("#main", e => e.innerText)), `${tag} circle: clear (not leave)`);
    await p.click("#ch-del-yes"); await p.waitForTimeout(250);
    ok(/Say something to the circle/.test(await p.$eval("#main", e => e.innerText)), `${tag} circle stays, chat empty`);
    // delete circle (admin)
    await p.evaluate(() => { setTab("crew"); crewView = "circles"; circleId = "cA"; circleMode = "edit"; render(); }); await p.waitForTimeout(200);
    await p.click("#c-del"); await p.waitForTimeout(150); await p.full("c_delcircle_" + tag);
    ok(/for everyone/.test(await p.$eval("#main", e => e.innerText)), `${tag} delete circle asks first`);
    await p.click("#c-del-yes"); await p.waitForTimeout(400);
    ok(await p.evaluate(() => !circles.some(c => c.id === "cA") && !window.__circles.length), `${tag} circle deleted`);
    { const hs = await p.hscroll(); ok(hs.sw <= hs.v && !hs.bad.length, `${tag} no sideways scroll`); }
    ok(p.errs.length === 0, `${tag} no errors ${p.errs.join(" | ")}`); await p.close();
  }
  { // a member (not admin) sees no Delete circle
    const p = await open(b, { pre: BASE + MSGS, wait: 1500 });
    await p.evaluate(() => { setTab("crew"); crewView = "circles"; circleId = "cA"; render(); }); await p.waitForTimeout(200);
    ok(!(await p.$("#c-edit")), "members don't get Edit / Delete circle"); await p.close(); }
  await b.close();
})();
