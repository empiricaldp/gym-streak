// split.js: turns whatever people type for a workout day into one tidy, standard label.
//   "back bicep"        -> "Back + Biceps"
//   "CHEST & TRIS"      -> "Chest + Triceps"
//   "legs/shoulder day" -> "Legs + Shoulders"
//   "rest" / "off" / "" -> ""  (empty = rest day)
// How it works: lowercase it, split on separators (& + / , "and" "with"), then look each word or phrase
// up in a dictionary of gym slang. Words we don't recognise are kept, just neatly capitalised.
(function (root) {
  // phrase -> standard name (multi-word phrases are checked before single words)
  const DICT = {
    // body parts
    "chest": "Chest", "pecs": "Chest", "pec": "Chest", "chesticles": "Chest",
    "back": "Back", "lats": "Back", "lat": "Back",
    "shoulders": "Shoulders", "shoulder": "Shoulders", "delts": "Shoulders", "delt": "Shoulders", "sholders": "Shoulders", "shoulda": "Shoulders", "shldrs": "Shoulders", "sh": "Shoulders",
    "biceps": "Biceps", "bicep": "Biceps", "bis": "Biceps", "bi": "Biceps", "bisep": "Biceps", "biseps": "Biceps", "bicepts": "Biceps",
    "triceps": "Triceps", "tricep": "Triceps", "tris": "Triceps", "tri": "Triceps", "trycep": "Triceps", "triseps": "Triceps",
    "arms": "Arms", "arm": "Arms", "forearms": "Forearms", "forearm": "Forearms",
    "legs": "Legs", "leg": "Legs", "leg day": "Legs", "lower legs": "Calves",
    "quads": "Quads", "quad": "Quads", "quadriceps": "Quads",
    "hamstrings": "Hamstrings", "hamstring": "Hamstrings", "hams": "Hamstrings", "hammies": "Hamstrings", "hammys": "Hamstrings",
    "glutes": "Glutes", "glute": "Glutes", "booty": "Glutes", "bum": "Glutes", "butt": "Glutes",
    "calves": "Calves", "calf": "Calves", "calfs": "Calves",
    "abs": "Abs", "ab": "Abs", "core": "Core", "obliques": "Obliques",
    "traps": "Traps", "trap": "Traps", "neck": "Neck",
    // whole-workout styles
    "push": "Push", "pull": "Pull",
    "upper": "Upper Body", "upper body": "Upper Body", "lower": "Lower Body", "lower body": "Lower Body",
    "full body": "Full Body", "fullbody": "Full Body", "full": "Full Body", "total body": "Full Body", "whole body": "Full Body",
    "cardio": "Cardio", "run": "Cardio", "running": "Cardio", "jog": "Cardio", "treadmill": "Cardio",
    "hiit": "HIIT", "conditioning": "Conditioning", "crossfit": "CrossFit",
    "mobility": "Mobility", "stretch": "Mobility", "stretching": "Mobility", "yoga": "Yoga", "pilates": "Pilates",
    "swim": "Swim", "swimming": "Swim", "cycling": "Cycling", "bike": "Cycling", "spin": "Cycling",
    "boxing": "Boxing", "sport": "Sport", "sports": "Sport", "climbing": "Climbing",
    "strength": "Strength", "powerlifting": "Powerlifting",
  };
  // whole entries that mean "rest day"
  const REST = new Set(["rest", "off", "rest day", "none", "nothing", "-", "x", "recovery", "day off", "break"]);
  // filler words that add nothing ("legs day" -> "Legs", "chest workout" -> "Chest")
  const FILLER = new Set(["day", "workout", "session", "training", "focus", "only", "the", "my", "a", "class", "exercises", "exercise"]);
  const SMALL = new Set(["of", "and", "the", "for"]);

  // Typo tolerance: how many single-letter edits turn a into b (Damerau-Levenshtein distance: insert, delete, change or swap)
  function edits(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++)
      for (let j = 1; j <= b.length; j++)
      {
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        // swapped neighbours ("chets" -> "chest") count as one typo
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    return d[a.length][b.length];
  }
  // Closest known word, if it's close enough: 1 typo for short words, 2 for longer ones. Same first letter required.
  function fuzzy(word) {
    if (word.length < 3) return null;
    const allowed = word.length >= 6 ? 2 : 1;
    let best = null, bestD = allowed + 1;
    for (const k of Object.keys(DICT)) {
      if (k.includes(" ") || k[0] !== word[0] || Math.abs(k.length - word.length) > allowed) continue;
      const dist = edits(word, k);
      if (dist < bestD) { best = DICT[k]; bestD = dist; }
    }
    return best;
  }

  const titleCase = s => s.split(" ").map((w, i) =>
    (i > 0 && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  function normalizeWorkout(input) {
    let s = String(input || "").toLowerCase().trim();
    if (!s) return "";
    s = s.replace(/[’']s\b/g, "s").replace(/[’']/g, "");            // bi's -> bis
    if (REST.has(s.replace(/\s+/g, " "))) return "";
    // separators -> "|"
    s = s.replace(/\s*(?:&|\+|\/|\\|,|;|\||\band\b|\bwith\b|\bn\b|\bplus\b)\s*/g, "|");
    const out = [];
    const push = name => { if (name && !out.includes(name)) out.push(name); };
    for (let seg of s.split("|")) {
      seg = seg.replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
      if (!seg) continue;
      if (DICT[seg]) { push(DICT[seg]); continue; }
      // walk the words: prefer 2-word phrases, then single words; group unknown words into one phrase
      const words = seg.split(" ").filter(w => !FILLER.has(w));
      let unknown = [];
      const flush = () => { if (unknown.length) { push(titleCase(unknown.join(" "))); unknown = []; } };
      for (let i = 0; i < words.length; i++) {
        const two = words[i] + " " + (words[i + 1] || "");
        if (words[i + 1] && DICT[two]) { flush(); push(DICT[two]); i++; continue; }
        if (DICT[words[i]]) { flush(); push(DICT[words[i]]); continue; }
        const near = fuzzy(words[i]);
        if (near) { flush(); push(near); continue; }
        unknown.push(words[i]);
      }
      flush();
    }
    // "Arms" already covers Biceps/Triceps; "Legs" stays alongside Quads etc. (people mean emphasis)
    return out.join(" + ").slice(0, 40);
  }

  // Buttons people can tap to build a day without typing
  const QUICK = ["Push", "Pull", "Legs", "Upper Body", "Lower Body", "Full Body", "Chest", "Back", "Shoulders",
    "Arms", "Biceps", "Triceps", "Abs", "Core", "Glutes", "Hamstrings", "Quads", "Calves", "Cardio", "HIIT", "Mobility"];

  // Ready-made weekly splits, Mon..Sun ("" = rest)
  const PRESETS = {
    "Push Pull Legs": ["Push", "Pull", "Legs", "Push", "Pull", "Legs", ""],
    "Classic pairs": ["Chest + Triceps", "Back + Biceps", "Legs + Shoulders", "Chest + Triceps", "Back + Biceps", "Legs + Shoulders", ""],
    "Upper / Lower": ["Upper Body", "Lower Body", "", "Upper Body", "Lower Body", "", ""],
    "Upper Lower + PPL": ["Upper Body", "Lower Body", "", "Push", "Pull", "Legs", ""],
    "Bro split": ["Chest", "Back", "Shoulders", "Arms", "Legs", "", ""],
    "Arnold split": ["Chest + Back", "Shoulders + Arms", "Legs", "Chest + Back", "Shoulders + Arms", "Legs", ""],
    "Full body ×3": ["Full Body", "", "Full Body", "", "Full Body", "", ""],
    "Glute focus": ["Glutes + Hamstrings", "Upper Body", "Quads + Calves", "", "Glutes", "Upper Body", ""],
    "Strength + cardio": ["Upper Body", "Cardio", "Lower Body", "Cardio", "Full Body", "", ""],
    "4-day split": ["Chest + Triceps", "Back + Biceps", "", "Shoulders + Abs", "Legs", "", ""],
  };

  const api = { normalizeWorkout, QUICK, PRESETS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;   // for tests in Node
  else Object.assign(root, api);                                               // for the app in the browser
})(typeof window !== "undefined" ? window : globalThis);
