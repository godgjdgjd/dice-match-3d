/* Verify every bundled level in www/levels.js is still solvable
   under the current engine rules. Run: node scripts/verify-levels.js */
const path = require("path");
const fs = require("fs");
const E = require(path.join(__dirname, "..", "www", "engine.js"));

const src = fs.readFileSync(path.join(__dirname, "..", "www", "levels.js"), "utf8");
const json = src.slice(src.indexOf("[")), arr = JSON.parse(json.slice(0, json.lastIndexOf("]") + 1));

const bad = [];
arr.forEach((lv, i) => {
  const L = i + 1;
  const startClears = E.findClears(E.stateFromLevel(lv)).length > 0;
  const sol = E.solve(E.stateFromLevel(lv), { maxNodes: 800000, maxDepth: (lv.par || 22) + 8 });
  if (startClears || !sol) bad.push({ L, startClears, solvable: !!sol, par: lv.par });
});

console.log("total levels:", arr.length);
console.log("problem levels:", bad.length);
console.log(JSON.stringify(bad));
process.exit(bad.length ? 2 : 0);
