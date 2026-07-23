import { tokens } from "../../lib/tokens.js";

// Reusable call-to-action button. Returns an HTML string.
export function Button(label, href = "#") {
  const style = [
    `background:${tokens.colors.accent}`,
    `color:${tokens.colors.accentText}`,
    `border-radius:${tokens.radius}`,
    "display:inline-block",
    "padding:12px 20px",
    "font-weight:600",
    "text-decoration:none",
  ].join(";");
  return `<a class="btn" href="${href}" style="${style}">${label}</a>`;
}
