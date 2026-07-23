import { tokens } from "../../lib/tokens.js";

const FEATURES = [
  { title: "Career Graph", body: "Every skill, role, and project as connected data." },
  { title: "Safe changes", body: "Scoped, reviewed edits — never an unrestricted rewrite." },
  { title: "Real evidence", body: "Tests, typecheck, lint, and build results on every change." },
];

// Feature grid section.
export function Features() {
  const wrap = `max-width:${tokens.maxWidth};margin:0 auto;padding:24px;display:grid;grid-template-columns:repeat(3,1fr);gap:16px`;
  const cards = FEATURES.map(
    (f) => `
      <div class="feature" style="background:${tokens.colors.surface};border-radius:${tokens.radius};padding:24px">
        <h3 style="margin:0 0 8px;font-size:18px">${f.title}</h3>
        <p style="margin:0;color:${tokens.colors.muted}">${f.body}</p>
      </div>`
  ).join("");
  return `<section class="features" style="${wrap}">${cards}</section>`;
}
