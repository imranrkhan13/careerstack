// Dependency-free "typecheck": syntax-checks every source module with `node --check`,
// which catches parse errors without executing the code. Exits non-zero on any error.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const ROOTS = ["src", "app", "auth", "db", "scripts", "test"];
const files = [];

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".js")) files.push(full);
  }
}

for (const root of ROOTS) walk(root);

let failed = 0;
for (const file of files) {
  try {
    execFileSync(process.execPath, ["--check", file], { stdio: "pipe" });
  } catch (err) {
    failed += 1;
    console.error(`typecheck: syntax error in ${file}`);
    console.error(String(err.stderr || err.message));
  }
}

if (failed > 0) {
  console.error(`typecheck: ${failed} file(s) failed`);
  process.exit(1);
}
console.log(`typecheck: ${files.length} file(s) OK`);
