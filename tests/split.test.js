// Run with: node tests/split.test.js
const { normalizeWorkout: n } = require("../split.js");
const cases = [
  ["back bicep", "Back + Biceps"], ["Back Bicep", "Back + Biceps"], ["BACK & BI'S", "Back + Biceps"],
  ["chest tricep", "Chest + Triceps"], ["chest and tris", "Chest + Triceps"], ["Chest+Tri", "Chest + Triceps"],
  ["leg shoulder", "Legs + Shoulders"], ["legs/shoulders", "Legs + Shoulders"], ["len shoulder", "Legs + Shoulders"],
  ["legs day", "Legs"], ["leg day", "Legs"], ["push", "Push"], ["PULL", "Pull"],
  ["glutes and hamstrings", "Glutes + Hamstrings"], ["glutes n hammies", "Glutes + Hamstrings"],
  ["quads and calves", "Quads + Calves"], ["chest tricep shoulder", "Chest + Triceps + Shoulders"],
  ["core", "Core"], ["abs", "Abs"], ["rest", ""], ["Rest day", ""], ["off", ""], ["", ""], ["  ", ""],
  ["upper body", "Upper Body"], ["upper", "Upper Body"], ["full body", "Full Body"], ["fullbody", "Full Body"],
  ["chest, back, arms", "Chest + Back + Arms"], ["delts + traps", "Shoulders + Traps"],
  ["back back bicep", "Back + Biceps"], ["cardio run", "Cardio"], ["hiit", "HIIT"],
  ["bulgarian split squats", "Bulgarian Split Squats"], ["chest with triceps", "Chest + Triceps"],
  ["shoulders & abs", "Shoulders + Abs"], ["back n bi", "Back + Biceps"],
  // typos
  ["bicpes", "Biceps"], ["chets tricpes", "Chest + Triceps"], ["hamstrng", "Hamstrings"], ["sholder", "Shoulders"],
  ["glutse", "Glutes"], ["calfes", "Calves"], ["shoudlers", "Shoulders"],
  // must NOT be "corrected"
  ["boxing", "Boxing"], ["spin class", "Cycling"], ["deadlifts", "Deadlifts"], ["squats", "Squats"], ["bench press", "Bench Press"],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = n(input);
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${JSON.stringify(input).padEnd(28)} -> ${JSON.stringify(got)}${ok ? "" : "   (wanted " + JSON.stringify(want) + ")"}`);
}
console.log(`\n${cases.length - fail}/${cases.length} passed`);
process.exit(fail ? 1 : 0);
