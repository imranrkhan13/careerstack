// Dependency-free linter: flags console.log, trailing whitespace, and tab indentation
// across the source tree. Exits non-zero if any violation is found.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src", "app", "auth", "db"];
const problems = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full);
    } else if (full.endsWith(".js")) {
      lintFile(full);
    }
  }
}

function lintFile(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    const n = i + 1;
    if (/console\.log\(/.test(line)) problems.push(`${file}:${n} unexpected console.log`);
    if (/[ \t]+$/.test(line)) problems.push(`${file}:${n} trailing whitespace`);
    if (/^\t/.test(line)) problems.push(`${file}:${n} tab indentation (use spaces)`);
  });
}

for (const root of ROOTS) walk(root);

if (problems.length > 0) {
  console.error(`lint: ${problems.length} problem(s)`);
  for (const p of problems) console.error("  " + p);
  process.exit(1);
}
console.log("lint: clean");
