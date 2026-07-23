import { Hero } from "../components/landing/Hero.js";
import { Features } from "../components/landing/Features.js";
import { CTA } from "../components/landing/CTA.js";
import { tokens } from "../lib/tokens.js";

// Landing route. Composes the full marketing page as an HTML document string.
export function renderPage() {
  const bodyStyle = `background:${tokens.colors.bg};color:${tokens.colors.text};font-family:${tokens.font};margin:0`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>CareerOS — The operating system for your career</title>
</head>
<body style="${bodyStyle}">
  ${Hero()}
  ${Features()}
  ${CTA()}
</body>
</html>`;
}
