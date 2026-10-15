// node tests/streak-history.test.js -- exercises the real app functions, not a copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
class Clock extends Date {
  constructor(...args){ super(...(args.length ? args : ['2026-10-15T12:00:00'])); }
}
for (const file of ['app.js', 'beta/app.js']) {
  const src = fs.readFileSync(file, 'utf8');
  const start = src.indexOf('const pad =');
  const end = src.indexOf('// ================= State');
  const ctx = vm.createContext({Date: Clock});
  vm.runInContext(src.slice(start, end) + '\nthis.api={parse,key,addDays,planAt,slot,isGym,dayStreakAt,dayStreak,bestStreak,weekStats,weeksDone,swaps};', ctx);
  const a = ctx.api, gym = () => ({w:'Gym day', opt:false});
  const old = [null, gym(), gym(), gym(), gym(), gym(), gym()];
  const reduced = old.map((s,i) => i === 3 ? null : s);
  const m = {id:'me', plan:reduced, since:'2026-08-24', trackStart:'2026-10-05', days:{}, frozen:{},
    splitHistory:[{effective_from:'2026-08-24',plan:old},{effective_from:'2026-10-14',plan:reduced}]};
  for (let d=a.parse('2026-10-05'); d<=a.parse('2026-10-15'); d=a.addDays(d,1)) m.days[a.key(d)]=1;
  assert.equal(a.dayStreak(m),44, `${file}: six-day past plus two new planned days`);
  assert.equal(a.bestStreak(m),44);
  assert.equal(a.dayStreak({...m,splitHistory:[]}),37, 'reproduces the reported bug');
  assert.equal(a.weekStats(m,a.parse('2026-10-05')).target,6);
  assert.equal(a.weekStats(m,a.parse('2026-10-05')).hit,6);
  assert.equal(a.weekStats(m,a.parse('2026-10-12')).target,5);
  assert.equal(a.weekStats(m,a.parse('2026-10-12')).bonus,2);
  assert.equal(a.weeksDone(m),7);
  assert.equal(a.dayStreakAt(m,a.parse('2026-10-11')),42, 'historic recap retains original count');
  assert.equal(a.isGym(m,a.parse('2026-10-08')),true);
  assert.equal(a.isGym(m,a.parse('2026-10-15')),false);
  const lost = {...m,days:{...m.days}}; delete lost.days['2026-10-07'];
  assert.equal(a.dayStreak(lost),6,'real missed days still break the streak');
  assert.equal(a.dayStreak({...lost,frozen:{'2026-10-07':1}}),43,'freeze preserves continuity without adding a session');
  const optional = old.map((s,i)=>i===3?{w:'Cardio',opt:true}:s);
  assert.equal(a.isGym({...m,splitHistory:[{effective_from:m.since,plan:optional}]},a.parse('2026-10-08')),false);
  const increase = {...m, plan:old, splitHistory:[{effective_from:m.since,plan:reduced},{effective_from:'2026-10-16',plan:old}]};
  assert.equal(a.dayStreak(increase),37,'adding a gym day never creates retroactive missed days');
  assert.equal(a.isGym(increase,a.parse('2026-10-15')),false,'today retains old split');
  assert.equal(a.isGym(increase,a.parse('2026-10-22')),true,'future dates use the saved split');
  a.swaps.set('me|2026-10-15','Push');
  assert.equal(a.dayStreak({...m}),45,'dated swaps override dated plans');
  a.swaps.clear();
  console.log(`PASS ${file}: recovery, reduced/increased frequency, historical recaps, missed days, freezes, bonuses, optional days and swaps`);
}
