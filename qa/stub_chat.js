// Fake Supabase for the beta: an in-memory "people" view + buds that react to inserts/deletes. Records every write.
(() => {
  const me = "u1", t = new Date();
  const k = d => d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
  const ago = n => { const d = new Date(t); d.setDate(d.getDate()-n); return k(d); };
  const plan = [{w:"Push",opt:false},{w:"Pull",opt:false},{w:"Legs",opt:false},{w:"Upper Body",opt:false},{w:"Lower Body",opt:false},{w:"Full Body",opt:false},null];
  const P = (id,name,plate,o={}) => ({ id, name, plate, plan, since:ago(60), track_start:ago(20), created_at:"2026-09-01", private:false, visible:true, split_hidden:false, account:null, seen_update:1, i_bud:null, they_bud:null, ...o });
  window.__people = [
    ...(window.__noprofile ? [] : [P(me,"DP","red",{ seen_update: window.__seen ?? 0 })]),
    P("u2","Meha","pink",{ i_bud:"accepted", they_bud:"accepted" }),
    P("x0","Dev","blue"),
    P("x1","Alishaa","red",{ private:true }),   // private, but a circle-mate → visible
    P("x2","Jiya","lavender",{ private:true, visible:false, plan:null, since:null, track_start:null, they_bud:"pending" }),
    P("x3","Nothing","yellow",{ split_hidden:true, plan: plan.map(s => s && {w:null,opt:false}), n_buds:3, n_spotting:2, n_spotters:5 }),
    P("x4","Kavya","pink",{ they_bud:"accepted" }),
  ];
  const checkins = window.__checkins = [];
  for (let i=1;i<=6;i++) checkins.push({user_id:"u2",day:ago(i)},{user_id:"x0",day:ago(i)},{user_id:me,day:ago(i)});
  checkins.push({user_id:"x3",day:ago(0)},{user_id:"x3",day:ago(1)});
  window.__writes = [];
  const lab = (plan[(t.getDay()+6)%7] || {}).w || "Bonus session";
  window.__plans = window.__noPlan ? [] : [{ label: lab, exercises: [
      { name: "Lat pulldown", sets: [{reps:10,kg:55},{reps:10,kg:55},{reps:8,kg:55}] },
      { name: "Barbell row", sets: [{reps:8,kg:60},{reps:8,kg:60},{reps:8,kg:60}] } ] }];
  window.__workouts = window.__noWo ? [] : [
    { user_id: me, day: ago(7), label: lab, finished_at: "x", started_at: "x", active_at: "x", exercises: [
      { name: "Lat pulldown", done: true, sets: [{reps:10,kg:55},{reps:10,kg:55},{reps:8,kg:55}] },
      { name: "Barbell row", done: true, sets: [{reps:8,kg:60},{reps:8,kg:60},{reps:8,kg:60}] } ] },
    { user_id: "u2", day: ago(1), label: "Legs", finished_at: "x", started_at: "x", active_at: "x", exercises: [
      { name: "Squat", done: true, sets: [{reps:5,kg:80},{reps:5,kg:80},{reps:5,kg:80}] },
      { name: "Leg press", done: true, sets: [{reps:12,kg:140},{reps:10,kg:160}] },
      { name: "Calf raise", done: false, sets: [] } ] } ];
  window.__circles = [{ id:"cA", name:"Morning crew", emoji:"🌅", invite_code:"abcdef1234", created_by:"u2", created_at:"2026-10-01" }];
  window.__cm = [{circle_id:"cA",user_id:"u2",role:"admin",muted:false,added_by:null,joined_at:"2026-10-01"},
                 {circle_id:"cA",user_id:me,role:"member",muted:false,added_by:"u2",joined_at:"2026-10-02"},
                 {circle_id:"cA",user_id:"x1",role:"member",muted:false,added_by:"u2",joined_at:"2026-10-03"}];
  window.__other = { id:"cB", name:"Uni lifters", emoji:"🦍", invite_code:"fedcba9876", created_by:"x0", created_at:"2026-10-05" };
  window.__profile = {rest_s:90,rest_auto:true,weight_unit:"kg",goal:null,goals:["bulk"],height_cm:180,trained_since:"2023-10-09",notif_nudge:true,notif_react:true,notif_crew:false,notif_remind:true,remind_at:"19:00:00"};
  const row = id => __people.find(p => p.id === id);
  const q = (table) => { const st = {op:"select", vals:null, eqs:{}};
    const res = () => {
      if (st.op !== "select"){ __writes.push({table, op:st.op, vals:st.vals, eqs:st.eqs});
        if (table === "chat_reads" && st.op === "upsert"){ window.__cr = (window.__cr||[]).filter(x => x.chat !== st.vals.chat); __cr.push({ ...st.vals }); }
        if (table === "meals"){ window.__meals = window.__meals || [];
          if (st.op === "insert"){ const r = { ...st.vals, id: "m" + (__meals.length + 1) + Math.random().toString(36).slice(2,6), created_at: new Date().toISOString() }; __meals.push(r); return {data:{...r}, error:null}; }
          if (st.op === "update"){ const r = __meals.find(x => x.id === st.eqs.id); Object.assign(r, st.vals); return {data:{...r}, error:null}; }
          if (st.op === "delete"){ window.__meals = __meals.filter(x => x.id !== st.eqs.id); return {data:null, error:null}; } }
        if (table === "bodyweight" && st.op === "upsert"){ window.__bw = (window.__bw||[]).filter(x => x.day !== st.vals.day); __bw.push({ day: st.vals.day, kg: st.vals.kg }); }
        if (table === "profiles" && st.op === "update" && Object.keys(st.vals).some(k => /^cal_|^energy_unit|^height_cm|_goal$/.test(k))) Object.assign(window.__profile, st.vals);
        if (table === "messages" && st.op === "insert"){ const r = { ...st.vals, id: 1000 + __messages.length, created_at: new Date().toISOString() }; __messages.push(r); return {data:[{id:r.id, created_at:r.created_at}], error:null}; }
        if (table === "workouts" && st.op === "upsert"){ if (window.__woFail && window.__woFail-- > 0) return {data:null, error:{message:"TypeError: Load failed"}};
          const i = __workouts.findIndex(w => w.user_id === st.vals.user_id && w.day === st.vals.day), old = __workouts[i] || {};
          const r = { ...old, ...JSON.parse(JSON.stringify(st.vals)), finished_at: old.finished_at || (st.vals.finished_at ? new Date().toISOString() : null) };
          if (i >= 0) __workouts[i] = r; else __workouts.push(r); }
        if (table === "workout_plans" && st.op === "upsert"){ const k = String(st.vals.label).trim().toLowerCase();
          window.__plans = __plans.filter(x => String(x.label).trim().toLowerCase() !== k); __plans.push(JSON.parse(JSON.stringify(st.vals))); }
        if (table === "profiles" && st.op === "update" && "weight_unit" in st.vals) window.__profile.weight_unit = st.vals.weight_unit;
        if (table === "workouts" && st.op === "update"){ const w = __workouts.find(x => x.user_id === st.eqs.user_id && x.day === st.eqs.day); if (w) Object.assign(w, JSON.parse(JSON.stringify(st.vals))); }
        if (table === "checkins" && st.op === "delete") window.__checkins.splice(0, window.__checkins.length, ...window.__checkins.filter(c => !(c.user_id === st.eqs.user_id && c.day === st.eqs.day)));
        if (table === "blocks" && st.op === "insert"){ window.__blocks = (window.__blocks||[]); __blocks.push({ ...st.vals }); window.__people = __people.filter(p => p.id !== st.vals.blocked); }
        if (table === "blocks" && st.op === "delete") window.__blocks = (window.__blocks||[]).filter(b => !(b.blocker === st.eqs.blocker && b.blocked === st.eqs.blocked));
        if (table === "reports" && st.op === "insert"){ window.__reports = (window.__reports||[]); __reports.push({ ...st.vals }); }
        if (table === "rest_alarms" && st.op === "upsert") window.__alarm = { ...st.vals };
        if (table === "rest_alarms" && st.op === "delete") window.__alarm = null;
        if (table === "profiles" && st.op === "update" && ("rest_s" in st.vals || "rest_auto" in st.vals)) Object.assign(window.__profile, st.vals);
        if (table === "day_swaps" && st.op === "upsert"){ window.__swaps = (window.__swaps||[]).filter(x => !(x.user_id === st.vals.user_id && x.day === st.vals.day)); __swaps.push({ ...st.vals }); }
        if (table === "day_swaps" && st.op === "delete") window.__swaps = (window.__swaps||[]).filter(x => !(x.user_id === st.eqs.user_id && x.day === st.eqs.day));
        if (table === "profiles" && st.op === "update" && "plan" in st.vals){ const r = row(me); r.plan = JSON.parse(JSON.stringify(st.vals.plan)); }
        if (table === "workouts" && st.op === "delete") window.__workouts = __workouts.filter(w => !(w.user_id === st.eqs.user_id && w.day === st.eqs.day));
        if (table === "checkins" && st.op === "upsert" && !checkins.some(c => c.user_id === st.vals.user_id && c.day === st.vals.day)) checkins.push({ ...st.vals });
        if (table === "buds" && st.op === "insert"){ const r = row(st.vals.followee); if (r) r.i_bud = r.private ? "pending" : "accepted"; }
        if (table === "buds" && st.op === "delete"){ if (st.eqs.follower === me){ const r = row(st.eqs.followee); if (r) r.i_bud = null; } else { const r = row(st.eqs.follower); if (r) r.they_bud = null; } }
        if (table === "profiles" && st.op === "update" && window.__fail && window.__fail.left > 0){
          window.__fail.left--; if (window.__fail.land){ const r = row(me); if ("seen_update" in st.vals) r.seen_update = st.vals.seen_update; if ("account" in st.vals){ r.private = st.vals.account === "private"; window.__profile.account = st.vals.account; } if ("hide_split" in st.vals) window.__profile.hide_split = st.vals.hide_split; if ("seen_update" in st.vals) window.__profile.seen_update = st.vals.seen_update; }
          return {data:null, error:{message:"TypeError: Load failed"}}; }
        if (table === "profiles" && st.op === "update"){ const r = row(me); if ("account" in st.vals) window.__profile.account = st.vals.account; if ("hide_split" in st.vals) window.__profile.hide_split = st.vals.hide_split; if ("seen_update" in st.vals) window.__profile.seen_update = st.vals.seen_update; if ("seen_update" in st.vals) r.seen_update = st.vals.seen_update;
          if ("account" in st.vals) r.private = st.vals.account === "private"; if ("hide_split" in st.vals) r.split_hidden = st.vals.hide_split; }
        return {data:null,error:null}; }
      const narrow = rows => rows.filter(r => (!st.ins || st.ins.v.includes(r[st.ins.c])) && (!st.like || new RegExp(st.like.v.replace(/%/g, ".*"), "i").test(r[st.like.c]))).slice(0, st.lim || 1e9);
      window.__reads = (window.__reads || []); if (st.ins || st.like) __reads.push({ table, ins: st.ins && st.ins.v.length, like: st.like && st.like.v });
      if (table === "people") return {data: narrow(__people.map(p => ({...p}))), error:null};
      if (table === "chat_reads"){ if (window.__noChatDel && /cleared_at/.test(st.cols||"")) return {data:null, error:{message:'column chat_reads.cleared_at does not exist'}}; if (window.__cr) return {data: JSON.parse(JSON.stringify(__cr)), error:null}; }
      if ((table === "meals" || table === "profiles") && window.__noMacros && /protein_/.test(st.cols||"")) return {data:null, error:{message:'column meals.protein_g does not exist'}};
      if (table === "meals") return window.__noHealth ? {data:null, error:{message:'relation "public.meals" does not exist'}} : {data: JSON.parse(JSON.stringify(window.__meals||[])), error:null};
      if (table === "bodyweight") return {data: JSON.parse(JSON.stringify(window.__bw||[])), error:null};
      if (table === "profiles" && window.__noHealth && /cal_goal/.test(st.cols||"")) return {data:null, error:{message:'column profiles.cal_goal does not exist'}};
      if (table === "profiles") return {data:{...__profile}, error:null};
      if (table === "checkins") return {data: narrow(checkins), error:null};
      if (table === "nudges") return {data: (window.__nudges||[]).filter(x => !st.eqs.from_user || x.from_user === st.eqs.from_user), error:null};
      if (table === "reactions") return {data: window.__reactions||[], error:null};
      if (table === "messages") return {data: window.__messages||[], error:null};
      if (table === "blocks") return {data: (window.__blocks||[]).map(b => ({ blocked: b.blocked })), error:null};
      if (table === "day_swaps") return {data: JSON.parse(JSON.stringify(window.__swaps||[])), error:null};
      if (table === "workout_plans") return {data: JSON.parse(JSON.stringify(__plans)), error:null};
      if (table === "workouts") return {data: JSON.parse(JSON.stringify(__workouts)), error:null};
      if (table === "chat_reads") return {data: window.__reads||[], error:null};
      if (table === "circles") return {data: __circles.filter(c => __cm.some(m => m.circle_id === c.id && m.user_id === me)), error:null};
      if (table === "circle_members") return {data: __cm.filter(m => __cm.some(x => x.circle_id === m.circle_id && x.user_id === me)), error:null};
      return {data: [], error:null}; };
    const b = { select(c){ if (st.op === "select") st.cols = c; return b;}, single(){return Promise.resolve(res());}, in(c,v){ st.ins={c,v}; return b;}, ilike(c,v){ st.like={c,v}; return b;}, limit(n){ st.lim=n; return b;}, eq(c,v){ st.eqs[c]=v; return b;}, gte(){return b;}, order(){return b;}, match(){return b;}, range(){return Promise.resolve(res());},
      maybeSingle(){return Promise.resolve(res());}, update(v){st.op="update";st.vals=v;return b;}, upsert(v){st.op="upsert";st.vals=v;return b;}, insert(v){st.op="insert";st.vals=v;return b;}, delete(){st.op="delete";return b;},
      then(f,r){return Promise.resolve(res()).then(f,r);} };
    return b; };
  const session = {user:{id:me,email:"dp@example.com"}, access_token:"tok"};
  window.supabase = { createClient: () => ({
    from: q,
    rpc: async (fn, args) => { __writes.push({rpc:fn, args});
      if (fn === "accept_bud"){ const r = row(args.p_follower); if (r) r.they_bud = "accepted"; }
      if (fn === "name_taken") return {data:false,error:null};
      if (fn === "delete_circle"){ if (!__cm.some(m => m.circle_id === args.p_circle && m.user_id === me && m.role === "admin")) return {data:null,error:{message:"only admins can delete a circle"}}; window.__circles = __circles.filter(c => c.id !== args.p_circle); window.__cm = __cm.filter(m => m.circle_id !== args.p_circle); window.__messages = (window.__messages||[]).filter(m => m.circle_id !== args.p_circle); return {data:null,error:null}; }
      if (fn === "my_blocks") return {data:(window.__blocks||[]).map(b => ({ id: b.blocked, name: b.blocked === "u2" ? "Meha" : b.blocked, plate: "pink" })),error:null};
      const now = new Date().toISOString();
      if (fn === "create_circle"){ const id = "c" + Math.random().toString(36).slice(2,6);
        __circles.push({ id, name:args.p_name, emoji:args.p_emoji, invite_code:"0123456789", created_by:me, created_at:now });
        __cm.push({circle_id:id,user_id:me,role:"admin",muted:false,added_by:null,joined_at:now});
        args.p_members.forEach(u => __cm.push({circle_id:id,user_id:u,role:"member",muted:false,added_by:me,joined_at:now})); return {data:id,error:null}; }
      if (fn === "add_to_circle"){ args.p_members.forEach(u => __cm.push({circle_id:args.p_circle,user_id:u,role:"member",muted:false,added_by:me,joined_at:now})); return {data:null,error:null}; }
      if (fn === "remove_from_circle"){ window.__cm = __cm.filter(m => !(m.circle_id === args.p_circle && m.user_id === args.p_user)); return {data:null,error:null}; }
      if (fn === "set_circle_role"){ __cm.find(m => m.circle_id === args.p_circle && m.user_id === args.p_user).role = args.p_role; return {data:null,error:null}; }
      if (fn === "mute_circle"){ __cm.find(m => m.circle_id === args.p_circle && m.user_id === me).muted = args.p_muted; return {data:null,error:null}; }
      if (fn === "edit_circle"){ Object.assign(__circles.find(c => c.id === args.p_circle), { name:args.p_name, emoji:args.p_emoji }); return {data:null,error:null}; }
      if (fn === "leave_circle"){ window.__cm = __cm.filter(m => !(m.circle_id === args.p_circle && m.user_id === me)); return {data:null,error:null}; }
      if (fn === "circle_preview"){ const c = args.p_code === __other.invite_code ? __other : null;
        return {data: c ? [{ id:c.id, name:c.name, emoji:c.emoji, members:7, already:false }] : [], error:null}; }
      if (fn === "join_circle"){ __circles.push(__other); __cm.push({circle_id:__other.id,user_id:me,role:"member",muted:false,added_by:null,joined_at:now},{circle_id:__other.id,user_id:"x0",role:"admin",muted:false,added_by:null,joined_at:"2026-10-05"}); return {data:__other.id,error:null}; }
      return fn === "member_count" ? {data:6,error:null} : {data:null,error:null}; },
    auth: { onAuthStateChange(cb){ setTimeout(() => cb("INITIAL_SESSION", window.__nosession ? null : session), 50); return {data:{subscription:{unsubscribe(){}}}}; },
            getSession: async () => ({data:{session: window.__nosession ? null : session}}), signOut: async () => {} },
    channel(){ const c = {on(){return c;}, subscribe(){return c;}}; return c; },
  })};
})();
