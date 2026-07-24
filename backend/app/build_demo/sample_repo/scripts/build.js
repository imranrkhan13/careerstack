// Build step: render the landing page to dist/index.html. Fails if the output is empty.
import { mkdirSync, writeFileSync } from "node:fs";
import { renderPage } from "../src/app/page.js";

const html = renderPage();
if (!html || html.length < 50) {
  console.error("build: rendered output is empty or too small");
  process.exit(1);
}

mkdirSync("dist", { recursive: true });
writeFileSync("dist/index.html", html, "utf8");
console.log(`build: wrote dist/index.html (${html.length} bytes)`);
